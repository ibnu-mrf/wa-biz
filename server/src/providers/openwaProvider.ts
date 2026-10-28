// ==========================================
// OpenWA Provider Adapter for WABiz
// ==========================================

import {
  IWhatsAppProvider,
  ProviderType,
  SendMessageOptions,
  SendTemplateOptions,
  SendMessageResult,
  ProviderConnectionStatus,
  ProviderReadinessResult,
  DeliveryStatus,
} from './types';
import { config } from '../config';

export interface OpenWAProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  sessionId?: string;
  timeoutMs?: number;
}

/**
 * Normalisasi nomor telepon atau JID penerima ke format chatId OpenWA.
 * 
 * Aturan:
 * 1. JID grup (@g.us) dan newsletter (@newsletter) dipertahankan bila formatnya valid.
 * 2. JID Linked Identity (@lid) dipertahankan sebagai LID valid tanpa berasumsi dapat dikonversi menjadi nomor telepon.
 * 3. JID WhatsApp individu (@c.us atau @s.whatsapp.net) dinormalisasi menjadi digit@c.us.
 * 4. Nomor telepon biasa (08xxx, +62xxx, 62xxx) dikonversi ke format 62xxx@c.us dengan validasi E.164 (8-15 digit).
 */
export function normalizeChatId(inputPhoneOrJid: string): { chatId?: string; error?: string } {
  if (!inputPhoneOrJid || typeof inputPhoneOrJid !== 'string') {
    return { error: 'Nomor telepon atau JID penerima wajib diisi.' };
  }

  const trimmed = inputPhoneOrJid.trim();
  if (!trimmed) {
    return { error: 'Nomor telepon atau JID penerima tidak boleh kosong.' };
  }

  // 1. Grup atau Newsletter WhatsApp
  if (trimmed.endsWith('@g.us') || trimmed.endsWith('@newsletter')) {
    if (!/^[^\s@]+@[^\s@]+$/.test(trimmed)) {
      return { error: `Format JID grup/newsletter tidak valid: "${trimmed}"` };
    }
    return { chatId: trimmed };
  }

  // 2. WhatsApp LID (Linked Identity JID)
  // JID @lid adalah pengenal akun internal WhatsApp dan BUKAN nomor telepon E.164.
  if (trimmed.endsWith('@lid')) {
    if (!/^\d+@lid$/.test(trimmed)) {
      return { error: `Format JID @lid tidak valid: "${trimmed}". JID @lid tidak dapat dikonversi menjadi nomor telepon.` };
    }
    return { chatId: trimmed };
  }

  // 3. User JID dengan domain WhatsApp (@c.us atau Baileys @s.whatsapp.net)
  if (trimmed.includes('@')) {
    const parts = trimmed.split('@');
    if (parts.length === 2) {
      const [user, domain] = parts;
      if (domain === 'c.us' || domain === 's.whatsapp.net') {
        const cleanDigits = user.replace(/\D/g, '');
        if (cleanDigits.length < 8 || cleanDigits.length > 15) {
          return { error: `Nomor pada JID @${domain} tidak valid (panjang digit: ${cleanDigits.length}): "${trimmed}"` };
        }
        return { chatId: `${cleanDigits}@c.us` };
      }
    }
    return { error: `Domain JID WhatsApp tidak didukung untuk pengiriman: "${trimmed}"` };
  }

  // 4. Nomor telepon biasa
  let cleanDigits = trimmed.replace(/\D/g, '');
  if (!cleanDigits) {
    return { error: `Nomor telepon tidak berisi angka yang valid: "${trimmed}"` };
  }

  // Format lokal Indonesia: 08xxx -> 628xxx
  if (cleanDigits.startsWith('0')) {
    cleanDigits = '62' + cleanDigits.slice(1);
  }

  // Standar panjang nomor E.164 (8 - 15 digit)
  if (cleanDigits.length < 8 || cleanDigits.length > 15) {
    return { error: `Panjang nomor telepon tidak sesuai standar E.164 (harus 8-15 digit, aktual: ${cleanDigits.length}): "${trimmed}"` };
  }

  return { chatId: `${cleanDigits}@c.us` };
}

