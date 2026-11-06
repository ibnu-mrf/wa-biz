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

  await page.route('**/rest/v1/contacts*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-4/5' } });
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
      ]),
    });
  });

  await page.route('**/rest/v1/conversations*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-2/3' } });
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
      ]),
    });
  });

  await page.route('**/rest/v1/messages*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-48/49' } });
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
          sender_name: 'Muhammad Rizky Pratama',
          sender_phone: '+62 812-8899-7711',
          message_text: 'Assalamu alaikum, pendaftaran santri baru masih buka?',
          status: 'delivered',
          created_at: '2026-11-01T03:30:00Z',
        },
        {
          id: 'msg_2',
          conversation_id: 'conv_1',
          organization_id: 'org-wabiz-001',
          sender_type: 'agent',
          sender_name: 'Ustadz Ahmad Dahlan (CS)',
          message_text: 'Waalaikumussalam. Masih dibuka sampai akhir November 2026.',
          status: 'read',
          created_at: '2026-11-01T03:32:00Z',
        },
      ]),
    });
  });

  await page.route('**/rest/v1/campaigns*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-2/3' } });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'camp_1',
          organization_id: 'org-wabiz-001',
          name: 'Pengumuman Ujian Semester Santri',
          target_audience: 'Semua Santri & Wali',
          status: 'completed',
          total_recipients: 150,
          delivered_count: 148,
          created_at: '2026-10-28T08:00:00Z',
        },
      ]),
    });
  });

  await page.route('**/rest/v1/team_members*', async (route: any) => {
    if (route.request().method() === 'HEAD') {
      await route.fulfill({ status: 200, headers: { 'content-range': '0-1/2' } });
      return;
    }
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

  await page.route('**/api/whatsapp/status*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'connected',
        phone: '+62 812-3456-7890',
        pushname: 'Pesantren Digital WABiz Official',
        battery: 92,
        plugged: true,
      }),
    });
  });

  await page.route('**/rest/v1/notifications*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

test.describe('WABiz Theme & Dark Mode System Suite', () => {

  test('1. Login Screen: Terang dan Gelap', async ({ page }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupMockApi(page);

    await page.goto('/');
    await expect(page.getByText('Selamat Datang Kembali')).toBeVisible({ timeout: 25000 });

    // Mode Terang (Default)
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_01_login_light.png') });

    // Beralih ke Mode Gelap pada tombol di header login
    const themeBtn = page.getByLabel('Ganti Mode Tema');
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_01_login_dark.png') });
      // Kembalikan ke mode terang untuk login
      await themeBtn.click();
      await page.waitForTimeout(200);
    }
  });

  test('2. Dashboard, Header Sun/Moon Toggle, dan Seluruh Halaman: Mode Terang & Mode Gelap', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupMockApi(page);

    await page.goto('/');
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // --- DASHBOARD TERANG ---
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_02_dashboard_light.png') });

    // --- DASHBOARD GELAP (Klik Moon Button) ---
    const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
    await expect(toggleToDark).toBeVisible();
    await toggleToDark.click();
    await page.waitForTimeout(400);

    // Verifikasi ikon berubah menjadi Sun
    const toggleToLight = page.getByLabel('Beralih ke Mode Terang');
    await expect(toggleToLight).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_02_dashboard_dark.png') });

    // --- PERCAKAPAN GELAP ---
    await page.getByText('Percakapan', { exact: true }).first().click();
    await expect(page.getByText('Penyimpanan Database Aktif')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_03_percakapan_dark.png') });

    // Switch ke Percakapan Terang
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_03_percakapan_light.png') });
    // Kembalikan ke gelap
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(200);

    // --- KONTAK GELAP ---
    await page.getByText('Kontak', { exact: true }).first().click();
    await expect(page.getByText('Kontak Terdaftar')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_04_kontak_dark.png') });

    // Switch ke Kontak Terang
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_04_kontak_light.png') });
    // Kembalikan ke gelap
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(200);

    // --- KAMPANYE GELAP ---
    await page.getByText('Kampanye', { exact: true }).first().click();
    await expect(page.getByText('Kampanye Siaran')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_05_kampanye_dark.png') });

    // Switch ke Kampanye Terang
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_05_kampanye_light.png') });
    // Kembalikan ke gelap
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(200);

    // --- CHATBOT AI GELAP ---
    await page.getByText('Chatbot AI', { exact: true }).first().click();
    await expect(page.getByText('Chatbot AI & Otomatisasi')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_06_chatbot_dark.png') });

    // Switch ke Chatbot Terang
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_06_chatbot_light.png') });
    // Kembalikan ke gelap
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(200);

    // --- TIM CS GELAP ---
    await page.getByText('Tim CS', { exact: true }).first().click();
    await expect(page.getByText('Tim Customer Service').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_07_tim_cs_dark.png') });

    // Switch ke Tim CS Terang
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_07_tim_cs_light.png') });
    // Kembalikan ke gelap
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(200);

    // --- PENGATURAN ORGANISASI GELAP ---
    await page.getByText('Pengaturan Organisasi', { exact: true }).first().click();
    await expect(page.getByText('Identitas Institusi').first()).toBeVisible({ timeout: 15000 });
    // Verifikasi Bagian Tema & Tampilan Aplikasi sudah benar-benar dihapus dari Pengaturan Organisasi
    await expect(page.getByText('Tema & Tampilan Aplikasi')).toBeHidden();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_08_pengaturan_dark.png') });

    // Beralih ke Mode Terang melalui tombol Header Sun/Moon
    await page.getByLabel('Beralih ke Mode Terang').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_08_pengaturan_light.png') });

    // Kembalikan ke Mode Gelap melalui tombol Header Sun/Moon
    await page.getByLabel('Beralih ke Mode Gelap').click();
    await page.waitForTimeout(300);

    // Uji persistensi: Refresh browser dan verifikasi tema gelap tetap tersimpan
    await page.reload();
    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });
    await expect(page.getByLabel('Beralih ke Mode Terang')).toBeVisible();
  });

  test('3. Mobile Android (412x915, 390x844, 360x800): Responsive Viewports & Dark Mode', async ({ page }) => {
    test.setTimeout(90000);
    await setupMockApi(page);

    // --- 3A. ANDROID 412x915 (Google Pixel / Samsung Galaxy S Series) ---
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto('/');
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // Mode Terang Mobile 412x915
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_09_mobile_dashboard_light.png') });

    // Toggle ke Dark Mode pada Mobile Header
    const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
    if (await toggleToDark.isVisible()) {
      await toggleToDark.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_09_mobile_dashboard_dark.png') });

    // Buka Drawer pada Mode Gelap
    await page.getByLabel('Buka Menu Navigasi').click();
    await expect(page.getByText('NAVIGASI WORKSPACE')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_10_mobile_drawer_dark.png') });

    // Tutup Drawer
    await page.getByLabel('Tutup Menu Navigasi').click();
    await page.waitForTimeout(300);

    // --- 3B. ANDROID 390x844 (Modern Standard Mobile Viewport) ---
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_11_mobile_390x844_dark.png') });

    // Switch ke Terang pada 390x844
    const toggleToLight390 = page.getByLabel('Beralih ke Mode Terang');
    if (await toggleToLight390.isVisible()) {
      await toggleToLight390.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_11_mobile_390x844_light.png') });
    }

    // --- 3C. ANDROID 360x800 (Compact Android Mobile Viewport) ---
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_12_mobile_360x800_light.png') });

    const toggleToDark360 = page.getByLabel('Beralih ke Mode Gelap');
    if (await toggleToDark360.isVisible()) {
      await toggleToDark360.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_12_mobile_360x800_dark.png') });
    }
  });

  test('4. Mobile Android: Seluruh Halaman (Percakapan, Kontak, Kampanye, Chatbot, Tim CS, Pengaturan, Notifikasi)', async ({ page }) => {
    test.setTimeout(120000);
    await setupMockApi(page);
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto('/');
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // --- NOTIFIKASI MODAL MOBILE TERANG ---
    const bellBtn = page.getByRole('button', { name: /Notifikasi/ });
    if (await bellBtn.isVisible()) {
      await bellBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_13_mobile_notifikasi_light.png') });
      // Tutup modal
      await page.getByLabel('Tutup notifikasi').click();
      await page.waitForTimeout(300);

      // Switch ke dark di header
      const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
      if (await toggleToDark.isVisible()) {
        await toggleToDark.click();
        await page.waitForTimeout(300);

        // Buka kembali notifikasi pada Dark Mode
        await page.getByRole('button', { name: /Notifikasi/ }).click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_13_mobile_notifikasi_dark.png') });

        // Tutup modal
        await page.getByLabel('Tutup notifikasi').click();
        await page.waitForTimeout(300);
      }
    }

    // --- PERCAKAPAN MOBILE (GELAP & TERANG) ---
    await page.getByLabel('Buka Menu Navigasi').click();
    await page.waitForTimeout(300);
    await page.getByText('Percakapan', { exact: true }).last().click();
    await expect(page.getByText('Pusat Percakapan').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_14_mobile_percakapan_dark.png') });

    const toggleLight1 = page.getByLabel('Beralih ke Mode Terang');
    if (await toggleLight1.isVisible()) {
      await toggleLight1.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_14_mobile_percakapan_light.png') });
      await page.getByLabel('Beralih ke Mode Gelap').click();
      await page.waitForTimeout(200);
    }

    // --- KONTAK MOBILE (GELAP & TERANG) ---
    await page.getByLabel('Buka Menu Navigasi').click();
    await page.waitForTimeout(300);
    await page.getByText('Kontak', { exact: true }).last().click();
    await expect(page.getByText('Kontak Terdaftar').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_15_mobile_kontak_dark.png') });

    const toggleLight2 = page.getByLabel('Beralih ke Mode Terang');
    if (await toggleLight2.isVisible()) {
      await toggleLight2.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_15_mobile_kontak_light.png') });
      await page.getByLabel('Beralih ke Mode Gelap').click();
      await page.waitForTimeout(200);
    }

    // --- KAMPANYE MOBILE (GELAP & TERANG) ---
    await page.getByLabel('Buka Menu Navigasi').click();
    await page.waitForTimeout(300);
    await page.getByText('Kampanye', { exact: true }).last().click();
    await expect(page.getByText('Kampanye Siaran').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_16_mobile_kampanye_dark.png') });

    const toggleLight3 = page.getByLabel('Beralih ke Mode Terang');
    if (await toggleLight3.isVisible()) {
      await toggleLight3.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_16_mobile_kampanye_light.png') });
      await page.getByLabel('Beralih ke Mode Gelap').click();
      await page.waitForTimeout(200);
    }

    // --- CHATBOT AI MOBILE (GELAP & TERANG) ---
    await page.getByLabel('Buka Menu Navigasi').click();
    await page.waitForTimeout(300);
    await page.getByText('Chatbot AI', { exact: true }).last().click();
    await expect(page.getByText('Chatbot AI & Otomatisasi').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_17_mobile_chatbot_dark.png') });

    const toggleLight4 = page.getByLabel('Beralih ke Mode Terang');
    if (await toggleLight4.isVisible()) {
      await toggleLight4.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_17_mobile_chatbot_light.png') });
      await page.getByLabel('Beralih ke Mode Gelap').click();
      await page.waitForTimeout(200);
    }

    // --- TIM CS MOBILE (GELAP & TERANG) ---
    await page.getByLabel('Buka Menu Navigasi').click();
    await page.waitForTimeout(300);
    await page.getByText('Tim CS', { exact: true }).last().click();
    await expect(page.getByText('Tim Customer Service').first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_18_mobile_tim_cs_dark.png') });

    const toggleLight5 = page.getByLabel('Beralih ke Mode Terang');
    if (await toggleLight5.isVisible()) {
      await toggleLight5.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_18_mobile_tim_cs_light.png') });
      await page.getByLabel('Beralih ke Mode Gelap').click();
      await page.waitForTimeout(200);
    }

    // --- PENGATURAN ORGANISASI MOBILE (GELAP & TERANG) ---
    await page.getByLabel('Buka Menu Navigasi').click();
    await page.waitForTimeout(300);
    await page.getByText('Pengaturan Organisasi', { exact: true }).last().click();
    await expect(page.getByText('Identitas Institusi').first()).toBeVisible({ timeout: 15000 });
    // Verifikasi Bagian Tema & Tampilan Aplikasi sudah tidak ada di Mobile
    await expect(page.getByText('Tema & Tampilan Aplikasi')).toBeHidden();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_19_mobile_pengaturan_dark.png') });

    const toggleLight6 = page.getByLabel('Beralih ke Mode Terang');
    if (await toggleLight6.isVisible()) {
      await toggleLight6.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'theme_19_mobile_pengaturan_light.png') });
    }
  });
});
