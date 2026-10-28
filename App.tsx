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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
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

// ==========================================
// PALET WARNA B2B SAAS WABIZ
// ==========================================
const COLORS = {
  forestDark: '#123C32',      // Deep forest green untuk sidebar & brand utama
  forestHeader: '#0E3028',    // Sedikit lebih gelap untuk header sidebar
  emerald: '#16A36A',         // Emerald untuk aksen primer & CTA utama
  emeraldHover: '#0E7A4E',    // Emerald gelap untuk hover / pressed
  emeraldSubtle: '#EAF6F0',   // Aksen lembut hijau untuk badge aktif
  emeraldBorder: '#C1E6D3',   // Border halus untuk aksen hijau
  neutralBg: '#F5F7F6',       // Latar canvas netral profesional
  surface: '#FFFFFF',         // Kartu & panel putih bersih
  surfaceMuted: '#FAFCFB',    // Latar kartu sekunder
  border: '#E4EAE6',          // Border halus standar CRM
  borderStrong: '#CDD7D1',    // Border lebih tegas untuk fokus / input
  textDark: '#17231F',        // Teks gelap utama dengan kontras tinggi
  textSecondary: '#718078',   // Teks abu-abu untuk deskripsi & label
  textMuted: '#95A39C',       // Teks sangat redup untuk placeholder/sub-info
  warningBg: '#FFFBEB',       // Amber lembut untuk status belum terhubung
  warningBorder: '#FDE68A',   // Border amber
  warningText: '#B45309',     // Teks amber
  warningDot: '#F59E0B',      // Titik indikator amber
};

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

// ==========================================
// SISTEM IKON VEKTOR MANDIRI (MURNI REACT NATIVE)
// Hindari emoji, gunakan bentuk geometris presisi standar SaaS
// ==========================================
interface AppIconProps {
  name:
  | 'dashboard'
  | 'chat'
  | 'users'
  | 'campaign'
  | 'bot'
  | 'team'
  | 'settings'
  | 'search'
  | 'bell'
  | 'user'
  | 'chevron-right'
  | 'plus'
  | 'check'
  | 'alert'
  | 'link'
  | 'menu'
  | 'close'
  | 'log-out';
  size?: number;
  color?: string;
}

