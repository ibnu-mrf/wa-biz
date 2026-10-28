// ==========================================
// Meta WhatsApp Cloud API Webhook Handler
// ==========================================

import { Request, Response } from 'express';
import crypto from 'crypto';
import { config } from './config';
import {
  createWorkerSupabaseClient,
  persistInboundWhatsAppMessage,
  persistOutboundWhatsAppMessage,
  claimInboundMessageForAi,
  markInboundMessageDispatching,
  updateInboundMessageAiStatus,
  getOutboundReplyForInbound,
  InboundMessageParams,
  InboundMessageResult,
  AiProcessingStatus,
  ClaimInboundResult,
} from './supabase';
import { metaCloudApiProvider } from './providers/metaCloudApiProvider';
import { openwaProvider } from './providers/openwaProvider';
import { detectRegistrationIntent, executeRegistrationHandoff } from './handoff';
import { generateWhatsAppAiReply, getActiveProfile } from './ai';
import { maskPhone } from './security';

// Cache idempotensi in-memory untuk deduplikasi pesan webhook
const processedWebhookIds = new Set<string>();

/**
 * Validasi signature X-Hub-Signature-256 menggunakan timing-safe comparison
 */
export function verifyMetaSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret || !rawBody) {
    return false;
  }

  // Header format: sha256=abcdef123456...
  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'sha256') {
    return false;
  }

  const expectedSignatureHex = parts[1].trim().toLowerCase();
  if (expectedSignatureHex.length !== 64) {
    return false;
  }

  try {
    const computedHmacHex = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')
      .toLowerCase();

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignatureHex, 'hex'),
      Buffer.from(computedHmacHex, 'hex')
    );
  } catch (err) {
    console.warn('[Webhook Signature] Gagal memvalidasi signature:', err);
    return false;
  }
}

/**
 * Handler GET: Handshake Verifikasi Webhook Meta (hub.challenge)
 */
export async function handleMetaWebhookVerification(req: Request, res: Response): Promise<void> {
  const mode = req.query['hub.mode'] as string | undefined;
  const token = req.query['hub.verify_token'] as string | undefined;
  const challenge = req.query['hub.challenge'] as string | undefined;

  console.log(`[Webhook GET] Menerima challenge verifikasi Meta (mode: ${mode})...`);

  if (!mode || mode !== 'subscribe') {
    res.status(400).send('Bad Request: Invalid hub.mode');
    return;
  }

  // Ambil token verify dari konfigurasi
  const expectedToken = config.metaWebhookVerifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (expectedToken && token === expectedToken) {
    console.log('[Webhook GET] Verifikasi handshake Meta berhasil disetujui.');
    res.status(200).send(challenge);
    return;
  }

  // Coba cek verify_token di database jika ada banyak organisasi
  const supabase = createWorkerSupabaseClient();
  if (supabase && token) {
    try {
      const { data: sec } = await supabase
        .from('organization_whatsapp_secrets')
        .select('organization_id')
        .eq('webhook_verify_token', token)
        .maybeSingle();

      if (sec && sec.organization_id) {
        console.log(`[Webhook GET] Handshake disetujui via DB untuk org ${sec.organization_id}.`);
        res.status(200).send(challenge);
        return;
      }
    } catch (err: any) {
      console.warn('[Webhook GET] Exception saat memeriksa verify token di DB:', err?.message);
    }
  }

  console.warn('[Webhook GET] Ditolak: hub.verify_token tidak cocok.');
  res.status(403).send('Forbidden: hub.verify_token mismatch');
}

/**
 * Handler POST: Pemrosesan Event Webhook (Pesan Masuk & Pembaruan Status)
 */
export async function handleMetaWebhookPost(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const appSecret = config.metaAppSecret || process.env.META_APP_SECRET;

  // 1. Validasi Kriptografis X-Hub-Signature-256
  // Jika app secret dikonfigurasi, WAJIB lolos verifikasi sebelum membaca data
  if (appSecret) {
    const isValid = verifyMetaSignature(rawBody, signature, appSecret);
    if (!isValid) {
      console.warn('[Webhook POST] Penolakan keamanan: X-Hub-Signature-256 tidak valid atau absen.');
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid X-Hub-Signature-256',
      });
      return;
    }
  }

  // 2. Beri respon 200 OK ke Meta secepat mungkin (< 3 detik sesuai Meta SLA)
  res.status(200).json({ status: 'success' });

  // 3. Pemrosesan Asinkron di latar belakang
  setImmediate(async () => {
    try {
      await processWebhookPayload(req.body);
    } catch (err: any) {
      console.error('[Webhook POST] Unhandled exception dalam pemrosesan background:', err?.message || err);
    }
  });
}

/**
 * Memproses isi payload webhook Meta
 */
