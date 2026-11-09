import { test, expect } from '@playwright/test';
const path = require('path');

const SCREENSHOTS_DIR = 'C:/Users/p/.gemini/antigravity/brain/fb6500eb-98bd-4ed5-aa82-83bfc9ebbc6e/screenshots';

test.describe('Visual Verification: Modern Auth UI', () => {
  test('Capture Mobile 360x800 Light & Dark Mode', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');

    await expect(page.getByText('Selamat Datang Kembali')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('WhatsApp Business Management')).toBeVisible();
    await page.waitForTimeout(600); // Tunggu aset gambar termuat sempurna

    // Focus email field to showcase the glowing focus border as seen in mockup
    await page.getByPlaceholder('nama@organisasi.sch.id').focus();
    await page.waitForTimeout(200);

    // Screenshot Light Mode on Mobile 360x800
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'verify_modern_login_mobile_360x800_light.png'),
    });

    // Toggle Dark Mode
    const themeBtn = page.getByRole('button', { name: 'Ganti Mode Tema' });
    await themeBtn.click();
    await page.waitForTimeout(400);

    // Screenshot Dark Mode on Mobile 360x800
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'verify_modern_login_mobile_360x800_dark.png'),
    });
  });

  test('Capture Desktop 1280x850 View', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 850 });
    await page.goto('/');

    await expect(page.getByText('Selamat Datang Kembali')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(600);

    // Screenshot Desktop
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'verify_modern_login_desktop_1280x850.png'),
    });
  });
});
