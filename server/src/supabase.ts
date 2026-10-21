// ==========================================
// WABiz Worker — Koneksi Opsional ke Supabase
// ==========================================
// Digunakan HANYA untuk memuat profil organisasi saat startup worker,
// agar chatbot langsung memiliki data tanpa menunggu admin menyimpan ulang.
//
// KEAMANAN:
// - Menggunakan SUPABASE_SERVICE_ROLE_KEY (server-side only, bypass RLS).
// - Key ini TIDAK PERNAH dikirim ke klien atau disematkan di bundle Expo.
// - Jika variabel env tidak dikonfigurasi, fitur ini dilewati secara aman.
// ==========================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';
import { OrgProfile, setActiveProfile, DEFAULT_ORG_PROFILE } from './ai';

// Variabel env opsional untuk koneksi Supabase dari worker
const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

/**
 * Apakah worker memiliki konfigurasi Supabase yang valid?
 */
export function isWorkerSupabaseConfigured(): boolean {
  return (
    SUPABASE_URL.length > 0 &&
    SUPABASE_SERVICE_ROLE_KEY.length > 0 &&
    SUPABASE_URL.startsWith('http')
  );
}

/**
 * Buat Supabase client dengan service role key (bypass RLS).
 * Hanya digunakan server-side untuk membaca profil.
 */
function createWorkerSupabaseClient(): SupabaseClient | null {
  if (!isWorkerSupabaseConfigured()) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Memuat profil organisasi dari tabel `organization_profiles` di Supabase.
 *
 * KEAMANAN: `WORKER_ORG_ID` WAJIB diisi saat Supabase dikonfigurasi.
 * Tanpa ID organisasi, query TIDAK dijalankan untuk mencegah pemuatan
 * profil milik organisasi lain (cross-org leak).
 *
 * Mengembalikan true jika profil berhasil dimuat, false jika tidak.
 */
export async function loadProfileFromSupabase(): Promise<boolean> {
  const supabase = createWorkerSupabaseClient();
  if (!supabase) {
    console.log('[Supabase] Status konfigurasi: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi. Profil dimuat dari sinkronisasi Expo.');
    return false;
  }

  const targetOrgId = process.env.WORKER_ORG_ID?.trim() || '';

  // WAJIB: Tolak pemuatan jika WORKER_ORG_ID tidak diset.
  // Tanpa filter organization_id, query akan mengambil baris sembarang
  // dari seluruh tabel — risiko cross-org leak.
  if (!targetOrgId) {
    console.error('[Supabase] Status WORKER_ORG_ID: Tidak tersedia. Profil tidak dimuat untuk mencegah pemuatan data organisasi lain. Tetapkan WORKER_ORG_ID di server/.env.');
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('organization_profiles')
      .select('*')
      .eq('organization_id', targetOrgId)
      .maybeSingle();

    if (error) {
      console.error('[Supabase] Gagal memuat profil organisasi:', error.message);
      return false;
    }

    if (!data) {
      console.log('[Supabase] Status profil: Tidak ditemukan di database untuk organization_id tersebut. Chatbot menggunakan fallback aman.');
      return false;
    }

    // Map kolom database ke OrgProfile (replace penuh)
    const profile: OrgProfile = {
      orgName: data.org_name || '',
      shortName: data.short_name || '',
      institutionType: data.institution_type || DEFAULT_ORG_PROFILE.institutionType,
      officialDescription: data.official_description || '',
      logoUrl: data.logo_url || '',
      studentCount: data.student_count || '',
      staffCount: data.staff_count || '',
      escalationPhone: data.escalation_phone || '',
      officialEmail: data.official_email || '',
      address: data.address || '',
      mapsUrl: data.maps_url || '',
      websiteUrl: data.website_url || '',
      registrationUrl: data.registration_url || '',
      infoPageUrl: data.info_page_url || '',
      admissionSchedule: data.admission_schedule || '',
      tuitionInfo: data.tuition_info || '',
      requirements: data.requirements || '',
      admissionContact: data.admission_contact || '',
      csHours: data.cs_hours || '',
      operationalDays: data.operational_days || '',
      facilities: data.facilities || '',
      faqs: Array.isArray(data.faqs) ? data.faqs : [],
      orgId: data.organization_id || '',
      webhookUrl: '',
      verifyToken: '',
      isGatewayConnected: false,
    };

    setActiveProfile(profile);

    console.log(`[Supabase] Status profil: Berhasil dimuat untuk organization_id: ${data.organization_id}`);
    return true;
  } catch (err) {
    console.error('[Supabase] Exception saat memuat profil:', (err as Error).message);
    return false;
  }
}