export async function processWebhookPayload(body: any): Promise<void> {
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    // Payload bukan event WhatsApp business account, abaikan aman
    return;
  }

  const supabase = createWorkerSupabaseClient();

  for (const entry of body.entry) {
    const changes = entry.changes || [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;

      const value = change.value;
      if (!value) continue;

      const metadata = value.metadata;
      const phoneNumberId = metadata?.phone_number_id;

      if (!phoneNumberId) {
        continue;
      }

      // 4. PEMETAAN TENANT SISI SERVER (Server-Side Tenant Resolution)
      // JANGAN PERNAH percaya organization_id dari request payload
      let resolvedOrgId: string | null = null;

      if (supabase) {
        try {
          const { data: cfg } = await supabase
            .from('organization_whatsapp_configs')
            .select('organization_id')
            .eq('phone_number_id', phoneNumberId)
            .eq('is_active', true)
            .maybeSingle();

          if (cfg && cfg.organization_id) {
            resolvedOrgId = cfg.organization_id;
          }
        } catch (dbErr: any) {
          console.warn('[Webhook] Gagal query mapping phone_number_id:', dbErr?.message);
        }
      }

      // Fallback staging jika cocok dengan nomor uji coba worker
      if (!resolvedOrgId) {
        const stagingPhoneId = process.env.META_PHONE_NUMBER_ID || process.env.META_PHONE_ID;
        if (stagingPhoneId && phoneNumberId === stagingPhoneId) {
          resolvedOrgId = config.workerOrgId;
        }
      }

      if (!resolvedOrgId) {
        console.warn(`[Webhook] phone_number_id ${phoneNumberId} tidak terdaftar pada organisasi mana pun. Event diabaikan.`);
        continue;
      }

      // 5. TANGANI UPDATE STATUS PENGIRIMAN (value.statuses)
      if (Array.isArray(value.statuses)) {
        for (const statusItem of value.statuses) {
          const wamid = statusItem.id;
          const rawStatus = statusItem.status;
          const normalizedStatus = metaCloudApiProvider.normalizeDeliveryStatus(rawStatus);
          const timestamp = statusItem.timestamp ? new Date(parseInt(statusItem.timestamp, 10) * 1000).toISOString() : new Date().toISOString();
          const errors = statusItem.errors ? JSON.stringify(statusItem.errors) : null;

          console.log(`[Webhook Status] Pesan ${wamid} -> ${normalizedStatus} (Penerima: +${maskPhone(statusItem.recipient_id)})`);

          if (supabase) {
            // Update tabel public.messages
            await supabase
              .from('messages')
              .update({
                delivery_status: normalizedStatus,
                delivery_error: errors,
              })
              .eq('provider_message_id', wamid)
              .eq('organization_id', resolvedOrgId);

            // Update tabel public.campaign_recipients jika pesan adalah bagian dari kampanye
            await supabase
              .from('campaign_recipients')
              .update({
                status: normalizedStatus,
                error_message: errors,
                delivered_at: normalizedStatus === 'delivered' || normalizedStatus === 'read' ? timestamp : undefined,
                updated_at: timestamp,
              })
              .eq('provider_message_id', wamid);
          }
        }
      }

      // 6. TANGANI PESAN MASUK (value.messages)
      if (Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          const wamid = msg.id;
          const senderPhone = msg.from;

          // Deduplikasi Idempotensi
          if (processedWebhookIds.has(wamid)) {
            console.log(`[Webhook] Pesan duplikat ${wamid} diabaikan (In-Memory Dedup).`);
            continue;
          }
          processedWebhookIds.add(wamid);
          if (processedWebhookIds.size > 2000) {
            const first = processedWebhookIds.values().next().value;
            if (first) processedWebhookIds.delete(first);
          }

          // Cek deduplikasi di database
          if (supabase) {
            const { data: existingMsg } = await supabase
              .from('messages')
              .select('id')
              .eq('provider_message_id', wamid)
              .maybeSingle();

            if (existingMsg) {
              console.log(`[Webhook] Pesan duplikat ${wamid} sudah tersimpan di database.`);
              continue;
            }
          }

          // Ekstraksi teks pesan
          let textBody = '';
          if (msg.type === 'text') {
            textBody = msg.text?.body || '';
          } else if (msg.type === 'button') {
            textBody = msg.button?.text || '';
          } else if (msg.type === 'interactive') {
            textBody =
              msg.interactive?.button_reply?.title ||
              msg.interactive?.list_reply?.title ||
              '';
          } else {
            textBody = `[Media WhatsApp: ${msg.type}]`;
          }

          if (!textBody.trim()) {
            continue;
          }

          console.log(`[Webhook Pesan] Pesan masuk diterima (Org: ${resolvedOrgId}, MsgId: ${wamid}, Phone: +${maskPhone(senderPhone)}, Length: ${textBody.length} chars)`);

          // Simpan pesan masuk ke Supabase
          const msgTimestamp = msg.timestamp ? parseInt(msg.timestamp, 10) * 1000 : Date.now();
          const persistResult = await persistInboundWhatsAppMessage({
            orgId: resolvedOrgId,
            senderPhone,
            senderName: value.contacts?.[0]?.profile?.name,
            textBody,
            messageTimestamp: msgTimestamp,
            providerType: 'meta_cloud_api',
            providerMessageId: wamid,
          });

          // Evaluasi Intent & Eskalasi CS Handoff
          const intentResult = detectRegistrationIntent(textBody);
          if (intentResult.intent === 'registration_intent') {
            console.log(`[Webhook Intent] Niat pendaftaran terdeteksi dari +${maskPhone(senderPhone)}.`);
            if (persistResult?.conversationId) {
              const profile = getActiveProfile();
              await executeRegistrationHandoff({
                orgId: resolvedOrgId,
                conversationId: persistResult.conversationId,
                customerPhone: senderPhone,
                customerName: value.contacts?.[0]?.profile?.name,
                promptText: textBody,
                profile,
                sendWhatsAppMessageFn: async (to, txt) => {
                  const res = await metaCloudApiProvider.sendMessage({
                    organizationId: resolvedOrgId!,
                    recipientPhone: to,
                    text: txt,
                  });
                  return { success: res.success, messageId: res.providerMessageId, error: res.error };
                },
              });
            }
          } else {
            // Balasan Bot Otomatis Gemini AI (jika dalam sesi 24 jam)
            const aiResult = await generateWhatsAppAiReply(textBody, senderPhone);

            if (aiResult && aiResult.text && aiResult.text.trim()) {
              console.log(`[Webhook AI] Mengirim balasan otomatis ke +${maskPhone(senderPhone)}...`);
              await metaCloudApiProvider.sendMessage({
                organizationId: resolvedOrgId,
                recipientPhone: senderPhone,
                text: aiResult.text.trim(),
                metadata: { skipWindowCheck: true }, // Masih dalam sesi pesan masuk pelanggan
              });
            }
          }
        }
      }
    }
  }
}

// ==========================================
// OpenWA Webhook Handler & Processing Pipeline
// ==========================================

