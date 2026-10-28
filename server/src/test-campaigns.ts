// ====================================================================
// Test Suite: WABiz Phase 3 Persistent Campaign Execution & Scheduling
// ====================================================================

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import {
  validateRecipientPhone,
  createPersistentCampaign,
  cancelCampaign,
  getCampaignRecipients,
  CampaignQueueScheduler,
} from './campaigns';
import { createWorkerSupabaseClient } from './supabase';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    failedTests++;
  }
}

async function runCampaignTests() {
  console.log('====================================================');
  console.log('WABiz Phase 3: Persistent Campaign & Scheduler Tests');
  console.log('====================================================\n');

  const supabase = createWorkerSupabaseClient();
  if (!supabase) {
    console.error('Supabase tidak terkonfigurasi. Pastikan SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY tersedia.');
    process.exit(1);
  }

  const testOrgId = process.env.WORKER_ORG_ID || '12cc398e-9c11-4f30-a665-0583f369fd77';
  const otherOrgId = '00000000-0000-0000-0000-000000000099';

  // ----------------------------------------------------
  // TEST GROUP 1: Validasi Format Nomor Telepon
  // ----------------------------------------------------
  console.log('[Test Group 1] Validasi & Normalisasi Nomor Telepon:');
  const v1 = validateRecipientPhone('081234567890');
  assert(v1.isValid && v1.normalized === '6281234567890', 'Format 0812xxx dinormalisasi ke 62812xxx');

  const v2 = validateRecipientPhone('+62 856-4188-6993');
  assert(v2.isValid && v2.normalized === '6285641886993', 'Format +62 856-xxx dibersihkan spasi dan simbolnya');

  const v3 = validateRecipientPhone('12345');
  assert(!v3.isValid && (v3.reason?.includes('pendek') || false), 'Nomor < 9 digit ditolak');

  const v4 = validateRecipientPhone('');
  assert(!v4.isValid, 'Nomor kosong ditolak');

  const v5 = validateRecipientPhone('081234567890123456789');
  assert(!v5.isValid && (v5.reason?.includes('panjang') || false), 'Nomor > 16 digit ditolak');

  // ----------------------------------------------------
  // TEST GROUP 2: Pembuatan Kontak Uji (Valid, Opt-out, Tak Valid)
  // ----------------------------------------------------
  console.log('\n[Test Group 2] Setup Kontak Uji di Supabase:');
  // Buat kontak pengujian
  const testContactValid = {
    organization_id: testOrgId,
    name: 'Santri Uji Valid',
    phone: '6285641886993',
    labels: ['Calon Santri'],
    is_opted_out: false,
  };
  const testContactOptOut = {
    organization_id: testOrgId,
    name: 'Wali Santri Opt-Out',
    phone: '6289988776655',
    labels: ['Orang Tua', 'opt-out'],
    is_opted_out: true,
  };
  const testContactInvalid = {
    organization_id: testOrgId,
    name: 'Kontak Nomor Pendek',
    phone: '123',
    labels: ['Umum'],
    is_opted_out: false,
  };

  await supabase.from('contacts').delete().eq('organization_id', testOrgId).in('phone', ['6285641886993', '6289988776655', '123']);

  const { data: c1 } = await supabase.from('contacts').insert(testContactValid).select('id').single();
  const { data: c2 } = await supabase.from('contacts').insert(testContactOptOut).select('id').single();
  const { data: c3 } = await supabase.from('contacts').insert(testContactInvalid).select('id').single();

  assert(Boolean(c1?.id && c2?.id && c3?.id), 'Kontak pengujian berhasil disiapkan di database');

  // ----------------------------------------------------
  // TEST GROUP 3: Pembuatan Kampanye dengan Filter Opt-Out & Validitas
  // ----------------------------------------------------
  console.log('\n[Test Group 3] Pembuatan Kampanye & Antrean Persisten:');
  const createRes = await createPersistentCampaign(testOrgId, {
    name: '[Test Auto] Info PSB 2026',
    messageBody: 'Assalamu’alaikum, pendaftaran santri baru telah dibuka.',
    deliveryMode: 'now',
    contactIds: [c1!.id, c2!.id, c3!.id],
  });

  assert(createRes.success, 'createPersistentCampaign berhasil disimpan ke Supabase');
  assert(createRes.totalRecipients === 3, 'Total 3 penerima terdaftar');
  assert(createRes.validRecipients === 1, 'Hanya 1 kontak valid yang masuk status pending');
  assert(createRes.skippedRecipients === 2, '2 kontak (opt-out & invalid phone) otomatis di-skip');

  const campId = createRes.campaignId!;

  // Periksa status penerima di tabel campaign_recipients
  const { recipients, metrics } = await getCampaignRecipients(testOrgId, campId);
  assert(Boolean(recipients && recipients.length === 3), 'Tabel campaign_recipients menyimpan 3 baris persisten');
  assert(metrics?.pending === 1, 'Metrik pending = 1');
  assert(metrics?.skipped === 2, 'Metrik skipped = 2');

  const optOutRec = recipients?.find((r) => r.phone === '6289988776655');
  assert(optOutRec?.status === 'skipped' && (optOutRec.errorMessage?.includes('opt-out') || false), 'Kontak opt-out memiliki status skipped dengan alasan opt-out');

  const invalidRec = recipients?.find((r) => r.phone === '123');
  assert(invalidRec?.status === 'skipped' && (invalidRec.errorMessage?.includes('pendek') || false), 'Kontak nomor pendek memiliki status skipped dengan alasan nomor tidak valid');

  // ----------------------------------------------------
  // TEST GROUP 4: Pembatalan Kampanye Terjadwal
  // ----------------------------------------------------
  console.log('\n[Test Group 4] Pembatalan Kampanye Terjadwal:');
  const schedRes = await createPersistentCampaign(testOrgId, {
    name: '[Test Auto] Siaran Dibatalkan',
    messageBody: 'Pesan ini akan dibatalkan sebelum dikirim.',
    deliveryMode: 'scheduled',
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    contactIds: [c1!.id],
  });

  assert(schedRes.success, 'Kampanye terjadwal berhasil dibuat');
  const schedCampId = schedRes.campaignId!;

  const cancelRes = await cancelCampaign(testOrgId, schedCampId);
  assert(cancelRes.success, 'cancelCampaign berhasil membatalkan kampanye');

  const { data: cancelledCamp } = await supabase
    .from('campaigns')
    .select('status')
    .eq('id', schedCampId)
    .single();
  assert(cancelledCamp?.status === 'cancelled', 'Status kampanye terupdate menjadi "cancelled"');

  const { recipients: schedRecs } = await getCampaignRecipients(testOrgId, schedCampId);
  const pendingAfterCancel = schedRecs?.filter((r) => r.status === 'pending') || [];
  assert(pendingAfterCancel.length === 0, 'Semua penerima pending diubah menjadi skipped setelah kampanye dibatalkan');

  // ----------------------------------------------------
  // TEST GROUP 5: Pemulihan dari Worker Crash / Stale Processing Jobs
  // ----------------------------------------------------
  console.log('\n[Test Group 5] Pemulihan Antrean Tertahan (Stale Processing Recovery):');
  // Simulasikan job yang tertahan di status 'processing' lebih dari 5 menit lalu
  const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  await supabase
    .from('campaign_recipients')
    .update({
      status: 'processing',
      updated_at: sixMinutesAgo,
    })
    .eq('campaign_id', campId)
    .eq('status', 'pending');

  const scheduler = new CampaignQueueScheduler();
  await scheduler.recoverStaleProcessingJobs();

  const { recipients: recsAfterRecovery } = await getCampaignRecipients(testOrgId, campId);
  const recoveredItem = recsAfterRecovery?.find((r) => r.phone === '6285641886993');
  assert(recoveredItem?.status === 'pending', 'Job processing lama berhasil dipulihkan otomatis kembali ke status "pending"');

  // ----------------------------------------------------
  // TEST GROUP 6: Kontrol Konkurensi & Atomic Check-and-Set
  // ----------------------------------------------------
  console.log('\n[Test Group 6] Kontrol Konkurensi & Idempotensi:');
  // Worker A mencoba mengunci item
  const { data: lockA } = await supabase
    .from('campaign_recipients')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', recoveredItem!.id)
    .eq('status', 'pending')
    .select('id');

  assert(Boolean(lockA && lockA.length === 1), 'Worker A berhasil mengunci antrean dari pending ke processing');

  // Worker B mencoba mengunci item yang sama saat sedang 'processing'
  const { data: lockB } = await supabase
    .from('campaign_recipients')
    .update({ status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', recoveredItem!.id)
    .eq('status', 'pending')
    .select('id');

  assert(!lockB || lockB.length === 0, 'Worker B gagal mengunci item yang sama (mencegah pengiriman ganda)');

  // Kembalikan status ke pending
  await supabase
    .from('campaign_recipients')
    .update({ status: 'pending' })
    .eq('id', recoveredItem!.id);

  // ----------------------------------------------------
  // TEST GROUP 7: Isolasi Organisasi (Multi-Tenant Security)
  // ----------------------------------------------------
  console.log('\n[Test Group 7] Isolasi Organisasi & Otorisasi:');
  const crossCancel = await cancelCampaign(otherOrgId, campId);
  assert(!crossCancel.success, 'Organisasi lain tidak dapat membatalkan kampanye milik organisasi target');

  const crossGet = await getCampaignRecipients(otherOrgId, campId);
  assert(crossGet.recipients?.length === 0, 'Organisasi lain tidak dapat melihat penerima kampanye milik organisasi target');

  // Bersihkan data tes
  await supabase.from('campaigns').delete().in('id', [campId, schedCampId]);
  await supabase.from('contacts').delete().eq('organization_id', testOrgId).in('phone', ['6285641886993', '6289988776655', '123']);

  console.log('\n====================================================');
  console.log(`HASIL TEST: ${passedTests} PASS, ${failedTests} FAIL`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runCampaignTests().catch((err) => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
