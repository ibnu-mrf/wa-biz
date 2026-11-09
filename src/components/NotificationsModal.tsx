import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { AppIcon, AppIconProps, useTheme, ThemePalette } from '../theme';
import {
  AppNotification,
  NotificationCategory,
  NotificationReferenceType,
  NotificationBackendStatus,
  fetchNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  deleteAllNotifications,
  subscribeToNotifications,
  addNotificationChangeListener,
} from '../lib/notifications';

export interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  organizationId?: string;
  userId?: string;
  onNavigateToItem?: (
    category: NotificationCategory,
    referenceId?: string | null,
    referenceType?: NotificationReferenceType | null
  ) => void;
  isDesktop?: boolean;
}

export type MainTabFilter = 'all' | 'unread' | 'read';
export type CategoryFilter = 'all' | 'chat' | 'campaign' | 'contact' | 'team' | 'system';

// Format Waktu Relatif yang Elegan
function formatRelativeTime(isoString: string): string {
  if (!isoString) return '';
  try {
    const now = Date.now();
    const past = new Date(isoString).getTime();
    const diffMs = now - past;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'Baru saja';
    if (diffMinutes < 60) return `${diffMinutes} mnt yang lalu`;
    if (diffHours < 24) return `${diffHours} jam yang lalu`;
    if (diffDays === 1) return 'Kemarin';
    if (diffDays < 7) return `${diffDays} hari yang lalu`;
    return new Date(isoString).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return '';
  }
}

