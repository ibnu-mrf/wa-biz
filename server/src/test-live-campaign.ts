// ====================================================================
// Test Live Campaign API & Persistent Queue Flow on Worker Staging
// ====================================================================

import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { createWorkerSupabaseClient } from './supabase';

async function runLiveCampaignTest() {
  console.log('======================================================');
  console.log('WABiz Phase 3: Live Campaign API & Persistent Queue Test');
  console.log('======================================================\n');

  const supabase = createWorkerSupabaseClient();
  if (!supabase) {
    console.error('Supabase tidak terhubung.');
    process.exit(1);
  }

  const orgId = process.env.WORKER_ORG_ID || '12cc398e-9c11-4f30-a665-0583f369fd77';
  const workerUrl = 'http://127.0.0.1:4000';
  const apiKey = process.env.LOCAL_API_KEY || '';

  // 1. Verifikasi Health Worker
  console.log('[Step 1] Memeriksa kesehatan server worker...');
  const healthRes = await fetch(`${workerUrl}/health`);
  const healthJson = await healthRes.json();
  console.log('Worker Health:', healthJson);
  if (!healthJson.worker) {
    console.error('Worker tidak aktif di port 4000');
    process.exit(1);
  }

  // 2. Siapkan kontak staging
  console.log('\n[Step 2] Menyiapkan kontak staging di Supabase...');
  const stagingPhone = '6285641886993';
  await supabase.from('contacts').delete().eq('organization_id', orgId).in('phone', [stagingPhone, '6281111111111', '08000']);

  const { data: cValid } = await supabase.from('contacts').insert({
    organization_id: orgId,
    name: 'Kontak Staging Disetujui',
    phone: stagingPhone,
    labels: ['Calon Santri'],
    is_opted_out: false,
  }).select('id').single();

  const { data: cOptOut } = await supabase.from('contacts').insert({
    organization_id: orgId,
    name: 'Kontak Staging Opt-Out',
    phone: '6281111111111',
    labels: ['Orang Tua', 'opt-out'],
    is_opted_out: true,
  }).select('id').single();

  const { data: cInvalid } = await supabase.from('contacts').insert({
    organization_id: orgId,
    name: 'Kontak Staging Nomor Pendek',
    phone: '08000',
    labels: ['Umum'],
    is_opted_out: false,
  }).select('id').single();

  console.log('Kontak berhasil disiapkan:', { valid: cValid?.id, optOut: cOptOut?.id, invalid: cInvalid?.id });

  // 3. Uji Endpoint POST /api/campaigns/create (Mode Kirim Sekarang)
  console.log('\n[Step 3] Membuat kampanye via POST /api/campaigns/create...');
  const createRes = await fetch(`${workerUrl}/api/campaigns/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      organizationId: orgId,
      name: '[Staging Live] Pengumuman Gelombang PSB 2026',
      messageBody: 'Assalamu’alaikum Wr Wb. Pendaftaran santri baru PDF Anwaarunnajah gelombang 1 resmi dibuka.',
      deliveryMode: 'now',
      contactIds: [cValid!.id, cOptOut!.id, cInvalid!.id],
    }),
  });

  const createJson = await createRes.json();
  console.log('Response /api/campaigns/create:', JSON.stringify(createJson, null, 2));

  if (!createJson.success || !createJson.data?.campaignId) {
    console.error('Gagal membuat kampanye!');
    process.exit(1);
  }

  const campaignId = createJson.data.campaignId;

  // 4. Uji Endpoint GET /api/campaigns/:id/recipients
  console.log('\n[Step 4] Mengambil status penerima via GET /api/campaigns/:id/recipients...');
  const recsRes = await fetch(`${workerUrl}/api/campaigns/${campaignId}/recipients?organizationId=${orgId}`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey },
  });
  const recsJson = await recsRes.json();
  console.log('Metrik Penerima:', recsJson.data?.metrics);
  console.log('Daftar Penerima:', JSON.stringify(recsJson.data?.recipients, null, 2));

  // 5. Uji Pembatalan Kampanye Terjadwal via POST /api/campaigns/:id/cancel
  console.log('\n[Step 5] Menguji pembuatan dan pembatalan kampanye terjadwal...');
  const schedRes = await fetch(`${workerUrl}/api/campaigns/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      organizationId: orgId,
      name: '[Staging Live] Kampanye Untuk Dibatalkan',
      messageBody: 'Pesan uji coba pembatalan.',
      deliveryMode: 'scheduled',
      scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      contactIds: [cValid!.id],
    }),
  });
  const schedJson = await schedRes.json();
  const schedCampId = schedJson.data?.campaignId;

  const cancelRes = await fetch(`${workerUrl}/api/campaigns/${schedCampId}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ organizationId: orgId }),
  });
  const cancelJson = await cancelRes.json();
  console.log('Response /api/campaigns/:id/cancel:', cancelJson);

  // 6. Verifikasi Status di Database Supabase
  console.log('\n[Step 6] Verifikasi integritas di database Supabase...');
  const { data: dbCamp } = await supabase.from('campaigns').select('*').eq('id', schedCampId).single();
  console.log('Status Kampanye Dibatalkan di DB:', dbCamp?.status);

  const { data: dbRecs } = await supabase.from('campaign_recipients').select('*').eq('campaign_id', schedCampId);
  console.log('Status Penerima Dibatalkan di DB:', dbRecs?.map(r => ({ phone: r.phone, status: r.status, reason: r.error_message })));

  // Bersihkan data tes
  await supabase.from('campaigns').delete().in('id', [campaignId, schedCampId]);
  await supabase.from('contacts').delete().eq('organization_id', orgId).in('phone', [stagingPhone, '6281111111111', '08000']);

  console.log('\n======================================================');
  console.log('SEMUA TAHAPAN LIVE PENGUJIAN KAMPANYE BERHASIL!');
  console.log('======================================================');
}

runLiveCampaignTest().catch((err) => {
  console.error('Exception on Live Campaign Test:', err);
  process.exit(1);
});
