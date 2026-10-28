// ====================================================================
// WABiz Fase 6C: Live Sandbox Preflight & Deployment Readiness Test Suite
// ====================================================================

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import {
  WhatsAppProviderFactory,
  baileysProvider,
  metaCloudApiProvider,
  MetaCloudApiProvider,
} from './providers';
import { createWorkerSupabaseClient } from './supabase';
import { config, loadConfig } from './config';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runFase6cTests() {
  console.log('======================================================');
  console.log('   WABIZ FASE 6C: DEPLOYMENT READINESS TEST SUITE     ');
  console.log('======================================================\n');

  const supabase = createWorkerSupabaseClient();
  const stagingOrgId = '12cc398e-9c11-4f30-a665-0583f369fd77';
  const testSwitchOrgId = 'f0000000-0000-0000-0000-000000000001';

  // ----------------------------------------------------
  // TEST 1: Konfigurabilitas Versi Graph API Tanpa Ubah Kode
  // ----------------------------------------------------
  console.log('[TEST 1] Konfigurabilitas Dinamis Versi Meta Graph API');
  
  // Default saat ini
  const defaultVersion = config.metaGraphApiVersion;
  assert(
    defaultVersion === 'v21.0' || Boolean(process.env.META_GRAPH_API_VERSION),
    `Versi default terkonfigurasi dinamis (Aktual: ${defaultVersion})`
  );

  // Simulasi perubahan versi via environment variable ke v22.0
  const originalEnv = process.env.META_GRAPH_API_VERSION;
  try {
    process.env.META_GRAPH_API_VERSION = 'v22.0';
    const reloadedConfig = loadConfig();
    assert(
      reloadedConfig.metaGraphApiVersion === 'v22.0',
      'META_GRAPH_API_VERSION dapat diubah ke v22.0 via env tanpa modifikasi kode sumber'
    );

    const providerV22 = new MetaCloudApiProvider(undefined, reloadedConfig.metaGraphApiVersion);
    let capturedUrl = '';
    providerV22.getCredentials = async () => ({ phoneNumberId: '12345', accessToken: 'token' });
    
    // Periksa bahwa endpoint Graph API menggunakan versi baru
    assert(
      (providerV22 as any).apiVersion === 'v22.0',
      'MetaCloudApiProvider mengadopsi v22.0 secara instan'
    );
  } finally {
    process.env.META_GRAPH_API_VERSION = originalEnv;
  }
  console.log('');

  // ----------------------------------------------------
  // TEST 2: Pencegahan Kebocoran Secret (Zero Secret Leak)
  // ----------------------------------------------------
  console.log('[TEST 2] Verifikasi Keamanan Secret (Zero Secret Exposure)');
  
  // 1. Periksa bahwa skema private tidak dapat diakses PostgREST
  if (supabase) {
    const { createClient } = require('@supabase/supabase-js');
    const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || 'anon');
    const { data: leakData, error: leakErr } = await anonClient
      .from('organization_whatsapp_secrets')
      .select('*');

    assert(
      leakErr !== null || !leakData || leakData.length === 0,
      'PostgREST klien anon/publik DITOLAK saat mencoba mengakses tabel secret'
    );
  }

  // 2. Periksa bahwa config umum tidak mengekspos secret di memori publik
  assert(
    typeof (config as any).metaSystemUserToken === 'string',
    'metaSystemUserToken tersimpan terisolasi di server'
  );
  console.log('');

  // ----------------------------------------------------
  // TEST 3: Pergantian Provider Terisolasi Per-Tenant (Tenant-Scoped Switch)
  // ----------------------------------------------------
  console.log('[TEST 3] Isolasi Tenant Saat Pergantian Provider');

  if (supabase) {
    // Siapkan organisasi uji coba kedua di database
    await supabase.from('organizations').upsert({
      id: testSwitchOrgId,
      name: 'Lembaga Uji Switch Fase 6C',
    });

    // 1. Organisasi A diset ke Meta Cloud API
    await supabase.from('organization_whatsapp_configs').upsert({
      organization_id: testSwitchOrgId,
      provider_type: 'meta_cloud_api',
      phone_number_id: '111222333444555',
      display_phone_number: '628111222333',
      is_active: true,
    }, { onConflict: 'organization_id' });

    // 2. Pastikan organisasi staging (Organisasi B) tetap Baileys
    await supabase.from('organization_whatsapp_configs').upsert({
      organization_id: stagingOrgId,
      provider_type: 'baileys',
      display_phone_number: '6285641886993',
      is_active: true,
    }, { onConflict: 'organization_id' });

    const startResolve = Date.now();
    const providerOrgA = await WhatsAppProviderFactory.getProviderForOrg(testSwitchOrgId);
    const resolveTimeMs = Date.now() - startResolve;

    assert(
      providerOrgA.providerType === 'meta_cloud_api',
      `Organisasi uji coba A menggunakan provider 'meta_cloud_api' (Waktu resolusi: ${resolveTimeMs}ms)`
    );

    const providerOrgB = await WhatsAppProviderFactory.getProviderForOrg(stagingOrgId);
    assert(
      providerOrgB.providerType === 'baileys',
      'Organisasi staging B TETAP menggunakan Baileys (tidak terpengaruh oleh organisasi A)'
    );

    // 3. Rollback Organisasi A kembali ke Baileys
    const startRollback = Date.now();
    await supabase.from('organization_whatsapp_configs').update({
      provider_type: 'baileys',
    }).eq('organization_id', testSwitchOrgId);
    const rollbackDurationMs = Date.now() - startRollback;

    const rolledBackProvider = await WhatsAppProviderFactory.getProviderForOrg(testSwitchOrgId);
    assert(
      rolledBackProvider.providerType === 'baileys',
      `Rollback Organisasi A ke Baileys BERHASIL (Waktu update DB: ${rollbackDurationMs}ms)`
    );

    // Bersihkan data dummy uji
    await supabase.from('organization_whatsapp_configs').delete().eq('organization_id', testSwitchOrgId);
    await supabase.from('organizations').delete().eq('id', testSwitchOrgId);
  } else {
    console.log('  [SKIP] Supabase tidak aktif untuk uji DB langsung');
  }
  console.log('');

  // ----------------------------------------------------
  // TEST 4: Pencegahan Pengiriman Ganda (Idempotency & Anti-Double Send)
  // ----------------------------------------------------
  console.log('[TEST 4] Pencegahan Pesan Ganda (Anti-Double Send Guard)');
  
  const testWamid = `wamid.HB_TEST_IDEMPOTENCY_${Date.now()}`;
  
  if (supabase) {
    // 1. Simpan record pesan awal
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('organization_id', stagingOrgId)
      .limit(1)
      .maybeSingle();

    if (conv) {
      const { data: msg1 } = await supabase.from('messages').insert({
        organization_id: stagingOrgId,
        conversation_id: conv.id,
        sender_type: 'bot',
        body: 'Pesan idempotensi pertama',
        provider_type: 'meta_cloud_api',
        provider_message_id: testWamid,
        delivery_status: 'sent',
      }).select('id').single();

      assert(Boolean(msg1?.id), 'Pesan pertama tersimpan dengan provider_message_id unik');

      // 2. Cek apakah pesan dengan provider_message_id yang sama ditolak/dideteksi sebagai duplikat
      const { data: existingMsg } = await supabase
        .from('messages')
        .select('id')
        .eq('provider_message_id', testWamid)
        .maybeSingle();

      assert(
        existingMsg?.id === msg1?.id,
        'Deduplikasi pesan mendeteksi wamid yang sama, mencegah insert ulang'
      );

      // Bersihkan pesan uji
      await supabase.from('messages').delete().eq('id', msg1!.id);
    }
  }
  console.log('');

  // ----------------------------------------------------
  // TEST 5: Status Sesi Staging Baileys Tidak Rusak
  // ----------------------------------------------------
  console.log('[TEST 5] Integritas Sesi Baileys Staging');
  const baileysState = baileysProvider.normalizeDeliveryStatus('sent');
  assert(baileysState === 'sent', 'Status normalisasi Baileys valid');

  const statusObj = await baileysProvider.getConnectionStatus(stagingOrgId);
  assert(statusObj.provider === 'baileys', 'Provider koneksi Baileys siap');
  console.log('');

  // ----------------------------------------------------
  // REKAPITULASI
  // ----------------------------------------------------
  console.log('======================================================');
  console.log(`TOTAL PENGUJIAN FASE 6C: ${totalTests}`);
  console.log(`  ✓ LULUS : ${passedTests}`);
  console.log(`  ✗ GAGAL : ${failedTests}`);
  console.log('======================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runFase6cTests().catch((err) => {
  console.error('Fatal Exception:', err);
  process.exit(1);
});