export class OpenWAProvider implements IWhatsAppProvider {
  public readonly providerType: ProviderType = 'openwa';
  private baseUrl: string;
  private apiKey: string;
  private sessionId: string;
  private timeoutMs: number;

  constructor(options?: OpenWAProviderOptions) {
    this.baseUrl = (options?.baseUrl || config.openwaBaseUrl || 'http://127.0.0.1:2785').replace(/\/+$/, '');
    this.apiKey = options?.apiKey ?? config.openwaApiKey ?? '';
    this.sessionId = options?.sessionId ?? config.openwaSessionId ?? '';
    this.timeoutMs = options?.timeoutMs ?? config.openwaRequestTimeoutMs ?? 10000;
  }

  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  public setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  public setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  public setTimeoutMs(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Mengirim pesan teks reguler melalui OpenWA REST API
   */
  public async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    const { recipientPhone, text, replyToMessageId, organizationId } = options;
    const timestamp = new Date().toISOString();

    // 1. Validasi chatId
    const { chatId, error: phoneErr } = normalizeChatId(recipientPhone);
    if (phoneErr || !chatId) {
      return {
        success: false,
        provider: 'openwa',
        errorCode: 'INVALID_RECIPIENT_PHONE',
        error: phoneErr || 'Nomor penerima tidak valid.',
        timestamp,
      };
    }

    // 2. Validasi teks pesan
    if (!text || !text.trim()) {
      return {
        success: false,
        provider: 'openwa',
        errorCode: 'EMPTY_TEXT',
        error: 'Teks pesan wajib diisi.',
        timestamp,
      };
    }

    // 3. Resolusi Session ID
    const activeSessionId = this.resolveSessionId(organizationId);
    if (!activeSessionId) {
      return {
        success: false,
        provider: 'openwa',
        errorCode: 'SESSION_ID_MISSING',
        error: 'Session ID OpenWA belum dikonfigurasi.',
        timestamp,
      };
    }

    // 4. Bangun payload request OpenWA send-text
    const url = `${this.baseUrl}/api/sessions/${encodeURIComponent(activeSessionId)}/messages/send-text`;
    const payload: Record<string, unknown> = {
      chatId,
      text: text.trim(),
    };

    if (replyToMessageId) {
      payload.quotedMessageId = replyToMessageId;
    }

    // 5. Eksekusi request HTTP dengan timeout dan error handling aman
    const result = await this.executeRequest(url, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!result.ok) {
      return {
        success: false,
        provider: 'openwa',
        errorCode: result.errorCode || result.status,
        error: result.error,
        timestamp,
      };
    }

    const providerMessageId = result.data?.id || result.data?.waMessageId;

    return {
      success: true,
      provider: 'openwa',
      providerMessageId,
      timestamp,
    };
  }

