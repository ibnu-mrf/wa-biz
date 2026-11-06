import { test, expect } from '@playwright/test';

declare const require: any;
const path = require('path');

const SCREENSHOTS_DIR = 'C:/Users/p/.gemini/antigravity/brain/fb6500eb-98bd-4ed5-aa82-83bfc9ebbc6e/screenshots';

// Mock Admin User
const MOCK_ADMIN_USER = {
  id: 'usr-wabiz-admin-002',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@wabiz.b2b',
  email_confirmed_at: '2026-10-01T00:00:00Z',
  phone: '',
  user_metadata: {
    full_name: 'Ustadz Admin WABiz',
  },
  app_metadata: {
    provider: 'email',
  },
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

const MOCK_ADMIN_SESSION = {
  access_token: 'mock-admin-token-xyz-1234567890',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'mock-admin-refresh-xyz-1234567890',
  user: MOCK_ADMIN_USER,
};

const MOCK_ORGANIZATIONS = [
  {
    id: 'org-wabiz-001',
    name: 'Pesantren Teknologi Al-Hikmah',
    slug: 'al-hikmah',
    created_at: '2026-10-01T00:00:00Z',
  },
];

const MOCK_ADMIN_MEMBERS = [
  {
    id: 'mem-admin-002',
    organization_id: 'org-wabiz-001',
    user_id: 'usr-wabiz-admin-002',
    role: 'admin',
    created_at: '2026-10-01T00:00:00Z',
  },
];

const MOCK_CONTACTS = [
  {
    id: 'ct-001',
    organization_id: 'org-wabiz-001',
    name: 'Ustadz Ahmad Fauzi',
    phone: '6281234567890',
    email: 'ahmad.fauzi@alhikmah.sch.id',
    labels: ['Wali Santri'],
    opt_out: false,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'ct-002',
    organization_id: 'org-wabiz-001',
    name: 'Ibu Siti Rahmawati',
    phone: '6281398765432',
    email: 'rahmawati@gmail.com',
    labels: ['Calon Santri'],
    opt_out: false,
    created_at: '2026-10-01T00:00:00Z',
  },
];

const MOCK_CAMPAIGNS = [
  {
    id: 'camp-001',
    organization_id: 'org-wabiz-001',
    name: 'Pengumuman PSB Gelombang 1',
    message_body: "Assalamu'alaikum {{nama}}, pendaftaran santri baru di {{organisasi}} telah dibuka.",
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
    message_body: 'Yth. {{nama}}, mari hadiri Kajian Akbar hari Ahad di Masjid Utama {{organisasi}}.',
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
];

const MOCK_TEAM_MEMBERS = [
  {
    id: 'tm-001',
    organization_id: 'org-wabiz-001',
    full_name: 'Ustadz Admin WABiz',
    email: 'admin@wabiz.b2b',
    phone: '6281234567890',
    role: 'Admin',
    department: 'Administrasi',
    is_active: true,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'tm-002',
    organization_id: 'org-wabiz-001',
    full_name: 'Siti Nurhaliza',
    email: 'siti.cs@wabiz.b2b',
    phone: '6285678901234',
    role: 'Customer Service',
    department: 'Pendaftaran (PSB)',
    is_active: true,
    created_at: '2026-10-05T00:00:00Z',
  },
  {
    id: 'tm-003',
    organization_id: 'org-wabiz-001',
    full_name: 'Budi Santoso',
    email: 'budi.spv@wabiz.b2b',
    phone: '6287890123456',
    role: 'Supervisor',
    department: 'Layanan Umum',
    is_active: true,
    created_at: '2026-10-10T00:00:00Z',
  },
];

const MOCK_CONVERSATIONS = [
  {
    id: 'conv-001',
    organization_id: 'org-wabiz-001',
    contact_id: 'ct-002',
    assigned_to: null,
    status: 'open',
    handoff_status: 'sent',
    handoff_department: 'Pendaftaran',
    handoff_notified_at: null,
    handoff_summary: null,
    handoff_error: null,
    handoff_cs_phone: null,
    last_message_at: '2026-11-06T10:00:00Z',
    created_at: '2026-10-15T00:00:00Z',
    updated_at: '2026-11-06T10:00:00Z',
    contacts: {
      id: 'ct-002',
      name: 'Ibu Siti Rahmawati',
      phone: '6281398765432',
      email: 'rahmawati@gmail.com',
      labels: ['Calon Santri'],
    },
    team_members: null,
  },
];

const MOCK_MESSAGES = [
  {
    id: 'msg-001',
    conversation_id: 'conv-001',
    organization_id: 'org-wabiz-001',
    body: 'Apakah masih ada kuota beasiswa tahfidz untuk gelombang 1?',
    direction: 'inbound',
    sender_type: 'customer',
    status: 'received',
    created_at: '2026-11-06T10:00:00Z',
  },
];

const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-001',
    organization_id: 'org-wabiz-001',
    title: 'Pendaftaran Santri Baru',
    body: 'Ibu Siti Rahmawati mengajukan pertanyaan seputar beasiswa.',
    type: 'registration_lead',
    read: false,
    created_at: '2026-11-06T10:00:00Z',
  },
  {
    id: 'notif-002',
    organization_id: 'org-wabiz-001',
    title: 'Status Gateway WhatsApp',
    body: 'Gateway Baileys terhubung stabil.',
    type: 'whatsapp_gateway',
    read: true,
    created_at: '2026-11-06T09:00:00Z',
  },
];

