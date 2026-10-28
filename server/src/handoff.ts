// ==========================================
// WABiz — Registration Intent Routing & CS Handoff
// ==========================================
// Bertanggung jawab mendeteksi niat pendaftaran, mencocokkan petugas CS
// pendaftaran yang valid dari database Supabase, dan mengirimkan notifikasi
// handoff nyata ke WhatsApp petugas serta mencatat status di conversations.
//
// KEAMANAN & ISOLASI:
// - Seluruh query dan mutasi database WAJIB memvalidasi organization_id di sisi server.
// - Nomor WhatsApp petugas CS diambil HANYA dari tabel public.team_members yang aktif.
// - Mencegah notifikasi berulang untuk percakapan yang sudah berhasil dialihkan.
// ==========================================

import { createWorkerSupabaseClient, normalizePhoneNumber } from './supabase';
import { OrgProfile } from './ai';
import { maskPhone } from './security';

export interface RegistrationCsMember {
  id: string;
  organizationId: string;
  fullName: string;
  email?: string;
  department: string;
  role: string;
  phone: string;
  isActive: boolean;
}

export type RegistrationIntentType =
  | 'none'
  | 'registration_info'
  | 'registration_intent';

export interface RegistrationIntentResult {
  intent: RegistrationIntentType;
  confidence: number;
  summary: string;
  isAmbiguous?: boolean;
}

export interface HandoffExecutionResult {
  success: boolean;
  handoffStatus: 'sent' | 'failed' | 'already_handled';
  csMember?: RegistrationCsMember;
  replyText: string;
  error?: string;
}

