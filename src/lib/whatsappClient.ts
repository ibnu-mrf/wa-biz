/**
 * =====================================================================
 * WABiz WhatsApp Staging Client (Client-side service untuk Expo app)
 * =====================================================================
 * Menghubungkan UI React Native / Expo ke Baileys Worker Staging lokal (server/).
 * 
 * KEAMANAN & AUTENTIKASI (P2.4):
 * - Autentikasi ke backend worker sepenuhnya menggunakan token JWT pengguna aktif Supabase Auth
 *   melalui header 'Authorization: Bearer <jwt>' dan 'x-supabase-auth'.
 * - Kunci rahasia backend (LOCAL_API_KEY) TIDAK PERNAH disertakan atau dibaca oleh klien Expo,
 *   mencegah kebocoran kredensial ke dalam bundel publik aplikasi.
 */

import type { OrgProfile } from '../components/SettingsView';
import { supabase } from './supabase';

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
  qrDataUrl?: string | null;
  countdownSeconds?: number;
}

export interface WhatsAppQrResponse {
  success: boolean;
  status: WhatsAppConnectionStatus;
  generatedAt?: string;
  qrDataUrl?: string;
  qrCount?: number;
  ageSeconds?: number;
  countdownSeconds?: number;
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
 * Mendapatkan URL basis dari Worker Staging WhatsApp.
 * Menghilangkan silent fallback 127.0.0.1 pada browser web non-localhost dan HTTPS
 * agar request dari HP Android / web deployment tidak memanggil loopback lokal di perangkat klien.
 */
export function getWorkerBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_WHATSAPP_WORKER_URL;
  if (!envUrl || envUrl.trim().length === 0) {
    // Hanya izinkan fallback lokal jika secara eksplisit berjalan di browser dev server localhost HTTP
    if (
      typeof window !== 'undefined' &&
      window.location &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      window.location.protocol === 'http:'
    ) {
      return 'http://127.0.0.1:4000';
    }
    return '';
  }

  const trimmed = envUrl.trim().replace(/\/+$/, '');

  // Jika bundle dijalankan di browser web non-localhost atau HTTPS, URL loopback tidak valid
  if (typeof window !== 'undefined' && window.location) {
    const isHttps = window.location.protocol === 'https:';
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isLoopbackWorker = trimmed.includes('127.0.0.1') || trimmed.includes('localhost');

    if ((isHttps || !isLocalHost) && isLoopbackWorker) {
      // Hindari mixed-content atau koneksi ke loopback internal ponsel
      return '';
    }
  }

  return trimmed;
}

/**
 * Memeriksa apakah backend worker telah terkonfigurasi dengan URL yang valid.
 */
export function isWorkerConfigured(): boolean {
  return getWorkerBaseUrl().length > 0;
}

/**
 * Format pesan error ramah pengguna saat request ke backend worker gagal.
 */
export function formatWorkerFetchError(err: any, baseUrlOrAction: string, optionalActionDesc?: string): string {
  const isTwoArgs = optionalActionDesc === undefined;
  const baseUrl = isTwoArgs ? (getWorkerBaseUrl() || 'http://127.0.0.1:4000') : baseUrlOrAction;
  const actionDesc = isTwoArgs ? baseUrlOrAction : optionalActionDesc;

  if (err?.name === 'AbortError') {
    return `Koneksi timeout ke WhatsApp Gateway Worker (${baseUrl}).`;
  }
  const msg = String(err?.message || err);
  const isFetchFailure =
    err?.name === 'TypeError' ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('connection refused') ||
    msg.includes('ECONNREFUSED');

  if (isFetchFailure) {
    return `Server worker gateway WhatsApp offline (${baseUrl}, port 4000). Pastikan proses worker aktif di terminal ('cd server && npm start' atau 'npm run worker') untuk ${actionDesc}.`;
  }
  return `Gagal ${actionDesc}: ${msg}`;
}

/**
 * Mendapatkan kunci autentikasi lokal untuk Worker Staging.
 * @deprecated Sesuai perbaikan P2.4, frontend tidak lagi menggunakan atau membaca kunci rahasia lokal.
 * Fungsi ini dipertahankan hanya sebagai stub kosong untuk kompatibilitas ke belakang.
 */
export function getWorkerApiKey(): string {
  return '';
}

/**
 * Menghasilkan header otentikasi untuk request ke Worker Staging.
 * Menggunakan token JWT pengguna aktif Supabase Auth (Authorization: Bearer <token> & x-supabase-auth).
 * Tidak lagi menyertakan header x-api-key demi keamanan bundel klien (P2.4).
 */
