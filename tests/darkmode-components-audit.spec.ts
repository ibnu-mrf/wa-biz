import { test, expect } from '@playwright/test';

declare const require: any;
const path = require('path');

const SCREENSHOTS_DIR = 'C:/Users/p/.gemini/antigravity/brain/fb6500eb-98bd-4ed5-aa82-83bfc9ebbc6e/screenshots';

const MOCK_USER = {
  id: 'usr-wabiz-001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'owner@wabiz.b2b',
  email_confirmed_at: '2026-10-01T00:00:00Z',
  phone: '',
  user_metadata: {
    full_name: 'Ustadz Ahmad Dahlan',
  },
  app_metadata: {
    provider: 'email',
  },
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const MOCK_SESSION = {
  access_token: 'mock-token-xyz-1234567890',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'mock-refresh-xyz-1234567890',
  user: MOCK_USER,
};

async function setupMockApi(page: any) {
  await page.route('**/auth/v1/token*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SESSION),
    });
  });

  await page.route('**/auth/v1/user*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    });
  });

  await page.route('**/rest/v1/organization_members*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'mem-001',
          organization_id: 'org-wabiz-001',
          user_id: 'usr-wabiz-001',
          role: 'owner',
          created_at: '2026-10-01T00:00:00Z',
        },
      ]),
    });
  });

  await page.route('**/rest/v1/organizations*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'org-wabiz-001',
          name: 'Pesantren Teknologi Al-Hikmah',
          slug: 'al-hikmah',
          created_at: '2026-10-01T00:00:00Z',
        },
      ]),
    });
  });

  await page.route('**/rest/v1/contacts*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'c-001',
          organization_id: 'org-wabiz-001',
          name: 'H. Muhammad Arifin',
          phone: '081234567890',
          email: 'arifin@wali.sch.id',
          label: 'Orang Tua',
          labels: ['Orang Tua', 'Sudah Dihubungi'],
          notes: 'Wali santri kelas 10 Aliyah',
          created_at: '2026-10-02T10:00:00Z',
        },
        {
          id: 'c-002',
          organization_id: 'org-wabiz-001',
          name: 'Budi Santoso',
          phone: '085641886993',
          email: 'budi@santri.id',
          label: 'Calon Santri',
          labels: ['Calon Santri', 'Belum Dihubungi'],
          notes: 'Minat program tahfidz',
          created_at: '2026-10-03T11:00:00Z',
        },
        {
          id: 'c-003',
          organization_id: 'org-wabiz-001',
          name: 'Ahmad Fauzi',
          phone: '081999888777',
          email: 'fauzi@santri.id',
          label: 'Santri Aktif',
          labels: ['Santri Aktif', 'Sudah Dihubungi'],
          notes: 'Santri kelas 11 IPA',
          created_at: '2026-10-04T12:00:00Z',
        },
      ]),
    });
  });

  await page.route('**/rest/v1/campaigns*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'cmp-001',
          organization_id: 'org-wabiz-001',
          name: 'Pengumuman Ujian Masuk Gelombang 1',
          message_body: 'Assalamu alaikum Wr Wb. Ujian masuk PSB akan diadakan pada hari Ahad.',
          status: 'Terjadwal',
          target_segment: 'Calon Santri',
          total_recipients: 120,
          sent_count: 0,
          failed_count: 0,
          skipped_count: 0,
          scheduled_at: '2026-11-10 09:00',
          created_at: '2026-10-05T08:00:00Z',
        },
        {
          id: 'cmp-002',
          organization_id: 'org-wabiz-001',
          name: 'Kajian Bulanan Wali Santri',
          message_body: 'Undangan silaturahim dan kajian bulanan seluruh wali santri.',
          status: 'Selesai',
          target_segment: 'Orang Tua',
          total_recipients: 350,
          sent_count: 348,
          failed_count: 2,
          skipped_count: 0,
          sent_at: '2026-10-25 14:00',
          created_at: '2026-10-20T08:00:00Z',
        },
      ]),
    });
  });

  await page.route('**/rest/v1/team_members*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'tm-001',
          organization_id: 'org-wabiz-001',
          full_name: 'Ustadz Ahmad Dahlan',
          email: 'owner@wabiz.b2b',
          phone: '081234567890',
          role: 'Owner',
          department: 'Pimpinan & Yayasan',
          is_active: true,
          created_at: '2026-10-01',
        },
        {
          id: 'tm-002',
          organization_id: 'org-wabiz-001',
          full_name: 'Siti Aminah, S.Pd',
          email: 'cs.admisi@wabiz.b2b',
          phone: '085641886993',
          role: 'CS Staff',
          department: 'Pendaftaran / PSB',
          is_active: true,
          created_at: '2026-10-05',
        },
      ]),
    });
  });

  await page.route('**/rest/v1/notifications*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/status', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ready',
        phone: '6285641886993',
        pushname: 'WABiz Official Gateway',
      }),
    });
  });
}