// ------------------------------------------
// 1. DETEKSI INTENT PENDAFTARAN BERBASIS KONTEKS & MULTI-BAHASA
// ------------------------------------------
export function detectRegistrationIntent(
  text: string,
  history?: Array<{ role?: string; sender?: string; text?: string }>
): RegistrationIntentResult {
  const raw = (text || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return { intent: 'none', confidence: 0, summary: '' };
  }

  // Pola Pertanyaan yang Murni Informasi (Bukan Handoff Langsung)
  // Contoh: "Pendaftaran tahun depan sudah dibuka belum?", "syarate opo wae?", "cara masuk gimana?"
  const isAskingSchedule =
    lower.includes('kapan buka') ||
    lower.includes('kapan dibuka') ||
    lower.includes('kapan pendaftaran') ||
    lower.includes('jadwal pendaftaran') ||
    lower.includes('jadwal psb') ||
    lower.includes('gelombang') ||
    lower.includes('sudah dibuka') ||
    lower.includes('kapan mulai') ||
    lower.includes('tahun depan sudah dibuka');

  const isAskingRequirements =
    lower.includes('syarat') ||
    lower.includes('persyaratan') ||
    lower.includes('syarate opo') ||
    lower.includes('berkas apa') ||
    lower.includes('dokumen') ||
    lower.includes('persyaratane');

  const isAskingProcedure =
    lower.includes('cara masuk') ||
    lower.includes('bagaimana cara') ||
    lower.includes('gimana cara') ||
    lower.includes('alur pendaftaran') ||
    lower.includes('tahapan pendaftaran') ||
    lower.includes('prosedur');

  const isAskingCostOnly =
    (lower.includes('biaya') || lower.includes('biyaya') || lower.includes('tarif') || lower.includes('uang pendaftaran')) &&
    !lower.includes('saya mau') &&
    !lower.includes('daftarkan');

  // Pola Niat Kuat Pendaftaran (Strong Registration Intent -> Trigger Handoff)
  // Contoh: "Saya mau daftarkan anak saya.", "Aku pengin mondok di sini.", "How can I enroll my child?"
  const hasStrongIntentPattern =
    // Bahasa Indonesia
    lower.includes('mau daftarkan') ||
    lower.includes('daftarkan anak') ||
    lower.includes('mau mendaftar') ||
    lower.includes('ingin mendaftar') ||
    lower.includes('pengen daftar') ||
    lower.includes('mau daftar') ||
    lower.includes('berminat mendaftar') ||
    lower.includes('ingin memasukkan anak') ||
    lower.includes('mau masukkan anak') ||
    lower.includes('memasukkan anak') ||
    lower.includes('masukkan anak') ||
    lower.includes('bisa tolong daftarkan') ||
    lower.includes('tolong daftarkan') ||
    lower.includes('daftarin anak') ||
    lower.includes('bantu pendaftaran') ||
    lower.includes('siap mendaftar') ||
    // Bahasa Jawa (Lokal / Pesantren)
    lower.includes('pengin mondok') ||
    lower.includes('kepingin mondok') ||
    lower.includes('arep ndhaftar') ||
    lower.includes('arep daftar') ||
    lower.includes('arep mondok') ||
    lower.includes('pengen mlebu') ||
    lower.includes('nyantri neng kene') ||
    lower.includes('nyantri disini') ||
    // Bahasa Inggris
    lower.includes('enroll my child') ||
    lower.includes('how can i enroll') ||
    lower.includes('want to enroll') ||
    lower.includes('apply for admission') ||
    lower.includes('register my child');

  // Cek apakah pesan sebelumnya adalah tawaran CS pendaftaran dan pengguna merespons afirmasi
  let isAffirmativeCsResponse = false;
  if (Array.isArray(history) && history.length > 0) {
    const lastTurn = history[history.length - 1];
    const lastTurnText = (lastTurn.text || '').toLowerCase();
    const wasOfferedAdmissionsCs =
      lastTurnText.includes('panitia psb') ||
      lastTurnText.includes('cs pendaftaran') ||
      lastTurnText.includes('petugas pendaftaran') ||
      lastTurnText.includes('mendampingi') ||
      lastTurnText.includes('hubungkan');

    const isAffirmative =
      lower === 'iya' ||
      lower === 'ya' ||
      lower === 'mau' ||
      lower === 'iya mau' ||
      lower === 'ya mau' ||
      lower === 'boleh' ||
      lower === 'bisa' ||
      lower === 'silakan' ||
      lower === 'siap' ||
      lower.startsWith('iya') ||
      lower.startsWith('ya,');

    if (wasOfferedAdmissionsCs && isAffirmative) {
      isAffirmativeCsResponse = true;
    }
  }

  // 1. Pertanyaan Informasi Pendaftaran (Syarat, Jadwal, Prosedur, Biaya)
  // Pengguna menanyakan informasi terlebih dahulu sebelum memulai pendaftaran.
  if (isAskingRequirements || isAskingSchedule || isAskingProcedure || isAskingCostOnly) {
    return {
      intent: 'registration_info',
      confidence: 0.9,
      summary: raw.length > 120 ? raw.slice(0, 120) + '...' : raw,
    };
  }

  // 2. Niat Kuat Pendaftaran (Direct Intent / Enrollment Request)
  if (hasStrongIntentPattern || isAffirmativeCsResponse) {
    return {
      intent: 'registration_intent',
      confidence: 0.95,
      summary: raw.length > 120 ? raw.slice(0, 120) + '...' : raw,
    };
  }

  // 3. Kata Kunci Umum Pendaftaran / PSB
  if (lower.includes('psb') || lower.includes('pendaftaran') || lower.includes('mendaftar')) {
    return {
      intent: 'registration_info',
      confidence: 0.8,
      summary: raw.length > 120 ? raw.slice(0, 120) + '...' : raw,
    };
  }

  return {
    intent: 'none',
    confidence: 0,
    summary: '',
  };
}

// ------------------------------------------
// 2. PEMILIHAN PETUGAS CS PENDAFTARAN DARI DATABASE
// ------------------------------------------
export async function findRegistrationCs(
  orgId: string
): Promise<RegistrationCsMember | null> {
  const supabase = createWorkerSupabaseClient();
  if (!supabase || !orgId) {
    return null;
  }

  try {
    const { data: members, error } = await supabase
      .from('team_members')
      .select('id, organization_id, full_name, email, department, role, phone, is_active')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (error) {
      console.warn('[CS Handoff] Gagal memuat daftar anggota tim:', error.message);
      return null;
    }

    if (!members || members.length === 0) {
      console.log(`[CS Handoff] Tidak ada anggota tim aktif pada organisasi ${orgId}.`);
      return null;
    }

    // Filter petugas divisi Pendaftaran / PSB yang memiliki nomor WhatsApp valid
    const eligibleCsList: RegistrationCsMember[] = [];

    for (const m of members) {
      const dept = (m.department || '').toLowerCase();
      const isRegistrationDept =
        dept.includes('daftar') ||
        dept.includes('psb') ||
        dept.includes('admis') ||
        dept.includes('penerimaan');

      if (!isRegistrationDept) continue;

      const rawPhone = m.phone ? String(m.phone).trim() : '';
      const cleanPhone = normalizePhoneNumber(rawPhone);

      // Nomor valid minimal 9 digit (e.g. 628xxxxxxxx)
      if (cleanPhone && cleanPhone.length >= 9) {
        eligibleCsList.push({
          id: m.id,
          organizationId: m.organization_id,
          fullName: m.full_name,
          email: m.email || undefined,
          department: m.department || 'Pendaftaran / PSB',
          role: m.role || 'Customer Service',
          phone: cleanPhone,
          isActive: Boolean(m.is_active),
        });
      }
    }

    if (eligibleCsList.length === 0) {
      console.log(`[CS Handoff] Tidak ditemukan anggota tim di divisi Pendaftaran/PSB dengan nomor WhatsApp valid pada org ${orgId}.`);
      return null;
    }

    // Pilih petugas pertama (atau dapat dikembangkan menjadi round-robin)
    const selected = eligibleCsList[0];
    console.log(`[CS Handoff] Petugas CS Pendaftaran terpilih: ${selected.fullName} (+${selected.phone})`);
    return selected;
  } catch (err: any) {
    console.error('[CS Handoff] Exception saat mencari CS pendaftaran:', err?.message || err);
    return null;
  }
}