function AppIcon({ name, size = 18, color = COLORS.textSecondary }: AppIconProps) {
  switch (name) {
    case 'dashboard':
      return (
        <View style={{ width: size, height: size, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', height: size * 0.44 }}>
            <View style={{ width: size * 0.44, backgroundColor: color, borderRadius: 2 }} />
            <View style={{ width: size * 0.44, backgroundColor: color, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', height: size * 0.44 }}>
            <View style={{ width: size * 0.44, backgroundColor: color, borderRadius: 2 }} />
            <View style={{ width: size * 0.44, backgroundColor: color, borderRadius: 2 }} />
          </View>
        </View>
      );

    case 'chat':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.88,
              height: size * 0.72,
              borderRadius: size * 0.22,
              borderWidth: 1.6,
              borderColor: color,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', gap: 2 }}>
              <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color }} />
              <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color }} />
              <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color }} />
            </View>
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: 1,
              left: 3,
              width: 4,
              height: 4,
              borderLeftWidth: 1.6,
              borderBottomWidth: 1.6,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'users':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.36,
              height: size * 0.36,
              borderRadius: (size * 0.36) / 2,
              borderWidth: 1.6,
              borderColor: color,
              marginBottom: 1.5,
            }}
          />
          <View
            style={{
              width: size * 0.74,
              height: size * 0.36,
              borderTopLeftRadius: size * 0.36,
              borderTopRightRadius: size * 0.36,
              borderWidth: 1.6,
              borderColor: color,
            }}
          />
        </View>
      );

    case 'campaign':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.7,
              height: size * 0.52,
              borderWidth: 1.6,
              borderColor: color,
              borderTopRightRadius: size * 0.26,
              borderBottomRightRadius: size * 0.26,
              borderLeftWidth: 3,
            }}
          />
          <View
            style={{
              width: 2,
              height: 4,
              backgroundColor: color,
              position: 'absolute',
              bottom: 2,
              left: 4,
            }}
          />
        </View>
      );

    case 'bot':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 1.6, height: 3, backgroundColor: color, marginBottom: 1 }} />
          <View
            style={{
              width: size * 0.8,
              height: size * 0.58,
              borderRadius: 3,
              borderWidth: 1.6,
              borderColor: color,
              flexDirection: 'row',
              justifyContent: 'space-around',
              alignItems: 'center',
              paddingHorizontal: 2,
            }}
          >
            <View style={{ width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: color }} />
            <View style={{ width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'team':
      return (
        <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ position: 'absolute', left: 1, opacity: 0.55 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, borderWidth: 1.2, borderColor: color }} />
            <View style={{ width: 8, height: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderWidth: 1.2, borderColor: color }} />
          </View>
          <View style={{ position: 'absolute', right: 2 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, borderWidth: 1.4, borderColor: color }} />
            <View style={{ width: 11, height: 5, borderTopLeftRadius: 5, borderTopRightRadius: 5, borderWidth: 1.4, borderColor: color }} />
          </View>
        </View>
      );

    case 'settings':
      return (
        <View style={{ width: size, height: size, justifyContent: 'space-around', paddingVertical: 2 }}>
          <View style={{ height: 1.6, backgroundColor: color, position: 'relative' }}>
            <View style={{ position: 'absolute', left: 3, top: -2.2, width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
          </View>
          <View style={{ height: 1.6, backgroundColor: color, position: 'relative' }}>
            <View style={{ position: 'absolute', right: 3, top: -2.2, width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
          </View>
          <View style={{ height: 1.6, backgroundColor: color, position: 'relative' }}>
            <View style={{ position: 'absolute', left: 7, top: -2.2, width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'search':
      return (
        <View style={{ width: size, height: size }}>
          <View
            style={{
              width: size * 0.62,
              height: size * 0.62,
              borderRadius: (size * 0.62) / 2,
              borderWidth: 1.6,
              borderColor: color,
              top: 1,
              left: 1,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 1.8,
              height: size * 0.36,
              backgroundColor: color,
              transform: [{ rotate: '-45deg' }],
              borderRadius: 1,
            }}
          />
        </View>
      );

    case 'bell':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.65,
              height: size * 0.58,
              borderTopLeftRadius: size * 0.32,
              borderTopRightRadius: size * 0.32,
              borderWidth: 1.6,
              borderColor: color,
              borderBottomWidth: 0,
            }}
          />
          <View style={{ width: size * 0.84, height: 1.6, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ width: 3, height: 2, backgroundColor: color, borderBottomLeftRadius: 1.5, borderBottomRightRadius: 1.5, marginTop: 1 }} />
        </View>
      );

    case 'user':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.44,
              height: size * 0.44,
              borderRadius: (size * 0.44) / 2,
              borderWidth: 1.6,
              borderColor: color,
              marginBottom: 1,
            }}
          />
          <View
            style={{
              width: size * 0.8,
              height: size * 0.38,
              borderTopLeftRadius: size * 0.4,
              borderTopRightRadius: size * 0.4,
              borderWidth: 1.6,
              borderColor: color,
            }}
          />
        </View>
      );

    case 'chevron-right':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.35,
              height: size * 0.35,
              borderTopWidth: 1.8,
              borderRightWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'plus':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: size * 0.75, height: 1.8, backgroundColor: color }} />
          <View style={{ position: 'absolute', height: size * 0.75, width: 1.8, backgroundColor: color }} />
        </View>
      );

    case 'check':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.35,
              height: size * 0.65,
              borderBottomWidth: 1.8,
              borderRightWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
              marginTop: -2,
            }}
          />
        </View>
      );

    case 'alert':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.85,
              height: size * 0.85,
              borderRadius: (size * 0.85) / 2,
              borderWidth: 1.6,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: 1.8, height: size * 0.35, backgroundColor: color, borderRadius: 1, marginBottom: 2 }} />
            <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'link':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.65,
              height: size * 0.42,
              borderRadius: size * 0.2,
              borderWidth: 1.6,
              borderColor: color,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'menu':
      return (
        <View style={{ width: size, height: size, justifyContent: 'space-around', paddingVertical: 2 }}>
          <View style={{ height: 1.8, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ height: 1.8, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ height: 1.8, backgroundColor: color, borderRadius: 1 }} />
        </View>
      );

    case 'close':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: size * 0.8, height: 1.8, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
          <View style={{ position: 'absolute', width: size * 0.8, height: 1.8, backgroundColor: color, transform: [{ rotate: '-45deg' }] }} />
        </View>
      );

    case 'log-out':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              left: 1,
              width: size * 0.45,
              height: size * 0.8,
              borderWidth: 1.6,
              borderColor: color,
              borderRightWidth: 0,
              borderRadius: 2,
            }}
          />
          <View style={{ position: 'absolute', right: 2, width: size * 0.45, height: 1.6, backgroundColor: color }} />
          <View
            style={{
              position: 'absolute',
              right: 2,
              width: size * 0.25,
              height: size * 0.25,
              borderTopWidth: 1.6,
              borderRightWidth: 1.6,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    default:
      return <View style={{ width: size, height: size }} />;
  }
}

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
  return (
    <View style={styles.emptyStateContainer}>
      <View style={styles.emptyStateIconCircle}>
        <AppIcon name={iconName} size={24} color={COLORS.forestDark} />
      </View>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateDescription}>{description}</Text>
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
}