test.describe('WABiz Dark Mode & Component Audit Suite (8 Specific Areas)', () => {
  test('Audit & Capture 8 Komponen Spesifik pada Dark Mode dan Light Mode', async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await setupMockApi(page);

    await page.goto('/');
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // Switch ke Dark Mode
    const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
    if (await toggleToDark.isVisible()) {
      await toggleToDark.click();
      await page.waitForTimeout(300);
    }

    // ========================================================
    // 1. RINGKASAN KAMPANYE EKSEKUTIF (DASHBOARD)
    // ========================================================
    const campaignSummarySection = page.getByText('Ringkasan Kampanye Eksekutif');
    await expect(campaignSummarySection).toBeVisible();
    await campaignSummarySection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_01_ringkasan_kampanye_eksekutif_dark.png') });

    // Light Mode Ringkasan Kampanye Eksekutif
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_01_ringkasan_kampanye_eksekutif_light.png') });

    // Kembali ke Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 2. DIREKTORI KONTAK — KELOLA LABEL
    // ========================================================
    await page.getByText('Kontak', { exact: true }).first().click();
    await expect(page.getByText('Kontak Terdaftar')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);

    // Buka Modal Kelola Label di Dark Mode
    await page.getByText('Kelola Label', { exact: true }).click();
    await expect(page.getByText('Kelola Label Kontak Organisasi')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_02_kelola_label_kontak_dark.png') });
    // Tutup Modal Kelola Label
    await page.getByLabel('Tutup Kelola Label').click();
    await page.waitForTimeout(300);

    // Switch ke Light Mode dan buka Modal Kelola Label
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.getByText('Kelola Label', { exact: true }).click();
    await expect(page.getByText('Kelola Label Kontak Organisasi')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_02_kelola_label_kontak_light.png') });
    await page.getByLabel('Tutup Kelola Label').click();
    await page.waitForTimeout(300);

    // Kembali ke Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 3. KAMPANYE — PEMILIHAN LABEL DAN SEGMENTASI
    // ========================================================
    await page.getByText('Kampanye', { exact: true }).first().click();
    await expect(page.getByText('Kampanye Siaran')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);

    // Buka Modal Buat Kampanye di Dark Mode
    await page.getByText('+ Buat Kampanye', { exact: true }).click();
    await expect(page.getByText('Buat Kampanye Siaran Baru')).toBeVisible();
    await page.waitForTimeout(300);

    // Buka Dropdown Segmentasi Target Label Kontak
    const segmentDropdownTrigger = page.getByText('Semua Kontak Organisasi (Tanpa Filter Label)');
    await expect(segmentDropdownTrigger).toBeVisible();
    await segmentDropdownTrigger.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_03_kampanye_dropdown_label_open_dark.png') });

    // Pilih Label 'Calon Santri'
    const calonSantriItem = page.getByText('Calon Santri', { exact: true }).last();
    await calonSantriItem.click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_03_kampanye_dropdown_label_selected_dark.png') });

    // Tutup Modal Buat Kampanye
    await page.getByRole('dialog').getByText('Batal', { exact: true }).click();
    await page.waitForTimeout(300);

    // Switch ke Light Mode dan buka dropdown kampanye
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.getByText('+ Buat Kampanye', { exact: true }).click();
    await expect(page.getByText('Buat Kampanye Siaran Baru')).toBeVisible();
    await page.waitForTimeout(300);
    await page.getByText('Semua Kontak Organisasi (Tanpa Filter Label)').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_03_kampanye_dropdown_label_open_light.png') });
    await page.getByRole('dialog').getByText('Batal', { exact: true }).click();
    await page.waitForTimeout(300);

    // Kembali ke Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 4. CHATBOT AI — KATA KUNCI PEMICU TERDAFTAR (INTENT TRIGGERS)
    // ========================================================
    await page.getByText('Chatbot AI', { exact: true }).first().click();
    await expect(page.getByText('Chatbot AI & Otomatisasi')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);

    // Buka Tab 'Deteksi Minat' (intent)
    await page.getByText('3. Deteksi Minat Pendaftaran').click();
    await expect(page.getByText('Kata Kunci Pemicu Terdaftar (Intent Triggers)')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_04_chatbot_intent_triggers_dark.png') });

    // Switch ke Light Mode untuk Intent Triggers
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_04_chatbot_intent_triggers_light.png') });

    // Kembalikan ke Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 5. CHATBOT AI — PRESET STANDAR PADA ATURAN RESPONS
    // ========================================================
    await page.getByText('2. Aturan Respon & Sambutan', { exact: true }).click();
    await expect(page.getByText('Aturan Respon, Pesan Sambutan & Kebijakan Anti-Halusinasi')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_05_chatbot_preset_standar_dark.png') });

    // Switch ke Light Mode untuk Preset Standar
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_05_chatbot_preset_standar_light.png') });

    // Kembalikan ke Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 6. CHATBOT AI — MODE ANTI-HALUSINASI WABIZ (STRICT GROUNDING)
    // ========================================================
    const strictSection = page.getByText('Mode Anti-Halusinasi WABiz (Strict Grounding)');
    await expect(strictSection).toBeVisible();
    await strictSection.scrollIntoViewIfNeeded();
    await expect(
      page.getByText('Chatbot dilarang keras mengarang biaya, jadwal tes, kuota, atau janji penerimaan yang tidak tercantum di Profil Organisasi.')
    ).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_06_chatbot_strict_grounding_dark.png') });

    // Switch ke Light Mode untuk Mode Anti-Halusinasi
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_06_chatbot_strict_grounding_light.png') });

    // Kembalikan ke Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 7. TIM CUSTOMER SERVICE
    // ========================================================
    await page.getByText('Tim CS', { exact: true }).first().click();
    await expect(page.getByText('Tim Customer Service').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('2 Anggota', { exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_07_tim_customer_service_dark.png') });

    // Switch ke Light Mode untuk Tim Customer Service
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_07_tim_customer_service_light.png') });

    // Kembalikan ke Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 8. PENGATURAN ORGANISASI — SEGMENTASI & LABEL KONTAK
    // ========================================================
    await page.getByText('Pengaturan Organisasi', { exact: true }).first().click();
    await expect(page.getByText('Identitas Institusi').first()).toBeVisible({ timeout: 15000 });

    const labelSection = page.getByText(/Segmentasi & Label Kontak/).first();
    await expect(labelSection).toBeVisible();
    await labelSection.scrollIntoViewIfNeeded();
    await expect(
      page.getByText('Setiap organisasi memiliki label kontak sendiri untuk mengelompokkan pelanggan dan memfilter target kampanye siaran WhatsApp.')
    ).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_08_segmentasi_label_kontak_dark.png') });

    // Switch ke Light Mode untuk Segmentasi & Label Kontak
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'darkmode_08_segmentasi_label_kontak_light.png') });
  });
});
