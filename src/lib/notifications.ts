/**
 * =====================================================================
 * WABiz In-App Notification Service (End-to-End Hardened)
 * =====================================================================
 * Mengelola notifikasi dalam aplikasi secara persisten, aman, dan terisolasi
 * antar pengguna dan organisasi dengan perlindungan RLS Supabase.
 * Menyediakan deteksi status tabel cloud, fallback in-memory yang aman,
 * serta fitur hapus satu dan hapus semua.
 */

import { supabase, isSupabaseConfigured } from './supabase';

export type NotificationCategory = 'chat' | 'contact' | 'campaign' | 'team' | 'system';
export type NotificationReferenceType = 'conversation' | 'contact' | 'campaign' | 'team_member' | 'system';
export type NotificationBackendStatus = 'online' | 'table_missing' | 'unconfigured' | 'error';

export interface AppNotification {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  reference_id?: string | null;
  reference_type?: NotificationReferenceType | null;
  dedup_key?: string | null;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}

export interface CreateNotificationParams {
  organization_id: string;
  user_id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  reference_id?: string | null;
  reference_type?: NotificationReferenceType | null;
  dedup_key?: string | null;
}

export interface FetchNotificationsResult {
  items: AppNotification[];
  status: NotificationBackendStatus;
  errorMessage?: string;
}

/**
 * Penyimpanan cadangan lokal SEMENTARA dalam memori (In-Memory Fallback).
 * CATATAN PENTING:
 * Mode ini aktif jika Supabase tidak terkonfigurasi, atau jika tabel 'notifications'
 * belum dimigrasi di database Supabase Cloud.
 * Data ini bersifat SEMENTARA dalam sesi memori dan tidak diklaim sebagai persistensi permanen.
 */
let localFallbackNotifications: AppNotification[] = [];
let lastBackendStatus: NotificationBackendStatus = 'online';
let lastBackendError: string | null = null;

/**
 * Mekanisme Listener Reaktivitas Notifikasi Real-Time In-App
 * Memastikan bell badge dan modal langsung memperbarui jumlah unread dan item
 * seketika mutasi terjadi, tanpa menunggu delay polling atau latency jaringan.
 */
type NotificationChangeListener = () => void;
const notificationChangeListeners = new Set<NotificationChangeListener>();

export function addNotificationChangeListener(listener: NotificationChangeListener): () => void {
  notificationChangeListeners.add(listener);
  return () => {
    notificationChangeListeners.delete(listener);
  };
}

export function notifyNotificationChange(): void {
  for (const listener of notificationChangeListeners) {
    try {
      listener();
    } catch (e) {
      console.warn('[Notifications] Error in change listener:', e);
    }
  }
}

/** Helper pengujian / audit: Mereset penyimpanan memori lokal. */
export function _resetLocalFallbackNotifications(): void {
  localFallbackNotifications = [];
  lastBackendStatus = 'online';
  lastBackendError = null;
}

/** Helper pengujian / audit: Mengambil isi memori lokal cadangan. */
export function _getLocalFallbackNotifications(): AppNotification[] {
  return [...localFallbackNotifications];
}

/** Helper pengujian / audit: Menambahkan notifikasi langsung ke memori lokal. */
export function _injectLocalNotification(notification: AppNotification): void {
  localFallbackNotifications = [notification, ...localFallbackNotifications];
}

/**
 * Deteksi apakah error dari Supabase adalah indikasi bahwa tabel 'notifications'
 * belum dibuat/dimigrasi di database cloud.
 */
export function isTableMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { message?: string; code?: string; details?: string };
  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toString().toUpperCase();
  const details = (err.details || '').toLowerCase();

  return (
    code === '42P01' || // PostgreSQL undefined_table
    code === 'PGRST200' || // PostgREST relation not found
    code === 'PGRST204' || // Schema cache missing column
    msg.includes('relation "public.notifications" does not exist') ||
    msg.includes('relation "notifications" does not exist') ||
    msg.includes("could not find the 'notifications' table") ||
    details.includes('notifications')
  );
}

