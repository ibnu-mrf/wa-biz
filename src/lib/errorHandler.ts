/**
 * =====================================================================
 * WABiz Standardized Application Error Classifier & Handler
 * =====================================================================
 * Mengklasifikasikan seluruh jenis galat (network, auth, RLS, PostgREST,
 * database PostgreSQL, worker gateway, dan business logic) ke dalam
 * kategori terstruktur dengan pesan ramah pengguna dan petunjuk tindakan jelas.
 */

export type ErrorCategory =
  | 'network'
  | 'worker_offline'
  | 'auth_expired'
  | 'rls_denied'
  | 'validation'
  | 'not_found'
  | 'duplicate'
  | 'database_unavailable'
  | 'timeout'
  | 'business_rule'
  | 'unknown';

export interface StandardAppError {
  category: ErrorCategory;
  message: string;
  actionableHint: string;
  technicalMessage: string;
}

export interface ErrorClassificationContext {
  entityName?: string;
  isWorker?: boolean;
  customActionHint?: string;
  defaultMessage?: string;
}

/**
 * Mengklasifikasi error mentah ke dalam kategori terstandar dengan pesan ramah pengguna.
 */
export function classifyAppError(
  err: unknown,
  context?: ErrorClassificationContext
): StandardAppError {
  const entity = context?.entityName || 'data';

  // Ekstraksi pesan dan kode error dari Error, string, atau PostgrestError object
  let rawMsg = '';
  let errorCode = '';

  if (err instanceof Error) {
    rawMsg = err.message;
  } else if (typeof err === 'string') {
    rawMsg = err;
  } else if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    rawMsg = typeof obj.message === 'string'
      ? obj.message
      : typeof obj.error === 'string'
      ? obj.error
      : JSON.stringify(err);
    if (typeof obj.code === 'string') {
      errorCode = obj.code;
    }
  } else {
    rawMsg = String(err || '');
  }

  const combined = `${rawMsg} ${errorCode}`.toLowerCase();
  const lower = combined;

  // 1. TIMEOUT (AbortController / Network timeout)
  if (
    lower.includes('abort') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('timed out')
  ) {
    return {
      category: 'timeout',
      message: `Permintaan memproses ${entity} melebihi batas waktu (timeout).`,
      actionableHint: context?.customActionHint || 'Server mungkin sedang sibuk. Silakan coba kembali beberapa saat lagi.',
      technicalMessage: rawMsg,
    };
  }

  // 2. ATURAN BISNIS KHUSUS (Status Kampanye Running, etc.)
  if (
    lower.includes('running') ||
    lower.includes('sedang berjalan') ||
    lower.includes('dibatalkan terlebih dahulu') ||
    lower.includes('aturan bisnis')
  ) {
    return {
      category: 'business_rule',
      message: `Kampanye yang sedang berjalan (running) tidak dapat dihapus secara langsung.`,
      actionableHint: context?.customActionHint || 'Batalkan siaran kampanye terlebih dahulu sebelum menghapusnya dari sistem.',
      technicalMessage: rawMsg,
    };
  }

  // 3. WORKER GATEWAY OFFLINE VS NETWORK ERROR UMUM
  const isWorkerTarget = Boolean(
    context?.isWorker ||
    (lower.includes('worker') && !lower.includes('networkerror')) ||
    lower.includes('4000') ||
    lower.includes('gateway')
  );

  if (
    context?.isWorker ||
    (lower.includes('worker') && !lower.includes('networkerror')) ||
    lower.includes('4000') ||
    lower.includes('gateway') ||
    lower.includes('failed to fetch') ||
    lower.includes('err_connection_refused') ||
    lower.includes('econnrefused') ||
    lower.includes('network error') ||
    lower.includes('networkerror') ||
    lower.includes('networkrequestfailed') ||
    lower.includes('tidak dapat dihubungi') ||
    lower.includes('gagal terhubung') ||
    lower.includes('koneksi internet') ||
    lower.includes('offline')
  ) {
    if (isWorkerTarget) {
      return {
        category: 'worker_offline',
        message: `Server WhatsApp Gateway offline atau tidak merespons (port 4000).`,
        actionableHint:
          context?.customActionHint ||
          "Pastikan proses worker gateway aktif di terminal ('cd server && npm start' atau 'npm run worker') untuk memproses aksi ini.",
        technicalMessage: rawMsg,
      };
    }

    return {
      category: 'network',
      message: `Koneksi internet bermasalah atau gagal terhubung ke server Supabase.`,
      actionableHint: context?.customActionHint || 'Periksa koneksi internet Anda dan muat ulang halaman.',
      technicalMessage: rawMsg,
    };
  }

  // 4. SESI AUTENTIKASI KEDALUWARSA / TIDAK TERAUTENTIKASI (401 / JWT Expired)
  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('jwt expired') ||
    lower.includes('invalid claim') ||
    lower.includes('token expired') ||
    lower.includes('session not found') ||
    lower.includes('refresh_token_not_found') ||
    (lower.includes('auth') && lower.includes('expired')) ||
    lower.includes('sesi login') ||
    lower.includes('credential')
  ) {
    return {
      category: 'auth_expired',
      message: `Sesi login Anda telah berakhir atau belum terautentikasi.`,
      actionableHint: context?.customActionHint || 'Silakan login kembali ke akun Admin Anda untuk melanjutkan operasi.',
      technicalMessage: rawMsg,
    };
  }

  // 5. ROW LEVEL SECURITY (RLS) / PERMISSION DENIED (42501)
  if (
    lower.includes('permission denied') ||
    lower.includes('policy') ||
    lower.includes('row-level security') ||
    lower.includes('42501') ||
    lower.includes('akses ditolak')
  ) {
    return {
      category: 'rls_denied',
      message: `Akses ditolak oleh kebijakan keamanan basis data (RLS).`,
      actionableHint: context?.customActionHint || 'Hanya pemilik (Owner) atau Admin organisasi yang berwenang melakukan operasi ini.',
      technicalMessage: rawMsg,
    };
  }

  // 6. DATA DUPLIKAT (23505 Unique Constraint)
  if (
    lower.includes('duplicate') ||
    lower.includes('unique') ||
    lower.includes('23505') ||
    lower.includes('already exists')
  ) {
    return {
      category: 'duplicate',
      message: `${entity.charAt(0).toUpperCase() + entity.slice(1)} ini sudah terdaftar dalam organisasi Anda.`,
      actionableHint: context?.customActionHint || 'Gunakan nama, nomor, atau email yang berbeda agar tidak terjadi duplikasi data.',
      technicalMessage: rawMsg,
    };
  }

  // 7. VALIDASI BATASAN / CHECK CONSTRAINT (23514)
  if (
    lower.includes('check constraint') ||
    lower.includes('23514') ||
    lower.includes('invalid format') ||
    lower.includes('status check') ||
    lower.includes('validation')
  ) {
    return {
      category: 'validation',
      message: `Format data ${entity} tidak memenuhi batasan basis data yang valid.`,
      actionableHint: context?.customActionHint || 'Periksa kembali kelengkapan dan format kolom input formulir Anda.',
      technicalMessage: rawMsg,
    };
  }

  // 8. DATA TIDAK DITEMUKAN / NOT FOUND (404 / PGRST116 / P0002 / 23503)
  if (
    lower.includes('404') ||
    lower.includes('pgrst116') ||
    lower.includes('p0002') ||
    lower.includes('not found') ||
    lower.includes('tidak ditemukan') ||
    lower.includes('no rows') ||
    lower.includes('foreign key') ||
    lower.includes('23503')
  ) {
    return {
      category: 'not_found',
      message: `Data ${entity} tidak ditemukan atau telah dihapus sebelumnya.`,
      actionableHint: context?.customActionHint || 'Muat ulang data untuk melihat daftar terbaru.',
      technicalMessage: rawMsg,
    };
  }

  // 9. DATABASE TIDAK TERSEDIA (503 / 500 / PostgREST)
  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('connection terminated') ||
    lower.includes('connection pool') ||
    lower.includes('pg_sleep')
  ) {
    return {
      category: 'database_unavailable',
      message: `Layanan database Supabase sedang tidak tersedia.`,
      actionableHint: context?.customActionHint || 'Tunggu beberapa saat dan muat ulang halaman.',
      technicalMessage: rawMsg,
    };
  }

  // 10. ERROR UMUM / FALLBACK
  return {
    category: 'unknown',
    message: context?.defaultMessage || rawMsg || `Terjadi kendala saat memproses ${entity}.`,
    actionableHint: context?.customActionHint || 'Silakan periksa kembali data Anda dan coba lagi.',
    technicalMessage: rawMsg,
  };
}

/**
 * Format string gabungan pesan error + petunjuk tindakan untuk UI Feedback Banner.
 */
export function formatErrorUserMessage(
  err: unknown,
  context?: ErrorClassificationContext
): string {
  const details = classifyAppError(err, context);
  if (details.actionableHint) {
    return `${details.message} ${details.actionableHint}`;
  }
  return details.message;
}
