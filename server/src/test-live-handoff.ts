// ==========================================
// Test Live Registration CS Handoff
// ==========================================
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { executeRegistrationHandoff } from './handoff';
import { OrgProfile, DEFAULT_ORG_PROFILE } from './ai';
import { createWorkerSupabaseClient } from './supabase';

async function runLiveTest() {
  console.log('--- Memulai Uji Coba Real Handoff CS Pendaftaran ---');

  const orgId = process.env.WORKER_ORG_ID || '12cc398e-9c11-4f30-a665-0583f369fd77';
  const supabase = createWorkerSupabaseClient();
  if (!supabase) {
    console.error('Supabase tidak terkonfigurasi');
    return;
  }

  // 1. Ambil salah satu percakapan staging
  const { data: convs, error: cErr } = await supabase
    .from('conversations')
    .select('id, contact_id, status, contacts(id, name, phone)')
    .eq('organization_id', orgId)
    .limit(1);

  if (cErr || !convs || convs.length === 0) {
    console.error('Tidak ada percakapan ditemukan:', cErr);
    return;
  }

  const testConv = convs[0];
  const contactObj = Array.isArray(testConv.contacts) ? testConv.contacts[0] : testConv.contacts;
  const custPhone = contactObj?.phone || '6281234567890';
  const custName = contactObj?.name || 'Calon Santri Baru';

  // Reset status handoff percakapan ke 'none' agar pengujian bersih
  await supabase
    .from('conversations')
    .update({ handoff_status: 'none', handoff_error: null })
    .eq('id', testConv.id)
    .eq('organization_id', orgId);

  const profile: OrgProfile = {
    ...DEFAULT_ORG_PROFILE,
    orgName: 'PDF Anwaarunnajah',
    registrationUrl: 'https://anwaarunnajah.sch.id/psb',
  };

  // Mock sender yang memanggil endpoint /api/send worker yang sedang live
  const sendRealNotification = async (toPhone: string, text: string) => {
    const res = await fetch('http://127.0.0.1:4000/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.LOCAL_API_KEY || '',
      },
      body: JSON.stringify({ to: toPhone, message: text }),
    });
    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, messageId: json.data?.messageId };
    }
    return { success: false, error: json.error || `HTTP ${res.status}` };
  };

  console.log(`Menguji handoff untuk percakapan: ${testConv.id}`);
  console.log(`Pengirim: ${custName} (+${custPhone})`);

  const handoffResult = await executeRegistrationHandoff({
    orgId,
    conversationId: testConv.id,
    customerPhone: custPhone,
    customerName: custName,
    promptText: 'Saya mau daftarkan anak saya ke kelas 7 MTs PDF Anwaarunnajah',
    profile,
    sendWhatsAppMessageFn: sendRealNotification,
  });

  console.log('\nHASIL HANDOFF NYATA:');
  console.log('Success:', handoffResult.success);
  console.log('Status:', handoffResult.handoffStatus);
  console.log('Petugas CS Terpilih:', handoffResult.csMember?.fullName, `(+${handoffResult.csMember?.phone})`);
  console.log('Pesan Balasan ke Calon Pendaftar:\n', handoffResult.replyText);

  // Verifikasi perubahan di database Supabase
  const { data: updatedConv } = await supabase
    .from('conversations')
    .select('id, handoff_status, handoff_department, handoff_notified_at, handoff_summary, handoff_cs_phone')
    .eq('id', testConv.id)
    .single();

  console.log('\nRECORD CONVERSATIONS DI SUPABASE:');
  console.log(JSON.stringify(updatedConv, null, 2));

  // Verifikasi pencatatan pesan sistem di messages
  const { data: sysMsgs } = await supabase
    .from('messages')
    .select('id, sender_type, body, sent_at')
    .eq('conversation_id', testConv.id)
    .eq('sender_type', 'system')
    .order('sent_at', { ascending: false })
    .limit(1);

  console.log('\nPESAN SISTEM TERAKHIR:');
  console.log(JSON.stringify(sysMsgs, null, 2));

  // Uji Coba Deduplikasi (Pesan kedua tidak boleh mengirim notifikasi ulang)
  console.log('\n--- Menguji Perlindungan Deduplikasi ---');
  let duplicateDispatched = false;
  const duplicateSender = async () => {
    duplicateDispatched = true;
    return { success: true };
  };

  const dupResult = await executeRegistrationHandoff({
    orgId,
    conversationId: testConv.id,
    customerPhone: custPhone,
    customerName: custName,
    promptText: 'Min, ini anak saya mau daftar',
    profile,
    sendWhatsAppMessageFn: duplicateSender,
  });

  console.log('Status Pesan Kedua:', dupResult.handoffStatus);
  console.log('Notifikasi Kedua Terkirim?:', duplicateDispatched ? 'YA (SALAH)' : 'TIDAK (BENAR - DEDUPLIKASI BERFUNGSI)');
}

runLiveTest().catch(console.error);
