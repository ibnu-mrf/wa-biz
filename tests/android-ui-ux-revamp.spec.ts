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
          phone: '+62 812-3456-7890',
          email: 'arifin@wali.sch.id',
          label: 'Orang Tua',
          labels: ['Orang Tua', 'Sudah Dihubungi'],
          notes: 'Wali santri kelas 10 Aliyah - Program Beasiswa Tahfidz',
          follow_up_status: 'Menunggu Respon',
          created_at: '2026-10-02T10:00:00Z',
        },
        {
          id: 'c-002',
          organization_id: 'org-wabiz-001',
          name: 'Budi Santoso',
          phone: '+62 856-4188-6993',
          email: 'budi@santri.id',
          label: 'Calon Santri',
          labels: ['Calon Santri'],
          notes: 'Pendaftar gelombang 1',
          follow_up_status: 'Baru',
          created_at: '2026-10-03T11:00:00Z',
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
      ]),
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

test.describe('WABiz Android UI/UX Revamp Suite (Drawer, Header, Kontak, Form Kampanye)', () => {
  test('Audit & Capture Android 360x800 & 390x844 Revamped Components', async ({ page }) => {
    test.setTimeout(180000);
    await setupMockApi(page);

    // Set viewport to Android 360x800
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // Ensure Dark Mode
    const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
    if (await toggleToDark.isVisible()) {
      await toggleToDark.click();
      await page.waitForTimeout(300);
    }

    // ========================================================
    // 1. HEADER VERIFICATION (Android 360x800)
    // ========================================================
    await expect(page.getByLabel('Buka Menu Navigasi')).toBeVisible();
    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible();
    await expect(page.getByLabel(/Notifikasi/).first()).toBeVisible();
    await expect(page.getByLabel('Beralih ke Mode Terang').first()).toBeVisible();
    await expect(page.getByText('Ustadz Ahmad Dahlan').first()).toBeVisible();
    await expect(page.getByText('OWNER').first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'header_dashboard_360_dark.png') });

    // Header in Light Mode
    await page.getByLabel('Beralih ke Mode Terang').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'header_dashboard_360_light.png') });

    // Switch back to Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').first().click();
    await page.waitForTimeout(300);

    // ========================================================
    // 2. SIDEBAR / DRAWER ANDROID (Android 360x800)
    // ========================================================
    // Open Drawer via hamburger button
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(400);

    // Verify Drawer Header, Brand & Close button
    await expect(page.getByLabel('Tutup Menu Navigasi')).toBeVisible();
    await expect(page.getByText('B2B SAAS')).toBeVisible();

    // Verify Compact User Profile Card in Drawer
    await expect(page.getByText('Ustadz Ahmad Dahlan').first()).toBeVisible();
    await expect(page.getByText('owner@wabiz.b2b')).toBeVisible();

    // Verify Grouped Navigation Headings
    await expect(page.getByText('MENU UTAMA')).toBeVisible();
    await expect(page.getByText('OTOMATISASI & TIM')).toBeVisible();
    await expect(page.getByText('SISTEM & AKUN')).toBeVisible();

    // Verify Logout Button in Drawer Footer
    await expect(page.getByText('Keluar dari Sesi')).toBeVisible();

    // Capture Drawer in Dark Mode (360x800)
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'drawer_android_360_dark.png') });

    // Close Drawer via close button
    await page.getByLabel('Tutup Menu Navigasi').first().click();
    await page.waitForTimeout(300);

    // ========================================================
    // 3. HALAMAN KONTAK & MODAL KELOLA LABEL (Android 360x800)
    // ========================================================
    // Open Kontak
    await page.getByText('Kontak', { exact: true }).first().click();
    await page.waitForTimeout(400);

    // Verify Header Kontak & Counter
    await expect(page.getByText('Kontak Terdaftar')).toBeVisible();
    await expect(page.getByPlaceholder(/Cari nama kontak/i)).toBeVisible();
    await expect(page.getByText('H. Muhammad Arifin').first()).toBeVisible();

    // Capture Kontak in Dark Mode
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'contacts_page_360_dark.png') });

    // Open Modal Kelola Label
    await page.getByText('Kelola Label', { exact: true }).click();
    await page.waitForTimeout(400);
    await expect(page.getByText('Kelola Label Kontak Organisasi')).toBeVisible();
    await expect(page.getByPlaceholder(/Reseller VIP/i)).toBeVisible();

    // Capture Modal Kelola Label in Dark Mode
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'contacts_manage_labels_360_dark.png') });

    // Close Modal Kelola Label
    await page.getByText('Tutup').first().click();
    await page.waitForTimeout(300);

    // Kontak in Light Mode
    await page.getByLabel('Beralih ke Mode Terang').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'contacts_page_360_light.png') });

    // Open Modal Kelola Label in Light Mode
    await page.getByText('Kelola Label', { exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'contacts_manage_labels_360_light.png') });
    await page.getByText('Tutup').first().click();
    await page.waitForTimeout(300);

    // Switch back to Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').first().click();
    await page.waitForTimeout(300);

    // ========================================================
    // 4. FORM TAMBAH KAMPANYE (Android 360x800)
    // ========================================================
    // Navigate to Kampanye
    await page.getByText('Kampanye', { exact: true }).first().click();
    await page.waitForTimeout(400);
    await expect(page.getByText('+ Buat Kampanye')).toBeVisible();

    // Click "+ Buat Kampanye"
    await page.getByText('+ Buat Kampanye').first().click();
    await page.waitForTimeout(400);

    // Verify Modal Form Header and Content
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Buat Kampanye Siaran Baru')).toBeVisible();
    await expect(dialog.getByPlaceholder('Contoh: Pengumuman PSB Gelombang 1')).toBeVisible();
    await expect(dialog.getByText('Pratinjau Pesan Pelanggan (WhatsApp Preview):')).toBeVisible();
    await expect(dialog.getByText('Kirim Sekarang', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Terjadwal', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Simpan Draf', { exact: true })).toBeVisible();

    // Fill form name and message to see live WhatsApp preview
    await dialog.getByPlaceholder('Contoh: Pengumuman PSB Gelombang 1').fill('Broadcast Ujian Masuk Gelombang 2');
    await dialog.getByPlaceholder(/Ketik draf isi pesan/i).fill('Assalamu alaikum Wr Wb. Ujian seleksi masuk gelombang 2 akan dilaksanakan hari Sabtu jam 08.00 WIB.');
    await page.waitForTimeout(300);

    // Capture Form Tambah Kampanye in Dark Mode (360x800)
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'campaign_create_form_360_dark.png') });

    // Click "Terjadwal" to show Calendar & Analog Clock Scheduler
    await dialog.getByText('Terjadwal', { exact: true }).click();
    await page.waitForTimeout(400);
    await expect(dialog.getByText(/Jadwal Kalender & Jam Pengiriman/i)).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'campaign_create_form_scheduled_dark.png') });

    // Cancel / Close Form
    await dialog.getByText('Batal').first().click();
    await page.waitForTimeout(300);

    // Form Tambah Kampanye in Light Mode
    await page.getByLabel('Beralih ke Mode Terang').first().click();
    await page.waitForTimeout(300);
    await page.getByText('+ Buat Kampanye').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'campaign_create_form_360_light.png') });
    await page.getByRole('dialog').getByText('Batal').first().click();
    await page.waitForTimeout(300);

    // Switch back to Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').first().click();
    await page.waitForTimeout(300);

    // ========================================================
    // 5. VIEWPORT 390x844 (MODERN PHONE)
    // ========================================================
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    // Capture Drawer on 390x844
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(400);
    await expect(page.getByText('MENU UTAMA')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'drawer_android_390_dark.png') });
    await page.getByLabel('Tutup Menu Navigasi').first().click();
    await page.waitForTimeout(300);

    // Capture Kontak on 390x844
    await page.getByText('Kontak', { exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'contacts_page_390_dark.png') });

    // Capture Form Kampanye on 390x844
    await page.getByText('Kampanye', { exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.getByText('+ Buat Kampanye').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'campaign_create_form_390_dark.png') });
    await page.getByRole('dialog').getByText('Batal').first().click();
    await page.waitForTimeout(300);
  });
});

