import { test, expect } from '@playwright/test';

declare const require: any;
const path = require('path');

const SCREENSHOTS_DIR = 'C:/Users/p/.gemini/antigravity/brain/fb6500eb-98bd-4ed5-aa82-83bfc9ebbc6e/screenshots';
const SAMPLE_QR_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADIAQMAAACGyrx+AAAABlBMVEX///8AAABVwtN+AAAAAXRSTlMAQObYZgAAACdJREFUeN7twQEBAAAAgiD/r25IQAEAAAAAAAAAAAAAAAAAAOBjBhIAAZ72R00AAAAASUVORK5CYII=';

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

async function setupMocks(page: any) {
  const sampleQrDataUrl = SAMPLE_QR_DATA_URL;

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

  // Mock team members list
  await page.route('**/rest/v1/team_members*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'tm-001',
          organization_id: 'org-wabiz-001',
          full_name: 'Ustadzah Siti Aisyah',
          email: 'siti.aisyah@alhikmah.sch.id',
          whatsapp_number: '6281234567890',
          role: 'Supervisor',
          department: 'Pendaftaran PSB',
          is_active: true,
          created_at: '2026-10-05T08:00:00Z',
        },
        {
          id: 'tm-002',
          organization_id: 'org-wabiz-001',
          full_name: 'Ahmad Fauzi, S.Pd',
          email: 'fauzi.cs@alhikmah.sch.id',
          whatsapp_number: '6285641886993',
          role: 'Customer Service',
          department: 'Customer Service',
          is_active: true,
          created_at: '2026-10-08T10:30:00Z',
        },
        {
          id: 'tm-003',
          organization_id: 'org-wabiz-001',
          full_name: 'Khadijah Putri',
          email: 'khadijah.keuangan@alhikmah.sch.id',
          whatsapp_number: '6287812345678',
          role: 'Admin',
          department: 'Keuangan & SPP',
          is_active: false,
          created_at: '2026-10-10T11:00:00Z',
        },
      ]),
    });
  });

  // Mock Gateway Worker /api/status
  await page.route('**/api/status', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          status: 'qr_ready',
          phoneNumber: null,
          whatsappName: null,
          lastQrAvailable: true,
          qrGeneratedAt: new Date().toISOString(),
          qrCount: 1,
          reconnectAttempts: 0,
          lastError: null,
          qrDataUrl: sampleQrDataUrl,
          countdownSeconds: 38,
        },
      }),
    });
  });

  await page.route('**/api/qr', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        status: 'qr_ready',
        generatedAt: new Date().toISOString(),
        qrDataUrl: sampleQrDataUrl,
        countdownSeconds: 38,
        isFresh: true,
      }),
    });
  });
}

test.describe('Verification: Team View & WhatsApp Gateway QR Layout', () => {
  const viewports = [
    { name: '360x800', width: 360, height: 800 },
    { name: '390x844', width: 390, height: 844 },
    { name: '412x915', width: 412, height: 915 },
  ];

  for (const vp of viewports) {
    test(`Verify Team View and WhatsApp Gateway on Android ${vp.name}`, async ({ page }) => {
      test.setTimeout(90000);
      await setupMocks(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await page.goto('/');
      await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
      await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
      await page.getByRole('button', { name: 'Masuk' }).click();

      await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

      // 1. TIM CS VERIFICATION
      await page.getByLabel('Buka Menu Navigasi').first().click();
      await page.waitForTimeout(300);
      await page.getByLabel('Menu Navigasi Tim CS').click();
      await page.waitForTimeout(500);

      // Verify header, filters, and chips
      await expect(page.getByText('Tim Customer Service').first()).toBeVisible();
      await expect(page.getByText('Departemen:').first()).toBeVisible();
      await expect(page.getByText('Status:').first()).toBeVisible();
      await expect(page.getByText('Peran:').first()).toBeVisible();

      // Ensure "Customer Service" chip is visible and clickable
      const csRoleChip = page.getByText('Customer Service', { exact: true }).first();
      await expect(csRoleChip).toBeVisible();

      // Capture Team View screenshot
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `verify_team_${vp.name}.png`) });

      // 2. GATEWAY WHATSAPP QR VERIFICATION
      await page.getByLabel('Buka Menu Navigasi').first().click();
      await page.waitForTimeout(300);
      await page.getByLabel('Menu Navigasi Pengaturan').click();
      await page.waitForTimeout(500);

      // Navigate to Gateway tab
      const gatewayTab = page.getByText('5. Gateway WhatsApp API');
      await gatewayTab.click();
      await page.waitForTimeout(600);

      // Assert that long instruction is completely removed
      const longInstruction = page.getByText('Buka aplikasi WhatsApp di ponsel uji coba > menu Titik Tiga / Pengaturan');
      await expect(longInstruction).toHaveCount(0);

      // Assert that short header "Hubungkan WhatsApp" and status pill are visible
      await expect(page.getByText('Hubungkan WhatsApp').first()).toBeVisible();
      await expect(page.getByText('QR Tersedia').first()).toBeVisible();

      // Assert countdown timer and refresh action
      await expect(page.getByText(/QR berlaku:/)).toBeVisible();
      await expect(page.getByText('Perbarui QR').first()).toBeVisible();

      // Capture Gateway QR screenshot
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `verify_gateway_qr_${vp.name}.png`) });
    });
  }
});
