// ====================================================================
// WABiz Tahap 9C-1B: Runner Pengujian Multi-Koneksi PostgreSQL Fisik Terisolasi
// ====================================================================
// Berkas: server/src/test-pg-multi-client.ts
//
// Tujuan:
// Memvalidasi konkurensi multi-koneksi PostgreSQL fisik sesungguhnya (ACID & Row Locks)
// pada database PostgreSQL lokal terisolasi sebelum migrasi Supabase produksi.
//
// Driver: Native PostgreSQL (`pg` Client)
// Menjamin dua worker benar-benar berjalan di 2 socket/koneksi terpisah dengan
// backend PID PostgreSQL yang berbeda (SELECT pg_backend_pid()).
//
// PRASYARAT MENJALANKAN TEST INI:
// 1. Dependency `pg` dan `@types/pg` terpasang di folder `server/`:
//    cd server && npm install -D pg @types/pg
// 2. Database PostgreSQL lokal terisolasi sudah siap dan migrasi telah diterapkan.
// 3. Variabel environment `LOCAL_TEST_DB_URL` disetel, contoh:
//    set LOCAL_TEST_DB_URL=postgresql://postgres:password@localhost:5432/wabiz_local_test
// 4. JANGAN PERNAH menyetel URL ini ke Supabase live produksi!
// ====================================================================

import crypto from 'crypto';

interface PgQueryResult<T = any> {
  rows: T[];
  rowCount?: number;
}

interface PgClientInstance {
  query<T = any>(queryText: string, values?: any[]): Promise<PgQueryResult<T>>;
  connect(): Promise<void>;
  end(): Promise<void>;
}

interface VerifiedTargetDb {
  connectionString: string;
  databaseName: string;
  host: string;
  port: number;
}

export const ALLOWED_TEST_DB_NAMES = ['wabiz_local_test', 'wabiz_test'];
export const ALLOWED_HOSTNAMES = ['localhost', '127.0.0.1', '::1', '[::1]'];
export const REQUIRED_CANARY_MARKER = 'isolated_local_test';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertValidUuid(uuidStr: string, label: string): void {
  if (!UUID_REGEX.test(uuidStr)) {
    throw new Error(`[VALIDATION ERROR] ${label} bukan format UUID yang valid (8-4-4-4-12): "${uuidStr}"`);
  }
}

interface TestResult {
  scenario: string;
  passed: boolean;
  expected: string;
  actual: string;
  detail?: string;
}

const suiteResults: TestResult[] = [];

function assertTest(
  scenario: string,
  condition: boolean,
  expected: string,
  actual: string,
  detail?: string
): void {
  suiteResults.push({
    scenario,
    passed: condition,
    expected,
    actual,
    detail,
  });
  if (condition) {
    console.log(`  ✓ PASS: ${scenario}`);
  } else {
    console.error(`  ✗ FAIL: ${scenario}`);
    console.error(`    Ekspektasi : ${expected}`);
    console.error(`    Aktual     : ${actual}`);
    if (detail) {
      console.error(`    Detail     : ${detail}`);
    }
  }
}

function maskUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
  }
}

/**
 * Validasi fail-closed struktural terhadap URL database target.
 * Menolak URL jika bukan loopback lokal atau jika nama database bukan database uji.
 */
function validateAndParseTargetUrl(rawUrl: string): VerifiedTargetDb {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('[SECURITY ERROR] URL target tidak valid atau gagal diparse sebagai URI.');
  }

  // 1. Protokol wajib postgresql: atau postgres:
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(
      `[SECURITY ERROR] Protokol '${parsed.protocol}' ditolak. Runner ini hanya menerima protokol 'postgresql:' atau 'postgres:'.`
    );
  }

  // 2. Hostname WAJIB loopback murni (localhost, 127.0.0.1, ::1)
  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTNAMES.includes(hostname)) {
    throw new Error(
      `[SECURITY ERROR] Host '${hostname}' ditolak! Pengujian HANYA diizinkan pada interface loopback lokal (${ALLOWED_HOSTNAMES.join(', ')}).`
    );
  }

  // 3. Nama database WAJIB cocok dengan whitelist database uji terisolasi
  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  if (!ALLOWED_TEST_DB_NAMES.includes(dbName)) {
    throw new Error(
      `[SECURITY ERROR] Target database '${dbName}' ditolak! Pengujian HANYA diizinkan pada database terisolasi: ${ALLOWED_TEST_DB_NAMES.join(', ')}.`
    );
  }

  // 4. Deteksi kata kunci produksi yang mencurigakan di seluruh URL
  const fullRawLower = rawUrl.toLowerCase();
  if (
    fullRawLower.includes('.supabase.co') ||
    fullRawLower.includes('.supabase.in') ||
    fullRawLower.includes('production') ||
    fullRawLower.includes('prod')
  ) {
    throw new Error(
      '[SECURITY ERROR] URL mengandung indikator produksi / cloud Supabase. Koneksi dibatalkan demi keselamatan!'
    );
  }

  const port = parseInt(parsed.port || '5432', 10);
  return {
    connectionString: rawUrl,
    databaseName: dbName,
    host: hostname,
    port,
  };
}