const MOCK_PROFILE = {
  id: 'prof-001',
  organization_id: 'org-wabiz-001',
  org_name: 'Pesantren Teknologi Al-Hikmah',
  short_name: 'Al-Hikmah Tech',
  institution_type: 'Pesantren / Islamic Boarding School',
  official_description: 'Lembaga pendidikan Islam modern berbasis teknologi informasi terakreditasi A.',
  student_count: '450',
  staff_count: '38',
  official_email: 'sekretariat@alhikmah.sch.id',
  escalation_phone: '6281234567890',
  admission_schedule: 'Gelombang 1: 1 Nov - 31 Des 2026. Ujian masuk: 5 Jan 2027.',
  tuition_info: 'Uang pangkal: Rp 8.500.000. SPP bulanan: Rp 850.000.',
  cs_hours: '08:00 - 16:00 WIB',
  operational_days: 'Senin - Sabtu',
};

async function setupMocks(page: any) {
  await page.route('**/auth/v1/token*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ADMIN_SESSION),
    });
  });

  await page.route('**/auth/v1/user*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ADMIN_USER),
    });
  });

  await page.route('**/rest/v1/organization_members*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ADMIN_MEMBERS),
    });
  });

  await page.route('**/rest/v1/organizations*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_ORGANIZATIONS),
    });
  });

  await page.route('**/rest/v1/organization_profiles*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([MOCK_PROFILE]),
    });
  });

  await page.route('**/rest/v1/contacts*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CONTACTS),
    });
  });

  await page.route('**/rest/v1/campaigns*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CAMPAIGNS),
    });
  });

  await page.route('**/rest/v1/team_members*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_TEAM_MEMBERS),
    });
  });

  await page.route('**/rest/v1/conversations*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CONVERSATIONS),
    });
  });

  await page.route('**/rest/v1/messages*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_MESSAGES),
    });
  });

  await page.route('**/rest/v1/notifications*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_NOTIFICATIONS),
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

  await page.route('**/api/campaigns/gateway-status*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          isReady: true,
          code: 'ready',
          label: 'Gateway Siap',
          message: 'Worker Baileys WhatsApp aktif dan siap mengirim siaran.',
          provider: 'baileys',
          providerDisplayName: 'WhatsApp Baileys Worker',
          phone: '6285641886993',
        },
      }),
    });
  });
}

