// ====================================================================
// WABiz Tahap 8C: Test Suite Pemulihan AI, Lease Fencing & Recovery Safety
// ====================================================================
// Berkas: server/src/test-ai-recovery.ts
//
// Menguji secara terisolasi penuh (offline / in-memory):
// 1. Pesan baru berhasil diproses, mengklaim lease token, dan mengikat reply_to_message_id.
// 2. Webhook yang sama datang dua kali tidak memicu AI ganda.
// 3. Dua worker mencoba mengklaim pesan yang sama: hanya satu yang berhasil menerima lease token.
// 4. Pengambilalihan stale lock menghasilkan lease token baru dan membatalkan lease worker lama.
// 5. Worker lama yang kehilangan lease ditolak saat mencoba update status (Lease Fencing).
// 6. Worker yang kehilangan lease sebelum tahap pengiriman outbound membatalkan pengiriman (Pre-Dispatch Check).
// 7. Crash sebelum tahap pengiriman (ai_dispatch_started_at IS NULL) dapat dipulihkan dengan aman.
// 8. Crash setelah pengiriman mungkin dimulai (ai_dispatch_started_at IS NOT NULL) TIDAK blind retry,
//    melainkan beralih ke 'needs_reconciliation' untuk mencegah pesan ganda ke pengguna.
// 9. Gateway timeout dan socket hang up menandai 'needs_reconciliation'.
// 10. Webhook duplikat tidak melewati status 'needs_reconciliation'.
// 11. Isolasi multi-tenant ketat: Org B tidak dapat mengklaim, membaca, atau memperbarui pekerjaan Org A.
// 12. Regresi Baileys dan Meta Cloud API tetap terjaga backward-compatible.
// ====================================================================

import assert from 'assert';
import {
  processOpenWaWebhookPayload,
  isUnknownDeliveryError,
  setOpenWaWebhookTestHooks,
} from './webhook';
import {
  claimInboundMessageForAi,
  markInboundMessageDispatching,
  updateInboundMessageAiStatus,
  getOutboundReplyForInbound,
  persistInboundWhatsAppMessage,
  persistOutboundWhatsAppMessage,
  AiProcessingStatus,
} from './supabase';

interface MockMessageRow {
  id: string;
  organization_id: string;
  conversation_id: string;
  sender_type: 'customer' | 'bot' | 'agent';
  body: string;
  sent_at: string;
  provider_type: 'baileys' | 'meta_cloud_api' | 'openwa';
  provider_message_id: string | null;
  delivery_status: string;
  reply_to_message_id?: string | null;
  ai_status?: AiProcessingStatus;
  ai_locked_at?: string | null;
  ai_lease_token?: string | null;
  ai_dispatch_started_at?: string | null;
  created_at: string;
}

/**
 * Mock In-Memory Database Supabase untuk isolasi pengujian tanpa jaringan
 * Mendukung simulasi RPC PostgreSQL dan kueri PostgREST.
 */
class MockSupabaseDatabase {
  messages: MockMessageRow[] = [];
  conversations: Array<{ id: string; organization_id: string; contact_id: string; status: string; last_message_at: string }> = [];
  contacts: Array<{ id: string; organization_id: string; name: string; phone: string }> = [];
  organizations: Array<{ id: string; name: string }> = [
    { id: 'org-uuid-aaaa-1111-1111-111111111111', name: 'Pesantren Al-Ikhlas (Org A)' },
    { id: 'org-uuid-bbbb-2222-2222-222222222222', name: 'Sekolah Islam Terpadu (Org B)' },
  ];
  autoId = 1000;

