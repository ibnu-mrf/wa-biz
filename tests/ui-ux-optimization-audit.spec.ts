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
          phone: '081234567890',
          email: 'arifin@wali.sch.id',
          label: 'Orang Tua',
          labels: ['Orang Tua', 'Sudah Dihubungi'],
          notes: 'Wali santri kelas 10 Aliyah',
          created_at: '2026-10-02T10:00:00Z',
        },
      ]),
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
      body: JSON.stringify([
        {
          id: 'conv-001',
          organization_id: 'org-wabiz-001',
          contact_id: 'c-001',
          status: 'open',
          last_message_at: '2026-11-03T08:15:00Z',
          contacts: {
            id: 'c-001',
            name: 'H. Muhammad Arifin (Wali Santri)',
            phone: '+62 812-3456-7890',
            email: 'arifin@wali.sch.id',
            labels: ['Wali Santri'],
          },
          team_members: null,
          created_at: '2026-10-02T10:00:00Z',
        },
      ]),
    });
  });

  await page.route('**/rest/v1/messages*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'msg-001',
          conversation_id: 'conv-001',
          sender_type: 'customer',
          sender_name: 'H. Muhammad Arifin',
          body: "Assalamu'alaikum Warahmatullahi Wabarakatuh admin WABiz.",
          created_at: '2026-11-03T08:00:00Z',
        },
        {
          id: 'msg-002',
          conversation_id: 'conv-001',
          sender_type: 'cs',
          sender_name: 'Siti Aminah, S.Pd',
          body: "Wa'alaikumussalam Warahmatullahi Wabarakatuh Bapak Arifin. Ada yang bisa kami bantu mengenai pendaftaran santri baru 2026?",
          created_at: '2026-11-03T08:05:00Z',
        },
        {
          id: 'msg-003',
          conversation_id: 'conv-001',
          sender_type: 'customer',
          sender_name: 'H. Muhammad Arifin',
          body: 'Mohon info terkait persyaratan beasiswa tahfidz 30 juz dan rincian biaya asrama untuk santri baru tahun ajaran 2026/2027. Apakah berkas portofolio sertifikat hafalan bisa dikirim via PDF langsung ke kontak ini?',
          created_at: '2026-11-03T08:10:00Z',
        },
        {
          id: 'msg-004',
          conversation_id: 'conv-001',
          sender_type: 'cs',
          sender_name: 'Siti Aminah, S.Pd',
          body: 'Tentu bisa Bapak. Tim panitia seleksi akan memverifikasi berkas tahfidz maksimal 1x24 jam kerja setelah dikirimkan. Kami kirimkan juga rincian panduan resminya ya Pak.',
          created_at: '2026-11-03T08:15:00Z',
        },
      ]),
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
      body: JSON.stringify([
        {
          id: 'notif-001',
          organization_id: 'org-wabiz-001',
          title: 'Pesan Masuk dari H. Muhammad Arifin',
          body: 'Pertanyaan beasiswa tahfidz santri baru memerlukan tindak lanjut dari tim CS Admisi.',
          category: 'chat',
          is_read: false,
          created_at: '2026-11-03T08:15:00Z',
        },
        {
          id: 'notif-002',
          organization_id: 'org-wabiz-001',
          title: 'Kampanye PSB Gelombang 1 Terkirim',
          body: 'Broadcast 120 pesan telah sukses dikirim tanpa kendala kuota WhatsApp API.',
          category: 'campaign',
          is_read: false,
          created_at: '2026-11-03T07:45:00Z',
        },
        {
          id: 'notif-003',
          organization_id: 'org-wabiz-001',
          title: 'Gateway Baileys Online & Stabil',
          body: 'Koneksi nomor +62 856-4188-6993 berstatus ready dengan latensi 120ms.',
          category: 'gateway',
          is_read: true,
          created_at: '2026-11-03T06:00:00Z',
        },
        {
          id: 'notif-004',
          organization_id: 'org-wabiz-001',
          title: 'Sinkronisasi Kontak Selesai',
          body: '250 kontak santri baru berhasil diperbarui dari database Google Sheets.',
          category: 'contact',
          is_read: true,
          created_at: '2026-11-02T19:30:00Z',
        },
      ]),
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

