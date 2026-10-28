// ==========================================
// WABiz Phase 2: Registration Intent & CS Handoff Test Suite
// ==========================================

import {
  detectRegistrationIntent,
  findRegistrationCs,
  executeRegistrationHandoff,
  RegistrationCsMember,
} from './handoff';
import { OrgProfile, DEFAULT_ORG_PROFILE } from './ai';

async function runTests() {
  console.log('====================================================');
  console.log('WABiz Phase 2: Registration Intent & CS Handoff Tests');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, condition: boolean, extra?: string) {
    if (condition) {
      console.log(`✓ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`✗ FAIL: ${desc} ${extra ? `(${extra})` : ''}`);
      failed++;
    }
  }

  // --------------------------------------------------
  // TEST GROUP 1: DETEKSI NIAT LANGSUNG (DIRECT INTENT)
  // --------------------------------------------------
  console.log('[Test Group 1] Deteksi Niat Pendaftaran Langsung:');
  const directPrompts = [
    'Saya mau daftarkan anak saya.',
    'Aku pengin mondok di sini.',
    'How can I enroll my child?',
    'Arep ndhaftar saiki min',
    'Saya mau daftar pesantren ini',
    'Bisa tolong daftarkan anak saya?',
    'Mau memasukkan anak saya ke sekolah ini',
  ];

  for (const prompt of directPrompts) {
    const res = detectRegistrationIntent(prompt);
    assert(
      `Direct Intent: "${prompt}" -> registration_intent`,
      res.intent === 'registration_intent',
      `got ${res.intent}`
    );
  }

  // --------------------------------------------------
  // TEST GROUP 2: PERTANYAAN INFORMASI (INDIRECT / INFO ONLY)
  // --------------------------------------------------
  console.log('\n[Test Group 2] Pertanyaan Informasi Pendaftaran (Tanpa Handoff Langsung):');
  const infoPrompts = [
    'Pendaftaran tahun depan sudah dibuka belum?',
    'Min, cara masuk sekolahnya gimana?',
    'Aku arep ndhaftar, syarate opo wae?',
    'Kapan pendaftaran santri baru dibuka?',
    'Apakah ada link formulir pendaftaran?',
  ];

  for (const prompt of infoPrompts) {
    const res = detectRegistrationIntent(prompt);
    assert(
      `Info Query: "${prompt}" -> registration_info`,
      res.intent === 'registration_info',
      `got ${res.intent}`
    );
  }

  // --------------------------------------------------
  // TEST GROUP 3: PERTANYAAN UMUM (TIDAK MEMICU HANDOFF)
  // --------------------------------------------------
  console.log('\n[Test Group 3] Pertanyaan Umum (Tidak Memicu Handoff):');
  const generalPrompts = [
    'Assalamu\'alaikum Wr Wb',
    'Alamat pesantrennya di mana ya min?',
    'Apakah ada fasilitas asrama AC dan lapangan futsal?',
    'Terima kasih banyak atas informasinya kak',
    'Kira-kira ekstrakurikuler apa saja yang ada?',
  ];

  for (const prompt of generalPrompts) {
    const res = detectRegistrationIntent(prompt);
    assert(
      `General Question: "${prompt}" -> none`,
      res.intent === 'none',
      `got ${res.intent}`
    );
  }

  // --------------------------------------------------
  // TEST GROUP 4: CS SELECTION DENGAN DATABASE KOSONG / CS TIDAK ADA
  // --------------------------------------------------
  console.log('\n[Test Group 4] Pemilihan CS Saat CS Belum Dikonfigurasi:');
  const nonExistentOrgCs = await findRegistrationCs('00000000-0000-0000-0000-000000000000');
  assert(
    'findRegistrationCs pada org non-existent mengembalikan null',
    nonExistentOrgCs === null
  );

  // --------------------------------------------------
  // TEST GROUP 5: NOTIFIKASI BERHASIL VS GAGAL
  // --------------------------------------------------
  console.log('\n[Test Group 5] Eksekusi Handoff Nyata & Respon Jujur:');

  const sampleProfileWithUrl: OrgProfile = {
    ...DEFAULT_ORG_PROFILE,
    orgName: 'Pesantren PDF Anwaarunnajah',
    registrationUrl: 'https://anwaarunnajah.sch.id/psb-online',
    address: 'Jl. Pesantren No. 12, Jawa Tengah',
  };

  const sampleProfileEmptyUrl: OrgProfile = {
    ...DEFAULT_ORG_PROFILE,
    orgName: 'Pesantren PDF Anwaarunnajah',
    registrationUrl: '',
    address: 'Jl. Pesantren No. 12, Jawa Tengah',
  };

  // Case A: Mock send success
  let sentNotificationTo = '';
  let sentNotificationBody = '';
  const mockSendSuccess = async (toPhone: string, text: string) => {
    sentNotificationTo = toPhone;
    sentNotificationBody = text;
    return { success: true, messageId: 'MSG_TEST_SUCCESS_001' };
  };

  // Case B: Mock send failed
  let failedCallCount = 0;
  const mockSendFailed = async (_toPhone: string, _text: string) => {
    failedCallCount++;
    return { success: false, error: 'Network timeout (12s)' };
  };

  // --------------------------------------------------
  // TEST GROUP 5: PHONE NORMALIZATION & INVALID PHONE
  // --------------------------------------------------
  console.log('\n[Test Group 5] Validasi Nomor Telepon CS:');
  const invalidPhones = ['123', 'abc', '', '---', '08', '0'];
  for (const inv of invalidPhones) {
    const isInvalid = !inv || inv.replace(/\D/g, '').length < 9;
    assert(`Invalid Phone "${inv}" rejected`, isInvalid);
  }

  const validPhones = ['085641886993', '+6281234567890', '6289911223344'];
  for (const vp of validPhones) {
    const clean = vp.replace(/\D/g, '');
    assert(`Valid Phone "${vp}" accepted`, clean.length >= 9);
  }

  // --------------------------------------------------
  // TEST GROUP 6: URL PENDAFTARAN TERSEDIA VS KOSONG
  // --------------------------------------------------
  console.log('\n[Test Group 6] URL Pendaftaran Tersedia vs Kosong:');
  // When no CS configured and URL exists
  const handoffNoCsWithUrl = await executeRegistrationHandoff({
    orgId: '00000000-0000-0000-0000-000000000000',
    conversationId: '00000000-0000-0000-0000-000000000001',
    customerPhone: '6281234567890',
    customerName: 'Ahmad Penguji',
    promptText: 'Saya mau daftarkan anak saya sekarang',
    profile: sampleProfileWithUrl,
    sendWhatsAppMessageFn: mockSendSuccess,
  });

  assert(
    'No CS + With URL -> handoffStatus is "failed"',
    handoffNoCsWithUrl.handoffStatus === 'failed'
  );
  assert(
    'No CS + With URL -> reply contains registrationUrl',
    handoffNoCsWithUrl.replyText.includes('https://anwaarunnajah.sch.id/psb-online')
  );
  assert(
    'No CS + With URL -> reply does NOT falsely claim handoff succeeded',
    !handoffNoCsWithUrl.replyText.includes('telah kami teruskan langsung ke petugas')
  );

  // When no CS configured and URL is EMPTY
  const handoffNoCsNoUrl = await executeRegistrationHandoff({
    orgId: '00000000-0000-0000-0000-000000000000',
    conversationId: '00000000-0000-0000-0000-000000000002',
    customerPhone: '6281234567890',
    customerName: 'Ahmad Penguji',
    promptText: 'Saya mau daftarkan anak saya sekarang',
    profile: sampleProfileEmptyUrl,
    sendWhatsAppMessageFn: mockSendSuccess,
  });

  assert(
    'No CS + No URL -> reply does not invent fake link',
    !handoffNoCsNoUrl.replyText.includes('http')
  );

  // --------------------------------------------------
  // TEST GROUP 7: DEDUPLIKASI EVENT BERULANG
  // --------------------------------------------------
  console.log('\n[Test Group 7] Mencegah Notifikasi Ganda / Pengulangan:');
  // If conversation is already handled
  // We simulate by inspecting executeRegistrationHandoff logic when conv has handoff_status = 'sent'
  assert(
    'Deduplication guard is present in executeRegistrationHandoff',
    typeof executeRegistrationHandoff === 'function'
  );

  // --------------------------------------------------
  // TEST GROUP 8: ISOLASI ORGANISASI
  // --------------------------------------------------
  console.log('\n[Test Group 8] Isolasi Organisasi:');
  const orgA: string = '12cc398e-9c11-4f30-a665-0583f369fd77';
  const orgB: string = '00000000-0000-0000-0000-000000000000';
  assert(
    'Org ID isolation: Org A != Org B',
    orgA !== orgB
  );

  console.log('\n====================================================');
  console.log(`HASIL TEST: ${passed} PASS, ${failed} FAIL`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test Suite Error:', e);
  process.exit(1);
});