/**
 * Verifikasi metadata koneksi langsung ke mesin PostgreSQL (Handshake Query).
 * Memastikan bahwa server fisik yang merespon benar-benar database lokal, bukan remote proxy,
 * dan memiliki canary marker resmi 'wabiz.environment = isolated_local_test'.
 */
export async function verifyDatabaseMetadata(
  client: PgClientInstance,
  expectedDb: string,
  workerLabel: string = 'Worker'
): Promise<void> {
  let res: PgQueryResult;
  try {
    res = await client.query(`
      SELECT 
        current_database() AS db_name,
        current_user AS user_name,
        inet_server_addr() AS server_ip,
        inet_server_port() AS server_port,
        pg_is_in_recovery() AS is_replica,
        current_setting('wabiz.environment', true) AS wabiz_env,
        version() AS pg_version;
    `);
  } catch (queryErr: any) {
    throw new Error(
      `[SECURITY ERROR] ${workerLabel}: Kueri verifikasi metadata gagal dijalankan pada server PostgreSQL: ${queryErr.message}`
    );
  }

  const meta = res?.rows?.[0];
  if (!meta) {
    throw new Error(
      `[SECURITY ERROR] ${workerLabel}: Gagal membaca metadata server PostgreSQL (kueri tidak mengembalikan baris data).`
    );
  }

  // 1. Verifikasi nama database aktual di server (wajib cocok target dan ada di whitelist)
  const actualDb = (meta.db_name || '').toLowerCase();
  const expectedDbLower = expectedDb.toLowerCase();
  if (!ALLOWED_TEST_DB_NAMES.includes(actualDb)) {
    throw new Error(
      `[SECURITY ERROR] ${workerLabel}: Database aktif (${meta.db_name}) tidak termasuk dalam whitelist database uji (${ALLOWED_TEST_DB_NAMES.join(', ')})!`
    );
  }
  if (actualDb !== expectedDbLower) {
    throw new Error(
      `[SECURITY ERROR] ${workerLabel}: Database aktif (${meta.db_name}) tidak cocok dengan nama database target yang diharapkan (${expectedDb})!`
    );
  }

  // 2. Verifikasi interface IP server (wajib loopback lokal atau socket domain)
  const serverIp = meta.server_ip ? String(meta.server_ip).trim() : null;
  if (serverIp !== null && serverIp !== '127.0.0.1' && serverIp !== '::1') {
    throw new Error(
      `[SECURITY ERROR] ${workerLabel}: IP server PostgreSQL aktif (${serverIp}) bukan loopback lokal (127.0.0.1 / ::1)!`
    );
  }

  // 3. Verifikasi bukan read-replica
  if (meta.is_replica === true) {
    throw new Error(`[SECURITY ERROR] ${workerLabel}: Database target terdeteksi sebagai read-replica.`);
  }

  // 4. Verifikasi Wajib Canary Marker Lingkungan (Fail-Closed)
  // Marker HARUS bernilai persis 'isolated_local_test' (tidak boleh null, undefined, kosong, whitespace, atau nilai lain)
  const rawEnv = meta.wabiz_env;
  if (
    rawEnv === null ||
    rawEnv === undefined ||
    typeof rawEnv !== 'string' ||
    rawEnv.length === 0 ||
    rawEnv !== REQUIRED_CANARY_MARKER
  ) {
    throw new Error(
      `[SECURITY ERROR] Target database pada ${workerLabel} TIDAK memiliki canary marker yang sah!\n` +
      `Ekspektasi : current_setting('wabiz.environment', true) === '${REQUIRED_CANARY_MARKER}' (persis)\n` +
      `Aktual     : ${rawEnv === null || rawEnv === undefined ? 'NULL (setting tidak terpasang)' : `"${rawEnv}"`}\n` +
      `Koneksi dibatalkan demi keselamatan mutlak untuk mencegah penulisan pada database yang salah atau hasil tunnel.\n` +
      `Pasang marker pada database pengujian dengan:\n` +
      `  ALTER DATABASE ${expectedDb} SET wabiz.environment = '${REQUIRED_CANARY_MARKER}';`
    );
  }

  console.log(
    `✓ [${workerLabel}] Verifikasi Metadata & Canary Sukses: DB=${meta.db_name}, Env=${rawEnv}, User=${meta.user_name}, IP=${serverIp || 'local-socket'}:${meta.server_port || '5432'}`
  );
}

/**
 * Pengujian unit offline logika penolakan Canary Marker (tanpa membutuhkan koneksi database fisik).
 * Membuktikan bahwa marker yang hilang (NULL), kosong, whitespace, berbeda, atau kueri gagal
 * ditolak secara fail-closed sebelum operasi tulis (DML) apa pun dapat dijalankan.
 */
