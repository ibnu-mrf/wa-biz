/**
 * =====================================================================
 * WABiz: Multi-Organization & Custom Contact Labels Engine
 * =====================================================================
 * Modul terpusat untuk penanganan:
 * 1. 9 Kategori Jenis Organisasi Kanonikal + Kompatibilitas Warisan (Legacy)
 * 2. Set Label/Segmen Kontak Bawaan (Default Presets) per Sektor Industri
 * 3. Pemisahan & Penggabungan Tuple Label vs Status Kontak [label, status]
 * 4. Algoritma Pewarnaan Badge Dinamis (Hash-based Pastel Palette)
 */

export type CanonicalInstitutionType =
  | 'Pesantren'
  | 'Sekolah Islam Terpadu'
  | 'Madrasah'
  | 'UMKM / Bisnis Retail'
  | 'Properti / Kos-kosan'
  | 'Jasa / Konsultan'
  | 'Layanan Kesehatan'
  | 'Yayasan / Organisasi Umum'
  | 'Institusi Lainnya';

export type LegacyInstitutionType =
  | 'Pesantren / Islamic Boarding School'
  | 'Madrasah (MI/MTs/MA)'
  | 'Yayasan Pendidikan'
  | 'Lembaga Kursus & Pelatihan';

export type InstitutionType = CanonicalInstitutionType | LegacyInstitutionType;

export const CANONICAL_INSTITUTION_TYPES: CanonicalInstitutionType[] = [
  'Pesantren',
  'Sekolah Islam Terpadu',
  'Madrasah',
  'UMKM / Bisnis Retail',
  'Properti / Kos-kosan',
  'Jasa / Konsultan',
  'Layanan Kesehatan',
  'Yayasan / Organisasi Umum',
  'Institusi Lainnya',
];

export const ALL_INSTITUTION_TYPES: InstitutionType[] = [
  ...CANONICAL_INSTITUTION_TYPES,
  'Pesantren / Islamic Boarding School',
  'Madrasah (MI/MTs/MA)',
  'Yayasan Pendidikan',
  'Lembaga Kursus & Pelatihan',
];

export const INSTITUTION_TYPES = ALL_INSTITUTION_TYPES;

/**
 * Status tindak lanjut operasional kontak.
 * Selalu dipisahkan secara independen dari label segmen kontak.
 */
export const FOLLOW_UP_STATUSES = [
  'Belum Dihubungi',
  'Sudah Dihubungi',
  'Perlu Follow-up',
] as const;

export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export function isFollowUpStatus(val?: string | null): boolean {
  if (!val) return false;
  const normalized = val.trim().toLowerCase();
  return FOLLOW_UP_STATUSES.some((s) => s.toLowerCase() === normalized);
}

export function toCanonicalFollowUpStatus(val?: string | null): FollowUpStatus {
  if (!val) return 'Belum Dihubungi';
  const normalized = val.trim().toLowerCase();
  const matched = FOLLOW_UP_STATUSES.find((s) => s.toLowerCase() === normalized);
  return matched || 'Belum Dihubungi';
}

/**
 * Normalisasi jenis institusi tanpa mengubah paksa database.
 * Nilai legacy dipetakan secara cerdas ke tipe kanonikal untuk presentasi UI.
 */
export function normalizeInstitutionType(rawType?: string | null): CanonicalInstitutionType {
  if (!rawType) return 'Pesantren';
  const trimmed = rawType.trim();

  if (trimmed === 'Pesantren / Islamic Boarding School') return 'Pesantren';
  if (trimmed === 'Madrasah (MI/MTs/MA)') return 'Madrasah';
  if (trimmed === 'Yayasan Pendidikan') return 'Yayasan / Organisasi Umum';
  if (trimmed === 'Lembaga Kursus & Pelatihan') return 'Jasa / Konsultan';

  if (CANONICAL_INSTITUTION_TYPES.includes(trimmed as CanonicalInstitutionType)) {
    return trimmed as CanonicalInstitutionType;
  }
  return 'Institusi Lainnya';
}

/**
 * Preset label bawaan berdasarkan sektor bisnis organisasi.
 * Setiap preset selalu diakhiri dengan 'Umum' sebagai jangkar kompatibilitas.
 */
