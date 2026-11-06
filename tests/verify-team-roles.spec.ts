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

async function setupMocks(page: any) {
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
}

test.describe('Verify Team CS Role Filter Layout', () => {
  const configs = [
    { name: '360x800', width: 360, height: 800, isDark: false },
    { name: '360x800', width: 360, height: 800, isDark: true },
    { name: '390x844', width: 390, height: 844, isDark: false },
    { name: '390x844', width: 390, height: 844, isDark: true },
  ];

  for (const cfg of configs) {
    const modeLabel = cfg.isDark ? 'dark' : 'light';
    test(`Team CS Role Filter on ${cfg.name} (${modeLabel})`, async ({ page }) => {
      test.setTimeout(90000);
      await setupMocks(page);
      await page.setViewportSize({ width: cfg.width, height: cfg.height });

      await page.goto('/');
      await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
      await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
      await page.getByRole('button', { name: 'Masuk' }).click();

      await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

      // Toggle dark mode if needed
      if (cfg.isDark) {
        const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
        if (await toggleToDark.isVisible()) {
          await toggleToDark.click();
          await page.waitForTimeout(300);
        }
      } else {
        const toggleToLight = page.getByLabel('Beralih ke Mode Terang');
        if (await toggleToLight.isVisible()) {
          await toggleToLight.click();
          await page.waitForTimeout(300);
        }
      }

      // Navigate to Tim CS
      await page.getByLabel('Buka Menu Navigasi').first().click();
      await page.waitForTimeout(300);
      await page.getByLabel('Menu Navigasi Tim CS').click();
      await page.waitForTimeout(600);

      // Verify sections exist
      await expect(page.getByText('Tim Customer Service').first()).toBeVisible();
      await expect(page.getByText('Departemen:').first()).toBeVisible();
      await expect(page.getByText('Status:').first()).toBeVisible();
      const peranLabel = page.getByText('Peran:').first();
      await expect(peranLabel).toBeVisible();

      // Scroll filter section into view so it is fully visible on mobile viewport
      await peranLabel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      // Verify Customer Service chip is visible
      const csChip = page.getByText('Customer Service', { exact: true }).first();
      await expect(csChip).toBeVisible();

      // Take screenshot of filter section initial view
      const screenshotFileInit = `team_role_filter_${cfg.name}_${modeLabel}.png`;
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, screenshotFileInit) });

      // Scroll the horizontal role ScrollView so Customer Service is fully in view with right space
      await csChip.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      // Check bounding box of Customer Service chip relative to viewport width
      const chipBox = await csChip.boundingBox();
      expect(chipBox).not.toBeNull();
      if (chipBox) {
        console.log(`[${cfg.name} ${modeLabel}] CS Chip bounding box after scrollIntoView:`, chipBox);
        expect(chipBox.width).toBeGreaterThan(60);
      }

      // Take screenshot showing the entire role bar with Customer Service and its right spacing
      const screenshotFileScrolled = `team_role_cs_chip_${cfg.name}_${modeLabel}.png`;
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, screenshotFileScrolled) });

      // Click Customer Service chip to verify filter functionality
      await csChip.click();
      await page.waitForTimeout(400);

      // Verify filtered result: only 1 member (Ahmad Fauzi)
      await expect(page.getByText('Ahmad Fauzi, S.Pd')).toBeVisible();
      await expect(page.getByText('Ustadzah Siti Aisyah')).toHaveCount(0);

      // Take screenshot with Customer Service filter active
      const screenshotFileActive = `team_role_filter_active_${cfg.name}_${modeLabel}.png`;
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, screenshotFileActive) });
    });
  }
});