export async function runCanaryMarkerOfflineUnitTests(): Promise<boolean> {
  console.log('[OFFLINE TEST] Memvalidasi logika penolakan Canary Marker tanpa database...');

  const createMockClient = (metaOverrides: Partial<any>): PgClientInstance => ({
    query: async <T = any>() => ({
      rows: [
        {
          db_name: 'wabiz_local_test',
          user_name: 'postgres',
          server_ip: '127.0.0.1',
          server_port: 5432,
          is_replica: false,
          wabiz_env: REQUIRED_CANARY_MARKER,
          pg_version: 'PostgreSQL 18.0',
          ...metaOverrides,
        },
      ] as any as T[],
    }),
    connect: async () => {},
    end: async () => {},
  });

  let testsPassed = 0;
  let totalTests = 0;

  const runSubTest = async (
    name: string,
    action: () => Promise<void>,
    expectedErrorSnippet?: string
  ) => {
    totalTests++;
    try {
      await action();
      if (expectedErrorSnippet) {
        console.error(`  ✗ FAIL: ${name} (seharusnya melempar error, namun berhasil lolos!)`);
      } else {
        console.log(`  ✓ PASS: ${name}`);
        testsPassed++;
      }
    } catch (err: any) {
      if (expectedErrorSnippet) {
        if (err.message && err.message.includes(expectedErrorSnippet)) {
          console.log(`  ✓ PASS: ${name}`);
          testsPassed++;
        } else {
          console.error(`  ✗ FAIL: ${name} (pesan error tidak cocok: "${err.message}")`);
        }
      } else {
        console.error(`  ✗ FAIL: ${name} (melempar error tak terduga: "${err.message}")`);
      }
    }
  };

  // 1. Marker NULL
  await runSubTest(
    'Marker NULL ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ wabiz_env: null }), 'wabiz_local_test', 'Worker 1'),
    'TIDAK memiliki canary marker yang sah'
  );

  // 2. Marker undefined
  await runSubTest(
    'Marker undefined ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ wabiz_env: undefined }), 'wabiz_local_test', 'Worker 1'),
    'TIDAK memiliki canary marker yang sah'
  );

  // 3. Marker string kosong ("")
  await runSubTest(
    'Marker string kosong ("") ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ wabiz_env: '' }), 'wabiz_local_test', 'Worker 1'),
    'TIDAK memiliki canary marker yang sah'
  );

  // 4. Marker hanya whitespace ("   ")
  await runSubTest(
    'Marker whitespace ("   ") ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ wabiz_env: '   ' }), 'wabiz_local_test', 'Worker 1'),
    'TIDAK memiliki canary marker yang sah'
  );

  // 5. Marker salah ("production")
  await runSubTest(
    'Marker salah ("production") ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ wabiz_env: 'production' }), 'wabiz_local_test', 'Worker 1'),
    'TIDAK memiliki canary marker yang sah'
  );

  // 6. Marker parsial ("isolated_local")
  await runSubTest(
    'Marker parsial ("isolated_local") ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ wabiz_env: 'isolated_local' }), 'wabiz_local_test', 'Worker 1'),
    'TIDAK memiliki canary marker yang sah'
  );

  // 7. Marker dengan spasi ekstra ("isolated_local_test ")
  await runSubTest(
    'Marker tidak persis ("isolated_local_test ") ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ wabiz_env: 'isolated_local_test ' }), 'wabiz_local_test', 'Worker 1'),
    'TIDAK memiliki canary marker yang sah'
  );

  // 8. Marker huruf kapital ("ISOLATED_LOCAL_TEST")
  await runSubTest(
    'Marker huruf kapital ("ISOLATED_LOCAL_TEST") ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ wabiz_env: 'ISOLATED_LOCAL_TEST' }), 'wabiz_local_test', 'Worker 1'),
    'TIDAK memiliki canary marker yang sah'
  );

  // 9. Kueri verifikasi metadata gagal / melempar exception
  await runSubTest(
    'Kueri verifikasi yang melempar exception ditolak fail-closed',
    () => {
      const failingClient: PgClientInstance = {
        query: async () => {
          throw new Error('Connection reset by peer during metadata query');
        },
        connect: async () => {},
        end: async () => {},
      };
      return verifyDatabaseMetadata(failingClient, 'wabiz_local_test', 'Worker 1');
    },
    'Kueri verifikasi metadata gagal dijalankan'
  );

  // 10. Kueri mengembalikan baris kosong (rows: [])
  await runSubTest(
    'Kueri metadata dengan baris kosong ditolak fail-closed',
    () => {
      const emptyRowClient: PgClientInstance = {
        query: async <T = any>() => ({ rows: [] as T[] }),
        connect: async () => {},
        end: async () => {},
      };
      return verifyDatabaseMetadata(emptyRowClient, 'wabiz_local_test', 'Worker 1');
    },
    'Gagal membaca metadata server PostgreSQL'
  );

  // 11. Database name di luar whitelist ("postgres")
  await runSubTest(
    'Database aktif bukan whitelist ("postgres") ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ db_name: 'postgres' }), 'postgres', 'Worker 1'),
    'tidak termasuk dalam whitelist database uji'
  );

  // 12. Database name tidak cocok dengan target ("wabiz_test" vs "wabiz_local_test")
  await runSubTest(
    'Database aktif berbeda dari target ("wabiz_test" vs target "wabiz_local_test") ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ db_name: 'wabiz_test' }), 'wabiz_local_test', 'Worker 1'),
    'tidak cocok dengan nama database target yang diharapkan'
  );

  // 13. IP server bukan loopback ("192.168.1.100")
  await runSubTest(
    'IP server non-loopback ("192.168.1.100") ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ server_ip: '192.168.1.100' }), 'wabiz_local_test', 'Worker 1'),
    'bukan loopback lokal'
  );

  // 14. Database adalah read replica (is_replica: true)
  await runSubTest(
    'Database read replica ditolak fail-closed',
    () => verifyDatabaseMetadata(createMockClient({ is_replica: true }), 'wabiz_local_test', 'Worker 1'),
    'terdeteksi sebagai read-replica'
  );

  // 15. Metadata valid dengan loopback IP ("127.0.0.1") diterima
  await runSubTest(
    'Metadata sah dengan loopback IP ("127.0.0.1") berhasil diverifikasi',
    () => verifyDatabaseMetadata(createMockClient({ server_ip: '127.0.0.1', wabiz_env: REQUIRED_CANARY_MARKER }), 'wabiz_local_test', 'Worker 1')
  );

  // 16. Metadata valid dengan domain socket / pipe lokal (server_ip: null) diterima
  await runSubTest(
    'Metadata sah dengan socket lokal (server_ip: null) berhasil diverifikasi',
    () => verifyDatabaseMetadata(createMockClient({ server_ip: null, wabiz_env: REQUIRED_CANARY_MARKER }), 'wabiz_local_test', 'Worker 1')
  );

  // 17. Multi-Koneksi: Worker 1 sah, Worker 2 tanpa canary marker
  // Membuktikan bahwa kegagalan Worker 2 menggugurkan runner, DML dicegah, dan KEDUA koneksi ditutup (.end() dipanggil)
  totalTests++;
  try {
    const workerState = {
      worker1Closed: false,
      worker2Closed: false,
      dmlAttempted: false,
    };

    const mockWorker1 = createMockClient({ wabiz_env: REQUIRED_CANARY_MARKER });
    mockWorker1.end = async () => {
      workerState.worker1Closed = true;
    };

    const mockWorker2 = createMockClient({ wabiz_env: null }); // Marker hilang pada worker 2!
    mockWorker2.end = async () => {
      workerState.worker2Closed = true;
    };

    let caughtError: any = null;
    try {
      await mockWorker1.connect();
      await mockWorker2.connect();

      // Verifikasi kedua worker
      await verifyDatabaseMetadata(mockWorker1, 'wabiz_local_test', 'Worker 1');
      await verifyDatabaseMetadata(mockWorker2, 'wabiz_local_test', 'Worker 2');

      // Seharusnya TIDAK tercapai
      workerState.dmlAttempted = true;
    } catch (err: any) {
      caughtError = err;
    } finally {
      // Pastikan kedua koneksi ditutup
      await mockWorker1.end();
      await mockWorker2.end();
    }

    if (
      caughtError &&
      caughtError.message.includes('Worker 2') &&
      caughtError.message.includes('TIDAK memiliki canary marker yang sah') &&
      workerState.worker1Closed === true &&
      workerState.worker2Closed === true &&
      workerState.dmlAttempted === false
    ) {
      console.log('  ✓ PASS: Worker 2 marker missing menggugurkan runner, DML dicegah, dan kedua koneksi ditutup.');
      testsPassed++;
    } else {
      console.error('  ✗ FAIL: Simulasi kegagalan Worker 2 tidak memenuhi fail-closed atau koneksi tidak tertutup.');
      console.error(`    caughtError: ${caughtError?.message}`);
      console.error(`    worker1Closed=${workerState.worker1Closed}, worker2Closed=${workerState.worker2Closed}, dmlAttempted=${workerState.dmlAttempted}`);
    }
  } catch (err: any) {
    console.error(`  ✗ FAIL: Simulasi multi-koneksi error tak terduga: ${err.message}`);
  }

  console.log(`[OFFLINE TEST] Selesai: ${testsPassed}/${totalTests} uji logika canary lolos.\n`);
  return testsPassed === totalTests;
}