export const DEFAULT_LABELS_BY_TYPE: Record<CanonicalInstitutionType, string[]> = {
  'Pesantren': ['Calon Santri', 'Orang Tua', 'Santri Aktif', 'Alumni', 'Umum'],
  'Sekolah Islam Terpadu': ['Calon Siswa', 'Orang Tua Siswa', 'Siswa Aktif', 'Alumni', 'Umum'],
  'Madrasah': ['Calon Siswa', 'Wali Murid', 'Siswa Aktif', 'Alumni', 'Umum'],
  'UMKM / Bisnis Retail': ['Pelanggan Baru', 'Pelanggan Aktif', 'Reseller', 'Agen', 'Member VIP', 'Umum'],
  'Properti / Kos-kosan': ['Calon Penyewa', 'Penyewa Aktif', 'Menunggu Pembayaran', 'Alumni Kos', 'Umum'],
  'Jasa / Konsultan': ['Prospek Baru', 'Klien Aktif', 'Follow-up Penawaran', 'Klien Selesai', 'Umum'],
  'Layanan Kesehatan': ['Pasien Baru', 'Pasien Kontrol', 'Rawat Jalan', 'Rujukan', 'Umum'],
  'Yayasan / Organisasi Umum': ['Donatur', 'Relawan', 'Penerima Manfaat', 'Pengurus', 'Umum'],
  'Institusi Lainnya': ['Prospek', 'Klien', 'Mitra', 'VIP', 'Umum'],
};

/**
 * Mendapatkan daftar label efektif untuk sebuah organisasi.
 * Mengutamakan custom_labels jika telah dikonfigurasi;
 * jika kosong/belum ada, otomatis menggunakan preset default sesuai jenis organisasi.
 */
export function getEffectiveContactLabels(
  customLabels?: string[] | null,
  institutionType?: string | null
): string[] {
  if (Array.isArray(customLabels) && customLabels.length > 0) {
    // Sanitasi dan hilangkan duplikasi case-insensitive
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const lbl of customLabels) {
      const trimLbl = lbl.trim();
      const lower = trimLbl.toLowerCase();
      if (trimLbl && !seen.has(lower) && !isFollowUpStatus(trimLbl)) {
        seen.add(lower);
        cleaned.push(trimLbl);
      }
    }
    if (cleaned.length > 0) {
      if (!seen.has('umum')) {
        cleaned.push('Umum');
      }
      return cleaned;
    }
  }

  const canonical = normalizeInstitutionType(institutionType);
  return [...DEFAULT_LABELS_BY_TYPE[canonical]];
}

/**
 * Memecah array PostgreSQL `contacts.labels` menjadi segmen label dan status follow-up.
 * Format kontak lama menyimpan tuple: [label, status] atau variasi array string lainnya.
 * Fungsi ini menjamin status follow-up TIDAK pernah hilang atau tertimpa saat label diubah.
 */
export function parseContactLabels(
  rawLabels: string[] | null | undefined,
  effectiveLabels?: string[]
): { label: string; followUpStatus: FollowUpStatus; allLabels: string[] } {
  const allLabels = Array.isArray(rawLabels) ? rawLabels : [];

  // 1. Ekstrak status follow-up
  let followUpStatus: FollowUpStatus = 'Belum Dihubungi';
  for (const item of allLabels) {
    if (isFollowUpStatus(item)) {
      followUpStatus = toCanonicalFollowUpStatus(item);
      break;
    }
  }

  // 2. Ekstrak label segmen (elemen non-status pertama)
  let foundLabel = '';
  const candidateLabels = allLabels.filter((item) => !isFollowUpStatus(item));

  if (candidateLabels.length > 0) {
    // Jika ada daftar effectiveLabels, prioritaskan yang cocok persis
    if (effectiveLabels && effectiveLabels.length > 0) {
      const matched = candidateLabels.find((c) =>
        effectiveLabels.some((el) => el.toLowerCase() === c.toLowerCase())
      );
      foundLabel = matched || candidateLabels[0];
    } else {
      foundLabel = candidateLabels[0];
    }
  }

  if (!foundLabel) {
    foundLabel = 'Umum';
  }

  return {
    label: foundLabel,
    followUpStatus,
    allLabels,
  };
}

/**
 * Membangun array `labels` yang aman untuk disimpan ke database `contacts.labels`.
 * Menjaga integritas tuple: [labelSegmen, statusFollowUp].
 */
export function buildContactLabelsArray(
  label: string,
  followUpStatus: FollowUpStatus
): string[] {
  const cleanLabel = label.trim() || 'Umum';
  return [cleanLabel, followUpStatus];
}

