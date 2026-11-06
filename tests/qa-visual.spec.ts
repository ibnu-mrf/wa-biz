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
  // Auth token
  await page.route('**/auth/v1/token*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SESSION),
    });
  });

  // Auth user
  await page.route('**/auth/v1/user*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_USER),
    });
  });

  // Organization members
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

  // Organizations
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

  // Organization profiles
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
          tuition_info: 'Rincian biaya pendaftaran tersedia online',
          requirements: 'Ijazah terakhir, Pasfoto, Akta Kelahiran',
          admission_contact: '+62 812-3456-7890',
          cs_hours: '08:00 - 17:00 WIB',
          operational_days: 'Senin - Sabtu',
          facilities: 'Asrama Putra/Putri, Lab Bahasa & Komputer, Masjid',
          faqs: [
            { id: 'faq_1', question: 'Kapan pendaftaran dibuka?', answer: 'Pendaftaran gelombang 1 dibuka mulai 1 November 2026.' },
            { id: 'faq_2', question: 'Apakah tersedia beasiswa?', answer: 'Tersedia beasiswa tahfidz dan prestasi akademik.' }
          ],
        },
      ]),
    });
  });

  // Contacts
  await page.route('**/rest/v1/contacts*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({
        status: 200,
        headers: {
          'content-range': '0-4/5',
        },
      });
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
          labels: ['Calon Santri', 'Perlu Follow-up'],
          notes: 'Tertarik program tahfidz intensif.',
          created_at: '2026-10-25T10:00:00Z',
        },
        {
          id: 'cnt_2',
          organization_id: 'org-wabiz-001',
          name: 'Haji Suhendra (Wali)',
          phone: '+62 813-2233-4455',
          email: 'suhendra.wali@gmail.com',
          labels: ['Orang Tua', 'Sudah Dihubungi'],
          notes: 'Mengonfirmasi kedatangan rapat wali santri.',
          created_at: '2026-10-20T14:30:00Z',
        },
        {
          id: 'cnt_3',
          organization_id: 'org-wabiz-001',
          name: 'Fathur Rahman Al-Ghifari',
          phone: '+62 857-9911-2233',
          email: 'fathur.rahman@yahoo.com',
          labels: ['Santri Aktif', 'Sudah Dihubungi'],
          notes: 'Ketua delegasi pidato bahasa Arab.',
          created_at: '2026-10-15T09:15:00Z',
        },
        {
          id: 'cnt_4',
          organization_id: 'org-wabiz-001',
          name: 'Ustadz Danang Wicaksono, Lc.',
          phone: '+62 878-3344-5566',
          email: 'danang.w@alumni.ac.id',
          labels: ['Alumni', 'Belum Dihubungi'],
          notes: 'Alumni Kairo, sesi motivasi santri.',
          created_at: '2026-10-10T11:00:00Z',
        },
        {
          id: 'cnt_5',
          organization_id: 'org-wabiz-001',
          name: 'Ibu Nurul Hidayati',
          phone: '+62 896-5566-7788',
          email: 'nurul.hidayati@gmail.com',
          labels: ['Umum', 'Belum Dihubungi'],
          notes: 'Kemitraan katering asrama santri.',
          created_at: '2026-10-05T16:45:00Z',
        },
      ]),
    });
  });

  // Conversations
  await page.route('**/rest/v1/conversations*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({
        status: 200,
        headers: {
          'content-range': '0-2/3',
        },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'conv_1',
          organization_id: 'org-wabiz-001',
          contact_id: 'cnt_1',
          status: 'open',
          last_message_at: '2026-11-01T03:42:00Z',
          contacts: {
            id: 'cnt_1',
            name: 'Muhammad Rizky Pratama',
            phone: '+62 812-8899-7711',
            email: 'rizky.pratama@gmail.com',
            labels: ['Calon Santri'],
          },
        },
        {
          id: 'conv_2',
          organization_id: 'org-wabiz-001',
          contact_id: 'cnt_2',
          status: 'pending',
          last_message_at: '2026-11-01T02:15:00Z',
          contacts: {
            id: 'cnt_2',
            name: 'Haji Suhendra (Wali)',
            phone: '+62 813-2233-4455',
            email: 'suhendra.wali@gmail.com',
            labels: ['Orang Tua'],
          },
        },
      ]),
    });
  });

  // Messages
  await page.route('**/rest/v1/messages*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({
        status: 200,
        headers: {
          'content-range': '0-48/49',
        },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'msg_1',
          conversation_id: 'conv_1',
          organization_id: 'org-wabiz-001',
          sender_type: 'customer',
          body: 'Halo Kak, apakah ada jadwal kunjungan kampus untuk calon santri?',
          created_at: '2026-11-01T03:40:00Z',
        },
        {
          id: 'msg_2',
          conversation_id: 'conv_1',
          organization_id: 'org-wabiz-001',
          sender_type: 'agent',
          body: 'Halo Kak Rizky! Kampus buka setiap hari Sabtu pukul 09.00 - 15.00 WIB untuk open house.',
          created_at: '2026-11-01T03:42:00Z',
        },
      ]),
    });
  });

  // Campaigns
  await page.route('**/rest/v1/campaigns*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'cmp_1',
          organization_id: 'org-wabiz-001',
          name: 'Sosialisasi PSB Gelombang 1',
          message_body: 'Halo Ayah/Bunda! Pendaftaran Santri Baru telah dibuka.',
          status: 'running',
          scheduled_at: '2026-11-05T09:00:00+07:00',
          created_at: '2026-11-01T08:00:00+07:00',
          total_recipients: 150,
          sent_count: 85,
          failed_count: 2,
          target_segment: 'Calon Santri',
        },
        {
          id: 'cmp_2',
          organization_id: 'org-wabiz-001',
          name: 'Pengingat Rapat Wali Santri',
          message_body: 'Undangan resmi rapat evaluasi akhir semester.',
          status: 'scheduled',
          scheduled_at: '2026-11-10T14:00:00+07:00',
          created_at: '2026-11-01T10:00:00+07:00',
          total_recipients: 220,
          sent_count: 0,
          failed_count: 0,
          target_segment: 'Orang Tua',
        },
        {
          id: 'cmp_3',
          organization_id: 'org-wabiz-001',
          name: 'Katalog Program Beasiswa Tahfidz',
          message_body: 'Informasi lengkap beasiswa penuh santri berprestasi.',
          status: 'draft',
          created_at: '2026-11-01T11:00:00+07:00',
          total_recipients: 50,
          sent_count: 0,
          failed_count: 0,
          target_segment: 'all',
        },
      ]),
    });
  });

  // Team Members
  await page.route('**/rest/v1/team_members*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'tm_1',
          organization_id: 'org-wabiz-001',
          full_name: 'Ustadz H. Ahmad Dahlan, S.Pd.I',
          email: 'ahmad.dahlan@pesantrendigital-wabiz.sch.id',
          phone: '081234567890',
          department: 'Supervisor',
          role: 'Supervisor',
          is_active: true,
          created_at: '2026-10-01T00:00:00Z',
        },
        {
          id: 'tm_2',
          organization_id: 'org-wabiz-001',
          full_name: 'Siti Aisyah, S.Kom',
          email: 'aisyah.psb@pesantrendigital-wabiz.sch.id',
          phone: '085641886993',
          department: 'Pendaftaran / PSB',
          role: 'Customer Service',
          is_active: true,
          created_at: '2026-10-05T00:00:00Z',
        },
      ]),
    });
  });

  // WhatsApp Worker Status
  await page.route('**/api/status', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          status: 'connected',
          phoneNumber: '+62 812-9876-5432',
        },
      }),
    });
  });

  await page.route('**/api/health', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, version: '1.0.0' }),
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

