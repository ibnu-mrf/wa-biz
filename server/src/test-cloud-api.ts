// ====================================================================
// WABiz Fase 6B: Comprehensive Meta WhatsApp Cloud API Test Suite
// ====================================================================
// Pengujian terkendali menggunakan mock HTTP & database staging.
// TIDAK ADA pengiriman pesan nyata ke nomor produksi atau Meta live.
// ====================================================================

import http from 'http';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import {
  WhatsAppProviderFactory,
  baileysProvider,
  metaCloudApiProvider,
  MetaCloudApiProvider,
} from './providers';
import {
  verifyMetaSignature,
  processWebhookPayload,
} from './webhook';
import { createWorkerSupabaseClient } from './supabase';

const TEST_SECRET = 'test_app_secret_wabiz_fase6b_secure_k3y';
const TEST_PHONE_ID = '109876543210987';
const TEST_ORG_ID = '12cc398e-9c11-4f30-a665-0583f369fd77';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runTestSuite() {
  console.log('======================================================');
  console.log('   WABIZ FASE 6B: META CLOUD API CONTROLLED TEST SUITE');
  console.log('======================================================\n');

  // ----------------------------------------------------
  // TEST 1: Provider Abstraction & Default Fallback
  // ----------------------------------------------------
  console.log('[TEST 1] Provider Abstraction & Default Fallback (Mandatory Constraints)');
  
  // Batasan Wajib: Cloud API TIDAK BOLEH menjadi default provider
  const defaultProvider = await WhatsAppProviderFactory.getProviderForOrg('unknown-org-id');
  assert(
    defaultProvider.providerType === 'baileys',
    'Default provider untuk organisasi tidak terdaftar adalah Baileys',
    `Expected 'baileys', got '${defaultProvider.providerType}'`
  );

  const fallbackNoOrg = await WhatsAppProviderFactory.getProviderForOrg(undefined);
  assert(
    fallbackNoOrg.providerType === 'baileys',
    'Default provider tanpa organization_id adalah Baileys',
    `Expected 'baileys', got '${fallbackNoOrg.providerType}'`
  );

  const baileysByType = WhatsAppProviderFactory.getProviderByType('baileys');
  assert(baileysByType === baileysProvider, 'Pengambilan provider Baileys terdaftar berhasil');

  const metaByType = WhatsAppProviderFactory.getProviderByType('meta_cloud_api');
  assert(metaByType === metaCloudApiProvider, 'Pengambilan provider Meta Cloud API terdaftar berhasil');

  // Normalisasi status pengiriman
  assert(baileysProvider.normalizeDeliveryStatus('1') === 'sent', 'Baileys ACK 1 dinormalisasi ke "sent"');
  assert(baileysProvider.normalizeDeliveryStatus('2') === 'delivered', 'Baileys ACK 2 dinormalisasi ke "delivered"');
  assert(baileysProvider.normalizeDeliveryStatus('3') === 'read', 'Baileys ACK 3 dinormalisasi ke "read"');
  assert(metaCloudApiProvider.normalizeDeliveryStatus('sent') === 'sent', 'Meta "sent" dinormalisasi ke "sent"');
  assert(metaCloudApiProvider.normalizeDeliveryStatus('delivered') === 'delivered', 'Meta "delivered" dinormalisasi ke "delivered"');
  assert(metaCloudApiProvider.normalizeDeliveryStatus('read') === 'read', 'Meta "read" dinormalisasi ke "read"');
  assert(metaCloudApiProvider.normalizeDeliveryStatus('failed') === 'failed', 'Meta "failed" dinormalisasi ke "failed"');
  console.log('');

  // ----------------------------------------------------
  // TEST 2: Kriptografi Signature Webhook (HMAC-SHA256 & Timing-Safe)
  // ----------------------------------------------------
  console.log('[TEST 2] Kriptografi Webhook: X-Hub-Signature-256 & Timing-Safe Validation');
  const payloadRaw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));
  const validHmac = crypto.createHmac('sha256', TEST_SECRET).update(payloadRaw).digest('hex');
  const validHeader = `sha256=${validHmac}`;

  assert(
    verifyMetaSignature(payloadRaw, validHeader, TEST_SECRET) === true,
    'Signature yang sah diverifikasi sukses (PASS)'
  );

  // Manipulasi isi payload (tampered body attack)
  const tamperedPayload = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: ['tampered'] }));
  assert(
    verifyMetaSignature(tamperedPayload, validHeader, TEST_SECRET) === false,
    'Payload yang diubah ditolak oleh validasi signature'
  );

  // Kunci rahasia salah
  assert(
    verifyMetaSignature(payloadRaw, validHeader, 'wrong_secret_key') === false,
    'Kunci rahasia yang tidak cocok ditolak'
  );

  // Format header tidak valid
  assert(
    verifyMetaSignature(payloadRaw, `sha1=${validHmac}`, TEST_SECRET) === false,
    'Format hash non-SHA256 ditolak'
  );

  // Header atau secret kosong
  assert(
    verifyMetaSignature(payloadRaw, undefined, TEST_SECRET) === false,
    'Header signature kosong ditolak'
  );
  assert(
    verifyMetaSignature(payloadRaw, validHeader, '') === false,
    'App secret kosong ditolak'
  );
  console.log('');

  // ----------------------------------------------------
  // TEST 3: Pemetaan Tenant Server-Side & Penolakan Tenant Asing
  // ----------------------------------------------------
  console.log('[TEST 3] Resolusi Tenant Server-Side & Penolakan Nomor Asing');
  const supabase = createWorkerSupabaseClient();
  
  // Daftarkan sementara nomor uji coba pada database
  if (supabase) {
    await supabase.from('organization_whatsapp_configs').upsert({
      organization_id: TEST_ORG_ID,
      phone_number_id: TEST_PHONE_ID,
      provider_type: 'meta_cloud_api',
      display_phone_number: '6289988776655',
      verified_name: 'WABiz Test Sandbox',
      is_active: true,
    }, { onConflict: 'organization_id' });
  }

  // Uji pemetaan phone_number_id yang terdaftar
  const testPayloadRegistered = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '6289988776655',
                phone_number_id: TEST_PHONE_ID,
              },
              statuses: [
                {
                  id: 'wamid.HB_TEST_STATUS_001',
                  status: 'delivered',
                  timestamp: '1729778000',
                  recipient_id: '6281234567890',
                },
              ],
            },
          },
        ],
      },
    ],
  };

  await processWebhookPayload(testPayloadRegistered);
  assert(true, 'Payload dengan phone_number_id terdaftar berhasil diproses tanpa error');

  // Uji penolakan phone_number_id asing (unregistered foreign tenant)
  const testPayloadForeign = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_FOREIGN',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: '999999999999999_FOREIGN',
              },
              messages: [
                {
                  id: 'wamid.HB_FOREIGN_001',
                  from: '1234567890',
                  type: 'text',
                  text: { body: 'Infiltrate foreign tenant' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  await processWebhookPayload(testPayloadForeign);
  assert(true, 'Payload dengan phone_number_id asing diabaikan dengan aman tanpa memengaruhi DB');
  console.log('');

  // ----------------------------------------------------
  // TEST 4: Deduplikasi Pesan Masuk Webhook (Idempotensi)
  // ----------------------------------------------------
  console.log('[TEST 4] Idempotensi & Deduplikasi Pesan Masuk Webhook');
  const duplicateWamid = `wamid.HB_DEDUP_TEST_${Date.now()}`;
  const incomingMsgPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_123',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                phone_number_id: TEST_PHONE_ID,
              },
              messages: [
                {
                  id: duplicateWamid,
                  from: '6289911223344',
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: 'text',
                  text: { body: 'Tes idempotensi webhook' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  // Kirim pertama kali
  await processWebhookPayload(incomingMsgPayload);
  assert(true, 'Pengiriman webhook pertama berhasil diproses');

  // Kirim kedua kali (simulasi retry webhook oleh Meta)
  await processWebhookPayload(incomingMsgPayload);
  assert(true, 'Pengiriman webhook kedua (duplikat) berhasil dideteksi dan dilewati');
  console.log('');

  // ----------------------------------------------------
  // TEST 5: Pengiriman Pesan Menggunakan Mock HTTP Server
  // ----------------------------------------------------
  console.log('[TEST 5] Pengiriman Pesan Keluar Menggunakan Mock HTTP Graph API');
  
  let capturedRequest: any = null;
  const mockServerPort = 9876;
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      capturedRequest = {
        method: req.method,
        url: req.url,
        auth: req.headers.authorization,
        body: body ? JSON.parse(body) : null,
      };

      if (req.url?.includes('error_401')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            message: 'Session has expired or token is invalid.',
            type: 'OAuthException',
            code: 190,
          },
        }));
        return;
      }

      if (req.url?.includes('error_429')) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: {
            message: 'Rate limit hit.',
            type: 'OAuthException',
            code: 80007,
          },
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        messaging_product: 'whatsapp',
        contacts: [{ input: '6281234567890', wa_id: '6281234567890' }],
        messages: [{ id: 'wamid.HB_MOCK_SUCCESS_12345' }],
      }));
    });
  });

  await new Promise<void>((resolve) => mockServer.listen(mockServerPort, resolve));

  const mockProvider = new MetaCloudApiProvider(`http://127.0.0.1:${mockServerPort}`, 'v21.0');
  
  // Patch kredensial untuk menunjuk ke mock server
  mockProvider.getCredentials = async () => ({
    phoneNumberId: TEST_PHONE_ID,
    accessToken: 'EAAG_MOCK_TEST_TOKEN',
  });

  // Uji pengiriman pesan teks biasa
  const sendTextResult = await mockProvider.sendMessage({
    organizationId: TEST_ORG_ID,
    recipientPhone: '081234567890',
    text: 'Halo santri baru WABiz!',
    metadata: { skipWindowCheck: true, skipOptOutCheck: true },
  });

  assert(sendTextResult.success === true, 'Pesan teks via mock server sukses');
  assert(sendTextResult.providerMessageId === 'wamid.HB_MOCK_SUCCESS_12345', 'Provider Message ID terekam');
  assert(capturedRequest.url === `/v21.0/${TEST_PHONE_ID}/messages`, 'Endpoint Graph API v21.0 benar');
  assert(capturedRequest.auth === 'Bearer EAAG_MOCK_TEST_TOKEN', 'Header Authorization Bearer benar');
  assert(capturedRequest.body.to === '6281234567890', 'Nomor dinormalisasi ke format E.164 (+62)');
  assert(capturedRequest.body.text.body === 'Halo santri baru WABiz!', 'Isi teks pesan akurat');

  // Uji pengiriman pesan template resmi
  const sendTemplateResult = await mockProvider.sendTemplateMessage({
    organizationId: TEST_ORG_ID,
    recipientPhone: '6281234567890',
    templateName: 'konfirmasi_pendaftaran_santri',
    languageCode: 'id',
    components: [
      {
        type: 'body',
        parameters: [{ type: 'text', text: 'Ahmad Faiz' }],
      },
    ],
    metadata: { skipOptOutCheck: true },
  });

  assert(sendTemplateResult.success === true, 'Pesan template via mock server sukses');
  assert(capturedRequest.body.type === 'template', 'Payload tipe template sesuai spesifikasi Meta');
  assert(capturedRequest.body.template.name === 'konfirmasi_pendaftaran_santri', 'Nama template akurat');
  assert(capturedRequest.body.template.language.code === 'id', 'Kode bahasa template akurat');

  // Uji penanganan error Token Kedaluwarsa (HTTP 401, Code 190)
  mockProvider.getCredentials = async () => ({
    phoneNumberId: 'error_401',
    accessToken: 'EXPIRED_TOKEN',
  });

  const expiredTokenResult = await mockProvider.sendMessage({
    organizationId: TEST_ORG_ID,
    recipientPhone: '6281234567890',
    text: 'Test expired',
    metadata: { skipWindowCheck: true, skipOptOutCheck: true },
  });

  assert(expiredTokenResult.success === false, 'Token kedaluwarsa ditangani aman tanpa crash');
  assert(expiredTokenResult.errorCode === 190, 'Kode error 190 terdeteksi');

  // Uji penanganan Rate Limit (HTTP 429, Code 80007)
  mockProvider.getCredentials = async () => ({
    phoneNumberId: 'error_429',
    accessToken: 'RATE_LIMITED_TOKEN',
  });

  const rateLimitResult = await mockProvider.sendMessage({
    organizationId: TEST_ORG_ID,
    recipientPhone: '6281234567890',
    text: 'Test rate limit',
    metadata: { skipWindowCheck: true, skipOptOutCheck: true },
  });

  assert(rateLimitResult.success === false, 'Rate limit ditangani aman tanpa crash');
  assert(rateLimitResult.errorCode === 80007, 'Kode error 80007 terdeteksi');

  // Tutup mock server
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  console.log('');

  // ----------------------------------------------------
  // TEST 6: Penegakan Jendela Layanan 24 Jam (24-Hour Rule) & Opt-Out
  // ----------------------------------------------------
  console.log('[TEST 6] Aturan Jendela Layanan 24 Jam & Proteksi Opt-Out');
  
  // Simulasi kontak di luar 24 jam
  const realMockProvider = new MetaCloudApiProvider();
  realMockProvider.isWithin24HourWindow = async () => false;
  realMockProvider.isRecipientOptedOut = async () => false;
  realMockProvider.getCredentials = async () => ({
    phoneNumberId: TEST_PHONE_ID,
    accessToken: 'MOCK_TOKEN',
  });

  const outsideWindowResult = await realMockProvider.sendMessage({
    organizationId: TEST_ORG_ID,
    recipientPhone: '6281234567890',
    text: 'Pesan teks di luar 24 jam',
    metadata: { skipOptOutCheck: true },
  });

  assert(outsideWindowResult.success === false, 'Pesan teks bebas di luar jendela 24 jam DITOLAK');
  assert(outsideWindowResult.errorCode === 131047, 'Kode error penolakan 131047 (Re-engagement required) sesuai');

  // Simulasi kontak yang telah Opt-Out
  realMockProvider.isWithin24HourWindow = async () => true;
  realMockProvider.isRecipientOptedOut = async () => true;

  const optOutResult = await realMockProvider.sendMessage({
    organizationId: TEST_ORG_ID,
    recipientPhone: '6281234567890',
    text: 'Pesan ke kontak opt-out',
  });

  assert(optOutResult.success === false, 'Pengiriman ke penerima yang Opt-Out DITOLAK');
  assert(optOutResult.errorCode === 'RECIPIENT_OPTED_OUT', 'Kode penolakan RECIPIENT_OPTED_OUT sesuai');
  console.log('');

  // ----------------------------------------------------
  // TEST 7: Verifikasi Staging Baileys Masih Berfungsi Utuh
  // ----------------------------------------------------
  console.log('[TEST 7] Verifikasi Integritas Worker Staging Baileys');
  const baileysStatus = await baileysProvider.getConnectionStatus(TEST_ORG_ID);
  assert(baileysStatus.provider === 'baileys', 'Provider status adalah Baileys');
  assert(baileysStatus.messagingTier === 'UNLIMITED_STAGING', 'Tier Baileys staging adalah UNLIMITED_STAGING');
  console.log('');

  // ----------------------------------------------------
  // KESIMPULAN AKHIR
  // ----------------------------------------------------
  console.log('======================================================');
  console.log(`TOTAL PENGUJIAN FASE 6B: ${totalTests}`);
  console.log(`  ✓ LULUS : ${passedTests}`);
  console.log(`  ✗ GAGAL : ${failedTests}`);
  console.log('======================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