// Cache idempotensi in-memory khusus pesan OpenWA yang sudah selesai diproses
const processedOpenWaWebhookIds = new Set<string>();

/**
 * In-Flight Lock untuk pesan OpenWA yang sedang dalam eksekusi event loop.
 *
 * ARSITEKTUR & BATASAN KEAMANAN:
 * Lock dalam memori ini HANYA melindungi dari balapan konkurensi (race condition)
 * dalam SATU proses instance Node.js (misal: OpenWA retry simultan sebelum query DB selesai).
 * Ini BUKAN pengganti constraint UNIQUE database tingkat PostgreSQL (uq_messages_provider_msg_id)
 * jika aplikasi di-deploy secara horizontal / multi-replica.
 */
export const inFlightOpenWaMessageIds = new Set<string>();

/**
 * Validasi signature X-OpenWA-Signature menggunakan timing-safe comparison (HMAC-SHA256).
 * Header OpenWA format: sha256=<64_hex_digits>
 * Sesuai implementasi deliver-once.ts di OpenWA: generateSignature(body, webhook.secret)
 */
export function verifyOpenWaSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  webhookSecret: string | undefined
): boolean {
  if (!signatureHeader || !webhookSecret || !webhookSecret.trim() || rawBody === undefined || rawBody === null) {
    return false;
  }

  // Format header yang valid: sha256=abcdef123456...
  const trimmed = signatureHeader.trim();
  const parts = trimmed.split('=');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'sha256') {
    return false;
  }

  const expectedSignatureHex = parts[1].trim().toLowerCase();
  // Validasi format hex dan panjang tepat 64 karakter (32 bytes SHA-256)
  if (expectedSignatureHex.length !== 64 || !/^[0-9a-f]{64}$/.test(expectedSignatureHex)) {
    return false;
  }

  try {
    const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const computedHmacHex = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBuffer)
      .digest('hex')
      .toLowerCase();

    const expectedBuf = Buffer.from(expectedSignatureHex, 'hex');
    const computedBuf = Buffer.from(computedHmacHex, 'hex');

    if (expectedBuf.length !== computedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, computedBuf);
  } catch (err) {
    console.warn('[OpenWA Signature] Exception saat validasi HMAC signature:', err);
    return false;
  }
}

/**
 * Resolusi organisasi untuk sesi OpenWA secara aman dan terisolasi.
 *
 * PRINSIP ISOLASI MULTI-TENANT:
 * 1. Jika options.organizationId diberikan eksplisit (misal test suite terisolasi), validasi keberadaannya di DB.
 * 2. Cek pemetaan database: cari konfigurasi aktif di `organization_whatsapp_configs` yang memiliki
 *    `phone_number_id` atau `waba_id` cocok dengan `sessionId`.
 * 3. Jika tidak ada di DB config, izinkan sesi uji coba HANYA jika `sessionId` sama persis dengan
 *    `config.openwaSessionId` DAN `config.openwaTestOrgId` terbukti ada di tabel `organizations`.
 * 4. JANGAN PERNAH fallback ke `config.workerOrgId`.
 * 5. Jika ambigu (lebih dari satu org terdaftar untuk session yang sama) atau tidak ditemukan,
 *    tolak pemrosesan dengan aman (return null). Jangan pernah menebak organisasi.
 */
export async function resolveOpenWaOrganization(
  sessionId?: string,
  options?: { organizationId?: string; supabaseClient?: any }
): Promise<string | null> {
  const supabase =
    options?.supabaseClient ||
    openWaWebhookTestHooks.supabaseClient ||
    (openWaWebhookTestHooks.customPersistFn ? null : createWorkerSupabaseClient());

  // 1. Jika organizationId disediakan eksplisit via options (misal di test suite terisolasi)
  if (options?.organizationId) {
    const orgId = options.organizationId.trim();
    if (!orgId) return null;
    if (supabase) {
      try {
        const { data: org, error } = await supabase
          .from('organizations')
          .select('id')
          .eq('id', orgId)
          .maybeSingle();
        if (error || !org) {
          console.warn(`[OpenWA Tenant] organizationId yang diberikan (${orgId}) tidak ditemukan di tabel organizations.`);
          return null;
        }
        return org.id;
      } catch (err: any) {
        console.warn('[OpenWA Tenant] Exception saat memvalidasi organizationId:', err?.message || err);
        return null;
      }
    }
    return orgId;
  }

  if (!sessionId || !sessionId.trim()) {
    return null;
  }

  const cleanSessionId = sessionId.trim();

  // 2. Query pemetaan eksplisit di database organization_whatsapp_configs
  if (supabase) {
    try {
      const { data: configs, error: cfgErr } = await supabase
        .from('organization_whatsapp_configs')
        .select('organization_id')
        .or(`phone_number_id.eq.${cleanSessionId},waba_id.eq.${cleanSessionId}`)
        .eq('is_active', true);

      if (!cfgErr && Array.isArray(configs)) {
        if (configs.length === 1 && configs[0]?.organization_id) {
          return configs[0].organization_id;
        }
        if (configs.length > 1) {
          console.error(`[OpenWA Tenant] Konflik pemetaan: Ditemukan ${configs.length} organisasi aktif untuk session ID ${cleanSessionId}. Menolak demi keamanan tenant.`);
          return null;
        }
      }
    } catch (dbErr: any) {
      console.warn('[OpenWA Tenant] Exception saat query pemetaan session ID di database:', dbErr?.message || dbErr);
    }
  }

  // 3. Sesi Uji Coba Terkonfigurasi (Staging / Dev Pairing Validated)
  // HANYA jika sessionId sama persis dengan config.openwaSessionId DAN dipasangkan dengan config.openwaTestOrgId
  const configuredSession = config.openwaSessionId?.trim();
  const configuredTestOrg = config.openwaTestOrgId?.trim();

  if (configuredSession && configuredTestOrg && cleanSessionId === configuredSession) {
    if (supabase) {
      try {
        const { data: org, error } = await supabase
          .from('organizations')
          .select('id')
          .eq('id', configuredTestOrg)
          .maybeSingle();

        if (error || !org) {
          console.error(`[OpenWA Tenant] openwaTestOrgId (${configuredTestOrg}) tidak valid / tidak ada di database.`);
          return null;
        }
        return org.id;
      } catch (err: any) {
        console.warn('[OpenWA Tenant] Exception saat memvalidasi openwaTestOrgId:', err?.message || err);
        return null;
      }
    }
    return configuredTestOrg;
  }

  // 4. Tolak pemrosesan: Jangan pernah menebak atau fallback ke workerOrgId
  console.warn(`[OpenWA Tenant] Session ID "${cleanSessionId}" tidak terpetakan ke organisasi mana pun yang valid.`);
  return null;
}

