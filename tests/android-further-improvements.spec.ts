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

const MOCK_NOTIFICATIONS = [
  {
    id: 'notif-001',
    organization_id: 'org-wabiz-001',
    user_id: 'usr-wabiz-001',
    title: 'Pesan Masuk Baru dari Calon Santri H. Muhammad Arifin',
    body: 'Wali santri menanyakan detail biaya pendaftaran asrama dan seleksi tahfidz Al-Qur\'an untuk tahun ajaran baru.',
    category: 'chat',
    reference_id: 'conv-001',
    reference_type: 'conversation',
    is_read: false,
    created_at: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: 'notif-002',
    organization_id: 'org-wabiz-001',
    user_id: 'usr-wabiz-001',
    title: 'Kampanye Siaran "Pengumuman Ujian Masuk Gelombang 1" Berhasil Dikirim',
    body: 'Kampanye siaran massal berhasil dikirimkan kepada 120 kontak sasaran tanpa kegagalan sistem.',
    category: 'campaign',
    reference_id: 'cmp-001',
    reference_type: 'campaign',
    is_read: false,
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'notif-003',
    organization_id: 'org-wabiz-001',
    user_id: 'usr-wabiz-001',
    title: 'Kontak Baru Ditambahkan: Budi Santoso',
    body: 'Pendaftar santri baru telah ditambahkan ke basis data kontak dan siap dihubungi oleh staf CS.',
    category: 'contact',
    reference_id: 'c-002',
    reference_type: 'contact',
    is_read: true,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

const MOCK_CONVERSATIONS_DATA = [
  {
    id: 'conv-001',
    organization_id: 'org-wabiz-001',
    contact_id: 'c-001',
    assigned_to: 'usr-wabiz-001',
    status: 'open',
    handoff_status: 'human',
    handoff_department: 'CS Pendaftaran',
    handoff_notified_at: '2026-10-02T10:00:00Z',
    handoff_summary: null,
    last_message_at: '2026-10-02T10:30:00Z',
    created_at: '2026-10-02T10:00:00Z',
    contacts: {
      id: 'c-001',
      name: 'H. Muhammad Arifin',
      phone: '+62 812-3456-7890',
      email: 'arifin@wali.sch.id',
      label: 'Orang Tua',
      labels: ['Orang Tua'],
      notes: 'Wali santri kelas 10 Aliyah',
      follow_up_status: 'Menunggu Respon',
    },
    messages: [
      {
        id: 'msg-001',
        sender_type: 'customer',
        sender_name: 'H. Muhammad Arifin',
        message_text: 'Assalamu alaikum, bagaimana alur pendaftaran santri baru tahfidz?',
        created_at: '2026-10-02T10:00:00Z',
      },
      {
        id: 'msg-002',
        sender_type: 'agent',
        sender_name: 'Ustadz Ahmad Dahlan',
        message_text: 'Wa alaikumsalam Wr Wb Pak Arifin. Pendaftaran dibuka melalui link portal PSB kami.',
        created_at: '2026-10-02T10:15:00Z',
      },
    ],
  },
  {
    id: 'conv-002',
    organization_id: 'org-wabiz-001',
    contact_id: 'c-002',
    assigned_to: null,
    status: 'open',
    handoff_status: 'ai',
    handoff_department: null,
    handoff_notified_at: null,
    handoff_summary: null,
    last_message_at: '2026-10-03T11:20:00Z',
    created_at: '2026-10-03T11:00:00Z',
    contacts: {
      id: 'c-002',
      name: 'Budi Santoso',
      phone: '+62 856-4188-6993',
      email: 'budi@santri.id',
      label: 'Calon Santri',
      labels: ['Calon Santri'],
      notes: 'Pendaftar gelombang 1',
      follow_up_status: 'Baru',
    },
    messages: [
      {
        id: 'msg-003',
        sender_type: 'customer',
        sender_name: 'Budi Santoso',
        message_text: 'Halo Kak, mau tanya info pendaftaran santri baru dan demo sistem apakah masih tersedia?',
        created_at: '2026-10-03T11:00:00Z',
      },
      {
        id: 'msg-004',
        sender_type: 'bot',
        sender_name: 'Chatbot AI WABiz',
        message_text: 'Halo Kak Budi! Masih tersedia. Kami siap membantu pertanyaan Anda mengenai pendaftaran.',
        created_at: '2026-10-03T11:05:00Z',
      },
    ],
  },
];

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
      body: JSON.stringify(MOCK_CONVERSATIONS_DATA),
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
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_NOTIFICATIONS),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
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

test.describe('WABiz Android Further Improvements Suite (Kampanye, Percakapan, Notifikasi)', () => {
  test('Complete Android Verification & High-Resolution Screenshot Capture', async ({ page }) => {
    test.setTimeout(240000);
    await setupMockApi(page);

    // 1. Inisialisasi Viewport Android 360x800
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await page.getByPlaceholder('nama@organisasi.sch.id').fill('owner@wabiz.b2b');
    await page.getByPlaceholder('Minimal 6 karakter').fill('password123');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByText('Dashboard Eksekutif')).toBeVisible({ timeout: 25000 });

    // Pastikan berada pada Mode Gelap (Dark Mode)
    const toggleToDark = page.getByLabel('Beralih ke Mode Gelap');
    if (await toggleToDark.isVisible()) {
      await toggleToDark.click();
      await page.waitForTimeout(300);
    }

    // ========================================================
    // 1. TAMBAH KAMPANYE (PRIORITAS 1 - AUDIT PALET GELAP & VARIABEL)
    // ========================================================
    await page.getByText('Kampanye', { exact: true }).first().click();
    await page.waitForTimeout(400);
    await expect(page.getByText('+ Buat Kampanye')).toBeVisible();

    // Buka Modal Buat Kampanye
    await page.getByText('+ Buat Kampanye').first().click();
    await page.waitForTimeout(500);

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Buat Kampanye Siaran Baru')).toBeVisible();
    await expect(dialog.getByPlaceholder('Contoh: Pengumuman PSB Gelombang 1')).toBeVisible();

    // Isi Nama Kampanye & Uji Variabel Template Cepat
    await dialog.getByPlaceholder('Contoh: Pengumuman PSB Gelombang 1').fill('Siaran Pendaftaran Santri Baru');
    
    // Klik chip variabel: {nama}, {telepon}, {label}, {organisasi}
    await dialog.getByText('{nama}').first().click();
    await page.waitForTimeout(150);
    await dialog.getByText('{telepon}').first().click();
    await page.waitForTimeout(150);
    await dialog.getByText('{label}').first().click();
    await page.waitForTimeout(150);
    await dialog.getByText('{organisasi}').first().click();
    await page.waitForTimeout(200);

    // Ketik kelanjutan pesan draf untuk melihat WhatsApp Live Preview secara realtime
    const messageInput = dialog.getByPlaceholder(/Ketik draf isi pesan/i);
    await messageInput.fill('Halo {nama}, nomor {telepon} kategori {label}. Terima kasih telah mendaftar di {organisasi}. Ujian seleksi masuk akan diadakan hari Sabtu jam 08.00 WIB.');
    await page.waitForTimeout(300);

    // Tangkap Screenshot Form Tambah Kampanye Dark Mode (360x800)
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'campaign_create_form_360_dark.png') });

    // Uji Pilihan Terjadwal (Kalender & Jam Analog Dial)
    await dialog.getByText('Terjadwal', { exact: true }).click();
    await page.waitForTimeout(400);
    await expect(dialog.getByText(/Jadwal Kalender & Jam Pengiriman/i)).toBeVisible();
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'campaign_create_form_scheduled_dark.png') });

    // Tutup Modal Form
    await dialog.getByText('Batal').first().click();
    await page.waitForTimeout(300);

    // Uji Form Kampanye di Light Mode (360x800)
    await page.getByLabel('Beralih ke Mode Terang').first().click();
    await page.waitForTimeout(300);
    await page.getByText('+ Buat Kampanye').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'campaign_create_form_360_light.png') });
    await page.getByRole('dialog').getByText('Batal').first().click();
    await page.waitForTimeout(300);

    // Kembalikan ke Mode Gelap
    await page.getByLabel('Beralih ke Mode Gelap').first().click();
    await page.waitForTimeout(300);

    // ========================================================
    // 2. PERCAKAPAN (DAFTAR & DETAIL KHUSUS ANDROID)
    // ========================================================
    await page.getByText('Percakapan', { exact: true }).first().click();
    await page.waitForTimeout(500);

    // Verifikasi Daftar Percakapan (Header desktop raksasa tidak muncul di mobile)
    await expect(page.getByPlaceholder('Cari nama, nomor, pesan...')).toBeVisible();
    await expect(page.getByText('Budi Santoso').first()).toBeVisible();

    // Tangkap Screenshot Daftar Percakapan di 360x800
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'conversations_list_360_dark.png') });

    // Buka Detail Percakapan (Budi Santoso)
    await page.getByText('Budi Santoso').first().click();
    await page.waitForTimeout(500);

    // Verifikasi Komponen Detail Percakapan
    await expect(page.getByText('Tandai Selesai').first()).toBeVisible();
    await expect(page.getByText('Alihkan ke AI').first()).toBeVisible();
    await expect(page.getByText('Hapus').first()).toBeVisible();
    await expect(page.getByPlaceholder('Ketik balasan pesan agen CS...')).toBeVisible();

    // Tangkap Screenshot Detail Percakapan di 360x800 (Composer di batas dasar, nav bawah hilang)
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'conversations_detail_360_dark.png') });

    // Fokus pada Composer Input (Simulasi Keyboard / Active Composer)
    await page.getByPlaceholder('Ketik balasan pesan agen CS...').focus();
    await page.getByPlaceholder('Ketik balasan pesan agen CS...').fill('Halo Mas Budi, baik kami siapkan jadwal konsultasi pendaftaran hari ini.');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'conversations_detail_keyboard_360.png') });

    // Kembali ke Daftar Percakapan via Tombol Kembali
    await page.getByLabel(/Kembali/i).first().click();
    await page.waitForTimeout(400);

    // ========================================================
    // 3. PUSAT NOTIFIKASI (JARAK, TIPOGRAFI, DAN AKSI)
    // ========================================================
    // Buka Modal Notifikasi via Ikon Bell di Header
    await page.getByLabel(/Notifikasi/).first().click();
    await page.waitForTimeout(500);

    // Verifikasi Modal Notifikasi
    await expect(page.getByText('Notifikasi', { exact: true })).toBeVisible();
    await expect(page.getByText('Aktivitas & pembaruan sistem WABiz')).toBeVisible();
    await expect(page.getByText('Pesan Masuk Baru dari Calon Santri H. Muhammad Arifin')).toBeVisible();
    await expect(page.getByText('BARU').first()).toBeVisible();

    // Tangkap Screenshot Modal Notifikasi Dark Mode (360x800)
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'notifications_modal_multiple_360_dark.png') });

    // Tutup Modal Notifikasi
    await page.getByLabel('Tutup notifikasi').first().click();
    await page.waitForTimeout(300);

    // Uji Modal Notifikasi di Light Mode
    await page.getByLabel('Beralih ke Mode Terang').first().click();
    await page.waitForTimeout(300);
    await page.getByLabel(/Notifikasi/).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'notifications_modal_360_light.png') });
    await page.getByLabel('Tutup notifikasi').first().click();
    await page.waitForTimeout(300);

    // Kembalikan ke Mode Gelap
    await page.getByLabel('Beralih ke Mode Gelap').first().click();
    await page.waitForTimeout(300);

    // ========================================================
    // 4. RESPONSIF VIEWPORT ANDROID 390x844 & 412x915
    // ========================================================
    // Viewport 390x844 (Modern Android/iPhone)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);

    // Daftar Percakapan di 390x844
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'conversations_list_390_dark.png') });

    // Detail Percakapan di 390x844
    await page.getByText('Budi Santoso').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'conversations_detail_390_dark.png') });
    await page.getByLabel(/Kembali/i).first().click();
    await page.waitForTimeout(300);

    // Form Tambah Kampanye di 390x844
    await page.getByText('Kampanye', { exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.getByText('+ Buat Kampanye').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'campaign_create_form_390_dark.png') });
    await page.getByRole('dialog').getByText('Batal').first().click();
    await page.waitForTimeout(300);

    // Viewport 412x915 (Large Android / Pixel / Galaxy Ultra)
    await page.setViewportSize({ width: 412, height: 915 });
    await page.waitForTimeout(300);

    // Daftar Percakapan di 412x915
    await page.getByText('Percakapan', { exact: true }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'conversations_list_412_dark.png') });
  });
});