export async function getWorkerAuthHeaders(includeContentType = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers['x-supabase-auth'] = token;
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Abaikan jika supabase offline
  }

  return headers;
}

/**
 * Mengecek apakah worker service sedang aktif (Health Check - tanpa auth).
 */
export async function checkWorkerHealth(): Promise<{ ok: boolean; worker?: string; error?: string }> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      ok: false,
      error: 'Worker WhatsApp belum dikonfigurasi (memerlukan URL publik atau server lokal yang aktif).',
    };
  }
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
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker WhatsApp belum dikonfigurasi.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const headers = await getWorkerAuthHeaders(false);

    const res = await fetch(`${baseUrl}/api/status`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      return {
        success: false,
        error: 'Autentikasi Worker gagal (401 Unauthorized). Sesi login Supabase tidak valid atau telah kedaluwarsa.',
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
  if (!baseUrl) {
    return {
      success: false,
      status: 'error',
      error: 'Worker WhatsApp belum dikonfigurasi.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const headers = await getWorkerAuthHeaders(false);

    const res = await fetch(`${baseUrl}/api/qr`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      return {
        success: false,
        status: 'error',
        error: 'Autentikasi Worker gagal (401 Unauthorized). Sesi login Supabase tidak valid atau tidak memiliki hak akses.',
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
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker WhatsApp belum dikonfigurasi.',
    };
  }

  try {
    const headers = await getWorkerAuthHeaders(true);
    const res = await fetch(`${baseUrl}/api/reconnect`, {
      method: 'POST',
      headers,
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

export type LinkedDeviceRevocationStatus =
  | 'confirmed'
  | 'unverified_socket_offline'
  | 'unverified_timeout'
  | 'unverified_error'
  | 'skipped';

export interface DisconnectResult {
  success: boolean;
  socketClosed: boolean;
  localSessionDeleted: boolean;
  deletedFilesCount: number;
  revocationStatus: LinkedDeviceRevocationStatus;
  message: string;
}

/**
 * Memutuskan sesi WhatsApp pada worker dan menghapus kredensial autentikasi.
 * @param deleteSession secara default true agar seluruh berkas kredensial sesi lokal dimusnahkan
 */
export async function disconnectWhatsApp(deleteSession = true): Promise<WhatsAppClientResult<DisconnectResult>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker WhatsApp belum dikonfigurasi.',
    };
  }

  try {
    const headers = await getWorkerAuthHeaders(true);
    // Jika deleteSession = true, prioritaskan endpoint /api/logout
    const endpoint = deleteSession ? `${baseUrl}/api/logout` : `${baseUrl}/api/disconnect`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ deleteSession }),
    });

    const json = await res.json();

    // Sinkronisasi status di database Supabase klien jika sesi aktif
    if (deleteSession) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          await supabase
            .from('organization_whatsapp_configs')
            .update({
              is_active: false,
              display_phone_number: null,
              updated_at: new Date().toISOString(),
            })
            .match({ is_active: true });
        }
      } catch {
        // Abaikan jika tabel belum ada atau sedang offline
      }
    }

    if (res.ok && json.success) {
      return { success: true, data: json.data, message: json.message };
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
 * Logout permanen WhatsApp: menutup socket dan memusnahkan kredensial di server.
 */
export async function logoutWhatsApp(): Promise<WhatsAppClientResult<DisconnectResult>> {
  return disconnectWhatsApp(true);
}

/**
 * Memeriksa status keberadaan file kredensial sesi pada worker (Audit Keamanan Sesi).
 */
export async function auditSessionStorage(): Promise<WhatsAppClientResult<{
  status: WhatsAppConnectionStatus;
  phoneNumber: string | null;
  hasSessionFiles: boolean;
  sessionFileCount: number;
  isClean: boolean;
}>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker WhatsApp belum dikonfigurasi.',
    };
  }

  try {
    const headers = await getWorkerAuthHeaders(false);
    const res = await fetch(`${baseUrl}/api/session/audit`, {
      method: 'GET',
      headers,
    });
    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, data: json.data };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return {
      success: false,
      error: `Gagal mengaudit folder sesi worker: ${(err as Error).message}`,
    };
  }
}

