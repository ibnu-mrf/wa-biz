// ==========================================
// PENGUJIAN OTOMATIS AI CHATBOT WABIZ
// Memverifikasi bahwa:
// 1. Data contoh/dummy TIDAK muncul dalam jawaban
// 2. Fallback jujur muncul ketika data belum diisi
// 3. Sapaan & ucapan terima kasih tetap berfungsi
// 4. Multi-turn menghasilkan jawaban berbeda
// ==========================================
import { generateWhatsAppAiReply, getActiveProfile, setActiveProfile, DEFAULT_ORG_PROFILE } from './ai';
import { extractMessageText } from './whatsapp';

interface TestCase {
  question: string;
  expectedKeywords: string[];
  forbiddenKeywords?: string[];
  description: string;
}

// Data dummy yang TIDAK BOLEH muncul dalam jawaban chatbot
const FORBIDDEN_DUMMY_DATA = [
  '250.000',
  'Cisarua',
  'Darul Ulum',
  'darululum-wabiz',
  'psb.darululum-wabiz',
  '+62 812-3456-7890',
  '812-3456-7890',
  'Ustadzah Siti Aisyah',
  'info@darululum-wabiz.sch.id',
  'org_live_89127402',
  'wabiz_sec_verify',
  'gateway.wabiz.id',
  'Masjid jami',
  'poliklinik kesehatan 24 jam',
  '1.250 Santri',
  '85 Asatidz',
  'Tiket eskalasi Anda telah dibuat secara otomatis',
];

const testCases: TestCase[] = [
  {
    description: 'Skenario 1: Sapaan Awal & Salam — tetap berfungsi tanpa data dummy',
    question: 'Halo, apa kabar?',
    expectedKeywords: ['Alhamdulillah', 'kabar kami baik'],
    forbiddenKeywords: FORBIDDEN_DUMMY_DATA,
  },
  {
    description: 'Skenario 2: Biaya — fallback jujur, bukan data contoh',
    question: 'Berapa biaya formulir pendaftaran?',
    expectedKeywords: ['belum dipublikasikan', 'tidak diperkenankan'],
    forbiddenKeywords: FORBIDDEN_DUMMY_DATA,
  },
  {
    description: 'Skenario 3: Syarat — fallback jujur, bukan data contoh',
    question: 'Apa saja syarat pendaftaran?',
    expectedKeywords: ['belum dimasukkan', 'tidak diperkenankan'],
    forbiddenKeywords: FORBIDDEN_DUMMY_DATA,
  },
  {
    description: 'Skenario 4: Alamat — fallback jujur, bukan data contoh',
    question: 'Di mana lokasi lembaga?',
    expectedKeywords: ['belum dilengkapi'],
    forbiddenKeywords: FORBIDDEN_DUMMY_DATA,
  },
  {
    description: 'Skenario 5: Jadwal — fallback jujur, bukan data contoh',
    question: 'Apa jadwal pendaftarannya?',
    expectedKeywords: ['belum tercantum', 'dilarang memberikan estimasi'],
    forbiddenKeywords: FORBIDDEN_DUMMY_DATA,
  },
  {
    description: 'Skenario 6: Anti-Halusinasi Pertanyaan Asing',
    question: 'Apakah ada ekstrakurikuler renang ikan paus?',
    expectedKeywords: ['belum tercantum', 'tidak diizinkan membuat jawaban perkiraan'],
    forbiddenKeywords: FORBIDDEN_DUMMY_DATA,
  },
  {
    description: 'Skenario 7: Afirmasi / Konfirmasi — penolakan jujur saat CS belum dikonfigurasi & tanpa klaim palsu',
    question: 'Ya, tolong hubungkan',
    expectedKeywords: ['Customer Service', 'belum dicantumkan'],
    forbiddenKeywords: [
      ...FORBIDDEN_DUMMY_DATA,
      'Tiket eskalasi',
      'telah kami teruskan langsung',
      'staf kami akan segera merespons',
      '08.00 - 16.00 WIB',
    ],
  },
  {
    description: 'Skenario 8: Ucapan Terima Kasih — tetap berfungsi',
    question: 'Terima kasih banyak infonya',
    expectedKeywords: ['Sama-sama', 'Afwan', 'Wassalamu'],
    forbiddenKeywords: FORBIDDEN_DUMMY_DATA,
  },
  {
    description: 'Skenario 9: Kontak CS — tanpa nomor dummy & tanpa jam kerja buatan',
    question: 'Bagaimana cara menghubungi CS?',
    expectedKeywords: ['Customer Service', 'belum dicantumkan'],
    forbiddenKeywords: [
      ...FORBIDDEN_DUMMY_DATA,
      '08.00 - 16.00 WIB',
    ],
  },
  {
    description: 'Skenario 10: Profil/Tentang — tanpa data dummy',
    question: 'Ceritakan tentang lembaga ini',
    expectedKeywords: ['Lembaga Kami'],
    forbiddenKeywords: FORBIDDEN_DUMMY_DATA,
  },
  {
    description: 'Skenario 11: Nama Lembaga Kosong — fallback jujur tanpa mengarang identitas',
    question: 'apa nama lembaga anda?',
    expectedKeywords: ['belum dikonfigurasi', 'tidak diperkenankan'],
    forbiddenKeywords: FORBIDDEN_DUMMY_DATA,
  },
];

