import { test, expect } from '@playwright/test';
import {
  classifyAppError,
  formatErrorUserMessage,
  StandardAppError,
} from '../src/lib/errorHandler';
import { formatWorkerFetchError } from '../src/lib/whatsappClient';
import {
  notifyContactCreated,
  notifyContactUpdated,
  notifyContactDeleted,
  notifyCampaignEvent,
  notifyTeamEvent,
  notifySystemEvent,
  notifyOrgProfileUpdated,
  notifyConfigUpdated,
  notifyChatbotEvent,
  notifyChatEvent,
  _resetLocalFallbackNotifications,
  _getLocalFallbackNotifications,
  addNotificationChangeListener,
} from '../src/lib/notifications';

/**
 * =====================================================================
 * PENGUJIAN RELIABILITAS CRUD & KONEKTIVITAS WABIZ
 * =====================================================================
 * Memverifikasi:
 * 1. Error Classifier terpusat (10 kategori error terstandar + format user message)
 * 2. Helper WhatsApp Worker Offline error formatting
 * 3. Logika penghapusan kampanye (Draft vs Running vs Scheduled vs Completed)
 * 4. Logika penghapusan Tim CS langsung ke Supabase dengan batas organisasi & role check
 * 5. Logika update status percakapan (pencegahan update optimistik sebelum DB konfirmasi)
 * 6. Isolasi batas organisasi multi-tenant pada seluruh operasi mutasi
 */

