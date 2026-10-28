// ====================================================================
// WABiz Phase 3: Persistent Campaign Execution, Scheduling & Queue Engine
// ====================================================================

import { createWorkerSupabaseClient } from './supabase';
import { whatsappService } from './whatsapp';
import { maskPhone } from './security';
import { getProvider, getProviderReadiness, ProviderReadinessResult } from './providers';

export interface CreateCampaignParams {
  name: string;
  messageBody: string;
  senderPhone?: string;
  targetSegment?: string;
  deliveryMode: 'now' | 'scheduled';
  scheduledAt?: string | null;
  contactIds?: string[];
}

export interface RecipientItem {
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
 * Validasi dan normalisasi nomor WhatsApp untuk kampanye.
 * Harus berupa digit numerik dengan panjang minimal 9 karakter.
 */
export function validateRecipientPhone(rawPhone: string): {
  isValid: boolean;
  normalized: string;
  reason?: string;
} {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return { isValid: false, normalized: '', reason: 'Nomor telepon kosong' };
  }

  let cleaned = rawPhone.replace(/\D/g, '');
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }

  if (cleaned.length < 9) {
    return { isValid: false, normalized: cleaned, reason: 'Nomor terlalu pendek (< 9 digit)' };
  }
  if (cleaned.length > 16) {
    return { isValid: false, normalized: cleaned, reason: 'Nomor terlalu panjang (> 16 digit)' };
  }

  return { isValid: true, normalized: cleaned };
}

/**
 * Buat kampanye baru di database Supabase secara persisten dengan antrean penerima
 */