export function NotificationsModal({
  visible,
  onClose,
  organizationId,
  userId,
  onNavigateToItem,
  isDesktop = false,
}: NotificationsModalProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [backendStatus, setBackendStatus] = useState<NotificationBackendStatus>('online');

  // Filter Tabs
  const [mainTab, setMainTab] = useState<MainTabFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  // Dialog Konfirmasi Hapus
  const [itemToDelete, setItemToDelete] = useState<AppNotification | null>(null);
  const [isConfirmingDeleteAll, setIsConfirmingDeleteAll] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Memuat data notifikasi dengan penanganan status lengkap
  const loadData = useCallback(async () => {
    if (!organizationId || !userId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    setActionFeedback(null);
    try {
      const res = await fetchNotifications(organizationId, userId);
      setNotifications(res.items);
      setBackendStatus(res.status);
    } catch {
      setBackendStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, userId]);

  // Efek pembukaan modal & pendaftaran realtime
  useEffect(() => {
    let ignore = false;
    if (visible && organizationId && userId) {
      fetchNotifications(organizationId, userId)
        .then((res) => {
          if (!ignore) {
            setNotifications(res.items);
            setBackendStatus(res.status);
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (!ignore) {
            setBackendStatus('error');
            setIsLoading(false);
          }
        });

      const unsubscribeRealtime = subscribeToNotifications(organizationId, userId, () => {
        void loadData();
      });
      const unsubscribeLocal = addNotificationChangeListener(() => {
        void loadData();
      });
      return () => {
        ignore = true;
        unsubscribeRealtime();
        unsubscribeLocal();
      };
    }
  }, [visible, organizationId, userId, loadData]);

  // Hitung jumlah notifikasi belum dibaca
  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  const readCount = useMemo(() => {
    return notifications.filter((n) => n.is_read).length;
  }, [notifications]);

  // Filter notifikasi berdasarkan Tab Utama & Kategori
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      // 1. Filter Status Baca
      if (mainTab === 'unread' && n.is_read) return false;
      if (mainTab === 'read' && !n.is_read) return false;

      // 2. Filter Kategori
      if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;

      return true;
    });
  }, [notifications, mainTab, categoryFilter]);

  // Handler: Tandai satu sebagai dibaca
  const handleMarkAsRead = async (item: AppNotification) => {
    if (item.is_read) return;
    const prev = [...notifications];
    setNotifications((curr) =>
      curr.map((n) => (n.id === item.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
    );
    const success = await markNotificationAsRead(item.id);
    if (!success) {
      setNotifications(prev);
      setActionFeedback({ type: 'error', message: 'Gagal memperbarui status dibaca di server.' });
    }
  };

  // Handler: Tandai semua sebagai dibaca
  const handleMarkAllAsRead = async () => {
    if (!organizationId || !userId || unreadCount === 0) return;
    const prev = [...notifications];
    const now = new Date().toISOString();
    setNotifications((curr) => curr.map((n) => ({ ...n, is_read: true, read_at: now })));
    const success = await markAllNotificationsAsRead(organizationId, userId);
    if (!success) {
      setNotifications(prev);
      setActionFeedback({ type: 'error', message: 'Gagal menandai seluruh notifikasi dibaca.' });
    } else {
      setActionFeedback({ type: 'success', message: 'Seluruh notifikasi telah ditandai sebagai dibaca.' });
    }
  };

  // Handler: Eksekusi Hapus Satu Notifikasi
  const executeDeleteItem = async () => {
    if (!itemToDelete) return;
    const target = itemToDelete;
    setIsDeleting(true);
    const prev = [...notifications];

    // Optimistic UI update
    setNotifications((curr) => curr.filter((n) => n.id !== target.id));
    setItemToDelete(null);

    const success = await deleteNotification(target.id, organizationId, userId);
    setIsDeleting(false);

    if (!success) {
      // Rollback jika gagal
      setNotifications(prev);
      setActionFeedback({
        type: 'error',
        message: 'Gagal menghapus notifikasi dari database. Periksa koneksi Anda.',
      });
    } else {
      setActionFeedback({
        type: 'success',
        message: 'Notifikasi berhasil dihapus secara permanen.',
      });
    }
  };

  // Handler: Eksekusi Hapus Semua Notifikasi
  const executeDeleteAll = async () => {
    if (!organizationId || !userId) return;
    setIsDeleting(true);
    const prev = [...notifications];

    // Optimistic UI update
    setNotifications([]);
    setIsConfirmingDeleteAll(false);

    const success = await deleteAllNotifications(organizationId, userId);
    setIsDeleting(false);

    if (!success) {
      // Rollback jika gagal
      setNotifications(prev);
      setActionFeedback({
        type: 'error',
        message: 'Gagal menghapus seluruh notifikasi dari database.',
      });
    } else {
      setActionFeedback({
        type: 'success',
        message: 'Seluruh notifikasi Anda telah berhasil dihapus.',
      });
    }
  };

  // Handler klik kartu notifikasi: Tandai dibaca & buka modul terkait
  const handleItemPress = async (item: AppNotification) => {
    await handleMarkAsRead(item);
    onClose();
    if (onNavigateToItem) {
      onNavigateToItem(item.category, item.reference_id, item.reference_type);
    }
  };

  // Pemetaan Ikon Kategori
  const getCategoryIcon = (category: NotificationCategory): AppIconProps['name'] => {
    switch (category) {
      case 'chat':
        return 'chat';
      case 'contact':
        return 'users';
      case 'campaign':
        return 'campaign';
      case 'team':
        return 'team';
      case 'system':
      default:
        return 'bell';
    }
  };

  const { isDark, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, !isDesktop && styles.modalOverlayMobile, { backgroundColor: colors.modalOverlay }]}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={[styles.modalCard, isDesktop ? styles.modalCardDesktop : styles.modalCardMobile, { backgroundColor: colors.modalBg, borderColor: colors.border }]}>
          {/* Pegangan Drag Mobile (Mobile Drag Handle Pill) */}
          {!isDesktop && (
            <View style={[styles.mobileDragHandleContainer, { backgroundColor: isDark ? '#101010' : colors.modalBg }]}>
              <View style={[styles.mobileDragHandle, { backgroundColor: isDark ? '#3A3A3A' : colors.borderStrong }]} />
            </View>
          )}

          {/* ======================================================== */}
          {/* HEADER NOTIFIKASI ENTERPRISE SAAS                       */}
          {/* ======================================================== */}
          <View style={[styles.modalHeader, { backgroundColor: isDark ? '#101010' : colors.modalBg, borderBottomColor: isDark ? '#303030' : colors.border }]}>
            <View style={styles.headerTitleGroup}>
              <View style={[styles.bellIconBox, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(13, 148, 136, 0.16)', borderColor: isDark ? 'rgba(45, 212, 191, 0.35)' : 'rgba(45, 212, 191, 0.4)' }]}>
                <AppIcon name="bell" size={17} color="#2DD4BF" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.headerTitleRow}>
                  <Text style={[styles.modalTitle, { color: colors.textPrimary }]} numberOfLines={1}>Notifikasi</Text>
                  {unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{unreadCount} Baru</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  Aktivitas & pembaruan sistem WABiz
                </Text>
              </View>
            </View>

            {/* Aksi Cepat Header */}
            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  style={[styles.headerActionBtnTeal, !isDesktop && styles.headerActionBtnIconOnly]}
                  activeOpacity={0.75}
                  onPress={handleMarkAllAsRead}
                  accessibilityLabel="Tandai semua sudah dibaca"
                >
                  <AppIcon name="check" size={13} color="#FFFFFF" />
                  {isDesktop && <Text style={styles.headerActionBtnTealText}>Tandai Dibaca</Text>}
                </TouchableOpacity>
              )}

              {notifications.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.headerActionBtnDanger,
                    !isDesktop && styles.headerActionBtnIconOnly,
                    {
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.1)',
                      borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.3)',
                    },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => setIsConfirmingDeleteAll(true)}
                  accessibilityLabel="Hapus semua notifikasi"
                >
                  <AppIcon name="trash" size={13} color="#EF4444" />
                  {isDesktop && <Text style={styles.headerActionBtnDangerText}>Hapus Semua</Text>}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)' }]}
                activeOpacity={0.7}
                onPress={onClose}
                accessibilityLabel="Tutup notifikasi"
              >
                <AppIcon name="close" size={16} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ======================================================== */}
          {/* BANNER STATUS INTEGRASI SUPABASE (INFORMATIF)            */}
          {/* ======================================================== */}
          {backendStatus === 'table_missing' && (
            <View style={[styles.statusBannerWarning, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB', borderBottomColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FDE68A' }]}>
              <View style={styles.warningDot} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.statusBannerWarningTitle, { color: isDark ? '#FBBF24' : '#92400E' }]}>Sesi Notifikasi Lokal Sementara</Text>
                <Text style={[styles.statusBannerWarningDesc, { color: isDark ? '#FCD34D' : '#78350F' }]}>
                  Tabel <Text style={{ fontWeight: '700' }}>public.notifications</Text> belum diterapkan di Supabase Cloud. Jalankan migrasi SQL <Text style={{ fontWeight: '700' }}>20261031170000</Text> di SQL Editor Supabase untuk mengaktifkan persistensi database permanen.
                </Text>
              </View>
            </View>
          )}

          {actionFeedback && (
            <View
              style={[
                styles.feedbackBanner,
                actionFeedback.type === 'error' ? styles.feedbackBannerError : styles.feedbackBannerSuccess,
              ]}
            >
              <Text
                style={[
                  styles.feedbackBannerText,
                  actionFeedback.type === 'error' ? styles.feedbackTextError : styles.feedbackTextSuccess,
                ]}
              >
                {actionFeedback.message}
              </Text>
            </View>
          )}

          {/* ======================================================== */}
          {/* TAB UTAMA (SEMUA, BELUM DIBACA, SUDAH DIBACA)           */}
          {/* ======================================================== */}
          <View style={[styles.mainTabBar, { backgroundColor: isDark ? '#111111' : colors.surfaceSecondary, borderBottomColor: isDark ? '#303030' : colors.border }]}>
            <TouchableOpacity
              style={[styles.mainTabBtn, mainTab === 'all' && [styles.mainTabBtnActive, { backgroundColor: isDark ? '#181818' : colors.surfaceCard }]]}
              activeOpacity={0.8}
              onPress={() => setMainTab('all')}
            >
              <Text style={[styles.mainTabBtnText, { color: mainTab === 'all' ? colors.textPrimary : (isDark ? '#A0A0A0' : colors.textSecondary) }, mainTab === 'all' && styles.mainTabBtnTextActive]}>
                Semua ({notifications.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.mainTabBtn, mainTab === 'unread' && [styles.mainTabBtnActive, { backgroundColor: isDark ? '#181818' : colors.surfaceCard }]]}
              activeOpacity={0.8}
              onPress={() => setMainTab('unread')}
            >
              <Text style={[styles.mainTabBtnText, { color: mainTab === 'unread' ? colors.textPrimary : (isDark ? '#A0A0A0' : colors.textSecondary) }, mainTab === 'unread' && styles.mainTabBtnTextActive]}>
                Belum Dibaca ({unreadCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.mainTabBtn, mainTab === 'read' && [styles.mainTabBtnActive, { backgroundColor: isDark ? '#181818' : colors.surfaceCard }]]}
              activeOpacity={0.8}
              onPress={() => setMainTab('read')}
            >
              <Text style={[styles.mainTabBtnText, { color: mainTab === 'read' ? colors.textPrimary : (isDark ? '#A0A0A0' : colors.textSecondary) }, mainTab === 'read' && styles.mainTabBtnTextActive]}>
                Sudah Dibaca ({readCount})
              </Text>
            </TouchableOpacity>
          </View>

          {/* ======================================================== */}
          {/* CHIP KATEGORI HORIZONTAL                                 */}
          {/* ======================================================== */}
          <View style={[styles.categoryFilterBar, { backgroundColor: isDark ? '#101010' : colors.surfaceCard, borderBottomColor: isDark ? '#303030' : colors.border }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
              <TouchableOpacity
                style={[styles.categoryChip, categoryFilter === 'all' ? styles.categoryChipActive : { backgroundColor: isDark ? '#181818' : colors.surfaceSecondary, borderColor: isDark ? '#303030' : 'transparent', borderWidth: 1 }]}
                onPress={() => setCategoryFilter('all')}
              >
                <Text style={[styles.categoryChipText, categoryFilter === 'all' ? styles.categoryChipTextActive : { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>
                  Seluruh Kategori
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.categoryChip, categoryFilter === 'chat' ? styles.categoryChipActive : { backgroundColor: isDark ? '#181818' : colors.surfaceSecondary, borderColor: isDark ? '#303030' : 'transparent', borderWidth: 1 }]}
                onPress={() => setCategoryFilter('chat')}
              >
                <Text style={[styles.categoryChipText, categoryFilter === 'chat' ? styles.categoryChipTextActive : { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>
                  Percakapan
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.categoryChip, categoryFilter === 'campaign' ? styles.categoryChipActive : { backgroundColor: isDark ? '#181818' : colors.surfaceSecondary, borderColor: isDark ? '#303030' : 'transparent', borderWidth: 1 }]}
                onPress={() => setCategoryFilter('campaign')}
              >
                <Text style={[styles.categoryChipText, categoryFilter === 'campaign' ? styles.categoryChipTextActive : { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>
                  Kampanye
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.categoryChip, categoryFilter === 'contact' ? styles.categoryChipActive : { backgroundColor: isDark ? '#181818' : colors.surfaceSecondary, borderColor: isDark ? '#303030' : 'transparent', borderWidth: 1 }]}
                onPress={() => setCategoryFilter('contact')}
              >
                <Text style={[styles.categoryChipText, categoryFilter === 'contact' ? styles.categoryChipTextActive : { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>
                  Kontak
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.categoryChip, categoryFilter === 'team' ? styles.categoryChipActive : { backgroundColor: isDark ? '#181818' : colors.surfaceSecondary, borderColor: isDark ? '#303030' : 'transparent', borderWidth: 1 }]}
                onPress={() => setCategoryFilter('team')}
              >
                <Text style={[styles.categoryChipText, categoryFilter === 'team' ? styles.categoryChipTextActive : { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>
                  Tim CS
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.categoryChip, categoryFilter === 'system' ? styles.categoryChipActive : { backgroundColor: isDark ? '#181818' : colors.surfaceSecondary, borderColor: isDark ? '#303030' : 'transparent', borderWidth: 1 }]}
                onPress={() => setCategoryFilter('system')}
              >
                <Text style={[styles.categoryChipText, categoryFilter === 'system' ? styles.categoryChipTextActive : { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>
                  Sistem
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* ======================================================== */}
          {/* DAFTAR NOTIFIKASI DENGAN EMPTY STATE & HIGH CONTRAST    */}
          {/* ======================================================== */}
          <ScrollView
            style={[styles.notificationList, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.notificationListContent}
            showsVerticalScrollIndicator={true}
          >
            {isLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#0D9488" />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Memuat notifikasi aktivitas...</Text>
              </View>
            ) : !organizationId || !userId ? (
              <View style={styles.emptyStateBox}>
                <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : '#CCFBF1' }]}>
                  <AppIcon name="alert" size={26} color="#0D9488" />
                </View>
                <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>Memerlukan Workspace Aktif</Text>
                <Text style={[styles.emptyStateDesc, { color: colors.textSecondary }]}>
                  Silakan masuk dan pastikan organisasi Anda telah terpilih untuk melihat daftar notifikasi.
                </Text>
              </View>
            ) : filteredNotifications.length === 0 ? (
              <View style={styles.emptyStateBox}>
                <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : '#CCFBF1' }]}>
                  <AppIcon name="bell" size={28} color="#0D9488" />
                </View>
                <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>
                  {mainTab === 'unread'
                    ? 'Semua Notifikasi Telah Dibaca'
                    : mainTab === 'read'
                    ? 'Belum Ada Notifikasi Dibaca'
                    : categoryFilter !== 'all'
                    ? `Tidak Ada Notifikasi Kategori ${(categoryFilter || 'ALL').toUpperCase()}`
                    : 'Belum Ada Notifikasi'}
                </Text>
                <Text style={[styles.emptyStateDesc, { color: colors.textSecondary }]}>
                  {mainTab === 'unread'
                    ? 'Bagus! Anda telah menyelesaikan seluruh aktivitas dan notifikasi terbaru.'
                    : mainTab === 'read'
                    ? 'Notifikasi yang telah Anda tandai sebagai dibaca akan dicatat di tab ini.'
                    : 'Setiap aktivitas pesan masuk baru, penambahan kontak, jadwal kampanye, dan tim CS akan dicatat di sini secara terpusat.'}
                </Text>
              </View>
            ) : (
              filteredNotifications.map((item) => {
                const iconName = getCategoryIcon(item.category);
                const isUnread = !item.is_read;

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.notificationCard,
                      {
                        backgroundColor: isUnread
                          ? (isDark ? 'rgba(15, 139, 131, 0.14)' : '#F0FDFA')
                          : (isDark ? '#111111' : colors.surfaceCard),
                        borderColor: isUnread ? colors.accent : (isDark ? '#303030' : colors.border),
                        borderLeftWidth: isUnread ? 3.5 : 1,
                        borderLeftColor: isUnread ? colors.accent : (isDark ? '#303030' : colors.border),
                      },
                    ]}
                    activeOpacity={0.8}
                    onPress={() => handleItemPress(item)}
                  >
                    {/* Ikon Kategori dengan Latar Kontras */}
                    <View
                      style={[
                        styles.categoryIconCircle,
                        {
                          backgroundColor: isUnread
                            ? (isDark ? 'rgba(15, 139, 131, 0.22)' : '#CCFBF1')
                            : (isDark ? '#181818' : colors.surfaceSecondary),
                        },
                      ]}
                    >
                      <AppIcon
                        name={iconName}
                        size={17}
                        color={isUnread ? colors.accent : (isDark ? '#C0C0C0' : colors.textSecondary)}
                      />
                    </View>

                    {/* Badan Konten Notifikasi */}
                    <View style={styles.cardContent}>
                      <View style={styles.cardHeaderRow}>
                        <View style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text
                              style={[
                                styles.cardTitle,
                                { color: colors.textPrimary, fontWeight: isUnread ? '800' : '600' }
                              ]}
                              numberOfLines={2}
                            >
                              {item.title}
                            </Text>
                            {isUnread && (
                              <View style={styles.unreadTitlePill}>
                                <Text style={styles.unreadTitlePillText}>BARU</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <Text style={[styles.cardTimeText, { color: isDark ? '#A0A0A0' : colors.textMuted }]}>
                          {formatRelativeTime(item.created_at)}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.cardBodyText,
                          {
                            color: isUnread ? colors.textPrimary : (isDark ? '#C0C0C0' : colors.textSecondary),
                            fontWeight: isUnread ? '500' : '400',
                          }
                        ]}
                        numberOfLines={3}
                      >
                        {item.body}
                      </Text>

                      {/* Baris Status & Aksi Item */}
                      <View style={styles.cardFooterRow}>
                        <View style={[styles.categoryBadge, { backgroundColor: isDark ? '#181818' : colors.surfaceSecondary, borderColor: isDark ? '#303030' : colors.border }]}>
                          <Text style={[styles.categoryBadgeText, { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>
                            {(item.category || (item as any).type || 'system').toUpperCase()}
                          </Text>
                        </View>

                        <View style={styles.itemActionsRow}>
                          {isUnread && (
                            <TouchableOpacity
                              style={[styles.itemReadBtn, { backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : '#CCFBF1' }]}
                              activeOpacity={0.7}
                              onPress={() => handleMarkAsRead(item)}
                              accessibilityLabel="Tandai sudah dibaca"
                            >
                              <AppIcon name="check" size={11} color={colors.accent} />
                              <Text style={[styles.itemReadBtnText, { color: colors.accent }]}>Tandai Dibaca</Text>
                            </TouchableOpacity>
                          )}

                          <TouchableOpacity
                            style={[styles.itemDeleteBtn, { backgroundColor: isDark ? '#181818' : colors.surfaceSecondary }]}
                            activeOpacity={0.7}
                            onPress={() => setItemToDelete(item)}
                            accessibilityLabel={`Hapus notifikasi ${item.title}`}
                          >
                            <AppIcon name="trash" size={13} color={isDark ? '#A0A0A0' : '#94A3B8'} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* ======================================================== */}
          {/* DIALOG KONFIRMASI HAPUS SATU NOTIFIKASI                  */}
          {/* ======================================================== */}
          {itemToDelete && (
            <View style={styles.confirmOverlay}>
              <View style={[styles.confirmBox, { backgroundColor: isDark ? '#111111' : colors.surfaceCard, borderColor: isDark ? '#303030' : colors.border }]}>
                <View style={[styles.confirmIconBoxDanger, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2' }]}>
                  <AppIcon name="trash" size={20} color="#DC2626" />
                </View>
                <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>Hapus Notifikasi?</Text>
                <Text style={[styles.confirmDesc, { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>
                  Apakah Anda yakin ingin menghapus notifikasi &ldquo;{itemToDelete.title}&rdquo;? Tindakan ini akan menghapusnya secara permanen dari database.
                </Text>

                <View style={styles.confirmButtonRow}>
                  <TouchableOpacity
                    style={[styles.confirmBtnCancel, { backgroundColor: isDark ? '#181818' : colors.surfaceSecondary, borderColor: isDark ? '#303030' : 'transparent', borderWidth: 1 }]}
                    activeOpacity={0.8}
                    onPress={() => setItemToDelete(null)}
                    disabled={isDeleting}
                  >
                    <Text style={[styles.confirmBtnCancelText, { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>Batal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.confirmBtnDanger}
                    activeOpacity={0.8}
                    onPress={executeDeleteItem}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.confirmBtnDangerText}>Hapus</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* ======================================================== */}
          {/* DIALOG KONFIRMASI HAPUS SEMUA NOTIFIKASI                 */}
          {/* ======================================================== */}
          {isConfirmingDeleteAll && (
            <View style={styles.confirmOverlay}>
              <View style={[styles.confirmBox, { backgroundColor: isDark ? '#111111' : colors.surfaceCard, borderColor: isDark ? '#303030' : colors.border }]}>
                <View style={[styles.confirmIconBoxDanger, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2' }]}>
                  <AppIcon name="trash" size={20} color="#DC2626" />
                </View>
                <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>Hapus Seluruh Notifikasi?</Text>
                <Text style={[styles.confirmDesc, { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>
                  Apakah Anda yakin ingin menghapus seluruh {notifications.length} notifikasi milik Anda dalam organisasi ini? Data yang terhapus tidak dapat dipulihkan.
                </Text>

                <View style={styles.confirmButtonRow}>
                  <TouchableOpacity
                    style={[styles.confirmBtnCancel, { backgroundColor: isDark ? '#181818' : colors.surfaceSecondary, borderColor: isDark ? '#303030' : 'transparent', borderWidth: 1 }]}
                    activeOpacity={0.8}
                    onPress={() => setIsConfirmingDeleteAll(false)}
                    disabled={isDeleting}
                  >
                    <Text style={[styles.confirmBtnCancelText, { color: isDark ? '#C0C0C0' : colors.textSecondary }]}>Batal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.confirmBtnDanger}
                    activeOpacity={0.8}
                    onPress={executeDeleteAll}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.confirmBtnDangerText}>Hapus Semua</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ==========================================
// STYLESHEET HIGH CONTRAST & RESPONSIVE
// ==========================================
const createStyles = (colors: ThemePalette) => StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8, 14, 28, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 9999,
  },
  modalOverlayMobile: {
    justifyContent: 'flex-end',
    padding: 0,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'column',
    position: 'relative',
    zIndex: 10000,
    ...Platform.select({
      web: {
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      },
      default: {
        elevation: 10,
      },
    }),
  },
  modalCardDesktop: {
    width: 600,
    height: 680,
  },
  modalCardMobile: {
    width: '100%',
    height: '92%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingBottom: Platform.OS === 'ios' ? 24 : 8,
  },
  mobileDragHandleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: colors.modalBg,
  },
  mobileDragHandle: {
    width: 40,
    height: 4.5,
    borderRadius: 2.5,
  },

  // ==========================================
  // HEADER
  // ==========================================
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  bellIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  unreadBadge: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtnTeal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#0D9488',
  },
  headerActionBtnTealText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerActionBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  headerActionBtnDangerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  headerActionBtnIconOnly: {
    width: 30,
    height: 30,
    borderRadius: 7,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ==========================================
  // STATUS BANNER
  // ==========================================
  statusBannerWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 8,
  },
  warningDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#D97706',
    marginTop: 4,
  },
  statusBannerWarningTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  statusBannerWarningDesc: {
    fontSize: 10.5,
    lineHeight: 14.5,
  },
  feedbackBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  feedbackBannerError: {
    backgroundColor: '#FEF2F2',
  },
  feedbackBannerSuccess: {
    backgroundColor: '#ECFDF5',
  },
  feedbackBannerText: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  feedbackTextError: {
    color: '#DC2626',
  },
  feedbackTextSuccess: {
    color: '#059669',
  },

  // ==========================================
  // MAIN TABS
  // ==========================================
  mainTabBar: {
    flexDirection: 'row',
    padding: 4,
    borderBottomWidth: 1,
  },
  mainTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 7,
  },
  mainTabBtnActive: {
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
      },
      default: {
        elevation: 2,
      },
    }),
  },
  mainTabBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  mainTabBtnTextActive: {
    fontWeight: '800',
  },

  // ==========================================
  // CATEGORY FILTER
  // ==========================================
  categoryFilterBar: {
    borderBottomWidth: 1,
    paddingVertical: 7,
  },
  categoryScroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 14,
  },
  categoryChipActive: {
    backgroundColor: '#0D9488',
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // ==========================================
  // LIST NOTIFIKASI
  // ==========================================
  notificationList: {
    flex: 1,
  },
  notificationListContent: {
    padding: 12,
    gap: 10,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  loadingText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  emptyStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 44,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyStateTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyStateDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 320,
  },

  // ==========================================
  // CARD NOTIFIKASI
  // ==========================================
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 13,
    gap: 12,
    borderWidth: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  categoryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 5,
  },
  cardTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    flexShrink: 1,
    letterSpacing: -0.1,
  },
  unreadTitlePill: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 5.5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  unreadTitlePillText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardTimeText: {
    fontSize: 10.5,
    fontWeight: '500',
    flexShrink: 0,
  },
  cardBodyText: {
    fontSize: 12.5,
    lineHeight: 18.5,
    marginBottom: 8,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  itemActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  itemReadBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  itemDeleteBtn: {
    padding: 4.5,
    borderRadius: 5,
  },

  // ==========================================
  // CONFIRM DIALOG OVERLAY
  // ==========================================
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 99,
  },
  confirmBox: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
  },
  confirmIconBoxDanger: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  confirmTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  confirmDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
  },
  confirmButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  confirmBtnCancel: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnCancelText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  confirmBtnDanger: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 7,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDangerText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
