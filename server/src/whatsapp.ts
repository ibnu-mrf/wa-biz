import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { generateWhatsAppAiReply, getActiveProfile } from './ai';
import {
  persistInboundWhatsAppMessage,
  persistOutboundWhatsAppMessage,
  isWorkerSupabaseConfigured,
} from './supabase';
import { detectRegistrationIntent, executeRegistrationHandoff } from './handoff';
import { campaignScheduler } from './campaigns';
import { maskPhone } from './security';

export function extractMessageText(message: any): string {
  if (!message) return '';

  // Handle ephemeral wrappers
  if (message.ephemeralMessage?.message) {
    return extractMessageText(message.ephemeralMessage.message);
  }

  // Handle view once wrappers
  if (message.viewOnceMessage?.message) {
    return extractMessageText(message.viewOnceMessage.message);
  }
  if (message.viewOnceMessageV2?.message) {
    return extractMessageText(message.viewOnceMessageV2.message);
  }

  // Standard Baileys text types
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  if (message.buttonsResponseMessage?.selectedDisplayText) return message.buttonsResponseMessage.selectedDisplayText;
  if (message.templateButtonReplyMessage?.selectedDisplayText) return message.templateButtonReplyMessage.selectedDisplayText;

  return '';
}

export type ConnectionStatus =
  | 'disconnected'
  | 'initiating'
  | 'qr_ready'
  | 'qr_expired'
  | 'connecting'
  | 'connected'
  | 'logged_out'
  | 'error';

export interface WhatsAppServiceState {
  status: ConnectionStatus;
  phoneNumber: string | null;
  whatsappName: string | null;
  lastQrAvailable: boolean;
  qrGeneratedAt: Date | null;
  qrCount: number;
  reconnectAttempts: number;
  lastError: string | null;
}

export class WhatsAppService {
  private socket: WASocket | null = null;
  private state: WhatsAppServiceState = {
    status: 'disconnected',
    phoneNumber: null,
    whatsappName: null,
    lastQrAvailable: false,
    qrGeneratedAt: null,
    qrCount: 0,
    reconnectAttempts: 0,
    lastError: null,
  };

  private currentQrRaw: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isExplicitlyClosed = false;
  private processedMessageIds = new Set<string>();
  private processedIdsFile = path.join(config.sessionDir, 'processed_message_ids.json');
  private socketConnectedAt = 0;

  constructor() {
    // Pastikan direktori sesi ada
    if (!fs.existsSync(config.sessionDir)) {
      fs.mkdirSync(config.sessionDir, { recursive: true });
    }
    this.loadProcessedMessageIds();
  }

