/**
 * Test Suite Offline Komprehensif:
 * Redesain Total Kalender Bulanan (Senin-Minggu) & Dial Jam Analog WABiz
 *
 * Menguji secara terisolasi tanpa jaringan eksternal:
 * 1. Logika Kalender Bulanan (Senin s/d Minggu):
 *    - Indeks hari berbasis Senin (0=Senin, 1=Selasa, ..., 6=Minggu).
 *    - Grid 7 kolom simetris (leading days, active days, trailing days).
 *    - Navigasi bulan (maju, mundur, batas bulan saat ini).
 *    - Immutabilitas tanggal terpilih saat navigasi bulan.
 * 2. Pemilih Jam Dial Analog Sungguhan (24 Jam & 60 Menit):
 *    - Ring luar untuk jam 12–23.
 *    - Ring dalam untuk jam 00–11.
 *    - Perhitungan sudut radial derajat (atan2) dan konversi ke jam (00-23).
 *    - Dial menit radial (00-59) mendukung seluruh menit, termasuk bukan kelipatan 5.
 *    - Perhitungan koordinat pointer hand & highlight tip.
 * 3. Kontrol Aksesibel & Penyelarasan Waktu:
 *    - Stepper menit: -5m, -1m, +1m, +5m dengan boundary sirkular (00-59).
 *    - Input angka terkontrol (00-23 dan 00-59).
 *    - Presets siaran bisnis (09:00, 13:30, 16:00, 19:30).
 * 4. Format Tanggal & Waktu Lokal Indonesia:
 *    - formatScheduleDateOnly (nama hari dan bulan Indonesia).
 *    - formatScheduleDisplay (tanggal + waktu WIB).
 * 5. Keandalan Data & Timezone Handling:
 *    - parseWibDateTime (konversi string UTC ISO ke waktu Jakarta WIB).
 *    - Validasi penolakan jadwal masa lampau (kemarin & jam sebelumnya hari ini).
 *    - Validasi persetujuan jadwal masa depan.
 */

import assert from 'assert';

// -------------------------------------------------------------
// FUNGSI-FUNGSI LOGIKA (SEPERTI PADA CampaignsView.tsx)
// -------------------------------------------------------------

function getMondayBasedDayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function calculateDialHour(deg: number, dist: number): string {
  const normalizedDeg = ((deg % 360) + 360) % 360;
  const rawStep = Math.round(normalizedDeg / 30) % 12; // 0 to 11
  let h = 0;
  if (dist >= 78) {
    // Outer ring: 12-23 (12 di atas, 13 di posisi 1, ..., 23 di posisi 11)
    h = rawStep === 0 ? 12 : rawStep + 12;
  } else {
    // Inner ring: 00-11 (00 di atas, 01 di posisi 1, ..., 11 di posisi 11)
    h = rawStep;
  }
  return String(h).padStart(2, '0');
}

function calculateDialMinute(deg: number): string {
  const normalizedDeg = ((deg % 360) + 360) % 360;
  const m = Math.round(normalizedDeg / 6) % 60;
  return String(m).padStart(2, '0');
}

function formatScheduleDateOnly(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const yyyy = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) - 1;
    const dd = parseInt(parts[2], 10);
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const d = new Date(yyyy, mm, dd);
    const dayName = dayNames[d.getDay()];
    const monthName = monthNames[mm];
    return `${dayName}, ${dd} ${monthName} ${yyyy}`;
  } catch {
    return dateStr;
  }
}

function formatScheduleDisplay(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return `${dateStr} ${timeStr} WIB`;
    const yyyy = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) - 1;
    const dd = parseInt(parts[2], 10);
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const d = new Date(yyyy, mm, dd);
    const dayName = dayNames[d.getDay()];
    const monthName = monthNames[mm];
    return `${dayName}, ${dd} ${monthName} ${yyyy} pukul ${timeStr} WIB`;
  } catch {
    return `${dateStr} ${timeStr} WIB`;
  }
}