export async function createPersistentCampaign(
  orgId: string,
  params: CreateCampaignParams,
  customSupabase?: any
): Promise<{
  success: boolean;
  campaignId?: string;
  totalRecipients?: number;
  validRecipients?: number;
  skippedRecipients?: number;
  error?: string;
}> {
  const supabase = customSupabase || createWorkerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database Supabase tidak terkonfigurasi pada worker.' };
  }

  if (!orgId) {
    return { success: false, error: 'ID Organisasi wajib disertakan.' };
  }

  const name = params.name?.trim();
  const messageBody = params.messageBody?.trim();
  if (!name || name.length < 3) {
    return { success: false, error: 'Nama kampanye minimal 3 karakter.' };
  }
  if (!messageBody || messageBody.length < 5) {
    return { success: false, error: 'Isi pesan kampanye minimal 5 karakter.' };
  }

  let scheduledIso: string | null = null;
  let initialStatus: 'draft' | 'scheduled' | 'running' = 'draft';

  if (params.deliveryMode === 'scheduled') {
    if (!params.scheduledAt) {
      return { success: false, error: 'Waktu jadwal siaran wajib diisi untuk mode terjadwal.' };
    }
    const scheduleDate = new Date(params.scheduledAt);
    if (isNaN(scheduleDate.getTime())) {
      return { success: false, error: 'Format tanggal waktu jadwal tidak valid.' };
    }
    if (scheduleDate.getTime() <= Date.now()) {
      return { success: false, error: 'Waktu jadwal siaran harus berada di masa depan.' };
    }
    scheduledIso = scheduleDate.toISOString();
    initialStatus = 'scheduled';
  } else if (params.deliveryMode === 'now') {
    initialStatus = 'running';
  }

  // Validasi kontak target penerima kampanye
  if (params.contactIds !== undefined && params.contactIds.length === 0) {
    return { success: false, error: 'Penerima kampanye wajib dipilih minimal 1 kontak.' };
  }

  try {
    // 1. Ambil kontak target dari database Supabase
    let query = supabase
      .from('contacts')
      .select('id, name, phone, labels, is_opted_out')
      .eq('organization_id', orgId);

    if (params.contactIds && params.contactIds.length > 0) {
      query = query.in('id', params.contactIds);
    } else if (params.targetSegment && params.targetSegment !== 'all') {
      query = query.contains('labels', [params.targetSegment]);
    }

    const { data: contacts, error: contactErr } = await query;
    if (contactErr) {
      return { success: false, error: `Gagal memuat kontak target: ${contactErr.message}` };
    }

    if (!contacts || contacts.length === 0) {
      return { success: false, error: 'Tidak ada kontak yang cocok dengan target kampanye yang dipilih.' };
    }

    // 2. Bangun dan filter antrean penerima (validasi nomor, deduplikasi & opt-out) sebelum membuat record kampanye
    let validCount = 0;
    let skippedCount = 0;
    const recipientRows: any[] = [];
    const seenPhones = new Set<string>();

    for (const c of contacts) {
      const { isValid, normalized, reason } = validateRecipientPhone(c.phone);

      // Cek apakah nomor sudah dimasukkan untuk kampanye ini (deduplikasi nomor)
      if (seenPhones.has(normalized)) {
        continue;
      }
      seenPhones.add(normalized);

      // Cek apakah kontak opt-out
      const hasOptOutLabel = Array.isArray(c.labels) && (
        c.labels.includes('opt-out') ||
        c.labels.includes('optout') ||
        c.labels.includes('berhenti')
      );
      const isOptedOut = Boolean(c.is_opted_out) || hasOptOutLabel;

      if (!isValid) {
        skippedCount++;
        recipientRows.push({
          organization_id: orgId,
          campaign_id: '',
          contact_id: c.id,
          phone: normalized || c.phone,
          name: c.name || 'Pelanggan',
          status: 'skipped',
          error_message: reason || 'Nomor tidak valid',
          scheduled_at: scheduledIso,
        });
      } else if (isOptedOut) {
        skippedCount++;
        recipientRows.push({
          organization_id: orgId,
          campaign_id: '',
          contact_id: c.id,
          phone: normalized,
          name: c.name || 'Pelanggan',
          status: 'skipped',
          error_message: 'Penerima telah memilih berhenti menerima pesan (opt-out)',
          scheduled_at: scheduledIso,
        });
      } else {
        validCount++;
        recipientRows.push({
          organization_id: orgId,
          campaign_id: '',
          contact_id: c.id,
          phone: normalized,
          name: c.name || 'Pelanggan',
          status: 'pending',
          scheduled_at: scheduledIso,
        });
      }
    }

    if (validCount === 0) {
      return {
        success: false,
        error: 'Tidak ada kontak penerima dengan nomor valid yang dapat dikirimi pesan kampanye.',
      };
    }

    // 3. Buat record kampanye di tabel campaigns
    const { data: campaignRow, error: campErr } = await supabase
      .from('campaigns')
      .insert({
        organization_id: orgId,
        name,
        message_body: messageBody,
        status: initialStatus,
        scheduled_at: scheduledIso,
        sender_phone: params.senderPhone || null,
        target_segment: params.targetSegment || 'all',
        total_recipients: recipientRows.length,
      })
      .select('id')
      .single();

    if (campErr || !campaignRow) {
      return { success: false, error: `Gagal menyimpan kampanye: ${campErr?.message}` };
    }

    const campaignId = campaignRow.id;
    for (const r of recipientRows) {
      r.campaign_id = campaignId;
    }

    if (recipientRows.length > 0) {
      const { error: batchErr } = await supabase
        .from('campaign_recipients')
        .insert(recipientRows);

      if (batchErr) {
        console.error('[Campaigns] Gagal memasukkan daftar penerima:', batchErr.message);
        return { success: false, error: `Gagal mendaftarkan penerima: ${batchErr.message}` };
      }
    }

    // Perbarui metrik ringkasan kampanye
    await supabase
      .from('campaigns')
      .update({
        total_recipients: recipientRows.length,
        skipped_count: skippedCount,
      })
      .eq('id', campaignId)
      .eq('organization_id', orgId);

    // Jika mode Kirim Sekarang, segera bangunkan scheduler
    if (params.deliveryMode === 'now' && !customSupabase) {
      setTimeout(() => {
        campaignScheduler.triggerNow();
      }, 500);
    }

    return {
      success: true,
      campaignId,
      totalRecipients: recipientRows.length,
      validRecipients: validCount,
      skippedRecipients: skippedCount,
    };
  } catch (err: any) {
    console.error('[Campaigns] Exception saat membuat kampanye:', err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Batalkan kampanye terjadwal yang belum selesai diproses
 */
export async function cancelCampaign(
  orgId: string,
  campaignId: string,
  customSupabase?: any
): Promise<{ success: boolean; message?: string; error?: string }> {
  const supabase = customSupabase || createWorkerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database Supabase tidak terhubung.' };
  }

  try {
    // 1. Cek status kampanye saat ini
    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .select('id, status, name')
      .eq('id', campaignId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (cErr || !campaign) {
      return { success: false, error: 'Kampanye tidak ditemukan dalam organisasi ini.' };
    }

    if (campaign.status === 'completed') {
      return { success: false, error: 'Kampanye yang sudah selesai tidak dapat dibatalkan.' };
    }
    if (campaign.status === 'cancelled') {
      return { success: true, message: 'Kampanye sudah dalam status dibatalkan.' };
    }

    // 2. Perbarui status kampanye ke 'cancelled'
    await supabase
      .from('campaigns')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('organization_id', orgId);

    // 3. Batalkan seluruh penerima yang masih pending
    const { data: updatedRecs } = await supabase
      .from('campaign_recipients')
      .update({
        status: 'skipped',
        error_message: 'Kampanye dibatalkan oleh admin sebelum pengiriman.',
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId)
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .select('id');

    const cancelledCount = updatedRecs ? updatedRecs.length : 0;
    console.log(`[Campaigns] Kampanye "${campaign.name}" (${campaignId}) dibatalkan. ${cancelledCount} penerima pending di-skip.`);

    // Recalculate skipped count
    const { count: totalSkipped } = await supabase
      .from('campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'skipped');

    await supabase
      .from('campaigns')
      .update({ skipped_count: totalSkipped || 0 })
      .eq('id', campaignId);

    return {
      success: true,
      message: `Kampanye "${campaign.name}" berhasil dibatalkan.`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export interface UpdateCampaignParams {
  name?: string;
  messageBody?: string;
  scheduledAt?: string | null;
  status?: 'draft' | 'scheduled';
}

/**
 * Menghapus kampanye secara aman dari database (hanya boleh jika bukan 'running' atau 'sending')
 */
export async function deleteCampaign(
  orgId: string,
  campaignId: string,
  customSupabase?: any
): Promise<{ success: boolean; message?: string; error?: string; statusCode?: number }> {
  const supabase = customSupabase || createWorkerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database Supabase tidak terhubung.', statusCode: 503 };
  }

  if (!orgId || !campaignId) {
    return { success: false, error: 'ID Organisasi dan ID Kampanye wajib diisi.', statusCode: 400 };
  }

  try {
    // 1. Cek apakah kampanye ada dan milik orgId
    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .select('id, status, name, organization_id')
      .eq('id', campaignId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (cErr || !campaign) {
      return {
        success: false,
        error: 'Kampanye tidak ditemukan dalam organisasi ini.',
        statusCode: 404,
      };
    }

    // 2. Tolak penghapusan jika kampanye sedang aktif berjalan ('running' atau 'sending')
    if (campaign.status === 'running' || campaign.status === 'sending') {
      return {
        success: false,
        error: 'Kampanye sedang aktif berjalan ("running"). Batalkan kampanye terlebih dahulu sebelum menghapus.',
        statusCode: 400,
      };
    }

    // 3. Hapus antrean penerima terlebih dahulu secara eksplisit agar tidak ada data yatim (orphan)
    const { error: recDelErr } = await supabase
      .from('campaign_recipients')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('organization_id', orgId);

    if (recDelErr) {
      return {
        success: false,
        error: `Gagal menghapus antrean penerima: ${recDelErr.message}`,
        statusCode: 500,
      };
    }

    // 4. Hapus baris kampanye
    const { data: delCampRows, error: delErr } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('organization_id', orgId)
      .in('status', ['draft', 'scheduled', 'completed', 'sent', 'cancelled', 'failed'])
      .select('id');

    if (delErr) {
      console.error(
        `[Campaigns Cleanup Alert] Penerima kampanye ${campaignId} telah dibersihkan, tetapi entri kampanye gagal dihapus: ${delErr.message}. Silakan lakukan percobaan ulang.`
      );
      return {
        success: false,
        error: `Antrean penerima berhasil dibersihkan, namun entri kampanye gagal dihapus (${delErr.message}). Silakan coba hapus kembali untuk menyelesaikan pembersihan.`,
        statusCode: 500,
      };
    }

    const deletedRows = Array.isArray(delCampRows) ? delCampRows : (delCampRows ? [delCampRows] : []);
    if (deletedRows.length === 0) {
      console.warn(
        `[Campaigns Cleanup Alert] Penerima kampanye ${campaignId} telah dibersihkan, tetapi baris kampanye tidak terhapus (status mungkin telah berubah menjadi running atau telah dihapus oleh proses lain).`
      );
      return {
        success: false,
        error: 'Penerima berhasil dibersihkan, namun kampanye tidak terhapus karena statusnya telah berubah menjadi sedang berjalan atau telah dihapus oleh proses lain.',
        statusCode: 409,
      };
    }

    console.log(`[Campaigns] Kampanye "${campaign.name}" (${campaignId}) berhasil dihapus oleh admin.`);
    return {
      success: true,
      message: `Kampanye "${campaign.name}" berhasil dihapus.`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err), statusCode: 500 };
  }
}

/**
 * Memperbarui kampanye (hanya jika berstatus 'draft' atau 'scheduled')
 */
export async function updateCampaign(
  orgId: string,
  campaignId: string,
  params: UpdateCampaignParams,
  customSupabase?: any
): Promise<{ success: boolean; data?: any; message?: string; error?: string; statusCode?: number }> {
  const supabase = customSupabase || createWorkerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database Supabase tidak terhubung.', statusCode: 503 };
  }

  if (!orgId || !campaignId) {
    return { success: false, error: 'ID Organisasi dan ID Kampanye wajib diisi.', statusCode: 400 };
  }

  try {
    // 1. Cek status kampanye saat ini di database
    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .select('id, status, name, organization_id, scheduled_at')
      .eq('id', campaignId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (cErr || !campaign) {
      return {
        success: false,
        error: 'Kampanye tidak ditemukan dalam organisasi ini.',
        statusCode: 404,
      };
    }

    const previousScheduledAt = campaign.scheduled_at;

    // 2. Tolak perubahan jika kampanye sudah running, sending, completed, atau sent
    if (
      campaign.status === 'running' ||
      campaign.status === 'sending' ||
      campaign.status === 'completed' ||
      campaign.status === 'sent'
    ) {
      return {
        success: false,
        error: `Kampanye dengan status "${campaign.status}" tidak dapat diedit karena sedang atau telah selesai diproses.`,
        statusCode: 400,
      };
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (params.name && params.name.trim().length >= 3) {
      updates.name = params.name.trim();
    }
    if (params.messageBody && params.messageBody.trim().length >= 5) {
      updates.message_body = params.messageBody.trim();
    }
    if (params.scheduledAt !== undefined) {
      if (params.scheduledAt !== null) {
        const scheduleDate = new Date(params.scheduledAt);
        if (isNaN(scheduleDate.getTime())) {
          return { success: false, error: 'Format tanggal waktu jadwal tidak valid.', statusCode: 400 };
        }
        if (scheduleDate.getTime() <= Date.now()) {
          return { success: false, error: 'Waktu jadwal siaran harus berada di masa depan.', statusCode: 400 };
        }
        updates.scheduled_at = scheduleDate.toISOString();
      } else {
        updates.scheduled_at = null;
      }
    }
    if (params.status && (params.status === 'draft' || params.status === 'scheduled')) {
      updates.status = params.status;
    }

    const { data: updatedRows, error: uErr } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', campaignId)
      .eq('organization_id', orgId)
      .in('status', ['draft', 'scheduled'])
      .select('*');

    if (uErr) {
      return { success: false, error: `Gagal memperbarui kampanye: ${uErr.message}`, statusCode: 500 };
    }

    const updatedRow = Array.isArray(updatedRows) && updatedRows.length > 0 ? updatedRows[0] : null;

    if (!updatedRow) {
      return {
        success: false,
        error: 'Kampanye gagal diperbarui. Status kampanye mungkin telah berubah menjadi sedang berjalan atau selesai saat pembaruan diproses.',
        statusCode: 409,
      };
    }

    // Jika scheduled_at diperbarui dan ada penerima pending, sinkronkan scheduled_at pada penerima
    if (params.scheduledAt !== undefined) {
      const { error: recSyncErr } = await supabase
        .from('campaign_recipients')
        .update({ scheduled_at: updates.scheduled_at, updated_at: new Date().toISOString() })
        .eq('campaign_id', campaignId)
        .eq('organization_id', orgId)
        .eq('status', 'pending');

      if (recSyncErr) {
        console.error(
          `[Campaigns Sync Error] Gagal menyinkronkan scheduled_at pada antrean penerima kampanye ${campaignId}: ${recSyncErr.message}. Menjalankan kompensasi rollback jadwal kampanye...`
        );

        // Kompensasi best-effort: Kembalikan scheduled_at kampanye ke nilai sebelumnya
        const { data: compRows, error: compErr } = await supabase
          .from('campaigns')
          .update({
            scheduled_at: previousScheduledAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaignId)
          .eq('organization_id', orgId)
          .in('status', ['draft', 'scheduled'])
          .select('id');

        const compRow = Array.isArray(compRows) && compRows.length > 0 ? compRows[0] : null;

        if (compErr || !compRow) {
          console.error(
            `[Campaigns Inconsistency Alert] Kompensasi gagal untuk kampanye ${campaignId}. Waktu jadwal kampanye tidak sinkron dengan antrean penerima. Diperlukan rekonsiliasi data.`
          );
          return {
            success: false,
            error: `Gagal menyinkronkan jadwal penerima (${recSyncErr.message}) dan kompensasi pembatalan jadwal kampanye tidak berhasil. Diperlukan rekonsiliasi data.`,
            statusCode: 500,
          };
        }

        return {
          success: false,
          error: `Gagal menyinkronkan jadwal penerima: ${recSyncErr.message}. Jadwal kampanye telah dikembalikan ke waktu sebelumnya.`,
          statusCode: 500,
        };
      }
    }

    return {
      success: true,
      data: updatedRow,
      message: `Kampanye "${campaign.name}" berhasil diperbarui.`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err), statusCode: 500 };
  }
}

/**
 * Rekonsiliasi waktu jadwal antrean penerima yang masih 'pending' agar selaras dengan waktu kampanye induk.
 * Hanya memutasi penerima 'pending' milik kampanye dan organisasi yang bersangkutan.
 * Penerima berstatus 'processing', 'sent', 'delivered', 'failed', atau 'skipped' TIDAK AKAN disentuh.
 */
export async function reconcileCampaignScheduledRecipients(
  orgId: string,
  campaignId: string,
  targetScheduledAt: string | null,
  customSupabase?: any
): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
  const supabase = customSupabase || createWorkerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database Supabase tidak terhubung.' };
  }

  if (!orgId || !campaignId) {
    return { success: false, error: 'ID Organisasi dan ID Kampanye wajib diisi.' };
  }

  try {
    const { data: updatedRecs, error } = await supabase
      .from('campaign_recipients')
      .update({
        scheduled_at: targetScheduledAt,
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId)
      .eq('organization_id', orgId)
      .eq('status', 'pending')
      .select('id');

    if (error) {
      return { success: false, error: error.message };
    }

    const count = updatedRecs ? updatedRecs.length : 0;
    return { success: true, updatedCount: count };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Ambil daftar penerima dan metrik untuk sebuah kampanye
 */
export async function getCampaignRecipients(
  orgId: string,
  campaignId: string,
  customSupabase?: any
): Promise<{
  success: boolean;
  recipients?: RecipientItem[];
  metrics?: {
    total: number;
    pending: number;
    processing: number;
    sent: number;
    delivered: number;
    failed: number;
    skipped: number;
  };
  error?: string;
}> {
  const supabase = customSupabase || createWorkerSupabaseClient();
  if (!supabase) {
    return { success: false, error: 'Database Supabase tidak terhubung.' };
  }

  try {
    const { data: recs, error: rErr } = await supabase
      .from('campaign_recipients')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true });

    if (rErr) {
      return { success: false, error: rErr.message };
    }

    const metrics = {
      total: recs?.length || 0,
      pending: 0,
      processing: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      skipped: 0,
    };

    const mapped: RecipientItem[] = (recs || []).map((r: any) => {
      const st = r.status as RecipientItem['status'];
      if (st in metrics) {
        metrics[st]++;
      }
      return {
        id: r.id,
        campaignId: r.campaign_id,
        contactId: r.contact_id,
        phone: r.phone,
        name: r.name,
        status: st,
        baileysMessageId: r.baileys_message_id,
        errorMessage: r.error_message,
        retryCount: r.retry_count || 0,
        scheduledAt: r.scheduled_at,
        sentAt: r.sent_at,
        createdAt: r.created_at,
      };
    });

    return { success: true, recipients: mapped, metrics };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * ====================================================================
 * KELAS MESIN SCHEDULER & QUEUE KAMPANYE (PERSISTEN & TAHAN RESTART)
 * ====================================================================
 */
export interface CampaignQueueSchedulerOptions {
  supabaseClient?: any;
  getWhatsAppState?: () => { status: string };
  getProvider?: (orgId: string) => Promise<any>;
  messageDelayMs?: number;
  intervalMs?: number;
  maxRetries?: number;
}

export class CampaignQueueScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private intervalMs = 4000;
  private maxRetries = 3;
  private messageDelayMs = 1200; // Throttle 1.2 detik antar pengiriman pesan
  private customSupabase?: any;
  private customWaStateGetter?: () => { status: string; lastError?: string | null };
  private customProviderGetter?: (orgId: string) => Promise<any>;
  private lastReadinessDetails = new Map<string, ProviderReadinessResult>();

  constructor(options?: CampaignQueueSchedulerOptions) {
    if (options?.supabaseClient) this.customSupabase = options.supabaseClient;
    if (options?.getWhatsAppState) this.customWaStateGetter = options.getWhatsAppState;
    if (options?.getProvider) this.customProviderGetter = options.getProvider;
    if (typeof options?.messageDelayMs === 'number') this.messageDelayMs = options.messageDelayMs;
    if (typeof options?.intervalMs === 'number') this.intervalMs = options.intervalMs;
    if (typeof options?.maxRetries === 'number') this.maxRetries = options.maxRetries;
  }

  private getSupabase() {
    return this.customSupabase || createWorkerSupabaseClient();
  }

  private getWaState() {
    return this.customWaStateGetter ? this.customWaStateGetter() : whatsappService.getState();
  }

  private async resolveProvider(orgId: string) {
    return this.customProviderGetter ? this.customProviderGetter(orgId) : getProvider(orgId, this.getSupabase());
  }

  /**
   * Mengambil detail kesiapan provider terakhir dari cache scheduler
   */
  public getReadinessDetail(keyOrOrgId: string): ProviderReadinessResult | undefined {
    return this.lastReadinessDetails.get(keyOrOrgId);
  }

  /**
   * Memeriksa kesiapan provider berdasarkan organisasi:
   * - Baileys: soket WhatsApp harus berstatus 'connected'
   * - Meta Cloud API: kredensial dan endpoint Graph API harus siap (getConnectionStatus.isConnected)
   * - OpenWA: sesi OpenWA dinonaktifkan sementara (fail-closed)
   */
  public async checkProviderReadiness(provider: any, organizationId: string): Promise<boolean> {
    const cacheKey = `${organizationId}:${provider?.providerType || 'unknown'}`;
    try {
      if (!provider) {
        this.lastReadinessDetails.set(cacheKey, {
          isReady: false,
          code: 'unconfigured',
          label: 'Konfigurasi provider belum lengkap',
          message: 'Objek provider WhatsApp tidak ditemukan.',
          provider: 'baileys',
          providerDisplayName: 'WhatsApp Gateway',
        });
        return false;
      }

      // WABiz untuk sementara hanya mendukung Baileys dan Meta Cloud API.
      // OpenWA dinonaktifkan secara fail-closed untuk pengiriman kampanye.
      if (provider.providerType === 'openwa') {
        const detail: ProviderReadinessResult = {
          isReady: false,
          code: 'unsupported',
          label: 'Provider tidak didukung atau dinonaktifkan',
          message: 'Provider OpenWA saat ini dinonaktifkan untuk pengiriman kampanye (hanya Baileys dan Meta Cloud API yang didukung).',
          provider: 'openwa',
          providerDisplayName: 'OpenWA Gateway',
          details: { disabled: true },
        };
        this.lastReadinessDetails.set(cacheKey, detail);
        console.warn(`[Campaign Scheduler] Provider OpenWA dinonaktifkan sementara (hanya Baileys dan Meta Cloud API yang didukung). Pengiriman kampanye untuk organisasi ${organizationId} ditunda.`);
        return false;
      }

      // Jika ada customWaStateGetter yang diinjeksikan (untuk Baileys atau mock tests)
      if (this.customWaStateGetter && (provider.providerType === 'baileys' || provider.providerType === 'mock_provider')) {
        const state: any = this.getWaState();
        const isReady = state.status === 'connected';
        this.lastReadinessDetails.set(cacheKey, {
          isReady,
          code: isReady ? 'ready' : (state.status === 'error' ? 'connection_error' : 'waiting_gateway'),
          label: isReady ? 'Siap mengirim' : (state.status === 'error' ? 'Terjadi kesalahan koneksi' : 'Menunggu koneksi gateway'),
          message: isReady ? 'Gateway terhubung dan siap.' : (state.lastError || 'Menunggu koneksi gateway WhatsApp.'),
          provider: provider.providerType,
          providerDisplayName: provider.providerType === 'baileys' ? 'WhatsApp Gateway (Baileys)' : provider.providerType,
        });
        return isReady;
      }

      if (typeof provider.getReadiness === 'function') {
        const readiness: ProviderReadinessResult = await provider.getReadiness(organizationId);
        this.lastReadinessDetails.set(cacheKey, readiness);
        return readiness.isReady;
      }

      if (typeof provider.getConnectionStatus === 'function') {
        const status = await provider.getConnectionStatus(organizationId);
        const isReady = Boolean(status && status.isConnected);
        this.lastReadinessDetails.set(cacheKey, {
          isReady,
          code: isReady ? 'ready' : 'waiting_gateway',
          label: isReady ? 'Siap mengirim' : 'Menunggu koneksi gateway',
          message: isReady ? 'Gateway terhubung.' : 'Gateway belum terhubung.',
          provider: provider.providerType,
          providerDisplayName: provider.providerType,
          phone: status?.phone,
        });
        return isReady;
      }

      return true;
    } catch (err: any) {
      console.warn(`[Campaign Scheduler] Error cek kesiapan provider ${provider?.providerType}:`, err?.message || err);
      this.lastReadinessDetails.set(cacheKey, {
        isReady: false,
        code: 'connection_error',
        label: 'Terjadi kesalahan koneksi',
        message: err?.message || 'Error saat memeriksa kesiapan gateway WhatsApp.',
        provider: provider?.providerType || 'baileys',
        providerDisplayName: provider?.providerType || 'WhatsApp Gateway',
      });
      return false;
    }
  }

  public start(interval = 4000): void {
    this.intervalMs = interval;
    if (this.timer) {
      clearInterval(this.timer);
    }
    console.log(`[Campaign Scheduler] Mesin antrean pengiriman persisten aktif (interval: ${this.intervalMs}ms).`);

    // Pulihkan job yang tertahan akibat crash/restart worker sebelumnya
    this.recoverStaleProcessingJobs().catch((err) => {
      console.warn('[Campaign Scheduler] Warning saat recovery job stale:', err?.message || err);
    });

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[Campaign Scheduler] Exception pada tick antrean:', err?.message || err);
      });
    }, this.intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[Campaign Scheduler] Mesin antrean dihentikan.');
    }
  }

  public triggerNow(): void {
    setImmediate(() => {
      this.tick().catch((err) => {
        console.error('[Campaign Scheduler] Exception pada triggerNow:', err?.message || err);
      });
    });
  }

  /**
   * Pemulihan job persisten setelah restart worker:
   * Mengembalikan item 'processing' yang sudah lebih dari 5 menit tak terselesaikan ke 'pending'.
   */
  public async recoverStaleProcessingJobs(): Promise<void> {
    const supabase = this.getSupabase();
    if (!supabase) return;

    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recovered, error } = await supabase
        .from('campaign_recipients')
        .update({
          status: 'pending',
          error_message: 'Dipulihkan otomatis setelah worker restart / timeout processing.',
          updated_at: new Date().toISOString(),
        })
        .eq('status', 'processing')
        .lt('updated_at', fiveMinutesAgo)
        .select('id, campaign_id');

      if (!error && recovered && recovered.length > 0) {
        console.log(`[Campaign Scheduler] ${recovered.length} antrean 'processing' berhasil dipulihkan ke 'pending'.`);
      }
    } catch (e: any) {
      console.warn('[Campaign Scheduler] Gagal memulihkan antrean lama:', e?.message || e);
    }
  }

  /**
   * Siklus utama scheduler:
   * 1. Periksa kampanye terjadwal yang sudah memasuki waktu kirim
   * 2. Ambil batch antrean penerima 'pending'
   * 3. Kirim via Baileys socket dengan throttle dan kontrol konkurensi
   * 4. Perbarui status selesai jika kampanye tuntas
   */
  public async tick(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const supabase = this.getSupabase();
      if (!supabase) return;

      const nowIso = new Date().toISOString();

      // TAHAP 1: Aktifkan kampanye berstatus 'scheduled' yang waktunya telah tiba
      const { data: dueCampaigns } = await supabase
        .from('campaigns')
        .select('id, organization_id, name, scheduled_at, status')
        .eq('status', 'scheduled')
        .lte('scheduled_at', nowIso);

      if (dueCampaigns && dueCampaigns.length > 0) {
        for (const camp of dueCampaigns) {
          console.log(`[Campaign Scheduler] Kampanye terjadwal "${camp.name}" (${camp.id}) mulai dieksekusi sekarang (Jadwal: ${camp.scheduled_at}).`);

          // Rekonsiliasi waktu jadwal penerima pending milik kampanye dan organisasi ini
          if (camp.organization_id) {
            await reconcileCampaignScheduledRecipients(
              camp.organization_id,
              camp.id,
              camp.scheduled_at,
              supabase
            ).catch((err) => {
              console.warn(`[Campaign Scheduler] Warning rekonsiliasi jadwal kampanye ${camp.id}:`, err?.message || err);
            });
          }

          await supabase
            .from('campaigns')
            .update({
              status: 'running',
              updated_at: new Date().toISOString(),
            })
            .eq('id', camp.id);
        }
      }

      // TAHAP 2: Ambil batch penerima yang 'pending' pada kampanye yang 'running'
      // Batasi 5 item per tick agar pengiriman bertahap dan aman dari spam threshold
      const { data: pendingItems, error: pErr } = await supabase
        .from('campaign_recipients')
        .select(`
          id,
          campaign_id,
          organization_id,
          phone,
          name,
          retry_count,
          status,
          campaigns!inner (
            id,
            organization_id,
            name,
            message_body,
            status
          )
        `)
        .eq('status', 'pending')
        .eq('campaigns.status', 'running')
        .order('created_at', { ascending: true })
        .limit(5);

      if (pErr || !pendingItems || pendingItems.length === 0) {
        // Cek apakah ada kampanye 'running' yang seluruh antreannya telah tuntas
        await this.checkCompletedCampaigns();
        return;
      }

      // Cache status kesiapan provider per organisasi selama tick ini agar tidak query status berulang
      const providerReadinessCache = new Map<string, boolean>();

      for (const item of pendingItems) {
        // Cek status kampanye terkait
        const campObj = Array.isArray(item.campaigns) ? item.campaigns[0] : item.campaigns;
        if (!campObj || campObj.status !== 'running') {
          continue;
        }

        // TAHAP 3: KESIAPAN PROVIDER PER ORGANISASI (Isolasi multi-tenant)
        const orgId = campObj.organization_id;
        const provider = await this.resolveProvider(orgId);
        const cacheKey = `${orgId}:${provider.providerType}`;

        let isReady = providerReadinessCache.get(cacheKey);
        if (isReady === undefined) {
          isReady = await this.checkProviderReadiness(provider, orgId);
          providerReadinessCache.set(cacheKey, isReady);
        }

        if (!isReady) {
          const detail = this.getReadinessDetail(cacheKey);
          const reasonMsg = detail ? `[${detail.code}: ${detail.label}] ${detail.message}` : 'Gateway belum terhubung';
          console.warn(`[Campaign Queue] Provider ${provider.providerType} belum siap (${reasonMsg}) untuk organisasi ${orgId}. Menunda pengiriman ke +${maskPhone(item.phone)}...`);
          continue;
        }

        // TAHAP 4: KONTROL KONKURENSI (Atomic Check-and-Set)
        // Kunci item ke 'processing' agar worker/thread lain tidak memproses penerima yang sama
        const { data: locked, error: lockErr } = await supabase
          .from('campaign_recipients')
          .update({
            status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id)
          .eq('status', 'pending')
          .select('id');

        if (lockErr || !locked || locked.length === 0) {
          // Gagal mengunci (sudah diambil proses lain) -> lewati
          continue;
        }

        console.log(`[Campaign Queue] Mengirim siaran ke ${item.name} (+${maskPhone(item.phone)}) untuk kampanye "${campObj.name}" via ${provider.providerType}...`);

        // TAHAP 5: PENGIRIMAN VIA PROVIDER (Baileys Staging atau Meta Cloud API)
        const sendResult = await provider.sendMessage({
          organizationId: campObj.organization_id,
          recipientPhone: item.phone,
          text: campObj.message_body,
        });

        if (sendResult.success) {
          // Berhasil dikirim ke gateway WhatsApp
          const messageId = sendResult.providerMessageId || null;
          await supabase
            .from('campaign_recipients')
            .update({
              status: 'sent',
              baileys_message_id: messageId,
              provider_type: sendResult.provider,
              provider_message_id: messageId,
              error_message: null,
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

          console.log(`[Campaign Queue] Sukses terkirim ke +${maskPhone(item.phone)} via ${sendResult.provider}! (ID: ${messageId || 'N/A'})`);
        } else {
          // Gagal mengirim
          const currentRetries = (item.retry_count || 0) + 1;
          const errMsg = sendResult.error || `Gagal mengirim melalui provider ${provider.providerType}`;

          if (currentRetries < this.maxRetries) {
            // Percobaan ulang (retry dengan backoff)
            await supabase
              .from('campaign_recipients')
              .update({
                status: 'pending',
                retry_count: currentRetries,
                error_message: `Gagal percobaan #${currentRetries}: ${errMsg}`,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);

            console.warn(`[Campaign Queue] Gagal ke +${maskPhone(item.phone)} (akan dicoba lagi #${currentRetries}/${this.maxRetries}): ${errMsg}`);
          } else {
            // Gagal permanen setelah mencapai batas maksimal retry
            await supabase
              .from('campaign_recipients')
              .update({
                status: 'failed',
                retry_count: currentRetries,
                error_message: `Gagal permanen setelah ${currentRetries} percobaan: ${errMsg}`,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);

            console.error(`[Campaign Queue] Gagal permanen ke +${maskPhone(item.phone)} setelah ${currentRetries}x percobaan.`);
          }
        }

        // TAHAP 6: THROTTLE DELAY (Jeda waktu aman antar pesan WhatsApp)
        await new Promise((resolve) => setTimeout(resolve, this.messageDelayMs));
      }

      // TAHAP 7: Perbarui status penyelesaian kampanye
      await this.checkCompletedCampaigns();
    } catch (err: any) {
      console.error('[Campaign Scheduler] Exception pada tick:', err?.message || err);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Memeriksa dan memperbarui kampanye berstatus 'running' yang semua antreannya selesai
   */
  private async checkCompletedCampaigns(): Promise<void> {
    const supabase = this.getSupabase();
    if (!supabase) return;

    try {
      const { data: runningCamps } = await supabase
        .from('campaigns')
        .select('id, name')
        .eq('status', 'running');

      if (!runningCamps || runningCamps.length === 0) return;

      for (const camp of runningCamps) {
        // Cek apakah masih ada penerima yang berstatus 'pending' atau 'processing'
        const { count: remainingCount } = await supabase
          .from('campaign_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', camp.id)
          .in('status', ['pending', 'processing']);

        if (remainingCount === 0) {
          // Hitung metrik final
          const { count: sentCount } = await supabase
            .from('campaign_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', camp.id)
            .in('status', ['sent', 'delivered']);

          const { count: failedCount } = await supabase
            .from('campaign_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', camp.id)
            .eq('status', 'failed');

          const { count: skippedCount } = await supabase
            .from('campaign_recipients')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', camp.id)
            .eq('status', 'skipped');

          await supabase
            .from('campaigns')
            .update({
              status: 'completed',
              sent_count: sentCount || 0,
              failed_count: failedCount || 0,
              skipped_count: skippedCount || 0,
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', camp.id);

          console.log(`[Campaign Scheduler] Kampanye "${camp.name}" (${camp.id}) SELESAI diproses! (Terkirim: ${sentCount || 0}, Gagal: ${failedCount || 0}, Dilewati: ${skippedCount || 0}).`);
        }
      }
    } catch (e: any) {
      console.warn('[Campaign Scheduler] Gagal mengecek kampanye selesai:', e?.message || e);
    }
  }

  /**
   * Menangani pembaruan status pengiriman (delivery receipt) dari Baileys
   */
  public async handleBaileysReceipt(baileysMessageId: string, deliveryStatus: string): Promise<void> {
    const supabase = this.getSupabase();
    if (!supabase || !baileysMessageId) return;

    try {
      // Jika status adalah tanda terima terkirim ke perangkat (delivered)
      if (deliveryStatus === 'delivered' || deliveryStatus === 'read') {
        const { error } = await supabase
          .from('campaign_recipients')
          .update({
            status: 'delivered',
            updated_at: new Date().toISOString(),
          })
          .eq('baileys_message_id', baileysMessageId)
          .eq('status', 'sent');

        if (!error) {
          console.log(`[Campaign Receipt] Penerima dengan Baileys ID ${baileysMessageId} terkonfirmasi 'delivered'.`);
        }
      }
    } catch (e: any) {
      console.warn('[Campaign Receipt] Error update receipt:', e?.message || e);
    }
  }
}

// Instance singleton scheduler kampanye
export const campaignScheduler = new CampaignQueueScheduler();