  /**
   * Mengirim pesan template melalui OpenWA.
   * Catatan: OpenWA terhubung ke WhatsApp Web/Baileys dan tidak mendukung Meta Cloud API HSM templates resmi.
   * Kontrak:
   * - Jika metadata.strictTemplate bernilai true: mengembalikan error jujur bahwa template Meta HSM tidak didukung.
   * - Menolak klaim sukses palsu jika tidak ada teks template yang dapat dirender.
   * - Mengekstrak parameter teks dari komponen template dan mengirimnya via sendMessage().
   */
  public async sendTemplateMessage(options: SendTemplateOptions): Promise<SendMessageResult> {
    const { organizationId, recipientPhone, templateName, components, metadata } = options;
    const timestamp = new Date().toISOString();

    // Jika pemanggil secara eksplisit mewajibkan template Meta resmi
    if (metadata?.strictTemplate === true) {
      return {
        success: false,
        provider: 'openwa',
        errorCode: 'TEMPLATE_NOT_SUPPORTED',
        error: `OpenWA tidak mendukung Meta Cloud API HSM template resmi ("${templateName}"). Gunakan provider Meta Cloud API atau gunakan text fallback.`,
        timestamp,
      };
    }

    // Ekstraksi parameter teks dari komponen template
    let formattedText = `[Template: ${templateName}]\n`;
    let hasTextContent = false;

    if (components && components.length > 0) {
      for (const comp of components) {
        if (comp.parameters && comp.parameters.length > 0) {
          const paramTexts = comp.parameters
            .filter((p) => typeof p.text === 'string' && p.text.trim().length > 0)
            .map((p) => p.text!.trim())
            .join(' ');
          if (paramTexts) {
            formattedText += `${paramTexts}\n`;
            hasTextContent = true;
          }
        }
      }
    }

    formattedText = formattedText.trim();

    // Jika template kosong tanpa parameter dan hanya berisi nama header template,
    // jangan berpura-pura berhasil atau mengirim pesan kosong tak bermakna jika text fallback dilarang
    if (!hasTextContent && metadata?.allowEmptyTemplateFallback !== true) {
      return {
        success: false,
        provider: 'openwa',
        errorCode: 'TEMPLATE_TEXT_EMPTY',
        error: `Tidak ada parameter teks yang dapat diekstrak dari template "${templateName}" untuk dikirim melalui OpenWA.`,
        timestamp,
      };
    }

    // Kirim teks yang sudah dirender melalui sendMessage aktual
    return this.sendMessage({
      organizationId,
      recipientPhone,
      text: formattedText,
      metadata: options.metadata,
    });
  }

  /**
   * Mengambil status konektivitas sesi dari OpenWA API (GET /api/sessions/:sessionId)
   */
  public async getConnectionStatus(organizationId?: string): Promise<ProviderConnectionStatus> {
    const activeSessionId = this.resolveSessionId(organizationId);
    if (!activeSessionId) {
      return {
        provider: 'openwa',
        isConnected: false,
        qualityRating: 'UNKNOWN',
        details: {
          error: 'Session ID OpenWA belum dikonfigurasi.',
        },
      };
    }

    const url = `${this.baseUrl}/api/sessions/${encodeURIComponent(activeSessionId)}`;
    const result = await this.executeRequest(url, { method: 'GET' });

    if (!result.ok) {
      return {
        provider: 'openwa',
        isConnected: false,
        qualityRating: 'UNKNOWN',
        details: {
          statusCode: result.status,
          error: result.error,
        },
      };
    }

    const session = result.data || {};
    const statusStr = String(session.status || '').toLowerCase().trim();
    const isConnected = statusStr === 'ready';

    return {
      provider: 'openwa',
      isConnected,
      phone: session.phone || undefined,
      qualityRating: isConnected ? 'GREEN' : 'UNKNOWN',
      messagingTier: 'UNLIMITED_GATEWAY',
      details: {
        sessionId: session.id || activeSessionId,
        status: session.status,
        name: session.name,
        engine: session.engine,
        lastError: session.lastError || null,
        restriction: session.restriction || null,
        connectedAt: session.connectedAt || null,
      },
    };
  }

  /**
   * Mengambil status kesiapan OpenWA untuk pengiriman kampanye.
   * OpenWA dinonaktifkan sementara untuk pengiriman kampanye (fail-closed).
   */
  public async getReadiness(_organizationId: string): Promise<ProviderReadinessResult> {
    return {
      isReady: false,
      code: 'unsupported',
      label: 'Provider tidak didukung atau dinonaktifkan',
      message: 'Provider OpenWA saat ini dinonaktifkan untuk pengiriman kampanye (hanya Baileys dan Meta Cloud API yang didukung).',
      provider: 'openwa',
      providerDisplayName: 'OpenWA Gateway',
      details: { disabled: true },
    };
  }

