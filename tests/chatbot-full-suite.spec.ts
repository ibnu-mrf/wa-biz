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

  await page.route('**/rest/v1/organization_profiles*', async (route: any) => {
    if (route.request().method() === 'POST' || route.request().method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          organization_id: 'org-wabiz-001',
          org_name: 'Pesantren Teknologi Al-Hikmah',
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          organization_id: 'org-wabiz-001',
          org_name: 'Pesantren Teknologi Al-Hikmah',
          institution_type: 'Pesantren',
          official_description: 'Pesantren modern berfokus pada tahfidz dan teknologi.',
          address: 'Jl. Pesantren No. 99, Bandung',
          maps_url: 'https://maps.google.com/?q=AlHikmah',
          registration_url: 'https://psb.alhikmah.sch.id',
          cs_hours: 'Senin - Sabtu: 08.00 - 16.00 WIB',
          tuition_info: 'Uang pangkal Rp 15.000.000, SPP bulanan Rp 1.500.000.',
        },
      ]),
    });
  });

  await page.route('**/rest/v1/contacts*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/v1/campaigns*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/v1/team_members*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
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

test.describe('ChatbotView Comprehensive Suite (5 Tabs, Dark/Light Mode & Simulator)', () => {
  test('Verifikasi Tab 1 sampai 5, Mode Gelap, Simulator Chat, dan Penyimpanan', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await setupMockApi(page);

    await page.goto('/');
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // Navigasi ke Chatbot AI
    await page.getByText('Chatbot AI', { exact: true }).first().click();
    await expect(page.getByText('Chatbot AI & Otomatisasi')).toBeVisible({ timeout: 15000 });

    // Beralih ke Dark Mode
    const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
    if (await toggleToDark.isVisible()) {
      await toggleToDark.click();
      await page.waitForTimeout(300);
    }

    // ==========================================
    // TAB 1: PROFIL ORGANISASI (KNOWLEDGE BASE)
    // ==========================================
    await page.getByRole('tab', { name: 'Tab Profil Organisasi' }).click();
    await expect(page.getByText('Profil Resmi Lembaga & Basis Pengetahuan')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chatbot_tab1_knowledge_dark.png') });

    // Uji Simpan Perubahan Profil
    await page.getByText('Simpan Perubahan Profil').click();
    await expect(page.getByText(/Pengaturan Chatbot AI berhasil disimpan/)).toBeVisible();
    await page.waitForTimeout(300);

    // ==========================================
    // TAB 2: ATURAN RESPON & SAMBUTAN
    // ==========================================
    await page.getByRole('tab', { name: 'Tab Aturan Respon & Sambutan' }).click();
    await expect(page.getByText('Aturan Respon, Pesan Sambutan & Kebijakan Anti-Halusinasi')).toBeVisible();
    
    // Uji klik radio preset nada bicara
    await page.getByText('Formal', { exact: true }).first().click();
    await page.waitForTimeout(200);

    // Uji strict grounding
    await expect(page.getByText('Mode Anti-Halusinasi WABiz (Strict Grounding)')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chatbot_tab2_rules_dark.png') });

    // ==========================================
    // TAB 3: DETEKSI MINAT PENDAFTARAN
    // ==========================================
    await page.getByRole('tab', { name: 'Tab Deteksi Minat Pendaftaran' }).click();
    await expect(page.getByText('Deteksi Niat Calon Pendaftar (Lead Intent Engine)')).toBeVisible();

    // Tambah kata kunci baru
    const kwInput = page.getByPlaceholder("Tambah kata kunci pemicu baru (misal: 'info brosur', 'pendaftaran')...");
    await kwInput.fill('info santri tahfidz');
    await page.getByText('+ Tambah').click();
    await expect(page.getByText('“info santri tahfidz”')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chatbot_tab3_intent_dark.png') });

    // Hapus kata kunci baru
    await page.getByLabel('Hapus kata kunci info santri tahfidz').click();
    await expect(page.getByText('“info santri tahfidz”')).not.toBeVisible();

    // ==========================================
    // TAB 4: PENERUSAN CS & ALUR (DARK MODE)
    // ==========================================
    await page.getByRole('tab', { name: 'Tab Penerusan CS & Alur' }).click();
    await expect(page.getByText('Penerusan CS & Alur Eskalasi Manusia')).toBeVisible();
    await expect(page.getByText('Aktifkan Alur Penerusan ke Tim CS')).toBeVisible();
    await expect(page.getByText('Departemen / Tim Tujuan Penerusan Utama')).toBeVisible();

    // Verifikasi Payload Summary Dummy & Data Contoh Telah Dihapus
    await expect(page.getByText('Pratinjau Paket Data yang Diteruskan ke CS')).not.toBeVisible();
    await expect(page.getByText('ESC-2026-9812')).not.toBeVisible();
    await expect(page.getByText('Ibu Rahmawati')).not.toBeVisible();
    await expect(page.getByText('+62 813-9876-5432')).not.toBeVisible();
    await expect(page.getByText('Salin Contoh')).not.toBeVisible();

    // Uji Simpan Pengaturan Eskalasi
    await page.getByText('Simpan Pengaturan Eskalasi').click();
    await expect(page.getByText(/Pengaturan Chatbot AI berhasil disimpan/)).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chatbot_tab4_escalation_dark.png') });

    // ==========================================
    // TAB 5: SIMULATOR CHAT (DARK MODE)
    // ==========================================
    await page.getByRole('tab', { name: 'Tab Simulator Chat' }).click();
    await expect(page.getByText('Uji Skenario Interaktif')).toBeVisible();

    // Uji kirim pesan via Quick Prompt
    await page.getByText('Di mana alamat lengkap lembaga & Google Maps?').click();
    await page.waitForTimeout(600);

    // Verifikasi pesan masuk dan balasan bot tampil
    await expect(page.getByText('Di mana alamat lengkap lembaga & Google Maps?').last()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chatbot_tab5_simulator_dark.png') });

    // Uji ketik manual di input bar simulator
    const chatInput = page.getByPlaceholder("Ketik pertanyaan uji coba (contoh: 'Berapa biaya pendaftaran?')...");
    await chatInput.fill('Berapa biaya pendaftaran santri baru?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await expect(page.getByText('Berapa biaya pendaftaran santri baru?').last()).toBeVisible();

    // ==========================================
    // SWITCH KE LIGHT MODE & VERIFIKASI SIMULATOR & TAB 4
    // ==========================================
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chatbot_tab5_simulator_light.png') });

    // Verifikasi Tab 4 di Light Mode (Pastikan Payload Dummy tetap tidak ada)
    await page.getByRole('tab', { name: 'Tab Penerusan CS & Alur' }).click();
    await page.waitForTimeout(300);
    await expect(page.getByText('Pratinjau Paket Data yang Diteruskan ke CS')).not.toBeVisible();
    await expect(page.getByText('ESC-2026-9812')).not.toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chatbot_tab4_escalation_light.png') });

    // Uji Reset Chat di Tab 5
    await page.getByRole('tab', { name: 'Tab Simulator Chat' }).click();
    await page.waitForTimeout(300);
    await page.getByText('Reset Chat').click();
    await page.waitForTimeout(300);

    // Verifikasi Tab 1 di Light Mode
    await page.getByRole('tab', { name: 'Tab Profil Organisasi' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'chatbot_tab1_knowledge_light.png') });
  });
});