  createClient() {
    const db = this;

    return {
      rpc(name: string, args: any) {
        if (name === 'claim_inbound_message_for_ai') {
          const orgId = args.p_organization_id;
          const msgId = args.p_message_id;
          const timeoutSec = args.p_lock_timeout_seconds || 180;
          const msg = db.messages.find((m) => m.id === msgId && m.organization_id === orgId);
          if (!msg) {
            return Promise.resolve({ data: { claimed: false, reason: 'message_not_found' }, error: null });
          }
          if (msg.ai_status === 'completed') {
            return Promise.resolve({ data: { claimed: false, current_status: 'completed', reason: 'already_completed' }, error: null });
          }
          if (msg.ai_status === 'needs_reconciliation') {
            return Promise.resolve({ data: { claimed: false, current_status: 'needs_reconciliation', reason: 'needs_reconciliation' }, error: null });
          }
          if (msg.ai_status === 'failed') {
            return Promise.resolve({ data: { claimed: false, current_status: 'failed', reason: 'already_failed' }, error: null });
          }
          const now = Date.now();
          if (msg.ai_status === 'processing' && msg.ai_locked_at) {
            const lockTime = new Date(msg.ai_locked_at).getTime();
            if (now - lockTime < timeoutSec * 1000) {
              return Promise.resolve({ data: { claimed: false, current_status: 'processing', reason: 'in_progress_lock' }, error: null });
            }
            // Stale lock: periksa apakah tahap pengiriman outbound sudah pernah dimulai
            if (msg.ai_dispatch_started_at) {
              msg.ai_status = 'needs_reconciliation';
              msg.ai_locked_at = null;
              return Promise.resolve({
                data: {
                  claimed: false,
                  current_status: 'needs_reconciliation',
                  reason: 'dispatch_in_doubt_needs_reconciliation',
                },
                error: null,
              });
            }
          }
          // Klaim sukses: terbitkan lease token baru
          const lease = `lease_${++db.autoId}_${Date.now()}`;
          msg.ai_status = 'processing';
          msg.ai_locked_at = new Date().toISOString();
          msg.ai_lease_token = lease;
          msg.ai_dispatch_started_at = null;
          return Promise.resolve({
            data: {
              claimed: true,
              lease_token: lease,
              current_status: 'processing',
            },
            error: null,
          });
        }

        if (name === 'mark_inbound_message_dispatching') {
          const orgId = args.p_organization_id;
          const msgId = args.p_message_id;
          const lease = args.p_lease_token;
          const msg = db.messages.find((m) => m.id === msgId && m.organization_id === orgId);
          if (!msg || msg.ai_lease_token !== lease || msg.ai_status !== 'processing') {
            return Promise.resolve({ data: false, error: null });
          }
          msg.ai_dispatch_started_at = new Date().toISOString();
          return Promise.resolve({ data: true, error: null });
        }

        if (name === 'update_inbound_message_ai_status') {
          const orgId = args.p_organization_id;
          const msgId = args.p_message_id;
          const status = args.p_status;
          const lease = args.p_lease_token;
          const msg = db.messages.find((m) => m.id === msgId && m.organization_id === orgId);
          if (!msg) {
            return Promise.resolve({ data: false, error: null });
          }
          // Jika baris memiliki lease token, pemanggil WAJIB menyediakan lease token yang cocok persis
          if (msg.ai_lease_token && (!lease || msg.ai_lease_token !== lease)) {
            return Promise.resolve({ data: false, error: null });
          }
          msg.ai_status = status;
          if (['completed', 'failed', 'needs_reconciliation'].includes(status)) {
            msg.ai_locked_at = null;
          }
          return Promise.resolve({ data: true, error: null });
        }

        return Promise.resolve({ data: null, error: { message: `Function ${name} not found`, code: '42883' } });
      },

      from(table: string) {
        let filters: Array<(row: any) => boolean> = [];
        let orderField: string | null = null;
        let isAsc = true;
        let limitVal: number | null = null;
        let updateData: any = null;
        let insertData: any = null;

        const queryObj: any = {
          select(fields = '*') {
            return queryObj;
          },
          eq(field: string, val: any) {
            filters.push((row) => row[field] === val);
            return queryObj;
          },
          in(field: string, vals: any[]) {
            filters.push((row) => vals.includes(row[field]));
            return queryObj;
          },
          order(field: string, opts?: { ascending?: boolean }) {
            orderField = field;
            isAsc = opts?.ascending !== false;
            return queryObj;
          },
          limit(n: number) {
            limitVal = n;
            return queryObj;
          },
          insert(payload: any) {
            insertData = payload;
            return queryObj;
          },
          update(payload: any) {
            updateData = payload;
            return queryObj;
          },
          async single() {
            const res = await queryObj.execute();
            if (res.data && res.data.length > 0) {
              return { data: res.data[0], error: null };
            }
            return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
          },
          async maybeSingle() {
            const res = await queryObj.execute();
            if (res.data && res.data.length > 0) {
              return { data: res.data[0], error: null };
            }
            return { data: null, error: null };
          },
          async execute() {
            if (table === 'messages') {
              if (insertData) {
                const row: MockMessageRow = {
                  id: insertData.id || `msg_uuid_${++db.autoId}`,
                  organization_id: insertData.organization_id,
                  conversation_id: insertData.conversation_id,
                  sender_type: insertData.sender_type,
                  body: insertData.body,
                  sent_at: insertData.sent_at || new Date().toISOString(),
                  provider_type: insertData.provider_type || 'baileys',
                  provider_message_id: insertData.provider_message_id || null,
                  delivery_status: insertData.delivery_status || 'delivered',
                  reply_to_message_id: insertData.reply_to_message_id || null,
                  ai_status: insertData.ai_status || 'completed',
                  ai_locked_at: insertData.ai_locked_at || null,
                  ai_lease_token: insertData.ai_lease_token || null,
                  ai_dispatch_started_at: insertData.ai_dispatch_started_at || null,
                  created_at: new Date().toISOString(),
                };
                db.messages.push(row);
                return { data: [row], error: null };
              }

              if (updateData) {
                let count = 0;
                const updatedRows: any[] = [];
                for (const row of db.messages) {
                  if (filters.every((f) => f(row))) {
                    Object.assign(row, updateData);
                    updatedRows.push(row);
                    count++;
                  }
                }
                return { data: updatedRows, count, error: null };
              }

              let rows = db.messages.filter((r) => filters.every((f) => f(r)));
              if (orderField) {
                rows.sort((a: any, b: any) => {
                  if (a[orderField!] < b[orderField!]) return isAsc ? -1 : 1;
                  if (a[orderField!] > b[orderField!]) return isAsc ? 1 : -1;
                  return 0;
                });
              }
              if (limitVal) {
                rows = rows.slice(0, limitVal);
              }
              return { data: rows, error: null };
            }

            if (table === 'contacts') {
              if (insertData) {
                const contact = {
                  id: `contact_${++db.autoId}`,
                  organization_id: insertData.organization_id,
                  name: insertData.name,
                  phone: insertData.phone,
                };
                db.contacts.push(contact);
                return { data: [contact], error: null };
              }
              const rows = db.contacts.filter((c) => filters.every((f) => f(c)));
              return { data: rows, error: null };
            }

            if (table === 'conversations') {
              if (insertData) {
                const conv = {
                  id: `conv_${++db.autoId}`,
                  organization_id: insertData.organization_id,
                  contact_id: insertData.contact_id,
                  status: insertData.status || 'open',
                  last_message_at: insertData.last_message_at || new Date().toISOString(),
                };
                db.conversations.push(conv);
                return { data: [conv], error: null };
              }
              if (updateData) {
                for (const conv of db.conversations) {
                  if (filters.every((f) => f(conv))) {
                    Object.assign(conv, updateData);
                  }
                }
                return { data: null, error: null };
              }
              const rows = db.conversations.filter((c) => filters.every((f) => f(c)));
              return { data: rows, error: null };
            }

            if (table === 'organizations') {
              const rows = db.organizations.filter((o) => filters.every((f) => f(o)));
              return { data: rows, error: null };
            }

            return { data: [], error: null };
          },
          then(resolve: any, reject: any) {
            return queryObj.execute().then(resolve, reject);
          },
        };

        return queryObj;
      },
    };
  }
}

