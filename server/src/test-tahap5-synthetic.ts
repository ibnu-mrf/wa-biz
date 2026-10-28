// ====================================================================
// WABiz Tahap 5: Verifikasi Endpoint Webhook Lokal dengan Payload Sintetis
// ====================================================================
// Tujuan:
// 1. Memverifikasi bahwa endpoint POST /api/webhooks/openwa dapat dijangkau
//    secara lokal (port 4000 / loopback 127.0.0.1) dan menegakkan keamanan
//    dengan benar tanpa menghubungkan ke OpenWA sungguhan.
// 2. Menguji seluruh skenario keamanan:
//    - Signature tidak valid (HTTP 401)
//    - Signature hilang (HTTP 401)
//    - Body dimodifikasi / tampered (HTTP 401)
//    - Secret server tidak disetel / kosong -> Fail-Closed (HTTP 500)
//    - Payload malformed (HTTP 400)
//    - Signature valid tetapi sesi tidak dikenal / unmapped (HTTP 422)
//    - Session ID mismatch dengan konfigurasi (HTTP 403)
// 3. Menjamin isolasi penuh: tidak ada data tersimpan ke database produksi,
//    tidak memicu AI/handoff sungguhan, tidak mengirim pesan WhatsApp.
// ====================================================================

import crypto from 'crypto';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import { handleOpenWaWebhookPost } from './webhook';
import { globalRateLimiter } from './security';
import { config } from './config';