/**
 * Algoritma pewarnaan badge label dinamis berbasis hash string nama label.
 * Menghasilkan tampilan pastel kontras yang estetik dan konsisten untuk label apa pun.
 */
export interface LabelColorScheme {
  bg: string;
  text: string;
  border: string;
}

export function getLabelColors(label: string, isDark: boolean = false): LabelColorScheme {
  const clean = label.trim().toLowerCase();

  // Mode Gelap (Dark Mode) - Warna tint berlatar gelap & teks kontras tinggi
  if (isDark) {
    if (clean === 'umum') {
      return { bg: 'rgba(148, 163, 184, 0.15)', text: '#CBD5E1', border: 'rgba(148, 163, 184, 0.3)' };
    }
    if (clean === 'member vip' || clean === 'vip') {
      return { bg: 'rgba(245, 158, 11, 0.18)', text: '#FCD34D', border: 'rgba(245, 158, 11, 0.35)' };
    }
    if (clean.includes('santri aktif') || clean.includes('aktif')) {
      return { bg: 'rgba(16, 185, 129, 0.18)', text: '#6EE7B7', border: 'rgba(16, 185, 129, 0.35)' };
    }
    if (clean.includes('calon')) {
      return { bg: 'rgba(59, 130, 246, 0.18)', text: '#93C5FD', border: 'rgba(59, 130, 246, 0.35)' };
    }
    if (clean.includes('reseller') || clean.includes('agen')) {
      return { bg: 'rgba(139, 92, 246, 0.18)', text: '#C4B5FD', border: 'rgba(139, 92, 246, 0.35)' };
    }

    const DARK_PALETTES: LabelColorScheme[] = [
      { bg: 'rgba(59, 130, 246, 0.18)', text: '#93C5FD', border: 'rgba(59, 130, 246, 0.35)' }, // Blue
      { bg: 'rgba(16, 185, 129, 0.18)', text: '#6EE7B7', border: 'rgba(16, 185, 129, 0.35)' }, // Emerald
      { bg: 'rgba(139, 92, 246, 0.18)', text: '#C4B5FD', border: 'rgba(139, 92, 246, 0.35)' }, // Purple
      { bg: 'rgba(245, 158, 11, 0.18)', text: '#FCD34D', border: 'rgba(245, 158, 11, 0.35)' }, // Amber
      { bg: 'rgba(244, 63, 94, 0.18)', text: '#FDA4AF', border: 'rgba(244, 63, 94, 0.35)' },   // Rose
      { bg: 'rgba(20, 184, 166, 0.18)', text: '#5EEAD4', border: 'rgba(20, 184, 166, 0.35)' }, // Teal
      { bg: 'rgba(168, 85, 247, 0.18)', text: '#D8B4FE', border: 'rgba(168, 85, 247, 0.35)' }, // Violet
      { bg: 'rgba(14, 165, 233, 0.18)', text: '#7DD3FC', border: 'rgba(14, 165, 233, 0.35)' }, // Sky
      { bg: 'rgba(148, 163, 184, 0.18)', text: '#CBD5E1', border: 'rgba(148, 163, 184, 0.35)' }, // Slate
    ];

    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
      hash = clean.charCodeAt(i) + ((hash << 5) - hash);
    }
    return DARK_PALETTES[Math.abs(hash) % DARK_PALETTES.length];
  }

  // Mode Terang (Light Mode)
  // Preset warna khusus untuk label umum tertentu
  if (clean === 'umum') {
    return { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0' };
  }
  if (clean === 'member vip' || clean === 'vip') {
    return { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' };
  }
  if (clean.includes('santri aktif') || clean.includes('aktif')) {
    return { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' };
  }
  if (clean.includes('calon')) {
    return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' };
  }
  if (clean.includes('reseller') || clean.includes('agen')) {
    return { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' };
  }

  const PALETTES: LabelColorScheme[] = [
    { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' }, // Blue
    { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' }, // Emerald
    { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' }, // Purple
    { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' }, // Amber
    { bg: '#FFF1F2', text: '#BE123C', border: '#FECDD3' }, // Rose
    { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4' }, // Teal
    { bg: '#FAF5FF', text: '#7E22CE', border: '#E9D5FF' }, // Violet
    { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD' }, // Sky
    { bg: '#F8FAFC', text: '#475569', border: '#CBD5E1' }, // Slate
  ];

  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTES[Math.abs(hash) % PALETTES.length];
}