/**
 * Mengirim pesan WhatsApp keluar melalui Worker Staging lokal (Baileys).
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<WhatsAppClientResult<{ to: string; messageId?: string; sentAt?: string }>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Gateway pengiriman WhatsApp belum terhubung pada lingkungan ini.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const headers = await getWorkerAuthHeaders(true);

    const res = await fetch(`${baseUrl}/api/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to, message }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, data: json.data };
    }
    return {
      success: false,
      error: json.error || `Gagal mengirim pesan (HTTP ${res.status}).`,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        success: false,
        error: 'Timeout pengiriman pesan ke WhatsApp (12 detik).',
      };
    }
    return {
      success: false,
      error: `Worker WhatsApp tidak terjangkau di ${baseUrl}: ${(err as Error).message}`,
    };
  }
}

/**
 * Mencoba kembali (retry) pengalihan calon pendaftar ke CS dari dashboard
 */
export async function retryRegistrationHandoffClient(
  conversationId: string,
  organizationId?: string
): Promise<WhatsAppClientResult<any>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker gateway belum dikonfigurasi.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const headers = await getWorkerAuthHeaders(true);

    const res = await fetch(`${baseUrl}/api/handoff/retry`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, organizationId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, data: json.data };
    }
    return {
      success: false,
      error: json.error || `Gagal melakukan retry pengalihan (HTTP ${res.status}).`,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return {
        success: false,
        error: 'Timeout percobaan retry pengalihan ke WhatsApp worker (15 detik).',
      };
    }
    return {
      success: false,
      error: `Worker WhatsApp tidak terjangkau di ${baseUrl}: ${(err as Error).message}`,
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
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker backend belum dikonfigurasi.',
    };
  }

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
    const headers = await getWorkerAuthHeaders(true);

    const res = await fetch(`${baseUrl}/api/ai/config`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ organizationId: workerProfile.orgId, profile: workerProfile }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      return {
        success: false,
        error: 'Autentikasi Worker gagal (401). Sesi login Supabase tidak valid atau tidak memiliki peran admin.',
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

/**
 * =====================================================================
 * FASE 3: CLIENT HELPER MANAJEMEN KAMPANYE PERSISTEN
 * =====================================================================
 */

export type GatewayReadinessCode =
  | 'ready'
  | 'waiting_gateway'
  | 'unconfigured'
  | 'unsupported'
  | 'connection_error';

export interface CampaignGatewayStatus {
  isReady: boolean;
  code: GatewayReadinessCode;
  label: string;
  message: string;
  provider: 'baileys' | 'meta_cloud_api' | 'openwa';
  providerDisplayName: string;
  phone?: string;
  details?: Record<string, unknown>;
}

/**
 * Mengambil status kesiapan gateway pengiriman kampanye dari backend worker
 */
export async function getCampaignGatewayStatus(
  organizationId?: string
): Promise<WhatsAppClientResult<CampaignGatewayStatus>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker gateway belum dikonfigurasi.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const headers = await getWorkerAuthHeaders(false);

    const q = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    const res = await fetch(`${baseUrl}/api/campaigns/gateway-status${q}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401) {
      return {
        success: false,
        error: 'Autentikasi Worker gagal (401 Unauthorized). Sesi login Supabase tidak valid.',
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
      error: json.error || `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Gagal memuat status gateway WhatsApp: ${err?.message || err}`,
    };
  }
}

export interface CreateCampaignClientParams {
  organizationId?: string;
  name: string;
  messageBody: string;
  senderPhone?: string;
  targetSegment?: string;
  deliveryMode: 'now' | 'scheduled';
  scheduledAt?: string | null;
  contactIds?: string[];
}

export interface CampaignRecipientClientItem {
  id: string;
  campaignId: string;
  contactId?: string | null;
  phone: string;
  name: string;
  status: 'pending' | 'processing' | 'sent' | 'delivered' | 'failed' | 'skipped';
  baileysMessageId?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  scheduledAt?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

/**
 * Membuat kampanye baru dan mendaftarkan antrean penerima persisten ke Worker
 */
export async function createPersistentCampaignClient(
  params: CreateCampaignClientParams
): Promise<WhatsAppClientResult<{
  campaignId: string;
  totalRecipients: number;
  validRecipients: number;
  skippedRecipients: number;
}>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Gateway antrean kampanye belum terhubung pada lingkungan ini.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const headers = await getWorkerAuthHeaders(true);

    const res = await fetch(`${baseUrl}/api/campaigns/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, data: json.data };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: formatWorkerFetchError(err, baseUrl, 'membuat kampanye siaran') };
  }
}

/**
 * Membatalkan kampanye siaran (berjalan maupun terjadwal) di worker
 */
