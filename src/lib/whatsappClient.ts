/**
 * =====================================================================
 * WABiz WhatsApp Staging Client (Client-side service untuk Expo app)
 * =====================================================================
 * Menghubungkan UI React Native / Expo ke Baileys Worker Staging lokal (server/).
 * 
 * BATASAN KEAMANAN & LINGKUP:
 * - Klien ini ditujukan KHUSUS untuk pengembangan dan pengujian staging lokal (loopback).
 * - Kunci worker dibaca dari variabel lingkungan EXPO_PUBLIC_WHATSAPP_WORKER_KEY.
 * - PENTING: Pada Expo/React Native, variabel EXPO_PUBLIC_* disertakan dalam bundle klien.
 *   Oleh karena itu, kunci ini BUKAN rahasia produksi dan hanya berlaku pada lingkungan dev lokal.
 *   Pada tahap produksi (multi-tenant), komunikasi wajib melalui Supabase Edge Function terautentikasi JWT.
 */

import type { OrgProfile } from '../components/SettingsView';

export type WhatsAppConnectionStatus =
  | 'disconnected'
  | 'initiating'
  | 'qr_ready'
  | 'qr_expired'
  | 'connecting'
  | 'connected'
  | 'logged_out'
  | 'error';

export interface WhatsAppWorkerStatus {
  status: WhatsAppConnectionStatus;
  phoneNumber: string | null;
  whatsappName: string | null;
  lastQrAvailable: boolean;
  qrGeneratedAt: string | null;
  qrCount?: number;
  reconnectAttempts: number;
  lastError: string | null;
}

export interface WhatsAppQrResponse {
  success: boolean;
  status: WhatsAppConnectionStatus;
  generatedAt?: string;
  qrDataUrl?: string;
  qrCount?: number;
  ageSeconds?: number;
  isFresh?: boolean;
  help?: string;
  message?: string;
  error?: string;
  phoneNumber?: string | null;
  whatsappName?: string | null;
}

export interface WhatsAppClientResult<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Mendapatkan URL basis dari Worker Staging lokal.
 * Default: http://127.0.0.1:4000
 */
export function getWorkerBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_WHATSAPP_WORKER_URL;
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:4000';
}

/**
 * Mendapatkan kunci autentikasi lokal untuk Worker Staging.
 */
export function getWorkerApiKey(): string {
  const envKey = process.env.EXPO_PUBLIC_WHATSAPP_WORKER_KEY;
  if (envKey && envKey.trim().length > 0) {
    return envKey.trim();
  }
  return 'wabiz_staging_local_key_dev';
}

/**
 * Mengecek apakah worker service sedang aktif (Health Check - tanpa auth).
 */
export async function checkWorkerHealth(): Promise<{ ok: boolean; worker?: string; error?: string }> {
  const baseUrl = getWorkerBaseUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const json = await res.json();
      return { ok: true, worker: json.worker };
    }
    return { ok: false, error: `Worker merespons dengan HTTP ${res.status}` };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: `Koneksi timeout ke ${baseUrl} (4 detik).` };
    }
    return {
      ok: false,
      error: `Tidak dapat terhubung ke Worker Staging di ${baseUrl}. Pastikan worker sudah berjalan ('cd server && npm start').`,
    };
  }
}

/**
 * Mengambil status koneksi WhatsApp saat ini dari worker.
 */
export async function getWhatsAppStatus(): Promise<WhatsAppClientResult<WhatsAppWorkerStatus>> {
  const baseUrl = getWorkerBaseUrl();
  const apiKey = getWorkerApiKey();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${baseUrl}/api/status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-api-key': apiKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      return {
        success: false,
        error: 'Autentikasi Worker gagal (401 Unauthorized). Kunci API lokal tidak valid.',
      };
    }

    const json = await res.json();
    if (res.ok && json.success) {
      return {
        success: true,
        data: json.data,
      };
    }

    return {
      success: false,
      error: json.error || `Gagal mengambil status (HTTP ${res.status}).`,
    };
  } catch {
    return {
      success: false,
      error: `Worker tidak terjangkau di ${baseUrl}. Pastikan server Baileys aktif di terminal lokal.`,
    };
  }
}

/**
 * Mengambil data QR code aktif (data URL gambar) dari worker.
 */
