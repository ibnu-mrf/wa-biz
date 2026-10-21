import express, { Request, Response, NextFunction } from 'express';
import qrcode from 'qrcode';
import { config } from './config';
import { whatsappService } from './whatsapp';
import {
  getActiveProfile,
  setActiveProfile,
  getActiveChatbotConfig,
  setActiveChatbotConfig,
  generateWhatsAppAiReply,
} from './ai';
import { loadProfileFromSupabase, isWorkerSupabaseConfigured } from './supabase';

const app = express();

// ==========================================
// 1. MIDDLEWARE CORS LOKAL (DEVELOPMENT ONLY)
// ==========================================
// Diterapkan sebelum middleware autentikasi agar preflight OPTIONS tidak ditolak karena tanpa API key.
app.use((req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin;

  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  // Tangani preflight OPTIONS segera tanpa memicu autentikasi atau routing
  if (req.method === 'OPTIONS') {
    if (origin && config.allowedOrigins.includes(origin)) {
      res.status(204).end();
      return;
    }
    res.status(403).json({ error: 'CORS policy: Origin not allowed.' });
    return;
  }

  next();
});

app.use(express.json());

// ==========================================
// 2. MIDDLEWARE AUTENTIKASI LOKAL (API KEY)
// ==========================================
function requireLocalApiKey(req: Request, res: Response, next: NextFunction): void {
  const headerKey = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');

  if (!headerKey || headerKey !== config.localApiKey) {
    res.status(401).json({
      error: 'Unauthorized: Kunci API lokal (x-api-key atau Bearer token) wajib disertakan dan harus cocok dengan LOCAL_API_KEY.',
    });
    return;
  }

  next();
}

// ==========================================
// 2. ENDPOINT KESEHATAN SISTEM
// ==========================================
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    worker: 'wabiz-whatsapp-staging',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'staging',
  });
});

// ==========================================
// 3. ENDPOINT STATUS SESI WHATSAPP (TERPROTEKSI)
// ==========================================
app.get('/api/status', requireLocalApiKey, (_req: Request, res: Response) => {
  const state = whatsappService.getState();
  res.json({
    success: true,
    data: state,
  });
});

// ==========================================
// 4. ENDPOINT PENGAMBILAN QR (TERPROTEKSI)
// ==========================================
// Menghasilkan payload data QR untuk pairing manual tanpa mencatat QR ke file log publik
app.get('/api/qr', requireLocalApiKey, async (req: Request, res: Response) => {
  let qrInfo = whatsappService.getRawQr();
  let state = whatsappService.getState();

  if (state.status === 'connected') {
    res.json({
      success: true,
      status: 'connected',
      message: 'WhatsApp sudah terhubung. Tidak diperlukan scan QR.',
      phoneNumber: state.phoneNumber,
      whatsappName: state.whatsappName,
    });
    return;
  }

  // Jika QR belum ada, atau sudah kedaluwarsa, dan status socket sedang mati / timeout
  if ((!qrInfo.qr || !qrInfo.isFresh) && (state.status === 'disconnected' || state.status === 'qr_expired' || state.status === 'error')) {
    console.log('[API Diagnostic] GET /api/qr: Sesi mati atau QR kedaluwarsa. Memulai inisialisasi sesi Baileys baru...');
    await whatsappService.start(true);
    // Beri waktu agar server WhatsApp menerbitkan QR baru
    await new Promise((r) => setTimeout(r, 800));
    qrInfo = whatsappService.getRawQr();
    state = whatsappService.getState();
  }

  if (!qrInfo.qr) {
    res.status(404).json({
      success: false,
      status: state.status,
      message: 'QR Code sedang disiapkan oleh server WhatsApp. Silakan segarkan dalam 1-2 detik.',
      qrCount: state.qrCount,
      reconnectAttempts: state.reconnectAttempts,
    });
    return;
  }

  try {
    // Generate data URL gambar base64 untuk kemudahan pairing visual lokal
    const qrDataUrl = await qrcode.toDataURL(qrInfo.qr, { margin: 2, scale: 6 });
    res.json({
      success: true,
      status: 'qr_ready',
      qrCount: qrInfo.count,
      generatedAt: qrInfo.generatedAt,
      ageSeconds: qrInfo.ageSeconds,
      isFresh: qrInfo.isFresh,
      qrDataUrl,
      help: 'Buka WhatsApp di ponsel > Pengaturan/Titik Tiga > Perangkat Tertaut > Tautkan Perangkat.',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Gagal membuat representasi visual QR.',
    });
  }
});