// ------------------------------------------
// 3. EKSEKUSI HANDOFF & PENGIRIMAN NOTIFIKASI
// ------------------------------------------
export interface ExecuteHandoffParams {
  orgId: string;
  conversationId: string;
  customerPhone: string;
  customerName?: string;
  promptText: string;
  profile: OrgProfile;
  sendWhatsAppMessageFn: (toPhone: string, text: string) => Promise<{ success: boolean; messageId?: string; error?: string }>;
}

export async function executeRegistrationHandoff(
  params: ExecuteHandoffParams
): Promise<HandoffExecutionResult> {
  const {
    orgId,
    conversationId,
    customerPhone,
    customerName,
    promptText,
    profile,
    sendWhatsAppMessageFn,
  } = params;

  const supabase = createWorkerSupabaseClient();
  const orgName = profile.orgName || 'Lembaga Pendidikan';
  const cleanCustomerPhone = normalizePhoneNumber(customerPhone);
  const displayName = customerName && customerName.trim() ? customerName.trim() : `Pelanggan (+${cleanCustomerPhone})`;
  const nowIso = new Date().toISOString();
  const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  // Teks tautan pendaftaran resmi (jika ada pada profil organisasi)
  let regLinkText = '';
  if (profile.registrationUrl && profile.registrationUrl.trim().startsWith('http')) {
    regLinkText = `\n\n🔗 *Formulir Pendaftaran Online:*\n${profile.registrationUrl.trim()}`;
  }

  // 1. CEK DEDUPLIKASI / STATUS PERCAKAPAN
  // Mencegah handoff berulang dalam percakapan yang sama
  if (supabase) {
    try {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id, handoff_status, handoff_cs_phone, assigned_to')
        .eq('id', conversationId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (conv && (conv.handoff_status === 'sent' || conv.handoff_status === 'pending')) {
        console.log(`[CS Handoff] Percakapan ${conversationId} sudah berstatus '${conv.handoff_status}'. Handoff ganda dilewati.`);
        const replyText =
          `Terima kasih, Ayah/Bunda. Data dan permohonan pendaftaran Anda telah tercatat dan sebelumnya telah kami teruskan kepada petugas pendaftaran kami.\n\n` +
          `Petugas kami akan segera menghubungi nomor Ayah/Bunda untuk panduan pendaftaran selanjutnya.${regLinkText}\n\n` +
          `Bila ada pertanyaan lain mengenai berkas atau jadwal, silakan tanyakan di sini.`;

        return {
          success: true,
          handoffStatus: 'already_handled',
          replyText,
        };
      }
    } catch (checkErr: any) {
      console.warn('[CS Handoff] Peringatan saat cek status percakapan:', checkErr?.message || checkErr);
    }
  }

  // 2. CARI PETUGAS CS PENDAFTARAN DARI KONFIGURASI TIM
  const csMember = await findRegistrationCs(orgId);

  // KONDISI A: BELUM ADA PETUGAS PENDAFTARAN YANG VALID
  if (!csMember) {
    console.warn(`[CS Handoff] Handoff tidak dapat diteruskan karena belum ada petugas CS Pendaftaran valid.`);

    // Catat status 'failed' pada percakapan di Supabase
    if (supabase) {
      try {
        await supabase
          .from('conversations')
          .update({
            handoff_status: 'failed',
            handoff_department: 'Pendaftaran / PSB',
            handoff_summary: promptText.slice(0, 150),
            handoff_error: 'Belum ada petugas CS Pendaftaran aktif dengan nomor WhatsApp yang valid.',
            updated_at: nowIso,
          })
          .eq('id', conversationId)
          .eq('organization_id', orgId);
      } catch (updateErr: any) {
        console.warn('[CS Handoff] Gagal mengupdate status gagal ke percakapan:', updateErr?.message);
      }
    }

    // Beritahu pelanggan secara natural TANPA mengklaim pengalihan berhasil
    let replyText =
      `Terima kasih atas ketertarikan dan niat Ayah/Bunda untuk mendaftar di *${orgName}*.\n\n` +
      `Saat ini jalur notifikasi langsung petugas pendaftaran kami belum terhubung di sistem.\n`;

    if (profile.registrationUrl && profile.registrationUrl.trim().startsWith('http')) {
      replyText += `Namun, Ayah/Bunda dapat langsung melakukan pengisian formulir pendaftaran secara online melalui portal resmi berikut:${regLinkText}\n\n`;
    }

    if (profile.address && profile.address.trim()) {
      replyText += `Ayah/Bunda juga dapat datang langsung ke kantor sekretariat pendaftaran kami di:\n📍 ${profile.address.trim()}\n`;
    }

    if (profile.csHours && profile.csHours.trim()) {
      replyText += `(Jam layanan: ${profile.csHours.trim()})\n\n`;
    }

    replyText += `Tim kami akan tetap memantau pesan masuk ini melalui dashboard WABiz. Ada informasi berkas atau program yang ingin ditanyakan terlebih dahulu?`;

    return {
      success: false,
      handoffStatus: 'failed',
      replyText,
      error: 'no_registration_cs_configured',
    };
  }

  // KONDISI B: PETUGAS CS TERSEDIA -> KIRIM NOTIFIKASI NYATA KE WHATSAPP PETUGAS
  // Tandai status 'pending' terlebih dahulu
  if (supabase) {
    try {
      await supabase
        .from('conversations')
        .update({
          assigned_to: csMember.id,
          handoff_status: 'pending',
          handoff_department: csMember.department,
          handoff_cs_phone: csMember.phone,
          handoff_summary: promptText.slice(0, 150),
          updated_at: nowIso,
        })
        .eq('id', conversationId)
        .eq('organization_id', orgId);
    } catch (e: any) {
      console.warn('[CS Handoff] Gagal mencatat status pending:', e?.message);
    }
  }

  // Format pesan notifikasi untuk WhatsApp CS
  const csNotificationBody =
    `🔔 *NOTIFIKASI CALON PENDAFTAR BARU (WABiz)*\n\n` +
    `Halo *${csMember.fullName}* (${csMember.department}),\n` +
    `Terdapat calon santri/siswa baru yang membutuhkan tindak lanjut:\n\n` +
    `• *Nama*: ${displayName}\n` +
    `• *Nomor WhatsApp*: +${cleanCustomerPhone}\n` +
    `• *Kebutuhan/Pesan*: "${promptText.trim()}"\n` +
    `• *Ref Percakapan*: ${conversationId}\n` +
    `• *Waktu*: ${nowTime} WIB\n\n` +
    `Mohon segera ditindaklanjuti melalui menu Percakapan dashboard WABiz atau hubungi calon pendaftar via WhatsApp. Terima kasih!`;

  console.log(`[CS Handoff] Mengirim notifikasi WhatsApp ke CS ${csMember.fullName} (+${maskPhone(csMember.phone)})...`);

  let sendResult: { success: boolean; messageId?: string; error?: string };
  try {
    sendResult = await sendWhatsAppMessageFn(csMember.phone, csNotificationBody);
  } catch (sendErr: any) {
    sendResult = { success: false, error: sendErr?.message || String(sendErr) };
  }

  // 3. EVALUASI HASIL PENGIRIMAN NOTIFIKASI
  if (sendResult.success) {
    console.log(`[CS Handoff] Notifikasi ke CS berhasil terkirim! (Msg ID: ${sendResult.messageId || 'N/A'})`);

    // Perbarui status menjadi 'sent'
    if (supabase) {
      try {
        await supabase
          .from('conversations')
          .update({
            assigned_to: csMember.id,
            handoff_status: 'sent',
            handoff_notified_at: nowIso,
            handoff_error: null,
            updated_at: nowIso,
          })
          .eq('id', conversationId)
          .eq('organization_id', orgId);

        // Catat pesan sistem di tabel messages
        await supabase.from('messages').insert({
          organization_id: orgId,
          conversation_id: conversationId,
          sender_type: 'system',
          body: `Calon pendaftar berhasil dialihkan ke petugas CS: ${csMember.fullName} (+${csMember.phone}) [Ref: ${sendResult.messageId || 'OK'}]`,
          sent_at: nowIso,
        });
      } catch (dbErr: any) {
        console.error('[CS Handoff] Gagal update status sent ke Supabase:', dbErr?.message);
      }
    }

    // Kirim konfirmasi kepada pelanggan bahwa notifikasi telah disampaikan ke petugas
    const replyText =
      `Alhamdulillah, terima kasih banyak atas minat Ayah/Bunda untuk mendaftar di *${orgName}*.\n\n` +
      `Data dan permohonan pendaftaran Anda telah kami teruskan langsung ke petugas pendaftaran kami, *Kak ${csMember.fullName}* (${csMember.department}).\n\n` +
      `Petugas kami akan segera menghubungi Ayah/Bunda melalui WhatsApp ini untuk memberikan panduan pendaftaran secara lengkap.${regLinkText}\n\n` +
      `Ada berkas atau informasi awal yang ingin dipersiapkan terlebih dahulu?`;

    return {
      success: true,
      handoffStatus: 'sent',
      csMember,
      replyText,
    };
  } else {
    // PENGIRIMAN KE CS GAGAL
    console.error(`[CS Handoff] Gagal mengirim notifikasi ke CS: ${sendResult.error}`);

    if (supabase) {
      try {
        await supabase
          .from('conversations')
          .update({
            handoff_status: 'failed',
            handoff_error: `Gagal mengirim WhatsApp ke petugas (+${csMember.phone}): ${sendResult.error || 'Worker offline'}`,
            updated_at: nowIso,
          })
          .eq('id', conversationId)
          .eq('organization_id', orgId);
      } catch (dbErr: any) {
        console.error('[CS Handoff] Gagal update status failed ke Supabase:', dbErr?.message);
      }
    }

    const replyText =
      `Terima kasih atas ketertarikan Ayah/Bunda untuk mendaftar di *${orgName}*.\n\n` +
      `Kami telah mencatat niat pendaftaran Anda di sistem kami. Saat ini pengiriman notifikasi otomatis ke petugas sedang mengalami kendala jaringan, namun tim kami dapat memantau percakapan ini secara langsung melalui dashboard WABiz.${regLinkText}\n\n` +
      `Silakan tuliskan nama calon santri/siswa atau pertanyaan lain yang ingin Ayah/Bunda ketahui.`;

    return {
      success: false,
      handoffStatus: 'failed',
      csMember,
      replyText,
      error: sendResult.error,
    };
  }
}

// ------------------------------------------
// 4. RETRY HANDOFF (DARI DASHBOARD / API)
// ------------------------------------------
export async function retryRegistrationHandoff(
  orgId: string,
  conversationId: string,
  sendWhatsAppMessageFn: (toPhone: string, text: string) => Promise<{ success: boolean; messageId?: string; error?: string }>,
  profile: OrgProfile
): Promise<HandoffExecutionResult> {
  const supabase = createWorkerSupabaseClient();
  if (!supabase || !orgId || !conversationId) {
    return {
      success: false,
      handoffStatus: 'failed',
      replyText: '',
      error: 'Parameter tidak lengkap atau database tidak terkonfigurasi.',
    };
  }

  // 1. Ambil data percakapan & kontak
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select(`
      id,
      organization_id,
      contact_id,
      handoff_status,
      handoff_summary,
      contacts (
        id,
        name,
        phone
      )
    `)
    .eq('id', conversationId)
    .eq('organization_id', orgId)
    .single();

  if (convErr || !conv) {
    return {
      success: false,
      handoffStatus: 'failed',
      replyText: '',
      error: 'Percakapan tidak ditemukan atau akses organisasi tidak sesuai.',
    };
  }

  const contactObj = Array.isArray(conv.contacts) ? conv.contacts[0] : conv.contacts;
  const customerPhone = contactObj?.phone || '';
  const customerName = contactObj?.name || 'Pelanggan';
  const promptText = conv.handoff_summary || 'Permohonan pendaftaran calon santri/siswa baru';

  return executeRegistrationHandoff({
    orgId,
    conversationId,
    customerPhone,
    customerName,
    promptText,
    profile,
    sendWhatsAppMessageFn,
  });
}
