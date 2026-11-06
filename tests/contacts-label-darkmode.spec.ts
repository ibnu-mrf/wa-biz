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
          institution_type: 'Pesantren',
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
          institution_type: 'Pesantren',
          custom_labels: ['Calon Santri', 'Orang Tua', 'Santri Aktif', 'Alumni', 'Umum'],
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
          name: 'H. Muhammad Arifin (Wali)',
          phone: '081234567890',
          email: 'arifin@wali.sch.id',
          label: 'Orang Tua',
          labels: ['Orang Tua', 'Sudah Dihubungi'],
          follow_up_status: 'Sudah Dihubungi',
          notes: 'Wali santri kelas 10 Aliyah. Sudah mengonfirmasi kedatangan.',
          created_at: '2026-10-02T10:00:00Z',
        },
        {
          id: 'c-002',
          organization_id: 'org-wabiz-001',
          name: 'Budi Santoso Pratama',
          phone: '085641886993',
          email: 'budi@santri.id',
          label: 'Calon Santri',
          labels: ['Calon Santri', 'Belum Dihubungi'],
          follow_up_status: 'Belum Dihubungi',
          notes: 'Minat program tahfidz intensif tahun ajaran baru.',
          created_at: '2026-10-03T11:00:00Z',
        },
        {
          id: 'c-003',
          organization_id: 'org-wabiz-001',
          name: 'Fathur Rahman Al-Ghifari',
          phone: '081999888777',
          email: 'fauzi@santri.id',
          label: 'Santri Aktif',
          labels: ['Santri Aktif', 'Sudah Dihubungi'],
          follow_up_status: 'Sudah Dihubungi',
          notes: 'Santri berprestasi kelas 11 IPA tahfidz.',
          created_at: '2026-10-04T12:00:00Z',
        },
        {
          id: 'c-004',
          organization_id: 'org-wabiz-001',
          name: 'Ustadz Danang Wicaksono, Lc.',
          phone: '087833445566',
          email: 'danang@alumni.sch.id',
          label: 'Alumni',
          labels: ['Alumni', 'Belum Dihubungi'],
          follow_up_status: 'Belum Dihubungi',
          notes: 'Alumni angkatan 2020 (Universitas Al-Azhar Kairo).',
          created_at: '2026-10-05T09:00:00Z',
        },
        {
          id: 'c-005',
          organization_id: 'org-wabiz-001',
          name: 'Ibu Hj. Nurul Hidayati',
          phone: '089655667788',
          email: 'nurul@katering.com',
          label: 'Umum',
          labels: ['Umum', 'Belum Dihubungi'],
          follow_up_status: 'Belum Dihubungi',
          notes: 'Mitra katering konsumsi pesantren.',
          created_at: '2026-10-06T08:00:00Z',
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

test.describe('WABiz Contacts Label & Dark Mode Verification Suite', () => {
  test('Verifikasi Kelola Label, Dropdown Filter Label, dan Label Badges pada Dark Mode', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await setupMockApi(page);

    await page.goto('/');
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // Pastikan berada di Dark Mode
    const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
    if (await toggleToDark.isVisible()) {
      await toggleToDark.click();
      await page.waitForTimeout(300);
    }

    // 1. Navigasi ke menu Kontak
    await page.getByText('Kontak', { exact: true }).first().click();
    await expect(page.getByText('Kontak Terdaftar')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(400);

    // =========================================================================
    // DELIVERABLE 1: Kelola Label Terbuka (darkmode_contacts_kelola_label_modal_open.png)
    // =========================================================================
    const btnKelolaLabel = page.getByText('Kelola Label', { exact: true });
    await expect(btnKelolaLabel).toBeVisible();
    await btnKelolaLabel.click();

    // Verifikasi modal kelola label terbuka
    const modalTitle = page.getByText('Kelola Label Kontak Organisasi');
    await expect(modalTitle).toBeVisible();
    await expect(page.getByText('Tambah Label Baru')).toBeVisible();
    await expect(page.getByText(/Label Aktif/)).toBeVisible();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'darkmode_contacts_kelola_label_modal_open.png'),
    });

    // Tutup modal kelola label
    const btnTutupModal = page.getByLabel('Tutup Kelola Label');
    if (await btnTutupModal.isVisible()) {
      await btnTutupModal.click();
    } else {
      await page.getByText('Tutup', { exact: true }).click();
    }
    await page.waitForTimeout(300);

    // =========================================================================
    // DELIVERABLE 2: Dropdown Filter Label Terbuka (darkmode_contacts_filter_dropdown_open.png)
    // =========================================================================
    const dropdownTrigger = page.getByLabel('Pilih Filter Label Kontak');
    await expect(dropdownTrigger).toBeVisible();
    await dropdownTrigger.click();
    await page.waitForTimeout(400);

    // Verifikasi menu dropdown terbuka menampilkan pilihan label
    await expect(page.getByText('Semua Label').first()).toBeVisible();
    await expect(page.getByText('Calon Santri').first()).toBeVisible();
    await expect(page.getByText('Orang Tua').first()).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'darkmode_contacts_filter_dropdown_open.png'),
    });

    // =========================================================================
    // DELIVERABLE 3: Label yang Telah Dipilih (darkmode_contacts_filter_dropdown_selected.png)
    // =========================================================================
    // Klik pilihan 'Calon Santri' di dalam dropdown
    await page.getByLabel('Pilih Opsi Label Calon Santri').click();
    await page.waitForTimeout(400);

    // Verifikasi setelah dropdown tertutup: trigger menampilkan "Calon Santri"
    await expect(dropdownTrigger).toContainText('Calon Santri');
    // Verifikasi tombol Reset Filter muncul
    await expect(page.getByText('Reset Filter')).toBeVisible();
    // Verifikasi daftar kontak tersaring: menampilkan Budi Santoso Pratama
    await expect(page.getByText('Budi Santoso Pratama')).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'darkmode_contacts_filter_dropdown_selected.png'),
    });

    // =========================================================================
    // DELIVERABLE 4: Label Badge pada Baris/Kartu Kontak (darkmode_contacts_card_badge.png)
    // =========================================================================
    // Reset filter agar seluruh kontak dan badge label terlihat
    await page.getByText('Reset Filter').click();
    await page.waitForTimeout(400);

    // Pastikan beberapa badge label kontras terlihat
    await expect(page.getByText('H. Muhammad Arifin (Wali)')).toBeVisible();
    await expect(page.getByText('Budi Santoso Pratama')).toBeVisible();
    await expect(page.getByText('Fathur Rahman Al-Ghifari')).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'darkmode_contacts_card_badge.png'),
    });

    // =========================================================================
    // LIGHT MODE VERIFICATION FOR FULL COVERAGE
    // =========================================================================
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(400);

    // Light Mode: Card Badge
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'lightmode_contacts_card_badge.png'),
    });

    // Light Mode: Dropdown Filter Open
    await dropdownTrigger.click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'lightmode_contacts_filter_dropdown_open.png'),
    });

    // Light Mode: Dropdown Filter Selected
    await page.getByLabel('Pilih Opsi Label Orang Tua').click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'lightmode_contacts_filter_dropdown_selected.png'),
    });

    // Light Mode: Reset & Kelola Label Open
    await page.getByText('Reset Filter').click();
    await page.waitForTimeout(300);
    await page.getByText('Kelola Label', { exact: true }).click();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'lightmode_contacts_kelola_label_modal_open.png'),
    });
    await page.getByLabel('Tutup Kelola Label').click();
  });
});

