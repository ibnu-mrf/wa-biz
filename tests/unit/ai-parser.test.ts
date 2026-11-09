import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateGeneralAiResponse } from '../../server/src/ai';

const mockProfile = {
  name: 'Pesantren Modern Anwaarnnajah',
  description: 'Lembaga pendidikan Islam modern terpadu',
  address: 'Jl. Raya Pendidikan No. 123, Sleman, Yogyakarta',
  officialEmail: 'info@anwaarnnajah.sch.id',
  officialPhone: '081234567890',
  escalationPhone: '6281234567890',
  website: 'https://anwaarnnajah.sch.id',
  googleMapsUrl: 'https://maps.google.com/?q=anwaarnnajah',
  institutionType: 'Pondok Pesantren / Madrasah',
};

const mockRules = {
  isEnabled: true,
  tone: 'formal' as const,
  language: 'id_formal' as const,
  fallbackOfferCS: true,
  autoReplyKeywords: ['biaya', 'jadwal', 'pendaftaran'],
};

const mockEscalation = {
  enabled: true,
  mode: 'instant' as const,
  afterHoursPhone: '6281234567890',
  maxUnansweredMinutes: 5,
};

describe('Unit: General Conversational AI & Linear Parsers (server/src/ai.ts)', () => {
  it('Keamanan Finansial: Menolak memberikan nomor rekening bank sembarangan', () => {
    const raw = 'Berapa nomor rekening resmi untuk pembayaran biaya pendaftaran?';
    const p = raw.toLowerCase();
    const res = generateGeneralAiResponse(raw, p, 'Anwaarnnajah', mockProfile, mockRules, mockEscalation);

    assert.equal(res.detectedIntent, 'finance_inquiry');
    assert.equal(res.isEscalated, true);
    assert.ok(res.text.includes('nomor rekening resmi pembayaran'));
    assert.ok(res.text.includes('Customer Service'));
  });

  it('Matematika: Kalkulasi persentase linier bebas ReDoS ("15% dari 1500000")', () => {
    const raw = 'Hitung 15% dari 1500000';
    const p = raw.toLowerCase();
    const res = generateGeneralAiResponse(raw, p, 'Anwaarnnajah', mockProfile, mockRules, mockEscalation);

    assert.equal(res.detectedIntent, 'math_calculation');
    assert.ok(res.text.includes('15%'));
    assert.ok(res.text.includes('Rp 1.500.000') || res.text.includes('1.500.000'));
    assert.ok(res.text.includes('225.000'));
  });

  it('Matematika: Operasi dasar aritmatika (+, -, *, /) via safe AST parser', () => {
    const raw = 'tolong hitung 25000 + 75000';
    const p = raw.toLowerCase();
    const res = generateGeneralAiResponse(raw, p, 'Anwaarnnajah', mockProfile, mockRules, mockEscalation);

    assert.equal(res.detectedIntent, 'math_calculation');
    assert.ok(res.text.includes('100.000') || res.text.includes('100000'));
  });

  it('Matematika: Akar kuadrat linier ("akar kuadrat dari 81")', () => {
    const raw = 'akar kuadrat dari 81';
    const p = raw.toLowerCase();
    const res = generateGeneralAiResponse(raw, p, 'Anwaarnnajah', mockProfile, mockRules, mockEscalation);

    assert.equal(res.detectedIntent, 'math_calculation');
    assert.ok(res.text.includes('81'));
    assert.ok(res.text.includes('9'));
  });

  it('Humor & Pantun: Menghasilkan respon humor dan pantun ceria', () => {
    const rawJoke = 'ceritakan lelucon lucu dong';
    const resJoke = generateGeneralAiResponse(rawJoke, rawJoke.toLowerCase(), 'Anwaarnnajah', mockProfile, mockRules, mockEscalation);
    assert.equal(resJoke.detectedIntent, 'humor');

    const rawPantun = 'buatkan pantun yang bagus';
    const resPantun = generateGeneralAiResponse(rawPantun, rawPantun.toLowerCase(), 'Anwaarnnajah', mockProfile, mockRules, mockEscalation);
    assert.equal(resPantun.detectedIntent, 'pantun');
  });

  it('Apresiasi & Ucapan Terima Kasih: Respon gratitude dan compliment', () => {
    const rawThanks = 'Terima kasih banyak atas bantuannya';
    const resThanks = generateGeneralAiResponse(rawThanks, rawThanks.toLowerCase(), 'Anwaarnnajah', mockProfile, mockRules, mockEscalation);
    assert.equal(resThanks.detectedIntent, 'gratitude');

    const rawSmart = 'Kamu pintar dan hebat sekali';
    const resSmart = generateGeneralAiResponse(rawSmart, rawSmart.toLowerCase(), 'Anwaarnnajah', mockProfile, mockRules, mockEscalation);
    assert.equal(resSmart.detectedIntent, 'compliment');
  });

  it('Universal Fallback: Pembersih prompt linier memproses topik umum secara terstruktur', () => {
    const raw = 'Tolong jelaskan tentang fotosintesis pada tumbuhan?';
    const p = raw.toLowerCase();
    const res = generateGeneralAiResponse(raw, p, 'Anwaarnnajah', mockProfile, mockRules, mockEscalation);

    assert.equal(res.detectedIntent, 'general_ai_assistant');
    assert.ok(res.text.includes('fotosintesis pada tumbuhan'));
    assert.ok(res.text.includes('Konsep & Esensi Pokok'));
  });
});
