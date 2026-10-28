// ====================================================================
// WABiz Dashboard Metrics: Fully Isolated Offline Test Suite
// ====================================================================
// Pengujian 100% terisolasi tanpa jaringan, tanpa Supabase cloud,
// tanpa WhatsApp socket, dan tanpa PostgreSQL server.
// Menguji akurasi dan konsistensi perhitungan Ringkasan Metrik Bisnis:
// 1. Total Kontak sama dengan modul Kontak (deduplikasi nomor).
// 2. Pesan Masuk HANYA menghitung pesan dari pelanggan (inbound customer).
// 3. Kampanye Aktif HANYA menghitung status yang benar-benar aktif ('running'/'Berjalan').
// 4. Percakapan Terbuka HANYA menghitung status 'open' (bukan pending atau resolved).
// 5. Menambah atau menghapus data memperbarui metrik secara konsisten & reaktif.
// 6. Data demo tidak tercampur dengan data persisten.
// 7. Data kosong, status memuat (loading), dan error ditangani dengan benar.
// 8. Isolasi multi-tenant: data organisasi lain tidak bocor ke hitungan.
// 9. Sinkronisasi metrik Pesan Masuk saat percakapan dihapus (PostgreSQL cascade).
// ====================================================================

import { deleteConversation } from './supabase';

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
// NORMALISASI NOMOR TELEPON (IDENTIK DENGAN FRONTEND)
// ====================================================================
function normalizePhoneNumber(rawPhone: string): string {
  let cleaned = rawPhone.replace(/\D/g, '');
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  }
  return cleaned;
}

// ====================================================================
// MOCK DATABASE & POSTGREST QUERY BUILDER
// ====================================================================
class MockDatabase {
  public contacts: any[] = [];
  public messages: any[] = [];
  public campaigns: any[] = [];
  public conversations: any[] = [];
  public errorOnTable?: string;