async function runAiRecoveryTests() {
  console.log('====================================================================');
  console.log('   WABIZ TAHAP 8C: TEST SUITE PEMULIHAN AI, LEASE FENCING & ATOMISITAS');
  console.log('====================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function runAssert(condition: boolean, msg: string) {
    totalTests++;
    try {
      assert(condition, msg);
      console.log(`  ✓ PASS: ${msg}`);
      passedTests++;
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${msg}`);
      console.error(`    Detail: ${err.message}`);
      throw err;
    }
  }

  const mockDb = new MockSupabaseDatabase();
  const mockClient = mockDb.createClient();

  // Reset test hooks
  setOpenWaWebhookTestHooks({});

  const orgA = 'org-uuid-aaaa-1111-1111-111111111111';
  const orgB = 'org-uuid-bbbb-2222-2222-222222222222';
  const sessionIdA = 'session-org-a-1234';

  // ------------------------------------------------------------------
  // SKENARIO 1: Pesan Baru Berhasil Diproses (Normal Path dengan Lease Token)
  // ------------------------------------------------------------------
  console.log('[SKENARIO 1] Pesan Baru Berhasil Diproses & Mengikat reply_to_message_id dengan Lease Token');

  let sentMessages1: Array<{ to: string; text: string }> = [];
  const payload1 = {
    event: 'message.received',
    sessionId: sessionIdA,
    data: {
      id: 'openwa_inbound_001',
      from: '6281234567890@c.us',
      chatId: '6281234567890@c.us',
      body: 'Berapa biaya pendaftaran santri baru?',
      fromMe: false,
      pushName: 'Ahmad Fauzi',
    },
  };

  const res1 = await processOpenWaWebhookPayload(payload1, {
    organizationId: orgA,
    providerType: 'openwa',
    supabaseClient: mockClient,
    customSendFn: async (to, text) => {
      sentMessages1.push({ to, text });
      return { success: true, messageId: 'openwa_reply_out_001' };
    },
  });

  runAssert(res1.success === true && res1.status === 'processed', 'Pesan masuk pertama berhasil diproses (status: processed)');
  runAssert(res1.aiReplied === true, 'AI reply terpicu untuk pertanyaan informasi pendaftaran');
  runAssert(sentMessages1.length === 1, 'Tepat 1 balasan dikirim ke WhatsApp pengirim');

  // Cek state di Mock DB
  const inboundRow1 = mockDb.messages.find((m) => m.provider_message_id === 'openwa_inbound_001');
  runAssert(Boolean(inboundRow1), 'Pesan masuk tercatat di tabel messages');
  runAssert(inboundRow1?.ai_status === 'completed', "Status AI pesan masuk bertransisi ke 'completed'");
  runAssert(inboundRow1?.ai_locked_at === null, 'Lock pelepasan bersih (ai_locked_at null)');
  runAssert(Boolean(inboundRow1?.ai_lease_token), 'Lease token tercatat saat pekerjaan diproses');

  const outboundRow1 = mockDb.messages.find((m) => m.provider_message_id === 'openwa_reply_out_001');
  runAssert(Boolean(outboundRow1), 'Pesan keluar tercatat di tabel messages');
  runAssert(outboundRow1?.reply_to_message_id === inboundRow1?.id, 'Pesan keluar mengikat reply_to_message_id ke pesan masuk yang tepat');

  // ------------------------------------------------------------------
  // SKENARIO 2: Webhook yang Sama Datang Dua Kali (Immediate Duplicate)
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 2] Webhook yang Sama Datang Dua Kali (Anti-Duplikasi Balasan)');

  let sentMessages2: Array<{ to: string; text: string }> = [];
  const res2 = await processOpenWaWebhookPayload(payload1, {
    organizationId: orgA,
    providerType: 'openwa',
    supabaseClient: mockClient,
    customSendFn: async (to, text) => {
      sentMessages2.push({ to, text });
      return { success: true, messageId: 'openwa_reply_out_002' };
    },
  });

  runAssert(res2.status === 'duplicate', 'Pengiriman webhook kedua dideteksi sebagai duplicate');
  runAssert(res2.reason === 'already_completed' || res2.reason === 'in_memory_duplicate', 'Alasan penolakan adalah already_completed atau in_memory_duplicate');
  runAssert(sentMessages2.length === 0, 'Pesan balasan TIDAK dikirim ulang ke WhatsApp (anti-spam)');

  // ------------------------------------------------------------------
  // SKENARIO 3: Dua Worker Mengklaim Pesan yang Sama (Atomic Job Claim)
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 3] Dua Worker Mencoba Mengklaim Pesan yang Sama (Atomic Job Claim)');

  const pendingMsgId = 'msg_pending_race_001';
  mockDb.messages.push({
    id: pendingMsgId,
    organization_id: orgA,
    conversation_id: 'conv_race_001',
    sender_type: 'customer',
    body: 'Pesan uji balapan worker',
    sent_at: new Date().toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'openwa_race_msg_101',
    delivery_status: 'delivered',
    ai_status: 'pending',
    ai_locked_at: null,
    created_at: new Date().toISOString(),
  });

  // Worker 1 mengklaim
  const claim1 = await claimInboundMessageForAi(orgA, pendingMsgId, 180000, mockClient);
  runAssert(claim1.claimed === true, 'Worker 1 berhasil mengklaim pesan pending (claimed: true)');
  runAssert(Boolean(claim1.leaseToken), 'Worker 1 menerima lease token unik');
  runAssert(claim1.currentStatus === 'processing', 'Status berubah menjadi processing untuk Worker 1');

  // Worker 2 mencoba mengklaim pesan yang sama saat lock masih aktif
  const claim2 = await claimInboundMessageForAi(orgA, pendingMsgId, 180000, mockClient);
  runAssert(claim2.claimed === false, 'Worker 2 DITOLAK mengklaim pesan yang sedang berjalan (claimed: false)');
  runAssert(claim2.reason === 'in_progress_lock', 'Alasan penolakan Worker 2 adalah in_progress_lock');

  // ------------------------------------------------------------------
  // SKENARIO 4: Pengambilalihan Stale Lock & Pembatalan Lease Lama (Lease Invalidation)
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 4] Stale Lock Takeover Menghasilkan Lease Token Baru & Membatalkan Lease Lama');

  const staleMsgId = 'db_id_stale_lock_001';
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const oldLeaseToken = 'lease_worker_a_stale_123';

  mockDb.messages.push({
    id: staleMsgId,
    organization_id: orgA,
    conversation_id: 'conv_stale_001',
    sender_type: 'customer',
    body: 'Pesan terkunci stale tanpa dispatch',
    sent_at: fiveMinutesAgo,
    provider_type: 'openwa',
    provider_message_id: 'openwa_stale_test_001',
    delivery_status: 'delivered',
    ai_status: 'processing',
    ai_locked_at: fiveMinutesAgo,
    ai_lease_token: oldLeaseToken,
    ai_dispatch_started_at: null, // Terbukti belum dispatch
    created_at: fiveMinutesAgo,
  });

  // Worker B mengambil alih lock yang stale
  const claimB = await claimInboundMessageForAi(orgA, staleMsgId, 180000, mockClient);
  runAssert(claimB.claimed === true, 'Worker B berhasil mengambil alih stale lock (claimed: true)');
  runAssert(Boolean(claimB.leaseToken) && claimB.leaseToken !== oldLeaseToken, 'Worker B mendapatkan lease token baru yang berbeda dari Worker A');

  // Worker A yang lama mencoba meng-update status menggunakan lease token lamanya
  const updateByWorkerA = await updateInboundMessageAiStatus(orgA, staleMsgId, 'completed', oldLeaseToken, mockClient);
  runAssert(updateByWorkerA === false, 'Worker A DITOLAK meng-update status dengan lease token lama (Lease Fencing Berhasil)');

  const currentStaleRow = mockDb.messages.find((m) => m.id === staleMsgId);
  runAssert(currentStaleRow?.ai_lease_token === claimB.leaseToken, 'Lease token milik Worker B tidak terhapus oleh Worker A');

  // Worker B menyelesaikan pekerjaan dengan lease token barunya
  const updateByWorkerB = await updateInboundMessageAiStatus(orgA, staleMsgId, 'completed', claimB.leaseToken, mockClient);
  runAssert(updateByWorkerB === true, 'Worker B yang sah berhasil menyelesaikan update status');
  runAssert(currentStaleRow?.ai_status === 'completed', 'Status pesan berubah menjadi completed oleh Worker B');

  // ------------------------------------------------------------------
  // SKENARIO 5: Pre-Dispatch Check: Worker Kehilangan Lease Sebelum Pengiriman
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 5] Pre-Dispatch Check: Pengiriman Dibatalkan Jika Lease Hilang Sebelum Kirim');

  const preDispatchMsgId = 'openwa_predispatch_test_001';
  let sendCalls5 = 0;

  // Pasang pesan yang sedang diproses di DB
  const validDbMsgId = 'db_msg_predispatch_001';
  mockDb.messages.push({
    id: validDbMsgId,
    organization_id: orgA,
    conversation_id: 'conv_predispatch_001',
    sender_type: 'customer',
    body: 'Berapa SPP bulanan?',
    sent_at: new Date().toISOString(),
    provider_type: 'openwa',
    provider_message_id: preDispatchMsgId,
    delivery_status: 'delivered',
    ai_status: 'pending',
    ai_locked_at: null,
    created_at: new Date().toISOString(),
  });

  // Jalankan webhook dengan customMarkDispatchFn yang mensimulasikan lease dicuri tepat sebelum pengiriman
  const res5 = await processOpenWaWebhookPayload(
    {
      event: 'message.received',
      sessionId: sessionIdA,
      data: {
        id: preDispatchMsgId,
        from: '6281234567890@c.us',
        chatId: '6281234567890@c.us',
        body: 'Berapa SPP bulanan?',
        fromMe: false,
      },
    },
    {
      organizationId: orgA,
      providerType: 'openwa',
      supabaseClient: mockClient,
      customMarkDispatchFn: async () => {
        // Simulasi: lease dicuri worker lain saat AI berpikir!
        return false;
      },
      customSendFn: async () => {
        sendCalls5++;
        return { success: true, messageId: 'forbidden_send_001' };
      },
    }
  );

  runAssert(res5.reason === 'lease_lost_before_dispatch', 'Webhook mendeteksi lease_lost_before_dispatch');
  runAssert(sendCalls5 === 0, 'Gateway WhatsApp TIDAK PERNAH dipanggil saat lease hilang (Anti-Duplikasi Efektif)');

  // ------------------------------------------------------------------
  // SKENARIO 6: Crash Sebelum Dispatch (ai_dispatch_started_at IS NULL)
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 6] Crash Sebelum Dispatch (ai_dispatch_started_at IS NULL) Aman Dipulihkan');

  const crashPendingMsgId = 'openwa_crash_pending_001';
  mockDb.messages.push({
    id: 'db_id_crash_pending_001',
    organization_id: orgA,
    conversation_id: 'conv_crash_001',
    sender_type: 'customer',
    body: 'Kapan pendaftaran ditutup?',
    sent_at: new Date().toISOString(),
    provider_type: 'openwa',
    provider_message_id: crashPendingMsgId,
    delivery_status: 'delivered',
    ai_status: 'pending',
    ai_locked_at: null,
    created_at: new Date().toISOString(),
  });

  let sentMessages6: Array<{ to: string; text: string }> = [];
  const payload6 = {
    event: 'message.received',
    sessionId: sessionIdA,
    data: {
      id: crashPendingMsgId,
      from: '6281234567890@c.us',
      chatId: '6281234567890@c.us',
      body: 'Kapan pendaftaran ditutup?',
      fromMe: false,
    },
  };

  const res6 = await processOpenWaWebhookPayload(payload6, {
    organizationId: orgA,
    providerType: 'openwa',
    supabaseClient: mockClient,
    customSendFn: async (to, text) => {
      sentMessages6.push({ to, text });
      return { success: true, messageId: 'openwa_recovered_reply_001' };
    },
  });

  runAssert(res6.success === true && res6.status === 'processed', 'Pesan pending yang crash berhasil dipulihkan (status: processed)');
  runAssert(sentMessages6.length === 1, 'Tepat 1 balasan AI berhasil dikirim setelah pemulihan');

  // ------------------------------------------------------------------
  // SKENARIO 7: Crash Setelah Dispatch Mungkin Dimulai (ai_dispatch_started_at IS NOT NULL)
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 7] Crash Setelah Dispatch Dimulai -> Transisi Otomatis ke needs_reconciliation');

  const crashAfterDispatchId = 'db_crash_after_dispatch_001';
  const crashAfterDispatchProviderId = 'openwa_crash_after_dispatch_msg_001';
  const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();

  mockDb.messages.push({
    id: crashAfterDispatchId,
    organization_id: orgA,
    conversation_id: 'conv_crash_dispatch_001',
    sender_type: 'customer',
    body: 'Pesan yang crash saat gateway mengirim',
    sent_at: sixMinutesAgo,
    provider_type: 'openwa',
    provider_message_id: crashAfterDispatchProviderId,
    delivery_status: 'delivered',
    ai_status: 'processing',
    ai_locked_at: sixMinutesAgo,
    ai_lease_token: 'lease_crashed_worker',
    ai_dispatch_started_at: sixMinutesAgo, // Pengiriman mungkin sudah terjadi di gateway!
    created_at: sixMinutesAgo,
  });

  // Worker baru mencoba mengklaim pesan ini
  const claimCrashDispatch = await claimInboundMessageForAi(orgA, crashAfterDispatchId, 180000, mockClient);
  runAssert(claimCrashDispatch.claimed === false, 'Klaim ulang buta DITOLAK karena dispatch mungkin sudah terjadi di gateway');
  runAssert(
    claimCrashDispatch.reason === 'dispatch_in_doubt_needs_reconciliation' || claimCrashDispatch.currentStatus === 'needs_reconciliation',
    "Alasan penolakan adalah 'dispatch_in_doubt_needs_reconciliation'"
  );

  const crashDispatchRow = mockDb.messages.find((m) => m.id === crashAfterDispatchId);
  runAssert(
    crashDispatchRow?.ai_status === 'needs_reconciliation',
    "Status pesan di database otomatis dialihkan ke 'needs_reconciliation'"
  );
  runAssert(crashDispatchRow?.ai_locked_at === null, 'Lock pelepasan bersih untuk rekonsiliasi manual');

  // Webhook retry datang untuk pesan yang sama
  let retrySendCalls7 = 0;
  const res7Retry = await processOpenWaWebhookPayload(
    {
      event: 'message.received',
      sessionId: sessionIdA,
      data: {
        id: crashAfterDispatchProviderId,
        from: '6281234567890@c.us',
        chatId: '6281234567890@c.us',
        body: 'Pesan yang crash saat gateway mengirim',
        fromMe: false,
      },
    },
    {
      organizationId: orgA,
      providerType: 'openwa',
      supabaseClient: mockClient,
      customSendFn: async () => {
        retrySendCalls7++;
        return { success: true };
      },
    }
  );

  runAssert(res7Retry.status === 'duplicate', 'Retry webhook ditolak aman sebagai duplikat (status: duplicate)');
  runAssert(res7Retry.reason === 'needs_reconciliation', 'Alasan penolakan adalah needs_reconciliation');
  runAssert(retrySendCalls7 === 0, 'Gateway TIDAK dipanggil ulang secara buta');

  // ------------------------------------------------------------------
  // SKENARIO 8: Gateway Timeout / Unknown Delivery Outcome
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 8] Gateway Timeout / Status Pengiriman Tak-Tentu (Anti-Blind Retry)');

  const timeoutMsgId = 'openwa_timeout_msg_001';
  let sendAttempts8 = 0;

  await processOpenWaWebhookPayload(
    {
      event: 'message.received',
      sessionId: sessionIdA,
      data: {
        id: timeoutMsgId,
        from: '6281234567890@c.us',
        chatId: '6281234567890@c.us',
        body: 'Info syarat pendaftaran santri',
        fromMe: false,
      },
    },
    {
      organizationId: orgA,
      providerType: 'openwa',
      supabaseClient: mockClient,
      customSendFn: async () => {
        sendAttempts8++;
        return { success: false, error: 'Request timeout setelah 80ms saat menghubungi OpenWA API', errorCode: 'REQUEST_TIMEOUT' };
      },
    }
  );

  runAssert(sendAttempts8 === 1, 'Pengiriman pertama dicoba ke gateway');
  const timeoutInbound = mockDb.messages.find((m) => m.provider_message_id === timeoutMsgId);
  runAssert(
    timeoutInbound?.ai_status === 'needs_reconciliation',
    "Status pengiriman tak-tentu ditandai 'needs_reconciliation' di database"
  );

  // ------------------------------------------------------------------
  // SKENARIO 9: Multi-Tenant Isolation (Pencegahan Akses Cross-Tenant)
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 9] Isolasi Multi-Tenant Ketat (Cross-Tenant Protection)');

  const tenantMsgId = 'db_tenant_msg_org_a_001';
  mockDb.messages.push({
    id: tenantMsgId,
    organization_id: orgA,
    conversation_id: 'conv_tenant_a',
    sender_type: 'customer',
    body: 'Pesan rahasia Org A',
    sent_at: new Date().toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'openwa_tenant_a_001',
    delivery_status: 'delivered',
    ai_status: 'pending',
    ai_locked_at: null,
    created_at: new Date().toISOString(),
  });

  // Org B mencoba mengklaim pesan milik Org A
  const claimOrgB = await claimInboundMessageForAi(orgB, tenantMsgId, 180000, mockClient);
  runAssert(claimOrgB.claimed === false, 'Organisasi B DITOLAK mengklaim pesan milik Organisasi A');
  runAssert(claimOrgB.reason === 'message_not_found', 'Pesan tidak ditemukan dalam cakupan tenant Organisasi B');

  // Org B mencoba mencari balasan untuk pesan milik Org A
  const replyOrgB = await getOutboundReplyForInbound(orgB, tenantMsgId, mockClient);
  runAssert(replyOrgB === null, 'Organisasi B tidak dapat membaca relasi balasan milik Organisasi A');

  // Org B mencoba mengupdate status pesan milik Org A
  const updateOrgB = await updateInboundMessageAiStatus(orgB, tenantMsgId, 'completed', undefined, mockClient);
  runAssert(updateOrgB === false, 'Organisasi B DITOLAK mengupdate status pesan milik Organisasi A');
  const targetRowAfterOrgB = mockDb.messages.find((m) => m.id === tenantMsgId);
  runAssert(targetRowAfterOrgB?.ai_status === 'pending', 'Status pesan Org A tetap pending dan tidak terpengaruh update Org B');

  // ------------------------------------------------------------------
  // SKENARIO 10: Kompatibilitas Penuh Baileys & Meta Cloud API
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 10] Kompatibilitas Penuh Baileys & Meta Cloud API');

  const baileysInbound = await persistInboundWhatsAppMessage(
    {
      orgId: orgA,
      senderPhone: '6281122334455',
      textBody: 'Pesan dari Baileys gateway',
      providerType: 'baileys',
      messageTimestamp: Date.now(),
      providerMessageId: 'baileys_msg_test_001',
    },
    mockClient
  );
  runAssert(Boolean(baileysInbound?.messageId), 'persistInboundWhatsAppMessage menangani provider Baileys secara aman');

  const baileysOutbound = await persistOutboundWhatsAppMessage(
    orgA,
    baileysInbound!.conversationId,
    'Balasan untuk Baileys',
    'bot',
    'baileys',
    'baileys_out_test_001',
    baileysInbound!.messageId,
    mockClient
  );
  runAssert(Boolean(baileysOutbound?.messageId), 'persistOutboundWhatsAppMessage backward-compatible dengan Baileys');

  // ------------------------------------------------------------------
  // SKENARIO 11: Evaluasi Helper isUnknownDeliveryError
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 11] Deteksi Error Tak-Tentu vs Error Pasti (isUnknownDeliveryError)');

  runAssert(isUnknownDeliveryError({ success: false, errorCode: 'REQUEST_TIMEOUT' }) === true, 'REQUEST_TIMEOUT terdeteksi sebagai unknown outcome');
  runAssert(isUnknownDeliveryError({ success: false, errorCode: 504 }) === true, 'HTTP 504 Gateway Timeout terdeteksi sebagai unknown outcome');
  runAssert(isUnknownDeliveryError({ success: false, error: 'ETIMEDOUT: connection timed out' }) === true, 'ETIMEDOUT terdeteksi sebagai unknown outcome');
  runAssert(isUnknownDeliveryError({ success: false, error: 'socket hang up' }) === true, 'Socket hang up terdeteksi sebagai unknown outcome');
  runAssert(isUnknownDeliveryError({ success: false, error: 'OpenWA Bad Request (400): Session not active', errorCode: 400 }) === false, 'HTTP 400 Bad Request BUKAN unknown outcome (dapat ditandai failed)');
  // ------------------------------------------------------------------
  // SKENARIO 12: Verifikasi Eksplisit Seluruh 8 Crash Window (A - H)
  // ------------------------------------------------------------------
  console.log('\n[SKENARIO 12] Verifikasi Eksplisit Seluruh 8 Crash Window (A - H)');

  // Skenario A: Crash sebelum dispatch dicatat (ai_dispatch_started_at IS NULL)
  const crashMsgA = 'msg-crash-window-a-001';
  mockDb.messages.push({
    id: crashMsgA,
    organization_id: orgA,
    conversation_id: 'conv-crash-a',
    sender_type: 'customer',
    body: 'Pertanyaan Crash A',
    sent_at: new Date(Date.now() - 400000).toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'wa-crash-a-001',
    delivery_status: 'delivered',
    ai_status: 'processing',
    ai_locked_at: new Date(Date.now() - 400000).toISOString(),
    ai_lease_token: 'lease-crash-a-worker1',
    ai_dispatch_started_at: null, // Belum pernah dispatch
    created_at: new Date(Date.now() - 400000).toISOString(),
  });
  const claimCrashA = await claimInboundMessageForAi(orgA, crashMsgA, 180000, mockClient);
  runAssert(claimCrashA.claimed === true, 'Crash A: Pekerjaan crash sebelum dispatch berhasil diambil alih secara aman');
  runAssert(claimCrashA.leaseToken !== 'lease-crash-a-worker1', 'Crash A: Diterbitkan lease token baru untuk worker pengganti');

  // Skenario B: Crash setelah dispatch dicatat tapi sebelum request gateway dimulai
  const crashMsgB = 'msg-crash-window-b-001';
  mockDb.messages.push({
    id: crashMsgB,
    organization_id: orgA,
    conversation_id: 'conv-crash-b',
    sender_type: 'customer',
    body: 'Pertanyaan Crash B',
    sent_at: new Date(Date.now() - 400000).toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'wa-crash-b-001',
    delivery_status: 'delivered',
    ai_status: 'processing',
    ai_locked_at: new Date(Date.now() - 400000).toISOString(),
    ai_lease_token: 'lease-crash-b-worker1',
    ai_dispatch_started_at: new Date(Date.now() - 390000).toISOString(), // Sudah pernah dispatch
    created_at: new Date(Date.now() - 400000).toISOString(),
  });
  const claimCrashB = await claimInboundMessageForAi(orgA, crashMsgB, 180000, mockClient);
  runAssert(claimCrashB.claimed === false, 'Crash B: Klaim stale ditolak jika dispatch sudah pernah dimulai');
  runAssert(claimCrashB.currentStatus === 'needs_reconciliation', 'Crash B: Status atomik dialihkan ke needs_reconciliation');
  runAssert(claimCrashB.reason === 'dispatch_in_doubt_needs_reconciliation', 'Crash B: Alasan penolakan eksplisit ragu dispatch');

  // Skenario C: Crash ketika request sedang berlangsung (Network Timeout / Socket Hangup)
  const unknownErrorResult = { success: false, error: 'ETIMEDOUT: connect timed out', errorCode: 'ETIMEDOUT' };
  runAssert(isUnknownDeliveryError(unknownErrorResult) === true, 'Crash C: Error socket/in-flight terdeteksi sebagai unconfirmed outcome');

  // Skenario D: Gateway berhasil mengirim, tetapi backend crash sebelum persistensi outbound
  // Terbukti di Skenario 8 & Crash B: status terkunci dispatch_started_at mencegah balasan kedua ke customer
  const crashMsgD = 'msg-crash-window-d-001';
  mockDb.messages.push({
    id: crashMsgD,
    organization_id: orgA,
    conversation_id: 'conv-crash-d',
    sender_type: 'customer',
    body: 'Pertanyaan Crash D',
    sent_at: new Date(Date.now() - 400000).toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'wa-crash-d-001',
    delivery_status: 'delivered',
    ai_status: 'processing',
    ai_locked_at: new Date(Date.now() - 400000).toISOString(),
    ai_lease_token: 'lease-crash-d-worker1',
    ai_dispatch_started_at: new Date(Date.now() - 390000).toISOString(),
    created_at: new Date(Date.now() - 400000).toISOString(),
  });
  const claimCrashD = await claimInboundMessageForAi(orgA, crashMsgD, 180000, mockClient);
  runAssert(claimCrashD.claimed === false, 'Crash D: Anti-blind retry mencegah pengiriman kedua saat status dispatch tidak pasti');
  runAssert(claimCrashD.currentStatus === 'needs_reconciliation', 'Crash D: Beralih ke needs_reconciliation untuk audit operator');

  // Skenario E: Outbound tersimpan, tetapi update status inbound gagal
  const inboundMsgE = 'msg-crash-window-e-001';
  mockDb.messages.push({
    id: inboundMsgE,
    organization_id: orgA,
    conversation_id: 'conv-crash-e',
    sender_type: 'customer',
    body: 'Pertanyaan Crash E',
    sent_at: new Date().toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'wa-crash-e-001',
    delivery_status: 'delivered',
    ai_status: 'processing', // Tertinggal di processing karena update gagal
    ai_locked_at: new Date().toISOString(),
    ai_lease_token: 'lease-crash-e',
    ai_dispatch_started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  mockDb.messages.push({
    id: 'outbound-reply-e-001',
    organization_id: orgA,
    conversation_id: 'conv-crash-e',
    sender_type: 'bot',
    body: 'Balasan yang sudah sukses terkirim dan tersimpan',
    sent_at: new Date().toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'out-wa-e-001',
    delivery_status: 'sent',
    reply_to_message_id: inboundMsgE, // Mengikat ke pesan inbound
    created_at: new Date().toISOString(),
  });
  const existingReplyE = await getOutboundReplyForInbound(orgA, inboundMsgE, mockClient);
  runAssert(Boolean(existingReplyE && existingReplyE.id === 'outbound-reply-e-001'), 'Crash E: getOutboundReplyForInbound mendeteksi balasan yang sudah tersimpan');

  // Skenario F: Lease kedaluwarsa ketika AI masih bekerja
  const msgF = 'msg-crash-window-f-001';
  mockDb.messages.push({
    id: msgF,
    organization_id: orgA,
    conversation_id: 'conv-crash-f',
    sender_type: 'customer',
    body: 'Pertanyaan Crash F',
    sent_at: new Date(Date.now() - 400000).toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'wa-crash-f-001',
    delivery_status: 'delivered',
    ai_status: 'processing',
    ai_locked_at: new Date(Date.now() - 400000).toISOString(),
    ai_lease_token: 'lease-worker-f1-expired',
    ai_dispatch_started_at: null,
    created_at: new Date(Date.now() - 400000).toISOString(),
  });
  // Worker 2 mengambil klaim baru karena Worker 1 kedaluwarsa
  const claimF2 = await claimInboundMessageForAi(orgA, msgF, 180000, mockClient);
  runAssert(claimF2.claimed === true, 'Crash F: Worker 2 berhasil mengklaim pesan setelah lock Worker 1 kedaluwarsa');
  // Worker 1 yang terlambat mencoba menandai dispatch dengan lease lama
  const worker1DispatchF = await markInboundMessageDispatching(orgA, msgF, 'lease-worker-f1-expired', mockClient);
  runAssert(worker1DispatchF === false, 'Crash F: Worker 1 yang kedaluwarsa DITOLAK saat mencoba menandai dispatch');

  // Skenario G: Lease hilang tepat sebelum dispatch
  const markDispatchLostG = await markInboundMessageDispatching(orgA, msgF, 'lease-invalid-token-xyz', mockClient);
  runAssert(markDispatchLostG === false, 'Crash G: Pre-Dispatch check membatalkan pengiriman saat token lease tidak valid');

  // Skenario H: Dua webhook duplikat tiba bersamaan
  const msgH = 'msg-crash-window-h-001';
  mockDb.messages.push({
    id: msgH,
    organization_id: orgA,
    conversation_id: 'conv-crash-h',
    sender_type: 'customer',
    body: 'Pesan Masuk Konkuren H',
    sent_at: new Date().toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'wa-crash-h-001',
    delivery_status: 'delivered',
    ai_status: 'pending',
    created_at: new Date().toISOString(),
  });
  const [claimH1, claimH2] = await Promise.all([
    claimInboundMessageForAi(orgA, msgH, 180000, mockClient),
    claimInboundMessageForAi(orgA, msgH, 180000, mockClient),
  ]);
  const hSuccessCount = [claimH1.claimed, claimH2.claimed].filter(Boolean).length;
  runAssert(hSuccessCount === 1, 'Crash H: Tepat satu worker yang berhasil mengklaim saat dua webhook tiba bersamaan');
  const hRejected = !claimH1.claimed ? claimH1 : claimH2;
  // Verifikasi Khusus Tahap 8E: getOutboundReplyForInbound mengabaikan balasan failed
  const inboundMsgFailedReply = 'msg-inbound-with-failed-reply';
  mockDb.messages.push({
    id: inboundMsgFailedReply,
    organization_id: orgA,
    conversation_id: 'conv-failed-reply',
    sender_type: 'customer',
    body: 'Pesan Inbound',
    sent_at: new Date().toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'wa-failed-rep-001',
    delivery_status: 'delivered',
    ai_status: 'processing',
    created_at: new Date().toISOString(),
  });
  mockDb.messages.push({
    id: 'outbound-failed-reply-001',
    organization_id: orgA,
    conversation_id: 'conv-failed-reply',
    sender_type: 'bot',
    body: 'Balasan yang gagal terkirim sebelumnya',
    sent_at: new Date().toISOString(),
    provider_type: 'openwa',
    provider_message_id: 'wa-out-failed-001',
    delivery_status: 'failed', // Status GAGAL!
    reply_to_message_id: inboundMsgFailedReply,
    created_at: new Date().toISOString(),
  });
  const ignoredFailedReply = await getOutboundReplyForInbound(orgA, inboundMsgFailedReply, mockClient);
  runAssert(ignoredFailedReply === null, 'Tahap 8E: getOutboundReplyForInbound TIDAK menganggap balasan berstatus failed sebagai balasan sukses');

  console.log('\n====================================================================');
  console.log(`TOTAL PENGUJIAN SKENARIO PEMULIHAN TAHAP 8C, 8D & 8E : ${totalTests}`);
  console.log(`LULUS (PASSED)                                   : ${passedTests}`);
  console.log(`GAGAL (FAILED)                                   : ${totalTests - passedTests}`);
  console.log('====================================================================\n');
}

runAiRecoveryTests().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
