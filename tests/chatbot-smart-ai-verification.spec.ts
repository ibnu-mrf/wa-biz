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
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/rest/v1/campaigns*', async (route: any) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/rest/v1/team_members*', async (route: any) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.route('**/rest/v1/notifications*', async (route: any) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
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

test.describe('Chatbot AI General Intelligence & Simulator Tests', () => {
  test('Chatbot mampu menjawab pertanyaan umum layaknya AI percakapan modern', async ({ page }) => {
    test.setTimeout(90000);
    await setupMockApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/');
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // Navigasi ke Chatbot AI
    await page.getByText('Chatbot AI', { exact: true }).first().click();
    await expect(page.getByText('Chatbot AI & Otomatisasi')).toBeVisible({ timeout: 15000 });

    // Buka Tab Simulator Chat
    await page.getByRole('tab', { name: 'Tab Simulator Chat' }).click();
    await expect(page.getByText('Uji Skenario Interaktif')).toBeVisible();

    const chatInput = page.getByPlaceholder("Ketik pertanyaan uji coba (contoh: 'Berapa biaya pendaftaran?')...");

    // 1. Uji Matematika
    await chatInput.fill('Hitung 25 * 14');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await expect(page.getByText(/Hasil perhitungan/i).last()).toBeVisible();
    await expect(page.getByText(/350/).last()).toBeVisible();

    // 2. Uji Copywriting Promosi
    await chatInput.fill('Buatkan pesan promosi diskon 20%');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await expect(page.getByText(/PENAWARAN SPESIAL TERBATAS/i).last()).toBeVisible();

    // 3. Uji Pertanyaan Umum AI & Teknologi
    await chatInput.fill('Apa itu AI?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await expect(page.getByText(/Artificial Intelligence/i).last()).toBeVisible();

    // 4. Uji Chit-chat Lelucon
    await chatInput.fill('Ceritakan lelucon lucu');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await expect(page.getByText(/lelucon untuk Anda/i).last()).toBeVisible();

    // 5. Uji Puisi / Karya Sastra
    await chatInput.fill('Buatkan puisi singkat');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    await expect(page.getByText(/MENENUN CAHAYA MASA DEPAN/i).last()).toBeVisible();

    // 6. Uji Tombol Scroll ke Bawah
    const scrollBottomBtn = page.getByRole('button', { name: 'Scroll ke pesan terbaru' });
    await expect(scrollBottomBtn).toBeVisible();
    await scrollBottomBtn.click();
    await page.waitForTimeout(400);

    // Ambil tangkapan layar bukti verifikasi
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'verify_chatbot_general_ai_intelligence.png'),
    });
  });
});