/**
 * Mengambil status kesehatan backend notifikasi saat ini.
 */
export function getNotificationBackendStatus(): {
  status: NotificationBackendStatus;
  errorMessage?: string;
  isPersistent: boolean;
} {
  if (!isSupabaseConfigured()) {
    return {
      status: 'unconfigured',
      errorMessage: 'Kredensial Supabase URL dan Publishable Key belum dikonfigurasi.',
      isPersistent: false,
    };
  }
  return {
    status: lastBackendStatus,
    errorMessage: lastBackendError || undefined,
    isPersistent: lastBackendStatus === 'online',
  };
}

/**
 * Standarisasi pembentukan dedup_key untuk memastikan idempotensi dan mencegah tumbukan antar modul.
 * Format terstruktur: <kategori>:<tipe_event>:<entitas_id>[:sub_id]
 */
export function buildDedupKey(
  category: NotificationCategory,
  eventType: string,
  entityId: string,
  extraId?: string
): string {
  const cleanCat = category.trim().toLowerCase();
  const cleanEvent = eventType.trim().toLowerCase();
  const cleanEntity = entityId.trim();
  if (extraId) {
    return `${cleanCat}:${cleanEvent}:${cleanEntity}:${extraId.trim()}`;
  }
  return `${cleanCat}:${cleanEvent}:${cleanEntity}`;
}

/**
 * Mengambil daftar notifikasi milik pengguna yang sedang aktif dalam organisasi tertentu.
 * Dibatasi maksimal 50 notifikasi terbaru dan diurutkan dari yang paling baru.
 * Mengembalikan objek hasil yang membedakan: data berhasil, tabel belum ada di cloud, atau error koneksi.
 */
export async function fetchNotifications(
  organizationId: string,
  userId: string
): Promise<FetchNotificationsResult> {
  if (!organizationId || !userId) {
    return {
      items: [],
      status: isSupabaseConfigured() ? 'online' : 'unconfigured',
    };
  }

  if (!isSupabaseConfigured()) {
    lastBackendStatus = 'unconfigured';
    const localItems = localFallbackNotifications.filter(
      (n) => n.organization_id === organizationId && n.user_id === userId
    );
    return {
      items: localItems,
      status: 'unconfigured',
    };
  }

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      if (isTableMissingError(error)) {
        lastBackendStatus = 'table_missing';
        lastBackendError = 'Tabel notifications belum dimigrasi di database Supabase Cloud.';
        console.warn('[Notifications] Tabel "notifications" belum tersedia di Supabase Cloud.');
        const localItems = localFallbackNotifications.filter(
          (n) => n.organization_id === organizationId && n.user_id === userId
        );
        return {
          items: localItems,
          status: 'table_missing',
          errorMessage: 'Tabel database cloud belum dimigrasi (Migration 20261031170000).',
        };
      }

      lastBackendStatus = 'error';
      lastBackendError = error.message;
      console.warn('[Notifications] Gagal memuat notifikasi dari Supabase:', error.message);
      const localItems = localFallbackNotifications.filter(
        (n) => n.organization_id === organizationId && n.user_id === userId
      );
      return {
        items: localItems,
        status: 'error',
        errorMessage: error.message,
      };
    }

    lastBackendStatus = 'online';
    lastBackendError = null;
    return {
      items: (data as AppNotification[]) || [],
      status: 'online',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Koneksi gagal';
    lastBackendStatus = 'error';
    lastBackendError = msg;
    console.warn('[Notifications] Exception saat mengambil notifikasi:', msg);
    const localItems = localFallbackNotifications.filter(
      (n) => n.organization_id === organizationId && n.user_id === userId
    );
    return {
      items: localItems,
      status: 'error',
      errorMessage: msg,
    };
  }
}

/**
 * Menghitung jumlah notifikasi yang belum dibaca (unread count).
 */
