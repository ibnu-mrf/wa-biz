// ====================================================================
// WABiz OpenWA Provider Isolated Unit Test Suite (Mock HTTP)
// ====================================================================
// Pengujian terisolasi penuh: Menggunakan local mock HTTP server.
// Tidak pernah menghubungi service OpenWA sungguhan.
// ====================================================================

import http from 'http';
import { AddressInfo } from 'net';
import {
  OpenWAProvider,
  normalizeChatId,
  WhatsAppProviderFactory,
  baileysProvider,
} from './providers';

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

// Handler tipe untuk mock HTTP server
interface MockRouteResponse {
  statusCode: number;
  headers?: Record<string, string>;
  body: any;
  delayMs?: number;
}

let nextMockResponse: MockRouteResponse = {
  statusCode: 200,
  body: {},
};

let lastReceivedRequest: {
  method?: string;
  url?: string;
  headers: http.IncomingHttpHeaders;
  body?: any;
} = { headers: {} };

async function runOpenWATests() {
  console.log('======================================================');
  console.log('   WABIZ: OPENWA PROVIDER ISOLATED UNIT TEST SUITE   ');
  console.log('======================================================\n');

  // ------------------------------------------------------------------
  // SETUP MOCK HTTP SERVER
  // ------------------------------------------------------------------
  const mockServer = http.createServer((req, res) => {
    let bodyRaw = '';
    req.on('data', (chunk) => {
      bodyRaw += chunk;
    });

    req.on('end', async () => {
      let parsedBody: any = null;
      try {
        parsedBody = bodyRaw ? JSON.parse(bodyRaw) : null;
      } catch {
        parsedBody = bodyRaw;
      }

      lastReceivedRequest = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: parsedBody,
      };

      if (nextMockResponse.delayMs && nextMockResponse.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, nextMockResponse.delayMs));
      }

      res.writeHead(nextMockResponse.statusCode, {
        'Content-Type': 'application/json',
        ...(nextMockResponse.headers || {}),
      });
      res.end(JSON.stringify(nextMockResponse.body));
    });
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = mockServer.address() as AddressInfo;
  const mockBaseUrl = `http://127.0.0.1:${address.port}`;
  const testApiKey = 'mock_openwa_api_key_test_xyz123';
  const testSessionId = 'test-session-uuid-1234';

  const provider = new OpenWAProvider({
    baseUrl: mockBaseUrl,
    apiKey: testApiKey,
    sessionId: testSessionId,
    timeoutMs: 1000,
  });

  try {
    // ------------------------------------------------------------------
    // TEST 1: Normalisasi nomor telepon dan JID (normalizeChatId)
    // ------------------------------------------------------------------
    console.log('[TEST 1] Normalisasi Format Nomor Telepon & JID');

    // 1a. Format lokal Indonesia: 08xxx -> 628xxx@c.us
    const res1a = normalizeChatId('081234567890');
    assert(res1a.chatId === '6281234567890@c.us', 'Format lokal 081234567890 dinormalisasi ke 6281234567890@c.us');

    // 1b. Format internasional: +62xxx -> 62xxx@c.us
    const res1b = normalizeChatId('+62 856-4188-6993');
    assert(res1b.chatId === '6285641886993@c.us', 'Format internasional +62 856-4188-6993 dinormalisasi ke 6285641886993@c.us');

    // 1c. Format JID @c.us yang sudah terformat
    const res1c = normalizeChatId('628111222333@c.us');
    assert(res1c.chatId === '628111222333@c.us', 'JID 628111222333@c.us tetap valid');

    // 1d. Format JID Baileys @s.whatsapp.net -> @c.us
    const res1d = normalizeChatId('628999888777@s.whatsapp.net');
    assert(res1d.chatId === '628999888777@c.us', 'JID Baileys @s.whatsapp.net dinormalisasi ke @c.us');

    // 1e. Format JID Grup (@g.us)
    const res1e = normalizeChatId('120363000000000000@g.us');
    assert(res1e.chatId === '120363000000000000@g.us', 'JID Grup 120363000000000000@g.us dipertahankan');

    // 1f. Format JID Linked Identity (@lid) - Validasi dan tidak dikonversi ke telepon
    const res1f = normalizeChatId('123456789012345@lid');
    assert(
      res1f.chatId === '123456789012345@lid',
      'JID @lid dipertahankan sebagai LID valid tanpa dianggap nomor telepon E.164'
    );

    // 1g. Validasi input invalid (terlalu pendek, non-digit, kosong)
    const res1g1 = normalizeChatId('');
    assert(Boolean(res1g1.error), 'Nomor kosong ditolak dengan pesan error');

    const res1g2 = normalizeChatId('12345'); // < 8 digit
    assert(Boolean(res1g2.error), 'Nomor terlalu pendek (< 8 digit) ditolak');

    const res1g3 = normalizeChatId('abcdefghij');
    assert(Boolean(res1g3.error), 'Input huruf non-digit ditolak');

    const res1g4 = normalizeChatId('invalid-lid-format@lid');
    assert(Boolean(res1g4.error), 'Format @lid tidak valid (berisi non-digit) ditolak');
    console.log('');

    // ------------------------------------------------------------------
    // TEST 2: Validasi Konfigurasi Hilang (Missing Configuration)
    // ------------------------------------------------------------------
    console.log('[TEST 2] Penanganan Konfigurasi Hilang (Session ID Missing)');
    const unconfiguredProvider = new OpenWAProvider({
      baseUrl: mockBaseUrl,
      sessionId: '', // Kosong
    });

    const missingSessionRes = await unconfiguredProvider.sendMessage({
      organizationId: 'test-org-1',
      recipientPhone: '628123456789',
      text: 'Pesan tes',
    });

    assert(
      missingSessionRes.success === false && missingSessionRes.errorCode === 'SESSION_ID_MISSING',
      'Pengiriman ditolak jika Session ID OpenWA belum dikonfigurasi'
    );
    console.log('');

    // ------------------------------------------------------------------
    // TEST 3: Pengiriman Pesan Sukses (sendMessage via Mock HTTP)
    // ------------------------------------------------------------------
    console.log('[TEST 3] Pengiriman Pesan Teks Sukses (HTTP 201)');
    nextMockResponse = {
      statusCode: 201,
      body: {
        id: 'openwa_msg_test_abc123',
        chatId: '628123456789@c.us',
        body: 'Halo dunia',
        timestamp: 1729828400,
      },
    };

    const sendSuccessRes = await provider.sendMessage({
      organizationId: 'test-org-1',
      recipientPhone: '08123456789',
      text: 'Halo dunia',
    });

    assert(sendSuccessRes.success === true, 'Hasil sendMessage mengembalikan success: true');
    assert(
      sendSuccessRes.provider === 'openwa',
      `Provider adalah 'openwa' (Aktual: ${sendSuccessRes.provider})`
    );
    assert(
      sendSuccessRes.providerMessageId === 'openwa_msg_test_abc123',
      `providerMessageId sesuai respon OpenWA (Aktual: ${sendSuccessRes.providerMessageId})`
    );
    assert(
      lastReceivedRequest.headers['x-api-key'] === testApiKey,
      'Request menyertakan header x-api-key yang sesuai'
    );
    assert(
      lastReceivedRequest.url === `/api/sessions/${testSessionId}/messages/send-text`,
      `Request ditujukan ke endpoint session yang benar (${lastReceivedRequest.url})`
    );
    assert(
      lastReceivedRequest.body?.chatId === '628123456789@c.us',
      `Payload chatId ternormalisasi ke 628123456789@c.us (Aktual: ${lastReceivedRequest.body?.chatId})`
    );
    console.log('');

    // ------------------------------------------------------------------
    // TEST 4: Penanganan HTTP Error & Keamanan Pesan Error (Redaction)
    // ------------------------------------------------------------------
    console.log('[TEST 4] Penanganan Ragam HTTP Error & Keamanan Pesan Error');

    // 4a. 400 Bad Request
    nextMockResponse = {
      statusCode: 400,
      body: { statusCode: 400, message: 'Session not active' },
    };
    const res4a = await provider.sendMessage({
      organizationId: 'test-org-1',
      recipientPhone: '628123456789',
      text: 'Tes 400',
    });
    assert(res4a.success === false, 'HTTP 400 mengembalikan success: false');
    assert(res4a.errorCode === 400, 'Error code 400 tercatat');
    assert(
      Boolean(res4a.error?.includes('OpenWA Bad Request (400)')),
      `Pesan error 400 diformat dengan aman: "${res4a.error}"`
    );

    // 4b. 401 Unauthorized - Memastikan API Key TIDAK bocor ke pesan error
    nextMockResponse = {
      statusCode: 401,
      body: { statusCode: 401, message: 'Unauthorized' },
    };
    const res4b = await provider.sendMessage({
      organizationId: 'test-org-1',
      recipientPhone: '628123456789',
      text: 'Tes 401',
    });
    assert(res4b.success === false, 'HTTP 401 mengembalikan success: false');
    assert(
      !res4b.error?.includes(testApiKey),
      'Pesan error 401 TIDAK membocorkan API key rahasia'
    );
    assert(
      Boolean(res4b.error?.includes('Unauthorized (401)')),
      `Pesan error 401 informatif: "${res4b.error}"`
    );

    // 4c. 404 Not Found
    nextMockResponse = {
      statusCode: 404,
      body: { statusCode: 404, message: 'Session not found' },
    };
    const res4c = await provider.sendMessage({
      organizationId: 'test-org-1',
      recipientPhone: '628123456789',
      text: 'Tes 404',
    });
    assert(res4c.success === false && res4c.errorCode === 404, 'HTTP 404 ditangani dengan tepat');

    // 4d. 409 Engine Conflict / Not Ready
    nextMockResponse = {
      statusCode: 409,
      body: { statusCode: 409, message: 'Engine not ready' },
    };
    const res4d = await provider.sendMessage({
      organizationId: 'test-org-1',
      recipientPhone: '628123456789',
      text: 'Tes 409',
    });
    assert(res4d.success === false && res4d.errorCode === 409, 'HTTP 409 ditangani dengan tepat');

    // 4e. 503 Service Unavailable
    nextMockResponse = {
      statusCode: 503,
      body: { statusCode: 503, message: 'WhatsApp engine send failed' },
    };
    const res4e = await provider.sendMessage({
      organizationId: 'test-org-1',
      recipientPhone: '628123456789',
      text: 'Tes 503',
    });
    assert(res4e.success === false && res4e.errorCode === 503, 'HTTP 503 ditangani dengan tepat');
    console.log('');

    // ------------------------------------------------------------------
    // TEST 5: Penanganan Request Timeout
    // ------------------------------------------------------------------
    console.log('[TEST 5] Penanganan Request Timeout');
    const timeoutProvider = new OpenWAProvider({
      baseUrl: mockBaseUrl,
      apiKey: testApiKey,
      sessionId: testSessionId,
      timeoutMs: 80, // Timeout sangat singkat: 80ms
    });

    nextMockResponse = {
      statusCode: 200,
      body: { id: 'slow_msg' },
      delayMs: 200, // Server menahan respon selama 200ms
    };

    const timeoutRes = await timeoutProvider.sendMessage({
      organizationId: 'test-org-1',
      recipientPhone: '628123456789',
      text: 'Pesan lambat',
    });

    assert(timeoutRes.success === false, 'Request yang melebihi timeout dibatalkan (success: false)');
    assert(
      timeoutRes.errorCode === 'REQUEST_TIMEOUT',
      `Error code adalah REQUEST_TIMEOUT (Aktual: ${timeoutRes.errorCode})`
    );
    assert(
      Boolean(timeoutRes.error?.includes('timeout')),
      `Pesan error menjelaskan kejadian timeout: "${timeoutRes.error}"`
    );
    console.log('');

    // ------------------------------------------------------------------
    // TEST 6: Perilaku sendTemplateMessage (Anti-Klaim Sukses Palsu)
    // ------------------------------------------------------------------
    console.log('[TEST 6] sendTemplateMessage: Perilaku Sesuai Kontrak & Anti-Klaim Palsu');

    // 6a. Template dengan komponen teks yang valid -> fallback text berhasil dikirim
    nextMockResponse = {
      statusCode: 201,
      body: { id: 'tmpl_rendered_msg_001' },
      delayMs: 0,
    };

    const validTemplateRes = await provider.sendTemplateMessage({
      organizationId: 'test-org-1',
      recipientPhone: '08123456789',
      templateName: 'order_status_update',
      languageCode: 'id',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Halo Budi, pesanan Anda #1234 telah dikirim.' },
          ],
        },
      ],
    });

    assert(
      validTemplateRes.success === true,
      'sendTemplateMessage berhasil mengirimkan text fallback ketika respon HTTP 201'
    );
    assert(
      validTemplateRes.providerMessageId === 'tmpl_rendered_msg_001',
      `providerMessageId sesuai dengan balasan HTTP (${validTemplateRes.providerMessageId})`
    );
    assert(
      lastReceivedRequest.body?.text?.includes('Halo Budi, pesanan Anda #1234'),
      'Body pesan teks mengandung parameter template yang diekstrak'
    );

    // 6b. Template dengan komponen teks valid tetapi server OpenWA mengembalikan HTTP Error (misal 500)
    // JANGAN PERNAH berpura-pura berhasil!
    nextMockResponse = {
      statusCode: 500,
      body: { statusCode: 500, message: 'Internal engine failure' },
      delayMs: 0,
    };

    const failedTemplateRes = await provider.sendTemplateMessage({
      organizationId: 'test-org-1',
      recipientPhone: '08123456789',
      templateName: 'order_status_update',
      languageCode: 'id',
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: 'Tes kegagalan' }],
        },
      ],
    });

    assert(
      failedTemplateRes.success === false,
      'sendTemplateMessage TIDAK mengklaim sukses jika HTTP request gagal (success: false)'
    );
    assert(
      failedTemplateRes.errorCode === 500,
      'Error code 500 dipropagasi dengan tepat'
    );

    // 6c. Template kosong tanpa teks atau parameter
    const emptyTemplateRes = await provider.sendTemplateMessage({
      organizationId: 'test-org-1',
      recipientPhone: '08123456789',
      templateName: 'empty_template_without_params',
      languageCode: 'id',
      components: [],
    });

    assert(
      emptyTemplateRes.success === false,
      'Template tanpa parameter teks ditolak (success: false, bukan sukses palsu)'
    );
    assert(
      emptyTemplateRes.errorCode === 'TEMPLATE_TEXT_EMPTY',
      `Error code adalah TEMPLATE_TEXT_EMPTY (Aktual: ${emptyTemplateRes.errorCode})`
    );

    // 6d. Pemanggilan template dengan strictTemplate: true
    const strictTemplateRes = await provider.sendTemplateMessage({
      organizationId: 'test-org-1',
      recipientPhone: '08123456789',
      templateName: 'official_meta_hsm',
      languageCode: 'id',
      metadata: { strictTemplate: true },
    });

    assert(
      strictTemplateRes.success === false,
      'strictTemplate: true menolak pengiriman karena OpenWA bukan Meta HSM provider'
    );
    assert(
      strictTemplateRes.errorCode === 'TEMPLATE_NOT_SUPPORTED',
      `Error code TEMPLATE_NOT_SUPPORTED tercatat (Aktual: ${strictTemplateRes.errorCode})`
    );
    console.log('');

    // ------------------------------------------------------------------
    // TEST 7: Pembacaan Status Koneksi Sesi (getConnectionStatus)
    // ------------------------------------------------------------------
    console.log('[TEST 7] Status Konektivitas Sesi (getConnectionStatus)');

    // 7a. Sesi aktif (ready)
    nextMockResponse = {
      statusCode: 200,
      body: {
        id: testSessionId,
        name: 'bot-staging',
        status: 'ready',
        phone: '6285641886993',
        engine: 'baileys',
      },
      delayMs: 0,
    };

    const statusReady = await provider.getConnectionStatus('test-org-1');
    assert(statusReady.provider === 'openwa', "Provider adalah 'openwa'");
    assert(statusReady.isConnected === true, 'Sesi berstatus ready dilaporkan isConnected: true');
    assert(statusReady.qualityRating === 'GREEN', 'qualityRating adalah GREEN saat ready');
    assert(statusReady.phone === '6285641886993', `Nomor telepon teridentifikasi (${statusReady.phone})`);
    assert(
      lastReceivedRequest.url === `/api/sessions/${testSessionId}`,
      `Request status ditujukan ke GET /api/sessions/${testSessionId}`
    );

    // 7b. Sesi gagal (failed)
    nextMockResponse = {
      statusCode: 200,
      body: {
        id: testSessionId,
        name: 'bot-staging',
        status: 'failed',
        lastError: 'Session crashed',
      },
      delayMs: 0,
    };

    const statusFailed = await provider.getConnectionStatus('test-org-1');
    assert(statusFailed.isConnected === false, 'Sesi failed dilaporkan isConnected: false');
    assert(statusFailed.qualityRating === 'UNKNOWN', 'qualityRating adalah UNKNOWN saat failed');
    assert(statusFailed.details?.lastError === 'Session crashed', 'lastError tercatat di details');

    // 7c. Sesi terputus (disconnected)
    nextMockResponse = {
      statusCode: 200,
      body: {
        id: testSessionId,
        name: 'bot-staging',
        status: 'disconnected',
      },
      delayMs: 0,
    };

    const statusDisconnected = await provider.getConnectionStatus('test-org-1');
    assert(statusDisconnected.isConnected === false, 'Sesi disconnected dilaporkan isConnected: false');
    console.log('');

    // ------------------------------------------------------------------
    // TEST 8: Normalisasi Status Pengiriman (normalizeDeliveryStatus)
    // ------------------------------------------------------------------
    console.log('[TEST 8] Normalisasi Status Pengiriman (normalizeDeliveryStatus)');
    assert(provider.normalizeDeliveryStatus('0') === 'queued', "Status '0' dinormalisasi ke 'queued'");
    assert(provider.normalizeDeliveryStatus('pending') === 'queued', "Status 'pending' dinormalisasi ke 'queued'");
    assert(provider.normalizeDeliveryStatus('1') === 'sent', "Status '1' dinormalisasi ke 'sent'");
    assert(provider.normalizeDeliveryStatus('sent') === 'sent', "Status 'sent' dinormalisasi ke 'sent'");
    assert(provider.normalizeDeliveryStatus('2') === 'delivered', "Status '2' dinormalisasi ke 'delivered'");
    assert(provider.normalizeDeliveryStatus('delivered') === 'delivered', "Status 'delivered' dinormalisasi ke 'delivered'");
    assert(provider.normalizeDeliveryStatus('3') === 'read', "Status '3' dinormalisasi ke 'read'");
    assert(provider.normalizeDeliveryStatus('read') === 'read', "Status 'read' dinormalisasi ke 'read'");
    assert(provider.normalizeDeliveryStatus('failed') === 'failed', "Status 'failed' dinormalisasi ke 'failed'");
    assert(provider.normalizeDeliveryStatus('error') === 'failed', "Status 'error' dinormalisasi ke 'failed'");
    console.log('');

    // ------------------------------------------------------------------
    // TEST 9: Regression Guard: Provider Baileys & Factory Default Tidak Berubah
    // ------------------------------------------------------------------
    console.log('[TEST 9] Regression Guard Baileys & Factory Default');

    // 9a. Factory registrasi openwa
    const openwaFromFactory = WhatsAppProviderFactory.getProviderByType('openwa');
    assert(
      openwaFromFactory.providerType === 'openwa',
      "Factory berhasil mengembalikan instance openwa via getProviderByType('openwa')"
    );

    // 9b. Default Baileys untuk organisasi tanpa konfigurasi khusus
    const defaultOrgProvider = await WhatsAppProviderFactory.getProviderForOrg('unknown-dummy-org');
    assert(
      defaultOrgProvider.providerType === 'baileys',
      'getProviderForOrg() TETAP mengembalikan Baileys sebagai default/fallback'
    );

    // 9c. Baileys provider instance tidak tersentuh
    assert(
      baileysProvider.providerType === 'baileys',
      "baileysProvider.providerType tetap 'baileys'"
    );
    console.log('');

    // ------------------------------------------------------------------
    // TEST 10: Perutean Multi-Provider Terisolasi (Mock Supabase Client)
    // ------------------------------------------------------------------
    console.log('[TEST 10] Perutean Multi-Provider Terisolasi (Mock Supabase Client)');

    // Helper untuk membuat mock client Supabase query organization_whatsapp_configs
    function createMockSupabase(returnValue: { provider_type?: string; is_active?: boolean } | null, shouldThrow = false) {
      return {
        from: (table: string) => ({
          select: (_cols: string) => ({
            eq: (_col1: string, _val1: any) => ({
              eq: (_col2: string, _val2: any) => ({
                maybeSingle: async () => {
                  if (shouldThrow) throw new Error('Simulasi database timeout / failure');
                  return { data: returnValue, error: null };
                },
              }),
            }),
          }),
        }),
      };
    }

    // 10a. Organisasi dengan provider_type = 'openwa' dan is_active = true
    const mockOpenWaActive = createMockSupabase({ provider_type: 'openwa', is_active: true });
    const p1 = await WhatsAppProviderFactory.getProviderForOrg('org-openwa-1', mockOpenWaActive);
    assert(p1.providerType === 'openwa', "Konfigurasi 'openwa' aktif dialihkan ke openwaProvider");

    // 10b. Organisasi dengan provider_type = 'meta_cloud_api' dan is_active = true
    const mockMetaActive = createMockSupabase({ provider_type: 'meta_cloud_api', is_active: true });
    const p2 = await WhatsAppProviderFactory.getProviderForOrg('org-meta-1', mockMetaActive);
    assert(p2.providerType === 'meta_cloud_api', "Konfigurasi 'meta_cloud_api' aktif dialihkan ke metaCloudApiProvider");

    // 10c. Organisasi dengan openwa tetapi is_active = false -> Fallback ke Baileys
    const mockOpenWaInactive = createMockSupabase({ provider_type: 'openwa', is_active: false });
    const p3 = await WhatsAppProviderFactory.getProviderForOrg('org-openwa-inactive', mockOpenWaInactive);
    assert(p3.providerType === 'baileys', "Konfigurasi 'openwa' TIDAK aktif fallback ke baileysProvider");

    // 10d. Organisasi dengan meta_cloud_api tetapi is_active = false -> Fallback ke Baileys
    const mockMetaInactive = createMockSupabase({ provider_type: 'meta_cloud_api', is_active: false });
    const p4 = await WhatsAppProviderFactory.getProviderForOrg('org-meta-inactive', mockMetaInactive);
    assert(p4.providerType === 'baileys', "Konfigurasi 'meta_cloud_api' TIDAK aktif fallback ke baileysProvider");

    // 10e. Konfigurasi tidak ditemukan di database (null) -> Fallback ke Baileys
    const mockConfigNotFound = createMockSupabase(null);
    const p5 = await WhatsAppProviderFactory.getProviderForOrg('org-not-found', mockConfigNotFound);
    assert(p5.providerType === 'baileys', 'Konfigurasi tidak ditemukan (null) fallback ke baileysProvider');

    // 10f. Error / Exception pada query database -> Fallback ke Baileys
    const mockDbError = createMockSupabase(null, true);
    const p6 = await WhatsAppProviderFactory.getProviderForOrg('org-error', mockDbError);
    assert(p6.providerType === 'baileys', 'Error query database ditangani aman dan fallback ke baileysProvider');

    // 10g. organizationId kosong / undefined -> Fallback ke Baileys
    const p7 = await WhatsAppProviderFactory.getProviderForOrg(undefined, mockOpenWaActive);
    assert(p7.providerType === 'baileys', 'organizationId undefined langsung fallback ke baileysProvider');

    console.log('');
  } finally {
    // Tutup mock HTTP server dengan bersih
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }

  // ------------------------------------------------------------------
  // SUMMARY HASIL PENGUJIAN
  // ------------------------------------------------------------------
  console.log('======================================================');
  console.log(`TOTAL PENGUJIAN : ${totalTests}`);
  console.log(`LULUS (PASSED)  : ${passedTests}`);
  console.log(`GAGAL (FAILED)  : ${failedTests}`);
  console.log('======================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runOpenWATests().catch((err) => {
  console.error('Fatal unhandled error in test suite:', err);
  process.exit(1);
});