function MetricCard({ label, value, subtext, badgeText, iconName, isDesktop, isLoading, isError }: MetricCardProps) {
  return (
    <View style={[styles.metricCard, { width: isDesktop ? '23.5%' : '48%' }, isError && { borderColor: '#FECACA' }]}>
      <View style={styles.metricCardHeader}>
        <Text style={styles.metricLabel}>{label}</Text>
        <View style={[styles.metricIconBox, isError && { backgroundColor: '#FEE2E2' }]}>
          <AppIcon name={iconName} size={15} color={isError ? '#DC2626' : COLORS.forestDark} />
        </View>
      </View>
      {isLoading ? (
        <View style={{ height: 32, justifyContent: 'center', alignItems: 'flex-start', marginVertical: 4 }}>
          <ActivityIndicator size="small" color={COLORS.forestDark} />
        </View>
      ) : (
        <Text style={[styles.metricValue, isError && { color: '#B91C1C' }]}>{value}</Text>
      )}
      <View style={styles.metricFooter}>
        <View style={[styles.metricBadge, isError && { backgroundColor: '#FEE2E2' }]}>
          <Text style={[styles.metricBadgeText, isError && { color: '#B91C1C' }]}>{badgeText}</Text>
        </View>
        <Text style={[styles.metricSubtext, isError && { color: '#DC2626' }]} numberOfLines={1}>
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
  return (
    <View style={styles.pageContainer}>
      {/* Kartu Status Koneksi WhatsApp Gateway */}
      <View style={styles.gatewayCard}>
        <View style={styles.gatewayHeaderRow}>
          <View style={styles.gatewayTitleGroup}>
            <View style={styles.gatewayIconBox}>
              <AppIcon name="link" size={18} color={COLORS.forestDark} />
            </View>
            <View>
              <Text style={styles.gatewayTitle}>Status WhatsApp Gateway</Text>
              <Text style={styles.gatewaySubtitle}>
                Integrasi Cloud API Resmi & Otomatisasi Pesan Bisnis
              </Text>
            </View>
          </View>
          {isGatewayConnected ? (
            <View style={[styles.statusPillWarning, { backgroundColor: '#EAF6F0', borderColor: '#C1E6D3' }]}>
              <View style={[styles.statusDotWarning, { backgroundColor: '#16A36A' }]} />
              <Text style={[styles.statusPillTextWarning, { color: '#0E7A4E' }]}>Terhubung (Staging)</Text>
            </View>
          ) : (
            <View style={styles.statusPillWarning}>
              <View style={styles.statusDotWarning} />
              <Text style={styles.statusPillTextWarning}>Belum Terhubung</Text>
            </View>
          )}
        </View>

        <Text style={styles.gatewayDescription}>
          {isGatewayConnected
            ? 'Gateway WhatsApp Staging aktif dan terhubung. Pesan pelanggan masuk langsung ke basis data Supabase dan dijawab otomatis oleh Chatbot AI.'
            : 'Gateway WhatsApp Business belum ditautkan ke nomor organisasi Anda. Tautkan nomor resmi untuk mengaktifkan kotak masuk percakapan, sinkronisasi kontak real-time, dan pengiriman siaran pesan massal.'}
        </Text>

        <View style={styles.gatewayMetaStrip}>
          <View style={styles.gatewayMetaItem}>
            <Text style={styles.gatewayMetaLabel}>Nomor Tertaut</Text>
            <Text style={styles.gatewayMetaVal}>{gatewayPhone || '— (Belum Ada)'}</Text>
          </View>
          <View style={styles.gatewayMetaDivider} />
          <View style={styles.gatewayMetaItem}>
            <Text style={styles.gatewayMetaLabel}>Server Gateway</Text>
            <Text style={styles.gatewayMetaVal}>ID-Jakarta (Latency 18ms)</Text>
          </View>
          <View style={styles.gatewayMetaDivider} />
          <View style={styles.gatewayMetaItem}>
            <Text style={styles.gatewayMetaLabel}>Pesan Masuk</Text>
            <Text style={styles.gatewayMetaVal}>{isLoading ? '—' : error ? '— (Error)' : `${messagesCount} Pesan`}</Text>
          </View>
        </View>

        <View style={styles.gatewayActionRow}>
          <TouchableOpacity
            style={styles.btnPrimary}
            activeOpacity={0.8}
            onPress={() => onNavigate('settings', 'gateway')}
          >
            <Text style={styles.btnPrimaryText}>{isGatewayConnected ? 'Kelola Gateway' : 'Tautkan Nomor WhatsApp'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnSecondary}
            activeOpacity={0.8}
            onPress={() => onNavigate('chat')}
          >
            <Text style={styles.btnSecondaryText}>Buka Percakapan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Ringkasan Metrik Kinerja */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>Ringkasan Metrik Bisnis</Text>
        <Text style={styles.sectionSubtitleNote}>Periode 30 Hari Terakhir</Text>
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
              ? "Menyinkronkan data kontak..."
              : error
                ? "Gagal menyinkronkan data kontak"
                : contactsCount > 0
                ? `${contactsCount} kontak terdata`
                : "Belum ada data kontak"
          }
          badgeText={isLoading ? "Memuat..." : error ? "Error" : contactsCount > 0 ? "Tersinkron" : "0 baru"}
          iconName="users"
          isDesktop={isDesktop}
          isLoading={isLoading}
          isError={Boolean(error)}
        />
        <MetricCard
          label="Pesan Masuk"
          value={isLoading ? "—" : error ? "—" : String(messagesCount)}
          subtext={
            isLoading
              ? "Menyinkronkan pesan pelanggan..."
              : error
                ? "Gagal menyinkronkan data pesan"
                : messagesCount > 0
                ? `${messagesCount} pesan dari pelanggan`
                : "0 pesan dari pelanggan"
          }
          badgeText={isLoading ? "Memuat..." : error ? "Error" : messagesCount > 0 ? "Pelanggan" : "0 baru"}
          iconName="chat"
          isDesktop={isDesktop}
          isLoading={isLoading}
          isError={Boolean(error)}
        />
        <MetricCard
          label="Kampanye Aktif"
          value={isLoading ? "—" : error ? "—" : String(campaignStats ? campaignStats.active : campaignsCount)}
          subtext={
            isLoading
              ? "Menyinkronkan status kampanye..."
              : error
                ? "Gagal menyinkronkan status kampanye"
                : campaignStats && campaignStats.total > 0
                ? campaignStats.running > 0 && campaignStats.scheduled > 0
                  ? `${campaignStats.running} berjalan, ${campaignStats.scheduled} terjadwal (total ${campaignStats.total} siaran)`
                  : campaignStats.running > 0
                    ? `${campaignStats.running} siaran berjalan (total ${campaignStats.total} siaran)`
                    : campaignStats.scheduled > 0
                      ? `${campaignStats.scheduled} siaran terjadwal (total ${campaignStats.total} siaran)`
                      : `0 siaran aktif (${campaignStats.draft} draf, ${campaignStats.completed} selesai)`
                : campaignsCount > 0
                  ? `${campaignsCount} siaran aktif`
                  : "Belum ada kampanye siaran dibuat"
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
        />
        <MetricCard
          label="Percakapan Terbuka"
          value={isLoading ? "—" : error ? "—" : String(conversationsCount)}
          subtext={
            isLoading
              ? "Menyinkronkan status percakapan..."
              : error
                ? "Gagal menyinkronkan status percakapan"
                : conversationsCount > 0
                ? `${conversationsCount} percakapan terbuka`
                : "Semua percakapan selesai"
          }
          badgeText={isLoading ? "Memuat..." : error ? "Error" : conversationsCount > 0 ? "Terbuka" : "Standby"}
          iconName="bot"
          isDesktop={isDesktop}
          isLoading={isLoading}
          isError={Boolean(error)}
        />
      </View>

      {/* Ringkasan Kampanye Eksekutif */}
      <View style={styles.panelCard}>
        <View style={styles.panelCardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.campaignHeaderIcon}>
              <AppIcon name="campaign" size={16} color={COLORS.forestDark} />
            </View>
            <View>
              <Text style={styles.panelCardTitle}>Ringkasan Kampanye Eksekutif</Text>
              <Text style={styles.panelCardSubtitle}>
                Status Siaran WhatsApp Massal & Kampanye Terjadwal
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.btnSecondary}
            activeOpacity={0.8}
            onPress={() => onNavigate('campaign')}
          >
            <Text style={styles.btnSecondaryText}>Buka Manajemen Kampanye →</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <ActivityIndicator size="small" color={COLORS.forestDark} />
            <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>
              Menyinkronkan data kampanye organisasi...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.campaignErrorCard}>
            <AppIcon name="alert" size={18} color="#B91C1C" />
            <Text style={{ fontSize: 13, color: '#B91C1C', flex: 1 }}>
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
            <View style={styles.campaignKpiStrip}>
              <View style={styles.campaignKpiItem}>
                <Text style={styles.campaignKpiLabel}>Total Kampanye</Text>
                <Text style={styles.campaignKpiVal}>{campaignStats?.total ?? campaigns.length}</Text>
              </View>
              <View style={styles.campaignKpiDivider} />
              <View style={styles.campaignKpiItem}>
                <Text style={styles.campaignKpiLabel}>Siaran Terjadwal</Text>
                <Text style={[styles.campaignKpiVal, { color: '#1D4ED8' }]}>{campaignStats?.scheduled ?? 0}</Text>
              </View>
              <View style={styles.campaignKpiDivider} />
              <View style={styles.campaignKpiItem}>
                <Text style={styles.campaignKpiLabel}>Sedang Berjalan</Text>
                <Text style={[styles.campaignKpiVal, { color: '#B45309' }]}>{campaignStats?.running ?? 0}</Text>
              </View>
              <View style={styles.campaignKpiDivider} />
              <View style={styles.campaignKpiItem}>
                <Text style={styles.campaignKpiLabel}>Selesai Dikirim</Text>
                <Text style={[styles.campaignKpiVal, { color: '#047857' }]}>{campaignStats?.completed ?? 0}</Text>
              </View>
              <View style={styles.campaignKpiDivider} />
              <View style={styles.campaignKpiItem}>
                <Text style={styles.campaignKpiLabel}>Draf Disimpan</Text>
                <Text style={[styles.campaignKpiVal, { color: '#64748B' }]}>{campaignStats?.draft ?? 0}</Text>
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
        <View style={[styles.panelCard, { flex: isDesktop ? 1 : 1 }]}>
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
export default function App() {
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

  // Domain Model States (Organisasi Aktif)
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [orgProfile, setOrgProfile] = useState<OrgProfile>(DEFAULT_ORG_PROFILE);
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
  }, []);

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
    fetchDashboardMetrics(currentOrg.id);

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
          fetchDashboardMetrics(currentOrg.id);
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
          fetchDashboardMetrics(currentOrg.id);
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
          fetchDashboardMetrics(currentOrg.id);
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      fetchDashboardMetrics(currentOrg.id);
    }, 5000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
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
        fetchDashboardMetrics(currentOrg.id);
      }
    },
    [currentOrg?.id, fetchDashboardMetrics]
  );

  // Handler sinkronisasi instan saat status percakapan atau pesan diperbarui
  const handleConversationUpdated = useCallback(() => {
    if (currentOrg?.id) {
      fetchDashboardMetrics(currentOrg.id);
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
    // 1. Ambil sesi awal dari storage
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      const currentUser = initialSession?.user ?? null;
      setUser(currentUser);
      setIsAuthLoading(false);
      previousUserIdRef.current = currentUser?.id ?? null;
      if (currentUser) {
        checkUserOrganization(currentUser.id);
      } else {
        resetWorkspaceState();
      }
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
        checkUserOrganization(currentUser.id);
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
        <StatusBar style="light" />
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View style={styles.brandMonogram}>
            <Text style={styles.brandMonogramText}>W</Text>
          </View>
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
      <SafeAreaView style={styles.appRoot}>
        <StatusBar style="dark" />
        <AuthView />
      </SafeAreaView>
    );
  }

  // 3. Tampilan Onboarding Organisasi Pertama bila pengguna belum terhubung ke organisasi
  if (hasOrganization === false) {
    return (
      <SafeAreaView style={styles.appRoot}>
        <StatusBar style="dark" />
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
    <SafeAreaView style={styles.appRoot}>
      <StatusBar style="light" />

      {/* STRUKTUR UTAMA: SIDEBAR DESKTOP + MAIN AREA */}
      <View style={styles.layoutWrapper}>
        {/* SIDEBAR DESKTOP (Tampil pada layar >= 1024px) */}
        {isDesktop && (
          <View style={styles.desktopSidebar}>
            {/* Logo WABiz Enterprise */}
            <View style={styles.sidebarHeader}>
              <View style={styles.brandBox}>
                <View style={styles.brandMonogram}>
                  <Text style={styles.brandMonogramText}>W</Text>
                </View>
                <View>
                  <View style={styles.brandTitleRow}>
                    <Text style={styles.brandTitle}>WABiz</Text>
                    <View style={styles.brandTierBadge}>
                      <Text style={styles.brandTierText}>ENTERPRISE</Text>
                    </View>
                  </View>
                  <Text style={styles.brandWorkspace}>{currentOrg?.name || 'Workspace WABiz'}</Text>
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
                  <Text style={styles.sidebarUserName} numberOfLines={1}>
                    {userFullName}
                  </Text>
                  <Text style={styles.sidebarUserRole} numberOfLines={1}>
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
        <View style={styles.mainContentArea}>
          {/* HEADER UTAMA */}
          <View style={styles.topHeader}>
            <View style={styles.topHeaderLeft}>
              {/* Tombol Hamburger Menu Pada Mobile */}
              {!isDesktop && (
                <TouchableOpacity
                  style={styles.mobileMenuButton}
                  activeOpacity={0.7}
                  onPress={() => setIsMobileMenuOpen(true)}
                  accessibilityLabel="Buka Menu Navigasi"
                >
                  <AppIcon name="menu" size={20} color={COLORS.textDark} />
                </TouchableOpacity>
              )}

              <View>
                <Text style={styles.topHeaderTitle}>{pageMeta.title}</Text>
                <Text style={styles.topHeaderSubtitle}>{pageMeta.subtitle}</Text>
              </View>
            </View>

            <View style={styles.topHeaderRight}>
              {/* Pencarian Cepat Pada Desktop */}
              {isDesktop && (
                <View style={styles.topHeaderSearchBox}>
                  <AppIcon name="search" size={15} color={COLORS.textSecondary} />
                  <TextInput
                    style={styles.topHeaderSearchInput}
                    placeholder="Pencarian cepat (Ctrl+K)..."
                    placeholderTextColor={COLORS.textMuted}
                    value={globalSearch}
                    onChangeText={setGlobalSearch}
                  />
                </View>
              )}

              {/* Notifikasi Bell */}
              <TouchableOpacity
                style={styles.iconCircleButton}
                activeOpacity={0.7}
                accessibilityLabel="Notifikasi"
              >
                <AppIcon name="bell" size={17} color={COLORS.textDark} />
                <View style={styles.bellNoticeDot} />
              </TouchableOpacity>

              {/* Avatar Ringkas */}
              <View style={styles.topAvatar}>
                <Text style={styles.topAvatarText}>{userInitials}</Text>
              </View>

              {/* Tombol Keluar Sesi */}
              <TouchableOpacity
                style={styles.iconCircleButton}
                activeOpacity={0.7}
                onPress={handleLogout}
                accessibilityLabel="Keluar dari akun"
              >
                <AppIcon name="log-out" size={15} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>
          </View>

          {/* KONTEN HALAMAN */}
          {activeNav === 'chat' ? (
            <View style={[styles.chatViewWrapper, !isDesktop && styles.chatViewWrapperMobile]}>
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
              style={styles.scrollCanvas}
              contentContainerStyle={[
                styles.scrollContentContainer,
                !isDesktop && styles.scrollContentMobile,
              ]}
              showsVerticalScrollIndicator={false}
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
                  isGatewayConnected={orgProfile.isGatewayConnected}
                  gatewayPhone={orgProfile.escalationPhone}
                />
              )}
              {activeNav === 'users' && (
                <ContactsView
                  organizationId={currentOrg?.id}
                  contacts={contacts}
                  setContacts={setContacts}
                  isDesktop={isDesktop}
                  onNavigate={handleNavSelect}
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
                  onCampaignUpdated={() => {
                    if (currentOrg?.id) {
                      fetchDashboardMetrics(currentOrg.id);
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
          {!isDesktop && (
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
                        color={isActive ? COLORS.emerald : COLORS.textSecondary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.mobileBottomNavLabel,
                        isActive && styles.mobileBottomNavLabelActive,
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
                        ? COLORS.emerald
                        : COLORS.textSecondary
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.mobileBottomNavLabel,
                    (activeNav === 'bot' || activeNav === 'team' || activeNav === 'settings') &&
                    styles.mobileBottomNavLabelActive,
                  ]}
                >
                  Lainnya
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* DRAWER SLIDEOVER PADA MOBILE */}
      {!isDesktop && isMobileMenuOpen && (
        <View style={styles.mobileDrawerOverlay}>
          <TouchableOpacity
            style={styles.mobileDrawerBackdrop}
            activeOpacity={1}
            onPress={() => setIsMobileMenuOpen(false)}
          />
          <View style={styles.mobileDrawerContent}>
            {/* Header Drawer Mobile */}
            <View style={styles.mobileDrawerHeader}>
              <View style={styles.brandBox}>
                <View style={styles.brandMonogram}>
                  <Text style={styles.brandMonogramText}>W</Text>
                </View>
                <View>
                  <Text style={styles.brandTitle}>WABiz</Text>
                  <Text style={styles.brandWorkspace}>
                    {currentOrg?.name || 'WhatsApp Enterprise'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.drawerCloseBtn}
                activeOpacity={0.7}
                onPress={() => setIsMobileMenuOpen(false)}
              >
                <AppIcon name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* List Navigasi Drawer */}
            <ScrollView style={styles.mobileDrawerNavList}>
              <Text style={styles.sidebarSectionHeading}>NAVIGASI WORKSPACE</Text>
              {dynamicNavItems.map((item) => {
                const isActive = activeNav === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.sidebarNavItem, isActive && styles.sidebarNavItemActive]}
                    activeOpacity={0.7}
                    onPress={() => handleNavSelect(item.key)}
                  >
                    <View style={styles.sidebarNavIconWrapper}>
                      <AppIcon
                        name={item.key as AppIconProps['name']}
                        size={18}
                        color={isActive ? COLORS.emerald : '#9FB2A9'}
                      />
                    </View>
                    <Text
                      style={[styles.sidebarNavLabel, isActive && styles.sidebarNavLabelActive]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Profil Drawer */}
            <View style={styles.sidebarFooter}>
              <View style={styles.sidebarUserProfile}>
                <View style={styles.sidebarAvatarCircle}>
                  <Text style={styles.sidebarAvatarText}>{userInitials}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sidebarUserName} numberOfLines={1}>
                    {userFullName}
                  </Text>
                  <Text style={styles.sidebarUserRole} numberOfLines={1}>
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
        </View>
      )}
    </SafeAreaView>
  );
}

// ==========================================
// STYLING DETAIL B2B SAAS (PIXEL PERFECT)
// ==========================================
const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: COLORS.forestDark,
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 0) : 0,
  },
  layoutWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.neutralBg,
  },

  // ----------------------------------------
  // SIDEBAR DESKTOP
  // ----------------------------------------
  desktopSidebar: {
    width: 256,
    backgroundColor: COLORS.forestDark,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  sidebarHeader: {
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  brandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandMonogram: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: COLORS.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMonogramText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: -0.5,
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
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 7,
    marginBottom: 3,
  },
  sidebarNavItemActive: {
    backgroundColor: 'rgba(22, 163, 106, 0.16)',
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
    fontSize: 12,
    fontWeight: '600',
  },
  sidebarUserRole: {
    color: '#8A9E95',
    fontSize: 10,
  },
  sidebarLogoutBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ----------------------------------------
  // AREA KONTEN UTAMA & HEADER ATAS
  // ----------------------------------------
  mainContentArea: {
    flex: 1,
    backgroundColor: COLORS.neutralBg,
    flexDirection: 'column',
  },
  topHeader: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 22,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  mobileMenuButton: {
    width: 36,
    height: 36,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    letterSpacing: -0.2,
  },
  topHeaderSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topHeaderSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    paddingHorizontal: 10,
    width: 240,
    height: 36,
  },
  topHeaderSearchInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textDark,
    marginLeft: 8,
    paddingVertical: 0,
  },
  iconCircleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    position: 'relative',
  },
  bellNoticeDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.emerald,
  },
  topAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },

  // ----------------------------------------
  // CANVAS SCROLL & PADDING
  // ----------------------------------------
  scrollCanvas: {
    flex: 1,
    backgroundColor: COLORS.neutralBg,
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
    backgroundColor: COLORS.neutralBg,
  },
  chatViewWrapperMobile: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 76,
  },
  pageContainer: {
    gap: 20,
  },

  // ----------------------------------------
  // KARTU STATUS GATEWAY WHATSAPP
  // ----------------------------------------
  gatewayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    padding: 20,
    gap: 14,
  },
  gatewayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  gatewayTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gatewayIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  gatewaySubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  gatewayDescription: {
    fontSize: 13,
    color: COLORS.textDark,
    lineHeight: 20,
  },
  gatewayMetaStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  gatewayMetaItem: {
    flexDirection: 'column',
    gap: 2,
  },
  gatewayMetaLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  gatewayMetaVal: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  gatewayMetaDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },
  gatewayActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
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
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
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
    color: COLORS.forestDark,
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
    color: COLORS.textDark,
  },
  sectionSubtitleNote: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  metricCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    justifyContent: 'space-between',
    minHeight: 115,
  },
  metricCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  metricIconBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textDark,
    marginVertical: 4,
    letterSpacing: -0.5,
  },
  metricFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricBadge: {
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  metricBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  metricSubtext: {
    fontSize: 11,
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    gap: 14,
  },
  panelCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 12,
  },
  panelCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  panelCardBadge: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  panelProgressText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.emerald,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkBadgePending: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
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
    color: COLORS.textDark,
  },
  checkItemTitlePending: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  checkItemDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyStateDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondaryText: {
    color: COLORS.textDark,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    paddingHorizontal: 12,
    height: 38,
    minWidth: 260,
    flex: 1,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textDark,
    marginLeft: 8,
    paddingVertical: 0,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPillActive: {
    backgroundColor: COLORS.surface,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterPillText: {
    color: COLORS.textSecondary,
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
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ----------------------------------------
  // KAMPANYE, BOT & TEAM KHUSUS
  // ----------------------------------------
  campaignStatsStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  campaignStatVal: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  campaignHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#EAF6F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelCardSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  campaignErrorCard: {
    padding: 14,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  campaignKpiStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  campaignKpiItem: {
    flex: 1,
    minWidth: 90,
    alignItems: 'center',
  },
  campaignKpiDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
  },
  campaignKpiLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  campaignKpiVal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  recentCampaignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: 10,
  },
  recentCampaignName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  recentCampaignMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  recentCampaignDot: {
    fontSize: 11,
    color: COLORS.borderStrong,
  },
  recentCampaignAction: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceMuted,
  },
  recentCampaignActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.forestDark,
  },
  botConfigCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    gap: 14,
  },
  botConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  botParamVal: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
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
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.forestDark,
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
    color: COLORS.textDark,
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
    color: COLORS.forestDark,
  },
  memberEmail: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
    color: COLORS.textDark,
  },
  formInputMock: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  formInputText: {
    fontSize: 13,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  formInputMono: {
    fontSize: 12,
    color: COLORS.forestDark,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },

  // ----------------------------------------
  // NAVIGASI MOBILE BAWAH (BOTTOM BAR)
  // ----------------------------------------
  mobileBottomNav: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 10,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  mobileBottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  mobileNavIconBox: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
  mobileNavIconBoxActive: {
    backgroundColor: COLORS.emeraldSubtle,
  },
  mobileBottomNavLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  mobileBottomNavLabelActive: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },

  // ----------------------------------------
  // DRAWER SLIDEOVER PADA MOBILE
  // ----------------------------------------
  mobileDrawerOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    flexDirection: 'row',
  },
  mobileDrawerBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  mobileDrawerContent: {
    width: 275,
    backgroundColor: COLORS.forestDark,
    flexDirection: 'column',
    justifyContent: 'space-between',
    zIndex: 1000,
  },
  mobileDrawerHeader: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileDrawerNavList: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 16,
  },
  // ----------------------------------------
  // LOG AKTIVITAS TERBARU DASHBOARD
  // ----------------------------------------
  recentActivityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#FAFCFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E4EAE6',
    gap: 10,
  },
  recentActivityAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#059669',
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
    color: '#17231F',
  },
  recentActivityTime: {
    fontSize: 10,
    color: '#718078',
  },
  recentActivitySnippet: {
    fontSize: 12,
    color: '#718078',
    marginTop: 2,
  },
  recentActivityStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#EAF6F0',
  },
  recentActivityStatusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#16A36A',
  },
  btnViewAllActivities: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnViewAllActivitiesText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16A36A',
  },
});
