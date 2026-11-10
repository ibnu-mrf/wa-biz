import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  TextInput,
  useWindowDimensions,
  ActivityIndicator,
  StatusBar as RNStatusBar,
  Image,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './src/lib/supabase';
import { AuthView } from './src/components/AuthView';
import { OnboardingView } from './src/components/OnboardingView';
import {
  ConversationsView,
  INITIAL_CONVERSATIONS,
  Conversation,
} from './src/components/ConversationsView';
import { ContactsView, INITIAL_CONTACTS, Contact, normalizePhoneNumber } from './src/components/ContactsView';
import {
  CampaignsView,
  Campaign,
  CampaignStatus,
  CampaignStats,
  CampaignStatusBadge,
  calculateCampaignStats,
  mapCampaignFromDb,
} from './src/components/CampaignsView';
import { ChatbotView } from './src/components/ChatbotView';
import { TeamView, TeamMember } from './src/components/TeamView';
import {
  SettingsView,
  SettingsTab,
  OrgProfile,
  DEFAULT_ORG_PROFILE,
  mapDbToOrgProfile,
} from './src/components/SettingsView';
import { NotificationsModal } from './src/components/NotificationsModal';
import {
  NotificationCategory,
  NotificationReferenceType,
  fetchUnreadCount,
  subscribeToNotifications,
  addNotificationChangeListener,
} from './src/lib/notifications';
import { getWhatsAppStatus } from './src/lib/whatsappClient';
import { getEffectiveContactLabels } from './src/lib/organizationTypes';
import { COLORS, AppIcon, AppIconProps, BACKGROUNDS, SHADOWS, ThemeProvider, useTheme, ThemePalette } from './src/theme';

// ==========================================
// TIPE & NAVIGASI
// ==========================================
export type NavKey =
  | 'dashboard'
  | 'chat'
  | 'users'
  | 'campaign'
  | 'bot'
  | 'team'
  | 'settings';

interface NavItem {
  key: NavKey;
  label: string;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'chat', label: 'Percakapan' },
  { key: 'users', label: 'Kontak' },
  { key: 'campaign', label: 'Kampanye' },
  { key: 'bot', label: 'Chatbot AI' },
  { key: 'team', label: 'Tim CS' },
  { key: 'settings', label: 'Pengaturan Organisasi' },
];

const DRAWER_GROUPS: { title: string; keys: NavKey[] }[] = [
  {
    title: 'MENU UTAMA',
    keys: ['dashboard', 'chat', 'users', 'campaign'],
  },
  {
    title: 'OTOMATISASI & TIM',
    keys: ['bot', 'team'],
  },
  {
    title: 'SISTEM & AKUN',
    keys: ['settings'],
  },
];

