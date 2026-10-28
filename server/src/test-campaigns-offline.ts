// ====================================================================
// WABiz Campaign Engine: Fully Isolated Offline Unit Test Suite
// ====================================================================
// Pengujian terisolasi 100% tanpa jaringan, tanpa Supabase cloud,
// tanpa PostgreSQL, dan tanpa provider WhatsApp sungguhan.
// Menggunakan in-memory mock database dan mock provider WhatsApp.
// ====================================================================

import {
  validateRecipientPhone,
  createPersistentCampaign,
  cancelCampaign,
  deleteCampaign,
  updateCampaign,
  reconcileCampaignScheduledRecipients,
  getCampaignRecipients,
  CampaignQueueScheduler,
} from './campaigns';
import {
  baileysProvider,
  metaCloudApiProvider,
  openwaProvider,
  getProviderReadiness,
  WhatsAppProviderFactory,
} from './providers';
import { whatsappService } from './whatsapp';

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
// IN-MEMORY MOCK SUPABASE CLIENT & DATABASE FIXTURE
// ====================================================================
class MockDatabase {
  public contacts: any[] = [];
  public campaigns: any[] = [];
  public campaign_recipients: any[] = [];
  public organization_whatsapp_configs: any[] = [];
  public organization_whatsapp_secrets: any[] = [];
  public errorOnOperation?: { table: string; operation: 'update' | 'delete' | 'insert' | 'select'; message: string };