export interface ProcessOpenWaOptions {
  organizationId?: string;
  skipAi?: boolean;
  skipHandoff?: boolean;
  mockPersistFail?: boolean;
  providerType?: 'baileys' | 'meta_cloud_api' | 'openwa';
  lockTimeoutMs?: number;
  supabaseClient?: any;
  customPersistFn?: (params: InboundMessageParams) => Promise<InboundMessageResult | null>;
  customSendFn?: (to: string, message: string) => Promise<{ success: boolean; messageId?: string; error?: string; errorCode?: string | number }>;
  customClaimFn?: (orgId: string, messageId: string) => Promise<ClaimInboundResult>;
  customMarkDispatchFn?: (orgId: string, messageId: string, leaseToken: string) => Promise<boolean>;
  customUpdateStatusFn?: (orgId: string, messageId: string, status: AiProcessingStatus, leaseToken?: string) => Promise<boolean>;
  customGetReplyFn?: (orgId: string, inboundId: string) => Promise<{ id: string; provider_message_id?: string; body: string } | null>;
}

export interface OpenWaWebhookTestHooks {
  supabaseClient?: any;
  customPersistFn?: (params: InboundMessageParams) => Promise<InboundMessageResult | null>;
  customSendFn?: (to: string, message: string) => Promise<{ success: boolean; messageId?: string; error?: string; errorCode?: string | number }>;
  customClaimFn?: (orgId: string, messageId: string) => Promise<ClaimInboundResult>;
  customMarkDispatchFn?: (orgId: string, messageId: string, leaseToken: string) => Promise<boolean>;
  customUpdateStatusFn?: (orgId: string, messageId: string, status: AiProcessingStatus, leaseToken?: string) => Promise<boolean>;
  customGetReplyFn?: (orgId: string, inboundId: string) => Promise<{ id: string; provider_message_id?: string; body: string } | null>;
}

export let openWaWebhookTestHooks: OpenWaWebhookTestHooks = {};

export function setOpenWaWebhookTestHooks(hooks: OpenWaWebhookTestHooks): void {
  openWaWebhookTestHooks = hooks;
}

/**
 * Mendeteksi apakah error pengiriman gateway merupakan status tak-tertentu (unknown outcome / timeout).
 * Menghindari retry buta yang dapat menggandakan pesan di perangkat pelanggan.
 */
export function isUnknownDeliveryError(res?: { success: boolean; error?: string; errorCode?: string | number }): boolean {
  if (!res || res.success) return false;
  if (res.errorCode === 'REQUEST_TIMEOUT' || res.errorCode === 408 || res.errorCode === 504) return true;
  if (res.errorCode === 'REQUEST_TIMEOUT') return true;
  const errStr = (res.error || '').toLowerCase();
  return (
    errStr.includes('timeout') ||
    errStr.includes('etimedout') ||
    errStr.includes('econnreset') ||
    errStr.includes('socket hang up') ||
    errStr.includes('network error')
  );
}

export interface ProcessOpenWaResult {
  success: boolean;
  status: 'processed' | 'ignored' | 'duplicate' | 'error';
  reason?: string;
  messageId?: string;
  conversationId?: string;
  senderPhone?: string;
  intent?: string;
  aiReplied?: boolean;
  handoffTriggered?: boolean;
}

/**
 * Handler POST: Pemrosesan Webhook OpenWA (POST /api/webhooks/openwa)
 *
 * JAMINAN PERSISTENSI SEBELUM HTTP 200:
 * - Request diverifikasi secara kriptografis sebelum membaca isi payload.
 * - Format payload, session, dan organisasi tervalidasi ketat.
 * - Pesan WAJIB berhasil disimpan secara persisten di database SEBELUM respons HTTP 200 dikirimkan.
 * - Jika penyimpanan gagal, kirim HTTP 500 agar OpenWA menjadwalkan retry otomatis.
 * - Pemrosesan AI / Handoff dijalankan setelah persistensi sukses.
 */
