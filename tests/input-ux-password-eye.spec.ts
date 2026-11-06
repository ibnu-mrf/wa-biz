import { test, expect } from '@playwright/test';

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
          organization_id: 'org-wabiz-001',
          user_id: 'usr-wabiz-001',
          role: 'owner',
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
          name: 'Pesantren Digital WABiz',
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
          org_name: 'Pesantren Digital WABiz',
          short_name: 'WABiz Academy',
          institution_type: 'Pesantren / Islamic Boarding School',
          official_description: 'Lembaga pendidikan Islam modern berbasis otomatisasi WhatsApp.',
          official_email: 'info@pesantrendigital-wabiz.sch.id',
          escalation_phone: '+62 812-3456-7890',
          address: 'Jl. Merdeka Bisnis No. 10, Jakarta Selatan',
          maps_url: 'https://maps.google.com/?q=WABiz',
          website_url: 'https://pesantrendigital-wabiz.sch.id',
          registration_url: 'https://pesantrendigital-wabiz.sch.id/daftar',
          info_page_url: 'https://pesantrendigital-wabiz.sch.id/info',
          admission_schedule: 'Gelombang I: Nov 2026 - Jan 2027',
          tuition_info: 'Pendaftaran: Rp 250.000',
          facilities: 'Masjid, Asrama, Lab Komputer',
          cs_hours: 'Senin - Sabtu 08.00 - 16.00 WIB',
          operational_days: 'Senin - Sabtu',
          admission_contact: '+62 812-3456-7890',
          requirements: 'Kartu Keluarga, Ijazah',
          webhook_url: 'https://api.wabiz.b2b/webhook',
          verify_token: 'secret-verify-token-12345',
          custom_labels: ['Santri Baru', 'Wali Santri'],
          faqs: [],
        },
      ]),
    });
  });

  await page.route('**/rest/v1/contacts*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' } });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'cnt_1',
          organization_id: 'org-wabiz-001',
          name: 'Muhammad Rizky Pratama',
          phone: '+62 812-8899-7711',
          email: 'rizky.pratama@gmail.com',
          labels: ['Santri Baru'],
          notes: 'Tertarik program tahfidz intensif.',
          created_at: '2026-10-25T10:00:00Z',
        },
      ]),
    });
  });

  await page.route('**/rest/v1/campaigns*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' } });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/v1/team_members*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' } });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/v1/notifications*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' } });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/v1/conversations*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' } });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/status', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'connected',
        user: { id: '6281234567890:1@s.whatsapp.net', name: 'Pesantren Digital WABiz' },
      }),
    });
  });

  await page.route('**/api/qr', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        status: 'connected',
        message: 'Perangkat sudah terhubung',
      }),
    });
  });
}

