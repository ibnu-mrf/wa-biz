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

  await page.route('**/rest/v1/conversations*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/v1/messages*', async (route: any) => {
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

test.describe('WABiz Navigation Drawer Light & Dark Mode Symmetrical Verification', () => {
  test('Capture Drawer in Light and Dark Mode on 360x800 and 390x844', async ({ page }) => {
    test.setTimeout(180000);
    await setupMockApi(page);

    // 1. Android Viewport 360x800
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // Pastikan Dark Mode
    const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
    if (await toggleToDark.isVisible()) {
      await toggleToDark.click();
      await page.waitForTimeout(300);
    }

    // ========================================================
    // A. DRAWER DI DARK MODE (360x800)
    // ========================================================
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(400);

    // Verifikasi Komponen Drawer Dark Mode
    await expect(page.getByText('WABiz').first()).toBeVisible();
    await expect(page.getByText('B2B SAAS').first()).toBeVisible();
    await expect(page.getByText('Pesantren Teknologi Al-Hikmah').first()).toBeVisible();
    await expect(page.getByLabel('Tutup Menu Navigasi')).toBeVisible();
    await expect(page.getByText('Ustadz Ahmad Dahlan').first()).toBeVisible();
    await expect(page.getByText('OWNER').first()).toBeVisible();
    await expect(page.getByText('owner@wabiz.b2b')).toBeVisible();

    // Menu Navigasi Utama
    await expect(page.getByText('MENU UTAMA')).toBeVisible();
    await expect(page.getByText('Dashboard', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Percakapan', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Kontak', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Kampanye', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Chatbot AI', { exact: true })).toBeVisible();
    await expect(page.getByText('Tim CS', { exact: true })).toBeVisible();
    await expect(page.getByText('Pengaturan Organisasi', { exact: true })).toBeVisible();

    // Bagian Bawah: WhatsApp Gateway & Logout
    await expect(page.getByText('Gateway Belum Aktif')).toBeVisible();
    await expect(page.getByLabel('Keluar dari akun WABiz')).toBeVisible();
    await expect(page.getByText('WABiz v2.4')).toBeVisible();

    // Tangkap Screenshot Drawer Dark Mode (360x800)
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'drawer_android_360_dark.png') });

    // Tutup Drawer
    await page.getByLabel('Tutup Menu Navigasi').first().click();
    await page.waitForTimeout(300);

    // ========================================================
    // B. DRAWER DI LIGHT MODE (360x800)
    // ========================================================
    await page.getByLabel('Beralih ke Mode Terang').first().click();
    await page.waitForTimeout(300);

    // Buka Drawer di Light Mode
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(400);

    // Verifikasi elemen yang sama persis (Navy Drawer yang identik)
    await expect(page.getByText('WABiz').first()).toBeVisible();
    await expect(page.getByText('B2B SAAS').first()).toBeVisible();
    await expect(page.getByText('Pesantren Teknologi Al-Hikmah').first()).toBeVisible();
    await expect(page.getByLabel('Tutup Menu Navigasi')).toBeVisible();
    await expect(page.getByText('Ustadz Ahmad Dahlan').first()).toBeVisible();
    await expect(page.getByText('OWNER').first()).toBeVisible();
    await expect(page.getByText('owner@wabiz.b2b')).toBeVisible();

    await expect(page.getByText('MENU UTAMA')).toBeVisible();
    await expect(page.getByText('Dashboard', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Percakapan', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Kontak', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Kampanye', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Chatbot AI', { exact: true })).toBeVisible();
    await expect(page.getByText('Tim CS', { exact: true })).toBeVisible();
    await expect(page.getByText('Pengaturan Organisasi', { exact: true })).toBeVisible();

    await expect(page.getByText('Gateway Belum Aktif')).toBeVisible();
    await expect(page.getByLabel('Keluar dari akun WABiz')).toBeVisible();
    await expect(page.getByText('WABiz v2.4')).toBeVisible();

    // Tangkap Screenshot Drawer Light Mode (360x800)
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'drawer_android_360_light.png') });

    // Tutup Drawer
    await page.getByLabel('Tutup Menu Navigasi').first().click();
    await page.waitForTimeout(300);

    // ========================================================
    // C. VIEWPORT 390x844 (MODERN ANDROID)
    // ========================================================
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    // Buka Drawer di Light Mode (390x844)
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'drawer_android_390_light.png') });
    await page.getByLabel('Tutup Menu Navigasi').first().click();
    await page.waitForTimeout(300);

    // Ganti ke Dark Mode (390x844)
    await page.getByLabel('Beralih ke Mode Gelap').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'drawer_android_390_dark.png') });
    await page.getByLabel('Tutup Menu Navigasi').first().click();
    await page.waitForTimeout(300);

    // ========================================================
    // D. VIEWPORT 412x915 (LARGE ANDROID)
    // ========================================================
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(300);
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'drawer_android_412_dark.png') });
    await page.getByLabel('Tutup Menu Navigasi').first().click();
    await page.waitForTimeout(300);
  });
});