export async function handleOpenWaWebhookPost(req: Request, res: Response): Promise<void> {
  const signature = req.headers['x-openwa-signature'] as string | undefined;
  const rawBody = (req as any).rawBody || (typeof req.body === 'string' ? req.body : Buffer.from(JSON.stringify(req.body || {})));
  const webhookSecret = config.openwaWebhookSecret || process.env.OPENWA_WEBHOOK_SECRET;

  // 1. Validasi Konfigurasi & Fail-Closed
  // Jika webhook secret tidak tersedia atau kosong di server, tolak request dengan HTTP 500 (misconfiguration)
  if (!webhookSecret || !webhookSecret.trim()) {
    console.error('[OpenWA Webhook] Penolakan konfigurasi: OPENWA_WEBHOOK_SECRET belum dikonfigurasi pada server (Fail Closed).');
    res.status(500).json({
      success: false,
      error: 'Internal Server Error: OpenWA webhook secret is not configured on server',
    });
    return;
  }

  // 2. Validasi Kriptografis X-OpenWA-Signature (HMAC-SHA256)
  // Semua request wajib lolos verifikasi HMAC SHA-256 terhadap raw body. Header tidak valid atau absen ditolak HTTP 401.
  const isValid = verifyOpenWaSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    console.warn('[OpenWA Webhook] Penolakan keamanan: X-OpenWA-Signature tidak valid atau absen.');
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or missing X-OpenWA-Signature',
    });
    return;
  }

  // 2. Validasi format dasar payload
  const body = req.body;
  if (!body || typeof body !== 'object' || !body.event) {
    res.status(400).json({
      success: false,
      error: 'Bad Request: Malformed OpenWA webhook payload',
    });
    return;
  }

  // 3. Verifikasi Session ID jika terkonfigurasi
  const expectedSessionId = config.openwaSessionId || process.env.OPENWA_SESSION_ID;
  if (expectedSessionId && body.sessionId && body.sessionId !== expectedSessionId) {
    console.warn(`[OpenWA Webhook] Penolakan keamanan: Session ID ${body.sessionId} tidak cocok dengan konfigurasi.`);
    res.status(403).json({
      success: false,
      error: 'Forbidden: Session ID mismatch',
    });
    return;
  }

  // 4. Proses Payload dan Persistensi secara Sinkron sebelum kirim HTTP status
  try {
    const result = await processOpenWaWebhookPayload(body);

    if (result.status === 'error') {
      if (result.reason === 'persistence_failed') {
        // Gagal simpan ke database -> kembalikan HTTP 500 agar OpenWA menjadwalkan retry
        res.status(500).json({
          success: false,
          error: 'Internal Server Error: Failed to persist message to database',
          messageId: result.messageId,
        });
        return;
      }

      if (result.reason === 'unmapped_session_organization') {
        // Sesi tidak dapat dipetakan secara aman ke organisasi mana pun
        res.status(422).json({
          success: false,
          error: 'Unprocessable Entity: Sesi tidak terpetakan ke organisasi mana pun yang valid',
          messageId: result.messageId,
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: result.reason || 'Bad Request',
        messageId: result.messageId,
      });
      return;
    }

    if (result.status === 'duplicate') {
      res.status(200).json({
        received: true,
        status: 'duplicate',
        messageId: result.messageId,
        reason: result.reason,
      });
      return;
    }

    if (result.status === 'ignored') {
      res.status(200).json({
        received: true,
        status: 'ignored',
        messageId: result.messageId,
        reason: result.reason,
      });
      return;
    }

    // Status 'processed': Pesan telah aman tercatat di database!
    res.status(200).json({
      received: true,
      event: body.event,
      deliveryId: req.headers['x-openwa-delivery-id'] || null,
      messageId: result.messageId,
      status: 'persisted',
      conversationId: result.conversationId,
    });
  } catch (err: any) {
    console.error('[OpenWA Webhook] Unhandled exception saat menangani webhook:', err?.message || err);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error: Unexpected error processing webhook',
    });
  }
}

/**
 * Pipeline pemrosesan event payload webhook OpenWA dengan pengamanan in-flight lock,
 * deduplikasi persisten, dan resolusi tenant ketat.
 */
