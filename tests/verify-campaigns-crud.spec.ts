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

const MOCK_ORGANIZATIONS = [
  {
    id: 'org-wabiz-001',
    name: 'Pesantren Teknologi Al-Hikmah',
    slug: 'al-hikmah',
    created_at: '2026-10-01T00:00:00Z',
  },
];

const MOCK_MEMBERS = [
  {
    id: 'mem-001',
    organization_id: 'org-wabiz-001',
    user_id: 'usr-wabiz-001',
    role: 'owner',
    created_at: '2026-10-01T00:00:00Z',
  },
];

const MOCK_CAMPAIGNS = [
  {
    id: 'camp-001',
    organization_id: 'org-wabiz-001',
    name: 'Pengumuman PSB Gelombang 1',
    message_body: 'Assalamu\'alaikum {{nama}}, pendaftaran santri baru gelombang 1 di {{organisasi}} telah dibuka. Kuota terbatas 100 santri.',
    status: 'draft',
    channel: 'WhatsApp Baileys Worker',
    sender_phone: '6285641886993',
    target_segment: 'Wali Santri',
    total_recipients: 45,
    sent_count: 0,
    failed_count: 0,
    skipped_count: 0,
    created_at: '2026-11-05T08:00:00Z',
    scheduled_at: null,
  },
  {
    id: 'camp-002',
    organization_id: 'org-wabiz-001',
    name: 'Kajian Akbar Bulanan & Doa Bersama',
    message_body: 'Yth. {{nama}}, mari hadiri Kajian Akbar bersama Buya Yahya hari Ahad pukul 08:30 WIB di Masjid Utama {{organisasi}}.',
    status: 'scheduled',
    channel: 'WhatsApp Baileys Worker',
    sender_phone: '6285641886993',
    target_segment: 'all',
    total_recipients: 120,
    sent_count: 0,
    failed_count: 0,
    skipped_count: 0,
    created_at: '2026-11-04T10:00:00Z',
    scheduled_at: '2026-11-10T09:00:00+07:00',
  },
  {
    id: 'camp-003',
    organization_id: 'org-wabiz-001',
    name: 'Siaran Darurat: Penyesuaian Jadwal Belajar',
    message_body: 'Pemberitahuan kepada seluruh wali santri, sehubungan dengan renovasi gedung kelas, kegiatan KBM besok dialihkan secara daring.',
    status: 'running',
    channel: 'WhatsApp Baileys Worker',
    sender_phone: '6285641886993',
    target_segment: 'all',
    total_recipients: 100,
    sent_count: 85,
    failed_count: 2,
    skipped_count: 3,
    created_at: '2026-11-05T09:30:00Z',
    scheduled_at: null,
  },
  {
    id: 'camp-004',
    organization_id: 'org-wabiz-001',
    name: 'Undangan Silaturahmi Wali Santri 2026',
    message_body: 'Terima kasih {{nama}} atas kehadirannya pada agenda Silaturahmi Akbar dan Laporan Tahunan Yayasan Al-Hikmah.',
    status: 'finished',
    channel: 'WhatsApp Baileys Worker',
    sender_phone: '6285641886993',
    target_segment: 'Wali Santri',
    total_recipients: 150,
    sent_count: 148,
    failed_count: 2,
    skipped_count: 0,
    created_at: '2026-11-01T07:00:00Z',
    scheduled_at: null,
  },
  {
    id: 'camp-005',
    organization_id: 'org-wabiz-001',
    name: 'Uji Coba Broadcast Awal Tahun',
    message_body: 'Pesan pengujian broadcast gateway sebelum peluncuran sistem baru.',
    status: 'cancelled',
    channel: 'WhatsApp Baileys Worker',
    sender_phone: '6285641886993',
    target_segment: 'all',
    total_recipients: 50,
    sent_count: 12,
    failed_count: 1,
    skipped_count: 37,
    created_at: '2026-10-28T14:00:00Z',
    scheduled_at: null,
  },
];

const MOCK_CONTACTS = [
  {
    id: 'ct-001',
    organization_id: 'org-wabiz-001',
    name: 'Ustadz Ahmad Fauzi',
    phone: '6281234567890',
    labels: ['Wali Santri'],
    opt_out: false,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'ct-002',
    organization_id: 'org-wabiz-001',
    name: 'Ibu Siti Rahmawati',
    phone: '6281398765432',
    labels: ['Donatur'],
    opt_out: false,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'ct-003',
    organization_id: 'org-wabiz-001',
    name: 'Bpk. Bambang Sutrisno',
    phone: '6285612345678',
    labels: ['Calon Santri'],
    opt_out: false,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'ct-004',
    organization_id: 'org-wabiz-001',
    name: 'H. Abdul Hakim',
    phone: '6287711223344',
    labels: ['Alumni'],
    opt_out: false,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'ct-005',
    organization_id: 'org-wabiz-001',
    name: 'Ibu Nurul Hidayah',
    phone: '6281987654321',
    labels: ['Wali Santri'],
    opt_out: false,
    created_at: '2026-10-01T00:00:00Z',
  },
];

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
      body: JSON.stringify(MOCK_MEMBERS),
    });
  });

  await page.route('**/rest/v1/organizations*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ORGANIZATIONS),
    });
  });

  await page.route('**/rest/v1/campaigns*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CAMPAIGNS),
    });
  });

  await page.route('**/rest/v1/contacts*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CONTACTS),
    });
  });

  await page.route('**/api/whatsapp/status*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        state: {
          status: 'connected',
          phoneNumber: '6285641886993',
          qrDataUrl: null,
        },
      }),
    });
  });
}