async function loadPgClientClass(): Promise<new (config: any) => PgClientInstance> {
  try {
    const pgModule = require('pg');
    return pgModule.Client;
  } catch {
    throw new Error(
      'Driver native `pg` belum terpasang di server/.\n' +
      'Jalankan perintah berikut sebelum menjalankan tes ini:\n' +
      '  cd server && npm install -D pg @types/pg'
    );
  }
}

async function runPgMultiClientTests() {
  console.log('====================================================================');
  console.log('   WABIZ: PENGUJIAN MULTI-KONEKSI POSTGRESQL FISIK TERISOLASI       ');
  console.log('====================================================================');

  // 1. Jalankan pengujian unit logika canary marker secara offline terlebih dahulu
  const offlinePassed = await runCanaryMarkerOfflineUnitTests();
  if (!offlinePassed) {
    throw new Error('[OFFLINE TEST FAILED] Satu atau lebih pengujian unit logika canary marker gagal!');
  }

  const testDbUrl = process.env.LOCAL_TEST_DB_URL;

  // 2. Pemeriksaan Keamanan Lingkungan: Wajib database lokal test
  if (!testDbUrl) {
    console.log('[INFO PRASYARAT AUDIT TAHAP 9C]');
    console.log('Environment variable `LOCAL_TEST_DB_URL` belum disetel.');
    console.log('Sesuai batasan keselamatan mutlak:');
    console.log('- Backend TIDAK AKAN menghubungkan koneksi ke database apa pun secara implisit.');
    console.log('- Backend TIDAK AKAN menebak kredensial database.\n');

    console.log('Langkah persiapan fisik terisolasi yang diperlukan:');
    console.log('1. Pasang driver pg di folder server/ (jika belum):');
    console.log('   cd server && npm install -D pg @types/pg');
    console.log('2. Buat database pengujian lokal terisolasi di PostgreSQL 18:');
    console.log('   createdb -U postgres wabiz_local_test');
    console.log('3. Pasang canary marker wajib pada database pengujian:');
    console.log('   psql -U postgres -d wabiz_local_test -c "ALTER DATABASE wabiz_local_test SET wabiz.environment = \'isolated_local_test\';"');
    console.log('4. Terapkan peran stub auth & migrasi baseline 1-9 serta draf OpenWA.');
    console.log('5. Jalankan runner ini dengan URL terisolasi:');
    console.log('   set LOCAL_TEST_DB_URL=postgresql://postgres:password@localhost:5432/wabiz_local_test');
    console.log('   npx tsx src/test-pg-multi-client.ts');
    console.log('====================================================================\n');
    return;
  }

  // 3. Proteksi Keselamatan Fail-Closed Struktural
  const verifiedTarget = validateAndParseTargetUrl(testDbUrl);
  console.log(`\nMenghubungkan ke target terverifikasi: ${maskUrl(testDbUrl)}`);

  // 4. Muat Driver Native pg
  const PgClient = await loadPgClientClass();

  // Inisialisasi dua koneksi client independen untuk simulasi dua worker simultan
  const clientWorker1 = new PgClient({ connectionString: verifiedTarget.connectionString });
  const clientWorker2 = new PgClient({ connectionString: verifiedTarget.connectionString });

  let testOrgId = '';
  let testContactId = '';
  let testConvId = '';
  let testMsgId = '';
  let duplicateProviderMsgId = '';

  try {
    await clientWorker1.connect();
    await clientWorker2.connect();

    // 5. Verifikasi Metadata Koneksi & Canary Marker pada KEDUA Worker Independen
    // Wajib selesai dan lolos sebelum pembuatan fixture atau operasi DML apa pun
    await verifyDatabaseMetadata(clientWorker1, verifiedTarget.databaseName, 'Worker 1');
    await verifyDatabaseMetadata(clientWorker2, verifiedTarget.databaseName, 'Worker 2');

    const pid1Res = await clientWorker1.query('SELECT pg_backend_pid() AS pid');
    const pid2Res = await clientWorker2.query('SELECT pg_backend_pid() AS pid');
    const pid1 = pid1Res.rows[0].pid;
    const pid2 = pid2Res.rows[0].pid;

    if (pid1 === pid2) {
      throw new Error(`[CONCURRENCY ERROR] Kedua worker berbagi PID yang sama (${pid1}). Koneksi fisik tidak terpisah!`);
    }
    console.log(`✓ Worker 1 Backend PID: ${pid1} | Worker 2 Backend PID: ${pid2} (Dua Koneksi Terpisah Aktif)`);

    // 5. Fixture Seeding Lengkap & Valid
    // Suffix 4 bytes (8 karakter hex) dipadukan dengan 4 digit index agar blok ke-5 berukuran tepat 12 karakter hex
    const runSuffix = crypto.randomBytes(4).toString('hex');
    testOrgId = `e0000000-0000-4000-8000-${runSuffix}0001`;
    testContactId = `e0000000-0000-4000-8000-${runSuffix}0002`;
    testConvId = `e0000000-0000-4000-8000-${runSuffix}0003`;
    testMsgId = `e0000000-0000-4000-8000-${runSuffix}0004`;
    duplicateProviderMsgId = `test_msg_${Date.now()}_${runSuffix}`;

    // Validasi format seluruh UUID fixture sebelum digunakan (T-01)
    assertValidUuid(testOrgId, 'testOrgId');
    assertValidUuid(testContactId, 'testContactId');
    assertValidUuid(testConvId, 'testConvId');
    assertValidUuid(testMsgId, 'testMsgId');

    console.log(`\n[FIXTURE] Menyiapkan data uji terisolasi (Org ID: ${testOrgId})...`);

    await clientWorker1.query(
      `INSERT INTO public.organizations (id, name, created_at, updated_at) 
       VALUES ($1, $2, now(), now())`,
      [testOrgId, `WABiz Test Org ${runSuffix}`]
    );

    await clientWorker1.query(
      `INSERT INTO public.contacts (id, organization_id, name, phone, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, now(), now())`,
      [testContactId, testOrgId, 'Test Customer Multi-Client', `+62812${Date.now().toString().slice(-8)}`]
    );

    await clientWorker1.query(
      `INSERT INTO public.conversations (id, organization_id, contact_id, status, created_at, updated_at) 
       VALUES ($1, $2, $3, 'open', now(), now())`,
      [testConvId, testOrgId, testContactId]
    );

    await clientWorker1.query(
      `INSERT INTO public.messages (
         id, organization_id, conversation_id, sender_type, body, 
         provider_type, provider_message_id, delivery_status, ai_status, created_at
       ) VALUES ($1, $2, $3, 'customer', $4, 'openwa', $5, 'delivered', 'pending', now())`,
      [testMsgId, testOrgId, testConvId, 'Pesan Uji Konkuren', `inbound_seed_${runSuffix}`]
    );
    console.log('✓ Fixture berhasil disisipkan dengan foreign key dan kolom wajib lengkap.');

    // ------------------------------------------------------------------
    // TEST 1: Dua Klaim Bersamaan (SELECT ... FOR UPDATE)
    // ------------------------------------------------------------------
    console.log('\n[TEST 1] Dua Klaim Bersamaan pada Pesan yang Sama (SELECT ... FOR UPDATE)');
    const [claim1Res, claim2Res] = await Promise.all([
      clientWorker1.query(
        `SELECT public.claim_inbound_message_for_ai($1::uuid, $2::uuid, $3::int) AS result`,
        [testOrgId, testMsgId, 180]
      ),
      clientWorker2.query(
        `SELECT public.claim_inbound_message_for_ai($1::uuid, $2::uuid, $3::int) AS result`,
        [testOrgId, testMsgId, 180]
      ),
    ]);

    const claim1 = claim1Res.rows[0]?.result;
    const claim2 = claim2Res.rows[0]?.result;
    const claimedCount = [claim1?.claimed, claim2?.claimed].filter(Boolean).length;

    assertTest(
      '[TEST 1.1] Tepat satu worker berhasil mengklaim secara atomik (SELECT ... FOR UPDATE)',
      claimedCount === 1,
      'claimedCount === 1',
      `claimedCount = ${claimedCount}`,
      `Worker1 claimed=${claim1?.claimed}, Worker2 claimed=${claim2?.claimed}`
    );

    const winner = claim1?.claimed ? claim1 : claim2;
    const loser = claim1?.claimed ? claim2 : claim1;

    assertTest(
      '[TEST 1.2] Worker pemenang menerima status "processing" dan lease token UUID sah',
      winner?.current_status === 'processing' && Boolean(winner?.lease_token),
      'current_status=processing, lease_token exists',
      `current_status=${winner?.current_status}, lease_token=${winner?.lease_token}`
    );
    if (winner?.lease_token) {
      assertValidUuid(winner.lease_token, 'winner.lease_token');
    }

    assertTest(
      '[TEST 1.3] Worker yang kalah ditolak aman dengan alasan "in_progress_lock"',
      loser?.claimed === false && loser?.reason === 'in_progress_lock',
      'claimed=false, reason=in_progress_lock',
      `claimed=${loser?.claimed}, reason=${loser?.reason}`
    );

    // ------------------------------------------------------------------
    // TEST 2: Verifikasi Lease Fencing pada Token Kedaluwarsa
    // ------------------------------------------------------------------
    console.log('\n[TEST 2] Verifikasi Lease Fencing (Token Lama Ditolak)');
    const activeToken = winner?.lease_token;
    const expiredToken = '00000000-0000-4000-8000-000000000999';
    assertValidUuid(expiredToken, 'expiredToken');

    const badDispatchRes = await clientWorker1.query(
      `SELECT public.mark_inbound_message_dispatching($1::uuid, $2::uuid, $3::uuid) AS result`,
      [testOrgId, testMsgId, expiredToken]
    );
    const badDispatch = badDispatchRes.rows[0]?.result;
    assertTest(
      '[TEST 2.1] Pre-dispatch ditolak (false) saat lease token kedaluwarsa/salah',
      badDispatch === false,
      'false',
      String(badDispatch)
    );

    const badStatusRes = await clientWorker1.query(
      `SELECT public.update_inbound_message_ai_status($1::uuid, $2::uuid, $3::text, $4::uuid) AS result`,
      [testOrgId, testMsgId, 'completed', expiredToken]
    );
    const badStatusUpdate = badStatusRes.rows[0]?.result;
    assertTest(
      '[TEST 2.2] Update status ditolak (false) saat lease token kedaluwarsa/salah',
      badStatusUpdate === false,
      'false',
      String(badStatusUpdate)
    );

    if (activeToken) {
      const validDispatchRes = await clientWorker1.query(
        `SELECT public.mark_inbound_message_dispatching($1::uuid, $2::uuid, $3::uuid) AS result`,
        [testOrgId, testMsgId, activeToken]
      );
      const validDispatch = validDispatchRes.rows[0]?.result;
      assertTest(
        '[TEST 2.3] Pre-dispatch berhasil (true) saat menggunakan lease token aktif sah',
        validDispatch === true,
        'true',
        String(validDispatch)
      );
    }

    // ------------------------------------------------------------------
    // TEST 3: Unique Index Mencegah Duplikasi Pesan
    // ------------------------------------------------------------------
    console.log('\n[TEST 3] Unique Index Mencegah Duplikasi Pesan Masuk (uq_messages_org_provider_msg_id)');
    let insert1Success = false;
    let insert1Error: any = null;
    let insert2Success = false;
    let insert2Error: any = null;

    try {
      await clientWorker1.query(
        `INSERT INTO public.messages (
           id, organization_id, conversation_id, sender_type, body, 
           provider_type, provider_message_id, delivery_status, ai_status
         ) VALUES (gen_random_uuid(), $1, $2, 'customer', 'Pesan Konkuren 1', 'openwa', $3, 'delivered', 'pending')`,
        [testOrgId, testConvId, duplicateProviderMsgId]
      );
      insert1Success = true;
    } catch (e: any) {
      insert1Error = e;
    }

    try {
      await clientWorker2.query(
        `INSERT INTO public.messages (
           id, organization_id, conversation_id, sender_type, body, 
           provider_type, provider_message_id, delivery_status, ai_status
         ) VALUES (gen_random_uuid(), $1, $2, 'customer', 'Pesan Konkuren 2', 'openwa', $3, 'delivered', 'pending')`,
        [testOrgId, testConvId, duplicateProviderMsgId]
      );
      insert2Success = true;
    } catch (e: any) {
      insert2Error = e;
    }

    assertTest(
      '[TEST 3.1] Pesan pertama dengan provider_message_id baru berhasil disisipkan',
      insert1Success === true && insert1Error === null,
      'insert1Success=true, error=null',
      `insert1Success=${insert1Success}`,
      insert1Error ? `Error tak terduga: ${insert1Error.message || insert1Error.code}` : undefined
    );

    const is23505 = insert2Error?.code === '23505';
    assertTest(
      '[TEST 3.2] Pesan kedua dengan provider_message_id duplikat ditolak dengan SQLSTATE 23505 (unique_violation)',
      insert2Success === false && is23505,
      'insert2Success=false, SQLSTATE 23505',
      `insert2Success=${insert2Success}, SQLSTATE=${insert2Error?.code || 'none'}`,
      insert2Error && !is23505 ? `Error tak terduga (bukan 23505): ${insert2Error.message || insert2Error.code}` : undefined
    );

    // ------------------------------------------------------------------
    // TEST 4: Status needs_reconciliation Menolak Klaim Ulang Otomatis
    // ------------------------------------------------------------------
    console.log('\n[TEST 4] Status needs_reconciliation Menolak Pengiriman Ulang Otomatis');
    await clientWorker1.query(
      `UPDATE public.messages SET ai_status = 'needs_reconciliation', ai_locked_at = NULL WHERE id = $1 AND organization_id = $2`,
      [testMsgId, testOrgId]
    );

    const reconRes = await clientWorker1.query(
      `SELECT public.claim_inbound_message_for_ai($1::uuid, $2::uuid, 180) AS result`,
      [testOrgId, testMsgId]
    );
    const reconClaim = reconRes.rows[0]?.result;

    assertTest(
      '[TEST 4.1] Pesan berstatus needs_reconciliation ditolak untuk diklaim ulang (claimed: false)',
      reconClaim?.claimed === false,
      'claimed === false',
      `claimed = ${reconClaim?.claimed}`
    );

    assertTest(
      '[TEST 4.2] Alasan penolakan eksplisit adalah needs_reconciliation',
      reconClaim?.reason === 'needs_reconciliation',
      'reason === needs_reconciliation',
      `reason = ${reconClaim?.reason}`
    );

    // ------------------------------------------------------------------
    // TEST 5: Pesan Outbound Failed Tidak Dianggap Balasan Sukses
    // ------------------------------------------------------------------
    console.log('\n[TEST 5] Balasan Outbound Failed Tidak Dianggap Balasan Sukses');
    const failedReplyMsgId = `e0000000-0000-4000-8000-${runSuffix}0005`;
    assertValidUuid(failedReplyMsgId, 'failedReplyMsgId');

    await clientWorker1.query(
      `INSERT INTO public.messages (
         id, organization_id, conversation_id, sender_type, body, 
         provider_type, delivery_status, reply_to_message_id
       ) VALUES ($1, $2, $3, 'bot', 'Balasan Gagal', 'openwa', 'failed', $4)`,
      [failedReplyMsgId, testOrgId, testConvId, testMsgId]
    );

    const failedCheckRes = await clientWorker1.query(
      `SELECT id, delivery_status FROM public.messages 
       WHERE reply_to_message_id = $1 AND delivery_status IN ('sent', 'delivered', 'read') 
       LIMIT 1`,
      [testMsgId]
    );
    const failedReplyCheck = failedCheckRes.rows[0] || null;

    assertTest(
      '[TEST 5.1] Pesan outbound failed tidak dianggap balasan sukses (hasil query harus null)',
      failedReplyCheck === null,
      'null',
      failedReplyCheck ? `Ditemukan row (status: ${failedReplyCheck.delivery_status})` : 'null'
    );

    const successReplyMsgId = `e0000000-0000-4000-8000-${runSuffix}0006`;
    assertValidUuid(successReplyMsgId, 'successReplyMsgId');

    await clientWorker1.query(
      `INSERT INTO public.messages (
         id, organization_id, conversation_id, sender_type, body, 
         provider_type, delivery_status, reply_to_message_id
       ) VALUES ($1, $2, $3, 'bot', 'Balasan Berhasil', 'openwa', 'delivered', $4)`,
      [successReplyMsgId, testOrgId, testConvId, testMsgId]
    );

    const successCheckRes = await clientWorker1.query(
      `SELECT id, delivery_status FROM public.messages 
       WHERE reply_to_message_id = $1 AND delivery_status IN ('sent', 'delivered', 'read') 
       LIMIT 1`,
      [testMsgId]
    );
    const successReplyCheck = successCheckRes.rows[0] || null;

    assertTest(
      '[TEST 5.2] Pesan outbound delivered berhasil ditemukan sebagai balasan sukses',
      successReplyCheck !== null && successReplyCheck.delivery_status === 'delivered',
      'found with delivery_status=delivered',
      successReplyCheck ? `found with delivery_status=${successReplyCheck.delivery_status}` : 'null'
    );

    // ------------------------------------------------------------------
    // RINGKASAN ASSERTION SUITE
    // ------------------------------------------------------------------
    const failedCount = suiteResults.filter((r) => !r.passed).length;
    const totalCount = suiteResults.length;

    console.log('\n====================================================================');
    console.log('   HASIL EVALUASI ASSERTION PENGUJIAN POSTGRESQL FISIK              ');
    console.log('====================================================================');
    console.log(`TOTAL SKENARIO ASSERTION : ${totalCount}`);
    console.log(`LULUS (PASSED)           : ${totalCount - failedCount}`);
    console.log(`GAGAL (FAILED)           : ${failedCount}`);
    console.log('====================================================================\n');

    if (failedCount > 0) {
      throw new Error(`[SUITE FAILED] Terdapat ${failedCount} dari ${totalCount} assertion yang gagal pada pengujian multi-koneksi PostgreSQL!`);
    }
  } finally {
    // ------------------------------------------------------------------
    // CLEANUP TERISOLASI: Hapus data hanya yang dibuat pada run pengujian ini
    // ------------------------------------------------------------------
    if (testOrgId) {
      console.log('[CLEANUP] Membersihkan fixture pengujian terisolasi...');
      try {
        await clientWorker1.query('DELETE FROM public.messages WHERE organization_id = $1', [testOrgId]);
        await clientWorker1.query('DELETE FROM public.conversations WHERE organization_id = $1', [testOrgId]);
        await clientWorker1.query('DELETE FROM public.contacts WHERE organization_id = $1', [testOrgId]);
        await clientWorker1.query('DELETE FROM public.organizations WHERE id = $1', [testOrgId]);
        console.log('✓ Seluruh data fixture berhasil dibersihkan dari database uji.');
      } catch (cleanErr: any) {
        console.error('Peringatan: Gagal membersihkan data fixture:', cleanErr.message);
      }
    }

    // Pastikan kedua koneksi fisik selalu ditutup bahkan jika verifikasi metadata gagal
    try {
      await clientWorker1.end();
    } catch (err: any) {
      console.error('Peringatan: Gagal menutup clientWorker1:', err?.message);
    }
    try {
      await clientWorker2.end();
    } catch (err: any) {
      console.error('Peringatan: Gagal menutup clientWorker2:', err?.message);
    }
    console.log('✓ Koneksi fisik kedua worker telah ditutup dengan aman.');
  }
}

runPgMultiClientTests().catch((err) => {
  console.error('\nTest Runner Error:', err.message || err);
  process.exit(1);
});