export async function fetchUnreadCount(
  organizationId: string,
  userId: string
): Promise<number> {
  if (!organizationId || !userId) return 0;

  if (!isSupabaseConfigured() || lastBackendStatus === 'table_missing') {
    return localFallbackNotifications.filter(
      (n) => n.organization_id === organizationId && n.user_id === userId && !n.is_read
    ).length;
  }

  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      if (isTableMissingError(error)) {
        lastBackendStatus = 'table_missing';
        return localFallbackNotifications.filter(
          (n) => n.organization_id === organizationId && n.user_id === userId && !n.is_read
        ).length;
      }
      return 0;
    }

    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Membuat notifikasi baru untuk pengguna yang sedang aktif (self-notification).
 * Dibatasi ketat oleh RLS (user_id = auth.uid() and is_org_member).
 * Operasi dibungkus error-boundary agar kegagalan notifikasi TIDAK menggagalkan proses bisnis utama pemanggil.
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<{ success: boolean; notification?: AppNotification; error?: string; isFallback?: boolean }> {
  const {
    organization_id,
    user_id,
    title,
    body,
    category,
    reference_id = null,
    reference_type = null,
    dedup_key = null,
  } = params;

  if (!organization_id || !user_id || !title || !body) {
    return { success: false, error: 'Parameter wajib notifikasi tidak lengkap.' };
  }

  const cleanTitle = title.trim();
  const cleanBody = body.trim();

  // Helper untuk menyimpan ke fallback lokal sesi
  const saveToLocalFallback = (): AppNotification => {
    const randomSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36) : Date.now().toString(36));
    const mockItem: AppNotification = {
      id: `local-${Date.now()}-${randomSuffix}`,
      organization_id,
      user_id,
      title: cleanTitle,
      body: cleanBody,
      category,
      reference_id,
      reference_type,
      dedup_key,
      is_read: false,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    localFallbackNotifications = [mockItem, ...localFallbackNotifications];
    return mockItem;
  };

  // Mode Fallback In-Memory Lokal jika Supabase tidak terkonfigurasi
  if (!isSupabaseConfigured() || lastBackendStatus === 'table_missing') {
    if (dedup_key) {
      const exists = localFallbackNotifications.some(
        (n) => n.organization_id === organization_id && n.user_id === user_id && n.dedup_key === dedup_key
      );
      if (exists) {
        return { success: true };
      }
    }
    const item = saveToLocalFallback();
    notifyNotificationChange();
    return { success: true, notification: item, isFallback: true };
  }

  try {
    const payload: Partial<AppNotification> = {
      organization_id,
      user_id,
      title: cleanTitle,
      body: cleanBody,
      category,
      reference_id,
      reference_type,
      dedup_key,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('notifications')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      // Kode PostgreSQL 23505 adalah unique constraint violation (dedup_key sudah ada)
      if (error.code === '23505') {
        return { success: true };
      }

      // Jika tabel belum ada di cloud, simpan sementara di memori agar user tetap dapat menguji UI
      if (isTableMissingError(error)) {
        lastBackendStatus = 'table_missing';
        if (dedup_key) {
          const exists = localFallbackNotifications.some(
            (n) => n.organization_id === organization_id && n.user_id === user_id && n.dedup_key === dedup_key
          );
          if (exists) return { success: true };
        }
        const item = saveToLocalFallback();
        notifyNotificationChange();
        return { success: true, notification: item, isFallback: true };
      }

      console.warn('[Notifications] Gagal menyimpan notifikasi ke Supabase:', error.message);
      return { success: false, error: error.message };
    }

    lastBackendStatus = 'online';
    notifyNotificationChange();
    return { success: true, notification: data as AppNotification };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.warn('[Notifications] Exception saat insert notifikasi:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Menandai satu notifikasi sebagai telah dibaca.
 * HANYA memperbarui kolom is_read dan read_at sesuai batasan keamanan database.
 */
export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
  if (!notificationId) return false;

  const now = new Date().toISOString();

  // Perbarui state lokal jika item berada di sesi memori
  let foundInLocal = false;
  localFallbackNotifications = localFallbackNotifications.map((n) => {
    if (n.id === notificationId) {
      foundInLocal = true;
      return { ...n, is_read: true, read_at: now };
    }
    return n;
  });

  if (!isSupabaseConfigured() || notificationId.startsWith('local-') || lastBackendStatus === 'table_missing') {
    if (foundInLocal) notifyNotificationChange();
    return foundInLocal;
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .eq('id', notificationId);

    if (error) {
      if (isTableMissingError(error)) {
        if (foundInLocal) notifyNotificationChange();
        return foundInLocal;
      }
      console.warn('[Notifications] Gagal menandai notifikasi dibaca di database:', error.message);
      return false;
    }
    notifyNotificationChange();
    return true;
  } catch (err) {
    console.warn('[Notifications] Exception saat mark as read:', err);
    return false;
  }
}

/**
 * Menandai seluruh notifikasi yang belum dibaca milik pengguna aktif dalam organisasi sebagai telah dibaca.
 */
export async function markAllNotificationsAsRead(
  organizationId: string,
  userId: string
): Promise<boolean> {
  if (!organizationId || !userId) return false;

  const now = new Date().toISOString();

  localFallbackNotifications = localFallbackNotifications.map((n) =>
    n.organization_id === organizationId && n.user_id === userId
      ? { ...n, is_read: true, read_at: now }
      : n
  );

  if (!isSupabaseConfigured() || lastBackendStatus === 'table_missing') {
    notifyNotificationChange();
    return true;
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) {
      if (isTableMissingError(error)) {
        notifyNotificationChange();
        return true;
      }
      console.warn('[Notifications] Gagal menandai seluruh notifikasi dibaca di database:', error.message);
      return false;
    }
    notifyNotificationChange();
    return true;
  } catch (err) {
    console.warn('[Notifications] Exception saat mark all as read:', err);
    return false;
  }
}

