import { test, expect } from '@playwright/test';
import {
  buildDedupKey,
  _resetLocalFallbackNotifications,
  _getLocalFallbackNotifications,
  notifyContactCreated,
  notifyCampaignEvent,
  notifyTeamEvent,
  notifyChatEvent,
  notifySystemEvent,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  fetchNotifications,
  isTableMissingError,
} from '../src/lib/notifications';

/**
 * =====================================================================
 * PENGUJIAN UNIT: INTEGRASI SUMBER NOTIFIKASI WABIZ (TAHAP 2)
 * =====================================================================
 * Memverifikasi:
 * 1. Setiap helper sumber event menghasilkan payload yang tepat dengan status yang benar.
 * 2. Deduplikasi konsisten dan mencegah entri ganda saat event diproses berulang.
 * 3. Operasi mark-as-read, mark-all-as-read, dan delete bekerja dengan benar.
 * 4. Kegagalan parameter atau tidak adanya data tidak menghasilkan notifikasi palsu.
 */

const TEST_ORG = 'org-test-unit-001';
const TEST_USER = 'user-test-unit-001';

test.describe('Unit Suite: Notification Source Integrations & Lifecycle', () => {
  test.beforeEach(() => {
    _resetLocalFallbackNotifications();
  });

  test('Unit: Sumber Kontak berhasil membuat notifikasi kontak baru', async () => {
    await notifyContactCreated({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      contactName: 'Ahmad Dahlan',
      phone: '08123456789',
    });

    const items = _getLocalFallbackNotifications();
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Kontak Baru Ditambahkan');
    expect(items[0].body).toContain('Ahmad Dahlan');
    expect(items[0].body).toContain('08123456789');
    expect(items[0].category).toBe('contact');
    expect(items[0].reference_id).toBe('08123456789');
  });

  test('Unit: Sumber Kampanye menghasilkan notifikasi sesuai status (draft / scheduled / queued)', async () => {
    // 1. Draf
    await notifyCampaignEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      campaignId: 'cmp-draft-1',
      campaignName: 'Promo PSB Gelombang 1',
      mode: 'draft',
    });

    // 2. Terjadwal
    await notifyCampaignEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      campaignId: 'cmp-sched-2',
      campaignName: 'Pengumuman Ujian',
      mode: 'scheduled',
      recipientCount: 150,
    });

    // 3. Masuk Antrean
    await notifyCampaignEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      campaignId: 'cmp-queue-3',
      campaignName: 'Broadcast Darurat',
      mode: 'queued',
      recipientCount: 50,
    });

    const items = _getLocalFallbackNotifications();
    expect(items.length).toBe(3);

    const queuedItem = items.find((i) => i.reference_id === 'cmp-queue-3');
    expect(queuedItem?.title).toBe('Kampanye Masuk Antrean Pengiriman');
    expect(queuedItem?.body).toContain('50 penerima');

    const scheduledItem = items.find((i) => i.reference_id === 'cmp-sched-2');
    expect(scheduledItem?.title).toBe('Kampanye Berhasil Dijadwalkan');
    expect(scheduledItem?.body).toContain('150 penerima');
  });

  test('Unit: Sumber Tim CS menerbitkan notifikasi penambahan dan update status dengan dedup stabil', async () => {
    // 1. Tambah anggota tim
    await notifyTeamEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      memberId: 'tm-101',
      fullName: 'Siti Rahma',
      action: 'added',
      extraInfo: 'PSB - Customer Service',
    });

    // Simulasi retry tambah anggota yang sama
    await notifyTeamEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      memberId: 'tm-101',
      fullName: 'Siti Rahma',
      action: 'added',
      extraInfo: 'PSB - Customer Service',
    });

    let items = _getLocalFallbackNotifications();
    expect(items.length).toBe(1); // Dedup stabil mencegah duplikasi retry

    // 2. Update status ke Nonaktif
    await notifyTeamEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      memberId: 'tm-101',
      fullName: 'Siti Rahma',
      action: 'status_updated',
      extraInfo: 'Nonaktif',
    });

    items = _getLocalFallbackNotifications();
    expect(items.length).toBe(2); // Event status berbeda menghasilkan notifikasi baru

    // Retry update status ke Nonaktif yang sama
    await notifyTeamEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      memberId: 'tm-101',
      fullName: 'Siti Rahma',
      action: 'status_updated',
      extraInfo: 'Nonaktif',
    });

    items = _getLocalFallbackNotifications();
    expect(items.length).toBe(2); // Retry update yang sama ter-deduplikasi
  });

  test('Unit: Sumber Percakapan menerbitkan notifikasi percakapan baru & handoff CS', async () => {
    await notifyChatEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      conversationId: 'conv-909',
      eventType: 'new_conversation',
      contactName: 'Budi Santoso',
    });

    const items = _getLocalFallbackNotifications();
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Percakapan Baru Dibuka');
    expect(items[0].body).toContain('Budi Santoso');
    expect(items[0].category).toBe('chat');
  });

  test('Unit: Sumber Sistem menerbitkan notifikasi pembaruan profil organisasi', async () => {
    await notifySystemEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      title: 'Profil Organisasi Diperbarui',
      body: 'Pengaturan profil bisnis dan integrasi berhasil disimpan.',
    });

    const items = _getLocalFallbackNotifications();
    expect(items.length).toBe(1);
    expect(items[0].category).toBe('system');
  });

  test('Unit: Idempotensi dedup_key mencegah duplikasi saat event diproses berulang', async () => {
    // Panggil event yang sama 3 kali berturut-turut
    for (let i = 0; i < 3; i++) {
      await notifyContactCreated({
        organizationId: TEST_ORG,
        userId: TEST_USER,
        contactName: 'Santri Idaman',
        phone: '08999999999',
      });
    }

    const items = _getLocalFallbackNotifications();
    // Hanya boleh ada 1 item yang tersimpan
    expect(items.length).toBe(1);
  });

  test('Unit: Siklus Hidup: markNotificationAsRead dan markAllNotificationsAsRead berfungsi', async () => {
    await notifyContactCreated({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      contactName: 'User A',
      phone: '08111111111',
    });
    await notifyContactCreated({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      contactName: 'User B',
      phone: '08222222222',
    });

    let items = _getLocalFallbackNotifications();
    expect(items.filter((i) => !i.is_read).length).toBe(2);

    // Tandai satu dibaca
    const firstId = items[0].id;
    const markOneRes = await markNotificationAsRead(firstId);
    expect(markOneRes).toBe(true);

    items = _getLocalFallbackNotifications();
    expect(items.find((i) => i.id === firstId)?.is_read).toBe(true);

    // Tandai semua dibaca
    const markAllRes = await markAllNotificationsAsRead(TEST_ORG, TEST_USER);
    expect(markAllRes).toBe(true);

    items = _getLocalFallbackNotifications();
    expect(items.every((i) => i.is_read)).toBe(true);
  });

  test('Unit: Siklus Hidup: deleteNotification menghapus notifikasi yang dipilih', async () => {
    await notifyContactCreated({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      contactName: 'User To Delete',
      phone: '08333333333',
    });

    let items = _getLocalFallbackNotifications();
    expect(items.length).toBe(1);
    const targetId = items[0].id;

    const delRes = await deleteNotification(targetId);
    expect(delRes).toBe(true);

    items = _getLocalFallbackNotifications();
    expect(items.length).toBe(0);
  });

  test('Unit: Siklus Hidup: deleteAllNotifications menghapus seluruh notifikasi milik pengguna dalam organisasi', async () => {
    // Buat 3 notifikasi untuk TEST_USER dalam TEST_ORG
    await notifyContactCreated({ organizationId: TEST_ORG, userId: TEST_USER, contactName: 'User 1', phone: '08101' });
    await notifyContactCreated({ organizationId: TEST_ORG, userId: TEST_USER, contactName: 'User 2', phone: '08102' });
    await notifyContactCreated({ organizationId: TEST_ORG, userId: TEST_USER, contactName: 'User 3', phone: '08103' });

    // Buat 1 notifikasi untuk USER LAIN dalam ORG LAIN (harus terlindungi dari penghapusan)
    await notifyContactCreated({ organizationId: 'other-org', userId: 'other-user', contactName: 'User Other', phone: '08999' });

    let items = _getLocalFallbackNotifications();
    expect(items.length).toBe(4);

    // Eksekusi deleteAllNotifications untuk TEST_ORG dan TEST_USER
    const delAllRes = await deleteAllNotifications(TEST_ORG, TEST_USER);
    expect(delAllRes).toBe(true);

    items = _getLocalFallbackNotifications();
    // Notifikasi milik TEST_USER harus habis (0), tetapi notifikasi milik other-user di other-org tetap utuh (1)
    expect(items.length).toBe(1);
    expect(items[0].user_id).toBe('other-user');
    expect(items[0].organization_id).toBe('other-org');
  });

  test('Unit: Deteksi Error Skema Database: isTableMissingError mendeteksi kode 42P01 dan PGRST200', async () => {
    expect(isTableMissingError({ code: '42P01', message: 'relation "public.notifications" does not exist' })).toBe(true);
    expect(isTableMissingError({ code: 'PGRST200', message: "Could not find the 'notifications' table" })).toBe(true);
    expect(isTableMissingError({ message: 'relation "notifications" does not exist' })).toBe(true);
    expect(isTableMissingError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isTableMissingError(null)).toBe(false);
  });

  test('Unit: fetchNotifications mengembalikan objek terstruktur dengan items dan status backend', async () => {
    await notifyContactCreated({ organizationId: TEST_ORG, userId: TEST_USER, contactName: 'Status Test', phone: '085555' });
    const res = await fetchNotifications(TEST_ORG, TEST_USER);

    expect(Array.isArray(res.items)).toBe(true);
    expect(res.items.length).toBe(1);
    expect(['online', 'table_missing', 'unconfigured', 'error']).toContain(res.status);
  });
});