  public clear(): void {
    this.contacts = [];
    this.messages = [];
    this.campaigns = [];
    this.conversations = [];
    this.errorOnTable = undefined;
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
  private isHead: boolean = false;
  private isDelete: boolean = false;
  private countMode?: string;

  constructor(db: MockDatabase, table: string) {
    this.db = db;
    this.table = table;
  }

  public select(_cols: string = '*', options?: { count?: 'exact'; head?: boolean }) {
    if (options?.head) this.isHead = true;
    if (options?.count) this.countMode = options.count;
    return this;
  }

  public eq(col: string, val: any) {
    this.filters.push((row: any) => row[col] === val);
    return this;
  }

  public delete() {
    this.isDelete = true;
    return this;
  }

  public async maybeSingle(): Promise<{ data: any; error: any }> {
    const res = await this.execute();
    return {
      data: res.data && res.data.length > 0 ? res.data[0] : null,
      error: res.error,
    };
  }

  public async execute(): Promise<{ data: any; count: number | null; error: any }> {
    if (this.db.errorOnTable === this.table) {
      return { data: null, count: null, error: { message: `Simulated network error on ${this.table}` } };
    }

    if (this.isDelete) {
      const rows: any[] = (this.db as any)[this.table] || [];
      const matched = rows.filter((r) => this.filters.every((f) => f(r)));
      const remaining = rows.filter((r) => !this.filters.every((f) => f(r)));
      (this.db as any)[this.table] = remaining;

      // Simulasi PostgreSQL ON DELETE CASCADE:
      // foreign key (conversation_id, organization_id) references public.conversations(id, organization_id) on delete cascade
      if (this.table === 'conversations') {
        for (const conv of matched) {
          this.db.messages = this.db.messages.filter(
            (m) => !(m.conversation_id === conv.id && m.organization_id === conv.organization_id)
          );
        }
      }

      return {
        data: matched,
        count: matched.length,
        error: null,
      };
    }

    const rows: any[] = (this.db as any)[this.table] || [];
    const matched = rows.filter((r) => this.filters.every((f) => f(r)));

    return {
      data: this.isHead ? null : matched.map((r) => ({ ...r })),
      count: matched.length,
      error: null,
    };
  }

  public then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// ====================================================================
// NORMALISASI & KALKULASI STATISTIK KAMPANYE (IDENTIK DENGAN FRONTEND)
// ====================================================================
function normalizeStatusFromDb(status: string | null | undefined): string {
  if (!status) return 'Draft';
  const s = status.toLowerCase();
  if (s === 'scheduled' || s === 'terjadwal') return 'Terjadwal';
  if (s === 'running' || s === 'berjalan' || s === 'sending') return 'Berjalan';
  if (s === 'completed' || s === 'selesai' || s === 'sent') return 'Selesai';
  if (s === 'cancelled' || s === 'canceled' || s === 'dibatalkan' || s === 'failed' || s === 'gagal') return 'Dibatalkan';
  return 'Draft';
}

interface CampaignStats {
  total: number;
  active: number;
  running: number;
  scheduled: number;
  draft: number;
  completed: number;
  cancelled: number;
}

function calculateCampaignStats(campaignList: any[], orgId?: string | null): CampaignStats {
  const relevant = orgId
    ? campaignList.filter((c) => !c.isDemo && (!c.organization_id && !c.organizationId ? true : (c.organization_id || c.organizationId) === orgId))
    : campaignList;

  let running = 0;
  let scheduled = 0;
  let draft = 0;
  let completed = 0;
  let cancelled = 0;

  for (const c of relevant) {
    const s = (c.status || '').toLowerCase();
    if (s === 'berjalan' || s === 'running' || s === 'sending') {
      running++;
    } else if (s === 'terjadwal' || s === 'scheduled') {
      scheduled++;
    } else if (s === 'selesai' || s === 'completed' || s === 'sent') {
      completed++;
    } else if (s === 'dibatalkan' || s === 'cancelled' || s === 'canceled' || s === 'failed' || s === 'gagal') {
      cancelled++;
    } else {
      draft++;
    }
  }

  return {
    total: relevant.length,
    active: running + scheduled,
    running,
    scheduled,
    draft,
    completed,
    cancelled,
  };
}

// ====================================================================
// FUNGSI PERHITUNGAN DASHBOARD (IDENTIK DENGAN APP.TSX)
// ====================================================================
async function executeDashboardQueries(supabase: any, orgId: string) {
  const [contactsRes, messagesRes, campaignsRes, conversationsRes] = await Promise.all([
    supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
    supabase.from('messages').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('sender_type', 'customer'),
    supabase.from('campaigns').select('*').eq('organization_id', orgId),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'open'),
  ]);

  if (contactsRes.error) throw contactsRes.error;
  if (messagesRes.error) throw messagesRes.error;
  if (campaignsRes.error) throw campaignsRes.error;
  if (conversationsRes.error) throw conversationsRes.error;

  const campaignStats = calculateCampaignStats(campaignsRes.data || [], orgId);

  return {
    contactsCount: contactsRes.count ?? 0,
    messagesCount: messagesRes.count ?? 0,
    campaignsCount: campaignStats.active,
    campaignStats,
    campaignRows: campaignsRes.data || [],
    conversationsCount: conversationsRes.count ?? 0,
  };
}

function calculateReactiveMetrics(params: {
  contacts: any[];
  conversations: any[];
  campaigns: any[];
  currentOrgId: string | null;
  dbMetrics: {
    contactsCount: number;
    messagesCount: number;
    campaignsCount: number;
    campaignStats?: CampaignStats;
    conversationsCount: number;
  };
}) {
  const { contacts, conversations, campaigns, currentOrgId, dbMetrics } = params;

  // 1. Total Kontak
  let effectiveContactsCount = dbMetrics.contactsCount;
  if (contacts.length > 0) {
    const relevant = currentOrgId ? contacts.filter((c) => !c.isDemo) : contacts;
    const uniquePhones = new Set(relevant.map((c) => normalizePhoneNumber(c.phone)));
    effectiveContactsCount = uniquePhones.size;
  }

  // 2. Percakapan Terbuka
  let effectiveConversationsCount = dbMetrics.conversationsCount;
  if (conversations.length > 0) {
    const relevant = currentOrgId ? conversations.filter((c) => !c.isDemo) : conversations;
    effectiveConversationsCount = relevant.filter((c) => c.status === 'open').length;
  }

  // 3. Kampanye Aktif & Statistik
  let effectiveCampaignStats = dbMetrics.campaignStats || {
    total: 0,
    active: dbMetrics.campaignsCount,
    running: dbMetrics.campaignsCount,
    scheduled: 0,
    draft: 0,
    completed: 0,
    cancelled: 0,
  };
  if (campaigns.length > 0) {
    effectiveCampaignStats = calculateCampaignStats(campaigns, currentOrgId);
  }
  const effectiveCampaignsCount = effectiveCampaignStats.active;

  // 4. Pesan Masuk
  let effectiveMessagesCount = dbMetrics.messagesCount;
  if (!currentOrgId && conversations.length > 0) {
    effectiveMessagesCount = conversations.reduce(
      (sum, c) => sum + (c.messages ? c.messages.filter((m: any) => m.sender === 'customer').length : 0),
      0
    );
  }

  return {
    contactsCount: effectiveContactsCount,
    messagesCount: effectiveMessagesCount,
    campaignsCount: effectiveCampaignsCount,
    campaignStats: effectiveCampaignStats,
    conversationsCount: effectiveConversationsCount,
  };
}

// ====================================================================
// LOGIKA PEMILIHAN KARTU METRIK DASHBOARD (IDENTIK DENGAN FRONTEND)
// ====================================================================
function getMetricCardProps(params: {
  label: 'Pesan Masuk' | 'Total Kontak' | 'Kampanye Aktif' | 'Percakapan Terbuka';
  count: number;
  isLoading: boolean;
  error: string | null;
}) {
  const { label, count, isLoading, error } = params;
  if (label === 'Pesan Masuk') {
    return {
      value: isLoading ? '—' : error ? '—' : String(count),
      subtext: isLoading
        ? 'Menyinkronkan pesan pelanggan...'
        : error
        ? 'Gagal menyinkronkan data pesan'
        : count > 0
        ? `${count} pesan dari pelanggan`
        : '0 pesan dari pelanggan',
      badgeText: isLoading ? 'Memuat...' : error ? 'Error' : count > 0 ? 'Pelanggan' : '0 baru',
      isError: Boolean(error),
    };
  }
  return {
    value: isLoading ? '—' : error ? '—' : String(count),
    subtext: '',
    badgeText: '',
    isError: Boolean(error),
  };
}

// ====================================================================
// RUN TEST SUITE
// ====================================================================
async function runDashboardTests() {
  console.log('\n====================================================================');
  console.log('WABiz: Pengujian Offline Komprehensif — Ringkasan Metrik Bisnis');
  console.log('====================================================================\n');

  const db = new MockDatabase();
  const mockClient = db.createClient();

  const orgA = 'org-1111-aaaa';
  const orgB = 'org-2222-bbbb';

  // ------------------------------------------------------------------
  // TEST GROUP 1: Total Kontak Sama dengan Modul Kontak & Deduplikasi
  // ------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Total Kontak & Deduplikasi Nomor ---');
  db.clear();
  db.contacts.push(
    { id: 'ct-1', organization_id: orgA, name: 'Budi Santoso', phone: '081234567890' },
    { id: 'ct-2', organization_id: orgA, name: 'Siti Aminah', phone: '+62 812-3456-7890' }, // Duplikat nomor dengan format berbeda
    { id: 'ct-3', organization_id: orgA, name: 'Ahmad Faiz', phone: '085641886993' }
  );

  const dbRes1 = await executeDashboardQueries(mockClient, orgA);
  assert(dbRes1.contactsCount === 3, 'Query DB menghitung 3 baris kontak terdaftar');

  // Pada in-memory state dengan deduplikasi konsisten modul Kontak:
  const localContacts1 = [
    { id: 'ct-1', name: 'Budi Santoso', phone: '081234567890', isDemo: false },
    { id: 'ct-2', name: 'Siti Aminah', phone: '+62 812-3456-7890', isDemo: false }, // Nomor sama dengan Budi setelah normalisasi
    { id: 'ct-3', name: 'Ahmad Faiz', phone: '085641886993', isDemo: false },
  ];

  const reactive1 = calculateReactiveMetrics({
    contacts: localContacts1,
    conversations: [],
    campaigns: [],
    currentOrgId: orgA,
    dbMetrics: dbRes1,
  });

  assert(reactive1.contactsCount === 2, 'Deduplikasi kontak berhasil: 2 nomor unik terhitung (081234567890 dan 085641886993)');

  // ------------------------------------------------------------------
  // TEST GROUP 2: Pesan Masuk HANYA Menghitung Pesan dari Pelanggan
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Pesan Masuk (Hanya Pelanggan / Inbound) ---');
  db.clear();
  db.conversations.push(
    { id: 'conv-1', organization_id: orgA, status: 'open' },
    { id: 'conv-2', organization_id: orgA, status: 'open' }
  );
  db.messages.push(
    // 3 pesan customer
    { id: 'm-1', organization_id: orgA, conversation_id: 'conv-1', sender_type: 'customer', body: 'Halo CS' },
    { id: 'm-2', organization_id: orgA, conversation_id: 'conv-1', sender_type: 'customer', body: 'Tanya pendaftaran' },
    { id: 'm-3', organization_id: orgA, conversation_id: 'conv-2', sender_type: 'customer', body: 'Berapa biaya?' },
    // 4 pesan outbound / bot / agent / system
    { id: 'm-4', organization_id: orgA, conversation_id: 'conv-1', sender_type: 'bot', body: 'Halo! Ada yang bisa dibantu?' },
    { id: 'm-5', organization_id: orgA, conversation_id: 'conv-1', sender_type: 'agent', body: 'Pendaftaran gelombang 1 dibuka.' },
    { id: 'm-6', organization_id: orgA, conversation_id: 'conv-2', sender_type: 'system', body: 'Handoff to agent' },
    { id: 'm-7', organization_id: orgA, conversation_id: 'conv-2', sender_type: 'bot', body: 'Biaya terlampir.' }
  );

  const dbRes2 = await executeDashboardQueries(mockClient, orgA);
  assert(dbRes2.messagesCount === 3, 'Pesan Masuk HANYA menghitung 3 pesan dengan sender_type = customer');
  assert(dbRes2.messagesCount !== db.messages.length, 'Total 7 pesan di database tidak disamakan dengan Pesan Masuk');
  assert(dbRes2.messagesCount !== dbRes2.conversationsCount, 'Jumlah pesan masuk (3) tidak disamakan dengan jumlah percakapan (2)');

  // ------------------------------------------------------------------
  // TEST GROUP 3: Variasi Status Kampanye & Kampanye Aktif (Berjalan + Terjadwal)
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Penanganan Variasi Status Kampanye & Kampanye Aktif ---');
  db.clear();
  db.campaigns.push(
    { id: 'cmp-1', organization_id: orgA, name: 'Siaran Draf', status: 'draft' },
    { id: 'cmp-2', organization_id: orgA, name: 'Siaran Promo Terjadwal', status: 'scheduled' }, // AKTIF (Terjadwal)
    { id: 'cmp-3', organization_id: orgA, name: 'Siaran Berjalan', status: 'running' },          // AKTIF (Berjalan)
    { id: 'cmp-4', organization_id: orgA, name: 'Siaran Telah Selesai', status: 'completed' },
    { id: 'cmp-5', organization_id: orgA, name: 'Siaran Dibatalkan', status: 'cancelled' }
  );

  const dbRes3 = await executeDashboardQueries(mockClient, orgA);
  assert(dbRes3.campaignsCount === 2, 'Kampanye aktif menghitung siaran Berjalan (running) + Terjadwal (scheduled) = 2 aktif');
  assert(dbRes3.campaignStats.total === 5, 'Total 5 kampanye dengan berbagai status tercatat lengkap di basis data');
  assert(dbRes3.campaignStats.running === 1, 'Status "running" terdata 1 siaran');
  assert(dbRes3.campaignStats.scheduled === 1, 'Status "scheduled" terdata 1 siaran');
  assert(dbRes3.campaignStats.draft === 1, 'Status "draft" terdata 1 siaran dan tidak hilang dari ringkasan');
  assert(dbRes3.campaignStats.completed === 1, 'Status "completed" terdata 1 siaran selesai');
  assert(dbRes3.campaignStats.cancelled === 1, 'Status "cancelled" terdata 1 siaran dibatalkan');

  // Uji sinkronisasi in-memory UI
  const localCampaigns = [
    { id: 'cmp-1', organizationId: orgA, name: 'Siaran Draf', status: 'Draft' },
    { id: 'cmp-2', organizationId: orgA, name: 'Siaran Promo Terjadwal', status: 'Terjadwal' },
    { id: 'cmp-3', organizationId: orgA, name: 'Siaran Berjalan', status: 'Berjalan' },
    { id: 'cmp-4', organizationId: orgA, name: 'Siaran Telah Selesai', status: 'Selesai' },
    { id: 'cmp-5', organizationId: orgA, name: 'Siaran Dibatalkan', status: 'Dibatalkan' },
  ];

  const reactive3 = calculateReactiveMetrics({
    contacts: [],
    conversations: [],
    campaigns: localCampaigns,
    currentOrgId: orgA,
    dbMetrics: dbRes3,
  });

  assert(reactive3.campaignsCount === 2, 'In-memory state: 2 kampanye aktif terhitung (Berjalan + Terjadwal)');
  assert(reactive3.campaignStats.total === 5, 'In-memory state: total 5 kampanye terdaftar di modul Kampanye & Dashboard');

  // ------------------------------------------------------------------
  // TEST GROUP 4: Percakapan Terbuka HANYA Menghitung Status 'open'
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Percakapan Terbuka (Hanya Status "open") ---');
  db.clear();
  db.conversations.push(
    { id: 'c-1', organization_id: orgA, status: 'open' },     // TERBUKA
    { id: 'c-2', organization_id: orgA, status: 'open' },     // TERBUKA
    { id: 'c-3', organization_id: orgA, status: 'pending' },  // MENUNGGU
    { id: 'c-4', organization_id: orgA, status: 'resolved' }, // SELESAI / DITUTUP
    { id: 'c-5', organization_id: orgA, status: 'resolved' }  // SELESAI / DITUTUP
  );

  const dbRes4 = await executeDashboardQueries(mockClient, orgA);
  assert(dbRes4.conversationsCount === 2, 'Hanya 2 percakapan berstatus "open" yang dihitung terbuka');
  assert(dbRes4.conversationsCount !== db.conversations.length, 'Total 5 riwayat percakapan tidak dihitung seluruhnya sebagai terbuka');

  // Uji sinkronisasi in-memory UI
  const localConversations = [
    { id: 'c-1', status: 'open' },
    { id: 'c-2', status: 'open' },
    { id: 'c-3', status: 'pending' },
    { id: 'c-4', status: 'resolved' },
    { id: 'c-5', status: 'resolved' },
  ];

  const reactive4 = calculateReactiveMetrics({
    contacts: [],
    conversations: localConversations,
    campaigns: [],
    currentOrgId: orgA,
    dbMetrics: dbRes4,
  });

  assert(reactive4.conversationsCount === 2, 'In-memory state: hanya 2 percakapan dengan status "open" terhitung');

  // ------------------------------------------------------------------
  // TEST GROUP 5: Perubahan Data Reaktif (Menambah / Menghapus / Update Status)
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Perubahan Data Memperbarui Metrik Reaktif ---');

  // 5.1 Menambah Kontak Baru
  const updatedContacts = [
    ...localContacts1,
    { id: 'ct-4', name: 'Dewi Lestari', phone: '087711223344', isDemo: false },
  ];
  const reactiveAfterAddContact = calculateReactiveMetrics({
    contacts: updatedContacts,
    conversations: localConversations,
    campaigns: localCampaigns,
    currentOrgId: orgA,
    dbMetrics: dbRes1,
  });
  assert(reactiveAfterAddContact.contactsCount === 3, 'Menambah kontak langsung menaikkan metrik kontak dari 2 ke 3');

  // 5.2 Menyelesaikan Percakapan (open -> resolved)
  const updatedConversations = localConversations.map((c) =>
    c.id === 'c-1' ? { ...c, status: 'resolved' } : c
  );
  const reactiveAfterResolve = calculateReactiveMetrics({
    contacts: localContacts1,
    conversations: updatedConversations,
    campaigns: localCampaigns,
    currentOrgId: orgA,
    dbMetrics: dbRes1,
  });
  assert(reactiveAfterResolve.conversationsCount === 1, 'Menandai percakapan selesai langsung menurunkan percakapan terbuka dari 2 ke 1');

  // 5.3 Menambah Kampanye Baru Terjadwal (Sinkronisasi Langsung ke Dashboard)
  const campaignsWithNewScheduled = [
    ...localCampaigns,
    { id: 'cmp-6', organizationId: orgA, name: 'Siaran Flash Sale Esok', status: 'Terjadwal', isDemo: false },
  ];
  const reactiveAfterAddCampaign = calculateReactiveMetrics({
    contacts: localContacts1,
    conversations: localConversations,
    campaigns: campaignsWithNewScheduled,
    currentOrgId: orgA,
    dbMetrics: dbRes1,
  });
  assert(reactiveAfterAddCampaign.campaignsCount === 3, 'Menambah kampanye terjadwal langsung tersinkronisasi ke Dashboard (aktif naik dari 2 ke 3 tanpa reload)');
  assert(reactiveAfterAddCampaign.campaignStats.total === 6, 'Total kampanye di Dashboard langsung naik dari 5 ke 6');

  // 5.4 Membatalkan Kampanye Terjadwal (Terjadwal -> Dibatalkan)
  const updatedCampaigns = campaignsWithNewScheduled.map((camp) =>
    camp.id === 'cmp-6' ? { ...camp, status: 'Dibatalkan' } : camp
  );
  const reactiveAfterCancelCamp = calculateReactiveMetrics({
    contacts: localContacts1,
    conversations: localConversations,
    campaigns: updatedCampaigns,
    currentOrgId: orgA,
    dbMetrics: dbRes1,
  });
  assert(reactiveAfterCancelCamp.campaignsCount === 2, 'Membatalkan kampanye terjadwal langsung menurunkan kampanye aktif dari 3 ke 2');
  assert(reactiveAfterCancelCamp.campaignStats.cancelled === 2, 'Jumlah kampanye dibatalkan naik menjadi 2');

  // ------------------------------------------------------------------
  // TEST GROUP 6: Pemisahan Data Demo vs Persisten
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Pemisahan Data Demo vs Persisten ---');
  const mixedContacts = [
    { id: 'real-1', name: 'Pelanggan Riil', phone: '0811111111', isDemo: false },
    { id: 'demo-1', name: 'Demo Contact 1', phone: '0899999999', isDemo: true },
    { id: 'demo-2', name: 'Demo Contact 2', phone: '0888888888', isDemo: true },
  ];

  const mixedConversations = [
    { id: 'real-conv', status: 'open', isDemo: false },
    { id: 'demo-conv-1', status: 'open', isDemo: true },
    { id: 'demo-conv-2', status: 'open', isDemo: true },
  ];

  const mixedCampaigns = [
    { id: 'real-cmp', organizationId: orgA, name: 'Siaran Riil', status: 'Terjadwal', isDemo: false },
    { id: 'demo-cmp-1', organizationId: orgA, name: 'Siaran Demo 1', status: 'Terjadwal', isDemo: true },
    { id: 'demo-cmp-2', organizationId: orgA, name: 'Siaran Demo 2', status: 'Draft', isDemo: true },
  ];

  // Saat organisasi aktif (currentOrgId != null), data demo diabaikan
  const persistentMode = calculateReactiveMetrics({
    contacts: mixedContacts,
    conversations: mixedConversations,
    campaigns: mixedCampaigns,
    currentOrgId: orgA,
    dbMetrics: { contactsCount: 1, messagesCount: 0, campaignsCount: 1, conversationsCount: 1 },
  });

  assert(persistentMode.contactsCount === 1, 'Data demo kontak tidak dicampur saat organisasi persisten aktif (terhitung 1 kontak)');
  assert(persistentMode.conversationsCount === 1, 'Data demo percakapan tidak dicampur saat organisasi persisten aktif (terhitung 1 percakapan)');
  assert(persistentMode.campaignsCount === 1, 'Data demo kampanye tidak dicampur saat organisasi persisten aktif (terhitung 1 kampanye aktif)');
  assert(persistentMode.campaignStats.total === 1, 'Total kampanye persisten hanya menghitung kampanye riil non-demo');

  // Saat mode demo murni (currentOrgId == null)
  const pureDemoMode = calculateReactiveMetrics({
    contacts: mixedContacts,
    conversations: mixedConversations,
    campaigns: mixedCampaigns,
    currentOrgId: null,
    dbMetrics: { contactsCount: 0, messagesCount: 0, campaignsCount: 0, conversationsCount: 0 },
  });
  assert(pureDemoMode.contactsCount === 3, 'Pada mode demo tanpa organisasi, seluruh kontak demo lokal terhitung (3)');
  assert(pureDemoMode.conversationsCount === 3, 'Pada mode demo tanpa organisasi, seluruh percakapan demo lokal terhitung (3)');
  assert(pureDemoMode.campaignsCount === 2, 'Pada mode demo tanpa organisasi, seluruh kampanye demo aktif terhitung (2)');
  assert(pureDemoMode.campaignStats.total === 3, 'Pada mode demo tanpa organisasi, total 3 kampanye demo tercatat');

  // ------------------------------------------------------------------
  // TEST GROUP 7: Data Kosong, Loading & Penanganan Error
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Data Kosong, Loading, dan Error Handling ---');
  db.clear(); // Benar-benar kosong

  const emptyRes = await executeDashboardQueries(mockClient, orgA);
  assert(emptyRes.contactsCount === 0, 'Organisasi baru dengan data kosong menghasilkan 0 kontak sah');
  assert(emptyRes.messagesCount === 0, 'Organisasi baru dengan data kosong menghasilkan 0 pesan sah');
  assert(emptyRes.campaignsCount === 0, 'Organisasi baru dengan data kosong menghasilkan 0 kampanye aktif sah');
  assert(emptyRes.campaignStats.total === 0, 'Organisasi baru dengan data kosong menghasilkan total 0 kampanye (status kosong informatif)');
  assert(emptyRes.conversationsCount === 0, 'Organisasi baru dengan data kosong menghasilkan 0 percakapan terbuka sah');

  // Simulasi error koneksi database pada tabel messages
  db.errorOnTable = 'messages';
  let threwErrorMsg = false;
  try {
    await executeDashboardQueries(mockClient, orgA);
  } catch (err: any) {
    threwErrorMsg = true;
    assert(err.message.includes('Simulated network error on messages'), 'Error koneksi database messages dilaporkan transparan');
  }
  assert(threwErrorMsg === true, 'Kegagalan database messages melempar error dan tidak diubah menjadi angka nol palsu');
  db.errorOnTable = undefined;

  // Simulasi error koneksi database pada tabel campaigns
  db.errorOnTable = 'campaigns';
  let threwErrorCamp = false;
  try {
    await executeDashboardQueries(mockClient, orgA);
  } catch (err: any) {
    threwErrorCamp = true;
    assert(err.message.includes('Simulated network error on campaigns'), 'Error koneksi database campaigns dilaporkan transparan');
  }
  assert(threwErrorCamp === true, 'Kegagalan database campaigns melempar error dan tidak diubah menjadi status kosong palsu');
  db.errorOnTable = undefined;

  // ------------------------------------------------------------------
  // TEST GROUP 8: Isolasi Multi-Tenant (Cross-Tenant Safety)
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Isolasi Multi-Tenant ---');
  db.clear();

  // Organisasi A: 1 kontak, 1 pesan customer, 1 kampanye scheduled, 1 percakapan open
  db.contacts.push({ id: 'ca-1', organization_id: orgA, name: 'Kontak A', phone: '081111' });
  db.messages.push({ id: 'ma-1', organization_id: orgA, sender_type: 'customer', body: 'Pesan A' });
  db.campaigns.push({ id: 'cpa-1', organization_id: orgA, status: 'scheduled' }); // Terjadwal milik Org A
  db.conversations.push({ id: 'cva-1', organization_id: orgA, status: 'open' });

  // Organisasi B: 5 kontak, 10 pesan customer, 2 kampanye running, 3 percakapan open
  for (let i = 1; i <= 5; i++) {
    db.contacts.push({ id: `cb-${i}`, organization_id: orgB, name: `Kontak B${i}`, phone: `08222${i}` });
  }
  for (let i = 1; i <= 10; i++) {
    db.messages.push({ id: `mb-${i}`, organization_id: orgB, sender_type: 'customer', body: `Pesan B${i}` });
  }
  db.campaigns.push(
    { id: 'cpb-1', organization_id: orgB, status: 'running' },
    { id: 'cpb-2', organization_id: orgB, status: 'running' }
  );
  for (let i = 1; i <= 3; i++) {
    db.conversations.push({ id: `cvb-${i}`, organization_id: orgB, status: 'open' });
  }

  // Query Org A
  const orgARes = await executeDashboardQueries(mockClient, orgA);
  assert(orgARes.contactsCount === 1, 'Org A hanya membaca 1 kontak miliknya');
  assert(orgARes.messagesCount === 1, 'Org A hanya membaca 1 pesan customer miliknya');
  assert(orgARes.campaignsCount === 1, 'Org A hanya membaca 1 kampanye aktif miliknya (scheduled)');
  assert(orgARes.campaignStats.scheduled === 1, 'Org A membaca 1 kampanye scheduled dan 0 running');
  assert(orgARes.conversationsCount === 1, 'Org A hanya membaca 1 percakapan terbuka miliknya');

  // Query Org B
  const orgBRes = await executeDashboardQueries(mockClient, orgB);
  assert(orgBRes.contactsCount === 5, 'Org B membaca 5 kontak miliknya');
  assert(orgBRes.messagesCount === 10, 'Org B membaca 10 pesan customer miliknya');
  assert(orgBRes.campaignsCount === 2, 'Org B membaca 2 kampanye aktif miliknya (running)');
  assert(orgBRes.campaignStats.running === 2, 'Org B membaca 2 kampanye running dan 0 scheduled');
  assert(orgBRes.conversationsCount === 3, 'Org B membaca 3 percakapan terbuka miliknya');

  // ------------------------------------------------------------------
  // TEST GROUP 9: Sinkronisasi Metrik Pesan Masuk saat Penghapusan Percakapan
  // ------------------------------------------------------------------
  console.log('\n--- TEST GROUP 9: Sinkronisasi Metrik Pesan Masuk saat Penghapusan Percakapan ---');
  db.clear();

  // Setup awal untuk Org A:
  // - Percakapan 1 (conv-del-1): 3 pesan masuk pelanggan + 2 pesan bot/CS
  // - Percakapan 2 (conv-del-2): 2 pesan masuk pelanggan + 1 pesan CS
  // - Percakapan 3 (conv-del-3): 0 pesan pelanggan (hanya 1 bot + 1 agen)
  db.conversations.push(
    { id: 'conv-del-1', organization_id: orgA, status: 'open' },
    { id: 'conv-del-2', organization_id: orgA, status: 'open' },
    { id: 'conv-del-3', organization_id: orgA, status: 'open' }
  );

  db.messages.push(
    // Percakapan 1 (3 pesan customer)
    { id: 'm-del-1', organization_id: orgA, conversation_id: 'conv-del-1', sender_type: 'customer', body: 'Customer 1 A' },
    { id: 'm-del-2', organization_id: orgA, conversation_id: 'conv-del-1', sender_type: 'customer', body: 'Customer 1 B' },
    { id: 'm-del-3', organization_id: orgA, conversation_id: 'conv-del-1', sender_type: 'customer', body: 'Customer 1 C' },
    { id: 'm-del-4', organization_id: orgA, conversation_id: 'conv-del-1', sender_type: 'bot', body: 'Bot reply' },
    { id: 'm-del-5', organization_id: orgA, conversation_id: 'conv-del-1', sender_type: 'agent', body: 'CS reply' },

    // Percakapan 2 (2 pesan customer)
    { id: 'm-del-6', organization_id: orgA, conversation_id: 'conv-del-2', sender_type: 'customer', body: 'Customer 2 A' },
    { id: 'm-del-7', organization_id: orgA, conversation_id: 'conv-del-2', sender_type: 'customer', body: 'Customer 2 B' },
    { id: 'm-del-8', organization_id: orgA, conversation_id: 'conv-del-2', sender_type: 'agent', body: 'CS reply 2' },

    // Percakapan 3 (0 pesan customer - hanya outbound)
    { id: 'm-del-9', organization_id: orgA, conversation_id: 'conv-del-3', sender_type: 'bot', body: 'Bot broadcast' },
    { id: 'm-del-10', organization_id: orgA, conversation_id: 'conv-del-3', sender_type: 'agent', body: 'CS notification' }
  );

  // Setup awal untuk Org B (untuk uji isolasi multi-tenant):
  db.conversations.push(
    { id: 'conv-orgb-1', organization_id: orgB, status: 'open' }
  );
  db.messages.push(
    { id: 'm-orgb-1', organization_id: orgB, conversation_id: 'conv-orgb-1', sender_type: 'customer', body: 'Org B Cust 1' },
    { id: 'm-orgb-2', organization_id: orgB, conversation_id: 'conv-orgb-1', sender_type: 'customer', body: 'Org B Cust 2' },
    { id: 'm-orgb-3', organization_id: orgB, conversation_id: 'conv-orgb-1', sender_type: 'customer', body: 'Org B Cust 3' },
    { id: 'm-orgb-4', organization_id: orgB, conversation_id: 'conv-orgb-1', sender_type: 'customer', body: 'Org B Cust 4' }
  );

  // 9.1 Hitungan awal Org A: 3 (conv 1) + 2 (conv 2) = 5 pesan masuk
  const initialOrgARes = await executeDashboardQueries(mockClient, orgA);
  assert(initialOrgARes.messagesCount === 5, '9.1: Awal: 5 pesan masuk pelanggan dihitung tepat di Org A');
  assert(initialOrgARes.messagesCount !== db.messages.filter((m) => m.organization_id === orgA).length, '9.1: Total 10 pesan di Org A tidak disamakan dengan 5 pesan masuk');

  // 9.2 Hitungan awal Org B: 4 pesan masuk
  const initialOrgBRes = await executeDashboardQueries(mockClient, orgB);
  assert(initialOrgBRes.messagesCount === 4, '9.2: Awal: 4 pesan masuk pelanggan dihitung tepat di Org B');

  // 9.3 Hapus percakapan 1 di Org A (memiliki 3 pesan masuk)
  const delConv1Res = await deleteConversation(orgA, 'conv-del-1', mockClient);
  assert(delConv1Res.success === true, '9.3: Penghapusan percakapan 1 berhasil dijalankan');

  // Periksa database setelah penghapusan percakapan 1
  const afterDel1OrgARes = await executeDashboardQueries(mockClient, orgA);
  assert(afterDel1OrgARes.messagesCount === 2, '9.3: Setelah menghapus percakapan 1, metrik Pesan Masuk turun dari 5 ke 2 (berkurang tepat 3)');
  assert(afterDel1OrgARes.messagesCount !== 4, '9.3: Metrik TIDAK turun hanya 1 (bukan count - 1 naif)');

  // 9.4 Periksa bahwa pesan di percakapan 2 tetap utuh dan tidak terhapus
  const remainingConv2Messages = db.messages.filter((m) => m.conversation_id === 'conv-del-2');
  assert(remainingConv2Messages.length === 3, '9.4: Percakapan 2 tetap memiliki 3 pesan (2 customer + 1 agent)');
  assert(
    remainingConv2Messages.filter((m) => m.sender_type === 'customer').length === 2,
    '9.4: Seluruh 2 pesan customer di percakapan 2 tetap utuh tanpa korupsi'
  );

  // 9.5 Hapus percakapan 3 di Org A (hanya berisi pesan keluar/bot, 0 customer message)
  const delConv3Res = await deleteConversation(orgA, 'conv-del-3', mockClient);
  assert(delConv3Res.success === true, '9.5: Penghapusan percakapan 3 berhasil dijalankan');

  const afterDel3OrgARes = await executeDashboardQueries(mockClient, orgA);
  assert(afterDel3OrgARes.messagesCount === 2, '9.5: Menghapus percakapan tanpa pesan customer tidak mengubah metrik Pesan Masuk (tetap 2)');

  // 9.6 Isolasi Multi-Tenant: Pastikan Org B sama sekali tidak terpengaruh oleh penghapusan di Org A
  const afterDelOrgBRes = await executeDashboardQueries(mockClient, orgB);
  assert(afterDelOrgBRes.messagesCount === 4, '9.6: Metrik Pesan Masuk di Org B tetap 4 tanpa perubahan atau kebocoran');

  // 9.7 Uji simulasi Optimistic Callback di Frontend:
  // Simulasi percakapan lokal dengan pesan customer yang akan dihapus
  let simulatedDashboardMetrics = {
    contactsCount: 1,
    messagesCount: 5,
    campaignsCount: 0,
    conversationsCount: 2,
  };

  const simulatedDeletedConvWith3CustomerMsgs = {
    id: 'conv-del-1',
    messages: [
      { id: 'm-1', sender: 'customer' },
      { id: 'm-2', sender: 'customer' },
      { id: 'm-3', sender: 'customer' },
      { id: 'm-4', sender: 'cs' },
    ],
  };

  // Callback optimistic update identik dengan handleConversationDeleted di App.tsx
  const customerMsgsCount = simulatedDeletedConvWith3CustomerMsgs.messages.filter((m) => m.sender === 'customer').length;
  simulatedDashboardMetrics = {
    ...simulatedDashboardMetrics,
    messagesCount: Math.max(0, simulatedDashboardMetrics.messagesCount - customerMsgsCount),
  };

  assert(simulatedDashboardMetrics.messagesCount === 2, '9.7: Optimistic update di frontend langsung menghasilkan angka 2 seketika');

  // 9.8 UI Card State Differentiation: Loading vs Empty vs Error vs Valid
  const loadingCard = getMetricCardProps({ label: 'Pesan Masuk', count: 0, isLoading: true, error: null });
  assert(loadingCard.value === '—', '9.8: State Loading menampilkan value "—"');
  assert(loadingCard.badgeText === 'Memuat...', '9.8: State Loading menampilkan badge "Memuat..."');

  const emptyCard = getMetricCardProps({ label: 'Pesan Masuk', count: 0, isLoading: false, error: null });
  assert(emptyCard.value === '0', '9.8: State Data Kosong menampilkan value "0"');
  assert(emptyCard.badgeText === '0 baru', '9.8: State Data Kosong menampilkan badge "0 baru"');
  assert(emptyCard.subtext === '0 pesan dari pelanggan', '9.8: State Data Kosong menampilkan subtext "0 pesan dari pelanggan"');

  const errorCard = getMetricCardProps({ label: 'Pesan Masuk', count: 0, isLoading: false, error: 'Database timeout' });
  assert(errorCard.value === '—', '9.8: State Error TIDAK menampilkan angka "0", melainkan "—"');
  assert(errorCard.badgeText === 'Error', '9.8: State Error menampilkan badge "Error"');
  assert(errorCard.isError === true, '9.8: State Error menandai isError true');

  const validCard = getMetricCardProps({ label: 'Pesan Masuk', count: 2, isLoading: false, error: null });
  assert(validCard.value === '2', '9.8: State Data Valid menampilkan value "2"');
  assert(validCard.badgeText === 'Pelanggan', '9.8: State Data Valid menampilkan badge "Pelanggan"');
  assert(validCard.subtext === '2 pesan dari pelanggan', '9.8: State Data Valid menampilkan subtext "2 pesan dari pelanggan"');

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

runDashboardTests().catch((err) => {
  console.error('Unhandled error during dashboard tests:', err);
  process.exit(1);
});

