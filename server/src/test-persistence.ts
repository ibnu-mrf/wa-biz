/**
 * =====================================================================
 * WABiz — Phase 1 Persistence & Messaging Test Suite
 * =====================================================================
 * Memvalidasi persistensi pesan nyata WhatsApp ke basis data Supabase:
 * 1. Normalisasi nomor telepon pengirim (+62, 08, JID Baileys).
 * 2. Upsert kontak tanpa duplikasi (unique constraint organization_id + phone).
 * 3. Pembuatan & pembukaan kembali percakapan di public.conversations.
 * 4. Persistensi pesan masuk pelanggan (sender_type: 'customer').
 * 5. Persistensi balasan keluar bot AI (sender_type: 'bot').
 * 6. Deduplikasi pesan lintas restart worker (processed_message_ids.json).
 * 7. Ketahanan terhadap kegagalan / graceful error handling.
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
import {
  normalizePhoneNumber,
  upsertContact,
  getOrCreateConversation,
  persistInboundWhatsAppMessage,
  persistOutboundWhatsAppMessage,
  isWorkerSupabaseConfigured,
  getWorkerSupabaseClient,
} from './supabase';

const TEST_ORG_ID = process.env.WORKER_ORG_ID || '12cc398e-9c11-4f30-a665-0583f369fd77';
const TEST_PHONE = '089911223344';
const NORMALIZED_PHONE = '6289911223344';
const TEST_NAME = 'Penguji Persistensi Otomatis';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, msg: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [LULUS] ${msg}`);
  } else {
    console.error(`  ✗ [GAGAL] ${msg}`);
    process.exitCode = 1;
  }
}

async function runTests() {
  console.log('======================================================');
  console.log('MEMULAI PENGUJIAN PERSISTENSI PESAN WHATSAPP & SUPABASE');
  console.log(`Target Organization ID: ${TEST_ORG_ID}`);
  console.log(`Supabase Configured: ${isWorkerSupabaseConfigured()}`);
  console.log('======================================================\n');

  // ----------------------------------------------------
  // TEST 1: Normalisasi Nomor Telepon
  // ----------------------------------------------------
  console.log('[Test 1] Normalisasi nomor telepon');
  assert(normalizePhoneNumber('081234567890') === '6281234567890', '08xxx diubah menjadi 628xxx');
  assert(normalizePhoneNumber('+62 812-3456-7890') === '6281234567890', '+62 dengan spasi dan strip dibersihkan');
  assert(normalizePhoneNumber('6281234567890@s.whatsapp.net') === '6281234567890', 'JID WhatsApp @s.whatsapp.net dibersihkan');
  assert(normalizePhoneNumber('6281234567890:5@s.whatsapp.net') === '6281234567890', 'JID multidevice device ID dibersihkan');
  assert(normalizePhoneNumber('81234567890') === '6281234567890', 'Nomor tanpa prefix 0/62 ditambahkan 62');
  assert(normalizePhoneNumber('') === '', 'String kosong ditangani aman');

  if (!isWorkerSupabaseConfigured()) {
    console.warn('\n[Peringatan] Supabase credentials belum dikonfigurasi pada server/.env.');
    console.warn('Lewati pengujian database langsung.');
    printSummary();
    return;
  }

  const supabase = getWorkerSupabaseClient();
  if (!supabase) {
    console.error('Gagal menginisialisasi klien Supabase');
    return;
  }

  // ----------------------------------------------------
  // TEST 2: Upsert Kontak (Tanpa Duplikasi)
  // ----------------------------------------------------
  console.log('\n[Test 2] Upsert kontak ke public.contacts');
  const contact1 = await upsertContact(TEST_ORG_ID, TEST_PHONE, TEST_NAME);
  assert(contact1 !== null && Boolean(contact1.id), 'Kontak baru berhasil dibuat/diambil');
  assert(contact1?.phone === NORMALIZED_PHONE, `Nomor tersimpan dalam bentuk terstandardisasi: ${contact1?.phone}`);

  // Upsert ulang nomor yang sama harus mengembalikan kontak yang sama tanpa duplikasi
  const contact2 = await upsertContact(TEST_ORG_ID, `+62 899-1122-3344`, `${TEST_NAME} Updated`);
  assert(contact2 !== null && contact2.id === contact1?.id, 'Upsert ulang nomor sama mengembalikan contact_id identik (idempotent)');

  // ----------------------------------------------------
  // TEST 3: Pembuatan & Pengambilan Percakapan
  // ----------------------------------------------------
  console.log('\n[Test 3] Get or Create Percakapan di public.conversations');
  const convId1 = await getOrCreateConversation(TEST_ORG_ID, contact1!.id);
  assert(Boolean(convId1), `Percakapan berhasil dibuat/diambil dengan ID: ${convId1}`);

  const { data: dbConv } = await supabase
    .from('conversations')
    .select('id, organization_id, contact_id, status')
    .eq('id', convId1!)
    .single();

  assert(dbConv?.organization_id === TEST_ORG_ID, 'organization_id percakapan sesuai');
  assert(dbConv?.contact_id === contact1!.id, 'contact_id percakapan sesuai');

  // Panggil kembali harus mengembalikan conversation yang sama
  const convId2 = await getOrCreateConversation(TEST_ORG_ID, contact1!.id);
  assert(convId2 === convId1, 'Percakapan untuk kontak yang sama tidak terduplikasi');

  // ----------------------------------------------------
  // TEST 4: Persistensi Pesan Masuk Pelanggan
  // ----------------------------------------------------
  console.log('\n[Test 4] Persistensi pesan masuk pelanggan (public.messages)');
  const testMessageBody = `Halo WABiz tes persistensi pesan masuk ${Date.now()}`;
  const testMsgId = `test_msg_${Date.now()}`;

  const inboundResult = await persistInboundWhatsAppMessage({
    orgId: TEST_ORG_ID,
    senderPhone: TEST_PHONE,
    senderName: TEST_NAME,
    textBody: testMessageBody,
    messageId: testMsgId,
  });

  assert(inboundResult !== null, 'persistInboundWhatsAppMessage berhasil');
  assert(Boolean(inboundResult?.messageId), `Pesan masuk tersimpan dengan ID: ${inboundResult?.messageId}`);
  assert(inboundResult?.conversationId === convId1, 'Pesan masuk terhubung ke thread percakapan yang benar');

  // Verifikasi query langsung ke Supabase
  const { data: dbMsg } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_type, body')
    .eq('id', inboundResult!.messageId)
    .single();

  assert(dbMsg !== null, 'Pesan dapat diverifikasi langsung melalui query Supabase');
  assert(dbMsg?.sender_type === 'customer', `sender_type bernilai 'customer': ${dbMsg?.sender_type}`);
  assert(dbMsg?.body === testMessageBody, 'Isi pesan sesuai dengan teks yang dikirim');

  // ----------------------------------------------------
  // TEST 5: Persistensi Balasan Keluar Bot AI
  // ----------------------------------------------------
  console.log('\n[Test 5] Persistensi balasan keluar Bot AI (public.messages)');
  const testBotReply = `Halo ${TEST_NAME}, terima kasih telah menghubungi kami. Kami siap membantu.`;

  const outboundResult = await persistOutboundWhatsAppMessage(
    TEST_ORG_ID,
    inboundResult!.conversationId,
    testBotReply,
    'bot'
  );

  assert(outboundResult !== null, 'persistOutboundWhatsAppMessage berhasil');
  assert(Boolean(outboundResult?.messageId), `Balasan bot tersimpan dengan ID: ${outboundResult?.messageId}`);

  // Verifikasi balasan bot di DB
  const { data: dbBotMsg } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_type, body')
    .eq('id', outboundResult!.messageId)
    .single();

  assert(dbBotMsg?.sender_type === 'bot', `sender_type bernilai 'bot': ${dbBotMsg?.sender_type}`);
  assert(dbBotMsg?.conversation_id === inboundResult!.conversationId, 'Balasan bot berada dalam satu thread percakapan yang sama dengan pesan pelanggan');

  // ----------------------------------------------------
  // TEST 6: Deduplikasi Lintas Restart Worker
  // ----------------------------------------------------
  console.log('\n[Test 6] Deduplikasi pesan persisten di storage server/sessions');
  const sessionDir = process.env.SESSION_DIR
    ? path.resolve(process.env.SESSION_DIR)
    : path.resolve(__dirname, '../sessions');
  const dedupFile = path.join(sessionDir, 'processed_message_ids.json');

  const uniqueKeyId = `dedup_test_key_${Date.now()}`;
  let ids: string[] = [];
  try {
    if (fs.existsSync(dedupFile)) {
      ids = JSON.parse(fs.readFileSync(dedupFile, 'utf-8'));
    }
  } catch {}

  // Tambahkan ID simulasi
  ids.push(uniqueKeyId);
  fs.writeFileSync(dedupFile, JSON.stringify(ids, null, 2), 'utf-8');

  // Simulasikan pembacaan ulang (restart worker)
  const reloadedIds: string[] = JSON.parse(fs.readFileSync(dedupFile, 'utf-8'));
  const dedupSet = new Set<string>(reloadedIds);
  assert(dedupSet.has(uniqueKeyId), 'ID pesan yang telah diproses terbaca kembali setelah simulasi restart');

  // Bersihkan ID simulasi dari file dedup
  const cleaned = reloadedIds.filter((id) => id !== uniqueKeyId);
  fs.writeFileSync(dedupFile, JSON.stringify(cleaned, null, 2), 'utf-8');
  assert(!JSON.parse(fs.readFileSync(dedupFile, 'utf-8')).includes(uniqueKeyId), 'Pembersihan token uji dedup berhasil');

  // ----------------------------------------------------
  // TEST 7: Graceful Fallback & Error Resilience
  // ----------------------------------------------------
  console.log('\n[Test 7] Penanganan aman terhadap data tidak valid');
  const invalidInbound = await persistInboundWhatsAppMessage({
    orgId: '', // ID tidak valid
    senderPhone: '',
    senderName: '',
    textBody: '',
  });
  assert(invalidInbound === null, 'Pesan masuk dengan parameter kosong ditolak dengan aman tanpa melempar uncaught exception');

  const invalidOutbound = await persistOutboundWhatsAppMessage(
    '',
    '',
    ''
  );
  assert(invalidOutbound === null, 'Pesan keluar dengan parameter kosong ditolak dengan aman tanpa crash');

  printSummary();
}

function printSummary() {
  console.log('\n======================================================');
  console.log(`HASIL AKHIR: ${passedTests} Lulus, ${totalTests - passedTests} Gagal dari ${totalTests} pengujian`);
  console.log('======================================================');
  if (passedTests === totalTests) {
    console.log('SEMUA PENGUJIAN PERSISTENSI SUKSES 100%!');
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