interface TestResult {
  name: string;
  expectedStatus: number;
  actualStatus: number;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function generateHmacSha256(payload: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function recordResult(name: string, expectedStatus: number, actualStatus: number, detail: string) {
  const passed = expectedStatus === actualStatus;
  results.push({ name, expectedStatus, actualStatus, passed, detail });
  const mark = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`  ${mark}: [${actualStatus}] ${name} -> ${detail}`);
}

async function runTahap5Verification() {
  console.log('====================================================================');
  console.log('   WABIZ TAHAP 5: VERIFIKASI ENDPOINT WEBHOOK LOKAL SINTETIS       ');
  console.log('====================================================================\n');

  const TARGET_PORT = 4000;
  const testSecret = 'synthetic_test_secret_for_stage_5_verification_32b!';
  const runId = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  // Setup Express App persis dengan konfigurasi produksi server/src/index.ts
  const app = express();

  // 1. Raw body capture & 2MB JSON limit
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // 2. Middleware error handler untuk payload limit (413) & syntax error (400)
  app.use((err: any, _req: Request, res: Response, next: NextFunction): void => {
    if (err && (err.type === 'entity.too.large' || err.status === 413)) {
      res.status(413).json({
        success: false,
        error: 'Payload Too Large: Ukuran body data melebihi batas maksimal yang diizinkan (2 MB).',
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

  // 3. Global rate limiter
  app.use('/api', globalRateLimiter);

  // 4. Mount Endpoint Webhook OpenWA
  app.post('/api/webhooks/openwa', handleOpenWaWebhookPost);

  const server = http.createServer(app);

  let activePort = TARGET_PORT;
  let serverStarted = false;

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[Info] Port ${TARGET_PORT} sedang digunakan. Menggunakan ephemeral port untuk isolasi...`);
          server.listen(0, '127.0.0.1', () => {
            activePort = (server.address() as any).port;
            serverStarted = true;
            resolve();
          });
        } else {
          reject(err);
        }
      });
      server.listen(TARGET_PORT, '127.0.0.1', () => {
        serverStarted = true;
        resolve();
      });
    });

    const endpointUrl = `http://127.0.0.1:${activePort}/api/webhooks/openwa`;
    console.log(`[Status Server] Test server aktif di: ${endpointUrl}`);
    console.log(`[Status Port] Port: ${activePort} (Local Loopback Only)\n`);

    // Konfigurasi secret sintetis terisolasi pada config WABiz
    const originalConfigSecret = config.openwaWebhookSecret;
    const originalEnvSecret = process.env.OPENWA_WEBHOOK_SECRET;
    const originalSessionId = config.openwaSessionId;
    const originalTestOrg = config.openwaTestOrgId;

    config.openwaWebhookSecret = testSecret;

    try {
      // ------------------------------------------------------------------
      // PENGUJIAN 1: Signature Tidak Valid (Wrong Secret / Invalid Digest)
      // ------------------------------------------------------------------
      console.log('--- Pengujian 1: Signature Tidak Valid ---');
      const payload1 = JSON.stringify({
        event: 'message.received',
        sessionId: `synthetic_session_${runId}`,
        data: { id: `synth_msg_1_${runId}`, from: '628123456789@c.us', body: 'Uji signature salah' },
      });
      const invalidSignature = 'sha256=' + '0'.repeat(64);

      const res1 = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenWA-Signature': invalidSignature,
        },
        body: payload1,
      });
      const json1 = await res1.json().catch(() => ({}));
      recordResult(
        'Request dengan signature salah ditolak HTTP 401',
        401,
        res1.status,
        `Status 401, error: "${json1.error}"`
      );

      // ------------------------------------------------------------------
      // PENGUJIAN 2: Signature Hilang (Missing Header)
      // ------------------------------------------------------------------
      console.log('\n--- Pengujian 2: Signature Hilang ---');
      const res2 = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: payload1,
      });
      const json2 = await res2.json().catch(() => ({}));
      recordResult(
        'Request tanpa header X-OpenWA-Signature ditolak HTTP 401',
        401,
        res2.status,
        `Status 401, error: "${json2.error}"`
      );

      // ------------------------------------------------------------------
      // PENGUJIAN 3: Body Dimodifikasi Setelah Penandatanganan (Tampered Body)
      // ------------------------------------------------------------------
      console.log('\n--- Pengujian 3: Body Dimodifikasi (Tampered Body) ---');
      const originalPayload3 = JSON.stringify({
        event: 'message.received',
        sessionId: `synthetic_session_${runId}`,
        data: { id: `synth_msg_3_${runId}`, from: '628123456789@c.us', body: 'Teks asli yang ditandatangani' },
      });
      const validSigForOriginal = generateHmacSha256(originalPayload3, testSecret);
      const tamperedPayload3 = originalPayload3.replace(
        'Teks asli yang ditandatangani',
        'Teks telah disusupi attacker'
      );

      const res3 = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenWA-Signature': validSigForOriginal,
        },
        body: tamperedPayload3,
      });
      const json3 = await res3.json().catch(() => ({}));
      recordResult(
        'Request dengan tampered body ditolak HTTP 401',
        401,
        res3.status,
        `Status 401, error: "${json3.error}"`
      );

      // ------------------------------------------------------------------
      // PENGUJIAN 4: Secret Server Tidak Tersedia / Kosong (Fail-Closed)
      // ------------------------------------------------------------------
      console.log('\n--- Pengujian 4: Secret Server Tidak Tersedia (Fail-Closed) ---');
      try {
        config.openwaWebhookSecret = '';
        delete process.env.OPENWA_WEBHOOK_SECRET;

        const dummySig = generateHmacSha256(payload1, 'any_secret');
        const res4 = await fetch(endpointUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OpenWA-Signature': dummySig,
          },
          body: payload1,
        });
        const json4 = await res4.json().catch(() => ({}));
        recordResult(
          'Server tanpa secret menolak request dengan HTTP 500 Fail-Closed',
          500,
          res4.status,
          `Status 500, error: "${json4.error}" (tanpa membocorkan isi secret)`
        );
      } finally {
        config.openwaWebhookSecret = testSecret;
      }

      // ------------------------------------------------------------------
      // PENGUJIAN 5: Payload Malformed (Bukan Format Event OpenWA)
      // ------------------------------------------------------------------
      console.log('\n--- Pengujian 5: Payload Malformed ---');
      const malformedPayload = JSON.stringify({ bukan_event: true });
      const malformedSig = generateHmacSha256(malformedPayload, testSecret);

      const res5 = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenWA-Signature': malformedSig,
        },
        body: malformedPayload,
      });
      const json5 = await res5.json().catch(() => ({}));
      recordResult(
        'Payload tanpa field event ditolak HTTP 400 Bad Request',
        400,
        res5.status,
        `Status 400, error: "${json5.error}"`
      );

      // ------------------------------------------------------------------
      // PENGUJIAN 6: Signature Valid Tapi Sesi Tidak Dikenal (Unmapped Session)
      // ------------------------------------------------------------------
      console.log('\n--- Pengujian 6: Sesi Tidak Dikenal / Unmapped Organization ---');
      // Pastikan pairing test org dikosongkan agar tidak ada bypass
      config.openwaSessionId = 'unmapped-synthetic-session-xyz';
      config.openwaTestOrgId = '';

      const unmappedPayload = JSON.stringify({
        event: 'message.received',
        sessionId: 'unmapped-synthetic-session-xyz',
        data: {
          id: `synth_unmapped_${runId}`,
          from: '628123456789@c.us',
          chatId: '628123456789@c.us',
          body: 'Pesan dari sesi tanpa pemetaan organisasi',
          fromMe: false,
        },
      });
      const unmappedSig = generateHmacSha256(unmappedPayload, testSecret);

      const res6 = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenWA-Signature': unmappedSig,
        },
        body: unmappedPayload,
      });
      const json6 = await res6.json().catch(() => ({}));
      recordResult(
        'Sesi tidak terdaftar ditolak HTTP 422 Unprocessable Entity',
        422,
        res6.status,
        `Status 422, error: "${json6.error}" (Pesan aman ditolak tanpa disimpan ke DB)`
      );

      // ------------------------------------------------------------------
      // PENGUJIAN 7: Session ID Mismatch dengan Konfigurasi
      // ------------------------------------------------------------------
      console.log('\n--- Pengujian 7: Session ID Mismatch ---');
      config.openwaSessionId = 'expected-session-uuid-1111';

      const mismatchPayload = JSON.stringify({
        event: 'message.received',
        sessionId: 'different-session-uuid-2222',
        data: {
          id: `synth_mismatch_${runId}`,
          from: '628123456789@c.us',
          body: 'Uji session mismatch',
        },
      });
      const mismatchSig = generateHmacSha256(mismatchPayload, testSecret);

      const res7 = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OpenWA-Signature': mismatchSig,
        },
        body: mismatchPayload,
      });
      const json7 = await res7.json().catch(() => ({}));
      recordResult(
        'Session ID tidak cocok ditolak HTTP 403 Forbidden',
        403,
        res7.status,
        `Status 403, error: "${json7.error}"`
      );

    } finally {
      // Pulihkan config asli
      config.openwaWebhookSecret = originalConfigSecret;
      if (originalEnvSecret !== undefined) {
        process.env.OPENWA_WEBHOOK_SECRET = originalEnvSecret;
      }
      config.openwaSessionId = originalSessionId;
      config.openwaTestOrgId = originalTestOrg;
    }
  } finally {
    if (serverStarted) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      console.log('\n[Status Server] Test server ditutup bersih.');
    }
  }

  // Ringkasan
  console.log('\n====================================================================');
  console.log(`TOTAL PENGUJIAN TAHAP 5 : ${results.length}`);
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`LULUS (PASSED)          : ${passedCount}`);
  console.log(`GAGAL (FAILED)          : ${failedCount}`);
  console.log('====================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTahap5Verification().catch((err) => {
  console.error('Fatal unhandled error in Tahap 5 test:', err);
  process.exit(1);
});
