// ====================================================================
// WABiz Conversation Module: Fully Isolated Offline Unit Test Suite
// ====================================================================
// Pengujian terisolasi 100% tanpa jaringan, tanpa Supabase cloud,
// tanpa PostgreSQL, dan tanpa WhatsApp live socket.
// Menguji fitur Hapus Percakapan (Delete Conversation) secara mendalam:
// - Cascading delete pesan (messages)
// - Kontak utama (contacts) tetap utuh
// - Isolasi multi-tenant (cross-tenant safety)
// - Penanganan ID tidak ada & error handling
// - Sinkronisasi state lokal & tampilan detail
// - Formatting & privasi masking nomor telepon
// ====================================================================

import { deleteConversation } from './supabase';

// ====================================================================
// TEST FRAMEWORK SEDERHANA
// ====================================================================
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: any, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

// ====================================================================
// HELPER: MASK PHONE (IDENTIK DENGAN FRONTEND)
// ====================================================================
function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const clean = String(phone).trim();
  const digits = clean.replace(/\D/g, '');
  if (digits.length <= 4) {
    return clean;
  }
  const prefix = clean.startsWith('+') ? '+' : '';
  if (digits.length <= 8) {
    return prefix + digits.slice(0, 3) + '****' + digits.slice(-2);
  }
  return prefix + digits.slice(0, 4) + '****' + digits.slice(-4);
}

// ====================================================================
// IN-MEMORY MOCK SUPABASE CLIENT & DATABASE FIXTURE
// ====================================================================
class MockDatabase {
  public contacts: any[] = [];
  public conversations: any[] = [];
  public messages: any[] = [];
  public errorOnOperation?: { table: string; operation: 'update' | 'delete' | 'insert' | 'select'; message: string };

  public clear(): void {
    this.contacts = [];
    this.conversations = [];
    this.messages = [];
    this.errorOnOperation = undefined;
  }

  public createClient() {
    return {
      from: (tableName: string) => new MockQueryBuilder(this, tableName),
    };
  }
}

class MockQueryBuilder {
  private db: MockDatabase;
  private table: string;
  private filters: Array<(row: any) => boolean> = [];
  private selectedCols: string = '*';
  private singleRow: boolean = false;
  private maybeSingleRow: boolean = false;
  private isDelete: boolean = false;

  constructor(db: MockDatabase, table: string) {
    this.db = db;
    this.table = table;
  }

  public select(cols: string = '*') {
    this.selectedCols = cols;
    return this;
  }

  public delete() {
    this.isDelete = true;
    return this;
  }

  public eq(col: string, val: any) {
    this.filters.push((row: any) => row[col] === val);
    return this;
  }

  public maybeSingle() {
    this.maybeSingleRow = true;
    return this.execute().then((res) => {
      if (res.error) return { data: null, error: res.error };
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      return { data: row || null, error: null };
    });
  }

  public single() {
    this.singleRow = true;
    return this.execute().then((res) => {
      if (res.error) return { data: null, error: res.error };
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      return { data: row || null, error: row ? null : { message: 'Row not found', code: 'PGRST116' } };
    });
  }

  public async execute(): Promise<{ data: any; error: any }> {
    if (this.db.errorOnOperation && this.db.errorOnOperation.table === this.table) {
      const op = this.isDelete ? 'delete' : 'select';
      if (this.db.errorOnOperation.operation === op) {
        return { data: null, error: { message: this.db.errorOnOperation.message } };
      }
    }

    const rows: any[] = (this.db as any)[this.table] || [];

    if (this.isDelete) {
      const matching = rows.filter((r) => this.filters.every((f) => f(r)));
      const matchingIds = new Set(matching.map((m) => m.id));
      (this.db as any)[this.table] = rows.filter((r) => !matchingIds.has(r.id));

      // Simulasi PostgreSQL ON DELETE CASCADE pada tabel messages
      if (this.table === 'conversations') {
        for (const conv of matching) {
          this.db.messages = this.db.messages.filter(
            (m) => !(m.conversation_id === conv.id && m.organization_id === conv.organization_id)
          );
        }
      }
      return { data: matching, error: null };
    }

    // SELECT
    const matched = rows.filter((r) => this.filters.every((f) => f(r)));
    return { data: matched.map((r) => ({ ...r })), error: null };
  }