export async function getWhatsAppQr(): Promise<WhatsAppQrResponse> {
  const baseUrl = getWorkerBaseUrl();
  const apiKey = getWorkerApiKey();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${baseUrl}/api/qr`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-api-key': apiKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      return {
        success: false,
        status: 'error',
        error: 'Autentikasi Worker gagal (401 Unauthorized). Kunci API lokal tidak cocok.',
      };
    }

    const json = await res.json();
    return json;
  } catch {
    return {
      success: false,
      status: 'error',
      error: `Worker tidak terjangkau di ${baseUrl}. Silakan jalankan 'cd server && npm start'.`,
    };
  }
}

/**
 * Meminta worker untuk melakukan koneksi ulang (reconnect).
 */
export async function reconnectWhatsApp(): Promise<WhatsAppClientResult> {
  const baseUrl = getWorkerBaseUrl();
  const apiKey = getWorkerApiKey();

  try {
    const res = await fetch(`${baseUrl}/api/reconnect`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, message: json.message };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return {
      success: false,
      error: `Gagal menghubungi worker di ${baseUrl}: ${(err as Error).message}`,
    };
  }
}

/**
 * Memutuskan sesi WhatsApp pada worker.
 * @param deleteSession jika true, hapus file auth state lokal di disk
 */
export async function disconnectWhatsApp(deleteSession = false): Promise<WhatsAppClientResult> {
  const baseUrl = getWorkerBaseUrl();
  const apiKey = getWorkerApiKey();

  try {
    const res = await fetch(`${baseUrl}/api/disconnect`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ deleteSession }),
    });

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, message: json.message };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return {
      success: false,
      error: `Gagal memutus sesi: ${(err as Error).message}`,
    };
  }
}


/**
 * Sinkronkan profil organisasi dari Expo (setelah simpan ke Supabase)
 * ke Worker Staging lokal, agar chatbot WhatsApp memiliki data terbaru.
 *
 * Fungsi ini dipanggil setelah admin berhasil menyimpan profil di SettingsView.
 * Kegagalan sinkronisasi tidak dianggap fatal — profil tetap tersimpan di Supabase.
 */
export async function syncProfileToWorker(
  profile: OrgProfile
): Promise<WhatsAppClientResult> {
  const baseUrl = getWorkerBaseUrl();
  const apiKey = getWorkerApiKey();

  // Konversi OrgProfile ke format lengkap yang diterima worker (server/src/ai.ts).
  // SEMUA field dikirim secara eksplisit (termasuk string kosong) agar
  // setActiveProfile() di worker melakukan replace penuh tanpa sisa field org lama.
  const workerProfile = {
    orgName: profile.orgName ?? '',
    shortName: profile.shortName ?? '',
    institutionType: profile.institutionType ?? 'Pesantren / Islamic Boarding School',
    officialDescription: profile.officialDescription ?? '',
    logoUrl: profile.logoUrl ?? '',
    studentCount: profile.studentCount ?? '',
    staffCount: profile.staffCount ?? '',
    escalationPhone: profile.escalationPhone ?? '',
    officialEmail: profile.officialEmail ?? '',
    address: profile.address ?? '',
    mapsUrl: profile.mapsUrl ?? '',
    websiteUrl: profile.websiteUrl ?? '',
    registrationUrl: profile.registrationUrl ?? '',
    infoPageUrl: profile.infoPageUrl ?? '',
    admissionSchedule: profile.admissionSchedule ?? '',
    tuitionInfo: profile.tuitionInfo ?? '',
    requirements: profile.requirements ?? '',
    admissionContact: profile.admissionContact ?? '',
    csHours: profile.csHours ?? '',
    operationalDays: profile.operationalDays ?? '',
    facilities: profile.facilities ?? '',
    faqs: profile.faqs ?? [],
    orgId: profile.orgId ?? '',
    webhookUrl: profile.webhookUrl ?? '',
    verifyToken: profile.verifyToken ?? '',
    isGatewayConnected: profile.isGatewayConnected ?? false,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${baseUrl}/api/ai/config`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ profile: workerProfile }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      return {
        success: false,
        error: 'Autentikasi Worker gagal (401). Kunci API lokal tidak valid.',
      };
    }

    const json = await res.json();
    if (res.ok && json.success) {
      return {
        success: true,
        message: 'Profil organisasi berhasil disinkronkan ke Worker WhatsApp.',
      };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        success: false,
        error: 'Timeout sinkronisasi profil ke Worker (5 detik).',
      };
    }
    return {
      success: false,
      error: `Worker tidak terjangkau di ${baseUrl}. Profil tetap tersimpan di database.`,
    };
  }
}