// ==========================================
// KOMPONEN EMPTY STATE PROFESIONAL
// Dirancang dengan tipografi bersih dan CTA yang relevan
// ==========================================
interface EmptyStateProps {
  iconName: AppIconProps['name'];
  title: string;
  description: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

function EmptyState({
  iconName,
  title,
  description,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.emptyStateContainer}>
      <View style={[styles.emptyStateIconCircle, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <AppIcon name={iconName} size={24} color={colors.accent} />
      </View>
      <Text style={[styles.emptyStateTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptyStateDescription, { color: colors.textSecondary }]}>{description}</Text>
      {(primaryActionLabel || secondaryActionLabel) && (
        <View style={styles.emptyStateActions}>
          {primaryActionLabel && (
            <TouchableOpacity
              style={styles.btnPrimary}
              activeOpacity={0.8}
              onPress={onPrimaryAction}
            >
              <Text style={styles.btnPrimaryText}>{primaryActionLabel}</Text>
            </TouchableOpacity>
          )}
          {secondaryActionLabel && (
            <TouchableOpacity
              style={styles.btnSecondary}
              activeOpacity={0.8}
              onPress={onSecondaryAction}
            >
              <Text style={styles.btnSecondaryText}>{secondaryActionLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ==========================================
// KOMPONEN KARTU METRIK DASHBOARD
// Angka terbaca jelas, label tegas, tanpa data palsu
// ==========================================
interface MetricCardProps {
  label: string;
  value: string;
  subtext: string;
  badgeText: string;
  iconName: AppIconProps['name'];
  isDesktop: boolean;
  isLoading?: boolean;
  isError?: boolean;
  accentColor?: string;
  accentBg?: string;
}

function MetricCard({
  label,
  value,
  subtext,
  badgeText,
  iconName,
  isDesktop,
  isLoading,
  isError,
  accentColor = COLORS.emerald,
  accentBg = COLORS.emeraldSubtle,
}: MetricCardProps) {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.metricCard, { width: isDesktop ? '23.5%' : '48%', backgroundColor: colors.surfaceCard, borderColor: colors.border }, isError && { borderColor: '#FECACA' }]}>
      <View style={styles.metricCardHeader}>
        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
        <View style={[styles.metricIconBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <AppIcon name={iconName} size={15} color={isError ? '#DC2626' : colors.textSecondary} />
        </View>
      </View>
      {isLoading ? (
        <View style={{ height: 32, justifyContent: 'center', alignItems: 'flex-start', marginVertical: 4 }}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : (
        <Text style={[styles.metricValue, { color: colors.textPrimary }, isError && { color: '#B91C1C' }]}>{value}</Text>
      )}
      <View style={styles.metricFooter}>
        <View style={[styles.metricBadge, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, isError && { backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2', borderColor: '#FECACA' }]}>
          <Text style={[styles.metricBadgeText, { color: isError ? '#B91C1C' : colors.textSecondary }]}>{badgeText}</Text>
        </View>
        <Text style={[styles.metricSubtext, { color: colors.textMuted }, isError && { color: '#DC2626' }]} numberOfLines={1}>
          {subtext}
        </Text>
      </View>
    </View>
  );
}

// ==========================================
// TAMPILAN HALAMAN: DASHBOARD
// ==========================================
export interface RecentActivityItem {
  id: string;
  name: string;
  phone: string;
  snippet: string;
  time: string;
  status: string;
}

function DashboardView({
  isDesktop,
  onNavigate,
  contactsCount = 0,
  messagesCount = 0,
  campaignsCount = 0,
  campaignStats,
  conversationsCount = 0,
  isLoading = false,
  campaigns = [],
  recentActivities = [],
  onSelectConversation,
  isGatewayConnected = false,
  gatewayPhone,
  error = null,
}: {
  isDesktop: boolean;
  onNavigate: (page: NavKey, tab?: SettingsTab) => void;
  contactsCount?: number;
  messagesCount?: number;
  campaignsCount?: number;
  campaignStats?: CampaignStats;
  conversationsCount?: number;
  isLoading?: boolean;
  campaigns?: Campaign[];
  recentActivities?: RecentActivityItem[];
  onSelectConversation?: (id: string) => void;
  isGatewayConnected?: boolean;
  gatewayPhone?: string;
  error?: string | null;
}) {
  const { isDark, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.pageContainer, { backgroundColor: colors.background }]}>
      {/* Kartu Status Koneksi WhatsApp Gateway */}
      <View style={[styles.gatewayCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <View style={styles.gatewayHeaderRow}>
          <View style={styles.gatewayTitleGroup}>
            <View style={styles.gatewayIconBox}>
              <AppIcon name="link" size={17} color={COLORS.emerald} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.gatewayTitle, { color: colors.textPrimary }]}>Status WhatsApp Gateway</Text>
              <Text style={[styles.gatewaySubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                Cloud API & Integrasi Pesan Otomatis
              </Text>
            </View>
          </View>
          {isGatewayConnected ? (
            <View style={styles.statusPillActive}>
              <View style={styles.statusDotActive} />
              <Text style={styles.statusPillTextActive}>Terhubung</Text>
            </View>
          ) : (
            <View style={styles.statusPillWarning}>
              <View style={styles.statusDotWarning} />
              <Text style={styles.statusPillTextWarning}>Belum Tertaut</Text>
            </View>
          )}
        </View>

        <Text style={[styles.gatewayDescription, { color: colors.textSecondary }]} numberOfLines={!isDesktop ? 2 : undefined}>
          {isGatewayConnected
            ? 'Gateway WhatsApp aktif dan terhubung. Pesan pelanggan masuk langsung ke basis data Supabase dan dijawab otomatis oleh Chatbot AI.'
            : 'Tautkan nomor WhatsApp resmi organisasi Anda untuk mengaktifkan kotak masuk percakapan, sinkronisasi kontak real-time, dan pengiriman siaran massal.'}
        </Text>

        <View style={[styles.gatewayMetaStrip, !isDesktop && styles.gatewayMetaStripMobile, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <View style={[styles.gatewayMetaItem, !isDesktop && styles.gatewayMetaItemMobile]}>
            <Text style={[styles.gatewayMetaLabel, { color: colors.textSecondary }]}>Nomor Tertaut</Text>
            <Text style={[styles.gatewayMetaVal, { color: colors.textPrimary }]} numberOfLines={1}>
              {isGatewayConnected && gatewayPhone ? gatewayPhone : '— (Belum Tertaut)'}
            </Text>
          </View>
          {isDesktop && <View style={[styles.gatewayMetaDivider, { backgroundColor: colors.border }]} />}
          <View style={[styles.gatewayMetaItem, !isDesktop && styles.gatewayMetaItemMobile]}>
            <Text style={[styles.gatewayMetaLabel, { color: colors.textSecondary }]}>Server Gateway</Text>
            <Text style={[styles.gatewayMetaVal, { color: colors.textPrimary }]} numberOfLines={1}>
              {isGatewayConnected ? 'ID-Jakarta (Aktif)' : 'Nonaktif'}
            </Text>
          </View>
          {isDesktop && <View style={[styles.gatewayMetaDivider, { backgroundColor: colors.border }]} />}
          <View style={[styles.gatewayMetaItem, !isDesktop && styles.gatewayMetaItemMobile]}>
            <Text style={[styles.gatewayMetaLabel, { color: colors.textSecondary }]}>Pesan Masuk</Text>
            <Text style={[styles.gatewayMetaVal, { color: colors.textPrimary }]} numberOfLines={1}>{isLoading ? '—' : error ? '— (Error)' : `${messagesCount} Pesan`}</Text>
          </View>
        </View>

        <View style={[styles.gatewayActionRow, !isDesktop && styles.gatewayActionRowMobile]}>
          <TouchableOpacity
            style={[styles.btnPrimary, !isDesktop && styles.gatewayBtnMobilePrimary]}
            activeOpacity={0.8}
            onPress={() => onNavigate('settings', 'gateway')}
          >
            <Text style={styles.btnPrimaryText}>{isGatewayConnected ? 'Kelola Gateway' : 'Tautkan WhatsApp'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnSecondary, !isDesktop && styles.gatewayBtnMobileSecondary]}
            activeOpacity={0.8}
            onPress={() => onNavigate('chat')}
          >
            <Text style={styles.btnSecondaryText}>Buka Percakapan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Ringkasan Metrik Kinerja dengan Ambient Glow Lembut */}
      <View style={styles.metricsAmbientSection}>
        <View style={styles.sectionTitleRow}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Ringkasan Metrik Bisnis</Text>
          <Text style={[styles.sectionSubtitleNote, { color: colors.textSecondary }]}>Periode 30 Hari Terakhir</Text>
        </View>

        {error && (
          <View style={{
            backgroundColor: '#FEF2F2',
            borderColor: '#FECACA',
            borderWidth: 1,
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <AppIcon name="alert" size={16} color="#DC2626" />
            <Text style={{ fontSize: 13, color: '#B91C1C', flex: 1 }}>
              Kendala sinkronisasi metrik bisnis: {error}
            </Text>
          </View>
        )}

        <View style={styles.metricsGrid}>
          <MetricCard
            label="Total Kontak"
            value={isLoading ? "—" : error ? "—" : String(contactsCount)}
            subtext={
              isLoading
                ? "Menyinkronkan..."
                : error
                  ? "Gagal sinkron"
                  : contactsCount > 0
                    ? `${contactsCount} kontak`
                    : "0 kontak"
            }
            badgeText={isLoading ? "Memuat..." : error ? "Error" : contactsCount > 0 ? "Tersinkron" : "0 baru"}
            iconName="users"
            isDesktop={isDesktop}
            isLoading={isLoading}
            isError={Boolean(error)}
            accentColor="#0D9488"
            accentBg="#F0FDFA"
          />
          <MetricCard
            label="Pesan Masuk"
            value={isLoading ? "—" : error ? "—" : String(messagesCount)}
            subtext={
              isLoading
                ? "Menyinkronkan..."
                : error
                  ? "Gagal sinkron"
                  : messagesCount > 0
                    ? `${messagesCount} pesan`
                    : "0 pesan"
            }
            badgeText={isLoading ? "Memuat..." : error ? "Error" : messagesCount > 0 ? "Pelanggan" : "0 baru"}
            iconName="chat"
            isDesktop={isDesktop}
            isLoading={isLoading}
            isError={Boolean(error)}
            accentColor="#0284C7"
            accentBg="#F0F9FF"
          />
          <MetricCard
            label="Kampanye Aktif"
            value={isLoading ? "—" : error ? "—" : String(campaignStats ? campaignStats.active : campaignsCount)}
            subtext={
              isLoading
                ? "Menyinkronkan..."
                : error
                  ? "Gagal sinkron"
                  : campaignStats && campaignStats.active > 0
                    ? `${campaignStats.active} siaran`
                    : "0 siaran"
            }
            badgeText={
              isLoading
                ? "Memuat..."
                : error
                  ? "Error"
                  : campaignStats && campaignStats.running > 0
                    ? "Berjalan"
                    : campaignStats && campaignStats.scheduled > 0
                      ? "Terjadwal"
                      : campaignStats && campaignStats.total > 0
                        ? `${campaignStats.total} Total`
                        : "0 baru"
            }
            iconName="campaign"
            isDesktop={isDesktop}
            isLoading={isLoading}
            isError={Boolean(error)}
            accentColor="#D97706"
            accentBg="#FFFBEB"
          />
          <MetricCard
            label="Percakapan Terbuka"
            value={isLoading ? "—" : error ? "—" : String(conversationsCount)}
            subtext={
              isLoading
                ? "Menyinkronkan..."
                : error
                  ? "Gagal sinkron"
                  : conversationsCount > 0
                    ? `${conversationsCount} aktif`
                    : "Semua selesai"
            }
            badgeText={isLoading ? "Memuat..." : error ? "Error" : conversationsCount > 0 ? "Terbuka" : "Standby"}
            iconName="bot"
            isDesktop={isDesktop}
            isLoading={isLoading}
            isError={Boolean(error)}
            accentColor="#7C3AED"
            accentBg="#F5F3FF"
          />
        </View>
      </View>

      {/* Ringkasan Kampanye Eksekutif */}
      <View style={[styles.panelCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <View style={[styles.panelCardHeader, !isDesktop && styles.panelCardHeaderMobile]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
            <View style={[styles.campaignHeaderIcon, { backgroundColor: isDark ? 'rgba(66, 191, 176, 0.15)' : '#EAF6F0' }]}>
              <AppIcon name="campaign" size={16} color={isDark ? colors.accent : COLORS.forestDark} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.panelCardTitle, { color: colors.textPrimary }]}>Ringkasan Kampanye Eksekutif</Text>
              <Text style={[styles.panelCardSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                Status Siaran WhatsApp Massal & Kampanye Terjadwal
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.btnSecondary, !isDesktop && { alignSelf: 'flex-start' }]}
            activeOpacity={0.8}
            onPress={() => onNavigate('campaign')}
          >
            <Text style={styles.btnSecondaryText}>Buka Manajemen Kampanye →</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>
              Menyinkronkan data kampanye organisasi...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.campaignErrorCard}>
            <AppIcon name="alert" size={18} color={colors.dangerText} />
            <Text style={{ fontSize: 13, color: colors.dangerText, flex: 1 }}>
              Gagal memuat status kampanye: {error}
            </Text>
          </View>
        ) : campaigns.length === 0 ? (
          <EmptyState
            iconName="campaign"
            title="Belum Ada Kampanye Siaran"
            description="Organisasi Anda belum membuat kampanye siaran pesan. Buat kampanye pertama untuk menjangkau kontak pelanggan dengan pesan terjadwal atau promosi instan."
            primaryActionLabel="+ Buat Kampanye Pertama"
            onPrimaryAction={() => onNavigate('campaign')}
          />
        ) : (
          <View style={{ gap: 14 }}>
            {/* KPI Strip */}
            <View style={[styles.campaignKpiStrip, !isDesktop && styles.campaignKpiStripMobile]}>
              <View style={[styles.campaignKpiItem, !isDesktop && styles.campaignKpiItemMobile]}>
                <Text style={styles.campaignKpiLabel}>Total Kampanye</Text>
                <Text style={styles.campaignKpiVal}>{campaignStats?.total ?? campaigns.length}</Text>
              </View>
              {isDesktop && <View style={styles.campaignKpiDivider} />}
              <View style={[styles.campaignKpiItem, !isDesktop && styles.campaignKpiItemMobile]}>
                <Text style={styles.campaignKpiLabel}>Siaran Terjadwal</Text>
                <Text style={[styles.campaignKpiVal, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>{campaignStats?.scheduled ?? 0}</Text>
              </View>
              {isDesktop && <View style={styles.campaignKpiDivider} />}
              <View style={[styles.campaignKpiItem, !isDesktop && styles.campaignKpiItemMobile]}>
                <Text style={styles.campaignKpiLabel}>Sedang Berjalan</Text>
                <Text style={[styles.campaignKpiVal, { color: isDark ? '#F59E0B' : '#B45309' }]}>{campaignStats?.running ?? 0}</Text>
              </View>
              {isDesktop && <View style={styles.campaignKpiDivider} />}
              <View style={[styles.campaignKpiItem, !isDesktop && styles.campaignKpiItemMobile]}>
                <Text style={styles.campaignKpiLabel}>Selesai Dikirim</Text>
                <Text style={[styles.campaignKpiVal, { color: isDark ? '#34D399' : '#047857' }]}>{campaignStats?.completed ?? 0}</Text>
              </View>
              {isDesktop && <View style={styles.campaignKpiDivider} />}
              <View style={[styles.campaignKpiItem, !isDesktop && styles.campaignKpiItemMobile]}>
                <Text style={styles.campaignKpiLabel}>Draf Disimpan</Text>
                <Text style={[styles.campaignKpiVal, { color: isDark ? colors.textMuted : '#64748B' }]}>{campaignStats?.draft ?? 0}</Text>
              </View>
            </View>

            {/* List 4 Kampanye Terbaru */}
            <View style={{ gap: 8 }}>
              {campaigns.slice(0, 4).map((cmp) => (
                <TouchableOpacity
                  key={cmp.id}
                  style={styles.recentCampaignRow}
                  activeOpacity={0.7}
                  onPress={() => onNavigate('campaign')}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Text style={styles.recentCampaignName} numberOfLines={1}>{cmp.name}</Text>
                      <CampaignStatusBadge status={cmp.status} />
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <Text style={styles.recentCampaignMeta}>
                        Penerima: {cmp.totalRecipients || 0} kontak
                        {cmp.targetSegment && cmp.targetSegment !== 'all' ? ` (${cmp.targetSegment})` : ''}
                      </Text>
                      <Text style={styles.recentCampaignDot}>•</Text>
                      <Text style={styles.recentCampaignMeta}>
                        {cmp.scheduledAt ? `Jadwal: ${cmp.scheduledAt}` : cmp.createdAt ? `Dibuat: ${cmp.createdAt}` : 'Baru'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recentCampaignAction}>
                    <Text style={styles.recentCampaignActionText}>Lihat →</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Kolom 2 Bagian: Aktivitas Terbaru & Checklist Integrasi */}
      <View style={[styles.dualColumnGrid, !isDesktop && styles.columnStacked]}>
        {/* Kolom Kiri: Log Aktivitas Terbaru */}
        <View style={[styles.panelCard, { flex: isDesktop ? 1.4 : 1 }]}>
          <View style={styles.panelCardHeader}>
            <Text style={styles.panelCardTitle}>Log Aktivitas Terbaru</Text>
            <Text style={styles.panelCardBadge}>Real-time Event</Text>
          </View>
          {recentActivities.length === 0 ? (
            <EmptyState
              iconName="chat"
              title="Belum Ada Aktivitas Percakapan"
              description="Seluruh log interaksi pelanggan, respon bot AI, dan broadcast pesan siaran akan tercatat otomatis di sini setelah gateway terhubung."
              primaryActionLabel="Buka Pusat Percakapan"
              onPrimaryAction={() => onNavigate('chat')}
            />
          ) : (
            <View style={{ gap: 8, paddingVertical: 4 }}>
              {recentActivities.map((act) => (
                <TouchableOpacity
                  key={act.id}
                  style={styles.recentActivityItem}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (onSelectConversation) {
                      onSelectConversation(act.id);
                    }
                    onNavigate('chat');
                  }}
                >
                  <View style={styles.recentActivityAvatar}>
                    <Text style={styles.recentActivityAvatarText}>
                      {(act.name || 'WB').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={styles.recentActivityName} numberOfLines={1}>{act.name}</Text>
                      <Text style={styles.recentActivityTime}>{act.time}</Text>
                    </View>
                    <Text style={styles.recentActivitySnippet} numberOfLines={1}>{act.snippet}</Text>
                  </View>
                  <View style={styles.recentActivityStatus}>
                    <Text style={styles.recentActivityStatusText}>
                      {act.status === 'open' ? 'CS' : act.status === 'resolved' ? 'Selesai' : 'AI'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.btnViewAllActivities}
                activeOpacity={0.7}
                onPress={() => onNavigate('chat')}
              >
                <Text style={styles.btnViewAllActivitiesText}>Lihat Semua di Pusat Percakapan →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Kolom Kanan: Checklist Kesiapan Workspace */}
        <View style={[styles.panelCard, { flex: isDesktop ? 1 : undefined }]}>
          <View style={styles.panelCardHeader}>
            <Text style={styles.panelCardTitle}>Kesiapan Workspace</Text>
            <Text style={styles.panelProgressText}>2 / 5 Langkah (40%)</Text>
          </View>

          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: '40%' }]} />
          </View>

          <View style={styles.checklistList}>
            <View style={styles.checkItem}>
              <View style={styles.checkBadgeDone}>
                <AppIcon name="check" size={12} color={COLORS.emerald} />
              </View>
              <View style={styles.checkTextContainer}>
                <Text style={styles.checkItemTitleDone}>Akun Organisasi Dibuat</Text>
                <Text style={styles.checkItemDesc}>Workspace WABiz Enterprise aktif</Text>
              </View>
            </View>

            <View style={styles.checkItem}>
              <View style={styles.checkBadgeDone}>
                <AppIcon name="check" size={12} color={COLORS.emerald} />
              </View>
              <View style={styles.checkTextContainer}>
                <Text style={styles.checkItemTitleDone}>Konfigurasi Profil Organisasi</Text>
                <Text style={styles.checkItemDesc}>Identitas bisnis telah diverifikasi</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.checkItem}
              activeOpacity={0.7}
              onPress={() => onNavigate('settings', 'gateway')}
            >
              <View style={styles.checkBadgePending}>
                <View style={styles.pendingDot} />
              </View>
              <View style={styles.checkTextContainer}>
                <Text style={styles.checkItemTitlePending}>Tautkan Nomor WhatsApp Gateway</Text>
                <Text style={styles.checkItemDesc}>Dibutuhkan untuk menerima pesan</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.checkItem}>
              <View style={styles.checkBadgePending}>
                <View style={styles.pendingDot} />
              </View>
              <View style={styles.checkTextContainer}>
                <Text style={styles.checkItemTitlePending}>Impor Basis Data Kontak</Text>
                <Text style={styles.checkItemDesc}>Tambahkan audiens pelanggan Anda</Text>
              </View>
            </View>

            <View style={styles.checkItem}>
              <View style={styles.checkBadgePending}>
                <View style={styles.pendingDot} />
              </View>
              <View style={styles.checkTextContainer}>
                <Text style={styles.checkItemTitlePending}>Uji Coba Asisten AI & Agen CS</Text>
                <Text style={styles.checkItemDesc}>Atur template respon pintar</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.btnSecondary, { marginTop: 14 }]}
            activeOpacity={0.8}
            onPress={() => onNavigate('settings')}
          >
            <Text style={styles.btnSecondaryText}>Selesaikan Konfigurasi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}










// ==========================================
// KOMPONEN UTAMA APLIKASI
// ==========================================
function AppContent() {
  const { isDark, colors, themeMode, setThemeMode, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  // Supabase Auth & Organization State
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'admin' | 'member' | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isOrgLoading, setIsOrgLoading] = useState(false);
  const [hasOrganization, setHasOrganization] = useState<boolean | null>(null);
  const [currentOrg, setCurrentOrg] = useState<{ id: string; name: string } | null>(null);

  // Navigasi & UI State
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [isGlobalSearchFocused, setIsGlobalSearchFocused] = useState(false);

  // Web CSS Injection: Hilangkan outline hitam browser secara universal dan terapkan focus ring WABiz Teal
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'wabiz-enterprise-inputs';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          html, body, #root, [data-testid="root"] {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
          }
          *, *::before, *::after {
            box-sizing: border-box;
          }
          input, textarea, select {
            outline: none !important;
            outline-style: none !important;
            outline-width: 0 !important;
            -webkit-tap-highlight-color: transparent !important;
          }
          input:focus, textarea:focus, select:focus {
            outline: none !important;
            outline-style: none !important;
            outline-width: 0 !important;
          }
          input:not([data-embedded="true"]):focus,
          textarea:focus {
            border-color: #0D9488 !important;
            box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15) !important;
            transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out !important;
          }
          input[data-embedded="true"]:focus {
            border-color: transparent !important;
            box-shadow: none !important;
          }
          [data-input-container="true"]:focus-within,
          .wabiz-input-container:focus-within {
            border-color: #0D9488 !important;
            box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15) !important;
            transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out !important;
          }
        `;
        document.head.appendChild(style);
      }
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      RNStatusBar.setBarStyle(isDark ? 'light-content' : 'dark-content');
      if ('setBackgroundColor' in RNStatusBar && typeof (RNStatusBar as any).setBackgroundColor === 'function') {
        (RNStatusBar as any).setBackgroundColor(isDark ? '#000000' : '#FFFFFF', true);
      }
    }
  }, [isDark]);

  // Notifikasi In-App State
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);

  // Domain Model States (Organisasi Aktif)
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [orgProfile, setOrgProfile] = useState<OrgProfile>(DEFAULT_ORG_PROFILE);
  const effectiveContactLabels = useMemo(() => {
    return getEffectiveContactLabels(orgProfile.customLabels, orgProfile.institutionType);
  }, [orgProfile.customLabels, orgProfile.institutionType]);
  const [liveGatewayStatus, setLiveGatewayStatus] = useState<{
    isConnected: boolean;
    phoneNumber: string | null;
  }>({
    isConnected: false,
    phoneNumber: null,
  });
  const [dashboardMetrics, setDashboardMetrics] = useState({
    contactsCount: 0,
    messagesCount: 0,
    campaignsCount: 0,
    conversationsCount: 0,
    campaignStats: {
      total: 0,
      active: 0,
      running: 0,
      scheduled: 0,
      draft: 0,
      completed: 0,
      cancelled: 0,
    } as CampaignStats,
    isLoading: true,
    isLoaded: false,
    error: null as string | null,
    recentActivities: [] as RecentActivityItem[],
  });

  // Ref untuk mendeteksi pergantian user ID antar sesi
  const previousUserIdRef = useRef<string | null>(null);

  // Helper pembersihan seluruh state organisasi saat logout atau pergantian sesi akun
  const resetWorkspaceState = useCallback(() => {
    setHasOrganization(null);
    setCurrentOrg(null);
    setCurrentUserRole(null);
    setContacts([]);
    setConversations([]);
    setSelectedConversationId(null);
    setTeamMembers([]);
    setCampaigns([]);
    setOrgProfile(DEFAULT_ORG_PROFILE);
    setLiveGatewayStatus({ isConnected: false, phoneNumber: null });
    setDashboardMetrics({
      contactsCount: 0,
      messagesCount: 0,
      campaignsCount: 0,
      conversationsCount: 0,
      campaignStats: {
        total: 0,
        active: 0,
        running: 0,
        scheduled: 0,
        draft: 0,
        completed: 0,
        cancelled: 0,
      },
      isLoading: false,
      isLoaded: false,
      error: null,
      recentActivities: [],
    });
    setActiveNav('dashboard');
    setGlobalSearch('');
    setUnreadNotificationsCount(0);
    setIsNotificationsOpen(false);
  }, []);

  // Notifikasi In-App: Hitung badge & refresh real-time
  const refreshUnreadNotifications = useCallback(async () => {
    if (!currentOrg?.id || !user?.id) {
      setUnreadNotificationsCount(0);
      return;
    }
    const count = await fetchUnreadCount(currentOrg.id, user.id);
    setUnreadNotificationsCount(count);
  }, [currentOrg?.id, user?.id]);

  useEffect(() => {
    if (!currentOrg?.id || !user?.id) return;
    void refreshUnreadNotifications();
    const unsubscribeRealtime = subscribeToNotifications(currentOrg.id, user.id, () => {
      void refreshUnreadNotifications();
    });
    const unsubscribeLocal = addNotificationChangeListener(() => {
      void refreshUnreadNotifications();
    });
    return () => {
      unsubscribeRealtime();
      unsubscribeLocal();
    };
  }, [currentOrg?.id, user?.id, refreshUnreadNotifications]);

  const handleNotificationNavigate = useCallback(
    (
      category: NotificationCategory,
      referenceId?: string | null
    ) => {
      switch (category) {
        case 'chat':
          setActiveNav('chat');
          if (referenceId) {
            setSelectedConversationId(referenceId);
          }
          break;
        case 'contact':
          setActiveNav('users');
          break;
        case 'campaign':
          setActiveNav('campaign');
          break;
        case 'team':
          setActiveNav('team');
          break;
        case 'system':
          setActiveNav('settings');
          break;
        default:
          break;
      }
      void refreshUnreadNotifications();
    },
    [refreshUnreadNotifications]
  );

  // Fetch metrik bisnis dashboard secara nyata dari Supabase
  const fetchDashboardMetrics = useCallback(async (orgId?: string) => {
    const targetOrgId = orgId || currentOrg?.id;
    if (!targetOrgId) {
      setDashboardMetrics((prev) => ({
        ...prev,
        isLoading: false,
        isLoaded: true,
      }));
      return;
    }

    try {
      // 1. Total Kontak (Tersimpan di tabel contacts pada organisasi aktif)
      const { count: contactsCount, error: contactsErr } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', targetOrgId);

      if (contactsErr) throw contactsErr;

      // 2. Pesan Masuk (HANYA pesan masuk dari pelanggan / inbound: sender_type = 'customer')
      const { count: messagesCount, error: messagesErr } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', targetOrgId)
        .eq('sender_type', 'customer');

      if (messagesErr) throw messagesErr;

      // 3. Kampanye: muat seluruh data kampanye organisasi untuk Dashboard & Modul Kampanye
      const { data: campaignRows, error: campaignsErr } = await supabase
        .from('campaigns')
        .select('id, organization_id, name, message_body, status, scheduled_at, sent_at, created_at, updated_at, sender_phone, total_recipients, sent_count, failed_count, skipped_count, target_segment')
        .eq('organization_id', targetOrgId)
        .order('created_at', { ascending: false });

      if (campaignsErr) throw campaignsErr;

      let fetchedCampaigns: Campaign[] = [];
      if (campaignRows) {
        fetchedCampaigns = campaignRows.map(mapCampaignFromDb);
        setCampaigns(fetchedCampaigns);
      }

      const campaignStats = calculateCampaignStats(fetchedCampaigns, targetOrgId);

      // 4. Percakapan Terbuka (HANYA percakapan dengan status aktif/terbuka: status = 'open')
      const { count: openConversationsCount, error: convErr } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', targetOrgId)
        .eq('status', 'open');

      if (convErr) throw convErr;

      // 5. Aktivitas Terbaru (4 percakapan terakhir untuk log ringkas di dashboard)
      const { data: convData, error: recentErr } = await supabase
        .from('conversations')
        .select(`
          id,
          status,
          last_message_at,
          contacts ( name, phone )
        `)
        .eq('organization_id', targetOrgId)
        .order('last_message_at', { ascending: false })
        .limit(4);

      if (recentErr) throw recentErr;

      let activities: RecentActivityItem[] = [];
      if (convData && convData.length > 0) {
        const convIds = convData.map((c) => c.id);
        const { data: recentMsgs } = await supabase
          .from('messages')
          .select('conversation_id, body, created_at')
          .in('conversation_id', convIds)
          .eq('organization_id', targetOrgId)
          .order('created_at', { ascending: false });

        const latestMsgMap: Record<string, { body: string; created_at: string }> = {};
        if (recentMsgs) {
          for (const m of recentMsgs) {
            if (!latestMsgMap[m.conversation_id]) {
              latestMsgMap[m.conversation_id] = { body: m.body, created_at: m.created_at };
            }
          }
        }

        activities = convData.map((row) => {
          const contactObj = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
          const name = contactObj?.name || 'Kontak Tanpa Nama';
          const phone = contactObj?.phone || '-';
          const latestMsg = latestMsgMap[row.id];
          const time = latestMsg?.created_at
            ? new Date(latestMsg.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            : row.last_message_at
              ? new Date(row.last_message_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : '';

          return {
            id: row.id,
            name,
            phone,
            snippet: latestMsg?.body || 'Belum ada pesan',
            time,
            status: row.status || 'open',
          };
        });
      }

      // 6. Sinkronisasi status riil koneksi WhatsApp Gateway dari worker
      try {
        const waRes = await getWhatsAppStatus();
        if (waRes.success && waRes.data && waRes.data.status === 'connected') {
          setLiveGatewayStatus({
            isConnected: true,
            phoneNumber: waRes.data.phoneNumber || null,
          });
        } else {
          setLiveGatewayStatus({
            isConnected: false,
            phoneNumber: null,
          });
        }
      } catch {
        setLiveGatewayStatus({
          isConnected: false,
          phoneNumber: null,
        });
      }

      setDashboardMetrics({
        contactsCount: contactsCount || 0,
        messagesCount: messagesCount || 0,
        campaignsCount: campaignStats.active,
        campaignStats,
        conversationsCount: openConversationsCount || 0,
        recentActivities: activities,
        isLoading: false,
        isLoaded: true,
        error: null,
      });
    } catch (e: any) {
      console.error('Error fetching dashboard metrics:', e);
      setDashboardMetrics((prev) => ({
        ...prev,
        isLoading: false,
        error: e?.message || 'Gagal memuat metrik',
      }));
    }
  }, [currentOrg?.id]);

  // Sinkronisasi metrik dashboard: Polling berkala + Supabase Realtime seketika
  useEffect(() => {
    if (!currentOrg?.id) return;
    void fetchDashboardMetrics(currentOrg.id);

    // Supabase Realtime Channel untuk sinkronisasi metrik seketika (messages, conversations, contacts)
    const channel = supabase
      .channel(`realtime_dashboard_metrics_${currentOrg.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `organization_id=eq.${currentOrg.id}`,
        },
        () => {
          void fetchDashboardMetrics(currentOrg.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `organization_id=eq.${currentOrg.id}`,
        },
        () => {
          void fetchDashboardMetrics(currentOrg.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contacts',
          filter: `organization_id=eq.${currentOrg.id}`,
        },
        () => {
          void fetchDashboardMetrics(currentOrg.id);
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      void fetchDashboardMetrics(currentOrg.id);
    }, 5000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [currentOrg?.id, fetchDashboardMetrics]);

  // Handler sinkronisasi instan saat percakapan dihapus di modul Percakapan
  const handleConversationDeleted = useCallback(
    (deletedConv: Conversation) => {
      // 1. Optimistic update jika messages tersimpan di in-memory state percakapan
      const customerMsgsCount = deletedConv.messages
        ? deletedConv.messages.filter((m) => m.sender === 'customer').length
        : 0;

      if (customerMsgsCount > 0) {
        setDashboardMetrics((prev) => ({
          ...prev,
          messagesCount: Math.max(0, prev.messagesCount - customerMsgsCount),
        }));
      }

      // 2. Refresh metrik secara instan dari database untuk memastikan akurasi data kanonikal
      if (currentOrg?.id) {
        void fetchDashboardMetrics(currentOrg.id);
      }
    },
    [currentOrg?.id, fetchDashboardMetrics]
  );

  // Handler sinkronisasi instan saat status percakapan atau pesan diperbarui
  const handleConversationUpdated = useCallback(() => {
    if (currentOrg?.id) {
      void fetchDashboardMetrics(currentOrg.id);
    }
  }, [currentOrg?.id, fetchDashboardMetrics]);

  // Metrik Reaktif: Menggabungkan state in-memory yang aktif dengan persistensi Supabase
  const effectiveContactsCount = useMemo(() => {
    if (contacts.length > 0) {
      const relevant = currentOrg?.id ? contacts.filter((c) => !c.isDemo) : contacts;
      const uniquePhones = new Set(relevant.map((c) => normalizePhoneNumber(c.phone)));
      return uniquePhones.size;
    }
    return dashboardMetrics.contactsCount;
  }, [contacts, currentOrg?.id, dashboardMetrics.contactsCount]);

  const effectiveConversationsCount = useMemo(() => {
    if (conversations.length > 0) {
      const relevant = currentOrg?.id ? conversations.filter((c) => !c.isDemo) : conversations;
      return relevant.filter((c) => c.status === 'open').length;
    }
    return dashboardMetrics.conversationsCount;
  }, [conversations, currentOrg?.id, dashboardMetrics.conversationsCount]);

  const effectiveCampaignStats = useMemo(() => {
    if (campaigns.length > 0) {
      return calculateCampaignStats(campaigns, currentOrg?.id);
    }
    return dashboardMetrics.campaignStats;
  }, [campaigns, currentOrg?.id, dashboardMetrics.campaignStats]);

  const effectiveCampaignsCount = effectiveCampaignStats.active;

  // Filter kampanye aman untuk Dashboard Eksekutif (isolasi tenant & pemisahan data demo)
  const dashboardCampaigns = useMemo(() => {
    if (currentOrg?.id) {
      return campaigns.filter((c) => !c.isDemo && (!c.organizationId || c.organizationId === currentOrg.id));
    }
    return campaigns;
  }, [campaigns, currentOrg?.id]);

  const effectiveMessagesCount = useMemo(() => {
    if (!currentOrg?.id) {
      return conversations.reduce(
        (sum, c) => sum + (c.messages ? c.messages.filter((m) => m.sender === 'customer').length : 0),
        0
      );
    }
    return dashboardMetrics.messagesCount;
  }, [conversations, currentOrg?.id, dashboardMetrics.messagesCount]);

  // Pengecekan organisasi pengguna di Supabase
  const checkUserOrganization = async (userId: string) => {
    setIsOrgLoading(true);
    try {
      // 1. Periksa relasi keanggotaan pengguna di organization_members
      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', userId);

      if (memberError) {
        console.error('Error fetching org membership:', memberError.message);
        setHasOrganization(false);
        setCurrentOrg(null);
        setCurrentUserRole(null);
      } else if (memberData && memberData.length > 0) {
        const orgId = memberData[0].organization_id;
        const role = (memberData[0].role as 'owner' | 'admin' | 'member') || 'member';
        setCurrentUserRole(role);
        // Ambil data organisasi dari tabel organizations
        const { data: orgData, error: orgError } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('id', orgId)
          .maybeSingle();

        if (orgError) {
          console.error('Error fetching organization info:', orgError.message);
        }

        setCurrentOrg(orgData || { id: orgId, name: 'Workspace WABiz' });
        setHasOrganization(true);

        // Muat data profil resmi institusi dari organization_profiles
        try {
          const { data: profData, error: profError } = await supabase
            .from('organization_profiles')
            .select('*')
            .eq('organization_id', orgId)
            .maybeSingle();

          if (!profError && profData) {
            setOrgProfile(mapDbToOrgProfile(profData, orgId));
          } else {
            setOrgProfile({
              ...DEFAULT_ORG_PROFILE,
              orgName: orgData?.name || DEFAULT_ORG_PROFILE.orgName,
              shortName: orgData?.name || DEFAULT_ORG_PROFILE.shortName,
              orgId,
            });
          }
        } catch (profErr) {
          console.error('Exception fetching organization profile in App.tsx:', profErr);
        }
      } else {
        setCurrentOrg(null);
        setHasOrganization(false);
      }
    } catch (err) {
      console.error('Exception fetching org membership:', err);
      setHasOrganization(false);
      setCurrentOrg(null);
    } finally {
      setIsOrgLoading(false);
    }
  };

  // Monitor status sesi Supabase Auth & status organisasi secara persisten
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsAuthLoading(false);
      return;
    }

    // 1. Ambil sesi awal dari storage
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        setSession(initialSession);
        const currentUser = initialSession?.user ?? null;
        setUser(currentUser);
        setIsAuthLoading(false);
        previousUserIdRef.current = currentUser?.id ?? null;
        if (currentUser) {
          void checkUserOrganization(currentUser.id);
        } else {
          resetWorkspaceState();
        }
      })
      .catch((err) => {
        console.warn('Gagal memuat sesi Supabase awal:', err);
        setIsAuthLoading(false);
      });

    // 2. Berlangganan perubahan status auth secara real-time
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);
      setIsAuthLoading(false);

      // Jika user keluar atau berganti akun, reset seluruh state tenant organisasi
      if (!currentUser || currentUser.id !== previousUserIdRef.current) {
        resetWorkspaceState();
      }
      previousUserIdRef.current = currentUser?.id ?? null;

      if (currentUser) {
        void checkUserOrganization(currentUser.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [resetWorkspaceState]);

  const handleLogout = async () => {
    resetWorkspaceState();
    setUser(null);
    setSession(null);
    previousUserIdRef.current = null;
    await supabase.auth.signOut();
  };

  // Info header dinamis berdasarkan menu aktif
  const currentNav = NAV_ITEMS.find((n) => n.key === activeNav) ?? NAV_ITEMS[0];

  const getPageMeta = (key: NavKey) => {
    switch (key) {
      case 'dashboard':
        return {
          title: 'Dashboard Eksekutif',
          subtitle: 'Ringkasan performa dan integrasi WhatsApp Business Anda',
        };
      case 'chat':
        return {
          title: 'Pusat Percakapan',
          subtitle: 'Kotak masuk pesan WhatsApp terpadu dan eskalasi otomatis',
        };
      case 'users':
        return {
          title: 'Direktori Kontak',
          subtitle: 'Manajemen basis data pelanggan, segmentasi, dan label',
        };
      case 'campaign':
        return {
          title: 'Manajemen Kampanye',
          subtitle: 'Kirim broadcast pesan massal dengan template WhatsApp resmi',
        };
      case 'bot':
        return {
          title: 'Chatbot AI & Otomatisasi',
          subtitle: 'Konfigurasi asisten virtual berbasis kecerdasan buatan',
        };
      case 'team':
        return {
          title: 'Tim Customer Service',
          subtitle: 'Alokasi agen pendukung dan pembagian antrean percakapan',
        };
      case 'settings':
        return {
          title: 'Pengaturan Organisasi',
          subtitle: 'Kredensial WhatsApp gateway, webhook, dan profil bisnis',
        };
    }
  };

  const pageMeta = getPageMeta(activeNav);

  const [settingsTab, setSettingsTab] = useState<SettingsTab>('identity');

  const handleNavSelect = (key: NavKey, tab?: SettingsTab) => {
    setActiveNav(key);
    if (key === 'settings') {
      setSettingsTab(tab ?? 'identity');
    }
    setIsMobileMenuOpen(false);
  };

  // 1. Tampilan Loading Sesi Awal atau Pengecekan Organisasi
  if (isAuthLoading || (user && isOrgLoading && hasOrganization === null)) {
    return (
      <SafeAreaView style={[styles.appRoot, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={{ alignItems: 'center', gap: 14 }}>
          <Image
            source={require('./assets/icon.png')}
            style={{ width: 80, height: 80, borderRadius: 18 }}
            resizeMode="contain"
            accessibilityLabel="WABiz"
          />
          <ActivityIndicator size="large" color={COLORS.emerald} />
          <Text style={{ color: '#9FB2A9', fontSize: 13, fontWeight: '500' }}>
            {isAuthLoading ? 'Memuat sesi WABiz...' : 'Memverifikasi organisasi workspace...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // 2. Tampilan Login / Register bila belum terautentikasi
  if (!session || !user) {
    return (
      <SafeAreaView style={[styles.appRoot, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <AuthView />
      </SafeAreaView>
    );
  }

  // 3. Tampilan Onboarding Organisasi Pertama bila pengguna belum terhubung ke organisasi
  if (hasOrganization === false) {
    return (
      <SafeAreaView style={[styles.appRoot, { backgroundColor: colors.background }]}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <OnboardingView
          onOrganizationCreated={() => checkUserOrganization(user.id)}
          onLogout={handleLogout}
        />
      </SafeAreaView>
    );
  }

  // Nama & inisial pengguna terautentikasi
  const userFullName =
    (user.user_metadata?.full_name as string) ||
    user.email?.split('@')[0] ||
    'Pengguna WABiz';

  const userInitials =
    userFullName
      .split(/\s+/)
      .filter(Boolean)
      .map((n: string) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'WB';

  const dynamicNavItems = NAV_ITEMS.map((item) => {
    if (item.key === 'chat') {
      const activeCount = effectiveConversationsCount;
      return {
        ...item,
        badge: activeCount > 0 ? String(activeCount) : undefined,
      };
    }
    return item;
  });

  return (
    <SafeAreaView style={[styles.appRoot, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* STRUKTUR UTAMA: SIDEBAR DESKTOP + MAIN AREA */}
      <View style={[styles.layoutWrapper, { backgroundColor: colors.background }]}>
        {/* SIDEBAR DESKTOP (Tampil pada layar >= 1024px) */}
        {isDesktop && (
          <View style={[styles.desktopSidebar, { backgroundColor: colors.sidebarBg, borderRightColor: colors.border }]}>
            {/* Logo WABiz Enterprise */}
            <View style={styles.sidebarHeader}>
              <View style={styles.brandBox}>
                <Image
                  source={require('./assets/icon.png')}
                  style={styles.officialBrandLogoSidebar}
                  resizeMode="contain"
                  accessibilityLabel="WABiz"
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.brandTitleRow}>
                    <Text style={styles.brandTitle}>WABiz</Text>
                    <View style={styles.brandTierBadge}>
                      <Text style={styles.brandTierText}>B2B SAAS</Text>
                    </View>
                  </View>
                  <Text style={styles.brandWorkspace} numberOfLines={1}>{currentOrg?.name || 'Workspace WABiz'}</Text>
                  {currentUserRole && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <View
                        style={{
                          backgroundColor:
                            currentUserRole === 'owner'
                              ? '#1e3a8a'
                              : currentUserRole === 'admin'
                                ? '#065f46'
                                : '#374151',
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                          borderRadius: 4,
                        }}
                      >
                        <Text style={{ color: '#e5e7eb', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
                          {currentUserRole === 'member' ? 'PETUGAS CS' : currentUserRole}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Menu Navigasi Utama */}
            <View style={styles.sidebarNavList}>
              <Text style={styles.sidebarSectionHeading}>MENU UTAMA</Text>
              {dynamicNavItems.map((item) => {
                const isActive = activeNav === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.sidebarNavItem, isActive && styles.sidebarNavItemActive]}
                    activeOpacity={0.7}
                    onPress={() => handleNavSelect(item.key)}
                    accessibilityLabel={`Menu Navigasi ${item.label}`}
                  >
                    <View style={styles.sidebarNavIconWrapper}>
                      <AppIcon
                        name={item.key as AppIconProps['name']}
                        size={17}
                        color={isActive ? COLORS.emerald : '#9FB2A9'}
                      />
                    </View>
                    <Text
                      style={[styles.sidebarNavLabel, isActive && styles.sidebarNavLabelActive]}
                    >
                      {item.label}
                    </Text>
                    {item.badge && (
                      <View style={styles.sidebarBadge}>
                        <Text style={styles.sidebarBadgeText}>{item.badge}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Footer Sidebar: Status Gateway & Profil Pengguna */}
            <View style={styles.sidebarFooter}>
              <TouchableOpacity
                style={styles.sidebarGatewayStatusBox}
                activeOpacity={0.7}
                onPress={() => handleNavSelect('settings', 'gateway')}
              >
                <View style={styles.sidebarGatewayHeader}>
                  <View style={styles.statusDotWarning} />
                  <Text style={styles.sidebarGatewayStatusTitle}>Gateway Belum Aktif</Text>
                </View>
                <Text style={styles.sidebarGatewayStatusDesc}>
                  Tautkan nomor WhatsApp untuk memulai sinkronisasi pesan
                </Text>
              </TouchableOpacity>

              <View style={styles.sidebarUserProfile}>
                <View style={styles.sidebarAvatarCircle}>
                  <Text style={styles.sidebarAvatarText}>{userInitials}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sidebarUserName} numberOfLines={2}>
                    {userFullName}
                  </Text>
                  <Text style={styles.sidebarUserRole} numberOfLines={1} ellipsizeMode="middle">
                    {user.email}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.sidebarLogoutBtn}
                  activeOpacity={0.7}
                  onPress={handleLogout}
                  accessibilityLabel="Keluar dari akun"
                >
                  <AppIcon name="log-out" size={14} color="#9FB2A9" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* AREA KONTEN UTAMA */}
        <View style={[styles.mainContentArea, { backgroundColor: colors.background }]}>
          {/* HEADER UTAMA (Disembunyikan pada mobile saat membuka thread percakapan agar layar penuh) */}
          {!( !isDesktop && activeNav === 'chat' && selectedConversationId !== null ) && (
            <View style={[styles.topHeader, !isDesktop && styles.topHeaderMobile, { backgroundColor: colors.headerBg, borderBottomColor: colors.border }]}>
            <View style={[styles.topHeaderLeft, !isDesktop && styles.topHeaderLeftMobile]}>
              {/* Tombol Hamburger Menu Pada Mobile */}
              {!isDesktop && (
                <TouchableOpacity
                  style={[styles.mobileMenuButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={() => setIsMobileMenuOpen(true)}
                  accessibilityLabel="Buka Menu Navigasi"
                  accessibilityRole="button"
                >
                  <AppIcon name="menu" size={18} color={colors.textPrimary} />
                </TouchableOpacity>
              )}

              <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                <Text
                  style={[styles.topHeaderTitle, !isDesktop && styles.topHeaderTitleMobile, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {pageMeta.title}
                </Text>
                {isDesktop && (
                  <Text
                    style={[styles.topHeaderSubtitle, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {pageMeta.subtitle}
                  </Text>
                )}
              </View>
            </View>

            <View style={[styles.topHeaderRight, !isDesktop && styles.topHeaderRightMobile]}>
              {/* Pencarian Cepat Pada Desktop */}
              {isDesktop && (
                <View
                  style={[
                    styles.topHeaderSearchBox,
                    { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                    isGlobalSearchFocused && styles.topHeaderSearchBoxFocused,
                  ]}
                  // @ts-ignore
                  dataSet={{ inputContainer: 'true' }}
                >
                  <AppIcon
                    name="search"
                    size={15}
                    color={isGlobalSearchFocused ? COLORS.teal : colors.textSecondary}
                  />
                  <TextInput
                    style={[styles.topHeaderSearchInput, { color: colors.textPrimary }]}
                    placeholder="Pencarian cepat (Ctrl+K)..."
                    placeholderTextColor={colors.textPlaceholder}
                    value={globalSearch}
                    onChangeText={setGlobalSearch}
                    onFocus={() => setIsGlobalSearchFocused(true)}
                    onBlur={() => setIsGlobalSearchFocused(false)}
                    // @ts-ignore
                    dataSet={{ embedded: 'true' }}
                  />
                </View>
              )}

              {/* 1. Tombol Notifikasi Bell (dengan badge jumlah belum dibaca) */}
              <TouchableOpacity
                style={[
                  styles.iconCircleButton,
                  !isDesktop && styles.iconCircleButtonMobile,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
                activeOpacity={0.7}
                onPress={() => setIsNotificationsOpen(true)}
                accessibilityLabel={`Notifikasi, ${unreadNotificationsCount} belum dibaca`}
                accessibilityRole="button"
              >
                <AppIcon name="bell" size={!isDesktop ? 15 : 17} color={colors.textPrimary} />
                {unreadNotificationsCount > 0 && (
                  <View style={styles.bellBadgePill}>
                    <Text style={styles.bellBadgeText}>
                      {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* 2. Tombol Toggle Light/Dark Mode (Sun / Moon) */}
              <TouchableOpacity
                style={[
                  styles.iconCircleButton,
                  !isDesktop && styles.iconCircleButtonMobile,
                  { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
                activeOpacity={0.7}
                onPress={toggleTheme}
                accessibilityLabel={isDark ? "Beralih ke Mode Terang" : "Beralih ke Mode Gelap"}
                accessibilityRole="button"
                // @ts-ignore
                title={isDark ? "Beralih ke Mode Terang" : "Beralih ke Mode Gelap"}
              >
                <AppIcon
                  name={isDark ? "sun" : "moon"}
                  size={!isDesktop ? 15 : 18}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>

              {/* 3. Identitas Akun Pengguna: Nama & Role OWNER */}
              {isDesktop ? (
                <View style={[styles.topProfilePill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={[styles.topAvatar, { backgroundColor: colors.isDark ? 'rgba(45, 212, 191, 0.2)' : COLORS.forestDark }]}>
                    <Text style={[styles.topAvatarText, { color: colors.isDark ? colors.accent : '#FFFFFF' }]}>{userInitials}</Text>
                  </View>
                  <View style={styles.topProfileTextGroup}>
                    <Text style={[styles.topProfileName, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="tail">
                      {userFullName}
                    </Text>
                    <Text style={[styles.topProfileRole, { color: colors.isDark ? colors.accent : COLORS.emerald }]} numberOfLines={1}>
                      {currentUserRole ? currentUserRole.toUpperCase() : 'USER'}
                    </Text>
                  </View>
                </View>
              ) : (
                /* Mobile Profile Pill: Sederhana (Hanya Tombol Avatar Bulat Tanpa Teks Nama/Role) agar Judul Halaman Lega */
                <TouchableOpacity
                  style={[
                    styles.topAvatarOnlyMobileBtn,
                    {
                      backgroundColor: colors.isDark ? 'rgba(45, 212, 191, 0.2)' : COLORS.forestDark,
                      borderColor: colors.border,
                    },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => setIsMobileMenuOpen(true)}
                  accessibilityLabel={`Profil ${userFullName}, peran ${currentUserRole || 'user'}, buka menu`}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.topAvatarText,
                      styles.topAvatarMobileText,
                      { color: colors.isDark ? colors.accent : '#FFFFFF' },
                    ]}
                  >
                    {userInitials}
                  </Text>
                  <View style={styles.topAvatarOnlineDot} />
                </TouchableOpacity>
              )}

              {/* Tombol Keluar Sesi Pada Desktop */}
              {isDesktop && (
                <TouchableOpacity
                  style={[styles.iconCircleButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                  activeOpacity={0.7}
                  onPress={handleLogout}
                  accessibilityLabel="Keluar dari akun WABiz"
                  accessibilityRole="button"
                >
                  <AppIcon name="log-out" size={17} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          )}

          {/* KONTEN HALAMAN */}
          {activeNav === 'chat' ? (
            <View
              style={[
                styles.chatViewWrapper,
                !isDesktop && styles.chatViewWrapperMobile,
                !isDesktop && selectedConversationId !== null && styles.chatViewWrapperMobileDetail,
                { backgroundColor: colors.background }
              ]}
            >
              <ConversationsView
                organizationId={currentOrg?.id}
                currentUserId={user?.id}
                currentUserFullName={userFullName}
                contacts={contacts}
                conversations={conversations}
                setConversations={setConversations}
                selectedId={selectedConversationId}
                setSelectedId={setSelectedConversationId}
                isDesktop={isDesktop}
                onNavigate={handleNavSelect}
                onConversationDeleted={handleConversationDeleted}
                onConversationUpdated={handleConversationUpdated}
              />
            </View>
          ) : (
            <ScrollView
              style={[styles.scrollCanvas, { backgroundColor: colors.background }]}
              contentContainerStyle={[
                styles.scrollContentContainer,
                !isDesktop && styles.scrollContentMobile,
              ]}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {currentUserRole === 'member' && (activeNav === 'team' || activeNav === 'settings') && (
                <View
                  style={{
                    backgroundColor: '#1e293b',
                    borderColor: '#334155',
                    borderWidth: 1,
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <AppIcon name="alert" size={18} color="#f59e0b" />
                  <Text style={{ color: '#cbd5e1', fontSize: 13, flex: 1, lineHeight: 18 }}>
                    <Text style={{ fontWeight: '700', color: '#f59e0b' }}>Mode Petugas CS (Read Only): </Text>
                    Pengubahan profil organisasi dan anggota tim dibatasi untuk peran Admin atau Owner sesuai kebijakan keamanan server.
                  </Text>
                </View>
              )}
              {activeNav === 'dashboard' && (
                <DashboardView
                  isDesktop={isDesktop}
                  onNavigate={handleNavSelect}
                  contactsCount={effectiveContactsCount}
                  messagesCount={effectiveMessagesCount}
                  campaignsCount={effectiveCampaignsCount}
                  campaignStats={effectiveCampaignStats}
                  campaigns={dashboardCampaigns}
                  conversationsCount={effectiveConversationsCount}
                  isLoading={dashboardMetrics.isLoading && !dashboardMetrics.isLoaded}
                  error={dashboardMetrics.error}
                  recentActivities={dashboardMetrics.recentActivities}
                  onSelectConversation={(id) => setSelectedConversationId(id)}
                  isGatewayConnected={liveGatewayStatus.isConnected}
                  gatewayPhone={liveGatewayStatus.phoneNumber || undefined}
                />
              )}
              {activeNav === 'users' && (
                <ContactsView
                  organizationId={currentOrg?.id}
                  currentUserId={user?.id}
                  contacts={contacts}
                  setContacts={setContacts}
                  isDesktop={isDesktop}
                  onNavigate={handleNavSelect}
                  contactLabels={effectiveContactLabels}
                  institutionType={orgProfile.institutionType}
                  userRole={currentUserRole}
                  onLabelsUpdated={(newLabels) => {
                    setOrgProfile((prev) => ({ ...prev, customLabels: newLabels }));
                  }}
                />
              )}
              {activeNav === 'campaign' && (
                <CampaignsView
                  organizationId={currentOrg?.id}
                  currentUserId={user?.id}
                  campaigns={campaigns}
                  setCampaigns={setCampaigns}
                  contacts={contacts}
                  isDesktop={isDesktop}
                  onNavigate={handleNavSelect}
                  contactLabels={effectiveContactLabels}
                  institutionType={orgProfile.institutionType}
                  onCampaignUpdated={() => {
                    if (currentOrg?.id) {
                      void fetchDashboardMetrics(currentOrg.id);
                    }
                  }}
                />
              )}
              {activeNav === 'bot' && (
                <ChatbotView
                  organizationId={currentOrg?.id}
                  currentUserId={user?.id}
                  orgProfile={orgProfile}
                  setOrgProfile={setOrgProfile}
                  isDesktop={isDesktop}
                  onNavigate={handleNavSelect}
                />
              )}
              {activeNav === 'team' && (
                <TeamView
                  organizationId={currentOrg?.id}
                  currentUserId={user?.id}
                  currentUserRole={currentUserRole}
                  teamMembers={teamMembers}
                  setTeamMembers={setTeamMembers}
                  isDesktop={isDesktop}
                  onNavigate={handleNavSelect}
                />
              )}
              {activeNav === 'settings' && (
                <SettingsView
                  organizationId={currentOrg?.id}
                  currentUserId={user?.id}
                  orgProfile={orgProfile}
                  setOrgProfile={setOrgProfile}
                  isDesktop={isDesktop}
                  initialTab={settingsTab}
                  onNavigate={handleNavSelect}
                />
              )}
            </ScrollView>
          )}

          {/* NAVIGASI BAWAH UNTUK PERANGKAT MOBILE */}
          {!isDesktop && !(activeNav === 'chat' && selectedConversationId !== null) && (
            <View style={styles.mobileBottomNav}>
              {dynamicNavItems.slice(0, 4).map((item) => {
                const isActive = activeNav === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.mobileBottomNavItem}
                    activeOpacity={0.7}
                    onPress={() => handleNavSelect(item.key)}
                  >
                    <View style={[styles.mobileNavIconBox, isActive && styles.mobileNavIconBoxActive]}>
                      <AppIcon
                        name={item.key as AppIconProps['name']}
                        size={18}
                        color={isActive ? colors.accent : colors.textSecondary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.mobileBottomNavLabel,
                        { color: colors.textSecondary },
                        isActive && [styles.mobileBottomNavLabelActive, { color: colors.accent }],
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Menu 'Lainnya' untuk membuka Drawer pada Mobile */}
              <TouchableOpacity
                style={styles.mobileBottomNavItem}
                activeOpacity={0.7}
                onPress={() => setIsMobileMenuOpen(true)}
              >
                <View
                  style={[
                    styles.mobileNavIconBox,
                    (activeNav === 'bot' || activeNav === 'team' || activeNav === 'settings') &&
                    styles.mobileNavIconBoxActive,
                  ]}
                >
                  <AppIcon
                    name="settings"
                    size={18}
                    color={
                      activeNav === 'bot' || activeNav === 'team' || activeNav === 'settings'
                        ? colors.accent
                        : colors.textSecondary
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.mobileBottomNavLabel,
                    { color: colors.textSecondary },
                    (activeNav === 'bot' || activeNav === 'team' || activeNav === 'settings') &&
                    [styles.mobileBottomNavLabelActive, { color: colors.accent }],
                  ]}
                >
                  Lainnya
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* DRAWER SLIDEOVER PADA MOBILE (NAVY SAAS DENGAN HEADER HOLOGRAFIK) */}
      {!isDesktop && (
        <Modal
          visible={isMobileMenuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsMobileMenuOpen(false)}
        >
          <View style={styles.mobileDrawerOverlay}>
            <TouchableOpacity
              style={styles.mobileDrawerBackdrop}
              activeOpacity={1}
              onPress={() => setIsMobileMenuOpen(false)}
              accessibilityLabel="Tutup Navigasi Luar"
            />
            <View style={styles.mobileDrawerContent}>
            {/* 1. Header Identitas WABiz dengan Latar Holografik Biru-Teal */}
            <View style={styles.mobileDrawerHeader}>
              {/* Pancaran Cahaya Ambient Holografik */}
              <View style={styles.drawerHoloGlowCyan} />
              <View style={styles.drawerHoloGlowTeal} />

              {/* Gelombang Digital Melengkung */}
              <View style={styles.drawerHoloWaveRing1} />
              <View style={styles.drawerHoloWaveRing2} />

              {/* Partikel Bercahaya */}
              <View style={styles.drawerHoloParticle1} />
              <View style={styles.drawerHoloParticle2} />
              <View style={styles.drawerHoloParticle3} />

              {/* Konten Identitas: Logo Resmi, Brand, Org, Badge, dan Tombol Close */}
              <View style={styles.drawerBrandRow}>
                {/* Kotak Rounded dengan Latar Holografik & Logo Resmi */}
                <View style={styles.drawerLogoBadgeContainer}>
                  <Image
                    source={require('./assets/icon.png')}
                    style={styles.officialBrandLogoDrawer}
                    resizeMode="contain"
                    accessibilityLabel="WABiz"
                  />
                </View>

                {/* Brand WABiz, Badge B2B SAAS, Nama Organisasi, & Badge OWNER */}
                <View style={styles.drawerBrandInfo}>
                  <View style={styles.drawerBrandTitleRow}>
                    <Text style={styles.drawerBrandTitle}>WABiz</Text>
                    <View style={styles.drawerBrandTierBadge}>
                      <Text style={styles.drawerBrandTierText}>B2B SAAS</Text>
                    </View>
                  </View>
                  <View style={styles.drawerOrgRow}>
                    <Text style={styles.drawerBrandWorkspace} numberOfLines={1} ellipsizeMode="tail">
                      {currentOrg?.name || 'Workspace WABiz'}
                    </Text>
                    <View style={styles.drawerRoleBadge}>
                      <Text style={styles.drawerRoleBadgeText}>
                        {currentUserRole ? currentUserRole.toUpperCase() : 'OWNER'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Tombol Tutup Navigasi */}
                <TouchableOpacity
                  style={styles.drawerCloseBtn}
                  activeOpacity={0.7}
                  onPress={() => setIsMobileMenuOpen(false)}
                  accessibilityLabel="Tutup Menu Navigasi"
                >
                  <AppIcon name="close" size={14} color="#CBD5E1" />
                </TouchableOpacity>
              </View>
            </View>

            {/* 2. Menu Navigasi (Urutan Lengkap & Konsisten) */}
            <ScrollView
              style={styles.mobileDrawerNavList}
              contentContainerStyle={styles.mobileDrawerNavScrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <Text style={styles.drawerSectionHeading}>MENU UTAMA</Text>
              {dynamicNavItems.map((item) => {
                const isActive = activeNav === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.drawerNavItem,
                      isActive && styles.drawerNavItemActive,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => {
                      handleNavSelect(item.key);
                      setIsMobileMenuOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Menu Navigasi ${item.label}`}
                  >
                    <View style={styles.drawerNavIconWrapper}>
                      <AppIcon
                        name={item.key as AppIconProps['name']}
                        size={17}
                        color={isActive ? '#2DD4BF' : '#94A3B8'}
                      />
                    </View>
                    <Text
                      style={[
                        styles.drawerNavLabel,
                        isActive && styles.drawerNavLabelActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.badge && (
                      <View style={styles.drawerItemBadge}>
                        <Text style={styles.drawerItemBadgeText}>{item.badge}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 3. Bagian Bawah Sidebar: Status Gateway WhatsApp & Profil Pengguna */}
            <View style={styles.drawerFooter}>
              {/* Status WhatsApp Gateway */}
              <TouchableOpacity
                style={styles.drawerGatewayStatusBox}
                activeOpacity={0.7}
                onPress={() => {
                  setIsMobileMenuOpen(false);
                  handleNavSelect('settings', 'gateway');
                }}
                accessibilityLabel="Status WhatsApp Gateway"
              >
                <View style={styles.drawerGatewayHeader}>
                  <View
                    style={[
                      styles.drawerGatewayDot,
                      liveGatewayStatus.isConnected ? styles.drawerGatewayDotConnected : styles.drawerGatewayDotWarning,
                    ]}
                  />
                  <Text
                    style={[
                      styles.drawerGatewayTitle,
                      liveGatewayStatus.isConnected && styles.drawerGatewayTitleConnected,
                    ]}
                  >
                    {liveGatewayStatus.isConnected ? 'Gateway Terhubung' : 'Gateway Belum Aktif'}
                  </Text>
                </View>
                <Text style={styles.drawerGatewayDesc} numberOfLines={1}>
                  {liveGatewayStatus.isConnected
                    ? (liveGatewayStatus.phoneNumber ? `Nomor: ${liveGatewayStatus.phoneNumber}` : 'WhatsApp siap sinkronisasi pesan')
                    : 'Tautkan nomor WhatsApp untuk sinkronisasi pesan'}
                </Text>
              </TouchableOpacity>

              {/* Baris Profil Pengguna: Avatar, Nama, Email, & Tombol Logout */}
              <View style={styles.drawerUserProfileRow}>
                <View style={styles.drawerProfileAvatarBox}>
                  <Text style={styles.drawerProfileAvatarText}>{userInitials}</Text>
                  <View style={styles.drawerProfileOnlineDot} />
                </View>
                <View style={styles.drawerProfileInfo}>
                  <Text style={styles.drawerProfileName} numberOfLines={1} ellipsizeMode="tail">
                    {userFullName}
                  </Text>
                  <Text style={styles.drawerProfileEmail} numberOfLines={1} ellipsizeMode="middle">
                    {user?.email || 'user@wabiz.b2b'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.drawerLogoutBtn}
                  activeOpacity={0.75}
                  onPress={handleLogout}
                  accessibilityLabel="Keluar dari akun WABiz"
                >
                  <AppIcon name="log-out" size={15} color="#F87171" />
                </TouchableOpacity>
              </View>

              {/* Versi WABiz */}
              <View style={styles.drawerVersionRow}>
                <Text style={styles.drawerVersionText}>WABiz v2.4 • Enterprise B2B</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    )}

      {/* Modal Notifikasi */}
      <NotificationsModal
        visible={isNotificationsOpen}
        onClose={() => {
          setIsNotificationsOpen(false);
          void refreshUnreadNotifications();
        }}
        organizationId={currentOrg?.id}
        userId={user?.id}
        onNavigateToItem={handleNotificationNavigate}
        isDesktop={isDesktop}
      />
    </SafeAreaView>
  );
}

// ==========================================
// STYLING DETAIL B2B SAAS (PIXEL PERFECT)
// ==========================================
const createStyles = (colors: ThemePalette) => StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
  },
  layoutWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },

  // ----------------------------------------
  // SIDEBAR DESKTOP
  // ----------------------------------------
  desktopSidebar: {
    width: 256,
    backgroundColor: colors.sidebarBg,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  sidebarHeader: {
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  officialBrandLogoSidebar: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  brandTierBadge: {
    backgroundColor: 'rgba(22, 163, 106, 0.22)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 106, 0.4)',
  },
  brandTierText: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  brandWorkspace: {
    color: '#9FB2A9',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  sidebarNavList: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 18,
  },
  sidebarSectionHeading: {
    color: '#657B72',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  sidebarNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 3,
  },
  sidebarNavItemActive: {
    backgroundColor: 'rgba(13, 148, 136, 0.15)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.emerald,
  },
  sidebarNavIconWrapper: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sidebarNavLabel: {
    color: '#9FB2A9',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  sidebarNavLabelActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sidebarBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sidebarBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: 12,
  },
  sidebarGatewayStatusBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sidebarGatewayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  sidebarGatewayStatusTitle: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '600',
  },
  sidebarGatewayStatusDesc: {
    color: '#8A9E95',
    fontSize: 10,
    lineHeight: 14,
  },
  sidebarUserProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sidebarAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  sidebarUserName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  sidebarUserRole: {
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 2,
  },
  sidebarLogoutBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ----------------------------------------
  // AREA KONTEN UTAMA & HEADER ATAS
  // ----------------------------------------
  mainContentArea: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: colors.background,
  },
  topHeader: {
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px 0 rgba(16, 24, 40, 0.04)',
      },
      default: {
        elevation: 1,
      },
    }),
  },
  topHeaderMobile: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    paddingTop: (Platform.select<any>({
      web: 'max(36px, env(safe-area-inset-top, 36px))',
      default: 36,
    })),
    minHeight: 76,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
    minWidth: 0,
  },
  topHeaderLeftMobile: {
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  mobileMenuButton: {
    width: 32,
    height: 32,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 25,
  },
  topHeaderTitleMobile: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  topHeaderSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  topHeaderSubtitleMobile: {
    fontSize: 11,
    lineHeight: 15,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topHeaderRightMobile: {
    gap: 5,
    flexShrink: 0,
  },
  topHeaderSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    width: 220,
    height: 38,
  },
  topHeaderSearchBoxFocused: {
    borderColor: COLORS.teal,
    backgroundColor: colors.surfaceCard,
    ...Platform.select({
      web: {
        boxShadow: '0 0 0 3px rgba(13, 148, 136, 0.15)',
      },
    }),
  },
  topHeaderSearchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    marginLeft: 8,
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  iconCircleButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
    position: 'relative',
  },
  iconCircleButtonMobile: {
    width: 32,
    height: 32,
    borderRadius: 7,
  },
  bellNoticeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.emerald,
  },
  bellBadgePill: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderWidth: 1.5,
    borderColor: colors.isDark ? '#101010' : '#FFFFFF',
  },
  bellBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
  topProfilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    height: 38,
  },
  topProfilePillMobile: {
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 5,
    height: 32,
    maxWidth: 135,
    flexShrink: 0,
  },
  topAvatarOnlyMobileBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginLeft: 4,
  },
  topProfileTextGroup: {
    maxWidth: 130,
    minWidth: 0,
    justifyContent: 'center',
  },
  topProfileTextGroupMobile: {
    maxWidth: 95,
    minWidth: 0,
    flexShrink: 1,
  },
  topProfileName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 15,
  },
  topProfileNameMobile: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  topProfileRole: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.5,
    marginTop: 1,
    lineHeight: 11,
  },
  topProfileRoleMobile: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 0,
    lineHeight: 10,
  },
  topAvatar: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: colors.isDark ? 'rgba(45, 212, 191, 0.2)' : COLORS.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topAvatarMobile: {
    width: 20,
    height: 20,
    borderRadius: 5,
  },
  topAvatarText: {
    color: colors.isDark ? colors.accent : '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
  },
  topAvatarMobileText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  topAvatarOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    borderWidth: 1,
    borderColor: colors.isDark ? '#181818' : '#FFFFFF',
  },


  // ----------------------------------------
  // CANVAS SCROLL & PADDING
  // ----------------------------------------
  scrollCanvas: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContentContainer: {
    paddingHorizontal: 26,
    paddingTop: 22,
    paddingBottom: 40,
  },
  scrollContentMobile: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 88,
  },
  chatViewWrapper: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: colors.background,
  },
  chatViewWrapperMobile: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: colors.background,
    flex: 1,
    width: '100%',
    height: '100%',
  },
  chatViewWrapperMobileDetail: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    backgroundColor: colors.background,
    flex: 1,
    width: '100%',
    height: '100%',
  },
  pageContainer: {
    gap: 20,
  },
  metricsAmbientSection: {
    gap: 12,
  },

  // ----------------------------------------
  // KARTU STATUS GATEWAY WHATSAPP
  // ----------------------------------------
  gatewayCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(16, 24, 40, 0.05), 0 1px 2px -1px rgba(16, 24, 40, 0.03)',
      },
      default: {
        elevation: 2,
      },
    }),
  },
  gatewayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  gatewayTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  gatewayIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  gatewaySubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  gatewayDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  gatewayMetaStrip: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gatewayMetaStripMobile: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  gatewayMetaItem: {
    flexDirection: 'column',
    gap: 2,
  },
  gatewayMetaItemMobile: {
    flex: 1,
    minWidth: 80,
  },
  gatewayMetaLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  gatewayMetaVal: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  gatewayMetaDivider: {
    width: 1,
    height: 22,
    backgroundColor: COLORS.border,
  },
  gatewayActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gatewayActionRowMobile: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
  },
  gatewayBtnMobilePrimary: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayBtnMobileSecondary: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ----------------------------------------
  // STATUS BADGES & PILLS
  // ----------------------------------------
  statusPillWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  statusDotWarning: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.warningDot,
  },
  statusPillTextWarning: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.warningText,
  },
  statusPillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  statusDotActive: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.emerald,
  },
  statusPillTextActive: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // ----------------------------------------
  // METRIK GRID
  // ----------------------------------------
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionSubtitleNote: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  metricCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    justifyContent: 'space-between',
    minHeight: 112,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
      },
      default: {
        elevation: 2,
      },
    }),
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
    minWidth: 0,
  },
  metricIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginVertical: 4,
    letterSpacing: -0.5,
  },
  metricFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  metricBadge: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  metricSubtext: {
    fontSize: 11,
    color: colors.textMuted,
    flex: 1,
  },

  // ----------------------------------------
  // LAYOUT 2 KOLOM (DUAL COLUMN)
  // ----------------------------------------
  dualColumnGrid: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'stretch',
  },
  columnStacked: {
    flexDirection: 'column',
  },
  panelCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  },
  panelCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 12,
    flexWrap: 'wrap',
    gap: 10,
  },
  panelCardHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
  },
  panelCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  panelCardBadge: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  panelProgressText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.emerald,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginTop: -4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.emerald,
    borderRadius: 3,
  },
  checklistList: {
    gap: 10,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkBadgeDone: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkBadgePending: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  pendingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.textMuted,
  },
  checkTextContainer: {
    flex: 1,
  },
  checkItemTitleDone: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  checkItemTitlePending: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  checkItemDesc: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },

  // ----------------------------------------
  // EMPTY STATE DESAIN
  // ----------------------------------------
  emptyStateContainer: {
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  emptyStateIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyStateDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 440,
    marginBottom: 18,
  },
  emptyStateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },

  // ----------------------------------------
  // TOMBOL STANDAR B2B SAAS
  // ----------------------------------------
  btnPrimary: {
    backgroundColor: COLORS.emerald,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  btnSecondary: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },

  // ----------------------------------------
  // FILTER BAR & TABLE STYLES
  // ----------------------------------------
  tableFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  tableActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 7,
    paddingHorizontal: 12,
    height: 38,
    minWidth: 260,
    flex: 1,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    marginLeft: 8,
    paddingVertical: 0,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPillActive: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: COLORS.emerald,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterPillTextActive: {
    color: COLORS.emerald,
    fontSize: 12,
    fontWeight: '600',
  },
  filterPill: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterPillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  actionButtonsGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ----------------------------------------
  // KAMPANYE, BOT & TEAM KHUSUS
  // ----------------------------------------
  campaignStatsStrip: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceCard,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  campaignStatItem: {
    flex: 1,
    minWidth: 140,
  },
  campaignStatLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  campaignStatVal: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  campaignHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.isDark ? 'rgba(66, 191, 176, 0.15)' : '#EAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelCardSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  campaignErrorCard: {
    padding: 14,
    backgroundColor: colors.dangerBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  campaignKpiStrip: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  campaignKpiStripMobile: {
    padding: 10,
    gap: 10,
  },
  campaignKpiItem: {
    flex: 1,
    minWidth: 90,
    alignItems: 'center',
  },
  campaignKpiItemMobile: {
    minWidth: 80,
    backgroundColor: colors.surfaceCard,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  campaignKpiDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  campaignKpiLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  campaignKpiVal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  recentCampaignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceCard,
    gap: 10,
  },
  recentCampaignName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  recentCampaignMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  recentCampaignDot: {
    fontSize: 11,
    color: colors.textMuted,
  },
  recentCampaignAction: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: colors.surfaceSecondary,
  },
  recentCampaignActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  botConfigCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  },
  botConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 12,
  },
  botParamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  botParamItem: {
    flex: 1,
    minWidth: 160,
  },
  botParamLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  botParamVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  teamMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  memberInfo: {
    flex: 1,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  roleBadgeOwner: {
    backgroundColor: 'rgba(18, 60, 50, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeTextOwner: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  memberEmail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // ----------------------------------------
  // FORM & PENGATURAN
  // ----------------------------------------
  settingsForm: {
    gap: 14,
  },
  formRow: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  formGroup: {
    flex: 1,
    minWidth: 200,
    gap: 6,
  },
  formGroupFull: {
    width: '100%',
    gap: 6,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  formInputMock: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  formInputText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  formInputMono: {
    fontSize: 12,
    color: colors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },

  // ----------------------------------------
  // NAVIGASI MOBILE BAWAH (BOTTOM BAR)
  // ----------------------------------------
  mobileBottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.bottomNavBg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 4,
    paddingBottom: (Platform.select<any>({
      web: 'max(10px, env(safe-area-inset-bottom, 10px))',
      default: Platform.OS === 'ios' ? 24 : 10,
    })),
    justifyContent: 'space-around',
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: colors.isDark ? '0 -2px 10px rgba(0, 0, 0, 0.5)' : '0 -2px 10px rgba(15, 23, 42, 0.05)',
      },
      default: {
        elevation: 6,
      },
    }),
  },
  mobileBottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
    minHeight: 48,
  },
  mobileNavIconBox: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    marginBottom: 2,
  },
  mobileNavIconBoxActive: {
    backgroundColor: colors.accentSubtle,
  },
  mobileBottomNavLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  mobileBottomNavLabelActive: {
    color: colors.accent,
    fontWeight: '700',
  },

  // ----------------------------------------
  // DRAWER SLIDEOVER PADA MOBILE (NAVY SAAS DENGAN HEADER HOLOGRAFIK)
  // ----------------------------------------
  mobileDrawerOverlay: {
    position: (Platform.select({ web: 'fixed', default: 'absolute' }) as any),
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: (Platform.select({ web: '100vw', default: '100%' }) as any),
    height: (Platform.select({ web: '100dvh', default: '100%' }) as any),
    zIndex: 99999,
    flexDirection: 'row',
  },
  mobileDrawerBackdrop: {
    position: (Platform.select({ web: 'fixed', default: 'absolute' }) as any),
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    width: (Platform.select({ web: '100vw', default: '100%' }) as any),
    height: (Platform.select({ web: '100dvh', default: '100%' }) as any),
    zIndex: 99998,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  mobileDrawerContent: {
    width: '82%',
    maxWidth: 310,
    height: (Platform.select({ web: '100dvh', default: '100%' }) as any),
    backgroundColor: '#071426',
    borderRightWidth: 1,
    borderRightColor: 'rgba(45, 212, 191, 0.2)',
    flexDirection: 'column',
    zIndex: 99999,
    elevation: 25,
    ...Platform.select({
      web: {
        boxShadow: '4px 0 28px rgba(0, 0, 0, 0.75)',
      },
    }),
  },

  // Header Drawer dengan Elemen Holografik Biru-Teal
  mobileDrawerHeader: {
    flexShrink: 0,
    backgroundColor: '#08162B',
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(45, 212, 191, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingTop: (Platform.select<any>({
      web: 'max(36px, env(safe-area-inset-top, 36px))',
      default: 36,
    })),
  },
  drawerHoloGlowCyan: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(6, 182, 212, 0.18)',
  },
  drawerHoloGlowTeal: {
    position: 'absolute',
    bottom: -25,
    left: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(13, 148, 136, 0.22)',
  },
  drawerHoloWaveRing1: {
    position: 'absolute',
    right: -30,
    top: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.12)',
  },
  drawerHoloWaveRing2: {
    position: 'absolute',
    right: -55,
    top: -55,
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.06)',
  },
  drawerHoloParticle1: {
    position: 'absolute',
    top: 10,
    right: 48,
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#2DD4BF',
    opacity: 0.8,
  },
  drawerHoloParticle2: {
    position: 'absolute',
    bottom: 12,
    right: 38,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#38BDF8',
    opacity: 0.7,
  },
  drawerHoloParticle3: {
    position: 'absolute',
    top: 24,
    left: 20,
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: '#67E8F9',
    opacity: 0.5,
  },
  drawerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  drawerLogoBadgeContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(11, 23, 44, 0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(45, 212, 191, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 10px rgba(6, 182, 212, 0.3)',
      },
      default: {
        elevation: 4,
      },
    }),
  },
  officialBrandLogoDrawer: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  drawerBrandInfo: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  drawerBrandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  drawerBrandTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#FFFFFF',
  },
  drawerBrandTierBadge: {
    backgroundColor: 'rgba(20, 184, 166, 0.22)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.45)',
  },
  drawerBrandTierText: {
    color: '#2DD4BF',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  drawerOrgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  drawerBrandWorkspace: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  drawerRoleBadge: {
    backgroundColor: 'rgba(45, 212, 191, 0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.45)',
    flexShrink: 0,
  },
  drawerRoleBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#2DD4BF',
    letterSpacing: 0.5,
  },
  drawerCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // List Navigasi Drawer
  mobileDrawerNavList: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 10,
    ...Platform.select({
      web: {
        overflowY: 'auto' as any,
      },
    }),
  },
  mobileDrawerNavScrollContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  drawerSectionHeading: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#64748B',
    marginBottom: 6,
    marginTop: 6,
    paddingHorizontal: 10,
  },
  drawerNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 3,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  drawerNavItemActive: {
    backgroundColor: 'rgba(13, 148, 136, 0.2)',
    borderLeftWidth: 3,
    borderLeftColor: '#2DD4BF',
  },
  drawerActiveIndicator: {
    display: 'none',
  },
  drawerNavIconWrapper: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  drawerNavLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#CBD5E1',
    flex: 1,
  },
  drawerNavLabelActive: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  drawerItemBadge: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  drawerItemBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Footer Drawer: Selalu dipin di bagian bawah dengan flexShrink: 0
  drawerFooter: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(45, 212, 191, 0.15)',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: (Platform.select<any>({
      web: 'max(24px, env(safe-area-inset-bottom, 24px))',
      default: 24,
    })),
    backgroundColor: '#071426',
    gap: 10,
  },
  drawerGatewayStatusBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  drawerGatewayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  drawerGatewayDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.5,
  },
  drawerGatewayDotWarning: {
    backgroundColor: '#F59E0B',
  },
  drawerGatewayDotConnected: {
    backgroundColor: '#10B981',
  },
  drawerGatewayTitle: {
    color: '#FDE68A',
    fontSize: 10.5,
    fontWeight: '700',
  },
  drawerGatewayTitleConnected: {
    color: '#6EE7B7',
  },
  drawerGatewayDesc: {
    color: '#8A9E95',
    fontSize: 9.5,
    lineHeight: 13,
  },
  drawerUserProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  drawerProfileAvatarBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(45, 212, 191, 0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(45, 212, 191, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  drawerProfileAvatarText: {
    color: '#2DD4BF',
    fontWeight: '800',
    fontSize: 12.5,
  },
  drawerProfileOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#071426',
  },
  drawerProfileInfo: {
    flex: 1,
    minWidth: 0,
  },
  drawerProfileName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 16,
  },
  drawerProfileEmail: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  drawerLogoutBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerVersionRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  drawerVersionText: {
    fontSize: 9.5,
    fontWeight: '500',
    color: '#64748B',
  },
  // ----------------------------------------
  // LOG AKTIVITAS TERBARU DASHBOARD
  // ----------------------------------------
  recentActivityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  recentActivityAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentActivityAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  recentActivityName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  recentActivityTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
  recentActivitySnippet: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  recentActivityStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recentActivityStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.accent,
  },
  btnViewAllActivities: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnViewAllActivitiesText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },
});


export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