export async function processOpenWaWebhookPayload(
  payload: any,
  options?: ProcessOpenWaOptions
): Promise<ProcessOpenWaResult> {
  if (!payload || typeof payload !== 'object') {
    return { success: false, status: 'error', reason: 'Payload must be an object' };
  }

  // 1. Validasi Event yang didukung
  if (!payload.event || typeof payload.event !== 'string') {
    return { success: false, status: 'error', reason: 'Missing or invalid event field' };
  }

  if (payload.event !== 'message.received') {
    return { success: true, status: 'ignored', reason: `Unsupported event type: "${payload.event}"` };
  }

  // 2. Validasi Session ID
  const configuredSessionId = config.openwaSessionId || process.env.OPENWA_SESSION_ID || '';
  if (configuredSessionId && payload.sessionId && payload.sessionId !== configuredSessionId) {
    return {
      success: false,
      status: 'error',
      reason: `Session ID mismatch: expected "${configuredSessionId}", received "${payload.sessionId}"`,
    };
  }

  // 3. Validasi Data Pesan
  const data = payload.data;
  if (!data || typeof data !== 'object') {
    return { success: false, status: 'error', reason: 'Missing data object in payload' };
  }

  const messageId = String(data.id || '');
  if (!messageId) {
    return { success: false, status: 'error', reason: 'Missing data.id message identifier' };
  }

  // 4. Filter Pesan dari Bot Sendiri (fromMe: true)
  if (data.fromMe === true) {
    return { success: true, status: 'ignored', messageId, reason: 'from_me' };
  }

  // 5. Filter Pesan Grup atau Newsletter
  const fromStr = String(data.from || '');
  const chatStr = String(data.chatId || '');
  if (data.isGroup === true || fromStr.endsWith('@g.us') || chatStr.endsWith('@g.us') || fromStr.endsWith('@newsletter')) {
    return { success: true, status: 'ignored', messageId, reason: 'group_message' };
  }

  // 6. Normalisasi Sender Phone & Perlindungan JID @lid
  if (fromStr.endsWith('@lid') && chatStr.endsWith('@lid')) {
    console.warn(`[OpenWA Webhook] Pesan ${messageId} dari @lid diabaikan: tidak ada pemetaan nomor telepon E.164.`);
    return { success: true, status: 'ignored', messageId, reason: 'unsupported_lid_sender' };
  }

  const candidatePhone = !fromStr.endsWith('@lid') ? fromStr : chatStr;
  const rawPhone = candidatePhone.includes('@') ? candidatePhone.split('@')[0] : candidatePhone;
  let cleanPhone = rawPhone.replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.slice(1);
  }

  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    return { success: false, status: 'error', messageId, reason: `Invalid sender phone format (length: ${cleanPhone.length})` };
  }

  // 7. IN-FLIGHT CONCURRENCY LOCK
  // Cegah dua webhook dengan messageId sama diproses bersamaan dalam satu instance
  if (inFlightOpenWaMessageIds.has(messageId)) {
    console.log(`[OpenWA Webhook] Pesan ${messageId} sedang dalam pemrosesan (In-Flight Lock aktif).`);
    return { success: true, status: 'duplicate', messageId, reason: 'in_flight_lock' };
  }

  inFlightOpenWaMessageIds.add(messageId);

  try {
    // 8. Resolusi Organisasi Dini (Isolasi Multi-Tenant Ketat)
    // Organisasi harus diketahui sebelum melakukan pengecekan data di database.
    const resolvedOrgId = await resolveOpenWaOrganization(payload.sessionId, options);
    if (!resolvedOrgId) {
      console.warn(`[OpenWA Webhook] Tidak dapat memetakan organisasi untuk sesi ${payload.sessionId}. Pesan ditolak demi keamanan tenant.`);
      return { success: false, status: 'error', messageId, reason: 'unmapped_session_organization' };
    }

    // 9. Ekstraksi Teks Pesan
    let textBody = '';
    if (typeof data.body === 'string') {
      textBody = data.body.trim();
    } else if (typeof data.text === 'string') {
      textBody = data.text.trim();
    }

    if (!textBody) {
      return { success: true, status: 'ignored', messageId, reason: 'empty_text_body' };
    }

    // 10. Deduplikasi Idempotensi In-Memory
    if (processedOpenWaWebhookIds.has(messageId)) {
      console.log(`[OpenWA Webhook] Pesan duplikat ${messageId} diabaikan (In-Memory Dedup).`);
      return { success: true, status: 'duplicate', messageId, reason: 'in_memory_duplicate' };
    }

    console.log(`[OpenWA Webhook] Pesan masuk diterima (Org: ${resolvedOrgId}, MsgId: ${messageId}, Phone: +${maskPhone(cleanPhone)}, Length: ${textBody.length} chars)`);

    // 11. Inisialisasi Klien & Delegate Pemulihan
    const supabase = options?.supabaseClient || openWaWebhookTestHooks.supabaseClient || (openWaWebhookTestHooks.customPersistFn ? null : createWorkerSupabaseClient());
    const claimFn = options?.customClaimFn || openWaWebhookTestHooks.customClaimFn || (async (org: string, id: string) => {
      if (!supabase) return { claimed: true, leaseToken: 'mock-lease-token', currentStatus: 'processing' as AiProcessingStatus };
      return claimInboundMessageForAi(org, id, options?.lockTimeoutMs, supabase);
    });
    const markDispatchFn = options?.customMarkDispatchFn || openWaWebhookTestHooks.customMarkDispatchFn || (async (org: string, id: string, token: string) => {
      if (!supabase) return true;
      return markInboundMessageDispatching(org, id, token, supabase);
    });
    const updateStatusFn = options?.customUpdateStatusFn || openWaWebhookTestHooks.customUpdateStatusFn || (async (org: string, id: string, st: AiProcessingStatus, token?: string) => {
      if (!supabase) return true;
      return updateInboundMessageAiStatus(org, id, st, token, supabase);
    });
    const getReplyFn = options?.customGetReplyFn || openWaWebhookTestHooks.customGetReplyFn || (async (org: string, id: string) => {
      if (!supabase) return null;
      return getOutboundReplyForInbound(org, id, supabase);
    });

    let inboundDbId: string | null = null;
    let conversationId: string | null = null;
    let isExistingInbound = false;
    let currentLeaseToken: string | undefined;

    // 12. Pengecekan Database & Penanganan Pemulihan (Recovery)
    if (supabase) {
      try {
        const { data: existingMsg } = await supabase
          .from('messages')
          .select('id, conversation_id, ai_status, ai_locked_at')
          .eq('organization_id', resolvedOrgId)
          .eq('provider_type', options?.providerType || 'openwa')
          .eq('provider_message_id', messageId)
          .maybeSingle();

        if (existingMsg && existingMsg.id) {
          isExistingInbound = true;
          inboundDbId = existingMsg.id;
          conversationId = existingMsg.conversation_id;

          // A. Cek apakah sudah ada balasan spesifik untuk pesan masuk ini via reply_to_message_id
          const existingReply = await getReplyFn(resolvedOrgId, existingMsg.id);
          if (existingReply) {
            console.log(`[OpenWA Webhook] Pesan duplikat ${messageId} sudah memiliki balasan keluar (Reply ID: ${existingReply.id}). Mengabaikan pemrosesan ulang.`);
            processedOpenWaWebhookIds.add(messageId);
            await updateStatusFn(resolvedOrgId, existingMsg.id, 'completed');
            return { success: true, status: 'duplicate', messageId, conversationId: conversationId || undefined, reason: 'already_completed' };
          }

          // B. Evaluasi status pemrosesan saat ini
          const currentStatus: AiProcessingStatus = existingMsg.ai_status || 'completed';

          if (currentStatus === 'completed') {
            console.log(`[OpenWA Webhook] Pesan duplikat ${messageId} sudah berstatus 'completed' di database.`);
            processedOpenWaWebhookIds.add(messageId);
            return { success: true, status: 'duplicate', messageId, conversationId: conversationId || undefined, reason: 'already_completed' };
          }

          if (currentStatus === 'needs_reconciliation') {
            console.warn(`[OpenWA Webhook] Pesan ${messageId} berstatus 'needs_reconciliation' (pengiriman sebelumnya tidak terkonfirmasi). Retry otomatis dihentikan demi keamanan.`);
            return { success: true, status: 'duplicate', messageId, conversationId: conversationId || undefined, reason: 'needs_reconciliation' };
          }

          // C. Status 'pending' atau 'processing' stale -> Coba klaim untuk pemulihan crash
          const claim = await claimFn(resolvedOrgId, existingMsg.id);
          if (!claim.claimed) {
            console.log(`[OpenWA Webhook] Pesan ${messageId} tidak dapat diklaim: ${claim.reason}. Menolak eksekusi paralel.`);
            return { success: true, status: 'duplicate', messageId, conversationId: conversationId || undefined, reason: claim.reason || 'in_progress_lock' };
          }

          currentLeaseToken = claim.leaseToken;
          console.log(`[OpenWA Webhook] Pemulihan crash: Pesan ${messageId} (ID DB: ${existingMsg.id}) berhasil diklaim untuk diproses (Lease: ${currentLeaseToken || 'none'}).`);
        }
      } catch (dbErr: any) {
        console.warn(`[OpenWA Webhook] Error saat pemeriksaan database idempotensi:`, dbErr?.message || dbErr);
      }
    }

    // 13. Persistensi Pesan Baru (Jika belum ada di database)
    if (!isExistingInbound) {
      if (options?.mockPersistFail || (payload as any)?.mockPersistFail) {
        console.error(`[OpenWA Webhook Mock] Simulasi kegagalan persistensi database untuk pesan ${messageId}.`);
        return { success: false, status: 'error', messageId, reason: 'persistence_failed' };
      }

      const msgTimestamp = typeof data.timestamp === 'number' ? data.timestamp * 1000 : Date.now();
      let persistResult: InboundMessageResult | null = null;
      const persistFn = options?.customPersistFn || openWaWebhookTestHooks.customPersistFn;

      if (persistFn) {
        persistResult = await persistFn({
          orgId: resolvedOrgId,
          senderPhone: cleanPhone,
          senderName: data.pushName || undefined,
          textBody,
          messageTimestamp: msgTimestamp,
          providerType: options?.providerType || 'openwa',
          providerMessageId: messageId,
          aiStatus: 'pending',
        });

        if (!persistResult) {
          console.error(`[OpenWA Webhook] Gagal menyimpan pesan ${messageId} via customPersistFn.`);
          return { success: false, status: 'error', messageId, reason: 'persistence_failed' };
        }
      } else if (supabase) {
        persistResult = await persistInboundWhatsAppMessage(
          {
            orgId: resolvedOrgId,
            senderPhone: cleanPhone,
            senderName: data.pushName || undefined,
            textBody,
            messageTimestamp: msgTimestamp,
            providerType: options?.providerType || 'openwa',
            providerMessageId: messageId,
            aiStatus: 'pending',
          },
          supabase
        );

        if (!persistResult) {
          console.error(`[OpenWA Webhook] Gagal menyimpan pesan ${messageId} ke database secara persisten.`);
          return { success: false, status: 'error', messageId, reason: 'persistence_failed' };
        }
      }

      inboundDbId = persistResult?.messageId || null;
      conversationId = persistResult?.conversationId || null;

      // Klaim pesan yang baru dibuat untuk pemrosesan AI dan ambil lease token
      if (inboundDbId) {
        const claim = await claimFn(resolvedOrgId, inboundDbId);
        if (!claim || !claim.claimed) {
          console.log(`[OpenWA Webhook] Pesan ${messageId} tidak dapat diklaim: ${claim?.reason || 'unclaimed'}. Menolak eksekusi paralel.`);
          return {
            success: true,
            status: 'duplicate',
            messageId,
            conversationId: conversationId || undefined,
            reason: claim?.reason || 'in_progress_lock',
          };
        }
        currentLeaseToken = claim.leaseToken;
      }
    }

    // 14. Eksekusi Intent Detection, CS Handoff & Balasan AI
    const convId = conversationId || 'conv-mock-openwa-001';
    let handoffTriggered = false;
    let aiReplied = false;

    const intentResult = detectRegistrationIntent(textBody);
    if (intentResult.intent === 'registration_intent' && !options?.skipHandoff) {
      handoffTriggered = true;
      console.log(`[OpenWA Webhook Intent] Niat pendaftaran terdeteksi dari +${maskPhone(cleanPhone)}.`);

      // Verifikasi lease fencing sebelum dispatch ke CS / gateway WhatsApp (Pre-Dispatch Check)
      if (inboundDbId) {
        if (!currentLeaseToken) {
          console.warn(`[OpenWA Webhook Handoff] Fencing: Tidak ada lease token aktif untuk pesan ${messageId}. Menghentikan pengiriman.`);
          return {
            success: false,
            status: 'duplicate',
            messageId,
            conversationId: convId,
            reason: 'lease_lost_before_dispatch',
          };
        }
        const canDispatch = await markDispatchFn(resolvedOrgId, inboundDbId, currentLeaseToken);
        if (!canDispatch) {
          console.warn(`[OpenWA Webhook Handoff] Fencing: Lease token kedaluwarsa atau hilang sebelum handoff dispatch untuk ${messageId}. Menghentikan pengiriman.`);
          return {
            success: false,
            status: 'duplicate',
            messageId,
            conversationId: convId,
            reason: 'lease_lost_before_dispatch',
          };
        }
      }

      const profile = getActiveProfile();
      const sendFn = options?.customSendFn || openWaWebhookTestHooks.customSendFn;
      const handoffRes = await executeRegistrationHandoff({
        orgId: resolvedOrgId,
        conversationId: convId,
        customerPhone: cleanPhone,
        customerName: data.pushName || undefined,
        promptText: textBody,
        profile,
        sendWhatsAppMessageFn: sendFn || (async (to, txt) => {
          const res = await openwaProvider.sendMessage({
            organizationId: resolvedOrgId,
            recipientPhone: to,
            text: txt,
          });
          return {
            success: res.success,
            messageId: res.providerMessageId ? String(res.providerMessageId) : undefined,
            error: res.error,
          };
        }),
      });

      // Kirim pesan konfirmasi ke calon pendaftar jika ada replyText
      if (handoffRes && handoffRes.replyText && handoffRes.replyText.trim()) {
        const replyTxt = handoffRes.replyText.trim();

        let custRes: { success: boolean; messageId?: string; error?: string; errorCode?: string | number };
        if (sendFn) {
          custRes = await sendFn(cleanPhone, replyTxt);
        } else {
          const res = await openwaProvider.sendMessage({
            organizationId: resolvedOrgId,
            recipientPhone: cleanPhone,
            text: replyTxt,
          });
          custRes = {
            success: res.success,
            messageId: res.providerMessageId ? String(res.providerMessageId) : undefined,
            error: res.error,
            errorCode: res.errorCode,
          };
        }

        if (custRes.success) {
          // Simpan outbound dengan atribusi replyToMessageId
          if (custRes.messageId && inboundDbId && supabase && !openWaWebhookTestHooks.customPersistFn) {
            await persistOutboundWhatsAppMessage(
              resolvedOrgId,
              convId,
              replyTxt,
              'bot',
              options?.providerType || 'openwa',
              custRes.messageId,
              inboundDbId,
              supabase
            );
          }
          if (inboundDbId) {
            await updateStatusFn(resolvedOrgId, inboundDbId, 'completed', currentLeaseToken);
          }
          processedOpenWaWebhookIds.add(messageId);
        } else if (isUnknownDeliveryError(custRes)) {
          if (inboundDbId) {
            await updateStatusFn(resolvedOrgId, inboundDbId, 'needs_reconciliation', currentLeaseToken);
          }
          console.warn(`[OpenWA Webhook] Hasil pengiriman handoff ke +${maskPhone(cleanPhone)} tidak diketahui (timeout). Status ditandai 'needs_reconciliation'.`);
        } else {
          if (inboundDbId) {
            await updateStatusFn(resolvedOrgId, inboundDbId, 'failed', currentLeaseToken);
          }
        }
      }
    } else if (!options?.skipAi) {
      const aiResult = await generateWhatsAppAiReply(textBody, cleanPhone);
      if (aiResult && aiResult.text && aiResult.text.trim()) {
        aiReplied = true;
        console.log(`[OpenWA Webhook AI] Mengirim balasan otomatis ke +${maskPhone(cleanPhone)}...`);

        const botReply = aiResult.text.trim();

        // Verifikasi lease fencing sebelum dispatch ke gateway WhatsApp (Pre-Dispatch Check)
        if (inboundDbId) {
          if (!currentLeaseToken) {
            console.warn(`[OpenWA Webhook AI] Fencing: Tidak ada lease token aktif untuk pesan ${messageId}. Menghentikan pengiriman.`);
            return {
              success: false,
              status: 'duplicate',
              messageId,
              conversationId: convId,
              reason: 'lease_lost_before_dispatch',
            };
          }
          const canDispatch = await markDispatchFn(resolvedOrgId, inboundDbId, currentLeaseToken);
          if (!canDispatch) {
            console.warn(`[OpenWA Webhook AI] Fencing: Lease token kedaluwarsa atau hilang sebelum dispatch untuk ${messageId}. Menghentikan pengiriman.`);
            return {
              success: false,
              status: 'duplicate',
              messageId,
              conversationId: convId,
              reason: 'lease_lost_before_dispatch',
            };
          }
        }

        let sendRes: { success: boolean; messageId?: string; error?: string; errorCode?: string | number };
        const sendFn = options?.customSendFn || openWaWebhookTestHooks.customSendFn;

        if (sendFn) {
          sendRes = await sendFn(cleanPhone, botReply);
        } else {
          const res = await openwaProvider.sendMessage({
            organizationId: resolvedOrgId,
            recipientPhone: cleanPhone,
            text: botReply,
          });
          sendRes = {
            success: res.success,
            messageId: res.providerMessageId ? String(res.providerMessageId) : undefined,
            error: res.error,
            errorCode: res.errorCode,
          };
        }

        if (sendRes.success) {
          // Simpan outbound dengan atribusi replyToMessageId
          if (sendRes.messageId && inboundDbId && supabase && !openWaWebhookTestHooks.customPersistFn) {
            await persistOutboundWhatsAppMessage(
              resolvedOrgId,
              convId,
              botReply,
              'bot',
              options?.providerType || 'openwa',
              sendRes.messageId,
              inboundDbId,
              supabase
            );
          }
          if (inboundDbId) {
            await updateStatusFn(resolvedOrgId, inboundDbId, 'completed', currentLeaseToken);
          }
          processedOpenWaWebhookIds.add(messageId);
        } else if (isUnknownDeliveryError(sendRes)) {
          if (inboundDbId) {
            await updateStatusFn(resolvedOrgId, inboundDbId, 'needs_reconciliation', currentLeaseToken);
          }
          console.warn(`[OpenWA Webhook] Hasil pengiriman balasan AI ke +${maskPhone(cleanPhone)} tidak diketahui (timeout). Status ditandai 'needs_reconciliation'.`);
        } else {
          if (inboundDbId) {
            await updateStatusFn(resolvedOrgId, inboundDbId, 'failed', currentLeaseToken);
          }
        }
      }
    }

    // Tandai selesai jika skipAi/skipHandoff aktif atau tidak ada pesan keluar yang perlu dikirim
    if (options?.skipAi || options?.skipHandoff || (!aiReplied && !handoffTriggered)) {
      if (inboundDbId) {
        await updateStatusFn(resolvedOrgId, inboundDbId, 'completed', currentLeaseToken);
      }
      processedOpenWaWebhookIds.add(messageId);
    }

    if (processedOpenWaWebhookIds.size > 2000) {
      const first = processedOpenWaWebhookIds.values().next().value;
      if (first) processedOpenWaWebhookIds.delete(first);
    }

    return {
      success: true,
      status: 'processed',
      messageId,
      conversationId: convId,
      senderPhone: cleanPhone,
      intent: intentResult.intent,
      handoffTriggered,
      aiReplied,
    };
  } finally {
    // PEMBERSIHAN LOCK: Selalu bersihkan in-flight lock baik pada jalur sukses maupun gagal
    inFlightOpenWaMessageIds.delete(messageId);
  }
}