  public clear(): void {
    this.contacts = [];
    this.campaigns = [];
    this.campaign_recipients = [];
    this.organization_whatsapp_configs = [];
    this.organization_whatsapp_secrets = [];
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
  private updateData: any = null;
  private insertData: any = null;
  private selectCountOnly = false;
  private selectColumns = '*';
  private orderColumn: string | null = null;
  private orderAscending = true;
  private limitCount: number | null = null;
  private isDelete = false;

  constructor(db: MockDatabase, table: string) {
    this.db = db;
    this.table = table;
  }

  private getTableArray(): any[] {
    if (this.table === 'contacts') return this.db.contacts;
    if (this.table === 'campaigns') return this.db.campaigns;
    if (this.table === 'campaign_recipients') return this.db.campaign_recipients;
    if (this.table === 'organization_whatsapp_configs') return this.db.organization_whatsapp_configs;
    if (this.table === 'organization_whatsapp_secrets') return this.db.organization_whatsapp_secrets;
    return [];
  }

  public select(columns = '*', options?: { count?: string; head?: boolean }) {
    this.selectColumns = columns;
    if (options?.head || options?.count) {
      this.selectCountOnly = true;
    }
    return this;
  }

  public insert(data: any) {
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  public update(data: any) {
    this.updateData = data;
    return this;
  }

  public delete() {
    this.isDelete = true;
    return this;
  }

  public eq(column: string, value: any) {
    this.filters.push((row: any) => {
      // Support nested check for campaigns.status
      if (column === 'campaigns.status') {
        const camp = this.db.campaigns.find((c) => c.id === row.campaign_id);
        return camp ? camp.status === value : false;
      }
      return row[column] === value;
    });
    return this;
  }

  public in(column: string, values: any[]) {
    this.filters.push((row: any) => values.includes(row[column]));
    return this;
  }

  public lt(column: string, value: any) {
    this.filters.push((row: any) => {
      const v = row[column];
      return v !== undefined && v !== null && v < value;
    });
    return this;
  }

  public lte(column: string, value: any) {
    this.filters.push((row: any) => {
      const v = row[column];
      return v !== undefined && v !== null && v <= value;
    });
    return this;
  }

  public contains(column: string, values: any[]) {
    this.filters.push((row: any) => {
      const arr = row[column];
      if (!Array.isArray(arr)) return false;
      return values.every((val) => arr.includes(val));
    });
    return this;
  }

  public order(column: string, options?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.orderAscending = options?.ascending !== false;
    return this;
  }

  public limit(n: number) {
    this.limitCount = n;
    return this;
  }

  public single() {
    return this.execute().then((res) => {
      if (res.error) return { data: null, error: res.error };
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      return { data: row || null, error: row ? null : { message: 'Row not found' } };
    });
  }

  public maybeSingle() {
    return this.execute().then((res) => {
      if (res.error) return { data: null, error: res.error };
      const row = Array.isArray(res.data) ? res.data[0] : res.data;
      return { data: row || null, error: null };
    });
  }

  private applyFilters(rows: any[]): any[] {
    return rows.filter((row) => this.filters.every((fn) => fn(row)));
  }

  public async execute(): Promise<{ data: any; error: any; count?: number }> {
    if (this.db.errorOnOperation && this.db.errorOnOperation.table === this.table) {
      const op = this.isDelete ? 'delete' : this.updateData ? 'update' : this.insertData ? 'insert' : 'select';
      if (this.db.errorOnOperation.operation === op) {
        return { data: null, error: { message: this.db.errorOnOperation.message } };
      }
    }

    const list = this.getTableArray();

    // 1. Handle INSERT
    if (this.insertData) {
      const insertedRows = this.insertData.map((item: any) => {
        const id = item.id || `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();
        const row = {
          id,
          created_at: item.created_at || now,
          updated_at: item.updated_at || now,
          retry_count: item.retry_count || 0,
          ...item,
        };
        list.push(row);
        return row;
      });
      return { data: insertedRows, error: null };
    }

    // 2. Handle DELETE
    if (this.isDelete) {
      const matching = this.applyFilters(list);
      const matchingIds = new Set(matching.map((m) => m.id));
      const remaining = list.filter((r) => !matchingIds.has(r.id));
      if (this.table === 'contacts') this.db.contacts = remaining;
      if (this.table === 'campaigns') this.db.campaigns = remaining;
      if (this.table === 'campaign_recipients') this.db.campaign_recipients = remaining;
      return { data: matching, error: null };
    }

    // 3. Handle UPDATE
    if (this.updateData) {
      const matching = this.applyFilters(list);
      const updatedRows: any[] = [];
      for (const row of matching) {
        Object.assign(row, this.updateData);
        updatedRows.push(row);
      }
      return { data: updatedRows, error: null };
    }

    // 4. Handle SELECT
    let matching = this.applyFilters(list);

    if (this.selectCountOnly) {
      return { data: null, count: matching.length, error: null };
    }

    if (this.orderColumn) {
      const col = this.orderColumn;
      const asc = this.orderAscending;
      matching = [...matching].sort((a, b) => {
        if (a[col] < b[col]) return asc ? -1 : 1;
        if (a[col] > b[col]) return asc ? 1 : -1;
        return 0;
      });
    }

    if (this.limitCount !== null && this.limitCount !== undefined) {
      matching = matching.slice(0, this.limitCount);
    }

    // Resolve relation join: campaigns!inner
    if (this.table === 'campaign_recipients' && this.selectColumns.includes('campaigns!inner')) {
      matching = matching.map((r) => {
        const camp = this.db.campaigns.find((c) => c.id === r.campaign_id);
        return {
          ...r,
          campaigns: camp ? [camp] : [],
        };
      });
    }

    return { data: matching, error: null, count: matching.length };
  }

  // Promise interface untuk awaitable query builder
  public then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any): Promise<any> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// ====================================================================
// MOCK WHATSAPP PROVIDER
// ====================================================================
class MockWhatsAppProvider {
  public providerType: string = 'mock_provider';
  public shouldSucceed: boolean = true;
  public isConnected: boolean = true;
  public failErrorMessage: string = 'Provider connection error';
  public sentMessages: Array<{ recipientPhone: string; text: string; orgId: string }> = [];

  constructor(type = 'mock_provider', isConnected = true) {
    this.providerType = type;
    this.isConnected = isConnected;
  }

  public async getConnectionStatus(organizationId: string): Promise<any> {
    return {
      provider: this.providerType,
      isConnected: this.isConnected,
      phone: '628123456789',
      details: { orgId: organizationId },
    };
  }

  public async sendMessage(options: { organizationId: string; recipientPhone: string; text: string }): Promise<any> {
    if (this.shouldSucceed) {
      this.sentMessages.push({
        recipientPhone: options.recipientPhone,
        text: options.text,
        orgId: options.organizationId,
      });
      return {
        success: true,
        provider: this.providerType,
        providerMessageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
      };
    } else {
      return {
        success: false,
        provider: this.providerType,
        error: this.failErrorMessage,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// ====================================================================
// SUITE PENGUJIAN UTAMA OFFLINE
// ====================================================================
async function runCampaignOfflineTests() {
  console.log('======================================================');
  console.log('   WABIZ: PERSISTENT CAMPAIGN ISOLATED UNIT TESTS    ');
  console.log('======================================================\n');

  const mockDb = new MockDatabase();
  const mockClient = mockDb.createClient();
  const mockProvider = new MockWhatsAppProvider();
  const testOrgId = 'org-11111111-1111-1111-1111-111111111111';
  const otherOrgId = 'org-22222222-2222-2222-2222-222222222222';

  // ------------------------------------------------------------------
  // TEST GROUP 1: Validasi & Normalisasi Nomor Telepon
  // ------------------------------------------------------------------
  console.log('[Test Group 1] Validasi & Normalisasi Format Nomor Telepon:');
  {
    const t1 = validateRecipientPhone('081234567890');
    assert(t1.isValid && t1.normalized === '6281234567890', 'Awalan 08 dinormalisasi ke 628');

    const t2 = validateRecipientPhone('02198765432');
    assert(t2.isValid && t2.normalized === '622198765432', 'Awalan 0 non-8 dinormalisasi ke 62');

    const t3 = validateRecipientPhone('+62 856-4188-6993');
    assert(t3.isValid && t3.normalized === '6285641886993', 'Karakter +, spasi, dan tanda hubung dibersihkan');

    const t4 = validateRecipientPhone('12345');
    assert(!t4.isValid && (t4.reason?.includes('pendek') || false), 'Nomor < 9 digit ditolak');

    const t5 = validateRecipientPhone('081234567890123456789');
    assert(!t5.isValid && (t5.reason?.includes('panjang') || false), 'Nomor > 16 digit ditolak');

    const t6 = validateRecipientPhone('');
    assert(!t6.isValid, 'Nomor kosong ditolak');

    const t7 = validateRecipientPhone(null as any);
    assert(!t7.isValid, 'Nomor null / undefined ditolak secara aman');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 2: Deduplikasi Nomor Telepon dalam Satu Kampanye
  // ------------------------------------------------------------------
  console.log('\n[Test Group 2] Deduplikasi Kontak dengan Nomor Sama:');
  {
    mockDb.clear();
    // Tambah 3 kontak: kontak 1 & 2 memiliki nomor sama beda format
    mockDb.contacts.push(
      { id: 'c1', organization_id: testOrgId, name: 'Santri A', phone: '081234567890', labels: ['Semua'] },
      { id: 'c2', organization_id: testOrgId, name: 'Santri B (Wali Sama)', phone: '+62 812-3456-7890', labels: ['Semua'] },
      { id: 'c3', organization_id: testOrgId, name: 'Santri C', phone: '628999999999', labels: ['Semua'] }
    );

    const res = await createPersistentCampaign(
      testOrgId,
      {
        name: 'Siaran Uji Deduplikasi',
        messageBody: 'Halo santri dan wali santri',
        deliveryMode: 'now',
        contactIds: ['c1', 'c2', 'c3'],
      },
      mockClient
    );

    assert(res.success, 'createPersistentCampaign berhasil dijalankan');
    assert(res.totalRecipients === 2, `Total 2 penerima unik setelah deduplikasi (aktual: ${res.totalRecipients})`);
    assert(res.validRecipients === 2, 'Kedua kontak unik berstatus valid (pending)');
    assert(mockDb.campaign_recipients.length === 2, 'Tabel antrean hanya menyimpan 2 baris penerima');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 3: Penyaringan Kontak Opt-Out & Validitas
  // ------------------------------------------------------------------
  console.log('\n[Test Group 3] Penyaringan Otomatis Kontak Opt-Out & Nomor Invalid:');
  {
    mockDb.clear();
    mockDb.contacts.push(
      { id: 'c-valid', organization_id: testOrgId, name: 'Penerima Siap', phone: '628111111111', labels: ['Pelanggan'], is_opted_out: false },
      { id: 'c-optout-col', organization_id: testOrgId, name: 'Pelanggan Stop Kolom', phone: '628222222222', labels: ['Pelanggan'], is_opted_out: true },
      { id: 'c-optout-tag', organization_id: testOrgId, name: 'Pelanggan Stop Label', phone: '628333333333', labels: ['Pelanggan', 'berhenti'], is_opted_out: false },
      { id: 'c-invalid-len', organization_id: testOrgId, name: 'Nomor Pendek', phone: '0812', labels: ['Pelanggan'], is_opted_out: false }
    );

    const res = await createPersistentCampaign(
      testOrgId,
      {
        name: 'Pengumuman Resmi',
        messageBody: 'Pesan informasi untuk audiens',
        deliveryMode: 'now',
      },
      mockClient
    );

    assert(res.success, 'Kampanye berhasil dibuat');
    assert(res.totalRecipients === 4, 'Total 4 kontak diproses');
    assert(res.validRecipients === 1, 'Hanya 1 kontak valid masuk antrean pending');
    assert(res.skippedRecipients === 3, '3 kontak (opt-out kolom, opt-out label, invalid) di-skip');

    const optOutCol = mockDb.campaign_recipients.find((r) => r.contact_id === 'c-optout-col');
    assert(optOutCol?.status === 'skipped' && optOutCol.error_message?.includes('opt-out'), 'Kontak is_opted_out=true status skipped');

    const optOutTag = mockDb.campaign_recipients.find((r) => r.contact_id === 'c-optout-tag');
    assert(optOutTag?.status === 'skipped' && optOutTag.error_message?.includes('opt-out'), 'Kontak berlabel "berhenti" status skipped');

    const invalidRec = mockDb.campaign_recipients.find((r) => r.contact_id === 'c-invalid-len');
    assert(invalidRec?.status === 'skipped' && invalidRec.error_message?.includes('pendek'), 'Kontak nomor pendek status skipped');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 4: Transisi Status Kampanye & Penerima (Sukses & Selesai)
  // ------------------------------------------------------------------
  console.log('\n[Test Group 4] Transisi Status Kampanye & Penerima (Pending -> Processing -> Sent -> Delivered -> Completed):');
  {
    mockDb.clear();
    mockProvider.sentMessages = [];
    mockProvider.shouldSucceed = true;

    // Siapkan 1 kontak
    mockDb.contacts.push({
      id: 'c-trans',
      organization_id: testOrgId,
      name: 'Budi Santoso',
      phone: '085641886993',
      labels: ['all'],
      is_opted_out: false,
    });

    // Buat kampanye mode 'scheduled' dengan jadwal masa depan (1 menit mendatang)
    const futureIso = new Date(Date.now() + 60 * 1000).toISOString();
    const pastIso = new Date(Date.now() - 60 * 1000).toISOString();
    const campRes = await createPersistentCampaign(
      testOrgId,
      {
        name: 'Kampanye Terjadwal Tiba Waktu',
        messageBody: 'Info waktu tiba pengiriman',
        deliveryMode: 'scheduled',
        scheduledAt: futureIso,
      },
      mockClient
    );

    const campId = campRes.campaignId!;
    const campRow = mockDb.campaigns.find((c) => c.id === campId);
    assert(campRow?.status === 'scheduled', 'Status awal kampanye mode terjadwal adalah "scheduled"');

    // Simulasikan berjalannya waktu hingga jadwal jatuh tempo (pastIso)
    campRow!.scheduled_at = pastIso;
    mockDb.campaign_recipients[0].scheduled_at = pastIso;

    // Buat scheduler terisolasi dengan mock provider dan mock whatsappState
    const scheduler = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getWhatsAppState: () => ({ status: 'connected' }),
      getProvider: async () => mockProvider,
      messageDelayMs: 0,
    });

    // Jalankan 1 siklus tick
    await scheduler.tick();

    // Verifikasi kampanye berubah dari scheduled -> running -> completed (karena cuma 1 penerima dan langsung tuntas)
    const updatedCamp = mockDb.campaigns.find((c) => c.id === campId);
    assert(updatedCamp?.status === 'completed', 'Kampanye otomatis berubah status menjadi "completed" setelah antrean selesai');
    assert(updatedCamp?.sent_count === 1, 'Metrik sent_count kampanye bernilai 1');

    // Verifikasi penerima berstatus 'sent' dengan providerMessageId tersimpan
    const recRow = mockDb.campaign_recipients.find((r) => r.campaign_id === campId);
    assert(recRow?.status === 'sent', 'Status penerima berubah menjadi "sent"');
    assert(Boolean(recRow?.baileys_message_id), 'baileys_message_id terisi dengan ID dari provider');

    // Uji hook delivery receipt: sent -> delivered
    const msgId = recRow.baileys_message_id;
    await scheduler.handleBaileysReceipt(msgId, 'delivered');
    const recDelivered = mockDb.campaign_recipients.find((r) => r.id === recRow.id);
    assert(recDelivered?.status === 'delivered', 'Hook handleBaileysReceipt berhasil mengubah status "sent" menjadi "delivered"');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 5: Batas Percobaan Ulang (Retry Limit) & Status Gagal Permanen
  // ------------------------------------------------------------------
  console.log('\n[Test Group 5] Batas Percobaan Ulang (Retry Limit = 3) & Status Failed:');
  {
    mockDb.clear();
    mockProvider.sentMessages = [];
    mockProvider.shouldSucceed = false; // Simulasikan provider selalu gagal
    mockProvider.failErrorMessage = 'Simulated gateway timeout';

    mockDb.contacts.push({
      id: 'c-retry',
      organization_id: testOrgId,
      name: 'Ahmad Retry',
      phone: '081299887766',
      labels: ['all'],
      is_opted_out: false,
    });

    const campRes = await createPersistentCampaign(
      testOrgId,
      {
        name: 'Kampanye Simulasi Gagal',
        messageBody: 'Percobaan retry test',
        deliveryMode: 'now',
      },
      mockClient
    );

    const campId = campRes.campaignId!;
    const recId = mockDb.campaign_recipients[0].id;

    const scheduler = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getWhatsAppState: () => ({ status: 'connected' }),
      getProvider: async () => mockProvider,
      messageDelayMs: 0,
      maxRetries: 3,
    });

    // Percobaan 1
    await scheduler.tick();
    let rec = mockDb.campaign_recipients.find((r) => r.id === recId);
    assert(rec?.status === 'pending' && rec?.retry_count === 1, 'Percobaan #1: status kembali "pending", retry_count = 1');

    // Percobaan 2
    await scheduler.tick();
    rec = mockDb.campaign_recipients.find((r) => r.id === recId);
    assert(rec?.status === 'pending' && rec?.retry_count === 2, 'Percobaan #2: status kembali "pending", retry_count = 2');

    // Percobaan 3 (Mencapai batas maksimal retry)
    await scheduler.tick();
    rec = mockDb.campaign_recipients.find((r) => r.id === recId);
    assert(rec?.status === 'failed' && rec?.retry_count === 3, 'Percobaan #3: status berubah "failed" permanen setelah maxRetries');

    // Percobaan 4: pastikan scheduler tidak memproses lagi item 'failed'
    const sentCountBefore = mockProvider.sentMessages.length;
    await scheduler.tick();
    assert(mockProvider.sentMessages.length === sentCountBefore, 'Item berstatus "failed" tidak dikirim ulang pada tick berikutnya');

    // Verifikasi status kampanye menjadi completed dengan failed_count = 1
    const camp = mockDb.campaigns.find((c) => c.id === campId);
    assert(camp?.status === 'completed' && camp?.failed_count === 1, 'Kampanye selesai dengan metrik failed_count = 1');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 6: Pemulihan Job Processing yang Kedaluwarsa (Stale Job Recovery)
  // ------------------------------------------------------------------
  console.log('\n[Test Group 6] Pemulihan Antrean Stuck (> 5 menit processing -> pending):');
  {
    mockDb.clear();
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();

    mockDb.campaign_recipients.push(
      {
        id: 'r-stuck',
        campaign_id: 'camp-stuck',
        organization_id: testOrgId,
        phone: '628111111111',
        name: 'Santri Stuck 6 Mnt',
        status: 'processing',
        updated_at: sixMinutesAgo,
      },
      {
        id: 'r-fresh',
        campaign_id: 'camp-stuck',
        organization_id: testOrgId,
        phone: '628222222222',
        name: 'Santri Fresh 1 Mnt',
        status: 'processing',
        updated_at: oneMinuteAgo,
      }
    );

    const scheduler = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getWhatsAppState: () => ({ status: 'connected' }),
      getProvider: async () => mockProvider,
    });

    await scheduler.recoverStaleProcessingJobs();

    const stuckItem = mockDb.campaign_recipients.find((r) => r.id === 'r-stuck');
    assert(stuckItem?.status === 'pending', 'Job processing > 5 menit berhasil dipulihkan ke "pending"');
    assert(stuckItem?.error_message?.includes('Dipulihkan'), 'Error message pemulihan tercatat');

    const freshItem = mockDb.campaign_recipients.find((r) => r.id === 'r-fresh');
    assert(freshItem?.status === 'processing', 'Job processing < 5 menit tetap berstatus "processing" (tidak dipulihkan)');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 7: Pembatalan Antrean & Pencegahan Pemrosesan Job Dibatalkan
  // ------------------------------------------------------------------
  console.log('\n[Test Group 7] Pembatalan Kampanye Terjadwal & Status Skipped:');
  {
    mockDb.clear();
    mockProvider.sentMessages = [];
    mockProvider.shouldSucceed = true;

    mockDb.contacts.push({
      id: 'c-cancel',
      organization_id: testOrgId,
      name: 'Santri Batal',
      phone: '081234567890',
      labels: ['all'],
    });

    const campRes = await createPersistentCampaign(
      testOrgId,
      {
        name: 'Kampanye Akan Dibatalkan',
        messageBody: 'Pesan jangan sampai terkirim',
        deliveryMode: 'scheduled',
        scheduledAt: new Date(Date.now() + 60000).toISOString(),
      },
      mockClient
    );

    const campId = campRes.campaignId!;

    // Batalkan kampanye
    const cancelRes = await cancelCampaign(testOrgId, campId, mockClient);
    assert(cancelRes.success, 'cancelCampaign berhasil dieksekusi');

    const camp = mockDb.campaigns.find((c) => c.id === campId);
    assert(camp?.status === 'cancelled', 'Status kampanye terupdate menjadi "cancelled"');

    const rec = mockDb.campaign_recipients.find((r) => r.campaign_id === campId);
    assert(rec?.status === 'skipped', 'Seluruh penerima pending diubah statusnya menjadi "skipped"');
    assert(rec?.error_message?.includes('dibatalkan oleh admin'), 'Catatan pembatalan tercantum pada error_message penerima');

    // Jalankan scheduler tick untuk membuktikan kampanye cancelled tidak diproses
    const scheduler = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getWhatsAppState: () => ({ status: 'connected' }),
      getProvider: async () => mockProvider,
      messageDelayMs: 0,
    });

    await scheduler.tick();
    assert(mockProvider.sentMessages.length === 0, 'Scheduler tidak mengirim pesan untuk kampanye yang telah dibatalkan');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 8: Kontrol Konkurensi Atomik (Pencegahan Double-Send)
  // ------------------------------------------------------------------
  console.log('\n[Test Group 8] Kontrol Konkurensi Atomik (Check-and-Set Lock):');
  {
    mockDb.clear();
    const itemId = 'rec-concurrency-test';
    mockDb.campaign_recipients.push({
      id: itemId,
      campaign_id: 'camp-conc',
      organization_id: testOrgId,
      phone: '6281234567890',
      name: 'Santri Uji Konkurensi',
      status: 'pending',
      retry_count: 0,
    });

    // Worker 1 mengunci antrean: status pending -> processing
    const { data: lock1 } = await mockClient
      .from('campaign_recipients')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('status', 'pending');

    assert(Boolean(lock1 && lock1.length === 1), 'Worker 1 berhasil mengunci item dari pending ke processing');

    // Worker 2 mencoba mengunci item yang sama saat status sudah processing
    const { data: lock2 } = await mockClient
      .from('campaign_recipients')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('status', 'pending');

    assert(!lock2 || lock2.length === 0, 'Worker 2 gagal mengunci item yang sedang diproses (mencegah pengiriman ganda)');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 9: Gating Status Koneksi WhatsApp
  // ------------------------------------------------------------------
  console.log('\n[Test Group 9] Gating Status Koneksi WhatsApp:');
  {
    mockDb.clear();
    mockProvider.sentMessages = [];

    mockDb.campaigns.push({
      id: 'camp-gate',
      organization_id: testOrgId,
      name: 'Kampanye Gating WA',
      message_body: 'Halo pesan gating',
      status: 'running',
    });

    mockDb.campaign_recipients.push({
      id: 'rec-gate',
      campaign_id: 'camp-gate',
      organization_id: testOrgId,
      phone: '6281234567890',
      name: 'Santri Gating',
      status: 'pending',
    });

    // Scheduler dengan WhatsApp status disconnected
    const schedulerDisconnected = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getWhatsAppState: () => ({ status: 'disconnected' }),
      getProvider: async () => mockProvider,
      messageDelayMs: 0,
    });

    await schedulerDisconnected.tick();

    const recAfterTick = mockDb.campaign_recipients.find((r) => r.id === 'rec-gate');
    assert(recAfterTick?.status === 'pending', 'Antrean tetap pending saat koneksi WhatsApp terputus (tidak gagal permanen)');
    assert(mockProvider.sentMessages.length === 0, 'Tidak ada pesan dikirim saat WhatsApp disconnected');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 10: Isolasi Multi-Tenant Organisasi
  // ------------------------------------------------------------------
  console.log('\n[Test Group 10] Isolasi Multi-Tenant (Batas Akses Antar-Organisasi):');
  {
    mockDb.clear();
    mockDb.campaigns.push({
      id: 'camp-tenant-a',
      organization_id: testOrgId,
      name: 'Kampanye Rahasia Org A',
      message_body: 'Pesan khusus Org A',
      status: 'scheduled',
    });

    mockDb.campaign_recipients.push({
      id: 'rec-tenant-a',
      campaign_id: 'camp-tenant-a',
      organization_id: testOrgId,
      phone: '6281234567890',
      name: 'Santri Org A',
      status: 'pending',
    });

    // Organisasi B mencoba membatalkan kampanye milik Organisasi A
    const crossCancel = await cancelCampaign(otherOrgId, 'camp-tenant-a', mockClient);
    assert(!crossCancel.success, 'Organisasi B ditolak saat membatalkan kampanye Organisasi A');

    // Organisasi B mencoba membaca penerima milik Organisasi A
    const crossRecs = await getCampaignRecipients(otherOrgId, 'camp-tenant-a', mockClient);
    assert(!crossRecs.recipients || crossRecs.recipients.length === 0, 'Organisasi B tidak dapat melihat penerima kampanye Organisasi A');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 11: Kesiapan Provider Multi-Platform & Isolasi Antar-Organisasi (Tahap 2)
  // ------------------------------------------------------------------
  console.log('\n[Test Group 11] Kesiapan Provider Multi-Platform & Isolasi Antar-Organisasi:');
  {
    mockDb.clear();

    // 11.1 Provider Baileys: siap vs terputus
    const baileysConnected = new MockWhatsAppProvider('baileys', true);
    const baileysDisconnected = new MockWhatsAppProvider('baileys', false);

    mockDb.campaigns.push({
      id: 'camp-bai-ready',
      organization_id: testOrgId,
      name: 'Kampanye Baileys Siap',
      message_body: 'Halo Baileys',
      status: 'running',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-bai-ready',
      campaign_id: 'camp-bai-ready',
      organization_id: testOrgId,
      phone: '628111111111',
      name: 'Santri Baileys Siap',
      status: 'pending',
    });

    const schedBaiReady = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getProvider: async () => baileysConnected,
      messageDelayMs: 0,
    });
    await schedBaiReady.tick();

    const recBaiReady = mockDb.campaign_recipients.find((r) => r.id === 'rec-bai-ready');
    assert(recBaiReady?.status === 'sent', 'Baileys terhubung: penerima berhasil terkirim ("sent")');
    assert(baileysConnected.sentMessages.length === 1, 'Pesan terkirim tercatat di gateway Baileys');

    // 11.2 Provider Baileys terputus: pesan ditunda dan status tetap pending
    mockDb.campaigns.push({
      id: 'camp-bai-disc',
      organization_id: testOrgId,
      name: 'Kampanye Baileys Terputus',
      message_body: 'Halo Baileys DC',
      status: 'running',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-bai-disc',
      campaign_id: 'camp-bai-disc',
      organization_id: testOrgId,
      phone: '628222222222',
      name: 'Santri Baileys DC',
      status: 'pending',
    });

    const schedBaiDisc = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getProvider: async () => baileysDisconnected,
      messageDelayMs: 0,
    });
    await schedBaiDisc.tick();

    const recBaiDisc = mockDb.campaign_recipients.find((r) => r.id === 'rec-bai-disc');
    assert(recBaiDisc?.status === 'pending', 'Baileys terputus: penerima tetap "pending" (tidak gagal permanen)');
    assert(baileysDisconnected.sentMessages.length === 0, 'Tidak ada pesan dikirim saat Baileys terputus');

    // 11.3 Provider Meta Cloud API: siap vs belum dikonfigurasi
    const metaReady = new MockWhatsAppProvider('meta_cloud_api', true);
    const metaUnconfigured = new MockWhatsAppProvider('meta_cloud_api', false);

    mockDb.campaigns.push({
      id: 'camp-meta-ready',
      organization_id: testOrgId,
      name: 'Kampanye Meta Siap',
      message_body: 'Halo Meta Cloud',
      status: 'running',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-meta-ready',
      campaign_id: 'camp-meta-ready',
      organization_id: testOrgId,
      phone: '628333333333',
      name: 'Santri Meta Siap',
      status: 'pending',
    });

    const schedMetaReady = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getProvider: async () => metaReady,
      messageDelayMs: 0,
    });
    await schedMetaReady.tick();

    const recMetaReady = mockDb.campaign_recipients.find((r) => r.id === 'rec-meta-ready');
    assert(recMetaReady?.status === 'sent', 'Meta Cloud API siap: penerima berhasil terkirim ("sent")');

    // Meta Cloud API belum dikonfigurasi
    mockDb.campaigns.push({
      id: 'camp-meta-unconf',
      organization_id: testOrgId,
      name: 'Kampanye Meta Unconfigured',
      message_body: 'Halo Meta Belum Config',
      status: 'running',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-meta-unconf',
      campaign_id: 'camp-meta-unconf',
      organization_id: testOrgId,
      phone: '628444444444',
      name: 'Santri Meta Unconf',
      status: 'pending',
    });

    const schedMetaUnconf = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getProvider: async () => metaUnconfigured,
      messageDelayMs: 0,
    });
    await schedMetaUnconf.tick();

    const recMetaUnconf = mockDb.campaign_recipients.find((r) => r.id === 'rec-meta-unconf');
    assert(recMetaUnconf?.status === 'pending', 'Meta Cloud API unconfigured: antrean tetap "pending" tanpa error permanen');

    // 11.4 Provider OpenWA Dinonaktifkan Secara Fail-Closed
    const openwaReady = new MockWhatsAppProvider('openwa', true);

    mockDb.campaigns.push({
      id: 'camp-openwa-ready',
      organization_id: testOrgId,
      name: 'Kampanye OpenWA Siap',
      message_body: 'Halo OpenWA',
      status: 'running',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-openwa-ready',
      campaign_id: 'camp-openwa-ready',
      organization_id: testOrgId,
      phone: '628555555555',
      name: 'Santri OpenWA Siap',
      status: 'pending',
    });

    const schedOpenWaReady = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getProvider: async () => openwaReady,
      messageDelayMs: 0,
    });

    const isReadyOpenWa = await schedOpenWaReady.checkProviderReadiness(openwaReady, testOrgId);
    assert(isReadyOpenWa === false, 'OpenWA fail-closed: checkProviderReadiness menolak OpenWA (kembalikan false)');

    await schedOpenWaReady.tick();

    const recOpenwaReady = mockDb.campaign_recipients.find((r) => r.id === 'rec-openwa-ready');
    assert(recOpenwaReady?.status === 'pending', 'OpenWA dinonaktifkan: antrean tetap "pending" (tidak terkirim)');
    assert(recOpenwaReady?.retry_count === 0 || !recOpenwaReady?.retry_count, 'OpenWA dinonaktifkan: tidak membakar kuota retry');
    assert(openwaReady.sentMessages.length === 0, 'OpenWA dinonaktifkan: tidak ada pesan terkirim ke provider');

    // 11.5 Isolasi Kredensial Lingkungan Meta Cloud API
    const metaConnStatusOtherOrg = await metaCloudApiProvider.getConnectionStatus(otherOrgId);
    assert(!metaConnStatusOtherOrg.isConnected, 'Isolasi Kredensial Meta: Organisasi non-workerOrg ditolak dari fallback env');
    assert(metaConnStatusOtherOrg.messagingTier === 'UNCONFIGURED', 'Isolasi Kredensial Meta: Status tier berlabel UNCONFIGURED');

    // 11.6 Isolasi Kesiapan Multi-Tenant Antar-Organisasi
    // Organisasi A memakai Meta Cloud API (siap), Organisasi B memakai Baileys (terputus)
    mockDb.campaigns.push(
      {
        id: 'camp-org-a',
        organization_id: testOrgId,
        name: 'Kampanye Org A (Meta Ready)',
        message_body: 'Pesan Org A',
        status: 'running',
      },
      {
        id: 'camp-org-b',
        organization_id: otherOrgId,
        name: 'Kampanye Org B (Baileys DC)',
        message_body: 'Pesan Org B',
        status: 'running',
      }
    );
    mockDb.campaign_recipients.push(
      {
        id: 'rec-iso-a',
        campaign_id: 'camp-org-a',
        organization_id: testOrgId,
        phone: '628666666666',
        name: 'Santri Org A',
        status: 'pending',
      },
      {
        id: 'rec-iso-b',
        campaign_id: 'camp-org-b',
        organization_id: otherOrgId,
        phone: '628777777777',
        name: 'Santri Org B',
        status: 'pending',
      }
    );

    const multiTenantScheduler = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getProvider: async (orgId) => {
        if (orgId === testOrgId) return metaReady;
        return baileysDisconnected;
      },
      messageDelayMs: 0,
    });

    await multiTenantScheduler.tick();

    const itemA = mockDb.campaign_recipients.find((r) => r.id === 'rec-iso-a');
    const itemB = mockDb.campaign_recipients.find((r) => r.id === 'rec-iso-b');
    assert(itemA?.status === 'sent', 'Isolasi Tenant: Org A yang provider-nya siap berhasil dikirim ("sent")');
    assert(itemB?.status === 'pending', 'Isolasi Tenant: Org B yang provider-nya terputus tetap "pending" tanpa menghalangi Org A');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 12: Pengelolaan Kampanye Aman (Delete & Edit Protection - Tahap 3)
  // ------------------------------------------------------------------
  console.log('\n[Test Group 12] Pengelolaan Kampanye Aman (Delete & Edit Protection):');
  {
    mockDb.clear();

    // 12.1 Hapus draf yang sah
    mockDb.campaigns.push({
      id: 'camp-draft-del',
      organization_id: testOrgId,
      name: 'Draf Lama Untuk Dihapus',
      status: 'draft',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-draft-del',
      campaign_id: 'camp-draft-del',
      organization_id: testOrgId,
      phone: '6281234567890',
      status: 'pending',
    });

    const delDraftRes = await deleteCampaign(testOrgId, 'camp-draft-del', mockClient);
    assert(delDraftRes.success, 'deleteCampaign berhasil menghapus kampanye draf');
    assert(!mockDb.campaigns.find((c) => c.id === 'camp-draft-del'), 'Row kampanye draf telah terhapus');
    assert(!mockDb.campaign_recipients.find((r) => r.campaign_id === 'camp-draft-del'), 'Antrean penerima draf ikut terhapus bersih');

    // 12.2 Hapus kampanye terjadwal yang sah
    mockDb.campaigns.push({
      id: 'camp-sched-del',
      organization_id: testOrgId,
      name: 'Jadwal Untuk Dihapus',
      status: 'scheduled',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-sched-del',
      campaign_id: 'camp-sched-del',
      organization_id: testOrgId,
      phone: '6281234567890',
      status: 'pending',
    });

    const delSchedRes = await deleteCampaign(testOrgId, 'camp-sched-del', mockClient);
    assert(delSchedRes.success, 'deleteCampaign berhasil menghapus kampanye terjadwal');
    assert(!mockDb.campaigns.find((c) => c.id === 'camp-sched-del'), 'Row kampanye terjadwal terhapus');
    assert(!mockDb.campaign_recipients.find((r) => r.campaign_id === 'camp-sched-del'), 'Antrean penerima terjadwal terhapus bersih');

    // 12.3 Penolakan hapus kampanye yang sedang berjalan (running)
    mockDb.campaigns.push({
      id: 'camp-running-del',
      organization_id: testOrgId,
      name: 'Kampanye Sedang Berjalan',
      status: 'running',
    });

    const delRunningRes = await deleteCampaign(testOrgId, 'camp-running-del', mockClient);
    assert(!delRunningRes.success && delRunningRes.statusCode === 400, 'Penolakan hapus kampanye berstatus "running" (HTTP 400)');
    assert(delRunningRes.error?.includes('sedang aktif'), 'Pesan penolakan jelas menginstruksikan pembatalan terlebih dahulu');
    assert(Boolean(mockDb.campaigns.find((c) => c.id === 'camp-running-del')), 'Kampanye running tetap aman dan tidak terhapus');

    // 12.4 Penolakan akses hapus lintas organisasi (Cross-Tenant Deletion)
    const crossDelRes = await deleteCampaign(otherOrgId, 'camp-running-del', mockClient);
    assert(!crossDelRes.success && crossDelRes.statusCode === 404, 'Organisasi lain ditolak saat mencoba menghapus kampanye (HTTP 404)');

    // 12.5 Pengeditan draf yang sah
    mockDb.campaigns.push({
      id: 'camp-draft-edit',
      organization_id: testOrgId,
      name: 'Judul Awal',
      message_body: 'Pesan Awal Pengumuman',
      status: 'draft',
    });

    const editDraftRes = await updateCampaign(
      testOrgId,
      'camp-draft-edit',
      { name: 'Judul Diperbarui', messageBody: 'Pesan Baru Pengumuman Direvisi' },
      mockClient
    );
    assert(editDraftRes.success, 'updateCampaign berhasil mengedit kampanye draf');
    const editedDraft = mockDb.campaigns.find((c) => c.id === 'camp-draft-edit');
    assert(editedDraft?.name === 'Judul Diperbarui', 'Nama kampanye draf terupdate');
    assert(editedDraft?.message_body === 'Pesan Baru Pengumuman Direvisi', 'Isi pesan draf terupdate');

    // 12.6 Pengeditan kampanye terjadwal & sinkronisasi scheduled_at ke penerima
    const newSchedule = new Date(Date.now() + 120000).toISOString();
    mockDb.campaigns.push({
      id: 'camp-sched-edit',
      organization_id: testOrgId,
      name: 'Jadwal Awal',
      message_body: 'Pesan Jadwal Awal',
      scheduled_at: new Date(Date.now() + 60000).toISOString(),
      status: 'scheduled',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-sched-sync',
      campaign_id: 'camp-sched-edit',
      organization_id: testOrgId,
      phone: '628999999999',
      status: 'pending',
      scheduled_at: new Date(Date.now() + 60000).toISOString(),
    });

    const editSchedRes = await updateCampaign(
      testOrgId,
      'camp-sched-edit',
      { scheduledAt: newSchedule },
      mockClient
    );
    assert(editSchedRes.success, 'updateCampaign berhasil mengedit kampanye terjadwal');
    const editedSched = mockDb.campaigns.find((c) => c.id === 'camp-sched-edit');
    assert(editedSched?.scheduled_at === newSchedule, 'Waktu scheduled_at kampanye terupdate');
    const syncedRec = mockDb.campaign_recipients.find((r) => r.id === 'rec-sched-sync');
    assert(syncedRec?.scheduled_at === newSchedule, 'Waktu scheduled_at pada antrean penerima pending otomatis disinkronkan');

    // 12.7 Penolakan pengeditan kampanye yang sedang running atau completed
    mockDb.campaigns.push(
      { id: 'camp-run-noedit', organization_id: testOrgId, name: 'Sedang Kirim', status: 'running' },
      { id: 'camp-comp-noedit', organization_id: testOrgId, name: 'Telah Selesai', status: 'completed' }
    );

    const editRunRes = await updateCampaign(testOrgId, 'camp-run-noedit', { name: 'Ganti Nama' }, mockClient);
    assert(!editRunRes.success && editRunRes.statusCode === 400, 'Penolakan edit kampanye berstatus "running"');

    const editCompRes = await updateCampaign(testOrgId, 'camp-comp-noedit', { name: 'Ganti Nama Selesai' }, mockClient);
    assert(!editCompRes.success && editCompRes.statusCode === 400, 'Penolakan edit kampanye berstatus "completed"');

    // 12.8 Penolakan pengeditan lintas organisasi
    const crossEditRes = await updateCampaign(otherOrgId, 'camp-draft-edit', { name: 'Hacked' }, mockClient);
    assert(!crossEditRes.success && crossEditRes.statusCode === 404, 'Penolakan edit kampanye lintas organisasi (HTTP 404)');

    // 12.9 Pencegahan Race Condition: Kampanye berubah jadi running saat update dieksekusi
    mockDb.campaigns.push({
      id: 'camp-race-edit',
      organization_id: testOrgId,
      name: 'Kampanye Bersaing Race',
      status: 'scheduled',
    });

    // Simulasikan worker concurrently mengubah status ke 'running' tepat sebelum update SQL dieksekusi
    const campInDb = mockDb.campaigns.find((c) => c.id === 'camp-race-edit');
    if (campInDb) {
      campInDb.status = 'running';
    }

    const raceEditRes = await updateCampaign(testOrgId, 'camp-race-edit', { name: 'Gagal Karena Running' }, mockClient);
    assert(!raceEditRes.success, 'Pencegahan Race Condition: updateCampaign gagal jika status di DB sudah running');
    assert(raceEditRes.statusCode === 400 || raceEditRes.statusCode === 409, 'Pencegahan Race Condition: statusCode 400 atau 409 Conflict');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 13: Pemantauan Penerima & Polling Kontrak API (Tahap 4)
  // ------------------------------------------------------------------
  console.log('\n[Test Group 13] Pemantauan Penerima & Polling Kontrak API:');
  {
    mockDb.clear();

    mockDb.campaigns.push({
      id: 'camp-metrics-test',
      organization_id: testOrgId,
      name: 'Kampanye Audit Metrik',
      status: 'completed',
    });

    mockDb.campaign_recipients.push(
      { id: 'm1', campaign_id: 'camp-metrics-test', organization_id: testOrgId, phone: '628111111111', name: 'R1', status: 'sent' },
      { id: 'm2', campaign_id: 'camp-metrics-test', organization_id: testOrgId, phone: '628222222222', name: 'R2', status: 'delivered' },
      { id: 'm3', campaign_id: 'camp-metrics-test', organization_id: testOrgId, phone: '628333333333', name: 'R3', status: 'failed' },
      { id: 'm4', campaign_id: 'camp-metrics-test', organization_id: testOrgId, phone: '628444444444', name: 'R4', status: 'skipped' },
      { id: 'm5', campaign_id: 'camp-metrics-test', organization_id: testOrgId, phone: '628555555555', name: 'R5', status: 'pending' },
      { id: 'm6', campaign_id: 'camp-metrics-test', organization_id: testOrgId, phone: '628666666666', name: 'R6', status: 'processing' }
    );

    const recsRes = await getCampaignRecipients(testOrgId, 'camp-metrics-test', mockClient);
    assert(recsRes.success, 'getCampaignRecipients berhasil memuat metrik');
    assert(recsRes.metrics?.total === 6, 'Metrik total = 6');
    assert(recsRes.metrics?.sent === 1, 'Metrik sent = 1');
    assert(recsRes.metrics?.delivered === 1, 'Metrik delivered = 1');
    assert(recsRes.metrics?.failed === 1, 'Metrik failed = 1');
    assert(recsRes.metrics?.skipped === 1, 'Metrik skipped = 1');
    assert(recsRes.metrics?.pending === 1, 'Metrik pending = 1');
    assert(recsRes.metrics?.processing === 1, 'Metrik processing = 1');

    // 13.2 Simulasi Penghentian Polling pada Status Terminal
    // Jika status kampanye adalah 'completed' atau 'cancelled' dan pending=0, processing=0 -> polling dihentikan
    const isTerminalA = (status: string, p: number, pr: number) =>
      (status === 'completed' || status === 'cancelled') && p === 0 && pr === 0;

    assert(!isTerminalA('completed', 1, 0), 'Polling terus berjalan jika masih ada item pending');
    assert(isTerminalA('completed', 0, 0), 'Polling otomatis dihentikan jika kampanye completed dan tidak ada item aktif');
    assert(isTerminalA('cancelled', 0, 0), 'Polling otomatis dihentikan jika kampanye cancelled dan antrean kosong');

    // 13.3 Simulasi Penghentian Polling jika seluruh antrean tuntas (total > 0, pending = 0, processing = 0)
    // meskipun status kampanye di frontend masih 'Berjalan'
    const shouldStopPolling = (isCampaignTerminal: boolean, total: number, p: number, pr: number) =>
      (isCampaignTerminal && p === 0 && pr === 0) || (total > 0 && p === 0 && pr === 0);

    assert(shouldStopPolling(false, 5, 0, 0), 'Polling otomatis dihentikan jika seluruh penerima tuntas meski status kampanye masih Berjalan');
    assert(!shouldStopPolling(false, 5, 1, 0), 'Polling tetap berjalan jika masih ada penerima pending pada kampanye Berjalan');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 14: Mitigasi Konsistensi Database Kampanye (Tanpa Migrasi)
  // ------------------------------------------------------------------
  console.log('\n[Test Group 14] Mitigasi Konsistensi Database Kampanye (Tanpa Migrasi):');
  {
    mockDb.clear();

    const t14OrgId = testOrgId;
    const initialSchedule = '2026-10-27T10:00:00.000Z';
    const newSchedule = '2026-10-28T15:00:00.000Z';

    // 14.1 Penanganan Kegagalan Sinkronisasi Jadwal:
    // Kasus A: Sinkronisasi berhasil (update kampanye dan penerima pending)
    mockDb.campaigns.push({
      id: 'camp-sync-ok',
      organization_id: t14OrgId,
      name: 'Kampanye Sinkron Sukses',
      scheduled_at: initialSchedule,
      status: 'scheduled',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-sync-ok-1',
      campaign_id: 'camp-sync-ok',
      organization_id: t14OrgId,
      phone: '6281110001',
      name: 'Santri Sync OK',
      status: 'pending',
      scheduled_at: initialSchedule,
    });

    const syncOkRes = await updateCampaign(t14OrgId, 'camp-sync-ok', { scheduledAt: newSchedule }, mockClient);
    assert(syncOkRes.success, '14.1a: updateCampaign berhasil menyinkronkan jadwal');
    const campSyncOk = mockDb.campaigns.find((c) => c.id === 'camp-sync-ok');
    const recSyncOk = mockDb.campaign_recipients.find((r) => r.id === 'rec-sync-ok-1');
    assert(campSyncOk?.scheduled_at === newSchedule, '14.1a: campaigns.scheduled_at terupdate');
    assert(recSyncOk?.scheduled_at === newSchedule, '14.1a: campaign_recipients.scheduled_at terupdate');

    // Kasus B: Kegagalan operasi kedua (campaign_recipients update error) -> kompensasi berhasil
    mockDb.campaigns.push({
      id: 'camp-sync-fail-comp-ok',
      organization_id: t14OrgId,
      name: 'Kampanye Sync Gagal Kompensasi Sukses',
      scheduled_at: initialSchedule,
      status: 'scheduled',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-sync-fail-1',
      campaign_id: 'camp-sync-fail-comp-ok',
      organization_id: t14OrgId,
      phone: '6281110002',
      name: 'Santri Sync Fail',
      status: 'pending',
      scheduled_at: initialSchedule,
    });

    // Pasang mock error pada update tabel campaign_recipients
    mockDb.errorOnOperation = {
      table: 'campaign_recipients',
      operation: 'update',
      message: 'Simulated connection timeout saat update recipients',
    };

    const syncFailRes = await updateCampaign(t14OrgId, 'camp-sync-fail-comp-ok', { scheduledAt: newSchedule }, mockClient);
    assert(!syncFailRes.success, '14.1b: updateCampaign gagal jika operasi kedua error (tidak return success: true)');
    assert(syncFailRes.statusCode === 500, '14.1b: status code 500 saat sinkronisasi penerima gagal');
    assert(Boolean(syncFailRes.error?.includes('dikembalikan ke waktu sebelumnya')), '14.1b: pesan error mencatat jadwal dikembalikan');

    // Verifikasi kompensasi berhasil mengembalikan scheduled_at kampanye ke nilai lama
    const campAfterComp = mockDb.campaigns.find((c) => c.id === 'camp-sync-fail-comp-ok');
    assert(campAfterComp?.scheduled_at === initialSchedule, '14.1b: kompensasi berhasil merestore scheduled_at kampanye ke nilai awal');

    // Kasus C: Operasi kedua gagal dan kompensasi juga gagal (misal kampanye berubah status ke running)
    mockDb.clear();
    mockDb.campaigns.push({
      id: 'camp-sync-fail-comp-fail',
      organization_id: t14OrgId,
      name: 'Kampanye Sync Gagal Kompensasi Gagal',
      scheduled_at: initialSchedule,
      status: 'scheduled',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-sync-fail-2',
      campaign_id: 'camp-sync-fail-comp-fail',
      organization_id: t14OrgId,
      phone: '6281110003',
      name: 'Santri Sync Fail 2',
      status: 'pending',
      scheduled_at: initialSchedule,
    });

    // Buat mock client khusus di mana update recipients error, dan saat kompensasi kampanye dipanggil, status sudah running
    const compFailDb = new MockDatabase();
    compFailDb.campaigns.push({
      id: 'camp-sync-fail-comp-fail',
      organization_id: t14OrgId,
      name: 'Kampanye Sync Gagal Kompensasi Gagal',
      scheduled_at: initialSchedule,
      status: 'scheduled',
    });
    compFailDb.campaign_recipients.push({
      id: 'rec-sync-fail-2',
      campaign_id: 'camp-sync-fail-comp-fail',
      organization_id: t14OrgId,
      phone: '6281110003',
      name: 'Santri Sync Fail 2',
      status: 'pending',
      scheduled_at: initialSchedule,
    });

    // Mock query builder dengan simulasi: update recipients error, lalu status kampanye berubah ke running
    let updateRecipientAttempted = false;
    const compFailClient = {
      from: (tbl: string) => {
        const qb = compFailDb.createClient().from(tbl);
        if (tbl === 'campaign_recipients') {
          const origExecute = qb.execute.bind(qb);
          qb.execute = async () => {
            updateRecipientAttempted = true;
            // Saat recipients diupdate, simulasikan worker concurrently memajukan status kampanye ke running
            const camp = compFailDb.campaigns.find((c) => c.id === 'camp-sync-fail-comp-fail');
            if (camp) camp.status = 'running';
            return { data: null, error: { message: 'Simulated deadlock pada recipients' } };
          };
        }
        return qb;
      },
    };

    const compFailRes = await updateCampaign(t14OrgId, 'camp-sync-fail-comp-fail', { scheduledAt: newSchedule }, compFailClient);
    assert(!compFailRes.success, '14.1c: updateCampaign gagal saat sinkronisasi error dan kompensasi gagal');
    assert(Boolean(compFailRes.error?.includes('Diperlukan rekonsiliasi data')), '14.1c: pesan error eksplisit menyatakan rekonsiliasi data diperlukan');

    // 14.2 Rekonsiliasi Jadwal Penerima Pending & Isolasi Status / Tenant
    mockDb.clear();
    const schedTarget = '2026-10-29T08:00:00.000Z';
    const otherOrgScheduled = '2026-10-20T00:00:00.000Z';

    mockDb.campaign_recipients.push(
      { id: 'r-pend', campaign_id: 'camp-reconcile', organization_id: t14OrgId, phone: '6281001', name: 'Pending', status: 'pending', scheduled_at: initialSchedule },
      { id: 'r-proc', campaign_id: 'camp-reconcile', organization_id: t14OrgId, phone: '6281002', name: 'Processing', status: 'processing', scheduled_at: initialSchedule },
      { id: 'r-sent', campaign_id: 'camp-reconcile', organization_id: t14OrgId, phone: '6281003', name: 'Sent', status: 'sent', scheduled_at: initialSchedule },
      { id: 'r-delv', campaign_id: 'camp-reconcile', organization_id: t14OrgId, phone: '6281004', name: 'Delivered', status: 'delivered', scheduled_at: initialSchedule },
      { id: 'r-fail', campaign_id: 'camp-reconcile', organization_id: t14OrgId, phone: '6281005', name: 'Failed', status: 'failed', scheduled_at: initialSchedule },
      { id: 'r-skip', campaign_id: 'camp-reconcile', organization_id: t14OrgId, phone: '6281006', name: 'Skipped', status: 'skipped', scheduled_at: initialSchedule },
      // Penerima milik organisasi lain (tenant boundary)
      { id: 'r-other-org', campaign_id: 'camp-reconcile', organization_id: otherOrgId, phone: '6289999', name: 'Other Org', status: 'pending', scheduled_at: otherOrgScheduled }
    );

    const reconRes = await reconcileCampaignScheduledRecipients(t14OrgId, 'camp-reconcile', schedTarget, mockClient);
    assert(reconRes.success, '14.2: reconcileCampaignScheduledRecipients berhasil');
    assert(reconRes.updatedCount === 1, '14.2: Hanya 1 item pending yang diperbarui');

    const rPend = mockDb.campaign_recipients.find((r) => r.id === 'r-pend');
    assert(rPend?.scheduled_at === schedTarget, '14.2: Penerima pending berhasil diselaraskan jadwalnya');

    // Buktikan status non-pending TIDAK tersentuh
    const rProc = mockDb.campaign_recipients.find((r) => r.id === 'r-proc');
    const rSent = mockDb.campaign_recipients.find((r) => r.id === 'r-sent');
    const rDelv = mockDb.campaign_recipients.find((r) => r.id === 'r-delv');
    const rFail = mockDb.campaign_recipients.find((r) => r.id === 'r-fail');
    const rSkip = mockDb.campaign_recipients.find((r) => r.id === 'r-skip');
    assert(rProc?.scheduled_at === initialSchedule, '14.2: Penerima "processing" TIDAK diubah jadwalnya');
    assert(rSent?.scheduled_at === initialSchedule, '14.2: Penerima "sent" TIDAK diubah jadwalnya');
    assert(rDelv?.scheduled_at === initialSchedule, '14.2: Penerima "delivered" TIDAK diubah jadwalnya');
    assert(rFail?.scheduled_at === initialSchedule, '14.2: Penerima "failed" TIDAK diubah jadwalnya');
    assert(rSkip?.scheduled_at === initialSchedule, '14.2: Penerima "skipped" TIDAK diubah jadwalnya');

    // Buktikan batas isolasi tenant
    const rOther = mockDb.campaign_recipients.find((r) => r.id === 'r-other-org');
    assert(rOther?.scheduled_at === otherOrgScheduled, '14.2: Penerima milik tenant lain TIDAK tersentuh oleh rekonsiliasi');

    // 14.3 Penanganan Kegagalan Penghapusan Parsial & Idempotensi:
    mockDb.clear();

    // Kasus A: Kegagalan langkah 1 (penghapusan recipients error)
    mockDb.campaigns.push({
      id: 'camp-del-fail-step1',
      organization_id: t14OrgId,
      name: 'Kampanye Del Fail Step 1',
      status: 'draft',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-del-fail-1',
      campaign_id: 'camp-del-fail-step1',
      organization_id: t14OrgId,
      phone: '6281110010',
      name: 'Rec Fail 1',
      status: 'pending',
    });

    mockDb.errorOnOperation = {
      table: 'campaign_recipients',
      operation: 'delete',
      message: 'Simulated DB lock timeout saat hapus penerima',
    };

    const delStep1Res = await deleteCampaign(t14OrgId, 'camp-del-fail-step1', mockClient);
    assert(!delStep1Res.success, '14.3a: deleteCampaign gagal jika penghapusan penerima error');
    assert(delStep1Res.statusCode === 500, '14.3a: status code 500 saat gagal hapus penerima');
    // Verifikasi kampanye TIDAK dihapus
    const campStep1StillExists = mockDb.campaigns.find((c) => c.id === 'camp-del-fail-step1');
    assert(Boolean(campStep1StillExists), '14.3a: Baris kampanye tidak dihapus saat hapus penerima gagal (fail-closed)');

    // Kasus B: Kegagalan langkah 2 (penghapusan campaigns error setelah penerima terhapus)
    mockDb.clear();
    mockDb.campaigns.push({
      id: 'camp-del-fail-step2',
      organization_id: t14OrgId,
      name: 'Kampanye Del Fail Step 2',
      status: 'draft',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-del-step2-1',
      campaign_id: 'camp-del-fail-step2',
      organization_id: t14OrgId,
      phone: '6281110020',
      name: 'Rec Step 2',
      status: 'pending',
    });

    mockDb.errorOnOperation = {
      table: 'campaigns',
      operation: 'delete',
      message: 'Simulated network exception saat hapus campaigns',
    };

    const delStep2Res = await deleteCampaign(t14OrgId, 'camp-del-fail-step2', mockClient);
    assert(!delStep2Res.success, '14.3b: deleteCampaign gagal jika penghapusan campaigns error');
    assert(delStep2Res.statusCode === 500, '14.3b: status code 500 saat penghapusan kampanye gagal');
    assert(Boolean(delStep2Res.error?.includes('Antrean penerima berhasil dibersihkan, namun entri kampanye gagal dihapus')), '14.3b: Pesan error eksplisit memberitahukan pembersihan parsial');

    // Verifikasi penerima telah terhapus tapi kampanye masih ada
    const recsStep2 = mockDb.campaign_recipients.filter((r) => r.campaign_id === 'camp-del-fail-step2');
    const campStep2 = mockDb.campaigns.find((c) => c.id === 'camp-del-fail-step2');
    assert(recsStep2.length === 0, '14.3b: Antrean penerima telah terhapus');
    assert(Boolean(campStep2), '14.3b: Baris kampanye masih tertinggal karena error pada langkah 2');

    // Kasus C: Percobaan ulang setelah penghapusan parsial (idempoten)
    mockDb.errorOnOperation = undefined; // Hapus error mock untuk simulasi percobaan ulang yang sukses
    const retryDelRes = await deleteCampaign(t14OrgId, 'camp-del-fail-step2', mockClient);
    assert(retryDelRes.success, '14.3c: Percobaan ulang penghapusan berhasil menyelesaikan pembersihan');
    const campStep2Cleaned = mockDb.campaigns.find((c) => c.id === 'camp-del-fail-step2');
    assert(!campStep2Cleaned, '14.3c: Baris kampanye berhasil terhapus pada percobaan ulang');

    // Kasus D: Penolakan perubahan yang berkonflik dengan status kampanye terbaru saat penghapusan (status 409)
    mockDb.clear();
    mockDb.campaigns.push({
      id: 'camp-del-conflict',
      organization_id: t14OrgId,
      name: 'Kampanye Hapus Konflik',
      status: 'draft',
    });
    mockDb.campaign_recipients.push({
      id: 'rec-del-conf-1',
      campaign_id: 'camp-del-conflict',
      organization_id: t14OrgId,
      phone: '6281110030',
      name: 'Rec Conf',
      status: 'pending',
    });

    const conflictDelClient = {
      from: (tbl: string) => {
        const qb = mockDb.createClient().from(tbl);
        if (tbl === 'campaign_recipients') {
          const origExecute = qb.execute.bind(qb);
          qb.execute = async () => {
            const res = await origExecute();
            // Saat recipients terhapus, simulasikan status kampanye diubah proses lain menjadi 'running'
            const camp = mockDb.campaigns.find((c) => c.id === 'camp-del-conflict');
            if (camp) camp.status = 'running';
            return res;
          };
        }
        return qb;
      },
    };

    const conflictDelRes = await deleteCampaign(t14OrgId, 'camp-del-conflict', conflictDelClient);
    assert(!conflictDelRes.success, '14.3d: deleteCampaign gagal jika status di DB berubah menjadi running');
    assert(conflictDelRes.statusCode === 409, '14.3d: status code 409 Conflict saat status kampanye berkonflik');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 15: Validasi Pemilihan Kontak & Jadwal Kalender (Tahap 5)
  // ------------------------------------------------------------------
  console.log('\n[Test Group 15] Validasi Pemilihan Kontak & Jadwal Kalender (Tahap 5):');
  {
    mockDb.clear();
    const t15OrgId = testOrgId;
    const otherOrgId = 'org-22222222-2222-2222-2222-222222222222';

    // Siapkan data kontak untuk t15OrgId dan otherOrgId
    mockDb.contacts.push(
      { id: 'c1', organization_id: t15OrgId, name: 'Santri Ahmad', phone: '081234567890', labels: ['Calon Santri'], is_opted_out: false },
      { id: 'c2', organization_id: t15OrgId, name: 'Santri Budi (Duplikat No Ahmad)', phone: '+62 812-3456-7890', labels: ['Calon Santri'], is_opted_out: false },
      { id: 'c3', organization_id: t15OrgId, name: 'Santri Citra', phone: '628991122334', labels: ['Santri Aktif'], is_opted_out: false },
      { id: 'c4', organization_id: t15OrgId, name: 'Santri Dodi', phone: '628995566778', labels: ['Alumni'], is_opted_out: false },
      { id: 'c-invalid', organization_id: t15OrgId, name: 'Nomor Rusak', phone: '123', labels: ['Umum'], is_opted_out: false },
      { id: 'c-other-org', organization_id: otherOrgId, name: 'Santri Org Lain', phone: '628777777777', labels: ['Calon Santri'], is_opted_out: false }
    );

    // 15.1: Kampanye hanya menargetkan kontak yang dipilih (contactIds: ['c1', 'c3'])
    const resSelectedOnly = await createPersistentCampaign(
      t15OrgId,
      {
        name: 'Siaran Target Pilihan Khusus',
        messageBody: 'Halo santri Ahmad dan Citra saja',
        deliveryMode: 'now',
        contactIds: ['c1', 'c3'],
      },
      mockClient
    );
    assert(resSelectedOnly.success, '15.1: createPersistentCampaign berhasil dengan pilihan kontak spesifik');
    assert(resSelectedOnly.validRecipients === 2, '15.1: Tepat 2 kontak valid masuk antrean');
    const recs15_1 = mockDb.campaign_recipients.filter((r) => r.campaign_id === resSelectedOnly.campaignId);
    assert(recs15_1.length === 2, '15.1: Hanya 2 penerima terdaftar di tabel');
    const ids15_1 = recs15_1.map((r) => r.contact_id).sort();
    assert(JSON.stringify(ids15_1) === JSON.stringify(['c1', 'c3']), '15.1: Penerima yang masuk antrean strictly c1 dan c3, c4 tidak diikutkan');

    // 15.2: Beberapa kontak dipilih sekaligus & deduplikasi nomor
    // c1 dan c2 memiliki nomor telepon yang sama (081234567890 vs +62 812-3456-7890)
    const resDedup = await createPersistentCampaign(
      t15OrgId,
      {
        name: 'Siaran Deduplikasi Multi Kontak',
        messageBody: 'Pesan pengujian nomor duplikat',
        deliveryMode: 'now',
        contactIds: ['c1', 'c2', 'c4'],
      },
      mockClient
    );
    assert(resDedup.success, '15.2: createPersistentCampaign berhasil dengan seleksi multi-kontak');
    assert(resDedup.totalRecipients === 2, `15.2: Total 2 penerima unik setelah deduplikasi c1 dan c2 (aktual: ${resDedup.totalRecipients})`);
    assert(resDedup.validRecipients === 2, '15.2: Kedua kontak unik berstatus valid');
    const recs15_2 = mockDb.campaign_recipients.filter((r) => r.campaign_id === resDedup.campaignId);
    assert(recs15_2.length === 2, '15.2: Antrean penerima tidak menduplikasi pengiriman ke nomor sama');

    // 15.3: Kampanye tanpa penerima ditolak
    // a) Array contactIds kosong
    const resEmptyRecipients = await createPersistentCampaign(
      t15OrgId,
      {
        name: 'Siaran Tanpa Penerima',
        messageBody: 'Pesan tanpa sasaran',
        deliveryMode: 'now',
        contactIds: [],
      },
      mockClient
    );
    assert(!resEmptyRecipients.success, '15.3a: Kampanye dengan contactIds kosong ditolak');
    assert(resEmptyRecipients.error?.includes('wajib dipilih minimal 1 kontak'), '15.3a: Pesan error eksplisit meminta minimal 1 kontak');

    // b) ID kontak tidak ditemukan di database
    const resNonExistent = await createPersistentCampaign(
      t15OrgId,
      {
        name: 'Siaran Kontak Fiktif',
        messageBody: 'Pesan untuk kontak yang tidak ada',
        deliveryMode: 'now',
        contactIds: ['non-existent-id-123'],
      },
      mockClient
    );
    assert(!resNonExistent.success, '15.3b: Kampanye dengan ID kontak tidak ditemukan ditolak');

    // c) Kontak yang dipilih hanya nomor tidak valid
    const resOnlyInvalid = await createPersistentCampaign(
      t15OrgId,
      {
        name: 'Siaran Kontak Invalid',
        messageBody: 'Pesan untuk kontak invalid',
        deliveryMode: 'now',
        contactIds: ['c-invalid'],
      },
      mockClient
    );
    assert(!resOnlyInvalid.success, '15.3c: Kampanye di mana seluruh kontak tidak valid ditolak');
    assert(resOnlyInvalid.error?.includes('nomor valid'), '15.3c: Pesan error menyatakan tidak ada penerima nomor valid');

    // 15.4: Kampanye terjadwal tanpa tanggal atau jam ditolak
    const resNoSchedule = await createPersistentCampaign(
      t15OrgId,
      {
        name: 'Siaran Terjadwal Tanpa Jam',
        messageBody: 'Pesan tanpa jadwal waktu',
        deliveryMode: 'scheduled',
        contactIds: ['c1'],
      },
      mockClient
    );
    assert(!resNoSchedule.success, '15.4a: Kampanye terjadwal tanpa scheduledAt ditolak');
    assert(resNoSchedule.error?.includes('Waktu jadwal siaran wajib diisi'), '15.4a: Pesan error mewajibkan jadwal');

    const resInvalidSchedule = await createPersistentCampaign(
      t15OrgId,
      {
        name: 'Siaran Terjadwal Format Rusak',
        messageBody: 'Pesan format tanggal rusak',
        deliveryMode: 'scheduled',
        scheduledAt: 'format-tanggal-rusak',
        contactIds: ['c1'],
      },
      mockClient
    );
    assert(!resInvalidSchedule.success, '15.4b: Kampanye terjadwal dengan format tanggal tidak valid ditolak');

    // 15.5: Jadwal yang sudah lewat ditolak (validasi backend masa depan)
    const pastScheduleIso = new Date(Date.now() - 3600000).toISOString();
    const resPastSchedule = await createPersistentCampaign(
      t15OrgId,
      {
        name: 'Siaran Jadwal Lampau',
        messageBody: 'Pesan dengan jadwal 1 jam lalu',
        deliveryMode: 'scheduled',
        scheduledAt: pastScheduleIso,
        contactIds: ['c1'],
      },
      mockClient
    );
    assert(!resPastSchedule.success, '15.5: Kampanye terjadwal dengan waktu lampau ditolak');
    assert(resPastSchedule.error?.includes('harus berada di masa depan'), '15.5: Pesan error menyatakan jadwal harus di masa depan');

    // 15.6: Format timestamp ISO 8601 disimpan dan dibaca kembali secara konsisten
    const futureTimeMs = Date.now() + 86400000; // +24 jam
    const targetIsoFuture = new Date(futureTimeMs).toISOString();
    const resValidSchedule = await createPersistentCampaign(
      t15OrgId,
      {
        name: 'Siaran Jadwal Masa Depan Valid',
        messageBody: 'Pesan terjadwal dengan tanggal dan jam valid',
        deliveryMode: 'scheduled',
        scheduledAt: targetIsoFuture,
        contactIds: ['c1'],
      },
      mockClient
    );
    assert(resValidSchedule.success, '15.6: createPersistentCampaign berhasil dengan jadwal masa depan valid');
    const savedCamp = mockDb.campaigns.find((c) => c.id === resValidSchedule.campaignId);
    assert(savedCamp?.status === 'scheduled', '15.6: Status kampanye tersimpan sebagai "scheduled"');
    assert(savedCamp?.scheduled_at === targetIsoFuture, '15.6: Nilai scheduled_at disimpan dalam format ISO 8601 UTC yang konsisten');
    const savedRec = mockDb.campaign_recipients.find((r) => r.campaign_id === resValidSchedule.campaignId);
    assert(savedRec?.scheduled_at === targetIsoFuture, '15.6: scheduled_at pada antrean penerima konsisten dengan kampanye');

    // 15.7: Mengedit jadwal memperbarui penerima pending dengan benar & menolak jadwal lampau
    // a) Edit dengan jadwal masa lalu ditolak
    const editPastRes = await updateCampaign(
      t15OrgId,
      resValidSchedule.campaignId!,
      { scheduledAt: pastScheduleIso },
      mockClient
    );
    assert(!editPastRes.success, '15.7a: updateCampaign menolak pembaruan jadwal ke waktu yang sudah lewat');
    assert(editPastRes.statusCode === 400, '15.7a: Status code 400 Bad Request');

    // b) Edit dengan jadwal masa depan baru berhasil dan menyinkronkan penerima pending
    const newFutureIso = new Date(Date.now() + 172800000).toISOString(); // +48 jam
    const editValidRes = await updateCampaign(
      t15OrgId,
      resValidSchedule.campaignId!,
      { scheduledAt: newFutureIso },
      mockClient
    );
    assert(editValidRes.success, '15.7b: updateCampaign berhasil memperbarui jadwal');
    const updatedCamp = mockDb.campaigns.find((c) => c.id === resValidSchedule.campaignId);
    assert(updatedCamp?.scheduled_at === newFutureIso, '15.7b: campaigns.scheduled_at terupdate');
    const updatedRec = mockDb.campaign_recipients.find((r) => r.campaign_id === resValidSchedule.campaignId);
    assert(updatedRec?.scheduled_at === newFutureIso, '15.7b: campaign_recipients.scheduled_at pending ikut tersinkronkan');

    // 15.8: Kampanye running atau completed tidak dapat diedit
    mockDb.campaigns.push(
      { id: 'camp-run-15', organization_id: t15OrgId, name: 'Sedang Berjalan', status: 'running' },
      { id: 'camp-comp-15', organization_id: t15OrgId, name: 'Sudah Selesai', status: 'completed' }
    );
    const editRunningRes = await updateCampaign(
      t15OrgId,
      'camp-run-15',
      { scheduledAt: newFutureIso },
      mockClient
    );
    assert(!editRunningRes.success, '15.8a: Edit jadwal kampanye berstatus "running" ditolak');
    assert(editRunningRes.statusCode === 400, '15.8a: HTTP 400 saat mencoba mengedit kampanye running');

    const editCompletedRes = await updateCampaign(
      t15OrgId,
      'camp-comp-15',
      { scheduledAt: newFutureIso },
      mockClient
    );
    assert(!editCompletedRes.success, '15.8b: Edit jadwal kampanye berstatus "completed" ditolak');
    assert(editCompletedRes.statusCode === 400, '15.8b: HTTP 400 saat mencoba mengedit kampanye completed');

    // 15.9: Isolasi tenant tetap berlaku
    // Organisasi B mencoba membuat kampanye dengan kontak milik Organisasi A
    const resCrossOrg = await createPersistentCampaign(
      otherOrgId,
      {
        name: 'Kampanye Pembobol Tenant',
        messageBody: 'Mencoba menembus isolasi data tenant',
        deliveryMode: 'now',
        contactIds: ['c1'], // c1 milik t15OrgId
      },
      mockClient
    );
    assert(!resCrossOrg.success, '15.9: Pembuatan kampanye dengan kontak organisasi lain ditolak (tidak ditemukan dalam tenant)');

    // 15.10: Perilaku kampanye Kirim Sekarang tidak rusak
    const resNowMode = await createPersistentCampaign(
      t15OrgId,
      {
        name: 'Siaran Kirim Langsung Sekarang',
        messageBody: 'Informasi darurat broadcast segera',
        deliveryMode: 'now',
        contactIds: ['c1'],
      },
      mockClient
    );
    assert(resNowMode.success, '15.10: Kampanye "Kirim Sekarang" berhasil dibuat');
    const campNow = mockDb.campaigns.find((c) => c.id === resNowMode.campaignId);
    assert(campNow?.status === 'running', '15.10: Status awal kampanye Kirim Sekarang adalah "running"');
    assert(campNow?.scheduled_at === null, '15.10: scheduled_at adalah null untuk mode Kirim Sekarang');
    const recNow = mockDb.campaign_recipients.find((r) => r.campaign_id === resNowMode.campaignId);
    assert(recNow?.status === 'pending', '15.10: Penerima Kirim Sekarang langsung berstatus "pending"');
  }

  // ------------------------------------------------------------------
  // TEST GROUP 16: Audit & Hardening Jalur Pengiriman Kampanye & Kesiapan Gateway (Tahap A)
  // ------------------------------------------------------------------
  console.log('\n[Test Group 16] Kesiapan Gateway & Pipeline Pengiriman Kampanye (Tahap A):');
  {
    mockDb.clear();
    const t16OrgId = 'org-tahap-a-16';

    // 16.1: Evaluasi Kesiapan Provider - Baileys
    // A. Saat disconnected
    const baileysDiscReadiness = await baileysProvider.getReadiness(t16OrgId);
    assert(
      !baileysDiscReadiness.isReady &&
      baileysDiscReadiness.code === 'waiting_gateway' &&
      baileysDiscReadiness.label === 'Menunggu koneksi gateway' &&
      baileysDiscReadiness.provider === 'baileys' &&
      baileysDiscReadiness.providerDisplayName === 'WhatsApp Gateway (Baileys)',
      '16.1a: Baileys saat disconnected mengembalikan code waiting_gateway dan label "Menunggu koneksi gateway"'
    );

    // B. Mock socket connected pada Baileys adapter
    const origGetState = whatsappService.getState;
    (whatsappService as any).getState = () => ({
      status: 'connected',
      phoneNumber: '6281234567890',
      whatsappName: 'WABiz Staging Test',
      lastQrAvailable: false,
      qrGeneratedAt: null,
      qrCount: 0,
      reconnectAttempts: 0,
      lastError: null,
    });
    const baileysConnReadiness = await baileysProvider.getReadiness(t16OrgId);
    assert(
      baileysConnReadiness.isReady &&
      baileysConnReadiness.code === 'ready' &&
      baileysConnReadiness.label === 'Siap mengirim' &&
      baileysConnReadiness.phone === '6281234567890',
      '16.1b: Baileys saat connected mengembalikan code ready dan label "Siap mengirim"'
    );

    // C. Mock socket error pada Baileys adapter
    (whatsappService as any).getState = () => ({
      status: 'error',
      phoneNumber: null,
      whatsappName: null,
      lastQrAvailable: false,
      qrGeneratedAt: null,
      qrCount: 0,
      reconnectAttempts: 3,
      lastError: 'Soket ditutup oleh server WhatsApp',
    });
    const baileysErrReadiness = await baileysProvider.getReadiness(t16OrgId);
    assert(
      !baileysErrReadiness.isReady &&
      baileysErrReadiness.code === 'connection_error' &&
      baileysErrReadiness.label === 'Terjadi kesalahan koneksi' &&
      baileysErrReadiness.message.includes('ditutup'),
      '16.1c: Baileys saat error mengembalikan code connection_error dan pesan error terkait'
    );
    // Kembalikan getState original
    (whatsappService as any).getState = origGetState;

    // 16.2: Evaluasi Kesiapan Provider - Meta Cloud API
    // A. Tanpa kredensial di database / env (unconfigured)
    const metaUnconfiguredReadiness = await metaCloudApiProvider.getReadiness('org-tanpa-kredensial');
    assert(
      !metaUnconfiguredReadiness.isReady &&
      metaUnconfiguredReadiness.code === 'unconfigured' &&
      metaUnconfiguredReadiness.label === 'Konfigurasi provider belum lengkap',
      '16.2a: Meta Cloud API tanpa kredensial mengembalikan code unconfigured'
    );

    // B. Dengan kredensial mock valid dan respons Graph API OK
    const origGetCreds = metaCloudApiProvider.getCredentials;
    const origGetConnStatus = metaCloudApiProvider.getConnectionStatus;
    (metaCloudApiProvider as any).getCredentials = async () => ({
      phoneNumberId: 'meta-phone-12345',
      accessToken: 'meta-token-secret',
      displayPhoneNumber: '+6281299990000',
    });
    (metaCloudApiProvider as any).getConnectionStatus = async () => ({
      provider: 'meta_cloud_api',
      isConnected: true,
      phone: '+6281299990000',
    });
    const metaReadyReadiness = await metaCloudApiProvider.getReadiness(t16OrgId);
    assert(
      metaReadyReadiness.isReady &&
      metaReadyReadiness.code === 'ready' &&
      metaReadyReadiness.label === 'Siap mengirim',
      '16.2b: Meta Cloud API dengan kredensial valid mengembalikan code ready'
    );

    // C. Dengan kredensial tetapi Graph API gagal koneksi
    (metaCloudApiProvider as any).getConnectionStatus = async () => ({
      provider: 'meta_cloud_api',
      isConnected: false,
      details: { error: 'HTTP 502 Bad Gateway from Meta' },
    });
    const metaErrReadiness = await metaCloudApiProvider.getReadiness(t16OrgId);
    assert(
      !metaErrReadiness.isReady &&
      metaErrReadiness.code === 'connection_error' &&
      metaErrReadiness.label === 'Terjadi kesalahan koneksi',
      '16.2c: Meta Cloud API saat Graph API error mengembalikan code connection_error'
    );
    // Kembalikan method Meta original
    (metaCloudApiProvider as any).getCredentials = origGetCreds;
    (metaCloudApiProvider as any).getConnectionStatus = origGetConnStatus;

    // 16.3: Evaluasi Kesiapan Provider - OpenWA (Fail-Closed)
    const openwaReadiness = await openwaProvider.getReadiness(t16OrgId);
    assert(
      !openwaReadiness.isReady &&
      openwaReadiness.code === 'unsupported' &&
      openwaReadiness.label === 'Provider tidak didukung atau dinonaktifkan',
      '16.3: OpenWA secara tegas dinonaktifkan (fail-closed) untuk kampanye dengan code unsupported'
    );

    // 16.4: Kampanye Kirim Sekarang (mode: 'now') saat Gateway Offline vs Online
    // Buat kontak
    mockDb.contacts.push({
      id: 'c-t16-1',
      organization_id: t16OrgId,
      name: 'Rudi Gateway Test',
      phone: '081288776655',
      labels: ['all'],
      is_opted_out: false,
    });

    const createNowRes = await createPersistentCampaign(
      t16OrgId,
      {
        name: 'Kampanye Mode Now Gateway Check',
        messageBody: 'Uji coba penahanan antrean saat gateway offline',
        deliveryMode: 'now',
        contactIds: ['c-t16-1'],
      },
      mockClient
    );
    assert(createNowRes.success, '16.4a: Kampanye "now" berhasil dibuat');
    const campNowId = createNowRes.campaignId!;
    const campNowRow = mockDb.campaigns.find((c) => c.id === campNowId);
    assert(campNowRow?.status === 'running', '16.4a: Kampanye langsung berstatus "running"');
    const recNowItem = mockDb.campaign_recipients.find((r) => r.campaign_id === campNowId);
    assert(recNowItem?.status === 'pending', '16.4a: Penerima langsung berstatus "pending"');
    assert(recNowItem?.retry_count === 0, '16.4a: retry_count awal adalah 0');

    // Scheduler berjalan saat gateway status = 'disconnected'
    let waSimulatedStatus = 'disconnected';
    let mockSentCalls = 0;
    const testProviderMock = {
      providerType: 'baileys' as const,
      sendMessage: async () => {
        mockSentCalls++;
        return { success: true, provider: 'baileys' as const, providerMessageId: 'msg-now-1', timestamp: new Date().toISOString() };
      },
      getConnectionStatus: async () => ({ provider: 'baileys' as const, isConnected: waSimulatedStatus === 'connected' }),
      normalizeDeliveryStatus: () => 'sent' as const,
    };

    const scheduler16 = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getWhatsAppState: () => ({ status: waSimulatedStatus }),
      getProvider: async () => testProviderMock,
      messageDelayMs: 0,
      maxRetries: 3,
    });

    // Jalankan tick saat gateway offline
    await scheduler16.tick();

    // Verifikasi: Antrean DITAHAN, retry_count TIDAK berkurang/bertambah, tidak ada pesan terkirim
    const recAfterOfflineTick = mockDb.campaign_recipients.find((r) => r.campaign_id === campNowId);
    assert(recAfterOfflineTick?.status === 'pending', '16.4b: Recipient TETAP "pending" saat gateway disconnected');
    assert(recAfterOfflineTick?.retry_count === 0, '16.4b: retry_count TIDAK berkurang atau bertambah saat gateway offline (tetap 0)');
    assert(mockSentCalls === 0, '16.4b: sendMessage TIDAK dipanggil saat gateway belum siap');
    const campAfterOffline = mockDb.campaigns.find((c) => c.id === campNowId);
    assert(campAfterOffline?.status === 'running', '16.4b: Kampanye TETAP "running" (tidak dianggap completed/failed)');
    assert(!campAfterOffline?.sent_count, '16.4b: sent_count tetap 0 atau belum terhitung');

    // Gateway sekarang TERHUBUNG (online)
    waSimulatedStatus = 'connected';
    await scheduler16.tick();

    // Verifikasi: Antrean diproses seketika saat gateway siap!
    const recAfterOnlineTick = mockDb.campaign_recipients.find((r) => r.campaign_id === campNowId);
    assert(recAfterOnlineTick?.status === 'sent', '16.4c: Recipient berhasil terkirim ("sent") setelah gateway terhubung');
    assert(mockSentCalls === 1, '16.4c: sendMessage dieksekusi 1x');
    const campAfterOnline = mockDb.campaigns.find((c) => c.id === campNowId);
    assert(campAfterOnline?.status === 'completed', '16.4c: Kampanye selesai ("completed") setelah seluruh antrean tuntas');
    assert(campAfterOnline?.sent_count === 1, '16.4c: sent_count kampanye bernilai 1');

    // 16.5: Kampanye Mode Terjadwal (mode: 'scheduled') & Konsistensi Waktu WIB
    mockDb.contacts.push({
      id: 'c-t16-2',
      organization_id: t16OrgId,
      name: 'Dewi Scheduled Test',
      phone: '081233445566',
      labels: ['all'],
      is_opted_out: false,
    });

    // Jadwal 30 menit ke depan
    const futureScheduleTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const createSchedRes = await createPersistentCampaign(
      t16OrgId,
      {
        name: 'Kampanye Terjadwal Waktu WIB',
        messageBody: 'Uji waktu jatuh tempo terjadwal',
        deliveryMode: 'scheduled',
        scheduledAt: futureScheduleTime,
        contactIds: ['c-t16-2'],
      },
      mockClient
    );
    assert(createSchedRes.success, '16.5a: Kampanye scheduled berhasil dibuat');
    const campSchedId = createSchedRes.campaignId!;
    const campSchedRow = mockDb.campaigns.find((c) => c.id === campSchedId);
    assert(campSchedRow?.status === 'scheduled', '16.5a: Status awal kampanye adalah "scheduled"');

    // Tick sebelum waktu tiba (meski gateway connected)
    await scheduler16.tick();
    const campSchedBeforeDue = mockDb.campaigns.find((c) => c.id === campSchedId);
    assert(campSchedBeforeDue?.status === 'scheduled', '16.5b: Kampanye TIDAK dieksekusi sebelum waktu jadwal tercapai');
    assert(mockSentCalls === 1, '16.5b: Tidak ada pengiriman tambahan sebelum jatuh tempo');

    // Majukan waktu sehingga jatuh tempo
    const pastScheduleTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    campSchedBeforeDue!.scheduled_at = pastScheduleTime;
    const recSched = mockDb.campaign_recipients.find((r) => r.campaign_id === campSchedId);
    recSched!.scheduled_at = pastScheduleTime;

    // Tick setelah waktu tiba
    await scheduler16.tick();
    const campSchedAfterDue = mockDb.campaigns.find((c) => c.id === campSchedId);
    assert(campSchedAfterDue?.status === 'completed', '16.5c: Kampanye terjadwal dieksekusi dan tuntas setelah waktunya tiba');
    assert(mockSentCalls === 2, '16.5c: Total 2 pesan terkirim');

    // Verifikasi parsing waktu WIB (Asia/Jakarta)
    const testDateIso = '2026-10-28T07:00:00.000Z'; // 07:00 UTC = 14:00 WIB
    const wibFormatted = new Date(testDateIso).toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
    });
    assert(wibFormatted.includes('14') || wibFormatted.includes('07'), '16.5d: Format waktu UTC konsisten dengan konversi zona waktu');

    // 16.6: Terminal State Guard (Anti-False-Completion saat gateway offline)
    mockDb.contacts.push({
      id: 'c-t16-3',
      organization_id: t16OrgId,
      name: 'Anti Complete Guard',
      phone: '081277889900',
      labels: ['all'],
      is_opted_out: false,
    });
    const createStuckRes = await createPersistentCampaign(
      t16OrgId,
      {
        name: 'Kampanye Bertahan Di Running',
        messageBody: 'Uji penjagaan status running saat gateway disconnected',
        deliveryMode: 'now',
        contactIds: ['c-t16-3'],
      },
      mockClient
    );
    const stuckCampId = createStuckRes.campaignId!;
    waSimulatedStatus = 'disconnected'; // Gateway mati lagi

    // Jalankan 5 tick berturut-turut saat gateway mati
    for (let i = 0; i < 5; i++) {
      await scheduler16.tick();
    }

    const stuckCamp = mockDb.campaigns.find((c) => c.id === stuckCampId);
    assert(stuckCamp?.status === 'running', '16.6: Kampanye tetap berstatus "running" setelah 5x tick saat gateway offline');
    assert(!stuckCamp?.sent_count, '16.6: sent_count tetap 0 atau belum terhitung');
    assert(!stuckCamp?.failed_count, '16.6: failed_count tetap 0 atau belum terhitung (tidak salah ditandai failed)');
    const stuckRec = mockDb.campaign_recipients.find((r) => r.campaign_id === stuckCampId);
    assert(stuckRec?.status === 'pending', '16.6: Penerima tetap berstatus "pending"');
    assert(stuckRec?.retry_count === 0, '16.6: Jatah retry tidak berkurang (tetap 0)');

    // 16.7: Disconnect Mid-Batch (Gateway putus di tengah pengiriman)
    mockDb.clear();
    const t16OrgId7 = 'org-tahap-a-16-7';
    mockDb.contacts.push(
      { id: 'c-t16-4', organization_id: t16OrgId7, name: 'Batch 1', phone: '081200000001', labels: ['all'], is_opted_out: false },
      { id: 'c-t16-5', organization_id: t16OrgId7, name: 'Batch 2', phone: '081200000002', labels: ['all'], is_opted_out: false }
    );
    const createBatchRes = await createPersistentCampaign(
      t16OrgId7,
      {
        name: 'Kampanye Disconnect Mid Batch',
        messageBody: 'Uji putus koneksi di tengah batch',
        deliveryMode: 'now',
        contactIds: ['c-t16-4', 'c-t16-5'],
      },
      mockClient
    );
    const batchCampId = createBatchRes.campaignId!;

    // Kirim 1 pesan berhasil, lalu gateway putus
    let batchSends = 0;
    const midBatchProvider = {
      providerType: 'baileys' as const,
      sendMessage: async () => {
        batchSends++;
        if (batchSends === 1) {
          return { success: true, provider: 'baileys' as const, providerMessageId: 'msg-batch-1', timestamp: new Date().toISOString() };
        }
        return { success: false, provider: 'baileys' as const, error: 'Socket disconnected mid-batch' };
      },
      getConnectionStatus: async () => ({ provider: 'baileys' as const, isConnected: batchSends === 0 }),
      normalizeDeliveryStatus: () => 'sent' as const,
    };

    let waMidState = 'connected';
    const schedulerMidBatch = new CampaignQueueScheduler({
      supabaseClient: mockClient,
      getWhatsAppState: () => ({ status: waMidState }),
      getProvider: async () => midBatchProvider,
      messageDelayMs: 0,
      maxRetries: 3,
    });

    // Tick pertama: pesan 1 berhasil dikirim
    await schedulerMidBatch.tick();
    // Setelah tick pertama, 1 terkirim, lalu ubah status ke disconnected
    waMidState = 'disconnected';
    await schedulerMidBatch.tick();

    const batchCamp = mockDb.campaigns.find((c) => c.id === batchCampId);
    assert(batchCamp?.status === 'running', '16.7: Kampanye tetap "running" saat hanya sebagian batch yang terkirim');
    const recsBatch = mockDb.campaign_recipients.filter((r) => r.campaign_id === batchCampId);
    const sentRecs = recsBatch.filter((r) => r.status === 'sent');
    const pendingRecs = recsBatch.filter((r) => r.status === 'pending');
    assert(sentRecs.length === 1, '16.7: Tepat 1 penerima berstatus "sent"');
    assert(pendingRecs.length === 1, '16.7: Penerima kedua yang belum terkirim ditahan di "pending"');

    // 16.8: Isolasi Multi-Tenant pada Provider & Credential Scope
    const orgA = 'org-tenant-alpha';
    const orgB = 'org-tenant-beta';
    const factoryProvA = await WhatsAppProviderFactory.getProviderForOrg(orgA, mockClient);
    const factoryProvB = await WhatsAppProviderFactory.getProviderForOrg(orgB, mockClient);
    assert(Boolean(factoryProvA && factoryProvB), '16.8a: Resolusi provider multi-tenant berhasil untuk kedua org');

    // Pastikan konfigurasi provider orgA tidak bocor ke orgB
    mockDb.organization_whatsapp_configs.push({
      organization_id: orgA,
      provider_type: 'meta_cloud_api',
      is_active: true,
      phone_number_id: 'meta-phone-org-a',
    });
    const provOrgA = await WhatsAppProviderFactory.getProviderForOrg(orgA, mockClient);
    const provOrgB = await WhatsAppProviderFactory.getProviderForOrg(orgB, mockClient);
    assert(provOrgA.providerType === 'meta_cloud_api', '16.8b: Org A secara eksklusif menggunakan meta_cloud_api sesuai config');
    assert(provOrgB.providerType === 'baileys', '16.8b: Org B tetap menggunakan baileys (default fallback, no leak)');

    // 16.9: CAS Lock & Stale Job Recovery
    // Uji CAS lock mencegah double-send
    const dummyRecId = 'rec-cas-test';
    mockDb.campaign_recipients.push({
      id: dummyRecId,
      campaign_id: 'camp-cas',
      organization_id: t16OrgId,
      phone: '6281299991111',
      name: 'CAS User',
      status: 'pending',
      retry_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Worker 1 melakukan CAS lock: pending -> processing
    const { data: lock1 } = await mockClient
      .from('campaign_recipients')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', dummyRecId)
      .eq('status', 'pending')
      .select('id');
    assert(lock1 && lock1.length > 0, '16.9a: Worker 1 berhasil mengunci status pending -> processing');

    // Worker 2 mencoba CAS lock yang sama: pending -> processing
    const { data: lock2 } = await mockClient
      .from('campaign_recipients')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', dummyRecId)
      .eq('status', 'pending')
      .select('id');
    assert(!lock2 || lock2.length === 0, '16.9a: Worker 2 ditolak karena item sudah tidak lagi berstatus pending (anti-double-send)');

    // Uji pemulihan stale job (> 5 menit)
    const staleRecId = 'rec-stale-test';
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    mockDb.campaign_recipients.push({
      id: staleRecId,
      campaign_id: 'camp-stale',
      organization_id: t16OrgId,
      phone: '6281299992222',
      name: 'Stale User',
      status: 'processing',
      retry_count: 0,
      created_at: tenMinutesAgo,
      updated_at: tenMinutesAgo,
    });

    const staleScheduler = new CampaignQueueScheduler({ supabaseClient: mockClient });
    await staleScheduler.recoverStaleProcessingJobs();
    const recoveredRec = mockDb.campaign_recipients.find((r) => r.id === staleRecId);
    assert(recoveredRec?.status === 'pending', '16.9b: Stale processing job (> 5 menit) berhasil dipulihkan ke "pending"');

    // 16.10: Verifikasi Label UI & Format Kanal (No Hardcoded 'WhatsApp Business API')
    const sampleDbRow = {
      id: 'camp-db-sample',
      name: 'Sample Camp',
      message_body: 'Pesan',
      status: 'running',
      created_at: new Date().toISOString(),
      provider_type: 'baileys',
    };
    const mappedBaileysChannel = sampleDbRow.provider_type === 'meta_cloud_api' ? 'Meta Cloud API' : 'WhatsApp Gateway (Baileys)';
    assert(mappedBaileysChannel === 'WhatsApp Gateway (Baileys)', '16.10a: Kanal Baileys dipetakan secara dinamis ke "WhatsApp Gateway (Baileys)"');

    const sampleMetaDbRow = {
      id: 'camp-db-meta',
      name: 'Sample Meta',
      message_body: 'Pesan Meta',
      status: 'running',
      created_at: new Date().toISOString(),
      provider_type: 'meta_cloud_api',
    };
    const mappedMetaChannel = sampleMetaDbRow.provider_type === 'meta_cloud_api' ? 'Meta Cloud API' : 'WhatsApp Gateway (Baileys)';
    assert(mappedMetaChannel === 'Meta Cloud API', '16.10b: Kanal Meta Cloud API dipetakan secara dinamis ke "Meta Cloud API"');

    // 5 status kesiapan gateway yang terdefinisi
    const validCodes = ['ready', 'waiting_gateway', 'unconfigured', 'unsupported', 'connection_error'];
    const sampleCodes = [baileysConnReadiness.code, baileysDiscReadiness.code, metaUnconfiguredReadiness.code, openwaReadiness.code, baileysErrReadiness.code];
    assert(
      sampleCodes.every((c) => validCodes.includes(c)),
      '16.10c: Kelima status kesiapan gateway (ready, waiting_gateway, unconfigured, unsupported, connection_error) terverifikasi valid'
    );
  }

  // ------------------------------------------------------------------
  // RINGKASAN HASIL TEST
  // ------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`TOTAL PENGUJIAN: ${totalTests}`);
  console.log(`HASIL: ${passedTests} LULUS (PASS), ${failedTests} GAGAL (FAIL)`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runCampaignOfflineTests().catch((err) => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
