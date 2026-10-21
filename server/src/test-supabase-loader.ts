// ==========================================
// PENGUJIAN UNIT — STARTUP LOADER SUPABASE
// Memverifikasi keamanan filter organization_id:
// 1. WORKER_ORG_ID kosong → pemuatan ditolak, query tidak dijalankan
// 2. WORKER_ORG_ID tersedia → query memakai filter .eq('organization_id', ...)
// 3. Profil tidak ditemukan → tidak ada fallback ke organisasi lain
// 4. Secret tidak pernah dicetak ke log
// ==========================================

import { getActiveProfile, DEFAULT_ORG_PROFILE, setActiveProfile } from './ai';

// ---- Tipe & Utilitas ----

interface TestResult {
  name: string;
  passed: boolean;
  errors: string[];
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ---- Mock Supabase Client ----

// Track semua panggilan query untuk memastikan filter diterapkan
let mockQueryCalls: { method: string; args: unknown[] }[] = [];
let mockQueryResult: { data: unknown; error: unknown } = { data: null, error: null };
let mockClientCreated = false;

// Mock chain builder — setiap method mengembalikan chain dan mencatat panggilan
function createMockChain(): Record<string, (...args: unknown[]) => unknown> {
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const methods = ['select', 'eq', 'limit', 'maybeSingle', 'from'];

  for (const method of methods) {
    chain[method] = (...args: unknown[]) => {
      mockQueryCalls.push({ method, args });
      // maybeSingle mengakhiri chain → kembalikan hasil
      if (method === 'maybeSingle') {
        return Promise.resolve(mockQueryResult);
      }
      return chain;
    };
  }
  return chain;
}

// ---- Monkey-Patch Module ----
// Karena proyek tidak memiliki test framework (jest/vitest),
// kita monkey-patch modul @supabase/supabase-js untuk intercept createClient.

// Simpan referensi asli
let originalCreateClient: unknown;

function setupMocks(): void {
  mockQueryCalls = [];
  mockQueryResult = { data: null, error: null };
  mockClientCreated = false;

  // Reset activeProfile ke default sebelum setiap tes
  setActiveProfile({});

  // Monkey-patch createClient di modul supabase
  try {
    const supabaseModule = require('@supabase/supabase-js');
    originalCreateClient = supabaseModule.createClient;
    supabaseModule.createClient = (..._args: unknown[]) => {
      mockClientCreated = true;
      return createMockChain();
    };
  } catch {
    // Jika modul belum dimuat, skip
  }
}

function teardownMocks(): void {
  try {
    const supabaseModule = require('@supabase/supabase-js');
    if (originalCreateClient) {
      supabaseModule.createClient = originalCreateClient;
    }
  } catch {
    // skip
  }
}

// ---- Tes ----

async function test1_workerOrgIdEmpty(): Promise<TestResult> {
  const name = 'WORKER_ORG_ID kosong → pemuatan ditolak, query tidak dijalankan';
  const errors: string[] = [];

  setupMocks();

  // Simpan dan kosongkan env
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalOrg = process.env.WORKER_ORG_ID;

  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-not-real';
  delete process.env.WORKER_ORG_ID;

  try {
    // Re-import untuk mendapatkan modul dengan env baru
    // Karena variabel dibaca saat module load, kita perlu menghapus cache
    delete require.cache[require.resolve('./supabase')];
    const { loadProfileFromSupabase } = require('./supabase');

    const result = await loadProfileFromSupabase();

    try {
      assert(result === false, 'loadProfileFromSupabase() harus return false');
    } catch (e) {
      errors.push((e as Error).message);
    }

    // Periksa bahwa TIDAK ada query 'from' yang dijalankan
    const fromCalls = mockQueryCalls.filter(c => c.method === 'from');
    try {
      assert(fromCalls.length === 0, `Query seharusnya tidak dijalankan, tapi ada ${fromCalls.length} panggilan 'from'`);
    } catch (e) {
      errors.push((e as Error).message);
    }

    // Periksa activeProfile tetap default
    const profile = getActiveProfile();
    try {
      assert(profile.orgId === '' || profile.orgId === DEFAULT_ORG_PROFILE.orgId,
        'activeProfile seharusnya tetap default (kosong)');
    } catch (e) {
      errors.push((e as Error).message);
    }
  } finally {
    // Restore env
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
    else delete process.env.SUPABASE_URL;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (originalOrg !== undefined) process.env.WORKER_ORG_ID = originalOrg;
    else delete process.env.WORKER_ORG_ID;

    teardownMocks();
    delete require.cache[require.resolve('./supabase')];
  }

  return { name, passed: errors.length === 0, errors };
}

async function test2_workerOrgIdWhitespace(): Promise<TestResult> {
  const name = 'WORKER_ORG_ID hanya whitespace → ditolak sama seperti kosong';
  const errors: string[] = [];

  setupMocks();

  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalOrg = process.env.WORKER_ORG_ID;

  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-not-real';
  process.env.WORKER_ORG_ID = '   ';

  try {
    delete require.cache[require.resolve('./supabase')];
    const { loadProfileFromSupabase } = require('./supabase');

    const result = await loadProfileFromSupabase();

    try {
      assert(result === false, 'loadProfileFromSupabase() harus return false untuk whitespace-only');
    } catch (e) {
      errors.push((e as Error).message);
    }

    const fromCalls = mockQueryCalls.filter(c => c.method === 'from');
    try {
      assert(fromCalls.length === 0, `Query seharusnya tidak dijalankan untuk whitespace-only WORKER_ORG_ID`);
    } catch (e) {
      errors.push((e as Error).message);
    }
  } finally {
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
    else delete process.env.SUPABASE_URL;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (originalOrg !== undefined) process.env.WORKER_ORG_ID = originalOrg;
    else delete process.env.WORKER_ORG_ID;

    teardownMocks();
    delete require.cache[require.resolve('./supabase')];
  }

  return { name, passed: errors.length === 0, errors };
}

async function test3_orgIdFilterApplied(): Promise<TestResult> {
  const name = 'WORKER_ORG_ID tersedia → query memakai filter .eq(organization_id)';
  const errors: string[] = [];

  setupMocks();
  mockQueryResult = {
    data: {
      organization_id: 'test-org-123',
      org_name: 'Lembaga Tes',
      short_name: 'LT',
      institution_type: 'Pesantren',
      official_description: 'Deskripsi tes',
      escalation_phone: '081234567890',
    },
    error: null,
  };

  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalOrg = process.env.WORKER_ORG_ID;

  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-not-real';
  process.env.WORKER_ORG_ID = 'test-org-123';

  try {
    delete require.cache[require.resolve('./supabase')];
    const { loadProfileFromSupabase } = require('./supabase');

    const result = await loadProfileFromSupabase();

    try {
      assert(result === true, 'loadProfileFromSupabase() harus return true saat profil ditemukan');
    } catch (e) {
      errors.push((e as Error).message);
    }

    // Periksa filter .eq('organization_id', 'test-org-123') diterapkan
    const eqCalls = mockQueryCalls.filter(c => c.method === 'eq');
    try {
      assert(eqCalls.length >= 1, 'Filter .eq() harus dipanggil minimal 1 kali');
    } catch (e) {
      errors.push((e as Error).message);
    }

    if (eqCalls.length > 0) {
      try {
        assert(eqCalls[0].args[0] === 'organization_id',
          `Filter pertama harus 'organization_id', tapi dapat '${eqCalls[0].args[0]}'`);
        assert(eqCalls[0].args[1] === 'test-org-123',
          `Nilai filter harus 'test-org-123', tapi dapat '${eqCalls[0].args[1]}'`);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }

    // Periksa .limit(1) TIDAK dipanggil (query langsung ke .maybeSingle)
    const limitCalls = mockQueryCalls.filter(c => c.method === 'limit');
    try {
      assert(limitCalls.length === 0,
        `Query tidak boleh menggunakan .limit() — seharusnya hanya .maybeSingle(). Ditemukan ${limitCalls.length} panggilan.`);
    } catch (e) {
      errors.push((e as Error).message);
    }

    // Periksa activeProfile diupdate
    const profile = getActiveProfile();
    try {
      assert(profile.orgName === 'Lembaga Tes', `orgName harus 'Lembaga Tes', tapi dapat '${profile.orgName}'`);
      assert(profile.orgId === 'test-org-123', `orgId harus 'test-org-123', tapi dapat '${profile.orgId}'`);
    } catch (e) {
      errors.push((e as Error).message);
    }
  } finally {
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
    else delete process.env.SUPABASE_URL;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (originalOrg !== undefined) process.env.WORKER_ORG_ID = originalOrg;
    else delete process.env.WORKER_ORG_ID;

    teardownMocks();
    delete require.cache[require.resolve('./supabase')];
  }

  return { name, passed: errors.length === 0, errors };
}

async function test4_profileNotFoundNoFallback(): Promise<TestResult> {
  const name = 'Profil tidak ditemukan → tidak ada fallback ke organisasi lain';
  const errors: string[] = [];

  setupMocks();
  mockQueryResult = { data: null, error: null }; // Tidak ada profil

  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalOrg = process.env.WORKER_ORG_ID;

  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-not-real';
  process.env.WORKER_ORG_ID = 'nonexistent-org-999';

  try {
    delete require.cache[require.resolve('./supabase')];
    const { loadProfileFromSupabase } = require('./supabase');

    const result = await loadProfileFromSupabase();

    try {
      assert(result === false, 'loadProfileFromSupabase() harus return false saat profil tidak ada');
    } catch (e) {
      errors.push((e as Error).message);
    }

    // Periksa filter tetap hanya untuk org yang diminta, bukan query ulang tanpa filter
    const eqCalls = mockQueryCalls.filter(c => c.method === 'eq');
    try {
      assert(eqCalls.length >= 1, 'Filter .eq() harus tetap dipanggil walaupun hasilnya kosong');
      if (eqCalls.length > 0) {
        assert(eqCalls[0].args[1] === 'nonexistent-org-999',
          'Filter harus menggunakan org ID yang diminta, bukan org lain');
      }
    } catch (e) {
      errors.push((e as Error).message);
    }

    // Periksa hanya 1 kali panggilan 'from' — tidak ada query kedua sebagai fallback
    const fromCalls = mockQueryCalls.filter(c => c.method === 'from');
    try {
      assert(fromCalls.length === 1,
        `Harus tepat 1 query, bukan ${fromCalls.length} (retry/fallback ke org lain terdeteksi)`);
    } catch (e) {
      errors.push((e as Error).message);
    }

    // Periksa activeProfile TIDAK berubah (tetap default kosong)
    const profile = getActiveProfile();
    try {
      assert(profile.orgName === '' || profile.orgName === DEFAULT_ORG_PROFILE.orgName,
        'activeProfile tidak boleh berubah saat profil tidak ditemukan');
    } catch (e) {
      errors.push((e as Error).message);
    }
  } finally {
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
    else delete process.env.SUPABASE_URL;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (originalOrg !== undefined) process.env.WORKER_ORG_ID = originalOrg;
    else delete process.env.WORKER_ORG_ID;

    teardownMocks();
    delete require.cache[require.resolve('./supabase')];
  }

  return { name, passed: errors.length === 0, errors };
}

async function test5_dbErrorNoFallback(): Promise<TestResult> {
  const name = 'Database error → gagal aman, tidak retry tanpa filter';
  const errors: string[] = [];

  setupMocks();
  mockQueryResult = { data: null, error: { message: 'relation does not exist' } };

  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalOrg = process.env.WORKER_ORG_ID;

  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key-not-real';
  process.env.WORKER_ORG_ID = 'test-org-456';

  try {
    delete require.cache[require.resolve('./supabase')];
    const { loadProfileFromSupabase } = require('./supabase');

    const result = await loadProfileFromSupabase();

    try {
      assert(result === false, 'loadProfileFromSupabase() harus return false saat DB error');
    } catch (e) {
      errors.push((e as Error).message);
    }

    // Hanya 1 query, tidak ada retry/fallback
    const fromCalls = mockQueryCalls.filter(c => c.method === 'from');
    try {
      assert(fromCalls.length === 1,
        `Harus tepat 1 query saat DB error, bukan ${fromCalls.length}`);
    } catch (e) {
      errors.push((e as Error).message);
    }

    // activeProfile tidak berubah
    const profile = getActiveProfile();
    try {
      assert(profile.orgName === '',
        'activeProfile harus tetap default kosong saat DB error');
    } catch (e) {
      errors.push((e as Error).message);
    }
  } finally {
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
    else delete process.env.SUPABASE_URL;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (originalOrg !== undefined) process.env.WORKER_ORG_ID = originalOrg;
    else delete process.env.WORKER_ORG_ID;

    teardownMocks();
    delete require.cache[require.resolve('./supabase')];
  }

  return { name, passed: errors.length === 0, errors };
}

async function test6_supabaseNotConfigured(): Promise<TestResult> {
  const name = 'Supabase tidak dikonfigurasi → skip aman, tidak ada query';
  const errors: string[] = [];

  setupMocks();

  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalOrg = process.env.WORKER_ORG_ID;

  // Kosongkan konfigurasi Supabase
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.WORKER_ORG_ID = 'test-org-123';

  try {
    delete require.cache[require.resolve('./supabase')];
    const { loadProfileFromSupabase } = require('./supabase');

    const result = await loadProfileFromSupabase();

    try {
      assert(result === false, 'loadProfileFromSupabase() harus return false saat Supabase tidak dikonfigurasi');
    } catch (e) {
      errors.push((e as Error).message);
    }

    try {
      assert(mockClientCreated === false, 'Supabase client seharusnya tidak dibuat');
    } catch (e) {
      errors.push((e as Error).message);
    }

    const fromCalls = mockQueryCalls.filter(c => c.method === 'from');
    try {
      assert(fromCalls.length === 0, 'Tidak boleh ada query saat Supabase tidak dikonfigurasi');
    } catch (e) {
      errors.push((e as Error).message);
    }
  } finally {
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
    else delete process.env.SUPABASE_URL;
    if (originalKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (originalOrg !== undefined) process.env.WORKER_ORG_ID = originalOrg;
    else delete process.env.WORKER_ORG_ID;

    teardownMocks();
    delete require.cache[require.resolve('./supabase')];
  }

  return { name, passed: errors.length === 0, errors };
}

async function test7_noSecretInLogs(): Promise<TestResult> {
  const name = 'Secret tidak pernah dicetak nilainya ke log';
  const errors: string[] = [];

  // Baca source file dan periksa pola berbahaya
  const fs = require('fs');
  const path = require('path');
  const sourceFile = path.join(__dirname, 'supabase.ts');

  let source: string;
  try {
    source = fs.readFileSync(sourceFile, 'utf-8');
  } catch {
    // Fallback ke .js jika .ts tidak tersedia (post-build)
    const jsFile = path.join(__dirname, 'supabase.js');
    source = fs.readFileSync(jsFile, 'utf-8');
  }

  // Pola berbahaya: console.log/error/warn yang mencetak NILAI variabel secret
  const dangerousPatterns = [
    /console\.\w+\(.*\bSUPABASE_SERVICE_ROLE_KEY\b[^)]*\)/g,  // variabel langsung
    /console\.\w+\(.*\$\{SUPABASE_SERVICE_ROLE_KEY\}/g,         // template literal
  ];

  // Pola aman (hanya nama variabel sebagai string literal) — exclude
  const safePatterns = [
    /console\.\w+\([^)]*['"`][^'"`]*SUPABASE_SERVICE_ROLE_KEY[^'"`]*['"`]/g,
  ];

  for (const pattern of dangerousPatterns) {
    const matches = source.match(pattern);
    if (matches) {
      // Periksa apakah match juga cocok dengan pola aman
      for (const match of matches) {
        let isSafe = false;
        for (const safe of safePatterns) {
          if (safe.test(match)) {
            isSafe = true;
            break;
          }
          safe.lastIndex = 0; // reset regex
        }
        if (!isSafe) {
          errors.push(`Potensi kebocoran secret di log: ${match}`);
        }
      }
    }
  }

  // Periksa tidak ada console.log yang dump seluruh process.env
  if (/console\.\w+\(.*process\.env\s*\)/g.test(source)) {
    errors.push('console.log(process.env) terdeteksi — bisa membocorkan semua secret');
  }

  return { name, passed: errors.length === 0, errors };
}

// ---- Runner ----

async function runTests() {
  console.log('======================================================');
  console.log('PENGUJIAN UNIT — STARTUP LOADER SUPABASE');
  console.log('Verifikasi filter organization_id & keamanan');
  console.log('======================================================\n');

  const tests = [
    test1_workerOrgIdEmpty,
    test2_workerOrgIdWhitespace,
    test3_orgIdFilterApplied,
    test4_profileNotFoundNoFallback,
    test5_dbErrorNoFallback,
    test6_supabaseNotConfigured,
    test7_noSecretInLogs,
  ];

  for (let i = 0; i < tests.length; i++) {
    const result = await tests[i]();
    results.push(result);

    const status = result.passed ? '✓ LULUS' : '✗ GAGAL';
    console.log(`[Test ${i + 1}/${tests.length}] ${result.name}`);
    console.log(`  Status: ${status}`);
    if (!result.passed) {
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
    }
    console.log('');
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('======================================================');
  console.log(`HASIL AKHIR: ${passed} Lulus, ${failed} Gagal dari ${results.length} tes`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