/**
 * Menghapus satu notifikasi secara permanen dari Supabase.
 * Dilindungi oleh kebijakan RLS (user_id = auth.uid() and private.is_org_member).
 */
export async function deleteNotification(
  notificationId: string,
  organizationId?: string,
  userId?: string
): Promise<boolean> {
  if (!notificationId) return false;

  const hadInLocal = localFallbackNotifications.some((n) => n.id === notificationId);
  localFallbackNotifications = localFallbackNotifications.filter((n) => n.id !== notificationId);

  if (!isSupabaseConfigured() || notificationId.startsWith('local-') || lastBackendStatus === 'table_missing') {
    if (hadInLocal) notifyNotificationChange();
    return hadInLocal;
  }

  try {
    let query = supabase.from('notifications').delete().eq('id', notificationId);
    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { error } = await query;

    if (error) {
      if (isTableMissingError(error)) {
        if (hadInLocal) notifyNotificationChange();
        return hadInLocal;
      }
      console.warn('[Notifications] Gagal menghapus notifikasi di database:', error.message);
      return false;
    }
    notifyNotificationChange();
    return true;
  } catch (err) {
    console.warn('[Notifications] Exception saat menghapus notifikasi:', err);
    return false;
  }
}

/**
 * Menghapus SELURUH notifikasi milik pengguna aktif dalam organisasi tertentu secara permanen.
 * Terisolasi ketat pada organization_id dan user_id pengguna aktif.
 */
export async function deleteAllNotifications(
  organizationId: string,
  userId: string
): Promise<boolean> {
  if (!organizationId || !userId) return false;

  localFallbackNotifications = localFallbackNotifications.filter(
    (n) => !(n.organization_id === organizationId && n.user_id === userId)
  );

  if (!isSupabaseConfigured() || lastBackendStatus === 'table_missing') {
    notifyNotificationChange();
    return true;
  }

  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', userId);

    if (error) {
      if (isTableMissingError(error)) {
        notifyNotificationChange();
        return true;
      }
      console.warn('[Notifications] Gagal menghapus seluruh notifikasi di database:', error.message);
      return false;
    }
    notifyNotificationChange();
    return true;
  } catch (err) {
    console.warn('[Notifications] Exception saat menghapus seluruh notifikasi:', err);
    return false;
  }
}