test.describe('Verify Campaigns CRUD UI/UX', () => {
  const configs = [
    { name: '360x800', width: 360, height: 800 },
    { name: '390x844', width: 390, height: 844 },
    { name: '412x915', width: 412, height: 915 },
    { name: '1280x720', width: 1280, height: 720 },
  ];

  for (const cfg of configs) {
    for (const isDark of [false, true]) {
      const mode = isDark ? 'dark' : 'light';

      test(`Campaigns CRUD on ${cfg.name} (${mode})`, async ({ page }) => {
        test.setTimeout(90000);
        await setupMocks(page);
        await page.setViewportSize({ width: cfg.width, height: cfg.height });

        await page.goto('/');
        await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
        await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
        await page.getByRole('button', { name: 'Masuk' }).click();

        await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

        // Set theme mode
        if (isDark) {
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

        // Navigate to Kampanye
        if (cfg.width < 768) {
          await page.getByLabel('Buka Menu Navigasi').first().click();
          await page.waitForTimeout(300);
          await page.getByLabel('Menu Navigasi Kampanye').first().click();
          await page.waitForTimeout(600);
        } else {
          await page.getByLabel('Menu Navigasi Kampanye').first().click();
          await page.waitForTimeout(600);
        }

        // 1. DAFTAR KAMPANYE (READ)
        await expect(page.getByText('Kampanye Siaran').first()).toBeVisible();
        await expect(page.getByText('Total Kampanye').first()).toBeVisible();
        await expect(page.getByText('Terjadwal & Berjalan').first()).toBeVisible();
        await expect(page.getByText('Selesai').first()).toBeVisible();
        await expect(page.getByText('Draf').first()).toBeVisible();

        // Capture Daftar Kampanye screenshot
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `campaigns_list_${cfg.name}_${mode}.png`),
          fullPage: false,
        });

        // 2. TAMBAH KAMPANYE (CREATE)
        const btnCreate = page.getByText('Buat Kampanye').first();
        if (await btnCreate.isVisible()) {
          await btnCreate.click();
          await page.waitForTimeout(500);

          await expect(page.getByText('Buat Kampanye Siaran Baru').first()).toBeVisible();
          await expect(page.getByText('Pratinjau Pesan WhatsApp:').first()).toBeVisible();

          if (cfg.name === '360x800' || cfg.name === '1280x720') {
            await page.screenshot({
              path: path.join(SCREENSHOTS_DIR, `campaigns_create_form_${cfg.name}_${mode}.png`),
              fullPage: false,
            });
          }

          // Close modal using exact Batal button
          await page.getByText('Batal', { exact: true }).first().click({ force: true });
          await page.waitForTimeout(400);
        }

        // 3. DETAIL KAMPANYE (READ DETAIL)
        const detailBtn = page.getByText('Detail').first();
        if (await detailBtn.isVisible()) {
          await detailBtn.click();
          await page.waitForTimeout(500);

          await expect(page.getByText('Detail data kampanye resmi').first()).toBeVisible();
          await expect(page.getByText('Total Penerima').first()).toBeVisible();

          if (cfg.name === '360x800' || cfg.name === '1280x720') {
            await page.screenshot({
              path: path.join(SCREENSHOTS_DIR, `campaigns_detail_${cfg.name}_${mode}.png`),
              fullPage: false,
            });
          }

          // Close detail modal using exact Tutup button
          await page.getByText('Tutup', { exact: true }).first().click({ force: true });
          await page.waitForTimeout(400);
        }

        // 4. EDIT KAMPANYE (UPDATE)
        const editBtn = page.getByText('Edit').first();
        if (await editBtn.isVisible()) {
          await editBtn.click();
          await page.waitForTimeout(500);

          await expect(page.getByText('Edit Draf Kampanye Siaran').first()).toBeVisible();
          await expect(page.getByText('Simpan Pembaruan').first()).toBeVisible();

          if (cfg.name === '360x800' || cfg.name === '1280x720') {
            await page.screenshot({
              path: path.join(SCREENSHOTS_DIR, `campaigns_edit_form_${cfg.name}_${mode}.png`),
              fullPage: false,
            });
          }

          // Close edit modal using exact Batal button
          await page.getByText('Batal', { exact: true }).first().click({ force: true });
          await page.waitForTimeout(400);
        }

        // 5. HAPUS KAMPANYE (DELETE)
        const deleteBtn = page.getByLabel('Hapus Kampanye').first();
        if (await deleteBtn.isVisible()) {
          await deleteBtn.click();
          await page.waitForTimeout(500);

          await expect(page.getByText('Hapus Kampanye Ini?').first()).toBeVisible();
          await expect(page.getByText('Ya, Hapus Permanen').first()).toBeVisible();

          if (cfg.name === '360x800' || cfg.name === '1280x720') {
            await page.screenshot({
              path: path.join(SCREENSHOTS_DIR, `campaigns_delete_modal_${cfg.name}_${mode}.png`),
              fullPage: false,
            });
          }

          // Cancel delete modal using exact Batal button
          await page.getByText('Batal', { exact: true }).first().click({ force: true });
          await page.waitForTimeout(400);
        }
      });
    }
  }
});
