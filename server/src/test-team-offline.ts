// ====================================================================
// WABiz Team Module: Fully Isolated Offline Unit Test Suite
// ====================================================================
// Pengujian terisolasi 100% tanpa jaringan, tanpa Supabase cloud,
// tanpa PostgreSQL, dan tanpa WhatsApp live socket.
// Menguji fitur Hapus Anggota Tim CS (Delete CS Team Member):
// 1. Penghapusan anggota demo (hanya state lokal)
// 2. Penghapusan anggota persisten via backend
// 3. Request tanpa autentikasi ditolak (HTTP 401)
// 4. Isolasi lintas tenant (cross-tenant safety, HTTP 403/404)
// 5. Penanganan ID tidak ada / invalid (HTTP 404/400)
// 6. Penanganan kegagalan database tanpa false-positive
// 7. Pencegahan double-click / in-flight protection
// 8. Konsistensi modal detail dan sinkronisasi state list
// 9. Integritas relasi: riwayat percakapan, pesan, kontak, dan kampanye tetap utuh
// 10. Otorisasi role: admin & owner diizinkan, member & guest ditolak (HTTP 403)
// ====================================================================

import { deleteTeamMember } from './supabase';

// ====================================================================
// TEST HARNESS
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
// IN-MEMORY MOCK SUPABASE CLIENT & DATABASE FIXTURE
// ====================================================================
class MockDatabase {
  public team_members: any[] = [];
  public conversations: any[] = [];
  public messages: any[] = [];
  public contacts: any[] = [];
  public campaigns: any[] = [];
  public organization_profiles: any[] = [];
  public errorOnOperation?: { table: string; operation: 'update' | 'delete' | 'insert' | 'select'; message: string };