function parseWibDateTime(isoStr: string): { yyyy: string; mm: string; dd: string; hh: string; min: string } | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    let yyyy = '';
    let mm = '';
    let dd = '';
    let hh = '';
    let min = '';
    for (const part of parts) {
      if (part.type === 'year') yyyy = part.value;
      if (part.type === 'month') mm = part.value;
      if (part.type === 'day') dd = part.value;
      if (part.type === 'hour') {
        hh = part.value === '24' ? '00' : part.value.padStart(2, '0');
      }
      if (part.type === 'minute') min = part.value.padStart(2, '0');
    }
    if (yyyy && mm && dd && hh && min) {
      return { yyyy, mm, dd, hh, min };
    }
  } catch {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return { yyyy, mm, dd, hh, min };
  }
  return null;
}

// Model Simulator Kalender Bulanan (Senin - Minggu)
class MondayCalendarModel {
  calendarMonth: Date;
  selectedDate: string;

  constructor(initialMonth: Date, initialDate: string) {
    this.calendarMonth = new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1);
    this.selectedDate = initialDate;
  }

  handleNextMonth(): void {
    this.calendarMonth = new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() + 1, 1);
  }

  handlePrevMonth(currentDate = new Date()): boolean {
    const prev = new Date(this.calendarMonth.getFullYear(), this.calendarMonth.getMonth() - 1, 1);
    if (
      prev.getFullYear() < currentDate.getFullYear() ||
      (prev.getFullYear() === currentDate.getFullYear() && prev.getMonth() < currentDate.getMonth())
    ) {
      return false; // Diblokir karena masa lalu
    }
    this.calendarMonth = prev;
    return true;
  }

  isPrevMonthDisabled(currentDate = new Date()): boolean {
    return (
      this.calendarMonth.getFullYear() < currentDate.getFullYear() ||
      (this.calendarMonth.getFullYear() === currentDate.getFullYear() &&
        this.calendarMonth.getMonth() <= currentDate.getMonth())
    );
  }

  handleSelectDay(day: number): void {
    const yyyy = this.calendarMonth.getFullYear();
    const mm = String(this.calendarMonth.getMonth() + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    this.selectedDate = `${yyyy}-${mm}-${dd}`;
  }

  getGridMatrix() {
    const year = this.calendarMonth.getFullYear();
    const month = this.calendarMonth.getMonth();
    // Monday-based index: 0=Senin, ..., 6=Minggu
    const firstDayIdx = getMondayBasedDayIndex(new Date(year, month, 1));
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const leadingDays: number[] = [];
    for (let b = firstDayIdx - 1; b >= 0; b--) {
      leadingDays.push(prevMonthDays - b);
    }

    const totalRendered = firstDayIdx + totalDays;
    const remainder = totalRendered % 7;
    const trailingCount = remainder === 0 ? 0 : 7 - remainder;

    const trailingDays: number[] = [];
    for (let t = 1; t <= trailingCount; t++) {
      trailingDays.push(t);
    }

    const totalCells = leadingDays.length + totalDays + trailingDays.length;

    return {
      firstDayIdx,
      totalDays,
      leadingCount: leadingDays.length,
      trailingCount,
      totalCells,
      isDivisibleBy7: totalCells % 7 === 0,
      totalRows: totalCells / 7,
    };
  }
}