export async function cancelCampaignClient(
  campaignId: string,
  organizationId?: string
): Promise<WhatsAppClientResult<{ message: string; cancelledCount?: number }>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker gateway belum dikonfigurasi.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const headers = await getWorkerAuthHeaders(true);

    const res = await fetch(`${baseUrl}/api/campaigns/${campaignId}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ organizationId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (res.ok && json.success) {
      return {
        success: true,
        data: json.data,
        message: json.message || json.data?.message || 'Siaran kampanye berhasil dibatalkan.',
      };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: formatWorkerFetchError(err, baseUrl, 'membatalkan siaran kampanye') };
  }
}

/**
 * Mengambil daftar penerima dan status delivery per kontak untuk sebuah kampanye
 */
export async function getCampaignRecipientsClient(
  campaignId: string,
  organizationId?: string
): Promise<WhatsAppClientResult<{
  recipients: CampaignRecipientClientItem[];
  metrics: {
    total: number;
    pending: number;
    processing: number;
    sent: number;
    delivered: number;
    failed: number;
    skipped: number;
  };
}>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker gateway belum dikonfigurasi.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const headers = await getWorkerAuthHeaders(false);

    const q = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    const res = await fetch(`${baseUrl}/api/campaigns/${campaignId}/recipients${q}`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (res.ok && json.success) {
      return {
        success: true,
        data: {
          recipients: json.data?.recipients || [],
          metrics: json.data?.metrics || {
            total: 0,
            pending: 0,
            processing: 0,
            sent: 0,
            delivered: 0,
            failed: 0,
            skipped: 0,
          },
        },
      };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: `Gagal memuat status penerima: ${err?.message || err}` };
  }
}

/**
 * Memicu scheduler antrean kampanye secara manual
 */
export async function triggerCampaignQueueClient(): Promise<WhatsAppClientResult> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker gateway belum dikonfigurasi.',
    };
  }

  try {
    const headers = await getWorkerAuthHeaders(false);
    const res = await fetch(`${baseUrl}/api/campaigns/trigger`, {
      method: 'POST',
      headers,
    });
    const json = await res.json();
    return { success: Boolean(json.success), message: json.message };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Menghapus percakapan di backend worker
 */
export async function deleteConversationClient(
  conversationId: string,
  organizationId?: string
): Promise<WhatsAppClientResult<{ message: string; deletedId?: string }>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker gateway belum dikonfigurasi.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const headers = await getWorkerAuthHeaders(true);

    const q = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    const res = await fetch(`${baseUrl}/api/conversations/${conversationId}${q}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ organizationId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, data: json.data || json, message: json.message };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: formatWorkerFetchError(err, baseUrl, 'menghapus percakapan') };
  }
}

/**
 * Menghapus anggota tim CS di backend worker (hanya admin/owner)
 */
export async function deleteTeamMemberClient(
  memberId: string,
  organizationId?: string
): Promise<WhatsAppClientResult<{ message: string; deletedId?: string }>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker backend belum terhubung untuk operasi penghapusan anggota tim.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const headers = await getWorkerAuthHeaders(true);

    const q = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    const res = await fetch(`${baseUrl}/api/team-members/${memberId}${q}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ organizationId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, data: json.data || json, message: json.message };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: formatWorkerFetchError(err, baseUrl, 'menghapus anggota tim') };
  }
}

/**
 * Menghapus kampanye di backend worker (hanya admin/owner)
 */
export async function deleteCampaignClient(
  campaignId: string,
  organizationId?: string
): Promise<WhatsAppClientResult<{ message: string }>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker gateway belum dikonfigurasi.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const headers = await getWorkerAuthHeaders(true);

    const q = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : '';
    const res = await fetch(`${baseUrl}/api/campaigns/${campaignId}${q}`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ organizationId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, data: json.data || json, message: json.message };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: formatWorkerFetchError(err, baseUrl, 'menghapus antrean kampanye') };
  }
}

/**
 * Memperbarui kampanye di backend worker (hanya jika draft atau scheduled)
 */
export async function updateCampaignClient(
  campaignId: string,
  params: {
    name?: string;
    messageBody?: string;
    scheduledAt?: string | null;
    status?: 'draft' | 'scheduled';
    organizationId?: string;
  }
): Promise<WhatsAppClientResult<any>> {
  const baseUrl = getWorkerBaseUrl();
  if (!baseUrl) {
    return {
      success: false,
      error: 'Worker gateway belum dikonfigurasi.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const headers = await getWorkerAuthHeaders(true);

    const res = await fetch(`${baseUrl}/api/campaigns/${campaignId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(params),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, data: json.data, message: json.message };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: formatWorkerFetchError(err, baseUrl, 'memperbarui kampanye') };
  }
}