test.describe('WABiz UI/UX Input Focus & Password Eye Toggle Tests', () => {
  test('1. Login Password Field: toggle mata tampilkan/sembunyikan kata sandi', async ({ page }) => {
    await page.goto('/');
    const passwordInput = page.getByPlaceholder('Minimal 6 karakter');
    await expect(passwordInput).toBeVisible({ timeout: 15000 });

    // A. Password default adalah tipe password (masked)
    const initialType = await passwordInput.evaluate((el: HTMLInputElement) => el.type);
    expect(initialType).toBe('password');

    // Tombol mata memiliki label "Tampilkan kata sandi" saat tersembunyi
    const eyeBtn = page.getByRole('button', { name: 'Tampilkan kata sandi' });
    await expect(eyeBtn).toBeVisible();

    // B. Isi kata sandi
    await passwordInput.fill('Rahasia123!');
    expect(await passwordInput.inputValue()).toBe('Rahasia123!');

    // C. Klik tombol mata untuk menampilkan password
    await eyeBtn.click();

    // Verifikasi tipe input berubah ke text (unmasked)
    const unmaskedType = await passwordInput.evaluate((el: HTMLInputElement) => el.type);
    expect(unmaskedType).toBe('text');
    // Verifikasi teks TIDAK hilang
    expect(await passwordInput.inputValue()).toBe('Rahasia123!');

    // Verifikasi label tombol berubah menjadi "Sembunyikan kata sandi"
    const hideEyeBtn = page.getByRole('button', { name: 'Sembunyikan kata sandi' });
    await expect(hideEyeBtn).toBeVisible();

    // D. Klik kembali untuk menyembunyikan password
    await hideEyeBtn.click();
    const remaskedType = await passwordInput.evaluate((el: HTMLInputElement) => el.type);
    expect(remaskedType).toBe('password');
    expect(await passwordInput.inputValue()).toBe('Rahasia123!');
    await expect(page.getByRole('button', { name: 'Tampilkan kata sandi' })).toBeVisible();

    // Screenshot Login Password Toggle
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/test_01_login_password_eye_toggle.png` });
  });

  test('2. Register Form: toggle mata independen untuk Password & Konfirmasi Password', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Daftar Baru' }).click();

    const passInput = page.getByPlaceholder('Minimal 6 karakter');
    const confirmPassInput = page.getByPlaceholder('Ulangi kata sandi');

    await expect(passInput).toBeVisible();
    await expect(confirmPassInput).toBeVisible();

    // A. Keduanya default masked
    expect(await passInput.evaluate((el: HTMLInputElement) => el.type)).toBe('password');
    expect(await confirmPassInput.evaluate((el: HTMLInputElement) => el.type)).toBe('password');

    await passInput.fill('SandiUtama123');
    await confirmPassInput.fill('SandiUtama123');

    // B. Toggle password utama saja
    const showPassBtn = page.getByRole('button', { name: 'Tampilkan kata sandi' });
    await showPassBtn.click();

    // Password utama unmasked, konfirmasi tetap masked
    expect(await passInput.evaluate((el: HTMLInputElement) => el.type)).toBe('text');
    expect(await confirmPassInput.evaluate((el: HTMLInputElement) => el.type)).toBe('password');
    expect(await passInput.inputValue()).toBe('SandiUtama123');
    expect(await confirmPassInput.inputValue()).toBe('SandiUtama123');

    // C. Toggle konfirmasi password
    const showConfirmPassBtn = page.getByRole('button', { name: 'Tampilkan konfirmasi kata sandi' });
    await showConfirmPassBtn.click();

    // Keduanya sekarang unmasked
    expect(await passInput.evaluate((el: HTMLInputElement) => el.type)).toBe('text');
    expect(await confirmPassInput.evaluate((el: HTMLInputElement) => el.type)).toBe('text');

    // Screenshot Register Password Toggle
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/test_02_register_password_eye_toggle.png` });
  });

  test('3. Verifikasi ketiadaan garis hitam (outline: none) dan focus ring teal saat input difokuskan', async ({ page }) => {
    await page.goto('/');
    const emailInput = page.getByPlaceholder('nama@organisasi.sch.id');
    await emailInput.click();
    await page.waitForTimeout(200);

    const emailComputed = await emailInput.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const parent = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
      return {
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        parentBorderColor: parent?.borderColor,
        parentBoxShadow: parent?.boxShadow,
      };
    });

    // Garis hitam browser harus 0px / none
    expect(emailComputed.outlineStyle).toBe('none');
    expect(emailComputed.outlineWidth).toBe('0px');

    // Parent container memiliki border teal dan focus glow halus
    expect(emailComputed.parentBorderColor).toBe('rgb(13, 148, 136)');
    expect(emailComputed.parentBoxShadow).toContain('rgba(13, 148, 136');

    // Screenshot Focus State Tanpa Garis Hitam
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/test_03_login_clean_focus_ring.png` });
  });

  test('4. Verifikasi input focus pada Dashboard, Kontak, dan Pengaturan Organisasi', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupMockApi(page);
    await page.goto('/');

    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    // Tunggu Dashboard termuat
    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // A. Focus pada Top Header Global Search
    const topSearch = page.getByPlaceholder('Pencarian cepat (Ctrl+K)...');
    await expect(topSearch).toBeVisible();
    await topSearch.click();
    await page.waitForTimeout(200);

    const searchStyles = await topSearch.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const parent = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
      return {
        outline: cs.outlineStyle,
        parentBorderColor: parent?.borderColor,
      };
    });

    expect(searchStyles.outline).toBe('none');
    expect(searchStyles.parentBorderColor).toBe('rgb(13, 148, 136)');
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/test_04_dashboard_search_focus.png` });

    // B. Navigasi ke Kontak
    await page.getByText('Kontak', { exact: true }).first().click();
    await expect(page.getByText('Kontak Terdaftar')).toBeVisible({ timeout: 15000 });

    const contactSearch = page.getByPlaceholder('Cari nama kontak, nomor WhatsApp, atau label...');
    await contactSearch.click();
    await page.waitForTimeout(200);

    const contactSearchStyles = await contactSearch.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { outline: cs.outlineStyle };
    });
    expect(contactSearchStyles.outline).toBe('none');

    // Buka Modal Tambah Kontak
    await page.getByText('+ Tambah Kontak').click();
    await expect(page.getByPlaceholder('Contoh: Budi Santoso')).toBeVisible();

    const nameInput = page.getByPlaceholder('Contoh: Budi Santoso');
    await nameInput.click();
    await page.waitForTimeout(200);

    const nameInputStyles = await nameInput.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        outline: cs.outlineStyle,
        borderColor: cs.borderColor,
      };
    });
    expect(nameInputStyles.outline).toBe('none');
    expect(nameInputStyles.borderColor).toBe('rgb(13, 148, 136)');

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/test_05_contact_modal_input_focus.png` });
  });

  test('5. Verifikasi Verify Token Webhook pada Pengaturan Gateway memiliki eye toggle rahasia', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupMockApi(page);
    await page.goto('/');

    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // Navigasi ke Pengaturan Organisasi
    await page.getByText('Pengaturan Organisasi', { exact: true }).first().click();
    await expect(page.getByText('Identitas & Profil Resmi Institusi').first()).toBeVisible({ timeout: 15000 });

    // Klik tab Gateway WhatsApp API
    await page.getByText('5. Gateway WhatsApp API').click();
    await expect(page.getByText('Koneksi WhatsApp Staging (QR Pairing Baileys)')).toBeVisible({ timeout: 15000 });

    // Verifikasi kolom Verify Token Webhook
    const verifyTokenInput = page.getByPlaceholder('Token verifikasi rahasia...');
    await expect(verifyTokenInput).toBeVisible();

    // Default adalah masked (password)
    expect(await verifyTokenInput.evaluate((el: HTMLInputElement) => el.type)).toBe('password');

    // Tombol mata untuk verify token
    const showTokenBtn = page.getByRole('button', { name: 'Tampilkan verify token webhook' });
    await expect(showTokenBtn).toBeVisible();

    // Klik toggle
    await showTokenBtn.click();
    expect(await verifyTokenInput.evaluate((el: HTMLInputElement) => el.type)).toBe('text');

    const hideTokenBtn = page.getByRole('button', { name: 'Sembunyikan verify token webhook' });
    await expect(hideTokenBtn).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOTS_DIR}/test_06_settings_verify_token_eye_toggle.png` });
  });
});