  /**
   * Menormalisasi kode status pengiriman OpenWA ke standar WABiz DeliveryStatus
   */
  public normalizeDeliveryStatus(rawStatus: string): DeliveryStatus {
    const status = String(rawStatus || '').toLowerCase().trim();
    switch (status) {
      case '0':
      case 'pending':
      case 'queued':
        return 'queued';
      case '1':
      case 'server_ack':
      case 'sent':
        return 'sent';
      case '2':
      case 'delivery_ack':
      case 'delivered':
        return 'delivered';
      case '3':
      case '4':
      case 'read':
      case 'played':
        return 'read';
      case 'failed':
      case 'error':
        return 'failed';
      default:
        return 'queued';
    }
  }

  /**
   * Helper internal untuk mengeksekusi request HTTP ke OpenWA dengan timeout & sanitasi error aman
   */
  private async executeRequest(url: string, init: RequestInit): Promise<{
    ok: boolean;
    status: number;
    data?: any;
    error?: string;
    errorCode?: string | number;
  }> {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...headers,
          ...((init.headers as Record<string, string>) || {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutTimer);

      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        const safeMsg = this.extractSafeErrorMessage(response.status, json);
        return {
          ok: false,
          status: response.status,
          errorCode: json?.statusCode || json?.code || response.status,
          error: safeMsg,
          data: json,
        };
      }

      return {
        ok: true,
        status: response.status,
        data: json,
      };
    } catch (err: any) {
      clearTimeout(timeoutTimer);

      if (err?.name === 'AbortError') {
        return {
          ok: false,
          status: 408,
          errorCode: 'REQUEST_TIMEOUT',
          error: `Request timeout setelah ${this.timeoutMs}ms saat menghubungi OpenWA API.`,
        };
      }

      if (err?.code === 'ECONNREFUSED' || err?.message?.includes('fetch failed')) {
        const sanitizedUrl = url.split('?')[0];
        return {
          ok: false,
          status: 503,
          errorCode: 'CONNECTION_REFUSED',
          error: `Gagal terhubung ke OpenWA API di ${sanitizedUrl}. Pastikan service aktif.`,
        };
      }

      return {
        ok: false,
        status: 500,
        errorCode: 'NETWORK_ERROR',
        error: `Network error saat menghubungi OpenWA API: ${err?.message || 'Unknown network error'}`,
      };
    }
  }

  /**
   * Memastikan pesan error dari OpenWA tidak mengekspos token, API key, atau kredensial rahasia
   */
  private extractSafeErrorMessage(status: number, body: any): string {
    let msg = body?.message || body?.error;
    if (Array.isArray(msg)) {
      msg = msg.join('; ');
    }

    switch (status) {
      case 400:
        return `OpenWA Bad Request (400): ${msg || 'Parameter request tidak valid'}`;
      case 401:
        return 'OpenWA Unauthorized (401): API key ditolak atau tidak valid.';
      case 403:
        return 'OpenWA Forbidden (403): Hak akses API key tidak mencukupi (role OPERATOR/ADMIN diperlukan).';
      case 404:
        return `OpenWA Not Found (404): ${msg || 'Sesi atau resource tidak ditemukan'}`;
      case 409:
        return `OpenWA Conflict (409): ${msg || 'Engine sesi belum siap atau terjadi konflik status'}`;
      case 503:
        return `OpenWA Service Unavailable (503): ${msg || 'Layanan WhatsApp engine sedang sibuk atau tidak tersedia'}`;
      default:
        return `OpenWA HTTP ${status}: ${msg || 'Terjadi kesalahan pada OpenWA server'}`;
    }
  }

  private resolveSessionId(_organizationId?: string): string {
    return this.sessionId || config.openwaSessionId || '';
  }
}

export const openwaProvider = new OpenWAProvider();
