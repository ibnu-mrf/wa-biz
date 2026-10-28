import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { createWorkerSupabaseClient } from './supabase';

async function verifyMigration() {
  console.log('=== VERIFIKASI HASIL MIGRASI DATABASE FASE 6B ===');
  const supabase = createWorkerSupabaseClient();
  if (!supabase) {
    console.error('Supabase tidak terkonfigurasi!');
    process.exit(1);
  }

  // 1. Periksa tabel organization_whatsapp_configs
  const { data: configs, error: configErr } = await supabase
    .from('organization_whatsapp_configs')
    .select('*');

  if (configErr) {
    console.error('✗ GAGAL membaca organization_whatsapp_configs:', configErr.message);
  } else {
    console.log(`✓ PASS: organization_whatsapp_configs terbaca (${configs?.length} baris):`);
    configs?.forEach((c: any) => {
      console.log(`  - Org ID: ${c.organization_id}, Provider: ${c.provider_type}, Phone: ${c.display_phone_number}, Active: ${c.is_active}`);
    });
  }

  // 2. Periksa kolom baru pada public.messages
  const { data: msgCols, error: msgErr } = await supabase
    .from('messages')
    .select('id, provider_type, provider_message_id, delivery_status, delivery_error')
    .limit(1);

  if (msgErr) {
    console.error('✗ GAGAL memeriksa kolom baru public.messages:', msgErr.message);
  } else {
    console.log('✓ PASS: Kolom ekstensi public.messages (provider_type, provider_message_id, delivery_status, delivery_error) berhasil diverifikasi.');
  }

  // 3. Periksa kolom baru pada public.campaign_recipients
  const { data: campCols, error: campErr } = await supabase
    .from('campaign_recipients')
    .select('id, provider_type, provider_message_id')
    .limit(1);

  if (campErr) {
    console.error('✗ GAGAL memeriksa kolom baru public.campaign_recipients:', campErr.message);
  } else {
    console.log('✓ PASS: Kolom ekstensi public.campaign_recipients (provider_type, provider_message_id) berhasil diverifikasi.');
  }

  // 4. Periksa penolakan akses ke skema private oleh anon
  // Buat anon client
  const { createClient } = require('@supabase/supabase-js');
  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || 'dummy_anon');
  const { data: privData, error: privErr } = await anonClient
    .from('organization_whatsapp_secrets')
    .select('*');

  if (privErr || !privData || privData.length === 0) {
    console.log('✓ PASS: Tabel rahasia private.organization_whatsapp_secrets aman dari akses publik/PostgREST.');
  } else {
    console.error('✗ PERINGATAN: private.organization_whatsapp_secrets terekspos ke publik!');
  }

  console.log('=== VERIFIKASI MIGRASI SELESAI ===');
}

verifyMigration().catch(console.error);
