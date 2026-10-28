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

import crypto from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';
import { OrgProfile, setActiveProfile, DEFAULT_ORG_PROFILE } from './ai';

/**
 * Apakah worker memiliki konfigurasi Supabase yang valid?
 */
export function isWorkerSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL?.trim() || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  return (
    url.length > 0 &&
    key.length > 0 &&
    url.startsWith('http')
  );
}

/**
 * Buat Supabase client dengan service role key (bypass RLS).
 * Digunakan server-side untuk membaca profil dan persistensi pesan.
 */
export function createWorkerSupabaseClient(): SupabaseClient | null {
  if (!isWorkerSupabaseConfigured()) {
    return null;
  }
  const url = process.env.SUPABASE_URL?.trim() || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const getWorkerSupabaseClient = createWorkerSupabaseClient;

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

/**
 * Normalisasi nomor telepon standar Indonesia / internasional
 * Contoh: '0812-3456-7890' -> '6281234567890'
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  // Jika JID Baileys memiliki device ID (misal: 6281234567890:12@s.whatsapp.net), ambil sebelum ':' dan '@'
  let str = rawPhone.split('@')[0];
  if (str.includes(':')) {
    str = str.split(':')[0];
  }
  let cleaned = str.replace(/\D/g, '');
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  }
  return cleaned;
}

export type AiProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'needs_reconciliation';

export interface InboundMessageParams {
  orgId: string;
  senderPhone: string;
  senderName?: string;
  textBody: string;
  messageTimestamp?: number;
  messageId?: string;
  providerType?: 'baileys' | 'meta_cloud_api' | 'openwa';
  providerMessageId?: string;
  aiStatus?: AiProcessingStatus;
}

export interface InboundMessageResult {
  contactId: string;
  conversationId: string;
  messageId: string;
  aiStatus?: AiProcessingStatus;
}

/**
 * Menyimpan atau memperbarui kontak pelanggan tanpa membuat duplikat
 */
export async function upsertContact(
  orgId: string,
  rawPhone: string,
  senderName?: string,
  client?: SupabaseClient | any
): Promise<{ id: string; name: string; phone: string } | null> {
  const supabase = client || createWorkerSupabaseClient();
  if (!supabase || !orgId) return null;

  const cleanPhone = normalizePhoneNumber(rawPhone);
  if (!cleanPhone) return null;

  // 1. Cek apakah kontak sudah ada di organisasi ini
  try {
    const { data: existing, error: selectErr } = await supabase
      .from('contacts')
      .select('id, name, phone')
      .eq('organization_id', orgId)
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (existing && existing.id) {
      return { id: existing.id, name: existing.name, phone: existing.phone || cleanPhone };
    }

    if (selectErr && selectErr.code !== 'PGRST116') {
      console.warn('[Supabase Contact] Error pengecekan kontak:', selectErr.message);
    }
  } catch (err: any) {
    console.warn('[Supabase Contact] Exception saat cek kontak:', err?.message || err);
  }

  // 2. Buat kontak baru jika belum ada
  const contactName = (senderName && senderName.trim()) ? senderName.trim() : `WhatsApp +${cleanPhone}`;
  try {
    const { data: inserted, error: insertErr } = await supabase
      .from('contacts')
      .insert({
        organization_id: orgId,
        name: contactName,
        phone: cleanPhone,
        labels: ['Umum'],
      })
      .select('id, name')
      .single();

    if (inserted && inserted.id) {
      return { id: inserted.id, name: inserted.name, phone: cleanPhone };
    }

    // Jika terjadi race condition (unique violation), ambil kontak yang baru saja diinsert
    if (insertErr && (insertErr.code === '23505' || insertErr.message.includes('unique'))) {
      const { data: reselected } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('organization_id', orgId)
        .eq('phone', cleanPhone)
        .maybeSingle();
      if (reselected && reselected.id) {
        return { id: reselected.id, name: reselected.name, phone: reselected.phone || cleanPhone };
      }
    }

    console.warn('[Supabase Contact] Gagal membuat kontak:', insertErr?.message);
    return null;
  } catch (err: any) {
    console.warn('[Supabase Contact] Exception saat membuat kontak:', err?.message || err);
    return null;
  }
}

/**
 * Mencari atau membuat percakapan untuk kontak dalam organisasi
 */
export async function getOrCreateConversation(
  orgId: string,
  contactId: string,
  client?: SupabaseClient | any
): Promise<string | null> {
  const supabase = client || createWorkerSupabaseClient();
  if (!supabase || !orgId || !contactId) return null;

  const nowIso = new Date().toISOString();

  try {
    // 1. Cari percakapan aktif yang sudah ada
    const { data: existing, error: findErr } = await supabase
      .from('conversations')
      .select('id, status')
      .eq('organization_id', orgId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && existing.id) {
      // Perbarui waktu pesan terakhir, dan buka kembali jika status sebelumnya resolved
      const newStatus = existing.status === 'resolved' ? 'open' : existing.status;
      await supabase
        .from('conversations')
        .update({
          last_message_at: nowIso,
          status: newStatus,
          updated_at: nowIso,
        })
        .eq('id', existing.id)
        .eq('organization_id', orgId);

      return existing.id;
    }

    if (findErr && findErr.code !== 'PGRST116') {
      console.warn('[Supabase Conversation] Error pencarian percakapan:', findErr.message);
    }
  } catch (err: any) {
    console.warn('[Supabase Conversation] Exception saat cek percakapan:', err?.message || err);
  }

  // 2. Buat percakapan baru jika belum ada
  try {
    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({
        organization_id: orgId,
        contact_id: contactId,
        status: 'open',
        last_message_at: nowIso,
      })
      .select('id')
      .single();

    if (created && created.id) {
      return created.id;
    }

    console.warn('[Supabase Conversation] Gagal membuat percakapan:', createErr?.message);
    return null;
  } catch (err: any) {
    console.warn('[Supabase Conversation] Exception saat membuat percakapan:', err?.message || err);
    return null;
  }
}

/**
 * Menyimpan pesan masuk dari pelanggan WhatsApp ke Supabase
 */
export async function persistInboundWhatsAppMessage(
  params: InboundMessageParams,
  client?: SupabaseClient | any
): Promise<InboundMessageResult | null> {
  const { orgId, senderPhone, senderName, textBody, messageTimestamp } = params;
  const supabase = client || createWorkerSupabaseClient();
  if (!supabase || !orgId || !senderPhone || !textBody) {
    return null;
  }

  try {
    // 1. Upsert kontak
    const contact = await upsertContact(orgId, senderPhone, senderName, supabase);
    if (!contact) {
      console.warn(`[Supabase Persistence] Tidak dapat mengaitkan kontak untuk +${senderPhone}.`);
      return null;
    }

    // 2. Cari atau buat percakapan
    const convId = await getOrCreateConversation(orgId, contact.id, supabase);
    if (!convId) {
      console.warn(`[Supabase Persistence] Tidak dapat mengaitkan percakapan untuk kontak ID ${contact.id}.`);
      return null;
    }

    // 3. Simpan pesan masuk ke public.messages
    const sentAtIso = messageTimestamp ? new Date(messageTimestamp).toISOString() : new Date().toISOString();
    const msgPayload: any = {
      organization_id: orgId,
      conversation_id: convId,
      sender_type: 'customer',
      body: textBody,
      sent_at: sentAtIso,
      provider_type: params.providerType || 'baileys',
      provider_message_id: params.providerMessageId || params.messageId || null,
      delivery_status: 'delivered',
    };
    if (params.aiStatus) {
      msgPayload.ai_status = params.aiStatus;
    }

    let { data: msgRow, error: msgErr } = await supabase
      .from('messages')
      .insert(msgPayload)
      .select('id')
      .single();

    // Defensive fallback jika skema live belum dimigrasi (kolom ai_status belum ada di DB)
    if (msgErr && msgPayload.ai_status && (msgErr.message?.includes('ai_status') || msgErr.code === 'PGRST204')) {
      delete msgPayload.ai_status;
      const retry = await supabase.from('messages').insert(msgPayload).select('id').single();
      msgRow = retry.data;
      msgErr = retry.error;
    }

    // Penanganan race condition unik: jika dua webhook tiba bersamaan (error 23505 uq_messages_org_provider_msg_id),
    // ambil baris pesan yang sudah berhasil disimpan oleh worker pertama
    if (msgErr && (msgErr.code === '23505' || msgErr.message?.includes('uq_messages_org_provider_msg_id') || msgErr.message?.includes('unique'))) {
      const { data: reselected } = await supabase
        .from('messages')
        .select('id, conversation_id, ai_status')
        .eq('organization_id', orgId)
        .eq('provider_type', msgPayload.provider_type)
        .eq('provider_message_id', msgPayload.provider_message_id)
        .maybeSingle();

      if (reselected && reselected.id) {
        return {
          contactId: contact.id,
          conversationId: reselected.conversation_id || convId,
          messageId: reselected.id,
          aiStatus: reselected.ai_status || params.aiStatus || 'completed',
        };
      }
    }

    if (msgErr || !msgRow) {
      console.warn('[Supabase Persistence] Gagal menyimpan pesan masuk ke messages:', msgErr?.message);
      return null;
    }

    // 4. Update last_message_at pada percakapan
    await supabase
      .from('conversations')
      .update({
        last_message_at: sentAtIso,
        updated_at: new Date().toISOString(),
      })
      .eq('id', convId)
      .eq('organization_id', orgId);

    return {
      contactId: contact.id,
      conversationId: convId,
      messageId: msgRow.id,
      aiStatus: params.aiStatus || 'completed',
    };
  } catch (err: any) {
    console.error('[Supabase Persistence] Exception saat menyimpan pesan masuk:', err?.message || err);
    return null;
  }
}

/**
 * Menyimpan pesan balasan keluar (AI Bot atau CS) ke Supabase
 *
 * Mendukung atribusi eksplisit ke pesan masuk via `replyToMessageId`.
 */
export async function persistOutboundWhatsAppMessage(
  orgId: string,
  conversationId: string,
  body: string,
  senderType: 'bot' | 'agent' = 'bot',
  providerType: 'baileys' | 'meta_cloud_api' | 'openwa' = 'baileys',
  providerMessageId?: string,
  replyToMessageId?: string,
  client?: SupabaseClient | any
): Promise<{ messageId: string } | null> {
  const supabase = client || createWorkerSupabaseClient();
  if (!supabase || !orgId || !conversationId || !body) {
    return null;
  }

  const nowIso = new Date().toISOString();

  try {
    const msgPayload: any = {
      organization_id: orgId,
      conversation_id: conversationId,
      sender_type: senderType,
      body,
      sent_at: nowIso,
      provider_type: providerType,
      provider_message_id: providerMessageId || null,
      delivery_status: 'sent',
    };
    if (replyToMessageId) {
      msgPayload.reply_to_message_id = replyToMessageId;
    }

    let { data: msgRow, error: msgErr } = await supabase
      .from('messages')
      .insert(msgPayload)
      .select('id')
      .single();

    // Defensive fallback jika skema live belum dimigrasi (kolom reply_to_message_id belum ada di DB)
    if (msgErr && msgPayload.reply_to_message_id && (msgErr.message?.includes('reply_to_message_id') || msgErr.code === 'PGRST204')) {
      delete msgPayload.reply_to_message_id;
      const retry = await supabase.from('messages').insert(msgPayload).select('id').single();
      msgRow = retry.data;
      msgErr = retry.error;
    }

    if (msgErr || !msgRow) {
      console.warn('[Supabase Persistence] Gagal menyimpan pesan keluar ke messages:', msgErr?.message);
      return null;
    }

    // Update percakapan
    await supabase
      .from('conversations')
      .update({
        last_message_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', conversationId)
      .eq('organization_id', orgId);

    return { messageId: msgRow.id };
  } catch (err: any) {
    console.error('[Supabase Persistence] Exception saat menyimpan pesan keluar:', err?.message || err);
    return null;
  }
}

export interface DeleteConversationResult {
  success: boolean;
  notFound?: boolean;
  deletedId?: string;
  message?: string;
  error?: string;
}

/**
 * Menghapus percakapan beserta seluruh pesan terkait secara aman.
 * 
 * ATURAN KEAMANAN & INTEGRITAS DATA:
 * 1. Diwajibkan menyertakan orgId dan conversationId.
 * 2. Hanya percakapan milik organisasi yang bersangkutan yang dapat dihapus (tenant isolation).
 * 3. Relasi database messages memiliki ON DELETE CASCADE pada foreign key (conversation_id, organization_id),
 *    sehingga seluruh pesan pada percakapan ini terhapus secara atomik oleh database.
 * 4. Data kontak (public.contacts), profil organisasi, kampanye, dan anggota tim TIDAK DIHAPUS dan tetap utuh.
 */
export async function deleteConversation(
  orgId: string,
  conversationId: string,
  client?: SupabaseClient | any
): Promise<DeleteConversationResult> {
  if (!orgId || !conversationId) {
    return {
      success: false,
      error: 'Parameter orgId dan conversationId wajib disertakan.',
    };
  }

  const supabase = client || createWorkerSupabaseClient();
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase client tidak tersedia di worker backend.',
    };
  }

  try {
    // 1. Cek keberadaan percakapan dalam batas isolasi tenant
    const { data: existing, error: findErr } = await supabase
      .from('conversations')
      .select('id, organization_id, contact_id')
      .eq('id', conversationId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (findErr) {
      return {
        success: false,
        error: `Gagal memeriksa percakapan: ${findErr.message}`,
      };
    }

    if (!existing) {
      return {
        success: false,
        notFound: true,
        error: 'Percakapan tidak ditemukan atau bukan milik organisasi Anda.',
      };
    }

    // 2. Hapus percakapan dari database
    // Foreign key constraint messages_conversation_org_fk memiliki ON DELETE CASCADE,
    // sehingga seluruh pesan terkait dalam organisasi ini otomatis terhapus atomik.
    // Data kontak (public.contacts) tetap utuh karena referensi contact_id bersifat nullable.
    const { error: delErr } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .eq('organization_id', orgId);

    if (delErr) {
      return {
        success: false,
        error: `Gagal menghapus percakapan: ${delErr.message}`,
      };
    }

    return {
      success: true,
      deletedId: conversationId,
      message: 'Percakapan dan riwayat pesan berhasil dihapus dari WABiz.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Exception saat menghapus percakapan: ${err?.message || err}`,
    };
  }
}

export interface DeleteTeamMemberResult {
  success: boolean;
  notFound?: boolean;
  deletedId?: string;
  message?: string;
  error?: string;
}

/**
 * Menghapus anggota tim CS secara aman melalui backend worker terautentikasi.
 * 
 * ATURAN KEAMANAN & INTEGRITAS DATA:
 * 1. Diwajibkan menyertakan orgId dan memberId.
 * 2. Hanya anggota tim milik organisasi yang bersangkutan yang dapat dihapus (tenant isolation).
 * 3. Relasi database conversations memiliki ON DELETE SET NULL pada foreign key (assigned_to, organization_id),
 *    sehingga percakapan pelanggan yang pernah dialokasikan ke petugas ini tetap aman dan tidak terhapus.
 * 4. Data organisasi, profil, kontak, pesan, dan kampanye TIDAK DIHAPUS dan tetap utuh 100%.
 */
export async function deleteTeamMember(
  orgId: string,
  memberId: string,
  client?: SupabaseClient | any
): Promise<DeleteTeamMemberResult> {
  if (!orgId || !memberId) {
    return {
      success: false,
      error: 'Parameter orgId dan memberId wajib disertakan.',
    };
  }

  const supabase = client || createWorkerSupabaseClient();
  if (!supabase) {
    return {
      success: false,
      error: 'Supabase client tidak tersedia di worker backend.',
    };
  }

  try {
    // 1. Cek keberadaan anggota dalam batas isolasi tenant
    const { data: existing, error: findErr } = await supabase
      .from('team_members')
      .select('id, organization_id, full_name, email, role')
      .eq('id', memberId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (findErr) {
      return {
        success: false,
        error: `Gagal memeriksa anggota tim: ${findErr.message}`,
      };
    }

    if (!existing) {
      return {
        success: false,
        notFound: true,
        error: 'Anggota tim tidak ditemukan atau bukan milik organisasi Anda.',
      };
    }

    // 2. Hapus anggota tim dari database
    // Foreign key constraint conversations_assigned_to_org_fk memiliki ON DELETE SET NULL,
    // sehingga alokasi percakapan otomatis di-reset menjadi null tanpa menghapus riwayat percakapan.
    const { error: delErr } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId)
      .eq('organization_id', orgId);

    if (delErr) {
      return {
        success: false,
        error: `Gagal menghapus anggota tim: ${delErr.message}`,
      };
    }

    return {
      success: true,
      deletedId: memberId,
      message: `Anggota tim "${existing.full_name}" berhasil dihapus dari organisasi.`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Exception saat menghapus anggota tim: ${err?.message || err}`,
    };
  }
}

export interface ClaimInboundResult {
  claimed: boolean;
  leaseToken?: string;
  currentStatus?: AiProcessingStatus;
  reason?: string;
}

/**
 * Mengklaim pesan masuk secara atomik untuk pemrosesan AI.
 * Mengutamakan pemanggilan RPC PostgreSQL atomik `claim_inbound_message_for_ai`,
 * dengan fallback ke operasi conditional update aman di level PostgREST.
 *
 * Mengembalikan `leaseToken` unik untuk memagari status update (Lease Fencing).
 * Jika pesan berstatus processing dan lock stale:
 * - Jika `ai_dispatch_started_at IS NOT NULL`: beralih ke `needs_reconciliation` (anti-duplikasi).
 * - Jika `ai_dispatch_started_at IS NULL`: aman diambil alih dengan lease token baru.
 */
export async function claimInboundMessageForAi(
  orgId: string,
  messageId: string,
  lockTimeoutMs = 180000, // 3 menit
  client?: SupabaseClient | any
): Promise<ClaimInboundResult> {
  const supabase = client || createWorkerSupabaseClient();
  if (!supabase || !orgId || !messageId) {
    return { claimed: false, reason: 'missing_params' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const lockTimeoutSeconds = Math.round(lockTimeoutMs / 1000);

  try {
    // 1. Coba eksekusi melalui PostgreSQL RPC atomik jika tersedia
    if (typeof supabase.rpc === 'function') {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('claim_inbound_message_for_ai', {
          p_organization_id: orgId,
          p_message_id: messageId,
          p_lock_timeout_seconds: lockTimeoutSeconds,
        });

        if (!rpcErr && rpcData && typeof rpcData === 'object') {
          return {
            claimed: Boolean(rpcData.claimed),
            leaseToken: rpcData.lease_token || undefined,
            currentStatus: rpcData.current_status || undefined,
            reason: rpcData.reason || undefined,
          };
        }

        // Jika RPC belum terpasang (code 42883 / PGRST202), gunakan conditional query fallback
        if (rpcErr && rpcErr.code !== '42883' && rpcErr.code !== 'PGRST202' && !rpcErr.message?.includes('does not exist')) {
          console.warn(`[Supabase AI Claim RPC] Error saat RPC klaim ${messageId}:`, rpcErr.message);
        }
      } catch (rpcEx) {
        // Lanjutkan ke fallback aplikasi jika RPC gagal
      }
    }

    // 2. Fallback: Conditional Check & Lease Generation di Level PostgREST
    let { data: existing, error: fetchErr } = await supabase
      .from('messages')
      .select('id, organization_id, ai_status, ai_locked_at, ai_lease_token, ai_dispatch_started_at')
      .eq('organization_id', orgId)
      .eq('id', messageId)
      .maybeSingle();

    if (fetchErr && (fetchErr.message?.includes('ai_status') || fetchErr.code === '42703' || fetchErr.code === 'PGRST204')) {
      // Skema lama sebelum migrasi: fallback tanpa kolom ai_status
      const fallback = await supabase
        .from('messages')
        .select('id, organization_id')
        .eq('organization_id', orgId)
        .eq('id', messageId)
        .maybeSingle();
      if (fallback.data) {
        return { claimed: true, leaseToken: crypto.randomUUID(), currentStatus: 'completed' };
      }
      return { claimed: false, reason: 'message_not_found' };
    }

    if (fetchErr) {
      console.warn(`[Supabase AI Claim] Error saat memeriksa pesan ${messageId}:`, fetchErr.message);
      return { claimed: false, reason: 'fetch_error' };
    }

    if (!existing) {
      return { claimed: false, reason: 'message_not_found' };
    }

    const currentStatus: AiProcessingStatus = existing.ai_status || 'completed';

    // A. Sudah selesai -> jangan diproses ulang
    if (currentStatus === 'completed') {
      return { claimed: false, currentStatus, reason: 'already_completed' };
    }

    // B. Perlu rekonsiliasi manual / pengiriman tak-tentu -> hentikan retry buta
    if (currentStatus === 'needs_reconciliation') {
      return { claimed: false, currentStatus, reason: 'needs_reconciliation' };
    }

    // C. Gagal permanen -> tolak klaim ulang
    if (currentStatus === 'failed') {
      return { claimed: false, currentStatus, reason: 'already_failed' };
    }

    // D. Sedang diproses
    if (currentStatus === 'processing' && existing.ai_locked_at) {
      const lockTime = new Date(existing.ai_locked_at).getTime();
      if (now.getTime() - lockTime < lockTimeoutMs) {
        return { claimed: false, currentStatus, reason: 'in_progress_lock' };
      }

      // Lock stale: Evaluasi apakah worker lama mungkin sudah memulai pengiriman outbound!
      if (existing.ai_dispatch_started_at) {
        // Dispatch mungkin sudah berjalan ke gateway -> transisikan ke needs_reconciliation
        await supabase
          .from('messages')
          .update({
            ai_status: 'needs_reconciliation',
            ai_locked_at: null,
          })
          .eq('organization_id', orgId)
          .eq('id', messageId);

        console.warn(`[Supabase AI Claim] Pesan ${messageId} terkunci stale setelah dispatch dimulai. Dialihkan ke 'needs_reconciliation'.`);
        return { claimed: false, currentStatus: 'needs_reconciliation', reason: 'dispatch_in_doubt_needs_reconciliation' };
      }

      console.warn(`[Supabase AI Claim] Stale lock terdeteksi pada pesan ${messageId} (belum pernah dispatch). Mengambil alih klaim pemulihan.`);
    }

    // E. Terbitkan lease token baru secara unik untuk klaim aktif
    const newLeaseToken = crypto.randomUUID();
    const updatePayload: any = {
      ai_status: 'processing',
      ai_locked_at: nowIso,
      ai_lease_token: newLeaseToken,
      ai_dispatch_started_at: null,
    };

    let updateQuery = supabase
      .from('messages')
      .update(updatePayload)
      .eq('organization_id', orgId)
      .eq('id', messageId);

    // Conditional update: jika sebelumnya processing stale, pastikan lock time belum berubah
    if (currentStatus === 'processing' && existing.ai_locked_at) {
      updateQuery = updateQuery.eq('ai_locked_at', existing.ai_locked_at);
    } else if (currentStatus === 'pending') {
      updateQuery = updateQuery.eq('ai_status', 'pending');
    }

    const { data: updateData, error: updateErr } = await updateQuery.select('id, ai_lease_token');

    if (updateErr && (updateErr.message?.includes('ai_lease_token') || updateErr.code === '42703' || updateErr.code === 'PGRST204')) {
      // Skema belum punya kolom ai_lease_token -> update standar
      await supabase
        .from('messages')
        .update({ ai_status: 'processing', ai_locked_at: nowIso })
        .eq('organization_id', orgId)
        .eq('id', messageId);
      return { claimed: true, leaseToken: newLeaseToken, currentStatus: 'processing' };
    }

    if (updateErr) {
      console.warn(`[Supabase AI Claim] Gagal mengupdate klaim pesan ${messageId}:`, updateErr.message);
      return { claimed: false, currentStatus, reason: 'update_error' };
    }

    if (updateData && updateData.length === 0) {
      // Baris tidak berubah -> worker lain telah mendahului mengklaim (race condition terdeteksi aman)
      return { claimed: false, currentStatus: 'processing', reason: 'in_progress_lock' };
    }

    return { claimed: true, leaseToken: newLeaseToken, currentStatus: 'processing' };
  } catch (err: any) {
    console.error(`[Supabase AI Claim] Exception saat mengklaim pesan ${messageId}:`, err?.message || err);
    return { claimed: false, reason: 'exception' };
  }
}

/**
 * Menandai bahwa tahap pengiriman outbound ke gateway WhatsApp segera dimulai (Pre-Dispatch Check).
 * Memeriksa kepemilikan lease token: jika token tidak cocok atau kedaluwarsa,
 * pengiriman DIBATALKAN untuk mencegah balasan ganda.
 */
export async function markInboundMessageDispatching(
  orgId: string,
  messageId: string,
  leaseToken: string,
  client?: SupabaseClient | any
): Promise<boolean> {
  const supabase = client || createWorkerSupabaseClient();
  if (!supabase || !orgId || !messageId || !leaseToken) return false;

  const nowIso = new Date().toISOString();

  try {
    // 1. Coba panggil RPC jika tersedia
    if (typeof supabase.rpc === 'function') {
      try {
        const { data, error } = await supabase.rpc('mark_inbound_message_dispatching', {
          p_organization_id: orgId,
          p_message_id: messageId,
          p_lease_token: leaseToken,
        });
        if (!error && typeof data === 'boolean') {
          return data;
        }
      } catch (rpcEx) {
        // Fallback
      }
    }

    // 2. Conditional Update dengan Lease Fencing
    const { data, error } = await supabase
      .from('messages')
      .update({
        ai_dispatch_started_at: nowIso,
      })
      .eq('organization_id', orgId)
      .eq('id', messageId)
      .eq('ai_lease_token', leaseToken)
      .eq('ai_status', 'processing')
      .select('id');

    if (error && (error.message?.includes('ai_dispatch_started_at') || error.code === '42703' || error.code === 'PGRST204')) {
      // Skema belum punya kolom -> loloskan agar backward compatible
      return true;
    }

    if (error) {
      console.warn(`[Supabase Dispatch Mark] Error menandai dispatch untuk ${messageId}:`, error.message);
      return false;
    }

    // Jika data null atau kosong, baris tidak ter-update karena lease token tidak cocok
    return Boolean(data && data.length > 0);
  } catch (err: any) {
    console.error(`[Supabase Dispatch Mark] Exception saat menandai dispatch:`, err?.message || err);
    return false;
  }
}

/**
 * Memperbarui status pemrosesan AI pada pesan masuk dengan verifikasi Lease Token (Lease Fencing).
 * Mencegah worker lama menimpa hasil dari worker baru yang telah mengambil alih lock.
 */
export async function updateInboundMessageAiStatus(
  orgId: string,
  messageId: string,
  status: AiProcessingStatus,
  leaseToken?: string,
  client?: SupabaseClient | any
): Promise<boolean> {
  const supabase = client || createWorkerSupabaseClient();
  if (!supabase || !orgId || !messageId) return false;

  try {
    // 1. Coba panggil RPC jika tersedia
    if (typeof supabase.rpc === 'function') {
      try {
        const { data, error } = await supabase.rpc('update_inbound_message_ai_status', {
          p_organization_id: orgId,
          p_message_id: messageId,
          p_status: status,
          p_lease_token: leaseToken || null,
        });
        if (!error && typeof data === 'boolean') {
          return data;
        }
      } catch (rpcEx) {
        // Fallback
      }
    }

    // 2. Update via PostgREST dengan Lease Fencing
    const updatePayload: any = { ai_status: status };
    if (status === 'completed' || status === 'failed' || status === 'needs_reconciliation') {
      updatePayload.ai_locked_at = null;
    }

    let query = supabase
      .from('messages')
      .update(updatePayload)
      .eq('organization_id', orgId)
      .eq('id', messageId);

    if (leaseToken) {
      query = query.eq('ai_lease_token', leaseToken);
    }

    const { data, error } = await query.select('id');

    if (error && (error.message?.includes('ai_status') || error.code === '42703' || error.code === 'PGRST204')) {
      return true;
    }

    if (error) {
      console.warn(`[Supabase AI Status] Gagal mengupdate ai_status (${status}) untuk ${messageId}:`, error.message);
      return false;
    }

    // Jika tidak ada baris yang diperbarui (misal karena beda tenant atau lease token tidak cocok)
    if (!data || data.length === 0) {
      console.warn(`[Supabase AI Status] Lease fencing / Tenant mismatch: Tidak ada baris yang diperbarui untuk pesan ${messageId}.`);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error(`[Supabase AI Status] Exception saat mengupdate ai_status:`, err?.message || err);
    return false;
  }
}

/**
 * Mencari pesan balasan (outbound) yang secara spesifik mengikat pesan masuk ini via `reply_to_message_id`.
 * Menghindari asumsi salah bahwa sembarang pesan bot dalam percakapan adalah balasan.
 */
export async function getOutboundReplyForInbound(
  orgId: string,
  inboundMessageId: string,
  client?: SupabaseClient | any
): Promise<{ id: string; provider_message_id?: string; body: string } | null> {
  const supabase = client || createWorkerSupabaseClient();
  if (!supabase || !orgId || !inboundMessageId) return null;

  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, provider_message_id, body, delivery_status')
      .eq('organization_id', orgId)
      .eq('reply_to_message_id', inboundMessageId)
      .in('sender_type', ['bot', 'agent'])
      .in('delivery_status', ['sent', 'delivered', 'read'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && (error.message?.includes('reply_to_message_id') || error.code === '42703' || error.code === 'PGRST204')) {
      return null;
    }

    if (error && error.code !== 'PGRST116') {
      console.warn(`[Supabase Reply Lookup] Error mencari balasan untuk inbound ${inboundMessageId}:`, error.message);
      return null;
    }

    return data || null;
  } catch (err: any) {
    console.error(`[Supabase Reply Lookup] Exception saat mencari balasan:`, err?.message || err);
    return null;
  }
}