test.describe('Visual QA & Screenshot Capture: Enterprise B2B SaaS WABiz', () => {
  test('Capture Desktop Views (1280x800)', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 1280, height: 800 });

    // 1. Auth View - Login
    await page.goto('/');
    await expect(page.getByText('Selamat Datang Kembali')).toBeVisible({ timeout: 25000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_desktop_auth_login.png') });

    // 2. Auth View - Register
    await page.getByRole('tab', { name: 'Daftar Baru' }).click();
    await expect(page.getByText('Buat Akun Workspace Baru')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_desktop_auth_register.png') });

    // Switch back to Login & Authenticate
    await page.getByRole('tab', { name: 'Masuk' }).click();
    await setupMockApi(page);

    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    // 3. Dashboard View
    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });
    await expect(page.getByText('Status WhatsApp Gateway')).toBeVisible();
    await expect(page.getByText('Ringkasan Metrik Bisnis')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_desktop_dashboard.png') });

    // 4. Percakapan View
    await page.getByText('Percakapan', { exact: true }).first().click();
    await expect(page.getByText('Penyimpanan Database Aktif')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_desktop_percakapan.png') });

    // 5. Kontak View
    await page.getByText('Kontak', { exact: true }).first().click();
    await expect(page.getByText('Kontak Terdaftar')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_desktop_kontak.png') });

    // 6. Modal Tambah Kontak
    await page.getByText('+ Tambah Kontak').click();
    await expect(page.getByText('Tambah Kontak Baru')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_desktop_kontak_modal_tambah.png') });
    await page.getByText('Batal').click();

    // 7. Kampanye View
    await page.getByText('Kampanye', { exact: true }).first().click();
    await expect(page.getByText('Kampanye Siaran')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_desktop_kampanye.png') });

    // 8. Chatbot AI View
    await page.getByText('Chatbot AI', { exact: true }).first().click();
    await expect(page.getByText('Chatbot AI & Otomatisasi')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_desktop_chatbot_ai.png') });

    // 9. Tim CS View
    await page.getByText('Tim CS', { exact: true }).first().click();
    await expect(page.getByText('Tim Customer Service').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_desktop_tim_cs.png') });

    // 10. Pengaturan Organisasi View
    await page.getByText('Pengaturan Organisasi', { exact: true }).first().click();
    await expect(page.getByText('Identitas & Profil Resmi Institusi').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_desktop_pengaturan_profil.png') });

    // 11. Pengaturan Gateway Tab
    await page.getByText('5. Gateway WhatsApp API').click();
    await expect(page.getByText('Koneksi WhatsApp Staging (QR Pairing Baileys)')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_desktop_pengaturan_gateway.png') });

    // 12. Modal Notifikasi
    await page.getByLabel(/Notifikasi/).first().click();
    await expect(page.getByText('Aktivitas & pembaruan sistem WABiz')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_desktop_notifications_modal.png') });
    await page.getByLabel('Tutup notifikasi').click();
  });

  test('Capture Mobile Android Views (412x915)', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 412, height: 915 });

    await setupMockApi(page);
    await page.goto('/');
    await expect(page.getByText('Selamat Datang Kembali')).toBeVisible({ timeout: 25000 });

    // Login on Mobile
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    // 13. Mobile Dashboard
    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_mobile_dashboard.png') });

    // 14. Mobile Drawer Slideover
    await page.getByLabel('Buka Menu Navigasi').click();
    await expect(page.getByText('NAVIGASI WORKSPACE')).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_mobile_drawer.png') });

    // 15. Mobile Percakapan (via drawer)
    await page.getByText('Percakapan', { exact: true }).last().click();
    await expect(page.getByText('Penyimpanan Database Aktif')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_mobile_percakapan.png') });

    // 16. Mobile Kontak (via bottom nav)
    await page.getByText('Kontak', { exact: true }).first().click();
    await expect(page.getByText('Kontak Terdaftar')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16_mobile_kontak.png') });

    // 17. Mobile Kampanye (via bottom nav)
    await page.getByText('Kampanye', { exact: true }).first().click();
    await expect(page.getByText('Kampanye Siaran')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '17_mobile_kampanye.png') });

    // 21. Mobile Chatbot AI (via drawer)
    await page.getByLabel('Buka Menu Navigasi').click();
    await page.getByText('Chatbot AI', { exact: true }).last().click();
    await expect(page.getByText('Chatbot AI & Otomatisasi')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '21_mobile_chatbot_ai.png') });

    // 22. Mobile Tim CS (via drawer)
    await page.getByLabel('Buka Menu Navigasi').click();
    await page.getByText('Tim CS', { exact: true }).last().click();
    await expect(page.getByText('Tim Customer Service').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '22_mobile_tim_cs.png') });

    // 23. Mobile Pengaturan (via drawer)
    await page.getByLabel('Buka Menu Navigasi').click();
    await page.getByText('Pengaturan Organisasi', { exact: true }).last().click();
    await expect(page.getByText('Identitas & Profil Resmi Institusi').first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '23_mobile_pengaturan.png') });

    // 18. Mobile Notifications Modal
    await page.getByLabel(/Notifikasi/).first().click();
    await expect(page.getByText('Aktivitas & pembaruan sistem WABiz')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '18_mobile_notifications_modal.png') });
  });

  test('Capture Mobile Android Views (360x800 Compact)', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 360, height: 800 });

    await setupMockApi(page);
    await page.goto('/');
    await expect(page.getByText('Selamat Datang Kembali')).toBeVisible({ timeout: 25000 });

    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '19_mobile_360x800_dashboard.png') });
  });

  test('Capture Mobile Android Views (390x844 Standard)', async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width: 390, height: 844 });

    await setupMockApi(page);
    await page.goto('/');
    await expect(page.getByText('Selamat Datang Kembali')).toBeVisible({ timeout: 25000 });

    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '20_mobile_390x844_dashboard.png') });
  });
});
