import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { loadProfileFromSupabase } from './supabase';
import { generateWhatsAppAiReply, getActiveProfile } from './ai';

async function runConversationalSuite() {
  console.log('====================================================');
  console.log('WABiz v1.0.6 — Natural Conversational AI Test Suite');
  console.log('====================================================\n');

  // 1. Muat profil resmi Supabase
  console.log('[Setup] Memuat profil aktif dari Supabase...');
  const loaded = await loadProfileFromSupabase();
  const profile = getActiveProfile();
  console.log(`[Setup] Profil dimuat: ${loaded ? 'BERHASIL' : 'GAGAL'} (orgName: "${profile.orgName}", tuitionInfo: "${profile.tuitionInfo}")\n`);

  const testPrompts = [
    {
      id: 1,
      prompt: 'wingi batirku malah ulih 20 ewu bang',
      expectedCriteria: 'Respons luwes/santai/Jawa, TIDAK boleh menolak/mengatakan informasi tidak tercantum di data resmi',
      forbiddenPhrases: ['informasi mengenai hal tersebut belum tercantum', 'tidak tercantum dalam data resmi', 'belum tercantum dalam data resmi'],
    },
    {
      id: 2,
      prompt: 'wkwkwk kok iso ngono',
      expectedCriteria: 'Respons santai/reaktif wajar, TIDAK boleh menolak atau menganggap tidak tercantum di data resmi',
      forbiddenPhrases: ['informasi mengenai hal tersebut belum tercantum', 'tidak tercantum dalam data resmi'],
    },
    {
      id: 3,
      prompt: 'min aku mau tanya dong',
      expectedCriteria: 'Menyambut ramah dan mempersilakan pertanyaan dengan sopan',
      forbiddenPhrases: ['informasi mengenai hal tersebut belum tercantum'],
    },
    {
      id: 4,
      prompt: 'berapa biaya pendaftaran?',
      expectedCriteria: 'Jujur bahwa biaya belum tersedia di sistem, TIDAK mengarang nominal, menawarkan kontak CS',
      checkFn: (reply: string) => {
        // Cek tidak ada nominal rupiah halusinasi (e.g. 500.000, 1.000.000, dll)
        const hasFakeNominal = /Rp\s?[\d.,]+|\b\d{2,3}\s?(ribu|jt|juta)\b/i.test(reply);
        return !hasFakeNominal;
      },
    },
    {
      id: 5,
      prompt: 'kalau belum tahu biayanya, saya harus tanya ke siapa?',
      expectedCriteria: 'Mengarahkan ke CS resmi (085841886993 / Panitia PSB)',
      checkFn: (reply: string) => {
        const lower = reply.toLowerCase();
        return lower.includes('cs') || lower.includes('customer service') || lower.includes('085841886993') || lower.includes('panitia');
      },
    },
    {
      id: 6,
      prompt: 'my friend got 20 thousand yesterday',
      expectedCriteria: 'Memahami bahasa Inggris casual, TIDAK mengatakan informasi tidak tercantum di data resmi',
      forbiddenPhrases: ['informasi mengenai hal tersebut belum tercantum', 'not listed in official records', 'tidak tercantum dalam data resmi'],
    },
    {
      id: 7,
      prompt: 'Aku durung paham syarate, iso dijelaske maneh?',
      expectedCriteria: 'Memahami bahasa Jawa tentang syarat, menjelaskan dengan ramah sesuai profil atau mengarahkan ke CS bila belum lengkap',
      forbiddenPhrases: [],
    },
  ];

  let passedCount = 0;
  const resultsSummary: any[] = [];

  for (const t of testPrompts) {
    console.log(`----------------------------------------------------`);
    console.log(`[TEST ${t.id}] Input: "${t.prompt}"`);
    console.log(`Kriteria: ${t.expectedCriteria}`);

    const res = await generateWhatsAppAiReply(t.prompt, `62812345670${t.id}`);
    console.log(`Sumber Mesin: ${res.source}`);
    console.log(`Balasan AI:\n${res.text}\n`);

    let pass = true;
    const failures: string[] = [];

    // Cek forbidden phrases
    if (t.forbiddenPhrases && Array.isArray(t.forbiddenPhrases)) {
      for (const phrase of t.forbiddenPhrases) {
        if (res.text.toLowerCase().includes(phrase.toLowerCase())) {
          pass = false;
          failures.push(`Mengandung frase terlarang: "${phrase}"`);
        }
      }
    }

    // Cek custom validation function jika ada
    if (t.checkFn && !t.checkFn(res.text)) {
      pass = false;
      failures.push('Gagal validasi kriteria khusus');
    }

    if (pass) {
      console.log(`-> HASIL: [PASS]`);
      passedCount++;
    } else {
      console.log(`-> HASIL: [FAIL] - ${failures.join(', ')}`);
    }

    resultsSummary.push({
      id: t.id,
      prompt: t.prompt,
      source: res.source,
      pass,
      replyPreview: res.text.replace(/\n+/g, ' ').slice(0, 120),
    });
  }

  console.log(`\n====================================================`);
  console.log(`RINGKASAN PENGUJIAN: ${passedCount}/${testPrompts.length} LULUS`);
  console.log(`====================================================\n`);

  if (passedCount !== testPrompts.length) {
    process.exit(1);
  }
}

runConversationalSuite().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