test.describe('UI/UX Optimization Audit Suite: Notifications & Mobile Conversations', () => {
  test('Verify Notification Center in Dark/Light & Mobile Viewports', async ({ page }) => {
    test.setTimeout(180000);
    await setupMockApi(page);

    await page.setViewportSize({ width: 1280, height: 900 });
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

    // 1. Desktop Notification Center - Dark Mode
    const bellBtn = page.getByLabel(/Notifikasi/).first();
    await bellBtn.click();
    await expect(page.getByText('Aktivitas & pembaruan sistem WABiz')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Pesan Masuk dari H. Muhammad Arifin')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'ui_opt_notif_dark_desktop.png') });

    // 2. Desktop Notification Center - Light Mode
    await page.getByLabel('Tutup notifikasi').first().click();
    await page.waitForTimeout(200);
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);

    await page.getByLabel(/Notifikasi/).first().click();
    await expect(page.getByText('Aktivitas & pembaruan sistem WABiz')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'ui_opt_notif_light_desktop.png') });
    await page.getByLabel('Tutup notifikasi').first().click();
    await page.waitForTimeout(200);

    // Switch back to Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // 3. Mobile Notification Center - 360x800
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(300);
    await page.getByLabel(/Notifikasi/).first().click();
    await expect(page.getByText('Aktivitas & pembaruan sistem WABiz')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'ui_opt_notif_mobile_360.png') });
    await page.getByLabel('Tutup notifikasi').first().click();
    await page.waitForTimeout(300);
  });

  test('Verify Conversations View on Android 360x800 & 390x844 with Wide Bubbles & Keyboard Focus', async ({ page }) => {
    test.setTimeout(180000);
    await setupMockApi(page);

    // Set mobile viewport 360x800
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

    // Open Percakapan from bottom navigation bar
    await page.getByText('Percakapan', { exact: true }).first().click();
    await expect(page.getByText('Pusat Percakapan').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'ui_opt_chat_list_mobile_360.png') });

    // Click on the conversation item
    await page.getByText('H. Muhammad Arifin (Wali Santri)').first().click();
    await page.waitForTimeout(400);

    // Verify outer page header is hidden and detail canvas is full bleed
    await expect(page.getByText('H. Muhammad Arifin (Wali Santri)').first()).toBeVisible();
    await expect(page.getByText('Tandai Selesai')).toBeVisible();
    await expect(page.getByText(/Alihkan.*AI/)).toBeVisible();
    await expect(page.getByText('Hapus')).toBeVisible();

    // Verify message bubbles rendered clearly
    await expect(page.getByText('Assalamu\'alaikum Warahmatullahi Wabarakatuh admin WABiz.')).toBeVisible();
    await expect(page.getByText(/persyaratan beasiswa tahfidz 30 juz/)).toBeVisible();

    // 1. Android 360x800 Dark Mode Detail
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'ui_opt_chat_detail_dark_360.png') });

    // 2. Focus input to simulate keyboard-ready state
    const chatInput = page.getByPlaceholder(/Ketik balasan pesan/i);
    await chatInput.click();
    await chatInput.fill('Siap Bapak, segera kami kirimkan brosur resminya.');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'ui_opt_chat_focused_input_360.png') });

    // 3. Android 390x844 Dark Mode Detail
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'ui_opt_chat_detail_dark_390.png') });

    // 4. Android 390x844 Light Mode Detail
    const lightToggle = page.getByLabel('Beralih ke Mode Terang').first();
    if (await lightToggle.isVisible()) {
      await lightToggle.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'ui_opt_chat_detail_light_390.png') });
    }
  });
});