test.describe('WABiz Final Pre-Build Audit (Admin Account)', () => {
  const viewports = [
    { name: '360x800', width: 360, height: 800 },
    { name: '390x844', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    for (const mode of ['light', 'dark'] as const) {
      test(`Full Android Audit on ${vp.name} (${mode}) with Admin Account`, async ({ page }) => {
        test.setTimeout(120000);
        const errors: string[] = [];
        page.on('pageerror', (err) => errors.push(err.message));

        await setupMocks(page);
        await page.setViewportSize({ width: vp.width, height: vp.height });

        await page.goto('/');

        // 1. LOGIN ADMIN
        await page.getByPlaceholder('nama@organisasi.sch.id').fill('admin@wabiz.b2b');
        await page.getByPlaceholder('Minimal 6 karakter').fill('adminpassword123');
        await page.getByRole('button', { name: 'Masuk' }).click();

        await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 20000 });

        // Set Dark Mode if needed
        if (mode === 'dark') {
          const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
          if (await toggleToDark.isVisible()) {
            await toggleToDark.click();
            await page.waitForTimeout(300);
          }
        }

        // Verifikasi Tombol Avatar Akun di Header Mobile
        await expect(page.getByRole('button', { name: /Profil Ustadz Admin/i }).first()).toBeVisible();

        // Capture 1: Dashboard
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_01_dashboard_${mode}.png`),
          fullPage: false,
        });

        // 2. SIDEBAR NAVIGATION DRAWER (HOLOGRAPHIC LOGO + NAVY GRADIENT + ADMIN BADGE)
        const btnMenu = page.getByLabel('Buka Menu Navigasi').first();
        await btnMenu.click();
        await page.waitForTimeout(400);

        // Verifikasi Drawer Elements
        await expect(page.getByText('WABiz').first()).toBeVisible();
        await expect(page.getByText('B2B SAAS').first()).toBeVisible();
        await expect(page.getByText('Pesantren Teknologi Al-Hikmah').first()).toBeVisible();
        await expect(page.getByText('ADMIN').first()).toBeVisible();

        // Capture 2: Sidebar Drawer
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_02_sidebar_drawer_${mode}.png`),
          fullPage: false,
        });

        // 3. MENU CHATBOT AI & SIMULATOR
        await page.getByLabel('Menu Navigasi Chatbot AI').first().click();
        await page.waitForTimeout(500);

        await expect(page.getByText('Chatbot AI & Otomatisasi').first()).toBeVisible();
        // Verifikasi Tombol Simpan Pengaturan
        const btnSave = page.getByText('Simpan Pengaturan').first();
        await expect(btnSave).toBeVisible();

        // Buka Tab Simulator Chat
        await page.getByText('5. Simulator Chat').first().click();
        await page.waitForTimeout(400);

        // Verifikasi Live Simulator
        await expect(page.getByText('Uji Skenario Interaktif').first()).toBeVisible();

        // Capture 3: Chatbot AI Simulator
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_03_chatbot_simulator_${mode}.png`),
          fullPage: false,
        });

        // Uji Interaktif Simulator Chat
        const quickChip = page.locator('text=Berapa biaya pendaftaran?').first();
        if (await quickChip.isVisible()) {
          await quickChip.click();
          await page.waitForTimeout(800);
        }

        // 4. MENU TIM CS (FILTER DEPARTEMEN & PERAN TERMASUK CUSTOMER SERVICE)
        await page.getByLabel('Buka Menu Navigasi').first().click();
        await page.waitForTimeout(300);
        await page.getByLabel('Menu Navigasi Tim CS').first().click();
        await page.waitForTimeout(500);

        await expect(page.getByText('Tim Customer Service').first()).toBeVisible();
        // Verifikasi Chip Customer Service
        await expect(page.getByText('Customer Service').first()).toBeVisible();
        await expect(page.getByText('Siti Nurhaliza').first()).toBeVisible();

        // Capture 4: Tim CS
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_04_team_cs_${mode}.png`),
          fullPage: false,
        });

        // 5. MENU KAMPANYE (STAT GRIDS & DAFTAR KAMPANYE)
        await page.getByLabel('Buka Menu Navigasi').first().click();
        await page.waitForTimeout(300);
        await page.getByLabel('Menu Navigasi Kampanye').first().click();
        await page.waitForTimeout(500);

        await expect(page.getByText('Kampanye Siaran').first()).toBeVisible();
        await expect(page.getByText('Total Kampanye').first()).toBeVisible();
        await expect(page.getByText('Terjadwal & Berjalan').first()).toBeVisible();

        // Capture 5: Kampanye List
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_05_campaigns_list_${mode}.png`),
          fullPage: false,
        });

        // Buka Modal Buat Kampanye (Create)
        await page.getByText('Buat Kampanye').first().click();
        await page.waitForTimeout(400);

        await expect(page.getByText('Buat Kampanye Siaran Baru').first()).toBeVisible();
        await expect(page.getByText('Pratinjau Pesan WhatsApp:').first()).toBeVisible();

        // Capture 6: Kampanye Create Modal & WhatsApp Live Preview
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_06_campaigns_create_form_${mode}.png`),
          fullPage: false,
        });

        await page.getByText('Batal', { exact: true }).first().click({ force: true });
        await page.waitForTimeout(300);

        // Buka Modal Detail Kampanye (Read Detail)
        await page.getByText('Detail').first().click();
        await page.waitForTimeout(400);

        await expect(page.getByText('Detail data kampanye resmi').first()).toBeVisible();
        // Capture 7: Kampanye Detail Modal
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_07_campaigns_detail_${mode}.png`),
          fullPage: false,
        });

        await page.getByText('Tutup', { exact: true }).first().click({ force: true });
        await page.waitForTimeout(300);

        // 6. MENU KONTAK
        await page.getByLabel('Buka Menu Navigasi').first().click();
        await page.waitForTimeout(300);
        await page.getByLabel('Menu Navigasi Kontak').first().click();
        await page.waitForTimeout(500);

        await expect(page.getByText('Kontak').first()).toBeVisible();
        await expect(page.getByText('Ustadz Ahmad Fauzi').first()).toBeVisible();

        // Capture 8: Kontak List
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_08_contacts_${mode}.png`),
          fullPage: false,
        });

        // 7. MENU PERCAKAPAN
        await page.getByLabel('Buka Menu Navigasi').first().click();
        await page.waitForTimeout(300);
        await page.getByLabel('Menu Navigasi Percakapan').first().click();
        await page.waitForTimeout(500);

        await expect(page.getByText('Pusat Percakapan').first()).toBeVisible();
        await expect(page.getByText('Ibu Siti Rahmawati').first()).toBeVisible();

        // Capture 9: Percakapan
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_09_conversations_${mode}.png`),
          fullPage: false,
        });

        // 8. PUSAT NOTIFIKASI
        const notifBell = page.getByLabel(/Pusat Notifikasi|Notifikasi/i).first();
        if (await notifBell.isVisible()) {
          await notifBell.click();
          await page.waitForTimeout(400);

          // Capture 10: Notifikasi Modal
          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_10_notifications_${mode}.png`),
            fullPage: false,
          });

          // Close notifications modal using explicit label or Escape key
          const closeBtn = page.getByLabel('Tutup notifikasi').first();
          if (await closeBtn.isVisible()) {
            await closeBtn.click({ force: true });
          } else {
            await page.keyboard.press('Escape');
          }
          await page.waitForTimeout(300);
        }

        // 9. MENU PENGATURAN ORGANISASI
        await page.getByLabel('Buka Menu Navigasi').first().click();
        await page.waitForTimeout(300);
        await page.getByLabel('Menu Navigasi Pengaturan Organisasi').first().click();
        await page.waitForTimeout(500);

        await expect(page.getByText('Pengaturan Organisasi').first()).toBeVisible();
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `audit_${vp.name}_11_settings_${mode}.png`),
          fullPage: false,
        });

        // Pastikan tidak ada unhandled error runtime
        expect(errors).toHaveLength(0);
      });
    }
  }
});
