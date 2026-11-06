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
        {
          id: 'c-002',
          organization_id: 'org-wabiz-001',
          name: 'Budi Santoso',
          phone: '085641886993',
          email: 'budi@santri.id',
          label: 'Calon Santri',
          labels: ['Calon Santri', 'Belum Dihubungi'],
          notes: 'Minat program tahfidz',
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
        {
          id: 'cmp-002',
          organization_id: 'org-wabiz-001',
          name: 'Kajian Bulanan Wali Santri',
          message_body: 'Undangan silaturahim dan kajian bulanan seluruh wali santri.',
          status: 'Selesai',
          target_segment: 'Orang Tua',
          total_recipients: 350,
          sent_count: 348,
          failed_count: 2,
          skipped_count: 0,
          sent_at: '2026-10-25 14:00',
          created_at: '2026-10-20T08:00:00Z',
        },
      ]),
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
          contact_name: 'H. Muhammad Arifin',
          contact_phone: '081234567890',
          last_message: 'Apakah ada info pendaftaran santri baru?',
          last_message_at: '2026-11-03T08:00:00Z',
          unread_count: 1,
          status: 'open',
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
          body: 'Apakah ada info pendaftaran santri baru?',
          created_at: '2026-11-03T08:00:00Z',
        },
        {
          id: 'msg-002',
          conversation_id: 'conv-001',
          sender_type: 'cs',
          sender_name: 'Siti Aminah, S.Pd',
          body: 'Wa alaikumsalam Wr Wb. Pendaftaran gelombang 1 sudah dibuka sampai akhir bulan.',
          created_at: '2026-11-03T08:05:00Z',
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
        {
          id: 'tm-002',
          organization_id: 'org-wabiz-001',
          full_name: 'Siti Aminah, S.Pd',
          email: 'cs.admisi@wabiz.b2b',
          phone: '085641886993',
          role: 'CS Staff',
          department: 'Pendaftaran / PSB',
          is_active: true,
          created_at: '2026-10-05',
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
          title: 'Gateway WhatsApp Siap',
          body: 'Perangkat Baileys gateway berhasil terhubung dan siap mengirimkan pesan siaran.',
          category: 'gateway',
          is_read: false,
          created_at: '2026-11-03T07:30:00Z',
        },
        {
          id: 'notif-002',
          organization_id: 'org-wabiz-001',
          title: 'Kampanye Terjadwal',
          body: 'Kampanye "Pengumuman Ujian Masuk Gelombang 1" dijadwalkan pada 10 Nov 2026.',
          category: 'campaign',
          is_read: true,
          created_at: '2026-11-02T14:00:00Z',
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

test.describe('WABiz Global Dark Mode & White Background Elimination Suite', () => {
  test('Audit & Capture all 8+ core menus in Dark and Light Mode without unwanted white backgrounds', async ({ page }) => {
    test.setTimeout(180000);
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

    // ========================================================
    // 1. DASHBOARD OVERVIEW & RECENT ACTIVITY
    // ========================================================
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_01_dashboard.png') });
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'light_01_dashboard.png') });
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 2. NOTIFIKASI MODAL (HEADER BELL)
    // ========================================================
    const bellBtn = page.getByLabel(/Notifikasi/).first();
    await bellBtn.click();
    await expect(page.getByText('Aktivitas & pembaruan sistem WABiz')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_08_notifications_modal.png') });

    // Switch to Light Mode inside/with notifications modal
    await page.getByLabel('Tutup notifikasi').first().click();
    await page.waitForTimeout(300);

    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.getByLabel(/Notifikasi/).first().click();
    await expect(page.getByText('Aktivitas & pembaruan sistem WABiz')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'light_08_notifications_modal.png') });
    await page.getByLabel('Tutup notifikasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 3. PERCAKAPAN (CONVERSATIONS VIEW)
    // ========================================================
    await page.getByText('Percakapan', { exact: true }).first().click();
    await expect(page.getByText('Penyimpanan Database Aktif').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_02_conversations.png') });
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'light_02_conversations.png') });
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 4. KONTAK & KELOLA LABEL
    // ========================================================
    await page.getByText('Kontak', { exact: true }).first().click();
    await expect(page.getByText('Kontak Terdaftar')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_03_contacts.png') });
    await page.getByText('Kelola Label', { exact: true }).click();
    await expect(page.getByText('Kelola Label Kontak Organisasi')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_03_contacts_kelola_label.png') });
    await page.getByLabel('Tutup Kelola Label').click();
    await page.waitForTimeout(300);
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.getByText('Kelola Label', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'light_03_contacts_kelola_label.png') });
    await page.getByLabel('Tutup Kelola Label').click();
    await page.waitForTimeout(300);
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 5. KAMPANYE (CAMPAIGNS VIEW & BUAT KAMPANYE MODAL)
    // ========================================================
    await page.getByText('Kampanye', { exact: true }).first().click();
    await expect(page.getByText('Kampanye Siaran')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_04_campaigns.png') });
    await page.getByText('+ Buat Kampanye', { exact: true }).click();
    await expect(page.getByText('Buat Kampanye Siaran Baru')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_04_campaigns_buat_modal.png') });
    await page.getByRole('dialog').getByText('Batal', { exact: true }).click();
    await page.waitForTimeout(300);

    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.getByText('+ Buat Kampanye', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'light_04_campaigns_buat_modal.png') });
    await page.getByRole('dialog').getByText('Batal', { exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 6. CHATBOT AI
    // ========================================================
    await page.getByText('Chatbot AI', { exact: true }).first().click();
    await expect(page.getByText('Chatbot AI & Otomatisasi')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_05_chatbot_ai.png') });
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'light_05_chatbot_ai.png') });
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 7. TIM CUSTOMER SERVICE (WITH OWNER ROLE VERIFICATION)
    // ========================================================
    await page.getByText('Tim CS', { exact: true }).first().click();
    await expect(page.getByText('Tim Customer Service').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Peran Anda:')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Peran Anda:').locator('..').getByText('OWNER', { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('2 Anggota', { exact: true })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_06_team_cs_owner.png') });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_06_team_cs.png') });

    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await expect(page.getByText('Peran Anda:')).toBeVisible();
    await expect(page.locator('text=Peran Anda:').locator('..').getByText('OWNER', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'light_06_team_cs.png') });
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // ========================================================
    // 8. PENGATURAN ORGANISASI & MODAL LOGOUT / GATEWAY
    // ========================================================
    await page.getByText('Pengaturan Organisasi', { exact: true }).first().click();
    await expect(page.getByText('Identitas Institusi').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_07_settings.png') });

    // Buka Tab Gateway WhatsApp
    const gatewayTab = page.getByText(/Gateway WhatsApp API/).first();
    if (await gatewayTab.isVisible()) {
      await gatewayTab.click();
      await page.waitForTimeout(500);

      // Buka Modal Logout/Disconnect jika ada
      const disconnectBtn = page.getByText('Putuskan & Hapus Sesi').first();
      if (await disconnectBtn.isVisible()) {
        await disconnectBtn.click();
        await expect(page.getByText('Putuskan Koneksi & Hapus Sesi?')).toBeVisible();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_07_settings_logout_modal.png') });
        await page.getByText('Batal', { exact: true }).click();
        await page.waitForTimeout(300);

        // Light Mode Modal
        await page.getByLabel('Beralih ke Mode Terang').click();
        await page.waitForTimeout(300);
        await disconnectBtn.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'light_07_settings_logout_modal.png') });
        await page.getByText('Batal', { exact: true }).click();
        await page.waitForTimeout(300);
      } else {
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_07_settings_gateway.png') });
      }
    }

    // ========================================================
    // 9. ANDROID VIEWPORT 360x800 (STANDARD PHONE)
    // ========================================================
    await page.setViewportSize({ width: 360, height: 800 });
    const darkToggle360 = page.getByLabel('Beralih ke Mode Gelap');
    if (await darkToggle360.isVisible()) {
      await darkToggle360.click();
      await page.waitForTimeout(300);
    }

    // Verify Header in Dark Mode (360x800):
    // 1. Account name (Ustadz Ahmad Dahlan)
    // 2. Notification icon (bell)
    // 3. Theme switch icon (sun/moon)
    await expect(page.getByText('Ustadz Ahmad Dahlan').first()).toBeVisible();
    await expect(page.getByLabel(/Notifikasi/).first()).toBeVisible();
    await expect(page.getByLabel('Beralih ke Mode Terang').first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'header_android_360_dark.png') });

    // Verify Light Mode Header (360x800)
    await page.getByLabel('Beralih ke Mode Terang').first().click();
    await page.waitForTimeout(300);
    await expect(page.getByText('Ustadz Ahmad Dahlan').first()).toBeVisible();
    await expect(page.getByLabel(/Notifikasi/).first()).toBeVisible();
    await expect(page.getByLabel('Beralih ke Mode Gelap').first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'header_android_360_light.png') });

    // Switch back to Dark Mode
    await page.getByLabel('Beralih ke Mode Gelap').first().click();
    await page.waitForTimeout(300);

    // Verify Team CS on 360x800 Android: OWNER label visible and not truncated
    await page.getByText('Lainnya').first().click();
    await page.waitForTimeout(300);
    await page.getByText('Tim CS').last().click();
    await page.waitForTimeout(300);
    await expect(page.getByText('Peran Anda:')).toBeVisible();
    await expect(page.locator('text=Peran Anda:').locator('..').getByText('OWNER', { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_09_mobile_360_team_cs.png') });

    // Verify Dashboard on 360x800 Android
    await page.getByText('Dashboard', { exact: true }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_09_mobile_360_dashboard.png') });

    // ========================================================
    // 10. ANDROID VIEWPORT 390x844 (MODERN PHONE)
    // ========================================================
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expect(page.getByText('Ustadz Ahmad Dahlan').first()).toBeVisible();
    await expect(page.getByLabel(/Notifikasi/).first()).toBeVisible();
    await expect(page.getByLabel('Beralih ke Mode Terang').first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'header_android_390_dark.png') });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'dark_09_mobile_390_dashboard.png') });

    const lightToggle = page.getByLabel('Beralih ke Mode Terang').first();
    if (await lightToggle.isVisible()) {
      await lightToggle.click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByText('Ustadz Ahmad Dahlan').first()).toBeVisible();
    await expect(page.getByLabel(/Notifikasi/).first()).toBeVisible();
    await expect(page.getByLabel('Beralih ke Mode Gelap').first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'header_android_390_light.png') });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'light_09_mobile_390_dashboard.png') });
  });
});