async function runTests() {
  console.log('======================================================');
  console.log('MEMULAI PENGUJIAN OTOMATIS ENGINE CHATBOT AI WABIZ');
  console.log('(Mode Safety: Verifikasi Data Dummy Tidak Bocor)');
  const profile = getActiveProfile();
  console.log(`Profil Lembaga: "${profile.orgName || '(belum dikonfigurasi)'}"`);
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;
  const testPhone = '6289999999999';

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    console.log(`[Test ${i + 1}/${testCases.length}] ${tc.description}`);
    console.log(`Pertanyaan : "${tc.question}"`);

    const result = await generateWhatsAppAiReply(tc.question, testPhone);
    const reply = result.text;
    console.log(`Panjang    : ${reply.length} karakter`);
    console.log(`Sumber     : ${result.source}`);

    let testPass = true;
    const errors: string[] = [];

    // Cek kata kunci yang wajib muncul
    for (const kw of tc.expectedKeywords) {
      if (!reply.toLowerCase().includes(kw.toLowerCase())) {
        testPass = false;
        errors.push(`Kata kunci wajib "${kw}" tidak ditemukan dalam jawaban.`);
      }
    }

    // Cek kata kunci yang dilarang (data dummy)
    if (tc.forbiddenKeywords) {
      for (const kw of tc.forbiddenKeywords) {
        if (reply.toLowerCase().includes(kw.toLowerCase())) {
          testPass = false;
          errors.push(`DATA DUMMY BOCOR: "${kw}" justru muncul dalam jawaban!`);
        }
      }
    }

    if (testPass) {
      console.log(`Status     : ✓ LULUS`);
      passed++;
    } else {
      console.error(`Status     : ✗ GAGAL`);
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      console.log(`Teks Balasan Aktual:\n"${reply}"`);
      failed++;
    }
    console.log('------------------------------------------------------');
  }

  // Uji multi-turn: Pastikan 3 pertanyaan berbeda menghasilkan 3 jawaban yang berbeda
  console.log('\n[Uji Multi-Turn] Mengirim 3 pesan beruntun dari nomor yang sama:');
  const q1 = await generateWhatsAppAiReply('Halo, apa kabar?', '6281111111111');
  const q2 = await generateWhatsAppAiReply('Berapa biaya formulir pendaftaran?', '6281111111111');
  const q3 = await generateWhatsAppAiReply('Apa saja syarat pendaftaran?', '6281111111111');

  if (q1.text !== q2.text && q2.text !== q3.text && q1.text !== q3.text) {
    console.log('✓ Multi-Turn Lulus: Ketiga pesan menerima jawaban yang berbeda & relevan.');
    passed++;
  } else {
    console.error('✗ Multi-Turn Gagal: Jawaban terduplikasi antar pertanyaan berbeda.');
    failed++;
  }

  // Uji tambahan: Pastikan TIDAK ada data dummy bocor di multi-turn
  const allMultiTurnText = [q1.text, q2.text, q3.text].join(' ');
  let multiTurnDummyLeak = false;
  for (const kw of FORBIDDEN_DUMMY_DATA) {
    if (allMultiTurnText.toLowerCase().includes(kw.toLowerCase())) {
      console.error(`✗ Multi-Turn: DATA DUMMY BOCOR: "${kw}"`);
      multiTurnDummyLeak = true;
    }
  }
  if (!multiTurnDummyLeak) {
    console.log('✓ Multi-Turn Safety: Tidak ada data dummy bocor di 3 jawaban.');
    passed++;
  } else {
    failed++;
  }

  // ======================================================
  // REGRESSION TESTS: PERTANYAAN NAMA LEMBAGA & PERGANTIAN PROFIL
  // ======================================================
  console.log('\n[Uji Regresi 1] Nama lembaga tersedia (PDF Anwaarunnajah):');
  setActiveProfile({
    ...DEFAULT_ORG_PROFILE,
    orgName: 'PDF Anwaarunnajah',
    shortName: 'ANWAAR',
    institutionType: 'Pesantren / Islamic Boarding School',
    officialDescription: 'Pendidikan Diniyah Formal berbasis kepesantrenan.',
    // tuitionInfo sengaja kosong
  });

  const rep1 = await generateWhatsAppAiReply('apa nama lembaga anda?', '6289999999901');
  const rep1Text = rep1.text;
  if (
    rep1Text.includes('PDF Anwaarunnajah') &&
    !rep1Text.includes('belum tercantum') &&
    !rep1Text.includes('belum dikonfigurasi')
  ) {
    console.log('✓ Regresi 1 Lulus: Menjawab dengan nama resmi dari profil aktif ("PDF Anwaarunnajah").');
    passed++;
  } else {
    console.error('✗ Regresi 1 Gagal: Jawaban tidak memuat nama resmi profil.');
    console.error(`  Teks: ${rep1Text}`);
    failed++;
  }

  console.log('\n[Uji Regresi 2] Biaya kosong pada profil PDF Anwaarunnajah — jangan mengarang nominal:');
  const rep2 = await generateWhatsAppAiReply('Berapa biaya formulir pendaftaran?', '6289999999901');
  const rep2Text = rep2.text;
  const hasFeeLeak = FORBIDDEN_DUMMY_DATA.some((kw) => rep2Text.toLowerCase().includes(kw.toLowerCase()));
  if (rep2Text.includes('belum dipublikasikan') && !hasFeeLeak) {
    console.log('✓ Regresi 2 Lulus: Biaya kosong menghasilkan fallback jujur tanpa mengarang nominal.');
    passed++;
  } else {
    console.error('✗ Regresi 2 Gagal: Terdeteksi halusinasi atau ketiadaan fallback biaya.');
    console.error(`  Teks: ${rep2Text}`);
    failed++;
  }

  console.log('\n[Uji Regresi 3] Profil organisasi diganti (Pesantren Al-Hikmah):');
  setActiveProfile({
    ...DEFAULT_ORG_PROFILE,
    orgName: 'Pesantren Al-Hikmah',
    shortName: 'ALHIKMAH',
    institutionType: 'Pesantren / Islamic Boarding School',
  });

  const rep3 = await generateWhatsAppAiReply('apa nama lembaga anda?', '6289999999902');
  const rep3Text = rep3.text;
  if (
    rep3Text.includes('Pesantren Al-Hikmah') &&
    !rep3Text.includes('PDF Anwaarunnajah') &&
    !rep3Text.includes('belum tercantum')
  ) {
    console.log('✓ Regresi 3 Lulus: Jawaban mengikuti profil baru dan tidak membocorkan data organisasi lama.');
    passed++;
  } else {
    console.error('✗ Regresi 3 Gagal: Bocor data organisasi lama atau gagal mengikuti profil baru.');
    console.error(`  Teks: ${rep3Text}`);
    failed++;
  }

  console.log('\n[Uji Regresi 4] Reset kembali ke profil default (kosong) — tidak mengarang:');
  setActiveProfile(DEFAULT_ORG_PROFILE);
  const rep4 = await generateWhatsAppAiReply('apa nama lembaga anda?', '6289999999903');
  const rep4Text = rep4.text;
  if (
    rep4Text.includes('belum dikonfigurasi') &&
    !rep4Text.includes('PDF Anwaarunnajah') &&
    !rep4Text.includes('Pesantren Al-Hikmah')
  ) {
    console.log('✓ Regresi 4 Lulus: Profil kosong menghasilkan penolakan jujur tanpa mengarang nama.');
    passed++;
  } else {
    console.error('✗ Regresi 4 Gagal: Mengarang nama atau bocor data organisasi sebelumnya.');
    console.error(`  Teks: ${rep4Text}`);
    failed++;
  }

  console.log('\n[Uji Regresi 5] Jalur Pesan WhatsApp Baileys nyata (ekstraksi payload → AI Reply):');
  setActiveProfile({
    ...DEFAULT_ORG_PROFILE,
    orgName: 'PDF Anwaarunnajah',
    shortName: 'ANWAAR',
    institutionType: 'Pesantren / Islamic Boarding School',
    officialDescription: 'Pendidikan Diniyah Formal berbasis kepesantrenan.',
  });

  const baileysCases = [
    { msg: { conversation: 'apa nama lembaga anda?' }, desc: 'Baileys raw conversation' },
    { msg: { extendedTextMessage: { text: 'apa nama lembaga anda?' } }, desc: 'Baileys extendedTextMessage' },
    { msg: { ephemeralMessage: { message: { conversation: 'apa nama lembaga anda?' } } }, desc: 'Baileys ephemeralMessage' },
  ];

  let baileysAllPass = true;
  for (const bCase of baileysCases) {
    const extracted = extractMessageText(bCase.msg);
    const reply = await generateWhatsAppAiReply(extracted, '6285641886993');
    if (!reply.text.includes('PDF Anwaarunnajah') || reply.text.includes('belum tercantum')) {
      console.error(`✗ Gagal pada bentuk ${bCase.desc}: nama tidak muncul.`);
      baileysAllPass = false;
    }
  }

  if (baileysAllPass) {
    console.log('✓ Regresi 5 Lulus: Jalur WhatsApp (extractMessageText + generateWhatsAppAiReply) berhasil menjawab PDF Anwaarunnajah.');
    passed++;
  } else {
    failed++;
  }

  console.log('\n[Uji Regresi 6] Afirmasi eskalasi CS ("Iya mau") dengan kontak terisi & csHours kosong (tanpa klaim tiket & jam fiktif):');
  setActiveProfile({
    ...DEFAULT_ORG_PROFILE,
    orgName: 'PDF Anwaarunnajah',
    shortName: 'ANWAAR',
    escalationPhone: '085841886993',
    csHours: '', // sengaja kosong seperti pada DB nyata
    operationalDays: '',
  });

  const rep6 = await generateWhatsAppAiReply('Iya mau', '6285641886993');
  const rep6Text = rep6.text;
  const rep6Forbidden = [
    'telah kami teruskan langsung',
    'staf kami akan segera merespons',
    '08.00 - 16.00 WIB',
    'Senin - Sabtu',
    'Tiket eskalasi',
  ];

  const rep6HasForbidden = rep6Forbidden.filter((w) => rep6Text.includes(w));
  const rep6HasPhone = rep6Text.includes('085841886993');
  const rep6HasLink = rep6Text.includes('https://wa.me/6285841886993');

  if (rep6HasPhone && rep6HasLink && rep6HasForbidden.length === 0) {
    console.log('✓ Regresi 6 Lulus: CS escalation jujur, nomor dan tautan wa.me diberikan tanpa klaim tiket/terusan palsu & tanpa jam kerja buatan.');
    passed++;
  } else {
    console.error('✗ Regresi 6 Gagal: Terdeteksi klaim palsu atau nomor/link wa.me tidak muncul.');
    console.error(`  HasPhone: ${rep6HasPhone}, HasLink: ${rep6HasLink}, Forbidden: ${rep6HasForbidden.join(', ')}`);
    console.error(`  Teks: ${rep6Text}`);
    failed++;
  }

  console.log('\n[Uji Regresi 7] Afirmasi eskalasi CS ("Iya mau") saat profil kosong (tanpa nomor CS):');
  setActiveProfile(DEFAULT_ORG_PROFILE);
  const rep7 = await generateWhatsAppAiReply('Iya mau', '6285641886993');
  const rep7Text = rep7.text;

  const rep7HasForbidden = rep6Forbidden.filter((w) => rep7Text.includes(w));
  const rep7HasHonestFallback = rep7Text.includes('belum dicantumkan');

  if (rep7HasHonestFallback && rep7HasForbidden.length === 0) {
    console.log('✓ Regresi 7 Lulus: Profil kosong menolak secara jujur saat CS belum terkonfigurasi tanpa klaim palsu.');
    passed++;
  } else {
    console.error('✗ Regresi 7 Gagal: Penolakan tidak jujur atau klaim palsu muncul pada profil kosong.');
    console.error(`  HonestFallback: ${rep7HasHonestFallback}, Forbidden: ${rep7HasForbidden.join(', ')}`);
    console.error(`  Teks: ${rep7Text}`);
    failed++;
  }

  // Reset profil
  setActiveProfile(DEFAULT_ORG_PROFILE);

  console.log('\n======================================================');
  console.log(`HASIL AKHIR: ${passed} Lulus, ${failed} Gagal`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
