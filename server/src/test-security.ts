/**
 * =====================================================================
 * WABiz Phase 4: Security Hardening & Tenant Isolation Test Suite
 * =====================================================================
 * Menguji seluruh perlindungan keamanan:
 * 1. Pencegahan Cross-Tenant Spoofing (Isolasi Boundary Organisasi)
 * 2. Penolakan Request Tanpa Otentikasi (401 Unauthorized)
 * 3. Penegakan Role-Based Access Control (RBAC: Admin vs Member 403)
 * 4. Penegakan Rate Limiting (429 Too Many Requests)
 * 5. Penolakan Payload Bom / Oversized Body (413 Payload Too Large)
 * 6. Masking Nomor Telepon PII (Kerahasiaan Data Pengguna)
 * 7. Endpoint Health Check Publik
 * =====================================================================
 */

import http from 'http';
import crypto from 'crypto';
import { maskPhone, createRateLimiter } from './security';
import { tenantManager } from './multiTenant';
import { config } from './config';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${desc}`);
    passedCount++;
  } else {
    console.error(`  ✗ FAIL: ${desc}`);
    failedCount++;
  }
}

// Helper pengiriman HTTP request lokal ke worker
function httpRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const postData = options.body !== undefined
      ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
      : '';

    const reqHeaders: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (postData && !reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (postData) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(postData));
    }

    const req = http.request(
      {
        hostname: config.host,
        port: config.port,
        path: options.path,
        method: options.method,
        headers: reqHeaders,
        timeout: 6000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed: any = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // Biarkan raw string jika bukan JSON
          }
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
          });
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout ke worker'));
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runSecurityTestSuite() {
  console.log('======================================================');
  console.log('   WABIZ PHASE 4: SECURITY & ISOLATION TEST SUITE     ');
  console.log('======================================================\n');

  // ----------------------------------------------------
  // TEST 1: PII PHONE MASKING VERIFICATION
  // ----------------------------------------------------
  console.log('[TEST 1] Verifikasi Redaksi Data Pribadi (PII Phone Masking)');
  assert(
    maskPhone('6285641886993') === '62856****6993',
    'Nomor 13 digit (+6285641886993) disamarkan digit tengahnya menjadi 62856****6993'
  );
  assert(
    maskPhone('081234567890') === '08123****7890',
    'Nomor 12 digit (081234567890) disamarkan digit tengahnya menjadi 08123****7890'
  );
  assert(
    maskPhone('+62812345678') === '62812****5678',
    'Nomor dengan awalan plus (+62812345678) dinormalisasi dan disamarkan menjadi 62812****5678'
  );
  assert(
    maskPhone(null) === '-',
    'Nilai null ditangani secara aman menghasilkan "-"'
  );
  assert(
    maskPhone('') === '-',
    'Nilai string kosong ditangani secara aman menghasilkan "-"'
  );

  // ----------------------------------------------------
  // TEST 2: TENANT ISOLATION MANAGER
  // ----------------------------------------------------
  console.log('\n[TEST 2] Verifikasi Tenant Isolation Manager (Boundary Enforcement)');
  const boundOrg = tenantManager.getBoundOrgId();
  assert(
    Boolean(boundOrg && boundOrg.length > 0),
    `Worker staging terikat ke WORKER_ORG_ID: ${boundOrg}`
  );

  const validTenantAccess = tenantManager.validateTenantAccess(boundOrg);
  assert(
    validTenantAccess.allowed === true,
    'Validasi akses ke organisasi milik worker sendiri diizinkan'
  );

  const foreignOrgId = 'a1b2c3d4-e5f6-7890-abcd-ef0123456789';
  const foreignTenantAccess = tenantManager.validateTenantAccess(foreignOrgId);
  assert(
    foreignTenantAccess.allowed === false,
    `Validasi akses ke organisasi lain (${foreignOrgId}) DITOLAK seketika`
  );
  assert(
    typeof foreignTenantAccess.reason === 'string' && foreignTenantAccess.reason.includes('Tenant mismatch'),
    'Alasan penolakan menyebutkan "Tenant mismatch"'
  );

  // ----------------------------------------------------
  // TEST 3: ENDPOINT HEALTH CHECK PUBLIK
  // ----------------------------------------------------
  console.log('\n[TEST 3] Endpoint Health Check Publik (/health)');
  try {
    const healthRes = await httpRequest({ method: 'GET', path: '/health' });
    assert(healthRes.statusCode === 200, 'GET /health mengembalikan status HTTP 200 OK');
    assert(healthRes.body?.status === 'ok', 'GET /health mengembalikan status "ok"');
    assert(healthRes.body?.worker === 'wabiz-whatsapp-staging', 'Worker bernama "wabiz-whatsapp-staging"');
  } catch (err: any) {
    console.error('  ✗ FAIL: Worker tidak merespons pada host/port yang dikonfigurasi:', err.message);
    failedCount++;
  }

  // ----------------------------------------------------
  // TEST 4: PENOLAKAN REQUEST TANPA KREDENSIAL (401 UNAUTHORIZED)
  // ----------------------------------------------------
  console.log('\n[TEST 4] Penolakan Request Tanpa Otentikasi (401 Unauthorized)');
  try {
    const unauthStatus = await httpRequest({ method: 'GET', path: '/api/status' });
    assert(
      unauthStatus.statusCode === 401,
      `GET /api/status tanpa header mengembalikan HTTP 401 Unauthorized (Aktual: ${unauthStatus.statusCode})`
    );

    const unauthSend = await httpRequest({
      method: 'POST',
      path: '/api/send',
      body: { to: '6285641886993', message: 'test' },
    });
    assert(
      unauthSend.statusCode === 401,
      `POST /api/send tanpa header mengembalikan HTTP 401 Unauthorized (Aktual: ${unauthSend.statusCode})`
    );

    const unauthCampaign = await httpRequest({
      method: 'POST',
      path: '/api/campaigns/create',
      body: { name: 'Hack Campaign', messageBody: 'test', deliveryMode: 'now' },
    });
    assert(
      unauthCampaign.statusCode === 401,
      `POST /api/campaigns/create tanpa header mengembalikan HTTP 401 Unauthorized (Aktual: ${unauthCampaign.statusCode})`
    );
  } catch (err: any) {
    console.error('  ✗ FAIL:', err.message);
    failedCount++;
  }

  // ----------------------------------------------------
  // TEST 5: PENCEGAHAN CROSS-TENANT SPOOFING (TENANT MISMATCH 403)
  // ----------------------------------------------------
  console.log('\n[TEST 5] Pencegahan Serangan Cross-Tenant Spoofing (403 Forbidden)');
  try {
    // Mencoba membuat kampanye untuk organisasi lain dengan API key lokal
    const crossTenantCamp = await httpRequest({
      method: 'POST',
      path: '/api/campaigns/create',
      headers: { 'x-api-key': config.localApiKey },
      body: {
        organizationId: foreignOrgId, // Organisasi korban
        name: 'Spoofed Campaign',
        messageBody: 'Hello victim',
        deliveryMode: 'now',
      },
    });

    assert(
      crossTenantCamp.statusCode === 403,
      `POST /api/campaigns/create untuk tenant asing (${foreignOrgId}) DITOLAK dengan HTTP 403 Forbidden (Aktual: ${crossTenantCamp.statusCode})`
    );
    assert(
      crossTenantCamp.body?.error && crossTenantCamp.body.error.includes('Tenant mismatch'),
      'Pesan error respons secara tegas menyatakan "Tenant mismatch"'
    );

    // Mencoba kirim pesan keluar atas nama organisasi lain
    const crossTenantSend = await httpRequest({
      method: 'POST',
      path: '/api/send',
      headers: { 'x-api-key': config.localApiKey },
      body: {
        organizationId: foreignOrgId,
        to: '6285641886993',
        message: 'Illegal outbound',
      },
    });

    assert(
      crossTenantSend.statusCode === 403,
      `POST /api/send untuk tenant asing DITOLAK dengan HTTP 403 Forbidden (Aktual: ${crossTenantSend.statusCode})`
    );

    // TEST 5B: LOCAL_API_KEY (kunci klien) saja TIDAK BISA memanggil endpoint administratif
    const localKeyAdminAttempt = await httpRequest({
      method: 'POST',
      path: '/api/campaigns/create',
      headers: { 'x-api-key': config.localApiKey },
      body: {
        organizationId: boundOrg,
        name: 'Unprivileged Client Campaign',
        messageBody: 'Hello',
        deliveryMode: 'now',
      },
    });

    assert(
      localKeyAdminAttempt.statusCode === 403,
      `POST /api/campaigns/create hanya dengan x-api-key DITOLAK dengan HTTP 403 Forbidden (Aktual: ${localKeyAdminAttempt.statusCode})`
    );
    assert(
      localKeyAdminAttempt.body?.error && localKeyAdminAttempt.body.error.includes('Operasi administratif memerlukan otentikasi akun Admin atau Owner'),
      'Pesan error secara tegas menolak kunci klien untuk operasi administratif'
    );
  } catch (err: any) {
    console.error('  ✗ FAIL:', err.message);
    failedCount++;
  }

  // ----------------------------------------------------
  // TEST 6: PENEGAKAN BATASAN UKURAN PAYLOAD (REGULER 256 KB VS WEBHOOK 2 MB)
  // ----------------------------------------------------
  console.log('\n[TEST 6] Penegakan Batasan Ukuran Payload (Reguler 256 KB vs Webhook 2 MB)');
  try {
    // 6A. Endpoint reguler menerima payload valid 100 KB
    const normalString = 'A'.repeat(100 * 1024);
    const validRegularRes = await httpRequest({
      method: 'POST',
      path: '/api/ai/simulate',
      headers: { 'x-api-key': config.localApiKey },
      body: {
        prompt: normalString,
      },
    });

    assert(
      validRegularRes.statusCode === 200,
      `Endpoint reguler menerima payload valid 100 KB (Aktual: ${validRegularRes.statusCode})`
    );
    assert(
      validRegularRes.body?.success === true,
      'Respons endpoint reguler sukses untuk payload valid 100 KB'
    );

    // 6B. Endpoint reguler menolak payload 300 KB (> 256 KB) dengan HTTP 413 Payload Too Large
    const bigString = 'A'.repeat(300 * 1024);
    const oversizedRes = await httpRequest({
      method: 'POST',
      path: '/api/ai/simulate',
      headers: { 'x-api-key': config.localApiKey },
      body: {
        prompt: bigString,
      },
    });

    assert(
      oversizedRes.statusCode === 413,
      `Payload 300 KB DITOLAK dengan HTTP 413 Payload Too Large (Aktual: ${oversizedRes.statusCode})`
    );
    assert(
      oversizedRes.body?.error && oversizedRes.body.error.includes('Payload Too Large'),
      'Respons error berformat JSON terstruktur tanpa crash server'
    );

    // 6C. Webhook WhatsApp menerima payload valid 1.5 MB (> 256 KB, < 2 MB) dan rawBody utuh
    const webhookPayloadStr = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [],
      padding: 'A'.repeat(1500 * 1024),
    });

    const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.metaAppSecret) {
      const hmac = crypto
        .createHmac('sha256', config.metaAppSecret)
        .update(webhookPayloadStr)
        .digest('hex');
      webhookHeaders['x-hub-signature-256'] = `sha256=${hmac}`;
    }

    const webhookRes = await httpRequest({
      method: 'POST',
      path: '/api/webhooks/whatsapp',
      headers: webhookHeaders,
      body: webhookPayloadStr,
    });

    assert(
      webhookRes.statusCode === 200,
      `Webhook WhatsApp menerima payload valid 1.5 MB (Aktual: ${webhookRes.statusCode})`
    );
    assert(
      webhookRes.body?.status === 'success',
      'Webhook WhatsApp mengembalikan status "success" dan memverifikasi integritas signature rawBody'
    );

    // 6D. Webhook menolak payload lebih dari 2 MB dengan HTTP 413
    const oversizeWebhookPayloadStr = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [],
      padding: 'A'.repeat(2100 * 1024),
    });

    const oversizeWebhookRes = await httpRequest({
      method: 'POST',
      path: '/api/webhooks/whatsapp',
      headers: { 'Content-Type': 'application/json' },
      body: oversizeWebhookPayloadStr,
    });

    assert(
      oversizeWebhookRes.statusCode === 413,
      `Webhook menolak payload > 2 MB dengan HTTP 413 (Aktual: ${oversizeWebhookRes.statusCode})`
    );
    assert(
      oversizeWebhookRes.body?.error && oversizeWebhookRes.body.error.includes('Payload Too Large'),
      'Pesan error webhook menegaskan Payload Too Large untuk body > 2 MB'
    );
  } catch (err: any) {
    console.error('  ✗ FAIL:', err.message);
    failedCount++;
  }

  // ----------------------------------------------------
  // TEST 7: PENANGANAN FORMAT JSON TIDAK VALID (400 BAD REQUEST)
  // ----------------------------------------------------
  console.log('\n[TEST 7] Penanganan Format JSON Tidak Valid (400 Bad Request)');
  try {
    const malformedRes = await httpRequest({
      method: 'POST',
      path: '/api/ai/simulate',
      headers: {
        'x-api-key': config.localApiKey,
        'Content-Type': 'application/json',
      },
      body: '{ malformed_json: true, missing_quotes }',
    });

    assert(
      malformedRes.statusCode === 400,
      `Malformed JSON menghasilkan HTTP 400 Bad Request (Aktual: ${malformedRes.statusCode})`
    );
    assert(
      malformedRes.body?.error && malformedRes.body.error.includes('Bad Request'),
      'Respons error JSON terstruktur tanpa memunculkan stack trace HTML internal'
    );
  } catch (err: any) {
    console.error('  ✗ FAIL:', err.message);
    failedCount++;
  }

  // ----------------------------------------------------
  // TEST 8: RATE LIMITING DI TINGKAT KELAS (SLIDING WINDOW)
  // ----------------------------------------------------
  console.log('\n[TEST 8] Uji Fungsional Unit Rate Limiter');
  const testLimiter = createRateLimiter({
    windowMs: 1000,
    max: 3,
    message: 'Test limit reached',
    keyGenerator: () => 'test_client_key',
  });

  let blocked = false;
  let fakeReq = { method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any;
  let fakeRes = {
    setHeader: () => {},
    status: (code: number) => {
      if (code === 429) blocked = true;
      return { json: () => {} };
    },
  } as any;

  // Panggil 3 kali (harus lolos)
  testLimiter(fakeReq, fakeRes, () => {});
  testLimiter(fakeReq, fakeRes, () => {});
  testLimiter(fakeReq, fakeRes, () => {});
  assert(!blocked, '3 permintaan pertama diizinkan');

  // Panggil ke-4 (harus di-block 429)
  testLimiter(fakeReq, fakeRes, () => {});
  assert(blocked, 'Permintaan ke-4 diblokir dengan HTTP 429 Too Many Requests');

  // ----------------------------------------------------
  // HASIL AKHIR
  // ----------------------------------------------------
  console.log('\n======================================================');
  console.log(`TOTAL PENGUJIAN KEAMANAN: ${passedCount + failedCount}`);
  console.log(`  ✓ LULUS : ${passedCount}`);
  console.log(`  ✗ GAGAL : ${failedCount}`);
  console.log('======================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSecurityTestSuite().catch((e) => {
  console.error('Fatal Test Exception:', e);
  process.exit(1);
});