/**
 * Berlangganan perubahan real-time pada tabel notifications.
 */
export function subscribeToNotifications(
  organizationId: string,
  userId: string,
  onChange: () => void
): () => void {
  if (!organizationId || !userId || !isSupabaseConfigured()) {
    return () => {};
  }

  try {
    const channel = supabase
      .channel(`realtime_notifications_${organizationId}_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as Partial<AppNotification>;
          if (row && row.user_id === userId) {
            onChange();
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  } catch (e) {
    console.warn('[Notifications] Exception saat subscribe realtime:', e);
    return () => {};
  }
}

// =====================================================================
// HELPER INTEGRASI SUMBER NOTIFIKASI AKTUAL SELURUH MODUL WABIZ
// =====================================================================

/**
 * 1. Sumber Kontak: Menerbitkan notifikasi saat kontak berhasil ditambahkan, diubah, atau dihapus.
 */
export async function notifyContactCreated(params: {
  organizationId: string;
  userId: string;
  contactName: string;
  phone: string;
}): Promise<void> {
  const { organizationId, userId, contactName, phone } = params;
  if (!organizationId || !userId) return;

  const dedupKey = buildDedupKey('contact', 'created', organizationId, phone);
  await createNotification({
    organization_id: organizationId,
    user_id: userId,
    title: 'Kontak Baru Ditambahkan',
    body: `Kontak "${contactName}" (${phone}) berhasil ditambahkan ke buku kontak.`,
    category: 'contact',
    reference_type: 'contact',
    reference_id: phone,
    dedup_key: dedupKey,
  }).catch((e) => console.warn('[Notifications] Gagal membuat notifikasi kontak:', e));
}

export async function notifyContactUpdated(params: {
  organizationId: string;
  userId: string;
  contactName: string;
  phone: string;
}): Promise<void> {
  const { organizationId, userId, contactName, phone } = params;
  if (!organizationId || !userId) return;

  const dedupKey = buildDedupKey('contact', 'updated', organizationId, `${phone}_${Date.now()}`);
  await createNotification({
    organization_id: organizationId,
    user_id: userId,
    title: 'Data Kontak Diperbarui',
    body: `Informasi kontak "${contactName}" (${phone}) berhasil diperbarui.`,
    category: 'contact',
    reference_type: 'contact',
    reference_id: phone,
    dedup_key: dedupKey,
  }).catch((e) => console.warn('[Notifications] Gagal membuat notifikasi kontak:', e));
}

export async function notifyContactDeleted(params: {
  organizationId: string;
  userId: string;
  contactName: string;
  phone?: string;
}): Promise<void> {
  const { organizationId, userId, contactName, phone = '-' } = params;
  if (!organizationId || !userId) return;

  const dedupKey = buildDedupKey('contact', 'deleted', organizationId, `${contactName}_${Date.now()}`);
  await createNotification({
    organization_id: organizationId,
    user_id: userId,
    title: 'Kontak Dihapus',
    body: `Kontak "${contactName}" (${phone}) telah dihapus dari daftar kontak.`,
    category: 'contact',
    reference_type: 'contact',
    reference_id: phone !== '-' ? phone : null,
    dedup_key: dedupKey,
  }).catch((e) => console.warn('[Notifications] Gagal membuat notifikasi kontak:', e));
}

/**
 * 2. Sumber Kampanye: Menerbitkan notifikasi saat kampanye berhasil disimpan, dijadwalkan, dibatalkan, atau dihapus.
 */
export type CampaignNotificationMode =
  | 'draft'
  | 'updated'
  | 'scheduled'
  | 'queued'
  | 'cancelled'
  | 'deleted'
  | 'completed'
  | 'failed';

export async function notifyCampaignEvent(params: {
  organizationId: string;
  userId: string;
  campaignId: string;
  campaignName: string;
  mode: CampaignNotificationMode;
  recipientCount?: number;
}): Promise<void> {
  const { organizationId, userId, campaignId, campaignName, mode, recipientCount = 0 } = params;
  if (!organizationId || !userId) return;

  let title = 'Draf Kampanye Disimpan';
  let body = `Draf kampanye "${campaignName}" berhasil disimpan ke database.`;

  switch (mode) {
    case 'draft':
      title = 'Draf Kampanye Disimpan';
      body = `Draf kampanye "${campaignName}" berhasil disimpan ke database.`;
      break;
    case 'updated':
      title = 'Kampanye Berhasil Diperbarui';
      body = `Pengaturan dan pesan kampanye "${campaignName}" berhasil diperbarui.`;
      break;
    case 'scheduled':
      title = 'Kampanye Berhasil Dijadwalkan';
      body = `Kampanye "${campaignName}" dijadwalkan untuk ${recipientCount} penerima.`;
      break;
    case 'queued':
      title = 'Kampanye Masuk Antrean Pengiriman';
      body = `Kampanye "${campaignName}" masuk ke antrean pengiriman worker (${recipientCount} penerima).`;
      break;
    case 'cancelled':
      title = 'Siaran Kampanye Dibatalkan';
      body = `Siaran kampanye "${campaignName}" telah dibatalkan dan sisa antrean pengiriman dihentikan.`;
      break;
    case 'deleted':
      title = 'Kampanye Berhasil Dihapus';
      body = `Kampanye "${campaignName}" telah dihapus secara permanen dari sistem.`;
      break;
    case 'completed':
      title = 'Siaran Kampanye Selesai Diproses';
      body = `Pengiriman pesan siaran kampanye "${campaignName}" telah selesai (${recipientCount} penerima).`;
      break;
    case 'failed':
      title = 'Kendala Pengiriman Kampanye';
      body = `Terjadi kendala saat memproses siaran kampanye "${campaignName}". Periksa log worker.`;
      break;
  }

  const dedupKey = buildDedupKey('campaign', mode, organizationId, campaignId);
  await createNotification({
    organization_id: organizationId,
    user_id: userId,
    title,
    body,
    category: 'campaign',
    reference_type: 'campaign',
    reference_id: campaignId,
    dedup_key: dedupKey,
  }).catch((e) => console.warn('[Notifications] Non-fatal notification error:', e));
}

/**
 * 3. Sumber Tim CS: Menerbitkan notifikasi saat anggota tim baru ditambahkan, diedit, dihapus, atau status/peran diubah.
 */
export type TeamNotificationAction = 'added' | 'updated' | 'deleted' | 'status_updated' | 'role_updated';

export async function notifyTeamEvent(params: {
  organizationId: string;
  userId: string;
  memberId: string;
  fullName: string;
  action: TeamNotificationAction;
  extraInfo?: string;
}): Promise<void> {
  const { organizationId, userId, memberId, fullName, action, extraInfo } = params;
  if (!organizationId || !userId) return;

  let title = 'Anggota Tim CS Baru Ditambahkan';
  let body = `Anggota "${fullName}" berhasil ditambahkan ke tim CS (${extraInfo || 'Umum'}).`;

  switch (action) {
    case 'added':
      title = 'Anggota Tim CS Baru Ditambahkan';
      body = `Anggota "${fullName}" berhasil ditambahkan ke tim CS (${extraInfo || 'Umum'}).`;
      break;
    case 'updated':
      title = 'Data Anggota Tim Diperbarui';
      body = `Informasi anggota tim "${fullName}" berhasil diperbarui.`;
      break;
    case 'deleted':
      title = 'Anggota Tim Dihapus';
      body = `Anggota tim "${fullName}" telah dihapus dari organisasi.`;
      break;
    case 'status_updated':
      title = 'Status Anggota Tim CS Diperbarui';
      body = `Status anggota "${fullName}" telah diperbarui (${extraInfo || 'Diperbarui'}).`;
      break;
    case 'role_updated':
      title = 'Peran Anggota Tim Diperbarui';
      body = `Peran akun "${fullName}" diubah menjadi ${extraInfo || 'Admin'}.`;
      break;
  }

  const statusSlug = extraInfo ? extraInfo.toLowerCase().replace(/\s+/g, '_') : 'updated';
  const dedupKey =
    action === 'added'
      ? buildDedupKey('team', 'member_added', organizationId, memberId)
      : action === 'status_updated'
      ? buildDedupKey('team', 'status', memberId, statusSlug)
      : buildDedupKey('team', action, organizationId, `${memberId}_${Date.now()}`);
  await createNotification({
    organization_id: organizationId,
    user_id: userId,
    title,
    body,
    category: 'team',
    reference_type: 'team_member',
    reference_id: memberId,
    dedup_key: dedupKey,
  }).catch((e) => console.warn('[Notifications] Non-fatal notification error:', e));
}

/**
 * 4. Sumber Percakapan & Pesan: Menerbitkan notifikasi saat percakapan baru dibuka, pesan dikirim, atau status diperbarui.
 */
export type ChatNotificationEventType =
  | 'new_conversation'
  | 'inbound_message'
  | 'outbound_message'
  | 'status_updated'
  | 'assigned'
  | 'handoff_success';

export async function notifyChatEvent(params: {
  organizationId: string;
  userId: string;
  conversationId: string;
  eventType: ChatNotificationEventType;
  contactName?: string;
  messageSnippet?: string;
  extraInfo?: string;
  messageId?: string;
}): Promise<void> {
  const { organizationId, userId, conversationId, eventType, contactName, messageSnippet, extraInfo, messageId } = params;
  if (!organizationId || !userId) return;

  let title = 'Percakapan Baru Dibuka';
  let body = `Percakapan baru dengan ${contactName || 'pelanggan'} berhasil dibuka.`;

  switch (eventType) {
    case 'new_conversation':
      title = 'Percakapan Baru Dibuka';
      body = `Percakapan baru dengan ${contactName || 'pelanggan'} berhasil dibuka.`;
      break;
    case 'inbound_message':
      title = 'Pesan WhatsApp Baru Masuk';
      body = `${contactName || 'Pelanggan'}: "${messageSnippet || 'Pesan baru'}"`;
      break;
    case 'outbound_message':
      title = 'Pesan Terkirim ke WhatsApp';
      body = `Pesan balasan berhasil dikirimkan ke WhatsApp ${contactName || 'pelanggan'}.`;
      break;
    case 'status_updated':
      title = 'Status Percakapan Diperbarui';
      body = `Status percakapan dengan ${contactName || 'pelanggan'} diubah menjadi "${extraInfo || 'Selesai'}".`;
      break;
    case 'assigned':
      title = 'Percakapan Ditugaskan ke CS';
      body = `Percakapan dengan ${contactName || 'pelanggan'} telah ditugaskan kepada ${extraInfo || 'petugas CS'}.`;
      break;
    case 'handoff_success':
      title = 'Pengalihan CS Berhasil';
      body = `Notifikasi pendaftaran untuk ${contactName || 'pelanggan'} berhasil dialihkan ke WhatsApp petugas CS.`;
      break;
  }

  const fallbackRand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : (typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36) : Date.now().toString(36));
  const dedupKey = buildDedupKey(
    'chat',
    eventType,
    organizationId,
    messageId || `${conversationId}_${Date.now()}_${fallbackRand}`
  );
  await createNotification({
    organization_id: organizationId,
    user_id: userId,
    title,
    body,
    category: 'chat',
    reference_type: 'conversation',
    reference_id: conversationId,
    dedup_key: dedupKey,
  }).catch((e) => console.warn('[Notifications] Non-fatal notification error:', e));
}

/**
 * 5. Sumber Chatbot AI: Menerbitkan notifikasi saat status aktif chatbot diubah atau aturan jawaban diperbarui.
 */
export type ChatbotNotificationAction = 'enabled' | 'disabled' | 'rules_updated';

export async function notifyChatbotEvent(params: {
  organizationId: string;
  userId: string;
  action: ChatbotNotificationAction;
  orgName?: string;
  detail?: string;
}): Promise<void> {
  const { organizationId, userId, action, orgName = 'Lembaga', detail } = params;
  if (!organizationId || !userId) return;

  let title = 'Chatbot AI Diperbarui';
  let body = detail || 'Pengaturan Chatbot AI telah diperbarui.';

  switch (action) {
    case 'enabled':
      title = 'Chatbot AI Diaktifkan';
      body = `Layanan auto-reply Chatbot AI telah aktif untuk organisasi ${orgName}.`;
      break;
    case 'disabled':
      title = 'Chatbot AI Dinonaktifkan';
      body = `Layanan auto-reply Chatbot AI telah dinonaktifkan untuk organisasi ${orgName}.`;
      break;
    case 'rules_updated':
      title = 'Aturan Jawaban AI & FAQ Diperbarui';
      body = detail || `Knowledge base dan FAQ otomatis untuk organisasi ${orgName} berhasil disimpan.`;
      break;
  }

  const dedupKey = buildDedupKey('system', `chatbot_${action}`, organizationId, String(Date.now()));
  await createNotification({
    organization_id: organizationId,
    user_id: userId,
    title,
    body,
    category: 'system',
    reference_type: 'system',
    dedup_key: dedupKey,
  }).catch((e) => console.warn('[Notifications] Non-fatal notification error:', e));
}

/**
 * 6. Sumber Sistem: Menerbitkan notifikasi saat pengaturan profil organisasi atau konfigurasi diperbarui.
 */
export async function notifySystemEvent(params: {
  organizationId: string;
  userId: string;
  title: string;
  body: string;
  extraId?: string;
}): Promise<void> {
  const { organizationId, userId, title, body, extraId } = params;
  if (!organizationId || !userId) return;

  const dedupKey = buildDedupKey('system', 'profile', organizationId, extraId || String(Date.now()));
  await createNotification({
    organization_id: organizationId,
    user_id: userId,
    title,
    body,
    category: 'system',
    reference_type: 'system',
    dedup_key: dedupKey,
  }).catch((e) => console.warn('[Notifications] Non-fatal notification error:', e));
}

export async function notifyOrgProfileUpdated(params: {
  organizationId: string;
  userId: string;
  orgName: string;
}): Promise<void> {
  const { organizationId, userId, orgName } = params;
  if (!organizationId || !userId) return;

  const dedupKey = buildDedupKey('system', 'profile', organizationId, String(Date.now()));
  await createNotification({
    organization_id: organizationId,
    user_id: userId,
    title: 'Profil Organisasi Diperbarui',
    body: `Pengaturan profil bisnis untuk "${orgName}" berhasil disimpan ke database.`,
    category: 'system',
    reference_type: 'system',
    dedup_key: dedupKey,
  }).catch((e) => console.warn('[Notifications] Non-fatal notification error:', e));
}

export async function notifyConfigUpdated(params: {
  organizationId: string;
  userId: string;
  configName: string;
  detail: string;
}): Promise<void> {
  const { organizationId, userId, configName, detail } = params;
  if (!organizationId || !userId) return;

  const dedupKey = buildDedupKey('system', 'config', organizationId, `${configName}_${Date.now()}`);
  await createNotification({
    organization_id: organizationId,
    user_id: userId,
    title: `Konfigurasi ${configName} Diperbarui`,
    body: detail,
    category: 'system',
    reference_type: 'system',
    dedup_key: dedupKey,
  }).catch((e) => console.warn('[Notifications] Non-fatal notification error:', e));
}
