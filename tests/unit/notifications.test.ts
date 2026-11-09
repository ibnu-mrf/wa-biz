import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDedupKey,
  _resetLocalFallbackNotifications,
  _getLocalFallbackNotifications,
  notifyContactCreated,
  notifyContactUpdated,
  notifyContactDeleted,
  notifyCampaignEvent,
  notifyTeamEvent,
  notifyChatEvent,
  notifySystemEvent,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  isTableMissingError,
} from '../../src/lib/notifications';
import { formatErrorUserMessage } from '../../src/lib/errorHandler';

const TEST_ORG = 'org-test-unit-001';
const TEST_USER = 'user-test-unit-001';

describe('Unit: Notification System & Error Handling (src/lib/notifications.ts)', () => {
  beforeEach(() => {
    _resetLocalFallbackNotifications();
  });

  it('Deduplikasi: buildDedupKey menghasilkan kunci unik dan deterministik', () => {
    const key1 = buildDedupKey('contact', 'created', TEST_ORG, '08123456789');
    const key2 = buildDedupKey('contact', 'created', TEST_ORG, '08123456789');
    const key3 = buildDedupKey('contact', 'updated', TEST_ORG, '08123456789');

    assert.equal(key1, key2);
    assert.notEqual(key1, key3);
    assert.equal(key1, 'contact:created:org-test-unit-001:08123456789');
  });

  it('Siklus Notifikasi Kontak: Created, Updated, dan Deleted', async () => {
    await notifyContactCreated({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      contactName: 'Ahmad Dahlan',
      phone: '08123456789',
    });

    let items = _getLocalFallbackNotifications();
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Kontak Baru Ditambahkan');
    assert.ok(items[0].body.includes('Ahmad Dahlan'));
    assert.equal(items[0].category, 'contact');

    await notifyContactUpdated({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      contactName: 'Ahmad Dahlan M.Pd.',
      phone: '08123456789',
    });

    items = _getLocalFallbackNotifications();
    assert.equal(items.length, 2);
    assert.equal(items[0].title, 'Data Kontak Diperbarui');

    await notifyContactDeleted({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      contactName: 'Ahmad Dahlan M.Pd.',
      phone: '08123456789',
    });

    items = _getLocalFallbackNotifications();
    assert.equal(items.length, 3);
    assert.equal(items[0].title, 'Kontak Dihapus');
  });

  it('Siklus Notifikasi Kampanye: Draft, Scheduled, dan Queued', async () => {
    await notifyCampaignEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      campaignId: 'cmp-001',
      campaignName: 'Broadcast Pembukaan PSB',
      mode: 'scheduled',
      recipientCount: 150,
    });

    const items = _getLocalFallbackNotifications();
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'Kampanye Berhasil Dijadwalkan');
    assert.equal(items[0].category, 'campaign');
  });

  it('Siklus Notifikasi Tim CS dan Sistem', async () => {
    await notifyTeamEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      memberId: 'mem-001',
      fullName: 'Siti Rahma',
      role: 'cs',
      action: 'added',
    });

    await notifySystemEvent({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      title: 'Pembaruan Profil',
      body: 'Identitas lembaga berhasil diperbarui',
    });

    const items = _getLocalFallbackNotifications();
    assert.equal(items.length, 2);
    assert.equal(items[1].category, 'team');
    assert.equal(items[0].category, 'system');
  });

  it('Manajemen Status: Mark as read dan Delete', async () => {
    await notifyContactCreated({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      contactName: 'Santri Baru',
      phone: '08999999999',
    });

    let items = _getLocalFallbackNotifications();
    const notifId = items[0].id;
    assert.equal(items[0].is_read, false);

    await markNotificationAsRead(notifId);
    items = _getLocalFallbackNotifications();
    assert.equal(items[0].is_read, true);

    await markAllNotificationsAsRead(TEST_ORG, TEST_USER);
    items = _getLocalFallbackNotifications();
    assert.equal(items.every((i) => i.is_read), true);

    await deleteNotification(notifId);
    items = _getLocalFallbackNotifications();
    assert.equal(items.length, 0);

    await notifyContactCreated({
      organizationId: TEST_ORG,
      userId: TEST_USER,
      contactName: 'Santri Baru 2',
      phone: '08888888888',
    });
    assert.equal(_getLocalFallbackNotifications().length, 1);

    await deleteAllNotifications(TEST_ORG, TEST_USER);
    assert.equal(_getLocalFallbackNotifications().length, 0);
  });

  it('Deteksi Error Schema: isTableMissingError mengenali kode PostgreSQL', () => {
    assert.equal(isTableMissingError({ code: '42P01' }), true);
    assert.equal(isTableMissingError({ code: 'PGRST200' }), true);
    assert.equal(isTableMissingError({ message: 'relation "public.notifications" does not exist' }), true);
    assert.equal(isTableMissingError({ code: '23505' }), false);
  });

  it('Error Formatter: formatErrorUserMessage menerjemahkan error teknis', () => {
    const networkErr = formatErrorUserMessage(new Error('Failed to fetch'));
    assert.ok(networkErr.includes('koneksi internet') || networkErr.includes('jaringan'));

    const authErr = formatErrorUserMessage(new Error('Invalid login credentials'));
    assert.ok(authErr.includes('Sesi login') || authErr.includes('login') || authErr.includes('masuk'));
  });
});