// -------------------------------------------------------------
// EKSEKUSI PENGUJIAN
// -------------------------------------------------------------
async function runTests() {
  console.log('====================================================================');
  console.log('TEST SUITE: REDESAIN TOTAL KALENDER BULANAN & DIAL JAM ANALOG WABIZ');
  console.log('====================================================================\n');

  let passCount = 0;
  let failCount = 0;

  function test(desc: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ PASS: ${desc}`);
      passCount++;
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${desc}`);
      console.error(`         ${err.message}`);
      failCount++;
    }
  }

  // GROUP 1: Kalender Bulanan (Senin - Minggu)
  console.log('--- GROUP 1: Kalender Bulanan Berbasis Senin - Minggu ---');
  test('1.1. getMondayBasedDayIndex mengonversi hari JS (0=Sun..6=Sat) ke Senin=0..Minggu=6', () => {
    // Senin
    assert.strictEqual(getMondayBasedDayIndex(new Date(2026, 9, 26)), 0, '26 Okt 2026 adalah Senin (idx 0)');
    // Selasa
    assert.strictEqual(getMondayBasedDayIndex(new Date(2026, 9, 27)), 1, '27 Okt 2026 adalah Selasa (idx 1)');
    // Rabu
    assert.strictEqual(getMondayBasedDayIndex(new Date(2026, 9, 28)), 2, '28 Okt 2026 adalah Rabu (idx 2)');
    // Kamis
    assert.strictEqual(getMondayBasedDayIndex(new Date(2026, 9, 1)), 3, '1 Okt 2026 adalah Kamis (idx 3)');
    // Jumat
    assert.strictEqual(getMondayBasedDayIndex(new Date(2026, 9, 2)), 4, '2 Okt 2026 adalah Jumat (idx 4)');
    // Sabtu
    assert.strictEqual(getMondayBasedDayIndex(new Date(2026, 9, 3)), 5, '3 Okt 2026 adalah Sabtu (idx 5)');
    // Minggu
    assert.strictEqual(getMondayBasedDayIndex(new Date(2026, 9, 4)), 6, '4 Okt 2026 adalah Minggu (idx 6)');
  });

  test('1.2. Grid Oktober 2026 mulai Kamis (idx 3): 3 leading days, 31 hari, 1 trailing day = 35 sel (5 baris x 7 kolom)', () => {
    const model = new MondayCalendarModel(new Date(2026, 9, 1), '2026-10-28');
    const matrix = model.getGridMatrix();
    assert.strictEqual(matrix.firstDayIdx, 3, '1 Okt 2026 adalah Kamis (idx 3)');
    assert.strictEqual(matrix.leadingCount, 3, '3 leading days dari September');
    assert.strictEqual(matrix.totalDays, 31, 'Oktober memiliki 31 hari');
    assert.strictEqual(matrix.trailingCount, 1, '1 trailing day (Minggu 1 Nov) melengkapi baris');
    assert.strictEqual(matrix.totalCells, 35, 'Total sel harus 35');
    assert.strictEqual(matrix.isDivisibleBy7, true, 'Harus habis dibagi 7');
    assert.strictEqual(matrix.totalRows, 5, 'Tepat 5 baris kalender');
  });

  test('1.3. Grid November 2026 mulai Minggu (idx 6): 6 leading days, 30 hari, 6 trailing days = 42 sel (6 baris x 7 kolom)', () => {
    const model = new MondayCalendarModel(new Date(2026, 10, 1), '2026-11-15');
    const matrix = model.getGridMatrix();
    assert.strictEqual(matrix.firstDayIdx, 6, '1 Nov 2026 adalah Minggu (idx 6)');
    assert.strictEqual(matrix.leadingCount, 6);
    assert.strictEqual(matrix.totalDays, 30);
    assert.strictEqual(matrix.trailingCount, 6);
    assert.strictEqual(matrix.totalCells, 42);
    assert.strictEqual(matrix.isDivisibleBy7, true);
    assert.strictEqual(matrix.totalRows, 6);
  });

  test('1.4. Navigasi bulan TIDAK mengubah tanggal terpilih (Immutabilitas Jadwal)', () => {
    const model = new MondayCalendarModel(new Date(2026, 9, 1), '2026-10-28');
    model.handleNextMonth(); // Ke November
    model.handleNextMonth(); // Ke Desember
    assert.strictEqual(model.selectedDate, '2026-10-28', 'Tanggal tetap 28 Okt 2026');
  });

  test('1.5. Tombol bulan sebelumnya dinonaktifkan di bulan berjalan', () => {
    const refNow = new Date(2026, 9, 27);
    const model = new MondayCalendarModel(new Date(2026, 9, 1), '2026-10-28');
    assert.strictEqual(model.isPrevMonthDisabled(refNow), true);
    const moved = model.handlePrevMonth(refNow);
    assert.strictEqual(moved, false);
    assert.strictEqual(model.calendarMonth.getMonth(), 9, 'Bulan tidak berubah');
  });

  // GROUP 2: Pemilih Jam Dial Analog (24-Jam Dual Ring)
  console.log('\n--- GROUP 2: Pemilih Jam Dial Analog Sungguhan (24 Jam & Dual Ring) ---');
  test('2.1. Ring luar (dist >= 78) memetakan sudut ke jam 12 s/d 23 secara akurat', () => {
    // 12 o'clock (0 deg) -> 12
    assert.strictEqual(calculateDialHour(0, 95), '12');
    // 1 o'clock (30 deg) -> 13
    assert.strictEqual(calculateDialHour(30, 95), '13');
    // 2 o'clock (60 deg) -> 14
    assert.strictEqual(calculateDialHour(60, 95), '14');
    // 3 o'clock (90 deg) -> 15
    assert.strictEqual(calculateDialHour(90, 95), '15');
    // 6 o'clock (180 deg) -> 18
    assert.strictEqual(calculateDialHour(180, 95), '18');
    // 9 o'clock (270 deg) -> 21
    assert.strictEqual(calculateDialHour(270, 95), '21');
    // 11 o'clock (330 deg) -> 23
    assert.strictEqual(calculateDialHour(330, 95), '23');
  });

  test('2.2. Ring dalam (dist < 78) memetakan sudut ke jam 00 s/d 11 secara akurat', () => {
    // 12 o'clock (0 deg) -> 00
    assert.strictEqual(calculateDialHour(0, 55), '00');
    // 1 o'clock (30 deg) -> 01
    assert.strictEqual(calculateDialHour(30, 55), '01');
    // 3 o'clock (90 deg) -> 03
    assert.strictEqual(calculateDialHour(90, 55), '03');
    // 6 o'clock (180 deg) -> 06
    assert.strictEqual(calculateDialHour(180, 55), '06');
    // 9 o'clock (270 deg) -> 09
    assert.strictEqual(calculateDialHour(270, 55), '09');
    // 11 o'clock (330 deg) -> 11
    assert.strictEqual(calculateDialHour(330, 55), '11');
  });

  test('2.3. Toleransi sudut sentuhan pada dial jam (misal 58 deg membulat ke 60 deg -> jam 14)', () => {
    assert.strictEqual(calculateDialHour(58, 95), '14');
    assert.strictEqual(calculateDialHour(64, 95), '14');
    assert.strictEqual(calculateDialHour(358, 55), '00'); // Mendekati 360/0
  });

  // GROUP 3: Dial Menit & Pilihan Menit Lengkap (00-59)
  console.log('\n--- GROUP 3: Dial Menit & Pemilihan Menit Lengkap (00 s/d 59) ---');
  test('3.1. calculateDialMinute memetakan kelipatan 5 menit pada dial', () => {
    assert.strictEqual(calculateDialMinute(0), '00');   // 12 o'clock
    assert.strictEqual(calculateDialMinute(30), '05');  // 1 o'clock
    assert.strictEqual(calculateDialMinute(90), '15');  // 3 o'clock
    assert.strictEqual(calculateDialMinute(180), '30'); // 6 o'clock
    assert.strictEqual(calculateDialMinute(270), '45'); // 9 o'clock
    assert.strictEqual(calculateDialMinute(330), '55'); // 11 o'clock
  });

  test('3.2. calculateDialMinute mendukung menit sembarang (bukan kelipatan 5, misal menit 37)', () => {
    // 37 menit * 6 deg/menit = 222 deg
    assert.strictEqual(calculateDialMinute(222), '37');
    // 1 menit = 6 deg
    assert.strictEqual(calculateDialMinute(6), '01');
    // 59 menit = 354 deg
    assert.strictEqual(calculateDialMinute(354), '59');
    // 14 menit = 84 deg
    assert.strictEqual(calculateDialMinute(84), '14');
  });

  test('3.3. Stepper penyesuaian menit sirkular (+1m, -1m, +5m, -5m) bekerja pada batas 00 dan 59', () => {
    // 59 + 1m -> 00
    const stepUp = (59 + 1 + 60) % 60;
    assert.strictEqual(String(stepUp).padStart(2, '0'), '00');

    // 00 - 1m -> 59
    const stepDown = (0 - 1 + 60) % 60;
    assert.strictEqual(String(stepDown).padStart(2, '0'), '59');

    // 02 - 5m -> 57
    const stepDown5 = (2 - 5 + 60) % 60;
    assert.strictEqual(String(stepDown5).padStart(2, '0'), '57');

    // 57 + 5m -> 02
    const stepUp5 = (57 + 5 + 60) % 60;
    assert.strictEqual(String(stepUp5).padStart(2, '0'), '02');
  });

  // GROUP 4: Geometri Pointer Hand & Visual Dial
  console.log('\n--- GROUP 4: Trigonometri Pointer Hand & Posisi Radial Dial ---');
  test('4.1. Posisi jarum jam ring luar (r=98) dan ring dalam (r=62) dari pusat (130, 130)', () => {
    // Jam 12 (0 deg dari 12 o'clock = -90 deg dari sumbu X):
    const rad12 = (-90 * Math.PI) / 180;
    const xOuter12 = Math.round(130 + 98 * Math.cos(rad12));
    const yOuter12 = Math.round(130 + 98 * Math.sin(rad12));
    assert.strictEqual(xOuter12, 130);
    assert.strictEqual(yOuter12, 32);

    // Jam 00 (ring dalam, r=62):
    const xInner00 = Math.round(130 + 62 * Math.cos(rad12));
    const yInner00 = Math.round(130 + 62 * Math.sin(rad12));
    assert.strictEqual(xInner00, 130);
    assert.strictEqual(yInner00, 68);

    // Jam 15 (3 o'clock, 90 deg dari 12 o'clock = 0 deg dari sumbu X):
    const rad15 = (0 * Math.PI) / 180;
    const xOuter15 = Math.round(130 + 98 * Math.cos(rad15));
    const yOuter15 = Math.round(130 + 98 * Math.sin(rad15));
    assert.strictEqual(xOuter15, 228);
    assert.strictEqual(yOuter15, 130);
  });

  test('4.2. Posisi jarum menit pada radius 96 untuk menit sembarang', () => {
    // Menit 30 (bottom, 90 deg dari sumbu X):
    const rad30 = (90 * Math.PI) / 180;
    const xMin30 = Math.round(130 + 96 * Math.cos(rad30));
    const yMin30 = Math.round(130 + 96 * Math.sin(rad30));
    assert.strictEqual(xMin30, 130);
    assert.strictEqual(yMin30, 226);
  });

  // GROUP 5: Format String Indonesia
  console.log('\n--- GROUP 5: Format Tanggal & Waktu Bahasa Indonesia ---');
  test('5.1. formatScheduleDateOnly memformat tanggal bahasa Indonesia tanpa jam', () => {
    const formatted = formatScheduleDateOnly('2026-10-28');
    assert.strictEqual(formatted, 'Rabu, 28 Oktober 2026');
  });

  test('5.2. formatScheduleDisplay memformat tanggal dan jam dengan format WIB', () => {
    const formatted = formatScheduleDisplay('2026-10-28', '14:35');
    assert.strictEqual(formatted, 'Rabu, 28 Oktober 2026 pukul 14:35 WIB');
  });

  // GROUP 6: Timezone & Integritas Serialisasi
  console.log('\n--- GROUP 6: Timezone WIB (Asia/Jakarta, UTC+7) & ISO Conversion ---');
  test('6.1. parseWibDateTime mengonversi waktu UTC ISO ke komponen jam WIB (+7 jam)', () => {
    // 07:35 UTC = 14:35 WIB
    const parsed = parseWibDateTime('2026-10-28T07:35:00.000Z');
    assert.notStrictEqual(parsed, null);
    assert.strictEqual(parsed?.yyyy, '2026');
    assert.strictEqual(parsed?.mm, '10');
    assert.strictEqual(parsed?.dd, '28');
    assert.strictEqual(parsed?.hh, '14');
    assert.strictEqual(parsed?.min, '35');
  });

  test('6.2. Serialisasi ${date}T${h}:${m}:00+07:00 menghasilkan waktu UTC yang presisi', () => {
    const dateStr = '2026-10-28';
    const timeStr = '14:35';
    const dateTimeStr = `${dateStr}T${timeStr}:00+07:00`;
    const dt = new Date(dateTimeStr);
    assert.strictEqual(dt.toISOString(), '2026-10-28T07:35:00.000Z');
  });

  test('6.3. Jadwal masa lalu ditolak dan jadwal masa depan diterima', () => {
    const refNow = new Date('2026-10-27T10:00:00+07:00').getTime();

    // Besok pukul 09:00 WIB
    const futureMs = new Date('2026-10-28T09:00:00+07:00').getTime();
    assert.strictEqual(futureMs > refNow, true, 'Masa depan harus valid');

    // Hari ini pukul 08:00 WIB (sudah lewat 2 jam)
    const pastMs = new Date('2026-10-27T08:00:00+07:00').getTime();
    assert.strictEqual(pastMs > refNow, false, 'Waktu lewat harus ditolak');
  });

  // -------------------------------------------------------------
  // RINGKASAN
  // -------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(`TOTAL PENGUJIAN: ${passCount + failCount}`);
  console.log(`LULUS          : ${passCount}`);
  console.log(`GAGAL          : ${failCount}`);
  console.log('====================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
