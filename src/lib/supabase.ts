
import { createClient } from '@supabase/supabase-js';

// Konfigurasi Supabase harus berasal dari environment variable.
// Tidak ada fallback ke URL production atau placeholder key.

export const SUPABASE_PROJECT_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';

const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

export const isSupabaseConfigured = (): boolean => {
  return (
    SUPABASE_PROJECT_URL.length > 0 &&
    supabasePublishableKey.length > 0 &&
    !supabasePublishableKey.includes('placeholder') &&
    !supabasePublishableKey.includes('your_supabase') &&
    !supabasePublishableKey.includes('ISI_PUBLISHABLE_KEY') &&
    !supabasePublishableKey.includes('missing-publishable-key') &&
    !SUPABASE_PROJECT_URL.includes('unconfigured.supabase.co')
  );
};

// Client tetap dibuat dengan URL syntactically valid agar import modul tidak langsung gagal.
// Hilangkan fallback ke loopback 127.0.0.1 agar tidak dianggap sebagai backend produksi.
// Periksa isSupabaseConfigured() sebelum menjalankan operasi Supabase.
export const supabase = createClient(
  isSupabaseConfigured() ? SUPABASE_PROJECT_URL : 'https://unconfigured.supabase.co',
  isSupabaseConfigured() ? supabasePublishableKey : 'missing-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
);
