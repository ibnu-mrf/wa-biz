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
          id: 'cnt-001',
          organization_id: 'org-wabiz-001',
          name: 'Ibu Rahmawati (Wali Calon Santri)',
          phone: '6281398765432',
          email: 'rahmawati.wali@gmail.com',
          label: 'PSB-2026',
          follow_up_status: 'Menunggu CS',
          created_at: '2026-10-15',
          notes: 'Tertarik program beasiswa tahfidz Quran.',
        },
        {
          id: 'cnt-002',
          organization_id: 'org-wabiz-001',
          name: 'Bapak Hendra Gunawan',
          phone: '6281234567890',
          email: 'hendra.gunawan@perusahaan.co.id',
          label: 'Alumni',
          follow_up_status: 'Selesai',
          created_at: '2026-10-12',
          notes: 'Konfirmasi kehadiran temu akbar.',
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
          name: 'Sosialisasi Gelombang 1 PSB 2026/2027',
          message: 'Assalamu alaikum warahmatullahi wabarakatuh...',
          status: 'draft',
          total_recipients: 150,
          created_at: '2026-10-15',
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
          id: 'cnv-001',
          organization_id: 'org-wabiz-001',
          name: 'Ibu Rahmawati (Wali Calon Santri)',
          phone: '6281398765432',
          lastSnippet: 'Apakah masih ada kuota beasiswa tahfidz untuk gelombang 1?',
          lastTime: '14:32',
          unreadCount: 2,
          status: 'open',
          handoffStatus: 'sent',
          created_at: '2026-10-15',
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
          conversation_id: 'cnv-001',
          text: 'Assalamu alaikum, saya ingin bertanya tentang syarat pendaftaran santri baru.',
          sender: 'customer',
          time: '14:30',
          created_at: '2026-10-15T14:30:00Z',
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
          full_name: 'Ustadz Ahmad Dahlan, S.Pd.I',
          email: 'ahmad.dahlan.owner@pesantren-alhikmah.sch.id',
          phone: '6281234567890',
          role: 'Owner',
          department: 'Pimpinan & Yayasan',
          is_active: true,
          created_at: '2026-10-01',
        },
        {
          id: 'tm-002',
          organization_id: 'org-wabiz-001',
          full_name: 'Siti Aminah, M.Kom',
          email: 'siti.aminah.cs@pesantren-alhikmah.sch.id',
          phone: '6285678901234',
          role: 'CS Support',
          department: 'CS Pendaftaran (PSB)',
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
          title: 'Pendaftar Santri Baru Terdeteksi',
          body: 'Calon santri atas nama Muhammad Farhan telah melengkapi berkas pendaftaran gelombang 1.',
          category: 'system',
          type: 'info',
          is_read: false,
          created_at: '2026-10-17T09:15:00Z',
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

test.describe('WABiz Typography & Layout Comprehensive Audit', () => {
  test('Verify Typography and Layout on Android 360x800 and 390x844', async ({ page }) => {
    test.setTimeout(180000);
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));
    page.on('console', msg => {
      if (msg.type() === 'error') console.log('PAGE CONSOLE ERROR:', msg.text());
    });
    await setupMockApi(page);

    // ==========================================
    // 1. Android 360x800 - DARK MODE
    // ==========================================
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

    // Dashboard 360 Dark
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_dash_360_dark.png') });

    // Open Chatbot AI
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByText('Chatbot AI', { exact: true }).click();
    await page.waitForTimeout(500);

    // Tab 1: Profil
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_chatbot_tab1_360_dark.png') });

    // Tab 2: Aturan
    await page.getByLabel('Tab Aturan Respon & Sambutan').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_chatbot_tab2_360_dark.png') });

    // Tab 3: Deteksi Minat
    await page.getByLabel('Tab Deteksi Minat Pendaftaran').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_chatbot_tab3_360_dark.png') });

    // Tab 4: Penerusan CS
    await page.getByLabel('Tab Penerusan CS & Alur').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_chatbot_tab4_360_dark.png') });

    // Tab 5: Simulator Chat
    await page.getByLabel('Tab Simulator Chat').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_chatbot_tab5_360_dark.png') });

    // Open Tim CS
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Tim CS').click();
    await page.waitForTimeout(500);

    // Check Header and Role Badge
    await expect(page.getByText('Tim Customer Service').first()).toBeVisible();
    await expect(page.getByText('OWNER').first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_team_360_dark.png') });

    // Scroll to team member cards
    await page.mouse.move(180, 400);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_team_cards_360_dark.png') });
    await page.mouse.wheel(0, -1400);
    await page.waitForTimeout(400);

    // Open Tim CS Form Modal
    const addTeamBtn = page.getByText('Tambah Anggota', { exact: true }).first();
    if (await addTeamBtn.isVisible()) {
      await addTeamBtn.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_team_modal_360_dark.png') });
      const closeTeamModal = page.getByLabel('Tutup Modal Tambah/Edit Anggota').first();
      if (await closeTeamModal.isVisible()) {
        await closeTeamModal.click();
      } else {
        await page.getByText('Batal', { exact: true }).first().click();
      }
      await page.waitForTimeout(300);
    }

    // Open Kampanye
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Kampanye').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_campaign_list_360_dark.png') });

    // Open Form Tambah Kampanye Modal
    const createCampaignBtn = page.getByText('Buat Kampanye', { exact: false }).first();
    if (await createCampaignBtn.isVisible()) {
      await createCampaignBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_campaign_form_360_dark.png') });
      const closeCampaignModal = page.getByLabel('Tutup Modal').first();
      if (await closeCampaignModal.isVisible()) {
        await closeCampaignModal.click();
      } else {
        await page.getByText('Batal', { exact: true }).first().click();
      }
      await page.waitForTimeout(300);
    }

    // Open Percakapan
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Percakapan').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_conversations_list_360_dark.png') });

    // Open Conversation Detail
    const convItem = page.getByText('Ibu Rahmawati').first();
    if (await convItem.isVisible()) {
      await convItem.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_conversations_detail_360_dark.png') });
    }

    // Open Kontak
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Kontak').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_contacts_360_dark.png') });

    // ==========================================
    // 2. Android 390x844 - LIGHT MODE
    // ==========================================
    await page.setViewportSize({ width: 390, height: 844 });
    const toggleToLight = page.getByLabel('Beralih ke Mode Terang');
    if (await toggleToLight.isVisible()) {
      await toggleToLight.click();
      await page.waitForTimeout(300);
    }

    // Kontak 390 Light
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_contacts_390_light.png') });

    // Tim CS 390 Light
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Tim CS').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_team_390_light.png') });

    // Scroll to team member cards
    await page.mouse.move(195, 400);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_team_cards_390_light.png') });
    await page.mouse.wheel(0, -1400);
    await page.waitForTimeout(400);

    // Chatbot AI 390 Light
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Chatbot AI').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_chatbot_390_light.png') });

    // Kampanye 390 Light
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Kampanye').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_campaign_390_light.png') });

    // Percakapan 390 Light
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Percakapan').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_conversations_390_light.png') });

    // Notifications Modal
    const notifBtn = page.getByLabel(/Notifikasi/i).first();
    if (await notifBtn.isVisible()) {
      await notifBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_notif_390_light.png') });
      const closeNotif = page.getByLabel(/tutup notifikasi/i).first();
      if (await closeNotif.isVisible()) {
        await closeNotif.click();
      } else {
        await page.mouse.click(10, 10);
      }
      await page.waitForTimeout(400);
    }

    // ==========================================
    // 3. Android 412x915 - Verification
    // ==========================================
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(400);

    // Chatbot AI 412 Light
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Chatbot AI').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_chatbot_412_light.png') });

    // Tim CS 412 Light
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Tim CS').click();
    await page.waitForTimeout(500);
    await page.mouse.move(206, 400);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_team_cards_412_light.png') });
    await page.mouse.wheel(0, -1400);
    await page.waitForTimeout(300);

    // ==========================================
    // 4. Desktop 1280x720 - DESKTOP LAYOUT
    // ==========================================
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(600);
    const dashMenuItem = page.getByText('Dashboard', { exact: true }).first();
    if (await dashMenuItem.isVisible()) {
      await dashMenuItem.click();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_desktop_1280_light.png') });

    // Desktop Dark Mode
    const toggleBackToDark = page.getByLabel('Beralih ke Mode Gelap');
    if (await toggleBackToDark.isVisible()) {
      await toggleBackToDark.click();
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'typo_desktop_1280_dark.png') });
  });
});

