// ====================================================================
// WABiz OpenWA Webhook Isolated Unit & Integration Test Suite
// ====================================================================
// Pengujian terisolasi penuh: Mocks untuk Supabase, AI, Handoff, dan Provider.
// Menguji:
// 1. Kriptografi X-OpenWA-Signature & timing-safe comparison
// 2. Isolasi tenant & penolakan pemetaan organisasi yang tidak valid / ambigu
// 3. Idempotensi, in-flight concurrency lock, & garansi pembersihan lock
// 4. Integrasi pipeline eskalasi CS & AI auto-reply
// 5. Endpoint HTTP Express (status 200, 401, 403, 400, 422, 500, 413)
// Tidak pernah menghubungi service OpenWA eksternal atau mengirim pesan nyata.
// ====================================================================

import crypto from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';
import express, { Request, Response, NextFunction } from 'express';
import {
  verifyOpenWaSignature,
  handleOpenWaWebhookPost,
  processOpenWaWebhookPayload,
  resolveOpenWaOrganization,
  inFlightOpenWaMessageIds,
  setOpenWaWebhookTestHooks,
} from './webhook';
import { config } from './config';

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

function generateTestHmacSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

async function runWebhookTests() {
  console.log('======================================================');
  console.log('   WABIZ: OPENWA WEBHOOK ISOLATED TEST SUITE          ');
  console.log('======================================================\n');

  const testSecret = 'openwa_webhook_test_secret_32bytes_hex!';
  const testSessionId = 'e1b4f70d-7515-4f5d-b0ea-93df068732ba';
  const testOrgId = '12cc398e-9c11-4f30-a665-0583f369fd77'; // Valid UUID staging
  const runId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  // Injeksi mock hook terisolasi penuh: tidak mengakses Supabase, Gemini, atau WhatsApp nyata
  setOpenWaWebhookTestHooks({
    customPersistFn: async (params) => {
      return {
        contactId: 'mock-contact-001',
        conversationId: 'mock-conv-openwa-001',
        messageId: params.providerMessageId || `mock_msg_${runId}`,
      };
    },
    customSendFn: async (to, txt) => {
      return { success: true, messageId: `mock_send_${runId}` };
    },
  });

  // ------------------------------------------------------------------
  // TEST 1: Kriptografi Signature X-OpenWA-Signature (HMAC-SHA256)
  // ------------------------------------------------------------------
  console.log('[TEST 1] Kriptografi X-OpenWA-Signature & Timing-Safe Verification');

  const validBodyStr = JSON.stringify({ event: 'message.received', test: true });
  const validSignature = generateTestHmacSignature(validBodyStr, testSecret);

  // 1a. Signature valid cocok dengan body mentah
  const res1a = verifyOpenWaSignature(Buffer.from(validBodyStr), validSignature, testSecret);
  assert(res1a === true, 'Signature valid dengan HMAC-SHA256 terverifikasi berhasil');

  // 1b. Signature tidak valid (secret salah)
  const res1b = verifyOpenWaSignature(Buffer.from(validBodyStr), validSignature, 'wrong_secret_123');
  assert(res1b === false, 'Signature dengan secret salah ditolak (false)');

  // 1c. Tampered body (body diubah setelah penandatanganan)
  const tamperedBodyStr = JSON.stringify({ event: 'message.received', test: true, injected: true });
  const res1c = verifyOpenWaSignature(Buffer.from(tamperedBodyStr), validSignature, testSecret);
  assert(res1c === false, 'Body yang dimanipulasi setelah penandatanganan (tampered body) ditolak');

  // 1d. Format signature header rusak (tanpa prefix sha256=)
  const rawHexWithoutPrefix = crypto.createHmac('sha256', testSecret).update(validBodyStr).digest('hex');
  const res1d = verifyOpenWaSignature(Buffer.from(validBodyStr), rawHexWithoutPrefix, testSecret);
  assert(res1d === false, 'Header tanpa prefix "sha256=" ditolak');

  // 1e. Format signature header dengan panjang digest tidak tepat (< 64 karakter hex)
  const res1e = verifyOpenWaSignature(Buffer.from(validBodyStr), 'sha256=abcdef123', testSecret);
  assert(res1e === false, 'Digest dengan panjang tidak 64 karakter ditolak');

  // 1f. Digest berisi karakter non-hex
  const invalidHex = 'sha256=' + 'z'.repeat(64);
  const res1f = verifyOpenWaSignature(Buffer.from(validBodyStr), invalidHex, testSecret);
  assert(res1f === false, 'Digest dengan karakter non-hex ditolak');

  // 1g. Header signature absen / null / kosong
  assert(verifyOpenWaSignature(Buffer.from(validBodyStr), undefined, testSecret) === false, 'Signature undefined ditolak');
  assert(verifyOpenWaSignature(Buffer.from(validBodyStr), '', testSecret) === false, 'Signature string kosong ditolak');

  // 1h. Secret kosong, whitespace, atau undefined
  assert(verifyOpenWaSignature(Buffer.from(validBodyStr), validSignature, '') === false, 'Secret string kosong ditolak (false)');
  assert(verifyOpenWaSignature(Buffer.from(validBodyStr), validSignature, '   ') === false, 'Secret spasi/whitespace ditolak (false)');
  assert(verifyOpenWaSignature(Buffer.from(validBodyStr), validSignature, undefined) === false, 'Secret undefined ditolak (false)');
  console.log('');

  // ------------------------------------------------------------------
  // TEST 2: Validasi Payload, Kebijakan Event & Isolasi Multi-Tenant
  // ------------------------------------------------------------------
  console.log('[TEST 2] Validasi Payload, Event Filtering & Isolasi Organisasi');

  // 2a. Payload malformed (bukan objek, null, string)
  const res2a1 = await processOpenWaWebhookPayload(null);
  assert(res2a1.success === false && res2a1.status === 'error', 'Payload null ditolak');

  const res2a2 = await processOpenWaWebhookPayload('bukan-json-objek');
  assert(res2a2.success === false && res2a2.status === 'error', 'Payload bertipe string ditolak');

  const res2a3 = await processOpenWaWebhookPayload({});
  assert(res2a3.success === false && res2a3.status === 'error', 'Payload tanpa field event ditolak');

  // 2b. Event yang tidak didukung (misal 'message.ack' atau 'session.status')
  const res2b = await processOpenWaWebhookPayload({
    event: 'message.ack',
    sessionId: testSessionId,
    data: { id: 'ack_123' },
  });
  assert(res2b.success === true && res2b.status === 'ignored', 'Event selain "message.received" diabaikan aman (status: ignored)');

  // 2c. Session ID mismatch
  config.openwaSessionId = testSessionId;
  config.openwaTestOrgId = testOrgId;

  const res2c = await processOpenWaWebhookPayload({
    event: 'message.received',
    sessionId: '00000000-0000-0000-0000-000000000000', // Sesi lain
    data: { id: 'msg_001', from: '628123456789@c.us', body: 'Tes sesi' },
  });
  assert(res2c.success === false && res2c.status === 'error', 'Session ID yang tidak cocok ditolak');

  // 2d. Isolasi Organisasi: Tolak sesi yang tidak terpetakan ke organisasi mana pun
  const unmappedOrgRes = await resolveOpenWaOrganization('unmapped-unknown-session-1234');
  assert(unmappedOrgRes === null, 'Sesi OpenWA yang tidak dikenal ditolak dan menghasilkan null (tidak ditebak)');

  config.openwaSessionId = 'unmapped-session-without-mapping';
  config.openwaTestOrgId = '';

  const unmappedPayloadRes = await processOpenWaWebhookPayload({
    event: 'message.received',
    sessionId: 'unmapped-session-without-mapping',
    data: {
      id: `msg_unmapped_${runId}`,
      from: '628123456789@c.us',
      chatId: '628123456789@c.us',
      body: 'Halo dari sesi liar',
      fromMe: false,
    },
  });
  assert(
    unmappedPayloadRes.success === false && unmappedPayloadRes.reason === 'unmapped_session_organization',
    'Payload dari sesi OpenWA yang tidak terpetakan ditolak aman (unmapped_session_organization)'
  );

  // Kembalikan sesi & org valid
  config.openwaSessionId = testSessionId;
  config.openwaTestOrgId = testOrgId;

  // 2e. Filter pesan dari bot sendiri (fromMe: true)
  const res2e = await processOpenWaWebhookPayload({
    event: 'message.received',
    sessionId: testSessionId,
    data: {
      id: `msg_self_echo_${runId}`,
      from: '628123456789@c.us',
      body: 'Pesan dari bot sendiri',
      fromMe: true, // Echo
    },
  });
  assert(res2e.success === true && res2e.status === 'ignored' && res2e.reason === 'from_me', 'Pesan fromMe: true diabaikan untuk mencegah echo loop');

  // 2f. Filter pesan grup WhatsApp (@g.us)
  const res2f = await processOpenWaWebhookPayload({
    event: 'message.received',
    sessionId: testSessionId,
    data: {
      id: `msg_group_${runId}`,
      from: '120363000000000000@g.us',
      chatId: '120363000000000000@g.us',
      body: 'Halo anggota grup',
      fromMe: false,
      isGroup: true,
    },
  });
  assert(res2f.success === true && res2f.status === 'ignored' && res2f.reason === 'group_message', 'Pesan grup (@g.us / isGroup: true) diabaikan');

  // 2g. Normalisasi sender & proteksi JID @lid
  const res2g = await processOpenWaWebhookPayload({
    event: 'message.received',
    sessionId: testSessionId,
    data: {
      id: `msg_lid_only_${runId}`,
      from: '123456789012345@lid',
      chatId: '123456789012345@lid',
      body: 'Halo dari akun LID',
      fromMe: false,
    },
  });
  assert(
    res2g.success === true && res2g.status === 'ignored' && res2g.reason === 'unsupported_lid_sender',
    'Pesan hanya dari JID @lid diabaikan secara aman tanpa menebak nomor telepon E.164 palsu'
  );

  // 2h. Normalisasi nomor pengirim valid
  const mockSentMessages: Array<{ to: string; text: string }> = [];
  const res2h = await processOpenWaWebhookPayload(
    {
      event: 'message.received',
      sessionId: testSessionId,
      data: {
        id: `msg_inbound_valid_${runId}`,
        from: '08123456789@c.us',
        chatId: '08123456789@c.us',
        body: 'Halo selamat siang',
        fromMe: false,
        pushName: 'Budi Santoso',
      },
    },
    {
      organizationId: testOrgId,
      skipAi: true,
      skipHandoff: true,
      customSendFn: async (to, text) => {
        mockSentMessages.push({ to, text });
        return { success: true, messageId: 'out_msg_001' };
      },
    }
  );
  assert(res2h.success === true && res2h.status === 'processed', 'Pesan masuk valid berhasil diproses');
  assert(res2h.senderPhone === '628123456789', `Nomor pengirim dinormalisasi ke format E.164 (${res2h.senderPhone})`);
  console.log('');

  // ------------------------------------------------------------------
  // TEST 3: Idempotensi, In-Flight Lock & Pembersihan Lock
  // ------------------------------------------------------------------
  console.log('[TEST 3] Idempotensi, In-Flight Concurrency Lock & Pembersihan Lock');

  const duplicatePayload = {
    event: 'message.received',
    sessionId: testSessionId,
    data: {
      id: `unique_msg_id_dedup_${runId}`,
      from: '628111222333@c.us',
      chatId: '628111222333@c.us',
      body: 'Pesan uji coba idempotensi',
      fromMe: false,
    },
  };

  let executionCounter = 0;
  const testSendFn = async () => {
    executionCounter++;
    return { success: true, messageId: 'reply_' + executionCounter };
  };

  // 3a. Pengiriman pertama berhasil
  const res3a = await processOpenWaWebhookPayload(duplicatePayload, {
    organizationId: testOrgId,
    skipAi: true,
    skipHandoff: true,
    customSendFn: testSendFn,
  });
  assert(res3a.status === 'processed', 'Pengiriman pesan pertama berhasil diproses (status: processed)');

  // 3b. Pengiriman kedua (duplikat pasca-eksekusi)
  const res3b = await processOpenWaWebhookPayload(duplicatePayload, {
    organizationId: testOrgId,
    skipAi: true,
    skipHandoff: true,
    customSendFn: testSendFn,
  });
  assert(res3b.status === 'duplicate', 'Pengiriman pesan kedua dengan ID sama dideteksi sebagai duplikat (status: duplicate)');
  assert(res3b.reason === 'in_memory_duplicate', 'Pesan kedua dihentikan oleh deduplikasi idempotensi');

  // 3c. Pengujian In-Flight Concurrency Lock
  // Mensimulasikan pesan sedang dalam proses (inFlightOpenWaMessageIds.has === true)
  const inFlightTestMsgId = `inflight_msg_${runId}`;
  inFlightOpenWaMessageIds.add(inFlightTestMsgId);

  const res3c = await processOpenWaWebhookPayload({
    event: 'message.received',
    sessionId: testSessionId,
    data: {
      id: inFlightTestMsgId,
      from: '628111222333@c.us',
      chatId: '628111222333@c.us',
      body: 'Pesan bersamaan',
      fromMe: false,
    },
  });
  assert(res3c.status === 'duplicate' && res3c.reason === 'in_flight_lock', 'Pesan bersamaan yang sedang diproses ditolak aman oleh in-flight lock');

  // Bersihkan manual lock uji coba
  inFlightOpenWaMessageIds.delete(inFlightTestMsgId);
  assert(inFlightOpenWaMessageIds.has(inFlightTestMsgId) === false, 'In-flight lock berhasil dibersihkan');

  // 3d. Garansi Pembersihan Lock pada Jalur Kegagalan (try...finally)
  const failLockMsgId = `fail_lock_msg_${runId}`;
  const res3d = await processOpenWaWebhookPayload(
    {
      event: 'message.received',
      sessionId: testSessionId,
      data: {
        id: failLockMsgId,
        from: '628111222333@c.us',
        chatId: '628111222333@c.us',
        body: 'Pesan uji coba kegagalan penyimpanan',
        fromMe: false,
      },
    },
    {
      organizationId: testOrgId,
      mockPersistFail: true,
    }
  );
  assert(res3d.status === 'error' && res3d.reason === 'persistence_failed', 'Kegagalan penyimpanan database terdeteksi sebagai error');
  assert(inFlightOpenWaMessageIds.has(failLockMsgId) === false, 'In-flight lock terbukti BERSIH setelah kegagalan persistensi database');
  console.log('');

  // ------------------------------------------------------------------
  // TEST 4: Deteksi Intent Handoff CS & AI Reply Pipeline
  // ------------------------------------------------------------------
  console.log('[TEST 4] Integrasi Pipeline Handoff CS & AI Reply (Mocked)');

  const handoffCalls: Array<{ to: string; text: string }> = [];
  const handoffPayload = {
    event: 'message.received',
    sessionId: testSessionId,
    data: {
      id: `msg_intent_handoff_${runId}`,
      from: '628555666777@c.us',
      chatId: '628555666777@c.us',
      body: 'Saya mau daftar sekarang',
      fromMe: false,
      pushName: 'Calon Peserta',
    },
  };

  const res4 = await processOpenWaWebhookPayload(handoffPayload, {
    organizationId: testOrgId,
    skipHandoff: false,
    skipAi: true,
    customSendFn: async (to, text) => {
      handoffCalls.push({ to, text });
      return { success: true, messageId: 'handoff_reply_001' };
    },
  });

  assert(res4.intent === 'registration_intent', 'Intent pendaftaran berhasil dideteksi dari teks');
  assert(res4.handoffTriggered === true, 'Handoff CS berhasil dipicu (handoffTriggered: true)');
  console.log('');

  // ------------------------------------------------------------------
  // TEST 5: Endpoint HTTP Terisolasi (POST /api/webhooks/openwa)
  // ------------------------------------------------------------------
  console.log('[TEST 5] Integrasi Endpoint HTTP POST /api/webhooks/openwa & Robustness');

  const testApp = express();
  testApp.use(
    express.json({
      limit: '2mb', // Selaras dengan batas OpenWA
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  // Middleware penanganan payload > 2mb
  testApp.use((err: any, _req: Request, res: Response, next: NextFunction): void => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      res.status(413).json({
        success: false,
        error: 'Payload Too Large: Ukuran body data melebihi batas maksimal yang diizinkan (2 MB).',
      });
      return;
    }
    next(err);
  });
  testApp.post('/api/webhooks/openwa', handleOpenWaWebhookPost);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as AddressInfo).port;
  const endpointUrl = `http://127.0.0.1:${port}/api/webhooks/openwa`;

  // Konfigurasikan secret & session ID di config backend
  config.openwaWebhookSecret = testSecret;
  config.openwaSessionId = testSessionId;
  config.openwaTestOrgId = testOrgId;

  try {
    // 5a. Request HTTP dengan signature HMAC valid -> Respon 200 OK dengan status 'persisted'
    const validHttpBody = JSON.stringify({
      event: 'message.received',
      sessionId: testSessionId,
      data: {
        id: `http_inbound_test_${runId}`,
        from: '628111999888@c.us',
        chatId: '628111999888@c.us',
        body: 'Tes HTTP endpoint OpenWA',
        fromMe: false,
      },
    });
    const validSig = generateTestHmacSignature(validHttpBody, testSecret);

    const httpRes1 = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': validSig,
        'X-OpenWA-Delivery-Id': 'delivery-uuid-001',
      },
      body: validHttpBody,
    });

    const httpJson1 = await httpRes1.json().catch(() => ({}));
    assert(httpRes1.status === 200, `HTTP status dengan signature valid adalah 200 (Aktual: ${httpRes1.status})`);
    assert(httpJson1.received === true, 'Response body mengembalikan { received: true }');
    assert(httpJson1.status === 'persisted', 'Status konfirmasi adalah "persisted" (pesan tersimpan sebelum 200)');
    assert(httpJson1.deliveryId === 'delivery-uuid-001', 'Delivery ID dipropagasi pada response');

    // 5b. Request HTTP dengan signature salah -> Ditolak HTTP 401 Unauthorized
    const httpRes2 = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': 'sha256=' + '0'.repeat(64),
      },
      body: validHttpBody,
    });
    assert(httpRes2.status === 401, `HTTP status dengan signature salah adalah 401 (Aktual: ${httpRes2.status})`);

    // 5c. Request HTTP tanpa signature header -> Ditolak HTTP 401 Unauthorized
    const httpRes3 = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: validHttpBody,
    });
    assert(httpRes3.status === 401, `HTTP status tanpa header signature adalah 401 (Aktual: ${httpRes3.status})`);

    // 5c-tampered. Request HTTP dengan body yang dimodifikasi setelah penandatanganan -> Ditolak HTTP 401 Unauthorized
    const tamperedPayloadStr = JSON.stringify({
      event: 'message.received',
      sessionId: testSessionId,
      data: {
        id: `http_tampered_${runId}`,
        from: '628111999888@c.us',
        chatId: '628111999888@c.us',
        body: 'Pesan asli yang ditandatangani',
        fromMe: false,
      },
    });
    const tamperedPayloadSig = generateTestHmacSignature(tamperedPayloadStr, testSecret);
    const modifiedPayloadStr = tamperedPayloadStr.replace('Pesan asli yang ditandatangani', 'Pesan telah diubah penyerang!');
    const httpResTampered = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': tamperedPayloadSig,
      },
      body: modifiedPayloadStr,
    });
    assert(httpResTampered.status === 401, `HTTP status dengan body yang dimodifikasi (tampered body) adalah 401 (Aktual: ${httpResTampered.status})`);

    // 5c-fail-closed. Request HTTP saat OPENWA_WEBHOOK_SECRET tidak disetel di server -> Fail Closed HTTP 500
    const savedConfigSecret = config.openwaWebhookSecret;
    const savedEnvSecret = process.env.OPENWA_WEBHOOK_SECRET;
    try {
      config.openwaWebhookSecret = '';
      delete process.env.OPENWA_WEBHOOK_SECRET;

      const httpResSecretMissing = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenWA-Signature': validSig, // Bahkan jika client mengirim signature
        },
        body: validHttpBody,
      });
      const httpJsonSecretMissing = await httpResSecretMissing.json().catch(() => ({}));
      assert(httpResSecretMissing.status === 500, `HTTP status saat OPENWA_WEBHOOK_SECRET belum disetel adalah 500 Fail Closed (Aktual: ${httpResSecretMissing.status})`);
      assert(
        Boolean(httpJsonSecretMissing.error?.includes('OpenWA webhook secret is not configured on server')),
        'Error HTTP 500 menjelaskan secret belum dikonfigurasi pada server (tanpa membocorkan secret)'
      );
    } finally {
      // Pulihkan secret untuk pengujian berikutnya
      config.openwaWebhookSecret = savedConfigSecret;
      if (savedEnvSecret !== undefined) {
        process.env.OPENWA_WEBHOOK_SECRET = savedEnvSecret;
      }
    }

    // 5d. Request HTTP dengan session ID yang salah -> Ditolak HTTP 403 Forbidden
    const wrongSessionBody = JSON.stringify({
      event: 'message.received',
      sessionId: 'wrong-session-uuid-999',
      data: { id: 'http_002', body: 'Tes' },
    });
    const wrongSessionSig = generateTestHmacSignature(wrongSessionBody, testSecret);

    const httpRes4 = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': wrongSessionSig,
      },
      body: wrongSessionBody,
    });
    assert(httpRes4.status === 403, `HTTP status dengan session ID tidak cocok adalah 403 (Aktual: ${httpRes4.status})`);

    // 5e. Request HTTP dengan payload malformed (bukan format event yang valid)
    const malformedBody = JSON.stringify({ invalid: true });
    const malformedSig = generateTestHmacSignature(malformedBody, testSecret);

    const httpRes5 = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': malformedSig,
      },
      body: malformedBody,
    });
    assert(httpRes5.status === 400, `HTTP status dengan payload malformed adalah 400 (Aktual: ${httpRes5.status})`);

    // 5f. Request HTTP dengan sesi yang tidak terpetakan ke organisasi mana pun -> HTTP 422
    // Sementara kosongkan pairing test org untuk mensimulasikan sesi tidak terdaftar
    config.openwaSessionId = 'unmapped-session-uuid-test';
    config.openwaTestOrgId = '';
    const unmappedHttpBody = JSON.stringify({
      event: 'message.received',
      sessionId: 'unmapped-session-uuid-test',
      data: {
        id: `http_unmapped_${runId}`,
        from: '628111999888@c.us',
        chatId: '628111999888@c.us',
        body: 'Pesan dari sesi tanpa organisasi',
      },
    });
    const unmappedSig = generateTestHmacSignature(unmappedHttpBody, testSecret);
    const httpRes6 = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': unmappedSig,
      },
      body: unmappedHttpBody,
    });
    assert(httpRes6.status === 422, `HTTP status untuk sesi tanpa pemetaan organisasi adalah 422 (Aktual: ${httpRes6.status})`);

    // Kembalikan konfigurasi sesi & org
    config.openwaSessionId = testSessionId;
    config.openwaTestOrgId = testOrgId;

    // 5g. Request HTTP dengan ukuran besar (> 256 KB, misal 350 KB) berhasil diproses (limit >= 1 MB)
    const largeMessageBody = JSON.stringify({
      event: 'message.received',
      sessionId: testSessionId,
      data: {
        id: `http_large_payload_${runId}`,
        from: '628111999888@c.us',
        chatId: '628111999888@c.us',
        body: 'A'.repeat(300 * 1024), // 300 KB text data
      },
    });
    const largeSig = generateTestHmacSignature(largeMessageBody, testSecret);
    const httpRes7 = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': largeSig,
      },
      body: largeMessageBody,
    });
    assert(httpRes7.status === 200, `Payload berukuran > 256 KB (300 KB) berhasil diterima tanpa HTTP 413 (Status: ${httpRes7.status})`);

    // 5h. Request HTTP yang melebihi batas 2 MB ditolak dengan HTTP 413
    const oversizeBody = JSON.stringify({
      event: 'message.received',
      sessionId: testSessionId,
      data: {
        id: `http_oversize_${runId}`,
        from: '628111999888@c.us',
        chatId: '628111999888@c.us',
        body: 'B'.repeat(2500 * 1024), // 2.5 MB text data
      },
    });
    const oversizeSig = generateTestHmacSignature(oversizeBody, testSecret);
    const httpRes8 = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': oversizeSig,
      },
      body: oversizeBody,
    });
    assert(httpRes8.status === 413, `Payload berukuran > 2 MB ditolak aman dengan HTTP 413 Payload Too Large (Status: ${httpRes8.status})`);

    // 5i. Kegagalan persistensi database menghasilkan HTTP 500 (memicu mekanisme retry OpenWA)
    const failPersistBody = JSON.stringify({
      event: 'message.received',
      sessionId: testSessionId,
      mockPersistFail: true,
      data: {
        id: `http_fail_persist_${runId}`,
        from: '628111999888@c.us',
        chatId: '628111999888@c.us',
        body: 'Tes kegagalan penyimpanan DB',
      },
    });
    const failPersistSig = generateTestHmacSignature(failPersistBody, testSecret);
    const httpRes9 = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': failPersistSig,
      },
      body: failPersistBody,
    });
    const httpJson9 = await httpRes9.json().catch(() => ({}));
    assert(httpRes9.status === 500, `Kegagalan persistensi database mengembalikan HTTP 500 agar OpenWA melakukan retry (Status: ${httpRes9.status})`);
    assert(httpJson9.error?.includes('Failed to persist message to database'), 'Pesan error HTTP 500 menjelaskan kegagalan persistensi database');

    // 5j. Request HTTP kedua dengan ID yang sama menghasilkan respons 200 duplicate (idempoten)
    const httpRes10 = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OpenWA-Signature': validSig,
      },
      body: validHttpBody, // ID sama dengan 5a yang sudah disimpan
    });
    const httpJson10 = await httpRes10.json().catch(() => ({}));
    assert(httpRes10.status === 200, `Pengiriman HTTP kedua dengan ID sama mengembalikan 200 OK (Status: ${httpRes10.status})`);
    assert(httpJson10.status === 'duplicate', 'Status respons adalah "duplicate" (mencegah pemrosesan ganda)');

    console.log('');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    setOpenWaWebhookTestHooks({}); // Bersihkan hook pengujian
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

runWebhookTests().catch((err) => {
  console.error('Fatal unhandled error in webhook test suite:', err);
  process.exit(1);
});
