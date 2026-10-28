import express, { Request, Response, NextFunction } from 'express';
import qrcode from 'qrcode';
import { config, validateWorkerConfig } from './config';
import { whatsappService } from './whatsapp';
import {
  getActiveProfile,
  setActiveProfile,
  getActiveChatbotConfig,
  setActiveChatbotConfig,
  generateWhatsAppAiReply,
} from './ai';
import {
  loadProfileFromSupabase,
  isWorkerSupabaseConfigured,
  deleteConversation,
  deleteTeamMember,
} from './supabase';
import { retryRegistrationHandoff } from './handoff';
import {
  campaignScheduler,
  createPersistentCampaign,
  cancelCampaign,
  deleteCampaign,
  updateCampaign,
  getCampaignRecipients,
} from './campaigns';
import {
  authenticateAndAuthorize,
  globalRateLimiter,
  sensitiveRateLimiter,
  maskPhone,
} from './security';
import { tenantManager } from './multiTenant';
import { getProvider, getProviderReadiness } from './providers';
import {
  handleMetaWebhookVerification,
  handleMetaWebhookPost,
  handleOpenWaWebhookPost,
} from './webhook';

const app = express();

// ==========================================
// 1. MIDDLEWARE CORS LOKAL (DEVELOPMENT ONLY)
// ==========================================
// Diterapkan sebelum middleware autentikasi agar preflight OPTIONS tidak ditolak karena tanpa API key.
app.use((req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin;

  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization, Accept, x-supabase-auth, x-organization-id');
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

// ==========================================
// 2. PARSING PAYLOAD & BATASAN UKURAN (DOS HARDENING)
// ==========================================
// 2A. Parser khusus Webhook Meta & OpenWA:
// Batas maksimum 2 MB dan menyimpan buffer mentah (rawBody) secara utuh untuk verifikasi signature.
// Didaftarkan SEBELUM parser reguler agar parser reguler 256 KB tidak mengonsumsi body webhook terlebih dahulu.
const webhookPaths = ['/api/webhooks/whatsapp', '/api/webhooks/openwa'];

app.use(
  webhookPaths,
  express.json({
    limit: '2mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// 2B. Parser reguler untuk seluruh endpoint lainnya:
// Dibatasi ketat maksimum 256 KB untuk mencegah serangan DoS / payload bomb.
app.use(
  express.json({
    limit: '256kb',
  })
);

// Penanganan error payload terlalu besar (HTTP 413) atau JSON rusak (HTTP 400)
app.use((err: any, req: Request, res: Response, next: NextFunction): void => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    const isWebhook = webhookPaths.some((p) => req.path.startsWith(p));
    res.status(413).json({
      success: false,
      error: `Payload Too Large: Ukuran body data melebihi batas maksimal yang diizinkan (${isWebhook ? '2 MB' : '256 KB'}).`,
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'Bad Request: Format payload JSON tidak valid.',
    });
    return;
  }
  next(err);
});

// Terapkan rate limiter global ke seluruh endpoint /api
app.use('/api', globalRateLimiter);

// Alias kompatibilitas backward jika ada helper internal lama
const requireLocalApiKey = authenticateAndAuthorize({ requiredRole: 'member', enforceWorkerOrg: true });

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
// 2B. ENDPOINT WEBHOOK META WHATSAPP CLOUD API
// ==========================================
// Endpoint publik untuk Meta Webhook. Proteksi:
// - GET: hub.mode=subscribe & hub.verify_token matching
// - POST: Validasi tanda tangan kriptografis X-Hub-Signature-256
app.get('/api/webhooks/whatsapp', handleMetaWebhookVerification);
app.post('/api/webhooks/whatsapp', handleMetaWebhookPost);

// ==========================================
// 2C. ENDPOINT WEBHOOK OPENWA (TERISOLASI)
// ==========================================
// Endpoint publik untuk webhook OpenWA. Proteksi:
// - POST: Validasi tanda tangan kriptografis X-OpenWA-Signature (HMAC-SHA256)
app.post('/api/webhooks/openwa', handleOpenWaWebhookPost);

// ==========================================
// 3. ENDPOINT STATUS SESI WHATSAPP (TERPROTEKSI)
// ==========================================
app.get('/api/status', authenticateAndAuthorize({ requiredRole: 'member', enforceWorkerOrg: true }), (_req: Request, res: Response) => {
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
app.get('/api/qr', authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
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

  // P2.1: GET bersifat read-only tanpa efek samping koneksi atau pembuatan socket.
  // Jika QR belum tersedia atau kedaluwarsa, kembalikan status tanpa memanggil whatsappService.start().
  if (!qrInfo.qr || !qrInfo.isFresh) {
    const isExpired = Boolean(qrInfo.qr && !qrInfo.isFresh);
    res.status(404).json({
      success: false,
      status: isExpired ? 'qr_expired' : state.status,
      message: isExpired
        ? 'QR Code telah kedaluwarsa. Silakan inisialisasi koneksi ulang melalui aksi eksplisit.'
        : 'QR Code belum tersedia atau sesi belum dimulai. Silakan inisialisasi koneksi melalui aksi eksplisit.',
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


// ==========================================
// 5. ENDPOINT PENGIRIMAN PESAN UJI COBA (TERPROTEKSI)
// ==========================================
app.post('/api/send', sensitiveRateLimiter, authenticateAndAuthorize({ requiredRole: 'member', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
  const { to, message, organizationId } = req.body;

  if (!to || !message) {
    res.status(400).json({
      success: false,
      error: 'Parameter "to" (nomor tujuan) dan "message" (teks pesan) wajib disertakan.',
    });
    return;
  }

  const targetOrgId = req.authenticatedUser?.organizationId || organizationId || config.workerOrgId;
  const tenantCheck = tenantManager.validateTenantAccess(targetOrgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  console.log(`[API Send] Mengirim pesan ke ${maskPhone(to)} (Org: ${targetOrgId})...`);
  const provider = await getProvider(targetOrgId);
  const result = await provider.sendMessage({
    organizationId: targetOrgId,
    recipientPhone: to,
    text: message,
  });

  if (!result.success) {
    res.status(500).json({
      success: false,
      error: result.error,
      errorCode: result.errorCode,
      provider: result.provider,
    });
    return;
  }

  res.json({
    success: true,
    data: {
      to: maskPhone(to),
      provider: result.provider,
      messageId: result.providerMessageId,
      sentAt: result.timestamp,
    },
  });
});

// ==========================================
// 6. ENDPOINT REKONEKSI & DISCONNECT (TERPROTEKSI ADMIN)
// ==========================================
app.post('/api/reconnect', sensitiveRateLimiter, authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true }), async (_req: Request, res: Response) => {
  console.log('[API Diagnostic] Permintaan rekoneksi manual diterima via POST /api/reconnect.');
  await whatsappService.start(true);
  res.json({
    success: true,
    message: 'Rekoneksi sedang dijalankan (counter percobaan direset).',
  });
});

app.post('/api/disconnect', sensitiveRateLimiter, authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
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
app.get('/api/ai/config', authenticateAndAuthorize({ requiredRole: 'member', enforceWorkerOrg: true }), (_req: Request, res: Response) => {
  res.json({
    success: true,
    profile: getActiveProfile(),
    config: getActiveChatbotConfig(),
  });
});

app.post('/api/ai/config', authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true }), (req: Request, res: Response) => {
  const { profile, config: botConfig, organizationId } = req.body;
  const targetOrgId = req.authenticatedUser?.organizationId || organizationId || config.workerOrgId;
  const tenantCheck = tenantManager.validateTenantAccess(targetOrgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  if (profile) {
    const profileOrgId = typeof profile.orgId === 'string' ? profile.orgId.trim() : '';
    if (!profileOrgId || profileOrgId !== targetOrgId) {
      res.status(403).json({
        success: false,
        error: 'Forbidden: ID organisasi pada profil wajib diisi dan harus cocok dengan organisasi target worker.',
      });
      return;
    }
    setActiveProfile(profile);
  }
  if (botConfig) setActiveChatbotConfig(botConfig);

  console.log(`[API] Konfigurasi basis data AI dan profil lembaga untuk org ${targetOrgId} berhasil disinkronisasi.`);
  res.json({
    success: true,
    message: 'Konfigurasi profil organisasi dan chatbot AI berhasil diperbarui.',
    profile: getActiveProfile(),
    config: getActiveChatbotConfig(),
  });
});

// Endpoint pengujian simulasi AI lokal secara aman
app.post('/api/ai/simulate', sensitiveRateLimiter, authenticateAndAuthorize({ requiredRole: 'member', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
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
      senderPhone: maskPhone(phone),
      replyText: reply.text,
      source: reply.source,
      isEscalated: reply.isEscalated,
    },
  });
});

// Endpoint untuk melakukan retry pengalihan pendaftar ke CS (dari dashboard)
app.post('/api/handoff/retry', sensitiveRateLimiter, authenticateAndAuthorize({ requiredRole: 'member', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
  const { conversationId, organizationId } = req.body;
  if (!conversationId) {
    res.status(400).json({ success: false, error: 'Parameter "conversationId" wajib disertakan.' });
    return;
  }

  const orgId = req.authenticatedUser?.organizationId || organizationId || config.workerOrgId || getActiveProfile().orgId;
  const tenantCheck = tenantManager.validateTenantAccess(orgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  try {
    const result = await retryRegistrationHandoff(
      orgId,
      conversationId,
      async (to, msg) => whatsappService.sendMessage(to, msg),
      getActiveProfile()
    );

    res.json({
      success: result.success,
      data: result,
      error: result.error,
    });
  } catch (err: any) {
    console.error('[API] Error saat retry handoff:', err?.message || err);
    res.status(500).json({
      success: false,
      error: `Gagal menjalankan retry handoff: ${err?.message || err}`,
    });
  }
});

// ==========================================
// 8. ENDPOINT MANAJEMEN KAMPANYE PERSISTEN (TERPROTEKSI ADMIN)
// ==========================================
// Mengambil status kesiapan gateway/provider untuk pengiriman kampanye (terproteksi member)
app.get('/api/campaigns/gateway-status', authenticateAndAuthorize({ requiredRole: 'member', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
  const orgId = req.authenticatedUser?.organizationId || ((req.query.organizationId as string) || config.workerOrgId || getActiveProfile().orgId);

  const tenantCheck = tenantManager.validateTenantAccess(orgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  try {
    const readiness = await getProviderReadiness(orgId);
    res.json({
      success: true,
      data: readiness,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: `Gagal membaca status gateway: ${err?.message || err}`,
    });
  }
});

// Membuat kampanye siaran baru dengan antrean persisten dan deduplikasi
app.post('/api/campaigns/create', sensitiveRateLimiter, authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
  const {
    organizationId,
    name,
    messageBody,
    senderPhone,
    targetSegment,
    deliveryMode,
    scheduledAt,
    contactIds,
  } = req.body;

  const orgId = req.authenticatedUser?.organizationId || organizationId || config.workerOrgId || getActiveProfile().orgId;
  const tenantCheck = tenantManager.validateTenantAccess(orgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  const result = await createPersistentCampaign(orgId, {
    name,
    messageBody,
    senderPhone,
    targetSegment,
    deliveryMode: deliveryMode === 'scheduled' ? 'scheduled' : 'now',
    scheduledAt,
    contactIds,
  });

  if (!result.success) {
    res.status(400).json(result);
    return;
  }

  res.json({
    success: true,
    data: result,
  });
});

// Membatalkan kampanye terjadwal yang belum selesai diproses
app.post('/api/campaigns/:id/cancel', authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
  const campaignId = req.params.id as string;
  const orgId = req.authenticatedUser?.organizationId || (req.body.organizationId || config.workerOrgId || getActiveProfile().orgId) as string;

  const tenantCheck = tenantManager.validateTenantAccess(orgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  const result = await cancelCampaign(orgId, campaignId);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }

  res.json({
    success: true,
    data: result,
  });
});

// Mengambil daftar penerima dan status delivery per kontak untuk kampanye tertentu
app.get('/api/campaigns/:id/recipients', authenticateAndAuthorize({ requiredRole: 'member', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
  const campaignId = req.params.id as string;
  const orgId = req.authenticatedUser?.organizationId || (req.query.organizationId || config.workerOrgId || getActiveProfile().orgId) as string;

  const tenantCheck = tenantManager.validateTenantAccess(orgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  const result = await getCampaignRecipients(orgId, campaignId);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }

  res.json({
    success: true,
    data: result,
  });
});

// Menghapus percakapan secara aman (role member ke atas, dibatasi tenant)
app.delete('/api/conversations/:id', sensitiveRateLimiter, authenticateAndAuthorize({ requiredRole: 'member', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
  const conversationId = req.params.id as string;
  const orgId = req.authenticatedUser?.organizationId || ((req.query.organizationId || req.body?.organizationId || config.workerOrgId || getActiveProfile().orgId) as string);

  if (!conversationId) {
    res.status(400).json({ success: false, error: 'Parameter "conversationId" wajib disertakan.' });
    return;
  }

  const tenantCheck = tenantManager.validateTenantAccess(orgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  const result = await deleteConversation(orgId, conversationId);
  if (!result.success) {
    const statusCode = result.notFound ? 404 : 400;
    res.status(statusCode).json(result);
    return;
  }

  res.json({
    success: true,
    data: result,
    message: result.message,
  });
});

// Menghapus anggota tim CS secara aman (hanya role admin/owner, dibatasi tenant)
app.delete('/api/team-members/:id', sensitiveRateLimiter, authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
  const memberId = req.params.id as string;
  const orgId = req.authenticatedUser?.organizationId || ((req.query.organizationId || req.body?.organizationId || config.workerOrgId || getActiveProfile().orgId) as string);

  if (!memberId) {
    res.status(400).json({ success: false, error: 'Parameter "memberId" wajib disertakan.' });
    return;
  }

  const tenantCheck = tenantManager.validateTenantAccess(orgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  const result = await deleteTeamMember(orgId, memberId);
  if (!result.success) {
    const statusCode = result.notFound ? 404 : 400;
    res.status(statusCode).json(result);
    return;
  }

  res.json({
    success: true,
    data: result,
    message: result.message,
  });
});

// Menghapus kampanye persisten secara aman (hanya role admin/owner, dilarang jika running)
app.delete('/api/campaigns/:id', sensitiveRateLimiter, authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
  const campaignId = req.params.id as string;
  const orgId = req.authenticatedUser?.organizationId || ((req.query.organizationId || req.body?.organizationId || config.workerOrgId || getActiveProfile().orgId) as string);

  const tenantCheck = tenantManager.validateTenantAccess(orgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  const result = await deleteCampaign(orgId, campaignId);
  if (!result.success) {
    res.status(result.statusCode || 400).json(result);
    return;
  }

  res.json({
    success: true,
    data: result,
    message: result.message,
  });
});

// Memperbarui kampanye (hanya draft atau scheduled, dilarang jika running/completed)
app.put('/api/campaigns/:id', sensitiveRateLimiter, authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true }), async (req: Request, res: Response) => {
  const campaignId = req.params.id as string;
  const orgId = req.authenticatedUser?.organizationId || ((req.body?.organizationId || config.workerOrgId || getActiveProfile().orgId) as string);

  const tenantCheck = tenantManager.validateTenantAccess(orgId);
  if (!tenantCheck.allowed) {
    res.status(403).json({ success: false, error: tenantCheck.reason });
    return;
  }

  const { name, messageBody, scheduledAt, status } = req.body;
  const result = await updateCampaign(orgId, campaignId, { name, messageBody, scheduledAt, status });
  if (!result.success) {
    res.status(result.statusCode || 400).json(result);
    return;
  }

  res.json({
    success: true,
    data: result.data,
    message: result.message,
  });
});

// Memicu siklus pemrosesan antrean kampanye secara manual
app.post('/api/campaigns/trigger', authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true }), (_req: Request, res: Response) => {
  campaignScheduler.triggerNow();
  res.json({ success: true, message: 'Siklus scheduler antrean kampanye dipicu.' });
});

// Fallback error-handling middleware di akhir pipeline route untuk menangani error tak terduga
app.use((err: any, req: Request, res: Response, _next: NextFunction): void => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    const isWebhook = webhookPaths.some((p) => req.path.startsWith(p));
    res.status(413).json({
      success: false,
      error: `Payload Too Large: Ukuran body data melebihi batas maksimal yang diizinkan (${isWebhook ? '2 MB' : '256 KB'}).`,
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'Bad Request: Format payload JSON tidak valid.',
    });
    return;
  }
  console.error('[Unhandled Route Error]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// ==========================================
// 9. INISIALISASI SERVER & SHUTDOWN HANDLER
// ==========================================
// Validasi konfigurasi keamanan wajib sebelum membuka listener
try {
  validateWorkerConfig(config);
} catch (configErr: any) {
  console.error(`[FATAL STARTUP ERROR] ${configErr?.message || configErr}`);
  process.exit(1);
}

const server = app.listen(config.port, config.host, () => {
  console.log('======================================================');
  console.log(`[WABiz WhatsApp Worker Staging] Berjalan pada http://${config.host}:${config.port}`);
  console.log(`Autentikasi API Key Lokal: Aktif`);
  console.log(`CORS Origins Diizinkan: ${config.allowedOrigins.join(', ')}`);
  console.log(`Penyimpanan Sesi: ${config.sessionDir}`);
  console.log(`Auto-Start WhatsApp: ${config.autoStartWhatsApp ? 'Aktif (true)' : 'Nonaktif (false - Safe Mode)'}`);
  console.log('======================================================');

  // Mulai mesin antrean pengiriman persisten
  campaignScheduler.start(4000);

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

  // Mulai socket WhatsApp hanya jika diizinkan secara eksplisit (AUTO_START_WHATSAPP=true)
  if (config.autoStartWhatsApp) {
    console.log('[Startup] AUTO_START_WHATSAPP=true terdeteksi. Memulai socket WhatsApp Baileys...');
    whatsappService.start().catch((err) => {
      console.error('[WhatsApp Init Error]', err);
    });
  } else {
    console.log('[Startup] AUTO_START_WHATSAPP=false (default). Backend berjalan dalam mode API tanpa memulai socket WhatsApp.');
  }
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.log(`\n[Shutdown] Menerima sinyal ${signal}. Menutup koneksi WhatsApp dan server HTTP secara aman...`);
  campaignScheduler.stop();
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
