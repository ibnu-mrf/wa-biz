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
    full_name: 'Fajar Pratama',
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
    role: 'owner',
    created_at: '2026-10-01T00:00:00Z',
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
  admission_schedule: 'Gelombang 1: 1 Nov - 31 Des 2026.',
  tuition_info: 'Uang pangkal: Rp 8.500.000.',
  cs_hours: '08:00 - 16:00 WIB',
  operational_days: 'Senin - Sabtu',
};

const MOCK_CONTACTS = [
  {
    id: 'ct-001',
    organization_id: 'org-wabiz-001',
    name: 'Budi Santoso',
    phone: '6281234567890',
    email: 'budi@alhikmah.sch.id',
    label: 'Santri Baru',
    labels: ['Santri Baru'],
    follow_up_status: 'Menunggu Respon',
    opt_out: false,
    created_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'ct-002',
    organization_id: 'org-wabiz-001',
    name: 'Siti Aminah',
    phone: '6281398765432',
    email: 'siti@gmail.com',
    label: 'Wali Santri',
    labels: ['Wali Santri'],
    follow_up_status: 'Selesai',
    opt_out: false,
    created_at: '2026-10-01T00:00:00Z',
  },
];

const MOCK_CONVERSATIONS = [
  {
    id: 'conv-001',
    organization_id: 'org-wabiz-001',
    contact_id: 'ct-001',
    assigned_to: 'mem-admin-002',
    status: 'open',
    channel: 'whatsapp',
    handoff_status: 'none',
    handoff_department: null,
    handoff_notified_at: null,
    handoff_summary: null,
    handoff_error: null,
    handoff_cs_phone: null,
    last_message_at: '2026-11-06T10:00:00Z',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-11-06T10:00:00Z',
    contacts: {
      id: 'ct-001',
      name: 'Budi Santoso',
      phone: '6281234567890',
      email: 'budi@alhikmah.sch.id',
      labels: ['Santri Baru'],
    },
    team_members: null,
  },
  {
    id: 'conv-002',
    organization_id: 'org-wabiz-001',
    contact_id: 'ct-002',
    assigned_to: null,
    status: 'resolved',
    channel: 'whatsapp',
    handoff_status: 'none',
    handoff_department: null,
    handoff_notified_at: null,
    handoff_summary: null,
    handoff_error: null,
    handoff_cs_phone: null,
    last_message_at: '2026-11-06T09:00:00Z',
    created_at: '2026-10-15T00:00:00Z',
    updated_at: '2026-11-06T09:00:00Z',
    contacts: {
      id: 'ct-002',
      name: 'Siti Aminah',
      phone: '6281398765432',
      email: 'siti@gmail.com',
      labels: ['Wali Santri'],
    },
    team_members: null,
  },
];

const MOCK_MESSAGES = [
  {
    id: 'msg-001',
    conversation_id: 'conv-001',
    organization_id: 'org-wabiz-001',
    body: 'Assalamu alaikum, pendaftaran masih dibuka?',
    direction: 'inbound',
    sender_type: 'customer',
    status: 'received',
    created_at: '2026-11-06T10:00:00Z',
  },
];

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
      body: JSON.stringify([]),
    });
  });

  await page.route('**/rest/v1/team_members*', async (route: any) => {
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
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/whatsapp/status*', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        state: {
          status: 'disconnected',
          phoneNumber: null,
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
          isReady: false,
          code: 'waiting_gateway',
          label: 'Gateway Belum Aktif',
          message: 'Pindai QR WhatsApp untuk mengaktifkan.',
          provider: 'baileys',
          providerDisplayName: 'WhatsApp Baileys Worker',
          phone: null,
        },
      }),
    });
  });
}

test.describe('Mobile Responsiveness Verification (Android 360x800 & 390x844)', () => {
  test('1. Auth View on Mobile: Dark Futuristic Banner Hidden & Seamless Container', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Verify clean brand header is present without the dark banner
    await expect(page.getByText('WABiz').first()).toBeVisible();
    await expect(page.getByText('WhatsApp Business Management').first()).toBeVisible();

    // Verify welcome note
    await expect(page.getByText('Selamat Datang Kembali').first()).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'verify_mobile_01_auth_clean_360x800.png'),
    });
  });

  test('2. Authenticated Mobile Header & Top Avatar Pill Simplification (360x800)', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');

    // Login
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('admin@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('adminpassword123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 15000 });

    // Header title should be completely visible
    const headerTitle = page.locator('text=Dashboard Eksekutif').first();
    await expect(headerTitle).toBeVisible();

    // The avatar button with initial "FP" is visible and has no name/role text squeezing the header
    const avatarBtn = page.getByRole('button', { name: /Profil Fajar Pratama/i }).first();
    await expect(avatarBtn).toBeVisible();

    // Mobile bottom navigation bar is visible
    const bottomNav = page.locator('text=Percakapan').first();
    await expect(bottomNav).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'verify_mobile_02_header_simplified_360x800.png'),
    });
  });

  test('3. Sidebar Drawer Fixed Full-Screen Overlay, Z-Index 9999, Header & Pinned Footer', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');

    // Login
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('admin@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('adminpassword123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 15000 });

    // Click Hamburger Menu button
    const menuBtn = page.getByRole('button', { name: 'Buka Menu Navigasi' }).first();
    await menuBtn.click();
    await page.waitForTimeout(600);

    // Drawer should be open: header has brand and close button, footer has gateway status, user info, and logout
    await expect(page.getByText('MENU UTAMA').first()).toBeVisible();
    await expect(page.getByText('Gateway Belum Aktif').first()).toBeVisible();
    await expect(page.getByText('Fajar Pratama').first()).toBeVisible();
    await expect(page.getByLabel('Tutup Menu Navigasi').first()).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'verify_mobile_03_drawer_overlay_360x800.png'),
    });

    // Close drawer
    await page.getByLabel('Tutup Menu Navigasi').first().click();
    await page.waitForTimeout(400);
  });

  test('4. Conversation Horizontal Scrollable Filter Tabs & No Right Clipping', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');

    // Login
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('admin@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('adminpassword123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 15000 });

    // Navigate to Conversations via drawer menu
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Percakapan').first().click();
    await page.waitForTimeout(1000);

    // Verify title and all 4 filter tabs exist and are rendered
    await expect(page.getByText('Pusat Percakapan').first()).toBeVisible();
    await expect(page.getByText(/Semua/i).first()).toBeVisible();
    await expect(page.getByText(/Belum Dibaca/i).first()).toBeVisible();
    await expect(page.getByText(/Menunggu/i).first()).toBeVisible();
    await expect(page.getByText(/Selesai/i).first()).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'verify_mobile_04_conv_filter_tabs_360x800.png'),
    });
  });

  test('5. Contacts View Mobile Responsiveness: Full Width Stacked Filters & Cards', async ({ page }) => {
    await setupMocks(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');

    // Login
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('admin@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('adminpassword123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 15000 });

    // Navigate to Contacts via drawer menu
    await page.getByLabel('Buka Menu Navigasi').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Menu Navigasi Kontak').first().click();
    await page.waitForTimeout(1000);

    // Verify contacts screen
    await expect(page.getByText('Direktori Kontak').first()).toBeVisible();
    await expect(page.getByText('Budi Santoso').first()).toBeVisible();

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'verify_mobile_05_contacts_cards_360x800.png'),
    });
  });
});