// Endpoint HTML sederhana untuk memindai QR secara lokal di browser komputer
app.get('/qr-view', async (req: Request, res: Response) => {
  const apiKey = (req.query.key as string) || '';
  if (apiKey !== config.localApiKey) {
    res.status(401).send('<h3>401 Unauthorized</h3><p>Sertakan parameter query ?key=LOCAL_API_KEY untuk melihat QR pairing lokal.</p>');
    return;
  }

  let qrInfo = whatsappService.getRawQr();
  let state = whatsappService.getState();

  if (state.status === 'connected') {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>WABiz WhatsApp - Terhubung</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 40px;">
          <h2 style="color: #059669;">✓ WhatsApp Terhubung!</h2>
          <p>Nomor: <b>${state.phoneNumber || 'N/A'}</b></p>
          <p>Nama Akun: <b>${state.whatsappName || 'N/A'}</b></p>
          <p style="color: #64748b;">Sesi staging aktif sebagai Perangkat Tertaut (Companion Device).</p>
        </body>
      </html>
    `);
    return;
  }

  if ((!qrInfo.qr || !qrInfo.isFresh) && (state.status === 'disconnected' || state.status === 'qr_expired' || state.status === 'error')) {
    await whatsappService.start(true);
    await new Promise((r) => setTimeout(r, 800));
    qrInfo = whatsappService.getRawQr();
    state = whatsappService.getState();
  }

  if (!qrInfo.qr) {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>WABiz WhatsApp - Menunggu QR</title>
          <meta http-equiv="refresh" content="2">
        </head>
        <body style="font-family: sans-serif; text-align: center; padding: 40px;">
          <h2>Menyiapkan QR Code Baru dari WhatsApp...</h2>
          <p style="color: #64748b;">Status: <b>${state.status}</b></p>
          <p>Halaman ini akan me-refresh otomatis setiap 2 detik.</p>
        </body>
      </html>
    `);
    return;
  }

  qrcode.toDataURL(qrInfo.qr, { margin: 2, scale: 8 }, (err, url) => {
    if (err) {
      res.status(500).send('Gagal membuat gambar QR');
      return;
    }
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>WABiz WhatsApp QR Staging Pairing</title>
          <meta http-equiv="refresh" content="15">
        </head>
        <body style="font-family: sans-serif; text-align: center; padding: 30px; background-color: #f8fafc;">
          <div style="max-width: 420px; margin: 0 auto; background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
            <h2 style="margin-top: 0; color: #1e293b;">Tautkan WhatsApp Uji Coba (QR #${qrInfo.count})</h2>
            <p style="color: #475569; font-size: 14px;">Buka WhatsApp di ponsel uji coba &gt; <b>Perangkat Tertaut</b> &gt; <b>Tautkan Perangkat</b>, lalu scan kode di bawah:</p>
            <img src="${url}" alt="WhatsApp QR Code" style="border: 1px solid #e2e8f0; border-radius: 8px; width: 280px; height: 280px;" />
            <p style="color: #94a3b8; font-size: 12px; margin-top: 16px;">Dibuat: ${qrInfo.generatedAt?.toLocaleTimeString() || '-'} (Usia: ${qrInfo.ageSeconds}s)<br>Auto-refresh setiap 15 detik.</p>
          </div>
        </body>
      </html>
    `);
  });
});

// ==========================================
// 5. ENDPOINT PENGIRIMAN PESAN UJI COBA (TERPROTEKSI)
// ==========================================
app.post('/api/send', requireLocalApiKey, async (req: Request, res: Response) => {
  const { to, message } = req.body;

  if (!to || !message) {
    res.status(400).json({
      success: false,
      error: 'Parameter "to" (nomor tujuan) dan "message" (teks pesan) wajib disertakan.',
    });
    return;
  }

  const result = await whatsappService.sendMessage(to, message);
  if (!result.success) {
    res.status(500).json(result);
    return;
  }

  res.json({
    success: true,
    data: {
      to,
      messageId: result.messageId,
      sentAt: new Date().toISOString(),
    },
  });
});

// ==========================================
// 6. ENDPOINT REKONEKSI & DISCONNECT (TERPROTEKSI)
// ==========================================
app.post('/api/reconnect', requireLocalApiKey, async (_req: Request, res: Response) => {
  console.log('[API Diagnostic] Permintaan rekoneksi manual diterima via POST /api/reconnect.');
  await whatsappService.start(true);
  res.json({
    success: true,
    message: 'Rekoneksi sedang dijalankan (counter percobaan direset).',
  });
});

app.post('/api/disconnect', requireLocalApiKey, async (req: Request, res: Response) => {
  const deleteSession = Boolean(req.body.deleteSession);
  console.log(`[API] Permintaan disconnect diterima (deleteSession: ${deleteSession}).`);
  await whatsappService.disconnect(deleteSession);
  res.json({
    success: true,
    message: deleteSession ? 'Sesi diputuskan dan file kredensial lokal dihapus.' : 'Sesi diputuskan.',
  });
});

// ==========================================
// 7. ENDPOINT MANAJEMEN BASIS DATA AI (TERPROTEKSI)
// ==========================================
app.get('/api/ai/config', requireLocalApiKey, (_req: Request, res: Response) => {
  res.json({
    success: true,
    profile: getActiveProfile(),
    config: getActiveChatbotConfig(),
  });
});

app.post('/api/ai/config', requireLocalApiKey, (req: Request, res: Response) => {
  const { profile, config: botConfig } = req.body;
  if (profile) setActiveProfile(profile);
  if (botConfig) setActiveChatbotConfig(botConfig);

  console.log('[API] Konfigurasi basis data AI dan profil lembaga berhasil disinkronisasi.');
  res.json({
    success: true,
    message: 'Konfigurasi profil organisasi dan chatbot AI berhasil diperbarui.',
    profile: getActiveProfile(),
    config: getActiveChatbotConfig(),
  });
});

// Endpoint pengujian simulasi AI lokal secara aman
app.post('/api/ai/simulate', requireLocalApiKey, async (req: Request, res: Response) => {
  const { prompt, senderPhone } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ success: false, error: 'Parameter "prompt" wajib disertakan.' });
    return;
  }

  const phone = senderPhone || '6281200000000';
  const reply = await generateWhatsAppAiReply(prompt, phone);
  res.json({
    success: true,
    data: {
      prompt,
      senderPhone: phone,
      replyText: reply.text,
      source: reply.source,
      isEscalated: reply.isEscalated,
    },
  });
});

// ==========================================
// 8. INISIALISASI SERVER & SHUTDOWN HANDLER
// ==========================================
const server = app.listen(config.port, config.host, () => {
  console.log('======================================================');
  console.log(`[WABiz WhatsApp Worker Staging] Berjalan pada http://${config.host}:${config.port}`);
  console.log(`Autentikasi API Key Lokal: Aktif`);
  console.log(`CORS Origins Diizinkan: ${config.allowedOrigins.join(', ')}`);
  console.log(`Penyimpanan Sesi: ${config.sessionDir}`);
  console.log('======================================================');

  // Diagnostik status Supabase & WORKER_ORG_ID saat startup (aman, tanpa secret/isi profil)
  const isSupabaseConfigured = isWorkerSupabaseConfigured();
  const isOrgIdAvailable = Boolean(process.env.WORKER_ORG_ID?.trim());

  console.log('[Startup] Diagnostik Supabase:');
  console.log(`  - Konfigurasi Supabase : ${isSupabaseConfigured ? 'Terkonfigurasi' : 'Tidak terkonfigurasi'}`);
  console.log(`  - WORKER_ORG_ID        : ${isOrgIdAvailable ? 'Tersedia' : 'Tidak tersedia'}`);

  // Muat profil organisasi dari Supabase saat startup (opsional)
  if (isSupabaseConfigured) {
    loadProfileFromSupabase()
      .then((loaded) => {
        if (loaded) {
          console.log('[Startup] Status profil: Berhasil dimuat dan diterapkan ke AI worker.');
        } else {
          console.log('[Startup] Status profil: Belum dimuat (profil tidak ditemukan atau WORKER_ORG_ID belum diset). Menunggu sinkronisasi dari Expo.');
        }
      })
      .catch((err) => {
        console.error('[Startup] Status profil: Gagal memuat dari Supabase:', (err as Error)?.message || err);
      });
  } else {
    console.log('[Startup] Status profil: Supabase tidak dikonfigurasi. Profil dimuat dari sinkronisasi Expo.');
  }

  // Mulai socket WhatsApp otomatis saat worker dijalankan
  whatsappService.start().catch((err) => {
    console.error('[WhatsApp Init Error]', err);
  });
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.log(`\n[Shutdown] Menerima sinyal ${signal}. Menutup koneksi WhatsApp dan server HTTP secara aman...`);
  whatsappService
    .disconnect(false)
    .catch((err) => {
      console.error('[Shutdown Error]', err);
    })
    .finally(() => {
      server.close(() => {
        console.log('[Shutdown] Server HTTP ditutup bersih. Selesai.');
        process.exit(0);
      });
    });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