  /**
   * Muat riwayat ID pesan yang telah diproses dari disk agar tahan terhadap restart worker
   */
  private loadProcessedMessageIds(): void {
    try {
      if (fs.existsSync(this.processedIdsFile)) {
        const raw = fs.readFileSync(this.processedIdsFile, 'utf8');
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const id of arr) {
            if (typeof id === 'string') {
              this.processedMessageIds.add(id);
            }
          }
          console.log(`[WhatsApp Dedup] Memuat ${this.processedMessageIds.size} ID pesan sebelumnya dari disk.`);
        }
      }
    } catch (err: any) {
      console.warn('[WhatsApp Dedup] Gagal membaca riwayat processed_message_ids:', err?.message || err);
    }
  }

  /**
   * Simpan ringkasan ID pesan terakhir ke disk
   */
  private saveProcessedMessageIds(): void {
    try {
      const arr = Array.from(this.processedMessageIds).slice(-1000);
      fs.writeFileSync(this.processedIdsFile, JSON.stringify(arr), 'utf8');
    } catch {
      // Abaikan kegagalan tulis berkas
    }
  }

  /**
   * Tandai ID pesan sebagai telah diproses
   */
  private markMessageProcessed(messageId: string): void {
    this.processedMessageIds.add(messageId);
    if (this.processedMessageIds.size > 1500) {
      const firstKey = this.processedMessageIds.values().next().value;
      if (firstKey) this.processedMessageIds.delete(firstKey);
    }
    this.saveProcessedMessageIds();
  }

  public getState(): WhatsAppServiceState {
    return { ...this.state };
  }

  public getRawQr(): {
    qr: string | null;
    generatedAt: Date | null;
    count: number;
    isFresh: boolean;
    ageSeconds: number;
  } {
    const now = Date.now();
    const generatedTime = this.state.qrGeneratedAt?.getTime() || 0;
    const ageSeconds = generatedTime ? Math.round((now - generatedTime) / 1000) : 999;
    // QR WhatsApp Web biasanya berlaku 30-40 detik sebelum server merotasi ref
    const isFresh = this.currentQrRaw !== null && ageSeconds < 40 && this.state.status === 'qr_ready';

    return {
      qr: this.currentQrRaw,
      generatedAt: this.state.qrGeneratedAt,
      count: this.state.qrCount,
      isFresh,
      ageSeconds,
    };
  }

  /**
   * Membersihkan listener dan koneksi socket sebelumnya agar tidak terjadi socket zombie
   */
  private cleanupSocket(): void {
    if (this.socket) {
      try {
        this.socket.ev.removeAllListeners('connection.update');
        this.socket.ev.removeAllListeners('creds.update');
        this.socket.ev.removeAllListeners('messages.upsert');
        this.socket.end(undefined);
      } catch {
        // Abaikan error saat cleanup socket yang sudah mati
      }
      this.socket = null;
    }
  }

  public async start(isManualReset = false): Promise<void> {
    if (this.socket && this.state.status === 'connected') {
      console.log('[WhatsApp Diagnostic] Sesi sudah aktif dan terhubung.');
      return;
    }

    if (isManualReset) {
      console.log('[WhatsApp Diagnostic] Memulai inisialisasi ulang manual (counter percobaan direset ke 0).');
      this.state.reconnectAttempts = 0;
    }

    this.isExplicitlyClosed = false;
    this.cleanupSocket();
    this.updateStatus('initiating');

    try {
      const { state: authState, saveCreds } = await useMultiFileAuthState(config.sessionDir);
      const { version, isLatest } = await fetchLatestBaileysVersion();
      console.log(`[WhatsApp Diagnostic] Baileys versi: ${version.join('.')} (latest: ${isLatest})`);

      // Logger Baileys internal: level 'warn' agar tidak membocorkan frame Noise/Protobuf/private keys
      const baileysLogger = pino({ level: 'warn' });

      const sock = makeWASocket({
        version,
        logger: baileysLogger,
        auth: authState,
        printQRInTerminal: false,
        browser: ['WABiz Staging', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      this.socket = sock;

      // 1. Event: Kredensial diperbarui
      sock.ev.on('creds.update', saveCreds);

      // 2. Event: Pembaruan koneksi (QR, Connected, Disconnected)
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;

        // A. Deteksi QR Baru diterbitkan
        if (qr) {
          this.currentQrRaw = qr;
          this.state.qrGeneratedAt = new Date();
          this.state.qrCount += 1;
          this.state.lastQrAvailable = true;
          this.updateStatus('qr_ready');

          console.log(`[WhatsApp Diagnostic] QR #${this.state.qrCount} diterbitkan (${this.state.qrGeneratedAt.toLocaleTimeString()}). Menunggu pemindaian ponsel...`);

          if (config.showTerminalQr) {
            console.log('\n======================================================');
            console.log(`[WhatsApp QR] Scan QR #${this.state.qrCount} dari WhatsApp ponsel:`);
            console.log('Buka WhatsApp > Titik Tiga / Pengaturan > Perangkat Tertaut > Tautkan');
            console.log('======================================================\n');
            try {
              const terminalQr = await qrcode.toString(qr, { type: 'terminal', small: true });
              console.log(terminalQr);
            } catch (err) {
              console.error('[WhatsApp QR] Gagal me-render QR terminal:', (err as Error).message);
            }
          }
        }

        // B. Deteksi scan QR / login baru diproses server
        if (isNewLogin) {
          console.log('[WhatsApp Diagnostic] Pemindaian QR terdeteksi oleh server WhatsApp! (isNewLogin: true, sedang melakukan otorisasi perangkat)...');
        }

        // C. Status Connecting
        if (connection === 'connecting') {
          this.updateStatus('connecting');
          console.log('[WhatsApp Diagnostic] Status socket: connecting (menghubungkan ke server WhatsApp)...');
        }

        // D. Status Open (Terhubung Sukses)
        if (connection === 'open') {
          this.state.reconnectAttempts = 0;
          this.state.qrCount = 0;
          this.currentQrRaw = null;
          this.state.lastQrAvailable = false;
          this.state.lastError = null;
          this.socketConnectedAt = Date.now();

          const userJid = sock.user?.id || '';
          const cleanPhone = userJid.split(':')[0] || userJid.split('@')[0];
          this.state.phoneNumber = cleanPhone ? `+${cleanPhone}` : null;
          this.state.whatsappName = sock.user?.name || null;

          this.updateStatus('connected');
          console.log('======================================================');
          console.log('[WhatsApp Diagnostic] KONEKSI SUKSES!');
          console.log(`Nomor Akun: ${this.state.phoneNumber}`);
          console.log(`Nama Profil: ${this.state.whatsappName || 'Akun Uji Coba'}`);
          console.log('Perangkat Tertaut (Companion Device) Aktif.');
          console.log('======================================================');

          // Bangunkan scheduler antrean kampanye saat koneksi WhatsApp siap
          campaignScheduler.triggerNow();
        }

        // E. Status Close (Koneksi Terputus)
        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const errorMessage = lastDisconnect?.error?.message || 'Koneksi terputus';
          console.log(`[WhatsApp Diagnostic] Koneksi ditutup (StatusCode: ${statusCode || 'N/A'}, Alasan: ${errorMessage})`);

          this.currentQrRaw = null;
          this.state.lastQrAvailable = false;
          this.state.lastError = errorMessage;

          if (this.isExplicitlyClosed) {
            console.log('[WhatsApp Diagnostic] Sesi ditutup secara manual oleh perintah pengguna.');
            this.updateStatus('disconnected');
            return;
          }

          // KASUS 1: Kode 515 (restartRequired)
          // Ini adalah langkah normal protokol Multi-Device tepat setelah QR dipindai dan diverifikasi server!
          if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
            console.log('[WhatsApp Diagnostic] RestartRequired (515): Bagian normal dari handshaking awal Multi-Device setelah scan. Memulai ulang socket seketika...');
            this.cleanupSocket();
            setTimeout(() => this.start(false), 500);
            return;
          }

          // KASUS 2: Kode 401 (loggedOut)
          // Perangkat dicabut dari ponsel atau pairing ditolak
          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            console.warn('[WhatsApp Diagnostic] LoggedOut (401): Perangkat dicabut atau ditolak dari WhatsApp ponsel.');
            this.updateStatus('logged_out');
            await this.cleanSessionFiles();
            return;
          }

          // KASUS 3: Kode 408 (timedOut / QR refs attempts ended)
          // QR tidak dipindai hingga masa berlaku referensi habis
          if (statusCode === DisconnectReason.timedOut || statusCode === 408) {
            console.log('[WhatsApp Diagnostic] TimedOut (408): Referensi QR habis masa berlakunya tanpa ada pemindaian.');
            this.updateStatus('qr_expired');

            // Auto-renew QR jika belum melebihi kuota retry
            if (this.state.reconnectAttempts < config.maxReconnectRetries) {
              this.state.reconnectAttempts += 1;
              console.log(`[WhatsApp Diagnostic] Memperbarui siklus QR baru (${this.state.reconnectAttempts}/${config.maxReconnectRetries})...`);
              this.cleanupSocket();
              setTimeout(() => this.start(false), 1500);
            } else {
              console.log('[WhatsApp Diagnostic] Siklus QR otomatis selesai. Menunggu tombol Segarkan/Hubungkan Ulang dari UI...');
            }
            return;
          }

          // KASUS 4: Kegagalan jaringan sementara lainnya
          this.handleAutoReconnect(statusCode);
        }
      });

      // 3. Event: Pesan Masuk (Inbound Message Event)
      sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          // A. Abaikan pesan dari diri sendiri (loop protection)
          if (msg.key.fromMe) continue;

          const remoteJid = msg.key.remoteJid || '';
          if (!remoteJid) continue;

          // B. Abaikan status WhatsApp broadcast, grup WhatsApp, dan saluran/newsletter
          if (
            remoteJid.includes('status@broadcast') ||
            remoteJid.endsWith('@g.us') ||
            remoteJid.includes('@newsletter')
          ) {
            continue;
          }

          const messageId = msg.key.id;
          if (!messageId) continue;

          // C. Cegah pemrosesan duplikat pesan (deduplication tahan restart worker)
          if (this.processedMessageIds.has(messageId)) {
            console.log(`[Diagnostic] Mengabaikan event duplikat untuk pesan ID: ${messageId}`);
            continue;
          }
          this.markMessageProcessed(messageId);

          // D. Ekstrak nomor pengirim dan nama profil
          const senderPhone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
          const senderName = msg.pushName || 'Pelanggan';

          // E. Cegah loop jika nomor pengirim sama dengan nomor bot sendiri
          const botPhone = (this.state.phoneNumber || '').replace(/\D/g, '');
          if (botPhone && senderPhone === botPhone) {
            continue;
          }

          // F. Cek usia pesan (abaikan riwayat pesan offline lama > 2 menit)
          const msgTimestamp = Number(msg.messageTimestamp) * 1000;
          if (msgTimestamp && Date.now() - msgTimestamp > 120000) {
            console.log(`[Diagnostic] Mengabaikan pesan offline lawas dari +${maskPhone(senderPhone)} (Timestamp: ${new Date(msgTimestamp).toLocaleTimeString()}).`);
            continue;
          }

          // G. Ekstrak isi teks pesan secara menyeluruh (termasuk ephemeral, quoted, dll)
          const textBody = extractMessageText(msg.message).trim();

          if (!textBody) {
            continue;
          }

          // TAHAP 1: PESAN DITERIMA
          console.log('\n======================================================');
          console.log(`[Diagnostic Stage 1: Pesan Diterima] ID: ${messageId}`);
          console.log(`Pengirim: +${maskPhone(senderPhone)} (${senderName})`);
          console.log(`Cuplikan Teks: "${textBody.length > 60 ? textBody.slice(0, 60) + '...' : textBody}"`);
          console.log(`Panjang Teks: ${textBody.length} karakter`);
          console.log(`Waktu: ${new Date().toLocaleTimeString()}`);

          // PERSISTENSI SUPABASE: Simpan kontak, percakapan, dan pesan masuk pelanggan
          const targetOrgId = process.env.WORKER_ORG_ID?.trim() || getActiveProfile().orgId || '';
          let inboundResult: { contactId: string; conversationId: string; messageId: string } | null = null;

          if (targetOrgId && isWorkerSupabaseConfigured()) {
            try {
              inboundResult = await persistInboundWhatsAppMessage({
                orgId: targetOrgId,
                senderPhone,
                senderName,
                textBody,
                messageTimestamp: msgTimestamp,
                messageId,
              });

              if (inboundResult) {
                console.log(
                  `[Diagnostic Database: Inbound Disimpan] Kontak ID: ${inboundResult.contactId} | Percakapan ID: ${inboundResult.conversationId} | Pesan ID: ${inboundResult.messageId}`
                );
              } else {
                console.warn(`[Diagnostic Database: Inbound Gagal] Gagal mencatat pesan masuk ke Supabase.`);
              }
            } catch (dbInboundErr: any) {
              console.error(`[Diagnostic Database: Error Inbound] Exception:`, dbInboundErr?.message || dbInboundErr);
            }
          } else {
            console.log('[Diagnostic Database: Dilewati] Supabase belum dikonfigurasi atau WORKER_ORG_ID belum diset.');
          }

          // TAHAP 2: DETEKSI INTENT PENDAFTARAN & GENERASI BALASAN
          console.log(`[Diagnostic Stage 2: Evaluasi Intent & AI] Memproses pesan via WABiz Engine...`);

          // Tampilkan indikator mengetik (composing) di WhatsApp pengirim
          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
          } catch {
            // Abaikan jika presence update gagal
          }

          let aiResult: { text: string; source: string; isEscalated?: boolean } | null = null;

          // A. Deteksi niat pendaftaran berbasis AI & konteks percakapan
          const regIntent = detectRegistrationIntent(textBody);
          console.log(`[Diagnostic Stage 2: Intent Pendaftaran] Intent: ${regIntent.intent} (Confidence: ${regIntent.confidence})`);

          // B. Jika Niat Kuat Pendaftaran terdeteksi dan percakapan terhubung ke Supabase
          if (regIntent.intent === 'registration_intent' && targetOrgId && inboundResult && inboundResult.conversationId) {
            console.log(`[Diagnostic Stage 2: CS Handoff] Niat pendaftaran kuat terdeteksi. Menjalankan alur handoff CS Pendaftaran...`);
            try {
              const handoffRes = await executeRegistrationHandoff({
                orgId: targetOrgId,
                conversationId: inboundResult.conversationId,
                customerPhone: senderPhone,
                customerName: senderName,
                promptText: textBody,
                profile: getActiveProfile(),
                sendWhatsAppMessageFn: async (toPhone: string, text: string) => {
                  return this.sendMessage(toPhone, text);
                },
              });

              aiResult = {
                text: handoffRes.replyText,
                source: handoffRes.success ? 'registration_handoff_cs' : 'registration_handoff_fallback',
                isEscalated: true,
              };
            } catch (handoffErr: any) {
              console.error('[Diagnostic Stage 2: Error Handoff] Exception saat handoff pendaftaran:', handoffErr?.message || handoffErr);
            }
          }

          // C. Jika belum ditangani oleh alur handoff pendaftaran, proses melalui mesin percakapan AI
          if (!aiResult) {
            try {
              aiResult = await generateWhatsAppAiReply(textBody, senderPhone);
            } catch (aiErr: any) {
              console.error(`[Diagnostic Stage 2: Error AI] Exception saat memproses balasan:`, aiErr?.message || aiErr);
            }
          }

          if (!aiResult || !aiResult.text) {
            console.log('[Diagnostic Stage 2: Dilewati] Bot dinonaktifkan atau teks balasan kosong.');
            try {
              await sock.sendPresenceUpdate('paused', remoteJid);
            } catch {}
            continue;
          }

          // TAHAP 3: JAWABAN BERHASIL DIBUAT
          console.log(`[Diagnostic Stage 3: Jawaban Dibuat] Sumber: ${aiResult.source}`);
          console.log(`Panjang Balasan: ${aiResult.text.length} karakter`);
          console.log(`Eskalasi CS: ${aiResult.isEscalated ? 'Ya (Kontak CS Disediakan)' : 'Tidak'}`);

          // TAHAP 4: PENGIRIMAN DIMULAI
          console.log(`[Diagnostic Stage 4: Pengiriman Dimulai] Mengirim balasan ke +${senderPhone}...`);

          // Jeda alami pengetikan (600ms)
          await new Promise((r) => setTimeout(r, 600));

          try {
            await sock.sendPresenceUpdate('paused', remoteJid);
          } catch {}

          // TAHAP 5: PENGIRIMAN BERHASIL / GAGAL
          try {
            const sent = await sock.sendMessage(remoteJid, { text: aiResult.text });
            const outMessageId = sent?.key?.id;
            console.log(`[Diagnostic Stage 5: Pengiriman Sukses] Balasan terkirim ke +${senderPhone}! (Out Message ID: ${outMessageId || 'N/A'})`);

            // PERSISTENSI SUPABASE: Simpan balasan AI keluar ke thread percakapan yang sama
            if (targetOrgId && inboundResult && inboundResult.conversationId && isWorkerSupabaseConfigured()) {
              try {
                const outboundResult = await persistOutboundWhatsAppMessage(
                  targetOrgId,
                  inboundResult.conversationId,
                  aiResult.text,
                  'bot'
                );
                if (outboundResult) {
                  console.log(`[Diagnostic Database: Outbound Disimpan] Balasan AI berhasil dicatat di Supabase! (Pesan ID: ${outboundResult.messageId})`);
                }
              } catch (dbOutboundErr: any) {
                console.error(`[Diagnostic Database: Error Outbound] Gagal mencatat balasan AI:`, dbOutboundErr?.message || dbOutboundErr);
              }
            }

            console.log('======================================================\n');
          } catch (sendErr: any) {
            console.error(`[Diagnostic Stage 5: Pengiriman Gagal] Gagal mengirim balasan ke +${senderPhone}:`, sendErr?.message || sendErr);
            console.log('======================================================\n');
          }
        }
      });

      // 4. Event: Pembaruan Status Pesan / Tanda Terima Pengiriman (Delivery Receipt)
      sock.ev.on('messages.update', async (updates) => {
        for (const u of updates) {
          const msgId = u.key?.id;
          const status = u.update?.status;
          if (msgId && status !== undefined && status !== null) {
            // Nilai status Baileys: 3 = DELIVERY_ACK (sampai di perangkat penerima), 4 = READ (dibaca)
            if (status === 3 || status === 4 || String(status) === 'DELIVERY_ACK' || String(status) === 'READ') {
              campaignScheduler.handleBaileysReceipt(msgId, 'delivered').catch(() => {});
            }
          }
        }
      });
    } catch (err) {
      console.error('[WhatsApp Diagnostic] Gagal menginisialisasi sesi Baileys:', (err as Error).message);
      this.state.lastError = (err as Error).message;
      this.updateStatus('error');
      this.handleAutoReconnect();
    }
  }

  private handleAutoReconnect(statusCode?: number): void {
    if (this.isExplicitlyClosed) return;

    if (this.state.reconnectAttempts >= config.maxReconnectRetries) {
      console.error(`[WhatsApp Diagnostic] Batas rekoneksi tercapai (${config.maxReconnectRetries}x). Berhenti mencoba otomatis.`);
      this.updateStatus('error');
      return;
    }

    this.state.reconnectAttempts += 1;
    const delay = Math.min(
      config.initialReconnectDelayMs * Math.pow(1.5, this.state.reconnectAttempts - 1),
      config.maxReconnectDelayMs
    );

    console.log(`[WhatsApp Diagnostic] Menjadwalkan rekoneksi ke-${this.state.reconnectAttempts}/${config.maxReconnectRetries} dalam ${(delay / 1000).toFixed(1)} detik (Status: ${statusCode || 'unknown'})...`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.cleanupSocket();
      this.start(false);
    }, delay);
  }

  public async sendMessage(toPhone: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.socket || this.state.status !== 'connected') {
      return {
        success: false,
        error: `WhatsApp tidak terhubung (status saat ini: ${this.state.status}). Pastikan nomor uji coba sudah di-scan via QR.`,
      };
    }

    if (!toPhone || !text.trim()) {
      return { success: false, error: 'Nomor tujuan dan teks pesan wajib diisi.' };
    }

    let cleanNumber = toPhone.replace(/\D/g, '');
    if (cleanNumber.startsWith('0')) {
      cleanNumber = '62' + cleanNumber.slice(1);
    }
    const targetJid = `${cleanNumber}@s.whatsapp.net`;

    try {
      console.log(`[WhatsApp Send] Mengirim pesan uji coba ke +${maskPhone(cleanNumber)}...`);
      const sent = await this.socket.sendMessage(targetJid, { text });
      const messageId = sent?.key.id || undefined;
      console.log(`[WhatsApp Send] Pesan berhasil terkirim! (Message ID: ${messageId})`);
      return { success: true, messageId };
    } catch (err) {
      console.error('[WhatsApp Send] Gagal mengirim pesan:', (err as Error).message);
      return { success: false, error: (err as Error).message };
    }
  }

  public async disconnect(deleteSession = false): Promise<void> {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      // Hanya panggil logout() ke server jika sesi sedang terhubung dan ingin dicabut permanen
      if (deleteSession && this.state.status === 'connected') {
        try {
          await this.socket.logout();
        } catch {
          // ignore
        }
      }
      this.cleanupSocket();
    }

    if (deleteSession) {
      await this.cleanSessionFiles();
    }

    this.state.phoneNumber = null;
    this.state.whatsappName = null;
    this.state.lastQrAvailable = false;
    this.state.qrCount = 0;
    this.state.reconnectAttempts = 0;
    this.currentQrRaw = null;
    this.updateStatus('disconnected');
    console.log('[WhatsApp Diagnostic] Sesi berhasil diputuskan.');
  }

  private async cleanSessionFiles(): Promise<void> {
    try {
      if (fs.existsSync(config.sessionDir)) {
        const files = fs.readdirSync(config.sessionDir);
        for (const file of files) {
          fs.unlinkSync(path.join(config.sessionDir, file));
        }
        console.log(`[WhatsApp Diagnostic] File sesi di ${config.sessionDir} berhasil dibersihkan.`);
      }
    } catch (err) {
      console.error('[WhatsApp Diagnostic] Gagal membersihkan folder sesi:', (err as Error).message);
    }
  }

  private updateStatus(newStatus: ConnectionStatus): void {
    this.state.status = newStatus;
  }
}

export const whatsappService = new WhatsAppService();