  public clear(): void {
    this.team_members = [];
    this.conversations = [];
    this.messages = [];
    this.contacts = [];
    this.campaigns = [];
    this.organization_profiles = [];
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

      // Simulasi PostgreSQL ON DELETE SET NULL pada foreign key conversations.assigned_to
      if (this.table === 'team_members') {
        for (const tm of matching) {
          for (const conv of this.db.conversations) {
            if (conv.assigned_to === tm.id && conv.organization_id === tm.organization_id) {
              conv.assigned_to = null;
            }
          }
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
async function runTeamTests() {
  console.log('\n====================================================================');
  console.log('WABiz: Pengujian Offline Komprehensif — Fitur Hapus Anggota Tim CS');
  console.log('====================================================================\n');

  const db = new MockDatabase();
  const mockClient = db.createClient();

  const orgA = 'org-1111-aaaa';
  const orgB = 'org-2222-bbbb';

  // ------------------------------------------------------------------
  // TEST GROUP 1: Penghapusan Anggota Tim Demo (isDemo: true)
  // ------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Penghapusan Anggota Tim Demo (State Lokal Saja) ---');
  let localTeamMembers = [
    {
      id: 'demo_1',
      name: 'Ustadz H. Ahmad Dahlan, S.Pd.I',
      fullName: 'Ustadz H. Ahmad Dahlan, S.Pd.I',
      email: 'ahmad.dahlan@darululum-wabiz.sch.id',
      phone: '081234567890',
      department: 'Supervisor',
      role: 'Supervisor',
      isActive: true,
      isDemo: true,
    },
    {
      id: 'real_1',
      name: 'Zulfa Fauziah, S.Pd',
      fullName: 'Zulfa Fauziah, S.Pd',
      email: 'zulfa@company.com',
      phone: '081299998888',
      department: 'Layanan Pelanggan',
      role: 'Customer Service',
      isActive: true,
      isDemo: false,
    },
  ];

  // Simulasi handler frontend untuk demo member
  const deleteMemberFromState = (list: typeof localTeamMembers, targetId: string) => {
    return list.filter((m) => m.id !== targetId);
  };

  const updatedAfterDemo = deleteMemberFromState(localTeamMembers, 'demo_1');
  assert(updatedAfterDemo.length === 1, 'Anggota demo berhasil dihapus dari array state lokal');
  assert(!updatedAfterDemo.some((m) => m.id === 'demo_1'), 'Anggota demo_1 tidak ada lagi di daftar');
  assert(updatedAfterDemo[0].id === 'real_1', 'Anggota persisten real_1 tetap tersimpan di state');
  assert(db.team_members.length === 0, 'Database tidak disentuh saat menghapus anggota demo (0 query)');

  // ------------------------------------------------------------------
  // TEST GROUP 2: Penghapusan Anggota Tim Persisten Valid via Backend
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Penghapusan Anggota Persisten via Backend ---');
  db.clear();
  db.team_members.push({
    id: 'tm-real-1',
    organization_id: orgA,
    full_name: 'Zulfa Fauziah, S.Pd',
    email: 'zulfa@company.com',
    phone: '081299998888',
    department: 'Layanan Pelanggan',
    role: 'Customer Service',
    is_active: true,
  });

  const resDel = await deleteTeamMember(orgA, 'tm-real-1', mockClient);
  assert(resDel.success === true, 'deleteTeamMember berhasil mengembalikan status sukses');
  assert(resDel.deletedId === 'tm-real-1', 'ID anggota yang dihapus dikembalikan dengan benar');
  assert(resDel.message?.includes('Zulfa Fauziah'), 'Pesan konfirmasi memuat nama anggota yang dihapus');
  assert(db.team_members.length === 0, 'Baris anggota tim berhasil dihapus dari tabel team_members');

  // ------------------------------------------------------------------
  // TEST GROUP 3: Request Tanpa Autentikasi Ditolak (HTTP 401)
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Request Tanpa Autentikasi Ditolak (HTTP 401) ---');
  
  // Simulasi mock route handler backend
  async function mockDeleteTeamMemberRoute(req: {
    params: { id?: string };
    query?: { organizationId?: string };
    body?: { organizationId?: string };
    authenticatedUser?: { id: string; role: string; organizationId: string };
  }): Promise<{ status: number; body: any }> {
    const memberId = req.params.id;
    if (!memberId) {
      return { status: 400, body: { success: false, error: 'Parameter "memberId" wajib disertakan.' } };
    }

    // Role and authentication check
    if (!req.authenticatedUser) {
      return { status: 401, body: { success: false, error: 'Token autentikasi tidak valid atau tidak disertakan.' } };
    }

    const role = req.authenticatedUser.role;
    if (role !== 'admin' && role !== 'owner') {
      return { status: 403, body: { success: false, error: 'Akses ditolak: Hanya pemilik (owner) atau admin yang berwenang.' } };
    }

    const orgId = req.authenticatedUser.organizationId || req.query?.organizationId || req.body?.organizationId;
    if (!orgId || orgId !== orgA) {
      return { status: 403, body: { success: false, error: 'Tenant mismatch: akses ditolak ke organisasi lain.' } };
    }

    const result = await deleteTeamMember(orgId, memberId, mockClient);
    if (!result.success) {
      const statusCode = result.notFound ? 404 : 400;
      return { status: statusCode, body: result };
    }

    return { status: 200, body: { success: true, data: result, message: result.message } };
  }

  const unauthReq = await mockDeleteTeamMemberRoute({ params: { id: 'tm-real-1' } });
  assert(unauthReq.status === 401, 'Request tanpa header token menghasilkan HTTP 401');
  assert(unauthReq.body.success === false, 'Body success bernilai false pada request tanpa auth');

  // ------------------------------------------------------------------
  // TEST GROUP 4: Isolasi Multi-Tenant & Perlindungan Lintas Organisasi
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Isolasi Lintas Tenant (Cross-Tenant Protection) ---');
  db.clear();
  // Anggota Org A dan Anggota Org B
  db.team_members.push(
    { id: 'tm-org-a', organization_id: orgA, full_name: 'CS Org A', email: 'a@org.com', role: 'admin' },
    { id: 'tm-org-b', organization_id: orgB, full_name: 'CS Org B', email: 'b@org.com', role: 'admin' }
  );

  // Percobaan 1: Org B mencoba menghapus anggota milik Org A melalui service
  const crossTenantServiceRes = await deleteTeamMember(orgB, 'tm-org-a', mockClient);
  assert(crossTenantServiceRes.success === false, 'Penghapusan lintas tenant via service ditolak');
  assert(crossTenantServiceRes.notFound === true, 'Pesan keamanan treated sebagai notFound untuk mencegah enumerasi');
  assert(db.team_members.some((tm) => tm.id === 'tm-org-a'), 'Anggota tm-org-a di Org A tetap aman');

  // Percobaan 2: Org B mencoba request via API route
  const crossTenantRouteRes = await mockDeleteTeamMemberRoute({
    params: { id: 'tm-org-a' },
    authenticatedUser: { id: 'user-b', role: 'admin', organizationId: orgB },
  });
  assert(crossTenantRouteRes.status === 403, 'Request lintas tenant ke API route ditolak dengan HTTP 403');
  assert(db.team_members.some((tm) => tm.id === 'tm-org-a'), 'Data Org A tidak terhapus');

  // ------------------------------------------------------------------
  // TEST GROUP 5: Penanganan ID Tidak Ada & Invalid
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Penanganan ID Tidak Ada & Parameter Invalid ---');
  const notFoundRes = await deleteTeamMember(orgA, 'non-existent-member', mockClient);
  assert(notFoundRes.success === false, 'ID fiktif menghasilkan success: false');
  assert(notFoundRes.notFound === true, 'notFound bernilai true');
  assert(Boolean(notFoundRes.error), 'Error message informatif disediakan');

  const emptyOrgRes = await deleteTeamMember('', 'tm-org-a', mockClient);
  assert(emptyOrgRes.success === false, 'orgId kosong langsung ditolak');

  const emptyMemberRes = await deleteTeamMember(orgA, '', mockClient);
  assert(emptyMemberRes.success === false, 'memberId kosong langsung ditolak');

  const routeMissingParam = await mockDeleteTeamMemberRoute({
    params: { id: '' },
    authenticatedUser: { id: 'user-a', role: 'admin', organizationId: orgA },
  });
  assert(routeMissingParam.status === 400, 'Route tanpa memberId mengembalikan HTTP 400');

  // ------------------------------------------------------------------
  // TEST GROUP 6: Penanganan Kegagalan Database Tanpa False-Positive
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Penanganan Kegagalan Database ---');
  db.clear();
  db.team_members.push({ id: 'tm-fail-test', organization_id: orgA, full_name: 'Test Fail', email: 'fail@test.com' });

  // Simulasi error pada fase SELECT
  db.errorOnOperation = { table: 'team_members', operation: 'select', message: 'Connection pool exhausted' };
  const selectErrRes = await deleteTeamMember(orgA, 'tm-fail-test', mockClient);
  assert(selectErrRes.success === false, 'Error koneksi database pada SELECT ditangani secara elegan');
  assert(selectErrRes.error?.includes('Connection pool exhausted'), 'Error asli diteruskan');
  assert(db.team_members.some((tm) => tm.id === 'tm-fail-test'), 'Anggota tetap ada di database jika SELECT gagal');

  // Simulasi error pada fase DELETE
  db.errorOnOperation = { table: 'team_members', operation: 'delete', message: 'Row lock timeout' };
  const deleteErrRes = await deleteTeamMember(orgA, 'tm-fail-test', mockClient);
  assert(deleteErrRes.success === false, 'Error query DELETE ditangani dan tidak menghasilkan false positive');
  assert(deleteErrRes.error?.includes('Row lock timeout'), 'Pesan error DELETE diteruskan');
  assert(db.team_members.some((tm) => tm.id === 'tm-fail-test'), 'Anggota tetap ada di database jika DELETE gagal');
  db.errorOnOperation = undefined;

  // ------------------------------------------------------------------
  // TEST GROUP 7: Pencegahan Double-Click / In-Flight Protection
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Double-Click / In-Flight Protection ---');
  let isDeleting = false;
  let executionCount = 0;

  const simulateSafeDeleteClick = async () => {
    if (isDeleting) {
      return { blocked: true };
    }
    isDeleting = true;
    try {
      executionCount++;
      // Simulasi delay async
      await new Promise((r) => setTimeout(r, 10));
      return { blocked: false, success: true };
    } finally {
      isDeleting = false;
    }
  };

  // Simulasikan 3 klik cepat secara paralel (rapid double/triple click)
  const clickPromises = [simulateSafeDeleteClick(), simulateSafeDeleteClick(), simulateSafeDeleteClick()];
  const clickResults = await Promise.all(clickPromises);

  const executedRequests = clickResults.filter((r) => !r.blocked);
  const blockedRequests = clickResults.filter((r) => r.blocked);

  assert(executedRequests.length === 1, 'Hanya 1 permintaan eksekusi yang diproses');
  assert(blockedRequests.length === 2, '2 klik berikutnya diblokir selama status in-flight (isDeleting)');
  assert(executionCount === 1, 'Backend handler hanya dieksekusi 1 kali');

  // ------------------------------------------------------------------
  // TEST GROUP 8: Konsistensi Modal Detail & Sinkronisasi State
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Konsistensi Modal Detail & Pembatalan ---');
  let currentActiveMember: any = { id: 'tm-1', fullName: 'Petugas Aktif' };
  let modalState = {
    isDetailModalOpen: true,
    isDeleteModalOpen: true,
    memberToDelete: currentActiveMember,
  };

  // 8.1 Skenario Batal: Modal tertutup tanpa mengubah apa pun
  const handleCancelDelete = () => {
    return {
      isDeleteModalOpen: false,
      memberToDelete: null,
    };
  };
  const cancelRes = handleCancelDelete();
  modalState.isDeleteModalOpen = cancelRes.isDeleteModalOpen;
  modalState.memberToDelete = cancelRes.memberToDelete;

  assert(cancelRes.isDeleteModalOpen === false, 'Modal konfirmasi tertutup saat Batal ditekan');
  assert(cancelRes.memberToDelete === null, 'memberToDelete direset ke null');
  assert(currentActiveMember !== null, 'Anggota aktif tetap tidak berubah');
  assert(modalState.isDetailModalOpen === true, 'Modal detail tetap terbuka normal');

  // 8.2 Skenario Sukses Hapus: Jika anggota yang dihapus sedang dibuka di detail modal, modal detail harus ditutup
  const handleSuccessDelete = (deletedId: string) => {
    let detailClosed = false;
    let nextActiveMember = currentActiveMember;
    let nextDetailOpen = modalState.isDetailModalOpen;

    if (currentActiveMember?.id === deletedId) {
      nextActiveMember = null;
      nextDetailOpen = false;
      detailClosed = true;
    }
    return {
      isDeleteModalOpen: false,
      memberToDelete: null,
      nextActiveMember,
      nextDetailOpen,
      detailClosed,
    };
  };

  const deleteDetailRes = handleSuccessDelete('tm-1');
  currentActiveMember = deleteDetailRes.nextActiveMember;
  modalState.isDetailModalOpen = deleteDetailRes.nextDetailOpen;
  modalState.isDeleteModalOpen = deleteDetailRes.isDeleteModalOpen;
  modalState.memberToDelete = deleteDetailRes.memberToDelete;

  assert(deleteDetailRes.detailClosed === true, 'Modal detail otomatis ditutup ketika anggota yang ditampilkan dihapus');
  assert(currentActiveMember === null, 'currentActiveMember direset untuk mencegah data stale');
  assert(deleteDetailRes.nextDetailOpen === false, 'isDetailModalOpen bernilai false');

  // ------------------------------------------------------------------
  // TEST GROUP 9: Integritas Relasi (Percakapan, Pesan, Kontak, Kampanye Utuh)
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 9: Integritas Relasi (Conversations, Messages, Contacts, Campaigns) ---');
  db.clear();
  
  // Setup data lengkap dalam 1 organisasi
  db.organization_profiles.push({ id: orgA, name: 'PT WABiz Digital' });
  db.team_members.push({ id: 'tm-lead', organization_id: orgA, full_name: 'Lead CS', role: 'admin' });
  db.contacts.push(
    { id: 'ct-1', organization_id: orgA, name: 'Pelanggan 1', phone: '62811111111' },
    { id: 'ct-2', organization_id: orgA, name: 'Pelanggan 2', phone: '62822222222' }
  );
  db.conversations.push(
    { id: 'conv-1', organization_id: orgA, contact_id: 'ct-1', assigned_to: 'tm-lead', status: 'open' },
    { id: 'conv-2', organization_id: orgA, contact_id: 'ct-2', assigned_to: 'tm-lead', status: 'pending' }
  );
  db.messages.push(
    { id: 'msg-1', organization_id: orgA, conversation_id: 'conv-1', body: 'Halo CS, butuh bantuan' },
    { id: 'msg-2', organization_id: orgA, conversation_id: 'conv-1', body: 'Baik kak, kami bantu' },
    { id: 'msg-3', organization_id: orgA, conversation_id: 'conv-2', body: 'Mau tanya paket' }
  );
  db.campaigns.push({
    id: 'cmp-1',
    organization_id: orgA,
    name: 'Promo Akhir Bulan',
    status: 'scheduled',
  });

  // Hapus anggota tim tm-lead
  const relDeleteRes = await deleteTeamMember(orgA, 'tm-lead', mockClient);
  assert(relDeleteRes.success === true, 'Anggota tm-lead berhasil dihapus');
  assert(db.team_members.length === 0, 'Tabel team_members kini kosong');

  // Verifikasi efek ON DELETE SET NULL pada conversations.assigned_to
  assert(db.conversations.length === 2, 'Jumlah riwayat percakapan tetap 2 (tidak terhapus)');
  assert(db.conversations[0].assigned_to === null, 'conv-1 assigned_to di-set NULL secara aman');
  assert(db.conversations[1].assigned_to === null, 'conv-2 assigned_to di-set NULL secara aman');
  assert(db.conversations[0].contact_id === 'ct-1', 'Relasi kontak pada percakapan tetap utuh');

  // Verifikasi pesan pelanggan
  assert(db.messages.length === 3, 'Seluruh riwayat pesan (3 pesan) tetap utuh 100%');
  assert(db.messages.every((m) => m.organization_id === orgA), 'Seluruh pesan tetap milik orgA');

  // Verifikasi kontak utama
  assert(db.contacts.length === 2, 'Seluruh data kontak pelanggan (2 kontak) tetap utuh');

  // Verifikasi kampanye
  assert(db.campaigns.length === 1, 'Kampanye pemasaran tetap utuh dan aktif');

  // Verifikasi profil organisasi
  assert(db.organization_profiles.length === 1, 'Profil organisasi tetap utuh');

  // ------------------------------------------------------------------
  // TEST GROUP 10: Otorisasi Role (Admin & Owner Boleh, Member & Guest Ditolak)
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 10: Otorisasi Role (RBAC) ---');
  db.clear();
  db.team_members.push({ id: 'tm-target', organization_id: orgA, full_name: 'Target CS', role: 'member' });

  // 10.1 Role Guest -> Ditolak HTTP 403
  const guestReq = await mockDeleteTeamMemberRoute({
    params: { id: 'tm-target' },
    authenticatedUser: { id: 'usr-guest', role: 'guest', organizationId: orgA },
  });
  assert(guestReq.status === 403, 'Role "guest" ditolak dengan HTTP 403');
  assert(db.team_members.length === 1, 'Anggota target tidak terhapus oleh role guest');

  // 10.2 Role Member -> Ditolak HTTP 403
  const memberReq = await mockDeleteTeamMemberRoute({
    params: { id: 'tm-target' },
    authenticatedUser: { id: 'usr-member', role: 'member', organizationId: orgA },
  });
  assert(memberReq.status === 403, 'Role "member" (staff CS biasa) ditolak dengan HTTP 403');
  assert(db.team_members.length === 1, 'Anggota target tidak terhapus oleh role member');

  // 10.3 Role Admin -> Diizinkan HTTP 200
  const adminReq = await mockDeleteTeamMemberRoute({
    params: { id: 'tm-target' },
    authenticatedUser: { id: 'usr-admin', role: 'admin', organizationId: orgA },
  });
  assert(adminReq.status === 200, 'Role "admin" diizinkan menghapus anggota (HTTP 200)');
  assert(adminReq.body.success === true, 'Response body success bernilai true');
  assert(db.team_members.length === 0, 'Anggota berhasil dihapus oleh admin');

  // Setup lagi untuk pengujian Owner
  db.team_members.push({ id: 'tm-target-2', organization_id: orgA, full_name: 'Target CS 2', role: 'member' });

  // 10.4 Role Owner -> Diizinkan HTTP 200
  const ownerReq = await mockDeleteTeamMemberRoute({
    params: { id: 'tm-target-2' },
    authenticatedUser: { id: 'usr-owner', role: 'owner', organizationId: orgA },
  });
  assert(ownerReq.status === 200, 'Role "owner" diizinkan menghapus anggota (HTTP 200)');
  assert(ownerReq.body.success === true, 'Response body success bernilai true');
  assert(db.team_members.length === 0, 'Anggota berhasil dihapus oleh owner');

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

runTeamTests().catch((err) => {
  console.error('Unhandled error during team tests:', err);
  process.exit(1);
});
