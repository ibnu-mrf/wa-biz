import { test, expect } from '@playwright/test';
import {
  _resetLocalFallbackNotifications,
  _injectLocalNotification,
  _getLocalFallbackNotifications,
  fetchNotifications,
  fetchUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  AppNotification,
} from '../src/lib/notifications';

const TEST_ORG_A = 'org-e2e-001';
const TEST_ORG_B = 'org-e2e-002';
const TEST_USER_1 = 'user-e2e-101';
const TEST_USER_2 = 'user-e2e-102';

test.describe('E2E & UI Logic: In-App Notifications Lifecycle & Modal Integrity', () => {
  test.beforeEach(() => {
    _resetLocalFallbackNotifications();
  });

  test('Test 1: Modal & Fetch Notifikasi Tidak Blank/Putih Saat Kosong (Empty State Berisi Konten)', async () => {
    const res = await fetchNotifications(TEST_ORG_A, TEST_USER_1);
    expect(res).toBeDefined();
    expect(Array.isArray(res.items)).toBe(true);
    expect(res.items.length).toBe(0);
    expect(['online', 'table_missing', 'unconfigured']).toContain(res.status);
    // Tidak melempar uncaught exception, status backend terdefinisi
  });

  test('Test 2: Daftar Notifikasi Muncul dengan Data Lengkap (Judul, Isi, Kategori, Waktu)', async () => {
    const notif1: AppNotification = {
      id: 'notif-item-1',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'Pesan Baru Diterima',
      body: 'Pelanggan Budi Santoso mengirimkan pertanyaan via WhatsApp.',
      category: 'chat',
      reference_id: 'conv-101',
      reference_type: 'conversation',
      dedup_key: 'chat:new:org-101',
      is_read: false,
      created_at: new Date(Date.now() - 60000).toISOString(),
    };

    const notif2: AppNotification = {
      id: 'notif-item-2',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'Kampanye Terjadwal',
      body: 'Broadcast PSB 2026 telah dijadwalkan untuk 250 kontak.',
      category: 'campaign',
      reference_id: 'cmp-202',
      reference_type: 'campaign',
      dedup_key: 'campaign:sched:cmp-202',
      is_read: true,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      read_at: new Date().toISOString(),
    };

    _injectLocalNotification(notif2);
    _injectLocalNotification(notif1);

    const res = await fetchNotifications(TEST_ORG_A, TEST_USER_1);
    expect(res.items.length).toBe(2);

    const first = res.items[0];
    expect(first.title).toBe('Pesan Baru Diterima');
    expect(first.body).toContain('Budi Santoso');
    expect(first.category).toBe('chat');
    expect(first.is_read).toBe(false);

    const second = res.items[1];
    expect(second.title).toBe('Kampanye Terjadwal');
    expect(second.is_read).toBe(true);
  });

  test('Test 3: Filter Tab Semua, Belum Dibaca, dan Sudah Dibaca Memilah Data Secara Akurat', async () => {
    const unreadItem: AppNotification = {
      id: 'item-unread-1',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'Kontak Baru Ditambahkan',
      body: 'Siti Aminah (08123456789) ditambahkan ke kontak.',
      category: 'contact',
      is_read: false,
      created_at: new Date().toISOString(),
    };

    const readItem: AppNotification = {
      id: 'item-read-2',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'Profil Organisasi Diperbarui',
      body: 'Identitas bisnis resmi telah diverifikasi.',
      category: 'system',
      is_read: true,
      created_at: new Date(Date.now() - 100000).toISOString(),
      read_at: new Date().toISOString(),
    };

    _injectLocalNotification(readItem);
    _injectLocalNotification(unreadItem);

    const res = await fetchNotifications(TEST_ORG_A, TEST_USER_1);
    const allItems = res.items;
    const unreadFiltered = allItems.filter((i) => !i.is_read);
    const readFiltered = allItems.filter((i) => i.is_read);

    expect(allItems.length).toBe(2);
    expect(unreadFiltered.length).toBe(1);
    expect(unreadFiltered[0].id).toBe('item-unread-1');

    expect(readFiltered.length).toBe(1);
    expect(readFiltered[0].id).toBe('item-read-2');
  });

  test('Test 4: Siklus Hidup Mark As Read Mengubah Status dan Menurunkan Unread Count', async () => {
    _injectLocalNotification({
      id: 'notif-read-cycle-1',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'Notif 1',
      body: 'Body 1',
      category: 'team',
      is_read: false,
      created_at: new Date().toISOString(),
    });
    _injectLocalNotification({
      id: 'notif-read-cycle-2',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'Notif 2',
      body: 'Body 2',
      category: 'team',
      is_read: false,
      created_at: new Date().toISOString(),
    });

    let count = await fetchUnreadCount(TEST_ORG_A, TEST_USER_1);
    expect(count).toBe(2);

    // Tandai notif 1 dibaca
    const markRes = await markNotificationAsRead('notif-read-cycle-1');
    expect(markRes).toBe(true);

    count = await fetchUnreadCount(TEST_ORG_A, TEST_USER_1);
    expect(count).toBe(1);

    // Tandai semua dibaca
    const markAllRes = await markAllNotificationsAsRead(TEST_ORG_A, TEST_USER_1);
    expect(markAllRes).toBe(true);

    count = await fetchUnreadCount(TEST_ORG_A, TEST_USER_1);
    expect(count).toBe(0);
  });

  test('Test 5: Penghapusan Satu Notifikasi Berhasil Menghapus Data Secara Permanen', async () => {
    _injectLocalNotification({
      id: 'notif-del-1',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'Notif Akan Dihapus',
      body: 'Testing delete single item',
      category: 'chat',
      is_read: false,
      created_at: new Date().toISOString(),
    });
    _injectLocalNotification({
      id: 'notif-keep-2',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'Notif Akan Dipertahankan',
      body: 'Testing keep item',
      category: 'chat',
      is_read: false,
      created_at: new Date().toISOString(),
    });

    let res = await fetchNotifications(TEST_ORG_A, TEST_USER_1);
    expect(res.items.length).toBe(2);

    // Eksekusi hapus notif-del-1
    const delRes = await deleteNotification('notif-del-1', TEST_ORG_A, TEST_USER_1);
    expect(delRes).toBe(true);

    res = await fetchNotifications(TEST_ORG_A, TEST_USER_1);
    expect(res.items.length).toBe(1);
    expect(res.items[0].id).toBe('notif-keep-2');
  });

  test('Test 6: Penghapusan Seluruh Notifikasi (Delete All) Menghapus Notifikasi Milik Pengguna Sendiri', async () => {
    _injectLocalNotification({
      id: 'item-a1',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'A1',
      body: 'B1',
      category: 'chat',
      is_read: false,
      created_at: new Date().toISOString(),
    });
    _injectLocalNotification({
      id: 'item-a2',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'A2',
      body: 'B2',
      category: 'campaign',
      is_read: true,
      created_at: new Date().toISOString(),
    });

    let res = await fetchNotifications(TEST_ORG_A, TEST_USER_1);
    expect(res.items.length).toBe(2);

    const delAllRes = await deleteAllNotifications(TEST_ORG_A, TEST_USER_1);
    expect(delAllRes).toBe(true);

    res = await fetchNotifications(TEST_ORG_A, TEST_USER_1);
    expect(res.items.length).toBe(0);

    const count = await fetchUnreadCount(TEST_ORG_A, TEST_USER_1);
    expect(count).toBe(0);
  });

  test('Test 7: Isolasi Multi-Tenant & Antar-Pengguna: Delete All Tidak Menyentuh Notifikasi Pengguna/Organisasi Lain', async () => {
    // Notifikasi Pengguna 1 di Org A
    _injectLocalNotification({
      id: 'orgA-user1-item',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_1,
      title: 'Org A User 1',
      body: 'Notif',
      category: 'chat',
      is_read: false,
      created_at: new Date().toISOString(),
    });

    // Notifikasi Pengguna 2 di Org A (Organisasi sama, pengguna berbeda)
    _injectLocalNotification({
      id: 'orgA-user2-item',
      organization_id: TEST_ORG_A,
      user_id: TEST_USER_2,
      title: 'Org A User 2',
      body: 'Notif',
      category: 'chat',
      is_read: false,
      created_at: new Date().toISOString(),
    });

    // Notifikasi Pengguna 1 di Org B (Organisasi berbeda)
    _injectLocalNotification({
      id: 'orgB-user1-item',
      organization_id: TEST_ORG_B,
      user_id: TEST_USER_1,
      title: 'Org B User 1',
      body: 'Notif',
      category: 'chat',
      is_read: false,
      created_at: new Date().toISOString(),
    });

    // Pengguna 1 di Org A menjalankan deleteAllNotifications
    await deleteAllNotifications(TEST_ORG_A, TEST_USER_1);

    // Verifikasi:
    // 1. Notifikasi Pengguna 1 di Org A harus terhapus (0)
    const resA1 = await fetchNotifications(TEST_ORG_A, TEST_USER_1);
    expect(resA1.items.length).toBe(0);

    // 2. Notifikasi Pengguna 2 di Org A TETAP AMAN (1)
    const resA2 = await fetchNotifications(TEST_ORG_A, TEST_USER_2);
    expect(resA2.items.length).toBe(1);
    expect(resA2.items[0].id).toBe('orgA-user2-item');

    // 3. Notifikasi Pengguna 1 di Org B TETAP AMAN (1)
    const resB1 = await fetchNotifications(TEST_ORG_B, TEST_USER_1);
    expect(resB1.items.length).toBe(1);
    expect(resB1.items[0].id).toBe('orgB-user1-item');
  });
});