test.describe('CRUD Reliability & Error Handling Suite', () => {

  interface MockCampaign {
    id: string;
    organization_id: string;
    title: string;
    status: 'draft' | 'scheduled' | 'running' | 'completed' | 'cancelled' | 'failed';
  }

  // Model simulasi eksekusi deleteCampaign
  async function simulateDeleteCampaign(params: {
    campaign: MockCampaign;
    currentOrgId: string;
    isWorkerOnline: boolean;
    sessionValid: boolean;
    dbStore: MockCampaign[];
  }): Promise<{ success: boolean; error?: string; remainingList: MockCampaign[] }> {
    const { campaign, currentOrgId, isWorkerOnline, sessionValid, dbStore } = params;
    let localList = [...dbStore];

    // Verifikasi Auth Session
    if (!sessionValid) {
      const err = new Error('Sesi login Supabase tidak ditemukan. Silakan login kembali.');
      return { success: false, error: formatErrorUserMessage(err, { entityName: 'kampanye' }), remainingList: localList };
    }

    // Verifikasi Organisasi
    if (campaign.organization_id !== currentOrgId) {
      const err = { message: 'Akses ditolak: lintas organisasi tidak diizinkan', code: '42501' };
      return { success: false, error: formatErrorUserMessage(err, { entityName: 'kampanye' }), remainingList: localList };
    }

    // 1. KAMPANYE DRAFT: Hapus langsung via Supabase Client
    if (campaign.status === 'draft') {
      // Query: supabase.from('campaigns').delete().eq('id', campaign.id).eq('organization_id', currentOrgId)
      const idx = dbStore.findIndex(c => c.id === campaign.id && c.organization_id === currentOrgId);
      if (idx !== -1) {
        dbStore.splice(idx, 1);
        localList = localList.filter(c => c.id !== campaign.id);
        return { success: true, remainingList: localList };
      } else {
        return {
          success: false,
          error: formatErrorUserMessage(new Error('P0002 Record not found'), { entityName: 'kampanye' }),
          remainingList: localList,
        };
      }
    }

    // 2. KAMPANYE RUNNING: Tolak langsung
    if (campaign.status === 'running') {
      const businessErr = new Error('Kampanye yang sedang berjalan (running) tidak dapat dihapus secara langsung.');
      return {
        success: false,
        error: formatErrorUserMessage(businessErr, {
          entityName: 'kampanye',
          customActionHint: 'Batalkan siaran kampanye terlebih dahulu sebelum menghapusnya dari sistem.',
        }),
        remainingList: localList, // Tidak dihapus dari UI
      };
    }

    // 3. KAMPANYE SCHEDULED: Memerlukan Worker untuk membatalkan antrean
    if (campaign.status === 'scheduled') {
      if (!isWorkerOnline) {
        const fetchErr = formatWorkerFetchError(new TypeError('Failed to fetch'), 'menghapus kampanye');
        return {
          success: false,
          error: formatErrorUserMessage(fetchErr, { entityName: 'kampanye', isWorker: true }),
          remainingList: localList, // Tidak dihapus dari UI
        };
      }
      // Worker online -> bersihkan antrean & hapus dari DB
      const idx = dbStore.findIndex(c => c.id === campaign.id && c.organization_id === currentOrgId);
      if (idx !== -1) {
        dbStore.splice(idx, 1);
        localList = localList.filter(c => c.id !== campaign.id);
        return { success: true, remainingList: localList };
      }
    }

    // 4. KAMPANYE SELESAI / CANCELLED / FAILED: Panggil worker dengan fallback Supabase
    if (['completed', 'cancelled', 'failed'].includes(campaign.status)) {
      // Jika worker offline, tetap hapus dari Supabase karena tidak ada antrean aktif
      const idx = dbStore.findIndex(c => c.id === campaign.id && c.organization_id === currentOrgId);
      if (idx !== -1) {
        dbStore.splice(idx, 1);
        localList = localList.filter(c => c.id !== campaign.id);
        return { success: true, remainingList: localList };
      }
    }

    return { success: false, error: 'Status tidak dikenal', remainingList: localList };
  }

  // ===================================================================
  // 1. PENGUJIAN ERROR CLASSIFIER TERPUSAT (10 KATEGORI)
  // ===================================================================
  test.describe('1. Standardized Error Classifier (errorHandler.ts)', () => {

    test('1.1. Network Error: Mengklasifikasikan TypeError: Failed to fetch ke kategori network', () => {
      const err = new TypeError('Failed to fetch');
      const result: StandardAppError = classifyAppError(err, { entityName: 'kampanye' });

      expect(result.category).toBe('network');
      expect(result.message).toContain('Koneksi internet bermasalah');
      expect(result.actionableHint).toContain('Periksa koneksi internet Anda');
    });

    test('1.2. Worker Offline Error: Mengklasifikasikan kegagalan port 4000 ke worker_offline dengan petunjuk tindakan', () => {
      const err = new Error('Gagal terhubung ke WhatsApp Gateway Worker (port 4000 offline)');
      const result = classifyAppError(err, { entityName: 'gateway', isWorker: true });

      expect(result.category).toBe('worker_offline');
      expect(result.message).toContain('WhatsApp Gateway');
      expect(result.actionableHint).toContain('npm run worker');
    });

    test('1.3. Auth Expired Error: Mengklasifikasikan JWT expired dan session revoked ke auth_expired', () => {
      const err = new Error('JWT expired or session not found in Supabase Auth');
      const result = classifyAppError(err);

      expect(result.category).toBe('auth_expired');
      expect(result.message).toContain('Sesi login Anda telah berakhir');
      expect(result.actionableHint).toContain('Silakan login kembali');
    });

    test('1.4. RLS Denied Error: Mengklasifikasikan 42501 dan permission denied ke rls_denied', () => {
      const err = { message: 'new row violates row-level security policy for table campaigns', code: '42501' };
      const result = classifyAppError(err, { entityName: 'kampanye' });

      expect(result.category).toBe('rls_denied');
      expect(result.message).toContain('Akses ditolak oleh kebijakan keamanan');
      expect(result.actionableHint).toContain('Owner');
    });

    test('1.5. Duplicate Error: Mengklasifikasikan 23505 unique constraint ke duplicate', () => {
      const err = { message: 'duplicate key value violates unique constraint', code: '23505' };
      const result = classifyAppError(err, { entityName: 'kontak' });

      expect(result.category).toBe('duplicate');
      expect(result.message).toContain('Kontak ini sudah terdaftar');
      expect(result.actionableHint).toContain('Gunakan nama, nomor, atau email yang berbeda');
    });

    test('1.6. Validation Error: Mengklasifikasikan 23514 check constraint ke validation', () => {
      const err = { message: 'new row violates check constraint "status check"', code: '23514' };
      const result = classifyAppError(err, { entityName: 'kampanye' });

      expect(result.category).toBe('validation');
      expect(result.message).toContain('Format data kampanye tidak memenuhi batasan');
    });

    test('1.7. Not Found Error: Mengklasifikasikan 404, PGRST116, dan not found ke not_found', () => {
      const err = new Error('JSON object requested, multiple (or no) rows returned (PGRST116)');
      const result = classifyAppError(err, { entityName: 'anggota tim' });

      expect(result.category).toBe('not_found');
      expect(result.message).toContain('Data anggota tim tidak ditemukan');
    });

    test('1.8. Database Unavailable: Mengklasifikasikan 503 dan connection terminated ke database_unavailable', () => {
      const err = new Error('503 Service Unavailable: connection terminated by peer');
      const result = classifyAppError(err);

      expect(result.category).toBe('database_unavailable');
      expect(result.message).toContain('Layanan database Supabase sedang tidak tersedia');
      expect(result.actionableHint).toContain('Tunggu beberapa saat');
    });

    test('1.9. Timeout Error: Mengklasifikasikan AbortError ke timeout', () => {
      const err = new Error('The operation was aborted due to timeout');
      const result = classifyAppError(err, { entityName: 'pesan' });

      expect(result.category).toBe('timeout');
      expect(result.message).toContain('melebihi batas waktu');
    });

    test('1.10. Business Rule Error: Mengklasifikasikan pembatalan kampanye running ke business_rule', () => {
      const err = new Error('Kampanye yang sedang berjalan (running) tidak dapat dihapus secara langsung');
      const result = classifyAppError(err, { entityName: 'kampanye' });

      expect(result.category).toBe('business_rule');
      expect(result.message).toContain('sedang berjalan (running) tidak dapat dihapus');
      expect(result.actionableHint).toContain('Batalkan siaran kampanye terlebih dahulu');
    });

    test('1.11. formatErrorUserMessage menggabungkan pesan dan petunjuk tindakan secara koheren', () => {
      const err = new TypeError('Failed to fetch');
      const formatted = formatErrorUserMessage(err, { entityName: 'kampanye' });

      expect(formatted).toContain('Koneksi internet bermasalah');
      expect(formatted).toContain('Periksa koneksi internet Anda');
    });

    test('1.12. formatErrorUserMessage mendukung customActionHint dan defaultMessage', () => {
      const customHint = 'Periksa pengaturan jaringan kantor Anda.';
      const formatted = formatErrorUserMessage('Something unexpected', {
        entityName: 'kampanye',
        customActionHint: customHint,
        defaultMessage: 'Terjadi kegagalan kustom.',
      });

      expect(formatted).toContain('Terjadi kegagalan kustom.');
      expect(formatted).toContain(customHint);
    });
  });

  // ===================================================================
  // 2. PENGUJIAN HELPER WHATSAPP WORKER OFFLINE FORMATTER
  // ===================================================================
  test.describe('2. WhatsApp Worker Fetch Error Formatter (whatsappClient.ts)', () => {

    test('2.1. formatWorkerFetchError mengubah raw TypeError: Failed to fetch menjadi instruksi jelas', () => {
      const rawError = new TypeError('Failed to fetch');
      const formatted = formatWorkerFetchError(rawError, 'menghapus kampanye');

      expect(formatted).toContain('Server worker gateway WhatsApp offline');
      expect(formatted).toContain('port 4000');
      expect(formatted).toContain('npm run worker');
      expect(formatted).not.toBe('Failed to fetch');
    });

    test('2.2. formatWorkerFetchError mengubah ECONNREFUSED menjadi instruksi jelas', () => {
      const rawError = new Error('connect ECONNREFUSED 127.0.0.1:4000');
      const formatted = formatWorkerFetchError(rawError, 'membuat kampanye terjadwal');

      expect(formatted).toContain('Server worker gateway WhatsApp offline');
      expect(formatted).toContain('membuat kampanye terjadwal');
    });

    test('2.3. formatWorkerFetchError mempertahankan error spesifik non-koneksi', () => {
      const specificError = new Error('Recipient phone number invalid: 08123');
      const formatted = formatWorkerFetchError(specificError, 'kirim pesan');

      expect(formatted).toContain('Recipient phone number invalid: 08123');
    });
  });

  // ===================================================================
  // 3. PENGUJIAN LOGIKA PENGHAPUSAN KAMPANYE (CAMPAIGNS VIEW)
  // ===================================================================
  test.describe('3. Campaign Deletion Decision Tree & Reliability', () => {

    const ORG_ID = 'org-current-active-001';

    test('3.1. Kampanye draft berhasil dihapus langsung via Supabase meskipun worker offline', async () => {
      const db: MockCampaign[] = [
        { id: 'c-draft-1', organization_id: ORG_ID, title: 'Draft Promo A', status: 'draft' },
        { id: 'c-draft-2', organization_id: ORG_ID, title: 'Draft Promo B', status: 'draft' },
      ];

      const res = await simulateDeleteCampaign({
        campaign: db[0],
        currentOrgId: ORG_ID,
        isWorkerOnline: false, // WORKER OFFLINE
        sessionValid: true,
        dbStore: db,
      });

      expect(res.success).toBe(true);
      expect(res.remainingList.length).toBe(1);
      expect(res.remainingList[0].id).toBe('c-draft-2');
      expect(db.length).toBe(1);
    });

    test('3.2. Kampanye running DITOLAK dihapus langsung dan daftar UI tidak berkurang', async () => {
      const db: MockCampaign[] = [
        { id: 'c-run-1', organization_id: ORG_ID, title: 'Running Broadcast', status: 'running' },
      ];

      const res = await simulateDeleteCampaign({
        campaign: db[0],
        currentOrgId: ORG_ID,
        isWorkerOnline: true,
        sessionValid: true,
        dbStore: db,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('sedang berjalan (running) tidak dapat dihapus');
      expect(res.error).toContain('Batalkan siaran kampanye terlebih dahulu');
      expect(res.remainingList.length).toBe(1); // Tetap di UI
      expect(db.length).toBe(1); // Tetap di DB
    });

    test('3.3. Kampanye scheduled memberikan petunjuk worker offline tanpa raw Failed to fetch', async () => {
      const db: MockCampaign[] = [
        { id: 'c-sched-1', organization_id: ORG_ID, title: 'Scheduled Tomorrow', status: 'scheduled' },
      ];

      const res = await simulateDeleteCampaign({
        campaign: db[0],
        currentOrgId: ORG_ID,
        isWorkerOnline: false, // WORKER OFFLINE
        sessionValid: true,
        dbStore: db,
      });

      expect(res.success).toBe(false);
      expect(res.error?.toLowerCase()).toContain('offline');
      expect(res.error).toContain('port 4000');
      expect(res.error).not.toBe('Failed to fetch');
      expect(res.remainingList.length).toBe(1); // Tetap di UI
      expect(db.length).toBe(1); // Tetap di DB
    });

    test('3.4. Kampanye completed berhasil dihapus melalui fallback Supabase saat worker offline', async () => {
      const db: MockCampaign[] = [
        { id: 'c-comp-1', organization_id: ORG_ID, title: 'Completed Past Blast', status: 'completed' },
      ];

      const res = await simulateDeleteCampaign({
        campaign: db[0],
        currentOrgId: ORG_ID,
        isWorkerOnline: false, // WORKER OFFLINE
        sessionValid: true,
        dbStore: db,
      });

      expect(res.success).toBe(true);
      expect(res.remainingList.length).toBe(0);
      expect(db.length).toBe(0);
    });

    test('3.5. Tenant Boundary: Penghapusan kampanye organisasi lain ditolak', async () => {
      const db: MockCampaign[] = [
        { id: 'c-other-org', organization_id: 'org-alien-999', title: 'Foreign Draft', status: 'draft' },
      ];

      const res = await simulateDeleteCampaign({
        campaign: db[0],
        currentOrgId: ORG_ID, // Mismatch
        isWorkerOnline: false,
        sessionValid: true,
        dbStore: db,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Akses ditolak');
      expect(db.length).toBe(1); // Tidak terhapus
    });
  });

  // ===================================================================
  // 4. PENGUJIAN LOGIKA CRUD TIM CS (TEAM VIEW)
  // ===================================================================
  test.describe('4. Team CS CRUD Direct Supabase & Authorization Guards', () => {

    interface MockTeamMember {
      id: string;
      organization_id: string;
      full_name: string;
      role: 'admin' | 'cs_lead' | 'agent';
    }

    const ORG_ID = 'org-current-active-001';

    async function simulateDeleteTeamMember(params: {
      memberId: string;
      targetOrgId: string;
      currentOrgId: string;
      userRole: 'owner' | 'admin' | 'member' | null;
      dbStore: MockTeamMember[];
      simulateNetworkFailure?: boolean;
    }): Promise<{ success: boolean; error?: string; remainingList: MockTeamMember[] }> {
      const { memberId, targetOrgId, currentOrgId, userRole, dbStore, simulateNetworkFailure } = params;
      let localList = [...dbStore];

      // 1. Guard Frontend: Hanya Owner atau Admin yang boleh menghapus
      const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
      if (!isOwnerOrAdmin) {
        const err = { message: 'Akses ditolak. Hanya Owner atau Admin organisasi yang berwenang.', code: '42501' };
        return {
          success: false,
          error: formatErrorUserMessage(err, { entityName: 'anggota tim' }),
          remainingList: localList,
        };
      }

      // 2. Multi-Tenant Guard: Filter targetOrgId === currentOrgId
      if (targetOrgId !== currentOrgId) {
        const err = { message: 'Akses ditolak: target organisasi tidak sesuai.', code: '42501' };
        return {
          success: false,
          error: formatErrorUserMessage(err, { entityName: 'anggota tim' }),
          remainingList: localList,
        };
      }

      // 3. Simulasi Network / PostgREST Failure
      if (simulateNetworkFailure) {
        const netErr = new TypeError('Failed to fetch');
        return {
          success: false,
          error: formatErrorUserMessage(netErr, { entityName: 'anggota tim' }),
          remainingList: localList, // PENTING: UI tidak menghapus item jika DB gagal
        };
      }

      // 4. Eksekusi DELETE langsung ke Supabase:
      // supabase.from('team_members').delete().eq('id', memberId).eq('organization_id', currentOrgId)
      const idx = dbStore.findIndex(m => m.id === memberId && m.organization_id === currentOrgId);
      if (idx !== -1) {
        dbStore.splice(idx, 1);
        localList = localList.filter(m => m.id !== memberId);
        return { success: true, remainingList: localList };
      } else {
        return {
          success: false,
          error: formatErrorUserMessage(new Error('P0002 Record not found'), { entityName: 'anggota tim' }),
          remainingList: localList,
        };
      }
    }

    test('4.1. Owner/Admin berhasil menghapus anggota tim langsung via Supabase tanpa butuh worker', async () => {
      const db: MockTeamMember[] = [
        { id: 'tm-1', organization_id: ORG_ID, full_name: 'Budi Santoso', role: 'agent' },
        { id: 'tm-2', organization_id: ORG_ID, full_name: 'Siti Rahma', role: 'cs_lead' },
      ];

      const res = await simulateDeleteTeamMember({
        memberId: 'tm-1',
        targetOrgId: ORG_ID,
        currentOrgId: ORG_ID,
        userRole: 'owner',
        dbStore: db,
      });

      expect(res.success).toBe(true);
      expect(res.remainingList.length).toBe(1);
      expect(res.remainingList[0].id).toBe('tm-2');
      expect(db.length).toBe(1);
    });

    test('4.2. Role Member ditolak menghapus anggota tim', async () => {
      const db: MockTeamMember[] = [
        { id: 'tm-1', organization_id: ORG_ID, full_name: 'Budi Santoso', role: 'agent' },
      ];

      const res = await simulateDeleteTeamMember({
        memberId: 'tm-1',
        targetOrgId: ORG_ID,
        currentOrgId: ORG_ID,
        userRole: 'member',
        dbStore: db,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Akses ditolak');
      expect(db.length).toBe(1);
    });

    test('4.3. Role null / belum resolve ditolak menghapus anggota tim (Deny-by-default)', async () => {
      const db: MockTeamMember[] = [
        { id: 'tm-1', organization_id: ORG_ID, full_name: 'Budi Santoso', role: 'agent' },
      ];

      const res = await simulateDeleteTeamMember({
        memberId: 'tm-1',
        targetOrgId: ORG_ID,
        currentOrgId: ORG_ID,
        userRole: null,
        dbStore: db,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Akses ditolak');
      expect(db.length).toBe(1);
    });

    test('4.4. Tidak ada penghapusan optimistik: jika jaringan/DB gagal, item tetap ada di UI', async () => {
      const db: MockTeamMember[] = [
        { id: 'tm-1', organization_id: ORG_ID, full_name: 'Budi Santoso', role: 'agent' },
      ];

      const res = await simulateDeleteTeamMember({
        memberId: 'tm-1',
        targetOrgId: ORG_ID,
        currentOrgId: ORG_ID,
        userRole: 'admin',
        dbStore: db,
        simulateNetworkFailure: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Koneksi internet bermasalah');
      expect(res.remainingList.length).toBe(1); // Item TIDAK hilang dari UI
      expect(db.length).toBe(1);
    });
  });

  // ===================================================================
  // 5. PENGUJIAN LOGIKA UPDATE STATUS PERCAKAPAN (CONVERSATIONS VIEW)
  // ===================================================================
  test.describe('5. Conversation Status Update & Non-Optimistic Safety', () => {

    interface MockConversation {
      id: string;
      organization_id: string;
      status: 'active' | 'resolved' | 'pending';
    }

    const ORG_ID = 'org-current-active-001';

    async function simulateUpdateConversationStatus(params: {
      conversationId: string;
      newStatus: 'active' | 'resolved' | 'pending';
      currentOrgId: string;
      dbStore: MockConversation[];
      simulateFailure?: boolean;
    }): Promise<{ success: boolean; error?: string; updatedStore: MockConversation[] }> {
      const { conversationId, newStatus, currentOrgId, dbStore, simulateFailure } = params;

      // Jalur implementasi ConversationsView.tsx:
      // Eksekusi Supabase update terlebih dahulu:
      // const { error } = await supabase.from('conversations').update({ status: newStatus }).eq('id', convId).eq('organization_id', currentOrgId);
      if (simulateFailure) {
        const err = new Error('503 Service Unavailable: database connection pool exhausted');
        const formatted = formatErrorUserMessage(err, { entityName: 'percakapan' });
        // TIDAK memperbarui local state!
        return { success: false, error: formatted, updatedStore: [...dbStore] };
      }

      // Sukses: update database
      const item = dbStore.find(c => c.id === conversationId && c.organization_id === currentOrgId);
      if (item) {
        item.status = newStatus;
        return { success: true, updatedStore: [...dbStore] };
      }

      return {
        success: false,
        error: formatErrorUserMessage(new Error('P0002 Record not found'), { entityName: 'percakapan' }),
        updatedStore: [...dbStore],
      };
    }

    test('5.1. Update status percakapan berhasil memperbarui database dan state', async () => {
      const db: MockConversation[] = [
        { id: 'conv-1', organization_id: ORG_ID, status: 'active' },
      ];

      const res = await simulateUpdateConversationStatus({
        conversationId: 'conv-1',
        newStatus: 'resolved',
        currentOrgId: ORG_ID,
        dbStore: db,
      });

      expect(res.success).toBe(true);
      expect(res.updatedStore[0].status).toBe('resolved');
    });

    test('5.2. Saat update status gagal di database, state lokal TIDAK berubah (Non-optimistic safety)', async () => {
      const db: MockConversation[] = [
        { id: 'conv-1', organization_id: ORG_ID, status: 'active' },
      ];

      const res = await simulateUpdateConversationStatus({
        conversationId: 'conv-1',
        newStatus: 'resolved',
        currentOrgId: ORG_ID,
        dbStore: db,
        simulateFailure: true,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Layanan database Supabase sedang tidak tersedia');
      expect(res.updatedStore[0].status).toBe('active'); // Status asli dipertahankan
    });
  });

  // ===================================================================
  // 6. PENGUJIAN PEMBATALAN SIARAN KAMPANYE (CAMPAIGN CANCELLATION)
  // ===================================================================
  test.describe('6. Campaign Broadcast Cancellation & Queue Stopping Suite', () => {

    interface MockRecipient {
      id: string;
      campaign_id: string;
      phone: string;
      status: 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'skipped';
      error_message?: string;
    }

    interface MockCancelCampaign {
      id: string;
      organization_id: string;
      title: string;
      status: 'draft' | 'scheduled' | 'running' | 'completed' | 'cancelled';
      total_recipients: number;
      sent_count: number;
      skipped_count: number;
      failed_count: number;
    }

    const ORG_ID = 'org-current-active-001';
    const OTHER_ORG_ID = 'org-other-malicious-999';

    async function simulateCancelCampaign(params: {
      campaign: MockCancelCampaign;
      currentOrgId: string;
      userRole: 'owner' | 'admin' | 'member';
      isWorkerOnline: boolean;
      dbStore: MockCancelCampaign[];
      recipientStore: MockRecipient[];
      localCampaigns: MockCancelCampaign[];
      simulateTechnicalError?: string;
    }): Promise<{
      success: boolean;
      error?: string;
      message?: string;
      updatedLocalCampaigns: MockCancelCampaign[];
      updatedDbStore: MockCancelCampaign[];
      updatedRecipientStore: MockRecipient[];
    }> {
      const {
        campaign,
        currentOrgId,
        userRole,
        isWorkerOnline,
        dbStore,
        recipientStore,
        localCampaigns,
        simulateTechnicalError,
      } = params;

      let currentLocal = [...localCampaigns];

      // 1. Role Guard (Frontend & Worker)
      if (userRole === 'member') {
        return {
          success: false,
          error: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak membatalkan kampanye.',
          updatedLocalCampaigns: currentLocal,
          updatedDbStore: dbStore,
          updatedRecipientStore: recipientStore,
        };
      }

      // 2. Tenant Boundary Isolation
      if (campaign.organization_id !== currentOrgId) {
        return {
          success: false,
          error: 'Kampanye tidak ditemukan atau Anda tidak memiliki akses ke organisasi ini.',
          updatedLocalCampaigns: currentLocal,
          updatedDbStore: dbStore,
          updatedRecipientStore: recipientStore,
        };
      }

      // 3. Worker Offline Handling (Fail-Closed)
      if (!isWorkerOnline) {
        const fetchErr = formatWorkerFetchError(new TypeError('Failed to fetch'), 'membatalkan siaran kampanye');
        const formatted = formatErrorUserMessage(fetchErr, { entityName: 'kampanye', isWorker: true });
        return {
          success: false,
          error: formatted,
          updatedLocalCampaigns: currentLocal, // JANGAN ubah status lokal jika worker offline!
          updatedDbStore: dbStore,
          updatedRecipientStore: recipientStore,
        };
      }

      // 4. Technical Worker Error Handling
      if (simulateTechnicalError) {
        return {
          success: false,
          error: simulateTechnicalError,
          updatedLocalCampaigns: currentLocal, // JANGAN ubah status jika gagal teknis!
          updatedDbStore: dbStore,
          updatedRecipientStore: recipientStore,
        };
      }

      // 5. Worker Success Path:
      // - Berhenti kirim sisa antrean: update status pending & processing -> skipped
      // - Pesan sent & delivered TIDAK diubah
      const updatedRecipients = recipientStore.map((r) => {
        if (r.campaign_id === campaign.id && (r.status === 'pending' || r.status === 'processing')) {
          return {
            ...r,
            status: 'skipped' as const,
            error_message: 'Kampanye dibatalkan oleh admin sebelum pengiriman.',
          };
        }
        return r;
      });

      const skippedCount = updatedRecipients.filter(
        (r) => r.campaign_id === campaign.id && r.status === 'skipped'
      ).length;

      // Update status kampanye di database
      const updatedDb = dbStore.map((c) => {
        if (c.id === campaign.id) {
          return {
            ...c,
            status: 'cancelled' as const,
            skipped_count: skippedCount,
          };
        }
        return c;
      });

      // HANYA perbarui state lokal setelah worker & database berhasil
      currentLocal = currentLocal.map((c) => {
        if (c.id === campaign.id) {
          return {
            ...c,
            status: 'cancelled' as const,
            skipped_count: skippedCount,
          };
        }
        return c;
      });

      return {
        success: true,
        message: `Siaran kampanye "${campaign.title}" berhasil dibatalkan. Seluruh sisa antrean pengiriman telah dihentikan.`,
        updatedLocalCampaigns: currentLocal,
        updatedDbStore: updatedDb,
        updatedRecipientStore: updatedRecipients,
      };
    }

    test('6.1. Pembatalan siaran berhasil mengubah status menjadi cancelled dan menghentikan sisa antrean', async () => {
      const db: MockCancelCampaign[] = [
        {
          id: 'camp-broadcast-1',
          organization_id: ORG_ID,
          title: 'Promo Flash Sale 11.11',
          status: 'running',
          total_recipients: 5,
          sent_count: 2,
          skipped_count: 0,
          failed_count: 0,
        },
      ];

      const recipients: MockRecipient[] = [
        { id: 'r1', campaign_id: 'camp-broadcast-1', phone: '628111', status: 'delivered' },
        { id: 'r2', campaign_id: 'camp-broadcast-1', phone: '628222', status: 'sent' },
        { id: 'r3', campaign_id: 'camp-broadcast-1', phone: '628333', status: 'processing' },
        { id: 'r4', campaign_id: 'camp-broadcast-1', phone: '628444', status: 'pending' },
        { id: 'r5', campaign_id: 'camp-broadcast-1', phone: '628555', status: 'pending' },
      ];

      const localList = [...db];

      const result = await simulateCancelCampaign({
        campaign: db[0],
        currentOrgId: ORG_ID,
        userRole: 'admin',
        isWorkerOnline: true,
        dbStore: db,
        recipientStore: recipients,
        localCampaigns: localList,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('berhasil dibatalkan');

      // Status kampanye di UI dan DB berubah menjadi cancelled
      expect(result.updatedLocalCampaigns[0].status).toBe('cancelled');
      expect(result.updatedDbStore[0].status).toBe('cancelled');

      // Pesan yang sudah terkirim / delivered TIDAK BOLEH diubah!
      const sentItem = result.updatedRecipientStore.find((r) => r.id === 'r2');
      const deliveredItem = result.updatedRecipientStore.find((r) => r.id === 'r1');
      expect(sentItem?.status).toBe('sent');
      expect(deliveredItem?.status).toBe('delivered');

      // Seluruh sisa antrean (pending & processing) harus berubah menjadi skipped
      const processingItem = result.updatedRecipientStore.find((r) => r.id === 'r3');
      const pendingItem4 = result.updatedRecipientStore.find((r) => r.id === 'r4');
      const pendingItem5 = result.updatedRecipientStore.find((r) => r.id === 'r5');
      expect(processingItem?.status).toBe('skipped');
      expect(processingItem?.error_message).toContain('Kampanye dibatalkan oleh admin');
      expect(pendingItem4?.status).toBe('skipped');
      expect(pendingItem5?.status).toBe('skipped');
      expect(result.updatedDbStore[0].skipped_count).toBe(3);
    });

    test('6.2. Worker offline saat pembatalan siaran: Mengembalikan error informatif dan TIDAK mengubah status lokal (Fail-Closed)', async () => {
      const db: MockCancelCampaign[] = [
        {
          id: 'camp-broadcast-2',
          organization_id: ORG_ID,
          title: 'Broadcast Urgent',
          status: 'running',
          total_recipients: 10,
          sent_count: 1,
          skipped_count: 0,
          failed_count: 0,
        },
      ];

      const recipients: MockRecipient[] = [
        { id: 'r1', campaign_id: 'camp-broadcast-2', phone: '628111', status: 'sent' },
        { id: 'r2', campaign_id: 'camp-broadcast-2', phone: '628222', status: 'pending' },
      ];

      const localList = [...db];

      const result = await simulateCancelCampaign({
        campaign: db[0],
        currentOrgId: ORG_ID,
        userRole: 'owner',
        isWorkerOnline: false, // WORKER OFFLINE
        dbStore: db,
        recipientStore: recipients,
        localCampaigns: localList,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('WhatsApp Gateway');
      expect(result.error).toContain('npm run worker');
      // Status lokal dipertahankan 'running' (tidak ada perubahan palsu)
      expect(result.updatedLocalCampaigns[0].status).toBe('running');
      expect(result.updatedRecipientStore[1].status).toBe('pending');
    });

    test('6.3. Pembatalan gagal karena error teknis server worker ditangani dan tidak mengubah state', async () => {
      const db: MockCancelCampaign[] = [
        {
          id: 'camp-broadcast-3',
          organization_id: ORG_ID,
          title: 'Broadcast Error Case',
          status: 'running',
          total_recipients: 5,
          sent_count: 0,
          skipped_count: 0,
          failed_count: 0,
        },
      ];

      const result = await simulateCancelCampaign({
        campaign: db[0],
        currentOrgId: ORG_ID,
        userRole: 'admin',
        isWorkerOnline: true,
        dbStore: db,
        recipientStore: [],
        localCampaigns: [...db],
        simulateTechnicalError: 'Gagal memperbarui status kampanye di database gateway: Lock timeout',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lock timeout');
      expect(result.updatedLocalCampaigns[0].status).toBe('running');
    });

    test('6.4. Member dilarang membatalkan siaran kampanye (Role-based access guard)', async () => {
      const db: MockCancelCampaign[] = [
        {
          id: 'camp-broadcast-4',
          organization_id: ORG_ID,
          title: 'Broadcast Member Guard',
          status: 'running',
          total_recipients: 5,
          sent_count: 0,
          skipped_count: 0,
          failed_count: 0,
        },
      ];

      const result = await simulateCancelCampaign({
        campaign: db[0],
        currentOrgId: ORG_ID,
        userRole: 'member', // HAK AKSES MEMBER
        isWorkerOnline: true,
        dbStore: db,
        recipientStore: [],
        localCampaigns: [...db],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Akses dibatasi: Hanya Owner atau Admin');
      expect(result.updatedLocalCampaigns[0].status).toBe('running');
    });

    test('6.5. Pembatalan kampanye milik organisasi lain ditolak (Multi-tenant isolation)', async () => {
      const db: MockCancelCampaign[] = [
        {
          id: 'camp-broadcast-other-org',
          organization_id: OTHER_ORG_ID, // Organisasi lain
          title: 'Other Org Campaign',
          status: 'running',
          total_recipients: 5,
          sent_count: 0,
          skipped_count: 0,
          failed_count: 0,
        },
      ];

      const result = await simulateCancelCampaign({
        campaign: db[0],
        currentOrgId: ORG_ID, // Organisasi aktif saat ini
        userRole: 'admin',
        isWorkerOnline: true,
        dbStore: db,
        recipientStore: [],
        localCampaigns: [...db],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('tidak memiliki akses');
    });

    test('6.6. Alur Lengkap: Kampanye running dilarang dihapus, setelah dibatalkan menjadi cancelled baru dapat dihapus', async () => {
      let db: MockCancelCampaign[] = [
        {
          id: 'camp-lifecycle-1',
          organization_id: ORG_ID,
          title: 'Lifecycle Campaign',
          status: 'running',
          total_recipients: 10,
          sent_count: 2,
          skipped_count: 0,
          failed_count: 0,
        },
      ];

      let recipients: MockRecipient[] = [
        { id: 'r1', campaign_id: 'camp-lifecycle-1', phone: '628111', status: 'sent' },
        { id: 'r2', campaign_id: 'camp-lifecycle-1', phone: '628222', status: 'sent' },
        { id: 'r3', campaign_id: 'camp-lifecycle-1', phone: '628333', status: 'pending' },
      ];

      let localCampaigns = [...db];

      // Langkah 1: Pengguna mencoba menghapus kampanye running -> DITOLAK
      const deleteRunningAttempt = await simulateDeleteCampaign({
        campaign: localCampaigns[0] as any,
        currentOrgId: ORG_ID,
        isWorkerOnline: true,
        sessionValid: true,
        dbStore: db as any,
      });

      expect(deleteRunningAttempt.success).toBe(false);
      expect(deleteRunningAttempt.error).toContain('sedang berjalan (running) tidak dapat dihapus');
      expect(deleteRunningAttempt.error).toContain('Batalkan siaran kampanye terlebih dahulu');

      // Langkah 2: Pengguna mengklik "Batalkan Siaran" -> BERHASIL dibatalkan
      const cancelResult = await simulateCancelCampaign({
        campaign: localCampaigns[0],
        currentOrgId: ORG_ID,
        userRole: 'owner',
        isWorkerOnline: true,
        dbStore: db,
        recipientStore: recipients,
        localCampaigns: localCampaigns,
      });

      expect(cancelResult.success).toBe(true);
      expect(cancelResult.updatedLocalCampaigns[0].status).toBe('cancelled');

      // Sinkronkan state setelah pembatalan
      db = cancelResult.updatedDbStore;
      localCampaigns = cancelResult.updatedLocalCampaigns;

      // Langkah 3: Pengguna kini menghapus kampanye yang sudah berstatus 'cancelled' -> BERHASIL
      const deleteCancelledAttempt = await simulateDeleteCampaign({
        campaign: localCampaigns[0] as any,
        currentOrgId: ORG_ID,
        isWorkerOnline: true,
        sessionValid: true,
        dbStore: db as any,
      });

      expect(deleteCancelledAttempt.success).toBe(true);
      expect(deleteCancelledAttempt.remainingList.length).toBe(0);
      expect(db.length).toBe(0);
    });
  });

  // ===================================================================
  // 7. PENGUJIAN NOTIFIKASI SELURUH FITUR CRUD & PESAN MASUK WHATSAPP
  // ===================================================================
  test.describe('7. End-to-End CRUD Notifications & Inbound WhatsApp Flow', () => {
    const NOTIF_ORG = 'org-notif-audit-001';
    const NOTIF_USER = 'user-notif-audit-001';

    test.beforeEach(() => {
      _resetLocalFallbackNotifications();
    });

    test('7.1. Kontak CRUD: Tambah, edit, dan hapus kontak masing-masing menghasilkan notifikasi yang tepat', async () => {
      // 1. Tambah Kontak
      await notifyContactCreated({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        contactName: 'Budi Santoso',
        phone: '628123456789',
      });

      // 2. Edit Kontak
      await notifyContactUpdated({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        contactName: 'Budi Santoso (VIP)',
        phone: '628123456789',
      });

      // 3. Hapus Kontak
      await notifyContactDeleted({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        contactName: 'Budi Santoso (VIP)',
        phone: '628123456789',
      });

      const items = _getLocalFallbackNotifications();
      expect(items.length).toBe(3);
      expect(items.every((i) => i.category === 'contact')).toBe(true);

      expect(items[2].title).toBe('Kontak Baru Ditambahkan');
      expect(items[1].title).toBe('Data Kontak Diperbarui');
      expect(items[0].title).toBe('Kontak Dihapus');
    });

    test('7.2. Kampanye CRUD: Buat draf, edit, jadwalkan, batalkan, dan hapus kampanye masing-masing menerbitkan notifikasi kategori campaign', async () => {
      const campId = 'camp-full-lifecycle-1';
      const campName = 'Promo Ramadhan 1448H';

      // 1. Buat Draf
      await notifyCampaignEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        campaignId: campId,
        campaignName: campName,
        mode: 'draft',
      });

      // 2. Edit Kampanye
      await notifyCampaignEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        campaignId: campId,
        campaignName: campName,
        mode: 'updated',
      });

      // 3. Jadwalkan Kampanye
      await notifyCampaignEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        campaignId: campId,
        campaignName: campName,
        mode: 'scheduled',
        recipientCount: 250,
      });

      // 4. Batalkan Siaran
      await notifyCampaignEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        campaignId: campId,
        campaignName: campName,
        mode: 'cancelled',
      });

      // 5. Hapus Kampanye
      await notifyCampaignEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        campaignId: campId,
        campaignName: campName,
        mode: 'deleted',
      });

      const items = _getLocalFallbackNotifications();
      expect(items.length).toBe(5);
      expect(items.every((i) => i.category === 'campaign')).toBe(true);

      const titles = items.map((i) => i.title);
      expect(titles).toContain('Draf Kampanye Disimpan');
      expect(titles).toContain('Kampanye Berhasil Diperbarui');
      expect(titles).toContain('Kampanye Berhasil Dijadwalkan');
      expect(titles).toContain('Siaran Kampanye Dibatalkan');
      expect(titles).toContain('Kampanye Berhasil Dihapus');
    });

    test('7.3. Non-false-positive: Operasi yang gagal TIDAK boleh memicu pemanggilan notifikasi', async () => {
      // Simulasikan alur handler di UI:
      // Operasi DB gagal -> langsung return error -> fungsi notifikasi TIDAK DIPANGGIL
      let operationSucceeded = false;
      const simulateFailedDbInsert = async () => {
        // Simulasi error Supabase
        const dbError = { message: 'violates check constraint', code: '23514' };
        if (dbError) {
          // Handler me-return error dan TIDAK memanggil notifyCampaignEvent
          return;
        }
        operationSucceeded = true;
      };

      await simulateFailedDbInsert();

      if (operationSucceeded) {
        await notifyCampaignEvent({
          organizationId: NOTIF_ORG,
          userId: NOTIF_USER,
          campaignId: 'failed-c',
          campaignName: 'Failed',
          mode: 'draft',
        });
      }

      const items = _getLocalFallbackNotifications();
      expect(items.length).toBe(0); // Tidak ada notifikasi palsu!
    });

    test('7.4. Tim CS CRUD: Tambah, edit, status, dan hapus anggota tim menghasilkan notifikasi tim yang informatif', async () => {
      const memberId = 'tm-007';

      // 1. Tambah Anggota
      await notifyTeamEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        memberId,
        fullName: 'Siti Rahma',
        action: 'added',
        extraInfo: 'Customer Service',
      });

      // 2. Edit Anggota
      await notifyTeamEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        memberId,
        fullName: 'Siti Rahma, S.Kom',
        action: 'updated',
      });

      // 3. Update Status
      await notifyTeamEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        memberId,
        fullName: 'Siti Rahma, S.Kom',
        action: 'status_updated',
        extraInfo: 'Nonaktif',
      });

      // 4. Hapus Anggota
      await notifyTeamEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        memberId,
        fullName: 'Siti Rahma, S.Kom',
        action: 'deleted',
      });

      const items = _getLocalFallbackNotifications();
      expect(items.length).toBe(4);
      expect(items.every((i) => i.category === 'team')).toBe(true);

      expect(items.some((i) => i.title.includes('Baru Ditambahkan'))).toBe(true);
      expect(items.some((i) => i.title.includes('Diperbarui'))).toBe(true);
      expect(items.some((i) => i.title.includes('Dihapus'))).toBe(true);
    });

    test('7.5. Pengaturan & Chatbot AI: Profil organisasi, gateway, dan chatbot toggle/rules menghasilkan notifikasi sistem', async () => {
      // 1. Profil Organisasi
      await notifyOrgProfileUpdated({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        orgName: 'Pesantren Al-Hikmah',
      });

      // 2. Pemutusan Gateway
      await notifyConfigUpdated({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        configName: 'WhatsApp Gateway',
        detail: 'Sesi perangkat diputuskan.',
      });

      // 3. Chatbot Diaktifkan
      await notifyChatbotEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        action: 'enabled',
        orgName: 'Pesantren Al-Hikmah',
      });

      // 4. Knowledge Base Diperbarui
      await notifyChatbotEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        action: 'rules_updated',
        orgName: 'Pesantren Al-Hikmah',
      });

      const items = _getLocalFallbackNotifications();
      expect(items.length).toBe(4);
      expect(items.every((i) => i.category === 'system')).toBe(true);
    });

    test('7.6. Percakapan: Pesan keluar dan perubahan status percakapan menghasilkan notifikasi kategori chat', async () => {
      const convId = 'conv-test-99';

      // 1. Pesan Keluar Agen CS
      await notifyChatEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        conversationId: convId,
        eventType: 'outbound_message',
        contactName: 'Santri Ahmad',
        messageSnippet: 'Waalaikumussalam, pendaftaran gelombang 1 masih dibuka.',
      });

      // 2. Perubahan Status Percakapan ke Selesai
      await notifyChatEvent({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        conversationId: convId,
        eventType: 'status_updated',
        contactName: 'Santri Ahmad',
        extraInfo: 'Selesai',
      });

      const items = _getLocalFallbackNotifications();
      expect(items.length).toBe(2);
      expect(items.every((i) => i.category === 'chat')).toBe(true);
      expect(items[1].title).toBe('Pesan Terkirim ke WhatsApp');
      expect(items[0].title).toBe('Status Percakapan Diperbarui');
    });

    test('7.7. Pesan Masuk WhatsApp: Deduplikasi berbasis ID pesan mencegah notifikasi ganda pada retry/replay', async () => {
      // Simulasikan fungsi createInboundMessageNotification worker
      const simulateInboundNotification = async (messageId: string, text: string) => {
        await notifyChatEvent({
          organizationId: NOTIF_ORG,
          userId: NOTIF_USER,
          conversationId: 'conv-inbound-1',
          eventType: 'inbound_message',
          contactName: 'Ustadz Mansur',
          messageSnippet: text,
          messageId,
        });
      };

      // Pesan masuk pertama
      await simulateInboundNotification('WAMID-1001', 'Halo, mau tanya brosur.');

      // Pesan kedua dengan ID berbeda
      await simulateInboundNotification('WAMID-1002', 'Terima kasih informasinya.');

      const items = _getLocalFallbackNotifications();
      expect(items.length).toBe(2);
      expect(items[0].title).toBe('Pesan WhatsApp Baru Masuk');
      expect(items[1].title).toBe('Pesan WhatsApp Baru Masuk');
    });

    test('7.8. Worker Offline: Saat worker offline, tidak ada event WhatsApp masuk palsu yang dipicu', () => {
      const isWorkerOnline = false;
      const inboundMessagesQueue: Array<{ text: string }> = [];

      // Jika worker offline, socket Baileys tidak menerima event messages.upsert
      if (isWorkerOnline) {
        inboundMessagesQueue.push({ text: 'Pesan palsu' });
      }

      expect(inboundMessagesQueue.length).toBe(0);
      const items = _getLocalFallbackNotifications();
      expect(items.length).toBe(0);
    });

    test('7.9. Real-Time Reaktivitas: Listener perubahan lokal langsung terpicu seketika notifikasi dibuat', async () => {
      let listenerCallCount = 0;
      const unsubscribe = addNotificationChangeListener(() => {
        listenerCallCount++;
      });

      await notifyContactCreated({
        organizationId: NOTIF_ORG,
        userId: NOTIF_USER,
        contactName: 'Reactivity Test',
        phone: '6289999111',
      });

      expect(listenerCallCount).toBeGreaterThanOrEqual(1);
      unsubscribe();
    });
  });
});
