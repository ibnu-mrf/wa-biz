process.env.FORCE_AI_ENGINE = 'local';
// ==========================================
// PENGUJIAN OTOMATIS AI CHATBOT WABIZ
// Memverifikasi bahwa:
// 1. Data contoh/dummy TIDAK muncul dalam jawaban
// 2. Fallback jujur muncul ketika data belum diisi
// 3. Sapaan & ucapan terima kasih tetap berfungsi
// 4. Multi-turn menghasilkan jawaban berbeda
// ==========================================
import {
  generateWhatsAppAiReply,
  getActiveProfile,
  setActiveProfile,
  DEFAULT_ORG_PROFILE,
  clearConversationHistory,
  processGroundedBotReply,
  DEFAULT_RESPONSE_RULES,
  DEFAULT_INTENT_RULES,
  DEFAULT_ESCALATION_SETTINGS,
} from './ai';
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

  // Bersihkan history percakapan sebelum blok regresi eskalasi & intent biaya
  clearConversationHistory();

  console.log('\n[Uji Regresi 6] Pertanyaan "Berapa biaya pendaftaran?" saat data biaya kosong:');
  setActiveProfile({
    ...DEFAULT_ORG_PROFILE,
    orgName: 'PDF Anwaarunnajah',
    shortName: 'ANWAAR',
    escalationPhone: '085841886993',
    tuitionInfo: '', // sengaja kosong sesuai kondisi nyata
  });

  const rep6 = await generateWhatsAppAiReply('Berapa biaya pendaftaran?', '6285641886991');
  const rep6Text = rep6.text;
  const rep6Pass =
    rep6Text.includes('belum dipublikasikan') &&
    rep6Text.includes('tidak diperkenankan') &&
    rep6Text.includes('Apakah Anda ingin kami berikan kontak Customer Service') &&
    !rep6Text.includes('250.000') &&
    !rep6Text.includes('langkah demi langkah saat mengisi formulir');

  if (rep6Pass) {
    console.log('✓ Regresi 6 Lulus: Pertanyaan biaya dijawab jujur belum tersedia, tanpa nominal fiktif, menawarkan kontak CS.');
    passed++;
  } else {
    console.error('✗ Regresi 6 Gagal: Respons tidak sesuai.');
    console.error(`  Teks: ${rep6Text}`);
    failed++;
  }

  console.log('\n[Uji Regresi 7] Salah ketik bahasa Indonesia "Berapa biyaya pendaftaran?":');
  const rep7 = await generateWhatsAppAiReply('Berapa biyaya pendaftaran?', '6285641886992');
  const rep7Text = rep7.text;
  const rep7Pass =
    rep7Text.includes('belum dipublikasikan') &&
    rep7Text.includes('tidak diperkenankan') &&
    rep7Text.includes('Apakah Anda ingin kami berikan kontak Customer Service') &&
    !rep7Text.includes('langkah demi langkah saat mengisi formulir') &&
    !rep7Text.includes('250.000');

  if (rep7Pass) {
    console.log('✓ Regresi 7 Lulus: Typo "biyaya" sukses dikenali sebagai pertanyaan biaya dan menawarkan kontak CS, bukan formulir pendaftaran.');
    passed++;
  } else {
    console.error('✗ Regresi 7 Gagal: Salah ketik "biyaya" gagal dikenali atau jatuh ke alur formulir.');
    console.error(`  Teks: ${rep7Text}`);
    failed++;
  }

  console.log('\n[Uji Regresi 8] Pertanyaan SPP "Berapa SPP per bulan?":');
  const rep8 = await generateWhatsAppAiReply('Berapa SPP per bulan?', '6285641886993');
  const rep8Text = rep8.text;
  const rep8Pass =
    rep8Text.includes('belum dipublikasikan') &&
    rep8Text.includes('tidak diperkenankan') &&
    rep8Text.includes('Apakah Anda ingin kami berikan kontak Customer Service') &&
    !rep8Text.includes('Rp');

  if (rep8Pass) {
    console.log('✓ Regresi 8 Lulus: Pertanyaan SPP dikenali sebagai intent biaya tanpa mengarang angka.');
    passed++;
  } else {
    console.error('✗ Regresi 8 Gagal: SPP tidak dikenali atau nominal fiktif muncul.');
    console.error(`  Teks: ${rep8Text}`);
    failed++;
  }

  console.log('\n[Uji Regresi 9] "Iya mau" setelah menerima tawaran kontak CS (Nomor 6285641886992):');
  const rep9 = await generateWhatsAppAiReply('Iya mau', '6285641886992');
  const rep9Text = rep9.text;
  const rep9Forbidden = [
    'telah kami teruskan langsung',
    'staf kami akan segera merespons',
    '08.00 - 16.00 WIB',
    'Senin - Sabtu',
    'Tiket eskalasi',
  ];
  const rep9HasForbidden = rep9Forbidden.filter((w) => rep9Text.includes(w));
  const rep9HasPhone = rep9Text.includes('085841886993');
  const rep9HasLink = rep9Text.includes('https://wa.me/6285841886993');
  const rep9Pass = rep9HasPhone && rep9HasLink && rep9HasForbidden.length === 0 && rep9.isEscalated === true;

  if (rep9Pass) {
    console.log('✓ Regresi 9 Lulus: "Iya mau" setelah tawaran CS memberikan nomor & tautan wa.me resmi tanpa klaim tiket/jam fiktif.');
    passed++;
  } else {
    console.error('✗ Regresi 9 Gagal: Gagal eskalasi kontak atau mengandung klaim fiktif.');
    console.error(`  HasPhone: ${rep9HasPhone}, HasLink: ${rep9HasLink}, Forbidden: ${rep9HasForbidden.join(', ')}`);
    console.error(`  Teks: ${rep9Text}`);
    failed++;
  }

  console.log('\n[Uji Regresi 10] "Iya mau" tanpa konteks tawaran CS (Nomor baru 6285641886999):');
  const rep10 = await generateWhatsAppAiReply('Iya mau', '6285641886999');
  const rep10Text = rep10.text;
  const rep10Pass =
    rep10Text.includes('belum memahami konteks persetujuan Anda') &&
    !rep10Text.includes('085841886993') &&
    !rep10Text.includes('wa.me') &&
    rep10.isEscalated === false;

  if (rep10Pass) {
    console.log('✓ Regresi 10 Lulus: "Iya mau" tanpa konteks ditolak sebagai eskalasi dan meminta klarifikasi sopan.');
    passed++;
  } else {
    console.error('✗ Regresi 10 Gagal: Menyetujui eskalasi tanpa konteks atau kontak bocor tanpa tawaran.');
    console.error(`  Teks: ${rep10Text}, isEscalated: ${rep10.isEscalated}`);
    failed++;
  }

  console.log('\n[Uji Regresi 11] Profil biaya & kontak CS keduanya kosong:');
  setActiveProfile({
    ...DEFAULT_ORG_PROFILE,
    orgName: 'PDF Anwaarunnajah',
    tuitionInfo: '',
    escalationPhone: '',
  });

  const rep11 = await generateWhatsAppAiReply('Berapa biyaya pendaftaran?', '6285641886900');
  const rep11Text = rep11.text;
  const rep11Pass =
    rep11Text.includes('belum dipublikasikan') &&
    rep11Text.includes('belum dicantumkan') &&
    !rep11Text.includes('Apakah Anda ingin kami berikan kontak Customer Service') &&
    rep11.isEscalated === false;

  if (rep11Pass) {
    console.log('✓ Regresi 11 Lulus: Profil biaya & CS kosong menghasilkan penolakan jujur tanpa tawaran kontak CS fiktif.');
    passed++;
  } else {
    console.error('✗ Regresi 11 Gagal: Menawarkan CS saat kontak belum terkonfigurasi.');
    console.error(`  Teks: ${rep11Text}`);
    failed++;
  }

  // ======================================================
  // 10 SKENARIO VALIDASI PENINGKATAN AI PERCAKAPAN WABIZ
  // ======================================================
  console.log('\n======================================================');
  console.log('PENGUJIAN 10 SKENARIO PENINGKATAN AI PERCAKAPAN WABIZ');
  console.log('======================================================');

  // Siapkan profil uji komprehensif
  const richProfile = {
    ...DEFAULT_ORG_PROFILE,
    orgName: 'PDF Anwaarunnajah',
    shortName: 'PDF AN',
    institutionType: 'Pesantren / Islamic Boarding School' as const,
    officialDescription: 'Pondok Pesantren Modern dengan kurikulum terpadu salaf dan modern.',
    admissionSchedule: 'Gelombang 1: 1 November 2026 - 31 Desember 2026',
    tuitionInfo: '', // Biaya sengaja kosong untuk uji anti-halusinasi & informasi sebagian
    requirements: 'Fotokopi Akta Kelahiran, Kartu Keluarga, dan Surat Keterangan Lulus.',
    registrationUrl: 'https://psb.anwaarunnajah.com/daftar',
    address: 'Jl. Pesantren No. 12, Jawa Barat',
    mapsUrl: 'https://maps.google.com/?q=PDF+Anwaarunnajah',
    escalationPhone: '085841886993',
  };

  setActiveProfile(richProfile);
  clearConversationHistory();

  // Skenario 1: Salah Ketik & Singkatan Bahasa Indonesia
  console.log('\n[Skenario 1/10] Salah ketik & singkatan: "biyaya pendaftaran", "s.p.p. per bln", "jadwal dftr"');
  const resTypo1 = await generateWhatsAppAiReply('jadwal dftr gelombang 1', '6281110001');
  const resTypo2 = await generateWhatsAppAiReply('brp s.p.p. per bln?', '6281110002');
  const resTypo3 = await generateWhatsAppAiReply('biyaya pendaftaran brp ya?', '6281110003');

  const s1Pass =
    resTypo1.text.includes('Gelombang 1: 1 November 2026') &&
    resTypo2.text.includes('belum dipublikasikan') &&
    resTypo3.text.includes('belum dipublikasikan') &&
    !resTypo2.text.includes('Rp') &&
    !resTypo3.text.includes('Rp');

  if (s1Pass) {
    console.log('✓ Skenario 1 Lulus: Singkatan "dftr", "bln", "brp", "s.p.p.", dan typo "biyaya" sukses dipahami sesuai konteks.');
    passed++;
  } else {
    console.error('✗ Skenario 1 Gagal: Normalisasi singkatan atau penolakan nominal gagal.');
    console.error(`  Res1: ${resTypo1.text}\n  Res2: ${resTypo2.text}\n  Res3: ${resTypo3.text}`);
    failed++;
  }

  // Skenario 2: Pertanyaan Multi-Intent
  console.log('\n[Skenario 2/10] Multi-intent: "Berapa biaya pendaftarannya dan bagaimana cara daftar onlinenya?"');
  const resMulti = await generateWhatsAppAiReply(
    'Berapa biaya pendaftarannya dan bagaimana cara daftar onlinenya?',
    '6281110004'
  );
  const s2Pass =
    resMulti.text.includes('biaya pendaftaran') &&
    resMulti.text.includes('belum dipublikasikan') &&
    resMulti.text.includes('https://psb.anwaarunnajah.com/daftar') &&
    !resMulti.text.includes('Rp');

  if (s2Pass) {
    console.log('✓ Skenario 2 Lulus: Multi-intent biaya + pendaftaran online dijawab terpadu tanpa mengabaikan salah satunya.');
    passed++;
  } else {
    console.error('✗ Skenario 2 Gagal: Jawaban multi-intent tidak lengkap atau mengabaikan salah satu maksud.');
    console.error(`  Teks: ${resMulti.text}`);
    failed++;
  }

  // Skenario 3: Pertanyaan di Luar Daftar Kata Kunci (Program / Bakat)
  console.log('\n[Skenario 3/10] Pertanyaan di luar kata kunci: "Anak saya punya bakat kaligrafi dan tahfidz, apakah cocok di sini?"');
  const resTalent = await generateWhatsAppAiReply(
    'Anak saya punya bakat kaligrafi dan tahfidz, apakah cocok di sini?',
    '6281110005'
  );
  const s3Pass =
    resTalent.text.includes('belum tercantum') &&
    resTalent.text.includes('tidak diizinkan membuat jawaban perkiraan') &&
    resTalent.text.includes('Customer Service');

  if (s3Pass) {
    console.log('✓ Skenario 3 Lulus: Pertanyaan bakat/program khusus di luar data profil dijawab jujur dan diarahkan ke CS tanpa berhalusinasi.');
    passed++;
  } else {
    console.error('✗ Skenario 3 Gagal: Berhalusinasi program atau tidak mengarahkan ke CS.');
    console.error(`  Teks: ${resTalent.text}`);
    failed++;
  }

  // Skenario 4: Pesan Lanjutan yang Bergantung Konteks Percakapan
  console.log('\n[Skenario 4/10] Konteks percakapan: "iya mau" setelah tawaran kontak CS');
  // Nomor 6281110006 bertanya biaya, menerima tawaran CS
  await generateWhatsAppAiReply('Berapa biaya masuknya?', '6281110006');
  const resFollowUp = await generateWhatsAppAiReply('iya mau', '6281110006');
  const s4Pass =
    resFollowUp.text.includes('085841886993') &&
    resFollowUp.text.includes('https://wa.me/6285841886993') &&
    !resFollowUp.text.includes('Tiket eskalasi') &&
    !resFollowUp.text.includes('telah kami teruskan langsung');

  if (s4Pass) {
    console.log('✓ Skenario 4 Lulus: "iya mau" setelah tawaran CS memberikan nomor & tautan wa.me resmi secara jujur.');
    passed++;
  } else {
    console.error('✗ Skenario 4 Gagal: Konteks tindak lanjut percakapan tidak terpelihara.');
    console.error(`  Teks: ${resFollowUp.text}`);
    failed++;
  }

  // Skenario 5: Pesan Afirmatif Tanpa Konteks Tawaran
  console.log('\n[Skenario 5/10] Pesan afirmatif tanpa konteks: "iya mau" dari pengirim baru');
  const resNoContext = await generateWhatsAppAiReply('iya mau', '6281110007');
  const s5Pass =
    resNoContext.text.includes('belum memahami konteks persetujuan Anda') &&
    !resNoContext.text.includes('085841886993') &&
    !resNoContext.text.includes('wa.me');

  if (s5Pass) {
    console.log('✓ Skenario 5 Lulus: "iya mau" tanpa konteks ditolak sebagai eskalasi dan meminta klarifikasi sopan.');
    passed++;
  } else {
    console.error('✗ Skenario 5 Gagal: Eskalasi bocor tanpa konteks percakapan.');
    console.error(`  Teks: ${resNoContext.text}`);
    failed++;
  }

  // Skenario 6: Informasi Sebagian (Jadwal Ada, Biaya Kosong)
  console.log('\n[Skenario 6/10] Informasi sebagian: jadwal tersedia tapi biaya kosong');
  const resPartial = await generateWhatsAppAiReply(
    'Kapan jadwal pendaftarannya dan berapa biayanya?',
    '6281110008'
  );
  const s6Pass =
    resPartial.text.includes('Gelombang 1: 1 November 2026') &&
    resPartial.text.includes('belum dipublikasikan') &&
    !resPartial.text.includes('Rp');

  if (s6Pass) {
    console.log('✓ Skenario 6 Lulus: Bagian yang diketahui dijawab akurat, bagian yang kosong dijawab jujur tanpa mengarang.');
    passed++;
  } else {
    console.error('✗ Skenario 6 Gagal: Salah satu fakta gagal ditampilkan atau timbul halusinasi.');
    console.error(`  Teks: ${resPartial.text}`);
    failed++;
  }

  // Skenario 7: Profil Lembaga Kosong
  console.log('\n[Skenario 7/10] Profil lembaga kosong: tidak mengarang nama atau fakta apapun');
  setActiveProfile(DEFAULT_ORG_PROFILE);
  const resEmptyName = await generateWhatsAppAiReply('apa nama lembaga anda?', '6281110009');
  const resEmptyFee = await generateWhatsAppAiReply('berapa biayanya?', '6281110009');
  const s7Pass =
    resEmptyName.text.includes('belum dikonfigurasi') &&
    !resEmptyName.text.includes('PDF Anwaarunnajah') &&
    resEmptyFee.text.includes('belum dipublikasikan') &&
    !resEmptyFee.text.includes('Rp');

  if (s7Pass) {
    console.log('✓ Skenario 7 Lulus: Profil kosong tidak menyebabkan chatbot mengarang nama atau fakta fiktif.');
    passed++;
  } else {
    console.error('✗ Skenario 7 Gagal: Terjadi fabrikasi data pada profil kosong.');
    console.error(`  Name: ${resEmptyName.text}\n  Fee: ${resEmptyFee.text}`);
    failed++;
  }

  // Skenario 8: Pergantian Profil Organisasi
  console.log('\n[Skenario 8/10] Pergantian profil organisasi: tidak ada sisa data organisasi lama');
  setActiveProfile({
    ...DEFAULT_ORG_PROFILE,
    orgName: 'Pesantren Al-Hikmah Modern',
    tuitionInfo: 'SPP Bulanan Rp 500.000',
  });
  const resOrg1 = await generateWhatsAppAiReply('apa nama lembaga anda?', '6281110010');
  const resOrgFee = await generateWhatsAppAiReply('berapa biayanya?', '6281110010');

  // Ganti ke organisasi kedua dengan biaya kosong
  setActiveProfile({
    ...DEFAULT_ORG_PROFILE,
    orgName: 'Madrasah Nurul Ilmi',
    tuitionInfo: '',
  });
  const resOrg2 = await generateWhatsAppAiReply('apa nama lembaga anda?', '6281110011');
  const resOrg2Fee = await generateWhatsAppAiReply('berapa biayanya?', '6281110011');

  const s8Pass =
    resOrg1.text.includes('Pesantren Al-Hikmah Modern') &&
    resOrgFee.text.includes('Rp 500.000') &&
    resOrg2.text.includes('Madrasah Nurul Ilmi') &&
    !resOrg2.text.includes('Pesantren Al-Hikmah Modern') &&
    !resOrg2Fee.text.includes('Rp 500.000') &&
    resOrg2Fee.text.includes('belum dipublikasikan');

  if (s8Pass) {
    console.log('✓ Skenario 8 Lulus: Pergantian profil organisasi bersih total tanpa residu data organisasi lama.');
    passed++;
  } else {
    console.error('✗ Skenario 8 Gagal: Terjadi kebocoran antar profil organisasi.');
    console.error(`  Org1: ${resOrg1.text}\n  Org2: ${resOrg2.text}\n  Org2Fee: ${resOrg2Fee.text}`);
    failed++;
  }

  // Skenario 9: Graceful Fallback Saat AI / Jaringan Gagal
  console.log('\n[Skenario 9/10] Graceful fallback: kegagalan AI eksternal otomatis dialihkan ke local grounded engine');
  const originalKey = process.env.GEMINI_API_KEY;
  try {
    // Set API key yang tidak valid untuk mensimulasikan kegagalan jaringan/kunci
    process.env.GEMINI_API_KEY = 'invalid_key_simulate_failure';
    setActiveProfile(richProfile);
    const resFallback = await generateWhatsAppAiReply('apa nama lembaga anda?', '6281110012');
    const s9Pass =
      resFallback.text.includes('PDF Anwaarunnajah') &&
      resFallback.source === 'local_grounded_rules';

    if (s9Pass) {
      console.log('✓ Skenario 9 Lulus: Kegagalan AI cloud otomatis fallback ke local grounded engine tanpa melempar uncaught exception.');
      passed++;
    } else {
      console.error('✗ Skenario 9 Gagal: Fallback tidak berjalan mulus.');
      console.error(`  Teks: ${resFallback.text}, Source: ${resFallback.source}`);
      failed++;
    }
  } finally {
    process.env.GEMINI_API_KEY = originalKey;
  }

  // Skenario 10: Konsistensi Antara Simulator dan WhatsApp Worker
  console.log('\n[Skenario 10/10] Konsistensi simulator vs WhatsApp worker');
  setActiveProfile(richProfile);
  const testQuestion = 'Berapa biaya pendaftarannya dan bagaimana cara daftar onlinenya?';
  const workerReply = await generateWhatsAppAiReply(testQuestion, '6281110013');
  const directReply = processGroundedBotReply(
    testQuestion,
    getActiveProfile(),
    DEFAULT_RESPONSE_RULES,
    DEFAULT_INTENT_RULES,
    DEFAULT_ESCALATION_SETTINGS
  );

  const s10Pass =
    workerReply.text.includes('belum dipublikasikan') &&
    directReply.text.includes('belum dipublikasikan') &&
    workerReply.text.includes('https://psb.anwaarunnajah.com/daftar') &&
    directReply.text.includes('https://psb.anwaarunnajah.com/daftar') &&
    directReply.detectedIntent === 'multi_intent';

  if (s10Pass) {
    console.log('✓ Skenario 10 Lulus: Logika engine terbukti identik dan konsisten antara WhatsApp worker dan simulator.');
    passed++;
  } else {
    console.error('✗ Skenario 10 Gagal: Terdapat diskrepansi hasil antara WhatsApp worker dan simulator.');
    failed++;
  }

  // Reset profil
  setActiveProfile(DEFAULT_ORG_PROFILE);
  clearConversationHistory();

  console.log('\n======================================================');
  console.log(`HASIL AKHIR: ${passed} Lulus, ${failed} Gagal`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

void runTests();