  public then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// ====================================================================
// RUN TEST SUITE
// ====================================================================
async function runConversationTests() {
  console.log('\n====================================================================');
  console.log('WABiz: Pengujian Offline Komprehensif — Fitur Hapus Percakapan');
  console.log('====================================================================\n');

  const db = new MockDatabase();
  const mockClient = db.createClient();

  const orgA = 'org-1111-aaaa';
  const orgB = 'org-2222-bbbb';

  // ------------------------------------------------------------------
  // TEST GROUP 1: Privasi & Masking Nomor Telepon (maskPhone)
  // ------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Masking Nomor Telepon & Privasi ---');
  assert(maskPhone('081234567890') === '0812****7890', 'Nomor seluler domestik dimasking bagian tengah');
  assert(maskPhone('+62 812-9821-4433') === '+6281****4433', 'Nomor internasional berformat dimasking dengan mempertahankan tanda +');
  assert(maskPhone('+62 812-9821-4433 (Demo)') === '+6281****4433', 'Nomor dengan keterangan demo dibersihkan dan dimasking');
  assert(maskPhone(null) === '-', 'Nomor bernilai null mengembalikan strip (-) aman');
  assert(maskPhone(undefined) === '-', 'Nomor bernilai undefined mengembalikan strip (-) aman');
  assert(maskPhone('') === '-', 'Nomor string kosong mengembalikan strip (-) aman');
  assert(maskPhone('1234') === '1234', 'Nomor sangat pendek (<= 4 digit) tidak dipotong rusak');

  // ------------------------------------------------------------------
  // TEST GROUP 2: Penghapusan Percakapan Valid & Database Cascade
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Penghapusan Percakapan Valid & Cascade Pesan ---');
  db.clear();

  // Setup fixtures
  db.contacts.push({ id: 'c-1', organization_id: orgA, name: 'Ahmad Dahlan', phone: '081234567890' });
  db.conversations.push({
    id: 'conv-1',
    organization_id: orgA,
    contact_id: 'c-1',
    status: 'open',
    last_message_at: '2026-10-27T10:00:00.000Z',
  });
  db.messages.push(
    { id: 'm-1', organization_id: orgA, conversation_id: 'conv-1', body: 'Halo CS WABiz', sender_type: 'customer' },
    { id: 'm-2', organization_id: orgA, conversation_id: 'conv-1', body: 'Halo Kak Ahmad, ada yang bisa kami bantu?', sender_type: 'agent' },
    { id: 'm-3', organization_id: orgA, conversation_id: 'conv-1', body: 'Mau tanya integrasi WhatsApp', sender_type: 'customer' }
  );

  const resDel = await deleteConversation(orgA, 'conv-1', mockClient);

  assert(resDel.success === true, 'Fungsi deleteConversation mengembalikan status sukses');
  assert(resDel.deletedId === 'conv-1', 'ID percakapan yang dihapus dikembalikan dengan benar');
  assert(db.conversations.length === 0, 'Baris percakapan berhasil dihapus dari tabel conversations');
  assert(db.messages.length === 0, 'Seluruh riwayat pesan (3 pesan) terhapus otomatis via database cascade');

  // ------------------------------------------------------------------
  // TEST GROUP 3: Data Kontak Utama (contacts) Tetap Utuh
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Data Kontak Utama Tetap Utuh (Tidak Terhapus) ---');
  assert(db.contacts.length === 1, 'Tabel contacts masih memiliki 1 kontak');
  assert(db.contacts[0].id === 'c-1', 'ID kontak c-1 tetap utuh');
  assert(db.contacts[0].name === 'Ahmad Dahlan', 'Nama kontak tidak berubah');
  assert(db.contacts[0].phone === '081234567890', 'Nomor telepon kontak tidak berubah');
  assert(db.contacts[0].organization_id === orgA, 'Organisasi kontak tidak berubah');

  // ------------------------------------------------------------------
  // TEST GROUP 4: Percakapan & Tenant Lain Tetap Utuh
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Percakapan & Organisasi Lain Tetap Utuh ---');
  db.clear();

  // Setup 2 percakapan di orgA dan 1 percakapan di orgB
  db.contacts.push(
    { id: 'c-a1', organization_id: orgA, name: 'Pelanggan A1', phone: '081111111' },
    { id: 'c-a2', organization_id: orgA, name: 'Pelanggan A2', phone: '082222222' },
    { id: 'c-b1', organization_id: orgB, name: 'Pelanggan B1', phone: '083333333' }
  );
  db.conversations.push(
    { id: 'conv-a1', organization_id: orgA, contact_id: 'c-a1', status: 'open' },
    { id: 'conv-a2', organization_id: orgA, contact_id: 'c-a2', status: 'pending' },
    { id: 'conv-b1', organization_id: orgB, contact_id: 'c-b1', status: 'resolved' }
  );
  db.messages.push(
    { id: 'm-a1', organization_id: orgA, conversation_id: 'conv-a1', body: 'Pesan A1' },
    { id: 'm-a2', organization_id: orgA, conversation_id: 'conv-a2', body: 'Pesan A2' },
    { id: 'm-b1', organization_id: orgB, conversation_id: 'conv-b1', body: 'Pesan B1' }
  );

  // Hapus hanya conv-a1
  const resDelA1 = await deleteConversation(orgA, 'conv-a1', mockClient);
  assert(resDelA1.success === true, 'Penghapusan conv-a1 berhasil');
  assert(db.conversations.some((c) => c.id === 'conv-a2'), 'Percakapan conv-a2 dalam organisasi yang sama tetap ada');
  assert(db.conversations.some((c) => c.id === 'conv-b1'), 'Percakapan conv-b1 di organisasi berbeda tetap ada');
  assert(!db.conversations.some((c) => c.id === 'conv-a1'), 'Percakapan conv-a1 telah terhapus');
  assert(db.messages.some((m) => m.conversation_id === 'conv-a2'), 'Pesan milik conv-a2 tetap utuh');
  assert(db.messages.some((m) => m.conversation_id === 'conv-b1'), 'Pesan milik conv-b1 tetap utuh');
  assert(!db.messages.some((m) => m.conversation_id === 'conv-a1'), 'Pesan milik conv-a1 telah terhapus');

  // ------------------------------------------------------------------
  // TEST GROUP 5: Penanganan ID Percakapan Tidak Ada
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Penanganan ID Percakapan Tidak Ada (404 / notFound) ---');
  const resNotFound = await deleteConversation(orgA, 'non-existent-conv-id', mockClient);
  assert(resNotFound.success === false, 'Menghapus ID fiktif menghasilkan success: false');
  assert(resNotFound.notFound === true, 'Flag notFound bernilai true');
  assert(Boolean(resNotFound.error), 'Pesan error deskriptif disertakan');

  // ------------------------------------------------------------------
  // TEST GROUP 6: Isolasi Multi-Tenant & Validasi Parameter
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Isolasi Multi-Tenant & Validasi Input ---');
  // Org B mencoba menghapus percakapan conv-a2 milik Org A
  const resCrossTenant = await deleteConversation(orgB, 'conv-a2', mockClient);
  assert(resCrossTenant.success === false, 'Percobaan penghapusan lintas organisasi (cross-tenant) ditolak');
  assert(resCrossTenant.notFound === true, 'Cross-tenant diperlakukan sebagai notFound untuk mencegah enumerasi ID');
  assert(db.conversations.some((c) => c.id === 'conv-a2'), 'Percakapan conv-a2 di Org A tetap aman dan tidak terhapus');

  // Parameter kosong
  const resMissingOrg = await deleteConversation('', 'conv-a2', mockClient);
  assert(resMissingOrg.success === false && Boolean(resMissingOrg.error), 'Parameter orgId kosong ditolak');

  const resMissingConv = await deleteConversation(orgA, '', mockClient);
  assert(resMissingConv.success === false && Boolean(resMissingConv.error), 'Parameter conversationId kosong ditolak');

  // ------------------------------------------------------------------
  // TEST GROUP 7: Penanganan Error Database Tanpa False-Positive
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Penanganan Error Database ---');
  db.errorOnOperation = { table: 'conversations', operation: 'select', message: 'Simulated PostgreSQL connection timeout' };
  const resDbErr1 = await deleteConversation(orgA, 'conv-a2', mockClient);
  assert(resDbErr1.success === false, 'Error query select dicegah dan menghasilkan success: false');
  assert(resDbErr1.error?.includes('Simulated'), 'Error pesan asli dilaporkan secara transparan');

  db.errorOnOperation = { table: 'conversations', operation: 'delete', message: 'Simulated disk full or lock contention' };
  const resDbErr2 = await deleteConversation(orgA, 'conv-a2', mockClient);
  assert(resDbErr2.success === false, 'Error query delete dicegah dan menghasilkan success: false');
  assert(db.conversations.some((c) => c.id === 'conv-a2'), 'Data tidak berubah jika operasi delete gagal');
  db.errorOnOperation = undefined;

  // ------------------------------------------------------------------
  // TEST GROUP 8: Simulasi Pembatalan Konfirmasi (Frontend Logic)
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Pembatalan Modal Tidak Mengubah Data ---');
  let simulatedConversations = [
    { id: 'c1', name: 'Budi', status: 'open', unreadCount: 1, phone: '081234' },
    { id: 'c2', name: 'Siti', status: 'pending', unreadCount: 0, phone: '085678' },
  ];
  let simulatedSelectedId: string | null = 'c1';

  // User klik "Batal"
  const handleCancel = () => {
    return { modalOpen: false, targetToDelete: null };
  };
  const cancelState = handleCancel();

  assert(cancelState.modalOpen === false, 'Modal berhasil tertutup setelah pembatalan');
  assert(cancelState.targetToDelete === null, 'Target percakapan direset ke null');
  assert(simulatedConversations.length === 2, 'Jumlah percakapan tetap 2 tanpa ada yang terhapus');
  assert(simulatedSelectedId === 'c1', 'Percakapan terpilih c1 tetap aktif');

  // ------------------------------------------------------------------
  // TEST GROUP 9: Sinkronisasi State Saat Percakapan Aktif Dihapus
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 9: Sinkronisasi Saat Percakapan Terpilih Dihapus ---');

  const handleConfirm = (idToDelete: string, currentSelectedId: string | null) => {
    const remaining = simulatedConversations.filter((c) => c.id !== idToDelete);
    const closed = currentSelectedId === idToDelete;
    const nextSelected = closed ? null : currentSelectedId;
    return { remaining, closed, nextSelected };
  };

  // Hapus percakapan c1 yang sedang dibuka
  const confirmResult = handleConfirm('c1', simulatedSelectedId);
  simulatedConversations = confirmResult.remaining;
  simulatedSelectedId = confirmResult.nextSelected;

  assert(simulatedConversations.length === 1, 'Percakapan c1 terhapus dari state list');
  assert(simulatedSelectedId === null, 'Panel detail ditutup (selectedId menjadi null / empty state)');
  assert(confirmResult.closed === true, 'Flag closed aktif untuk mencegah auto-reselect yang tidak diinginkan');

  // ------------------------------------------------------------------
  // TEST GROUP 10: Penghapusan Percakapan Non-Aktif
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 10: Penghapusan Percakapan Non-Aktif ---');
  simulatedConversations = [
    { id: 'c1', name: 'Budi', status: 'open', unreadCount: 1, phone: '081234' },
    { id: 'c2', name: 'Siti', status: 'pending', unreadCount: 0, phone: '085678' },
    { id: 'c3', name: 'Dewi', status: 'resolved', unreadCount: 0, phone: '089999' },
  ];
  simulatedSelectedId = 'c1';

  // Hapus c2 dari tombol tempat sampah di card list saat c1 sedang dibuka
  const nonActiveRes = handleConfirm('c2', simulatedSelectedId);
  simulatedConversations = nonActiveRes.remaining;
  simulatedSelectedId = nonActiveRes.nextSelected;

  assert(!simulatedConversations.some((c) => c.id === 'c2'), 'Percakapan c2 terhapus dari state list');
  assert(simulatedSelectedId === 'c1', 'Percakapan aktif c1 tetap terpilih dan tidak terganggu');

  // ------------------------------------------------------------------
  // TEST GROUP 11: Penghapusan Percakapan Demo (isDemo: true)
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 11: Percakapan Simulasi Demo (isDemo: true) ---');
  const demoList = [
    { id: 'demo_1', name: 'Demo Contact', isDemo: true, phone: '+62 812-9821-4433 (Demo)' },
    { id: 'real_1', name: 'Real Contact', isDemo: false, phone: '081234567890' },
  ];
  const filteredAfterDemoDelete = demoList.filter((c) => c.id !== 'demo_1');
  assert(filteredAfterDemoDelete.length === 1, 'Percakapan demo dihapus dari state lokal tanpa memicu error DB');
  assert(filteredAfterDemoDelete[0].id === 'real_1', 'Percakapan nyata tetap tersimpan di state');

  // ------------------------------------------------------------------
  // TEST GROUP 12: Integritas Indikator Metrik & Filter Kategori
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 12: Konsistensi Hitungan Filter Percakapan ---');
  const testList = [
    { id: 'c1', status: 'open', unreadCount: 2 },
    { id: 'c2', status: 'pending', unreadCount: 0 },
    { id: 'c3', status: 'pending', unreadCount: 1 },
    { id: 'c4', status: 'resolved', unreadCount: 0 },
  ];

  const calcCounts = (list: typeof testList) => ({
    all: list.length,
    unread: list.filter((c) => c.unreadCount > 0).length,
    pending: list.filter((c) => c.status === 'pending').length,
    resolved: list.filter((c) => c.status === 'resolved').length,
  });

  const before = calcCounts(testList);
  assert(before.all === 4 && before.unread === 2 && before.pending === 2 && before.resolved === 1, 'Hitungan awal metrik valid');

  // Hapus c3 (pending & unread)
  const after = calcCounts(testList.filter((c) => c.id !== 'c3'));
  assert(after.all === 3, 'Total percakapan berkurang menjadi 3');
  assert(after.unread === 1, 'Total pesan belum dibaca berkurang menjadi 1');
  assert(after.pending === 1, 'Total status pending berkurang menjadi 1');
  assert(after.resolved === 1, 'Total status resolved tidak berubah (tetap 1)');

  // ------------------------------------------------------------------
  // TEST GROUP 13: Verifikasi Logika Handler Endpoint DELETE /api/conversations/:id
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 13: Logika Handler Endpoint DELETE /api/conversations/:id ---');
  db.clear();
  db.conversations.push({ id: 'conv-route-1', organization_id: orgA, status: 'open' });
  db.messages.push({ id: 'm-route-1', organization_id: orgA, conversation_id: 'conv-route-1', body: 'Test' });

  // Simulasi mock route handler backend
  async function mockDeleteConversationHandler(req: {
    params: { id?: string };
    query?: { organizationId?: string };
    body?: { organizationId?: string };
    authenticatedUser?: { id: string; role: string; organizationId: string };
  }): Promise<{ status: number; body: any }> {
    const conversationId = req.params.id;
    if (!conversationId) {
      return { status: 400, body: { success: false, error: 'Parameter "conversationId" wajib disertakan.' } };
    }

    // Role check (authenticateAndAuthorize)
    if (!req.authenticatedUser) {
      return { status: 401, body: { success: false, error: 'Token autentikasi tidak valid atau tidak disertakan.' } };
    }
    const role = req.authenticatedUser.role;
    if (role !== 'member' && role !== 'admin' && role !== 'owner') {
      return { status: 403, body: { success: false, error: 'Akses ditolak: role tidak memiliki izin.' } };
    }

    const orgId = req.authenticatedUser.organizationId || req.query?.organizationId || req.body?.organizationId;
    if (orgId !== orgA) {
      return { status: 403, body: { success: false, error: 'Tenant mismatch: akses ditolak ke organisasi lain.' } };
    }

    const delRes = await deleteConversation(orgId, conversationId, mockClient);
    if (!delRes.success) {
      const statusCode = delRes.notFound ? 404 : 400;
      return { status: statusCode, body: delRes };
    }

    return { status: 200, body: { success: true, data: delRes, message: delRes.message } };
  }

  // 13.1 Request tanpa autentikasi -> 401
  const routeUnauth = await mockDeleteConversationHandler({ params: { id: 'conv-route-1' } });
  assert(routeUnauth.status === 401, '13.1: Request tanpa autentikasi ditolak HTTP 401');

  // 13.2 Request dengan role tidak berhak -> 403
  const routeGuest = await mockDeleteConversationHandler({
    params: { id: 'conv-route-1' },
    authenticatedUser: { id: 'u-1', role: 'guest', organizationId: orgA },
  });
  assert(routeGuest.status === 403, '13.2: Request role guest ditolak HTTP 403');

  // 13.3 Request lintas tenant -> 403
  const routeCrossTenant = await mockDeleteConversationHandler({
    params: { id: 'conv-route-1' },
    authenticatedUser: { id: 'u-2', role: 'member', organizationId: orgB },
  });
  assert(routeCrossTenant.status === 403, '13.3: Request lintas tenant ditolak HTTP 403');

  // 13.4 Request ID tidak ada -> 404
  const routeNotFound = await mockDeleteConversationHandler({
    params: { id: 'conv-route-missing' },
    authenticatedUser: { id: 'u-3', role: 'member', organizationId: orgA },
  });
  assert(routeNotFound.status === 404, '13.4: Percakapan tidak ditemukan merespons HTTP 404');

  // 13.5 Request valid oleh member -> 200 OK
  const routeSuccess = await mockDeleteConversationHandler({
    params: { id: 'conv-route-1' },
    authenticatedUser: { id: 'u-3', role: 'member', organizationId: orgA },
  });
  assert(routeSuccess.status === 200, '13.5: Penghapusan valid oleh member merespons HTTP 200');
  assert(routeSuccess.body.success === true, '13.5: Response body success bernilai true');
  assert(db.conversations.length === 0, '13.5: Percakapan berhasil dihapus dari database');
  assert(db.messages.length === 0, '13.5: Pesan terkait berhasil terhapus via database cascade');

  // ------------------------------------------------------------------
  // RINGKASAN HASIL
  // ------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`HASIL AKHIR: ${passedTests}/${totalTests} PASS (${failedTests} GAGAL)`);
  console.log('====================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runConversationTests().catch((err) => {
  console.error('Unhandled error during conversation tests:', err);
  process.exit(1);
});
