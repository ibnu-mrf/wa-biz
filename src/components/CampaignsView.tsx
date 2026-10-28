import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS, AppIcon } from '../theme';
import { Contact, ContactLabel } from './ContactsView';
import {
  createPersistentCampaignClient,
  cancelCampaignClient,
  deleteCampaignClient,
  updateCampaignClient,
  getCampaignRecipientsClient,
  CampaignRecipientClientItem,
  getWhatsAppStatus,
  getCampaignGatewayStatus,
  CampaignGatewayStatus,
} from '../lib/whatsappClient';

// ==========================================
// TIPE DATA KAMPANYE (SUPABASE & UI)
// ==========================================
export type CampaignStatus = 'Draft' | 'Terjadwal' | 'Berjalan' | 'Selesai' | 'Dibatalkan';
export type CampaignFilter = 'all' | CampaignStatus;
export type DeliveryMode = 'now' | 'scheduled' | 'draft';

export interface Campaign {
  id: string;
  organizationId?: string;
  name: string;
  purpose?: string;
  messageContent: string; // pemetaan dari column message_body
  targetSegment?: 'all' | ContactLabel;
  status: CampaignStatus;
  createdAt: string;
  scheduledAt?: string;
  rawScheduledAt?: string;
  sentAt?: string;
  channel: string;
  senderPhone?: string;
  totalRecipients?: number;
  sentCount?: number;
  failedCount?: number;
  skippedCount?: number;
  deliveredCount?: number;
  isDemo?: boolean;
}

// Validasi format nomor telepon penerima siaran WhatsApp
export function isValidPhoneNumber(rawPhone: string): boolean {
  if (!rawPhone || typeof rawPhone !== 'string') return false;
  let cleaned = rawPhone.replace(/\D/g, '');
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned.length >= 9 && cleaned.length <= 16;
}

// Normalisasi nomor telepon ke format baku (misal 628xxx)
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone || typeof rawPhone !== 'string') return '';
  let cleaned = rawPhone.replace(/\D/g, '');
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  }
  return cleaned;
}

// Format jadwal untuk tampilan lokal Indonesia (WIB)
export function formatScheduleDisplay(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return `${dateStr} ${timeStr} WIB`;
    const yyyy = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) - 1;
    const dd = parseInt(parts[2], 10);
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const d = new Date(yyyy, mm, dd);
    const dayName = dayNames[d.getDay()];
    const monthName = monthNames[mm];
    return `${dayName}, ${dd} ${monthName} ${yyyy} pukul ${timeStr} WIB`;
  } catch {
    return `${dateStr} ${timeStr} WIB`;
  }
}

// Format hanya tanggal (tanpa jam) untuk ringkasan kalender
export function formatScheduleDateOnly(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const yyyy = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) - 1;
    const dd = parseInt(parts[2], 10);
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const d = new Date(yyyy, mm, dd);
    const dayName = dayNames[d.getDay()];
    const monthName = monthNames[mm];
    return `${dayName}, ${dd} ${monthName} ${yyyy}`;
  } catch {
    return dateStr;
  }
}

// Hitung indeks hari berbasis Senin (0=Senin, 1=Selasa, ..., 6=Minggu)
export function getMondayBasedDayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

// Hitung jam (00-23) dari sudut dial derajat (0=12 o'clock) dan jarak dari pusat
export function calculateDialHour(deg: number, dist: number): string {
  const normalizedDeg = ((deg % 360) + 360) % 360;
  const rawStep = Math.round(normalizedDeg / 30) % 12; // 0 to 11
  let h = 0;
  if (dist >= 78) {
    // Outer ring: 12-23 (12 di atas, 13 di posisi 1, ..., 23 di posisi 11)
    h = rawStep === 0 ? 12 : rawStep + 12;
  } else {
    // Inner ring: 00-11 (00 di atas, 01 di posisi 1, ..., 11 di posisi 11)
    h = rawStep;
  }
  return String(h).padStart(2, '0');
}

// Hitung menit (00-59) dari sudut dial derajat (0=12 o'clock, 6 deg per minute)
export function calculateDialMinute(deg: number): string {
  const normalizedDeg = ((deg % 360) + 360) % 360;
  const m = Math.round(normalizedDeg / 6) % 60;
  return String(m).padStart(2, '0');
}

// Ekstrak komponen tanggal & jam zona WIB (Asia/Jakarta, UTC+7) dari string ISO
export function parseWibDateTime(isoStr: string): { yyyy: string; mm: string; dd: string; hh: string; min: string } | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    let yyyy = '';
    let mm = '';
    let dd = '';
    let hh = '';
    let min = '';
    for (const part of parts) {
      if (part.type === 'year') yyyy = part.value;
      if (part.type === 'month') mm = part.value;
      if (part.type === 'day') dd = part.value;
      if (part.type === 'hour') {
        hh = part.value === '24' ? '00' : part.value.padStart(2, '0');
      }
      if (part.type === 'minute') min = part.value.padStart(2, '0');
    }
    if (yyyy && mm && dd && hh && min) {
      return { yyyy, mm, dd, hh, min };
    }
  } catch {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return { yyyy, mm, dd, hh, min };
  }
  return null;
}

// Normalisasi status dari database Supabase ke label UI
export function normalizeStatusFromDb(status: string | null | undefined): CampaignStatus {
  if (!status) return 'Draft';
  const s = status.toLowerCase();
  if (s === 'scheduled' || s === 'terjadwal') return 'Terjadwal';
  if (s === 'running' || s === 'berjalan' || s === 'sending') return 'Berjalan';
  if (s === 'completed' || s === 'selesai' || s === 'sent') return 'Selesai';
  if (s === 'cancelled' || s === 'canceled' || s === 'dibatalkan' || s === 'failed' || s === 'gagal') return 'Dibatalkan';
  return 'Draft';
}

// Interface metrik statistik kampanye untuk konsistensi Dashboard & Modul Kampanye
export interface CampaignStats {
  total: number;
  active: number;    // running + scheduled (siaran sedang aktif diproses atau terjadwal)
  running: number;   // running / Berjalan
  scheduled: number; // scheduled / Terjadwal
  draft: number;     // draft / Draft
  completed: number; // completed / Selesai
  cancelled: number; // cancelled / Dibatalkan
}

// Fungsi murni kalkulasi statistik kampanye yang aman terhadap tenant isolation & demo data
export function calculateCampaignStats(
  campaignList: Campaign[],
  orgId?: string | null
): CampaignStats {
  const relevant = orgId
    ? campaignList.filter((c) => !c.isDemo && (!c.organizationId || c.organizationId === orgId))
    : campaignList;

  let running = 0;
  let scheduled = 0;
  let draft = 0;
  let completed = 0;
  let cancelled = 0;

  for (const c of relevant) {
    const s = (c.status || '').toLowerCase();
    if (s === 'berjalan' || s === 'running' || s === 'sending') {
      running++;
    } else if (s === 'terjadwal' || s === 'scheduled') {
      scheduled++;
    } else if (s === 'selesai' || s === 'completed' || s === 'sent') {
      completed++;
    } else if (s === 'dibatalkan' || s === 'cancelled' || s === 'canceled' || s === 'failed' || s === 'gagal') {
      cancelled++;
    } else {
      draft++;
    }
  }

  return {
    total: relevant.length,
    active: running + scheduled,
    running,
    scheduled,
    draft,
    completed,
    cancelled,
  };
}

// Konversi baris database Supabase (public.campaigns) ke objek domain model Campaign
export function mapCampaignFromDb(row: any): Campaign {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    purpose: '',
    messageContent: row.message_body || '',
    targetSegment: (row.target_segment as any) || 'all',
    status: normalizeStatusFromDb(row.status),
    senderPhone: row.sender_phone || undefined,
    totalRecipients: row.total_recipients || 0,
    sentCount: row.sent_count || 0,
    failedCount: row.failed_count || 0,
    skippedCount: row.skipped_count || 0,
    createdAt: row.created_at
      ? new Date(row.created_at).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '',
    scheduledAt: row.scheduled_at
      ? new Date(row.scheduled_at).toLocaleDateString('id-ID', {
          timeZone: 'Asia/Jakarta',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }) + ' WIB'
      : undefined,
    rawScheduledAt: row.scheduled_at || undefined,
    sentAt: row.sent_at
      ? new Date(row.sent_at).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : undefined,
    channel: row.provider_type === 'meta_cloud_api'
      ? 'Meta Cloud API'
      : row.provider_type === 'openwa'
      ? 'OpenWA Gateway'
      : 'WhatsApp Gateway (Baileys)',
    deliveredCount: undefined,
    isDemo: false,
  };
}

// Pemetaan status UI ke nilai kolom status database Supabase
export function mapStatusToDb(status: CampaignStatus): string {
  switch (status) {
    case 'Draft':
      return 'draft';
    case 'Terjadwal':
      return 'scheduled';
    case 'Berjalan':
      return 'running';
    case 'Selesai':
      return 'completed';
    case 'Dibatalkan':
      return 'cancelled';
    default:
      return 'draft';
  }
}

// Terjemahan error Supabase ke pesan Bahasa Indonesia yang informatif
export function translateCampaignError(errMsg: string): string {
  const lower = errMsg.toLowerCase();
  if (lower.includes('permission denied') || lower.includes('policy') || lower.includes('42501')) {
    return 'Akses ditolak oleh kebijakan keamanan (RLS). Pastikan Anda adalah anggota organisasi yang berhak mengelola kampanye.';
  }
  if (lower.includes('violates check constraint') || lower.includes('23514')) {
    return 'Nilai data kampanye atau format status tidak sesuai dengan batasan basis data.';
  }
  if (lower.includes('duplicate') || lower.includes('unique') || lower.includes('23505')) {
    return 'Nama kampanye ini sudah terdaftar dalam organisasi Anda.';
  }
  if (lower.includes('foreign key') || lower.includes('violates foreign key')) {
    return 'Organisasi tidak valid atau tidak ditemukan dalam database.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection')) {
    return 'Gagal terhubung ke Supabase. Periksa koneksi internet Anda.';
  }
  return errMsg || 'Terjadi kendala saat memproses data kampanye.';
}


// ==========================================
// BADGE STATUS KAMPANYE
// ==========================================
export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  let bg = '#F1F5F9';
  let text = '#475569';
  let border = '#E2E8F0';
  let dot = '#94A3B8';

  switch (status) {
    case 'Draft':
      bg = '#F8FAFC';
      text = '#64748B';
      border = '#CBD5E1';
      dot = '#94A3B8';
      break;
    case 'Terjadwal':
      bg = '#EFF6FF';
      text = '#1D4ED8';
      border = '#BFDBFE';
      dot = '#3B82F6';
      break;
    case 'Berjalan':
      bg = '#FFFBEB';
      text = '#B45309';
      border = '#FDE68A';
      dot = '#F59E0B';
      break;
    case 'Selesai':
      bg = '#ECFDF5';
      text = '#047857';
      border = '#A7F3D0';
      dot = '#10B981';
      break;
    case 'Dibatalkan':
      bg = '#FEF2F2';
      text = '#B91C1C';
      border = '#FECACA';
      dot = '#EF4444';
      break;
  }

  return (
    <View style={[styles.statusBadge, { backgroundColor: bg, borderColor: border }]}>
      <View style={[styles.statusDot, { backgroundColor: dot }]} />
      <Text style={[styles.statusBadgeText, { color: text }]}>{status}</Text>
    </View>
  );
}

// ==========================================
// BADGE STATUS KESIAPAN GATEWAY WHATSAPP
// ==========================================
export function GatewayStatusBadge({ status }: { status: CampaignGatewayStatus | null }) {
  if (!status) {
    return (
      <View style={[styles.gwBadge, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}>
        <Text style={[styles.gwBadgeText, { color: '#64748B' }]}>Memeriksa status gateway...</Text>
      </View>
    );
  }

  let bg = '#F8FAFC';
  let border = '#E2E8F0';
  let text = '#475569';
  let iconName: any = 'help';

  switch (status.code) {
    case 'ready':
      bg = '#ECFDF5';
      border = '#A7F3D0';
      text = '#047857';
      iconName = 'check';
      break;
    case 'waiting_gateway':
      bg = '#FFFBEB';
      border = '#FDE68A';
      text = '#B45309';
      iconName = 'clock';
      break;
    case 'unconfigured':
      bg = '#FEF2F2';
      border = '#FECACA';
      text = '#DC2626';
      iconName = 'alert';
      break;
    case 'unsupported':
      bg = '#F1F5F9';
      border = '#CBD5E1';
      text = '#64748B';
      iconName = 'close';
      break;
    case 'connection_error':
      bg = '#FEF2F2';
      border = '#FCA5A5';
      text = '#B91C1C';
      iconName = 'alert';
      break;
  }

  return (
    <View style={[styles.gwBadge, { backgroundColor: bg, borderColor: border }]}>
      <AppIcon name={iconName} size={11} color={text} />
      <Text style={[styles.gwBadgeText, { color: text }]}>{status.label}</Text>
    </View>
  );
}

// ==========================================
// KOMPONEN UTAMA: CAMPAIGNS VIEW
// ==========================================
export interface CampaignsViewProps {
  organizationId?: string;
  currentUserId?: string;
  campaigns?: Campaign[];
  setCampaigns?: React.Dispatch<React.SetStateAction<Campaign[]>>;
  contacts?: Contact[];
  isDesktop?: boolean;
  onNavigate?: (page: 'dashboard' | 'chat' | 'users' | 'campaign' | 'bot' | 'team' | 'settings') => void;
  onCampaignUpdated?: () => void;
}

export function CampaignsView({
  organizationId,
  currentUserId: _currentUserId,
  campaigns: externalCampaigns,
  setCampaigns: externalSetCampaigns,
  contacts: externalContacts = [],
  isDesktop = true,
  onNavigate: _onNavigate,
  onCampaignUpdated,
}: CampaignsViewProps) {
  const [internalCampaigns, setInternalCampaigns] = useState<Campaign[]>([]);
  const campaigns = externalCampaigns ?? internalCampaigns;
  const setCampaigns = externalSetCampaigns ?? setInternalCampaigns;

  const [internalContacts, setInternalContacts] = useState<Contact[]>([]);
  const contacts = externalContacts && externalContacts.length > 0 ? externalContacts : internalContacts;

  // Supabase Organization State (Single Source of Truth dari App.tsx)
  const effectiveOrgId = organizationId;

  // Role Pengguna Saat Ini dalam Organisasi
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member' | string | null>(null);
  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === null;

  // Status Asinkron
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(organizationId));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>(null);

  // Filter & Pencarian
  const [activeFilter, setActiveFilter] = useState<CampaignFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isRecipientsModalOpen, setIsRecipientsModalOpen] = useState(false);
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

  // Recipient Tracking State
  const [activeRecipients, setActiveRecipients] = useState<CampaignRecipientClientItem[]>([]);
  const [recipientMetrics, setRecipientMetrics] = useState({
    total: 0,
    pending: 0,
    processing: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    skipped: 0,
  });
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [connectedSenderPhone, setConnectedSenderPhone] = useState<string | null>(null);
  const [recipientStatusFilter, setRecipientStatusFilter] = useState<string>('all');
  const [calculatedScheduleIso, setCalculatedScheduleIso] = useState<string | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<CampaignGatewayStatus | null>(null);
  const [isLoadingGatewayStatus, setIsLoadingGatewayStatus] = useState<boolean>(false);

  // Form Fields State
  const [formName, setFormName] = useState('');
  const [formPurpose, setFormPurpose] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formSegment, setFormSegment] = useState<'all' | ContactLabel>('all');
  const [formDeliveryMode, setFormDeliveryMode] = useState<DeliveryMode>('now');
  const [formScheduleDate, setFormScheduleDate] = useState('');
  const [formScheduleHour, setFormScheduleHour] = useState('09');
  const [formScheduleMinute, setFormScheduleMinute] = useState('00');
  const [formScheduleTime, setFormScheduleTime] = useState('09:00');
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [clockDialMode, setClockDialMode] = useState<'hour' | 'minute'>('hour');
  const [formError, setFormError] = useState<string | null>(null);

  // Pemilihan Penerima Kampanye State
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactLabelFilter, setContactLabelFilter] = useState<'Semua' | ContactLabel>('Semua');

  // Muat kontak otomatis dari Supabase jika belum tersedia di prop
  useEffect(() => {
    if ((!externalContacts || externalContacts.length === 0) && effectiveOrgId) {
      supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', effectiveOrgId)
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) {
            const mapped: Contact[] = data.map((row) => ({
              id: row.id,
              organizationId: row.organization_id,
              name: row.name,
              phone: row.phone,
              email: row.email,
              label: (Array.isArray(row.labels) && (row.labels[0] as ContactLabel)) || 'Umum',
              labels: row.labels,
              followUpStatus: row.follow_up_status || 'Belum Dihubungi',
              notes: row.notes,
              createdAt: row.created_at,
              is_opted_out: row.is_opted_out,
            } as any));
            setInternalContacts(mapped);
          }
        });
    }
  }, [effectiveOrgId, externalContacts]);

  // Ambil nomor pengirim WhatsApp dan status gateway dari worker yang aktif
  const refreshGatewayStatus = useCallback(async () => {
    setIsLoadingGatewayStatus(true);
    try {
      const res = await getCampaignGatewayStatus(effectiveOrgId);
      if (res.success && res.data) {
        setGatewayStatus(res.data);
        if (res.data.phone) {
          setConnectedSenderPhone(res.data.phone);
        }
      }
    } catch {
      // Abaikan jika offline
    } finally {
      setIsLoadingGatewayStatus(false);
    }
  }, [effectiveOrgId]);

  useEffect(() => {
    let ignore = false;
    refreshGatewayStatus();
    getWhatsAppStatus()
      .then((res: any) => {
        if (!ignore && res.success && res.data?.phoneNumber) {
          setConnectedSenderPhone(res.data.phoneNumber);
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [refreshGatewayStatus]);

  // Muat data kampanye dari tabel public.campaigns Supabase
  const fetchCampaigns = useCallback(
    async (orgId?: string) => {
      const targetOrgId = orgId || effectiveOrgId;
      if (!targetOrgId) {
        setIsLoading(false);
        setFetchError('Organisasi belum dipilih atau tidak aktif. Silakan pilih workspace Anda.');
        return;
      }

      setIsLoading(true);
      setFetchError(null);

      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('id, organization_id, name, message_body, status, scheduled_at, sent_at, created_at, updated_at, sender_phone, total_recipients, sent_count, failed_count, skipped_count, target_segment')
          .eq('organization_id', targetOrgId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching campaigns:', error.message);
          setFetchError(translateCampaignError(error.message));
        } else if (data) {
          const mapped: Campaign[] = data.map(mapCampaignFromDb);
          setCampaigns(mapped);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        setFetchError(translateCampaignError(msg));
      } finally {
        setIsLoading(false);
      }
    },
    [effectiveOrgId, setCampaigns]
  );

  // Inisialisasi saat organisasi aktif tersedia
  useEffect(() => {
    let ignore = false;
    if (!effectiveOrgId) return;

    const loadData = async () => {
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('id, organization_id, name, message_body, status, scheduled_at, sent_at, created_at, updated_at, sender_phone, total_recipients, sent_count, failed_count, skipped_count, target_segment')
          .eq('organization_id', effectiveOrgId)
          .order('created_at', { ascending: false });

        if (ignore) return;
        if (error) {
          setFetchError(translateCampaignError(error.message));
        } else if (data) {
          const mapped: Campaign[] = data.map(mapCampaignFromDb);
          setCampaigns(mapped);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : '';
          setFetchError(translateCampaignError(msg));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      ignore = true;
    };
  }, [effectiveOrgId, setCampaigns]);

  // Cek Role Pengguna dalam Organisasi
  useEffect(() => {
    let ignore = false;
    if (!effectiveOrgId) return;

    const checkRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || ignore) return;

        const { data, error } = await supabase
          .from('organization_members')
          .select('role')
          .eq('organization_id', effectiveOrgId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!ignore && !error && data) {
          setUserRole(data.role);
        }
      } catch (e) {
        console.error('Error fetching user role in CampaignsView:', e);
      }
    };

    checkRole();
    return () => {
      ignore = true;
    };
  }, [effectiveOrgId]);

  // Filter Kampanye berdasarkan Status dan Pencarian
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((camp) => {
      // Filter status
      if (activeFilter !== 'all' && camp.status !== activeFilter) {
        return false;
      }
      // Filter teks
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchName = camp.name.toLowerCase().includes(q);
        const matchMsg = camp.messageContent.toLowerCase().includes(q);
        const matchPurpose = camp.purpose ? camp.purpose.toLowerCase().includes(q) : false;
        return matchName || matchMsg || matchPurpose;
      }
      return true;
    });
  }, [campaigns, activeFilter, searchQuery]);

  // Statistik Jumlah Kampanye
  const countAll = campaigns.length;
  const countDraft = campaigns.filter((c) => c.status === 'Draft').length;
  const countScheduled = campaigns.filter((c) => c.status === 'Terjadwal').length;
  const countRunning = campaigns.filter((c) => c.status === 'Berjalan').length;
  const countFinished = campaigns.filter((c) => c.status === 'Selesai').length;
  const countCancelled = campaigns.filter((c) => c.status === 'Dibatalkan').length;

  // Kontak sasaran terpilih dari modul kontak
  const selectedContacts = useMemo(() => {
    return contacts.filter((c) => selectedContactIds.includes(c.id));
  }, [contacts, selectedContactIds]);

  // Ringkasan validitas kontak terpilih (nomor valid, opt-out, invalid, duplikat)
  const targetSummary = useMemo(() => {
    let valid = 0;
    let optOut = 0;
    let invalid = 0;
    let duplicates = 0;
    const seenPhones = new Set<string>();

    selectedContacts.forEach((c) => {
      const isVal = isValidPhoneNumber(c.phone);
      const norm = normalizePhone(c.phone);
      const isOpt =
        Boolean((c as any).is_opted_out) ||
        (Array.isArray(c.labels) &&
          (c.labels.includes('opt-out') || c.labels.includes('optout') || c.labels.includes('berhenti')));

      if (!isVal) {
        invalid++;
      } else if (seenPhones.has(norm)) {
        duplicates++;
      } else {
        seenPhones.add(norm);
        if (isOpt) {
          optOut++;
        } else {
          valid++;
        }
      }
    });

    return {
      total: selectedContacts.length,
      valid,
      optOut,
      invalid,
      duplicates,
      uniquePhones: seenPhones.size,
    };
  }, [selectedContacts]);

  // Filter kontak di dalam modal pemilih kontak (pencarian teks & label)
  const filteredModalContacts = useMemo(() => {
    const q = contactSearch.toLowerCase().trim();
    return contacts.filter((c) => {
      if (contactLabelFilter !== 'Semua') {
        const hasLabel = (c.labels && c.labels.includes(contactLabelFilter)) || c.label === contactLabelFilter;
        if (!hasLabel) return false;
      }
      if (!q) return true;
      const matchName = (c.name || '').toLowerCase().includes(q);
      const matchPhone =
        (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')) ||
        (c.phone || '').includes(q);
      return matchName || matchPhone;
    });
  }, [contacts, contactSearch, contactLabelFilter]);

  // Aksi Pilih Semua kontak valid yang cocok dengan pencarian (mencegah nomor duplikat)
  const handleSelectAllContacts = () => {
    const newSelected = new Set(selectedContactIds);
    const seenPhones = new Set<string>();

    // Masukkan nomor kontak yang telah terpilih sebelumnya
    selectedContacts.forEach((c) => {
      const norm = normalizePhone(c.phone);
      if (norm) seenPhones.add(norm);
    });

    // Tambahkan kontak hasil filter yang memiliki nomor valid dan belum ada di antrean
    filteredModalContacts.forEach((c) => {
      if (!isValidPhoneNumber(c.phone)) return;
      const norm = normalizePhone(c.phone);
      if (seenPhones.has(norm)) return;
      seenPhones.add(norm);
      newSelected.add(c.id);
    });
    setSelectedContactIds(Array.from(newSelected));
  };

  // Aksi Batalkan Semua Pilihan Kontak
  const handleDeselectAllContacts = () => {
    setSelectedContactIds([]);
  };

  // Toggle pilihan per kontak (hanya jika memiliki nomor valid)
  const handleToggleContact = (contactId: string, phone: string) => {
    if (!isValidPhoneNumber(phone)) return;
    setSelectedContactIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  // Hapus satu kontak dari daftar terpilih di ringkasan
  const handleRemoveSelectedContact = (contactId: string) => {
    setSelectedContactIds((prev) => prev.filter((id) => id !== contactId));
  };

  // Navigasi Kalender
  const handleSelectDay = (day: number) => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setFormScheduleDate(dateStr);
    if (formError) setFormError(null);
  };

  const handlePrevMonth = () => {
    const current = new Date();
    const prev = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    if (
      prev.getFullYear() < current.getFullYear() ||
      (prev.getFullYear() === current.getFullYear() && prev.getMonth() < current.getMonth())
    ) {
      return;
    }
    setCalendarMonth(prev);
  };

  const handleNextMonth = () => {
    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  };

  // Buka Modal Form Kampanye (Buat Baru)
  const handleOpenAddForm = () => {
    if (userRole === 'member') {
      setFeedbackMsg({
        type: 'warning',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak membuat kampanye baru.',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    setActiveCampaign(null);
    setFormName('');
    setFormPurpose('');
    setFormMessage('');
    setFormSegment('all');
    setFormDeliveryMode('now');
    setSelectedContactIds([]); // Kosongkan agar pengguna secara sadar memilih penerima

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowWib = parseWibDateTime(tomorrow.toISOString());
    if (tomorrowWib) {
      setFormScheduleDate(`${tomorrowWib.yyyy}-${tomorrowWib.mm}-${tomorrowWib.dd}`);
      setFormScheduleHour('09');
      setFormScheduleMinute('00');
      setFormScheduleTime('09:00');
      setCalendarMonth(new Date(parseInt(tomorrowWib.yyyy, 10), parseInt(tomorrowWib.mm, 10) - 1, 1));
    }
    setClockDialMode('hour');

    setFormError(null);
    setIsFormModalOpen(true);
  };

  // Buka Modal Edit Kampanye
  const handleOpenEditForm = (camp: Campaign) => {
    if (userRole === 'member') {
      setFeedbackMsg({
        type: 'warning',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak mengubah kampanye.',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }

    // Tolak edit jika kampanye sudah aktif berjalan atau selesai
    if (camp.status === 'Berjalan' || camp.status === 'Selesai') {
      setFeedbackMsg({
        type: 'warning',
        text: `Kampanye dengan status "${camp.status}" tidak dapat diedit karena sedang atau telah selesai diproses.`,
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }

    setActiveCampaign(camp);
    setFormName(camp.name);
    setFormPurpose(camp.purpose || '');
    setFormMessage(camp.messageContent);
    setFormSegment(camp.targetSegment || 'all');
    setFormDeliveryMode(camp.status === 'Terjadwal' ? 'scheduled' : 'draft');
    setClockDialMode('hour');

    if (camp.rawScheduledAt) {
      const wib = parseWibDateTime(camp.rawScheduledAt);
      if (wib) {
        setFormScheduleDate(`${wib.yyyy}-${wib.mm}-${wib.dd}`);
        setFormScheduleHour(wib.hh);
        setFormScheduleMinute(wib.min);
        setFormScheduleTime(`${wib.hh}:${wib.min}`);
        setCalendarMonth(new Date(parseInt(wib.yyyy, 10), parseInt(wib.mm, 10) - 1, 1));
      }
    } else {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const tomorrowWib = parseWibDateTime(tomorrow.toISOString());
      if (tomorrowWib) {
        setFormScheduleDate(`${tomorrowWib.yyyy}-${tomorrowWib.mm}-${tomorrowWib.dd}`);
        setFormScheduleHour('09');
        setFormScheduleMinute('00');
        setFormScheduleTime('09:00');
        setCalendarMonth(new Date(parseInt(tomorrowWib.yyyy, 10), parseInt(tomorrowWib.mm, 10) - 1, 1));
      }
    }

    setFormError(null);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  // Simpan atau Validasi Kampanye (Kirim Sekarang / Jadwalkan / Draf)
  const handleSaveCampaign = async () => {
    if (isSubmitting) return;
    if (userRole === 'member') {
      setFormError('Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak menyimpan kampanye.');
      return;
    }
    if (!effectiveOrgId) {
      setFormError('ID organisasi tidak ditemukan. Silakan muat ulang halaman.');
      return;
    }

    // 1. Validasi Nama Kampanye
    if (formName.trim().length < 3) {
      setFormError('Nama kampanye wajib diisi minimal 3 karakter.');
      return;
    }

    // 2. Validasi Isi Pesan
    if (formMessage.trim().length < 5) {
      setFormError('Isi pesan siaran wajib diisi minimal 5 karakter.');
      return;
    }

    // 3. Validasi Pemilihan Penerima (hanya untuk pembuatan baru)
    if (!activeCampaign) {
      if (selectedContactIds.length === 0) {
        setFormError('Penerima kampanye wajib dipilih minimal 1 kontak.');
        return;
      }
      if (targetSummary.valid === 0) {
        setFormError('Tidak ada kontak dengan nomor WhatsApp valid untuk dikirimi siaran ini.');
        return;
      }
    }

    // 4. Validasi Waktu Jadwal jika mode terjadwal
    let scheduleIso: string | null = null;
    if (formDeliveryMode === 'scheduled') {
      if (!formScheduleDate || !formScheduleHour || !formScheduleMinute) {
        setFormError('Tanggal dan jam jadwal pengiriman wajib diisi lengkap.');
        return;
      }
      const timeCombined = `${formScheduleHour}:${formScheduleMinute}`;
      const dateTimeString = `${formScheduleDate}T${timeCombined}:00+07:00`;
      const scheduleDateTime = new Date(dateTimeString);

      if (isNaN(scheduleDateTime.getTime())) {
        setFormError('Format tanggal atau jam jadwal tidak valid.');
        return;
      }
      if (scheduleDateTime.getTime() <= Date.now()) {
        setFormError('Waktu jadwal siaran harus berada di masa depan.');
        return;
      }
      scheduleIso = scheduleDateTime.toISOString();
    }
    setCalculatedScheduleIso(scheduleIso);

    // Jika membuat kampanye baru dengan mode 'now' atau 'scheduled', tampilkan modal tinjauan penerima
    if (!activeCampaign && (formDeliveryMode === 'now' || formDeliveryMode === 'scheduled')) {
      setFormError(null);
      setIsReviewModalOpen(true);
      return;
    }

    // Jika mode draft atau mengedit draf/terjadwal yang ada
    const computedStatusUi: CampaignStatus =
      activeCampaign && formDeliveryMode === 'scheduled' ? 'Terjadwal' : 'Draft';
    const dbStatus = mapStatusToDb(computedStatusUi);
    setIsSubmitting(true);
    setFormError(null);

    try {
      if (activeCampaign) {
        const res = await updateCampaignClient(activeCampaign.id, {
          name: formName.trim(),
          messageBody: formMessage.trim(),
          scheduledAt: scheduleIso,
          status: dbStatus as any,
          organizationId: effectiveOrgId,
        });

        if (!res.success) {
          setFormError(res.error || 'Gagal memperbarui kampanye via worker.');
          return;
        }

        setCampaigns((prev) =>
          prev.map((c) =>
            c.id === activeCampaign.id
              ? {
                  ...c,
                  name: formName.trim(),
                  purpose: formPurpose.trim(),
                  messageContent: formMessage.trim(),
                  targetSegment: formSegment,
                  status: computedStatusUi,
                  rawScheduledAt: scheduleIso || undefined,
                  scheduledAt: scheduleIso
                    ? new Date(scheduleIso).toLocaleDateString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) + ' WIB'
                    : undefined,
                }
              : c
          )
        );

        setFeedbackMsg({
          type: 'success',
          text: `Kampanye "${formName.trim()}" berhasil diperbarui.`,
        });
        onCampaignUpdated?.();
      } else {
        const { data: newRow, error: insertError } = await supabase
          .from('campaigns')
          .insert({
            organization_id: effectiveOrgId,
            name: formName.trim(),
            message_body: formMessage.trim(),
            status: 'draft',
            scheduled_at: scheduleIso,
            total_recipients: selectedContactIds.length,
          })
          .select('*')
          .single();

        if (insertError) {
          setFormError(translateCampaignError(insertError.message));
          return;
        }

        if (newRow) {
          fetchCampaigns();
          onCampaignUpdated?.();
        }

        setFeedbackMsg({
          type: 'success',
          text: `Draf kampanye "${formName.trim()}" berhasil disimpan ke database.`,
        });
      }

      setIsFormModalOpen(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setFormError(translateCampaignError(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Konfirmasi Eksekusi Kampanye (Memanggil Persistent Worker Engine)
  const handleConfirmExecution = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const res = await createPersistentCampaignClient({
        organizationId: effectiveOrgId,
        name: formName.trim(),
        messageBody: formMessage.trim(),
        senderPhone: connectedSenderPhone || undefined,
        deliveryMode: formDeliveryMode === 'scheduled' ? 'scheduled' : 'now',
        scheduledAt: formDeliveryMode === 'scheduled' ? calculatedScheduleIso : null,
        contactIds: selectedContactIds,
      });

      if (res.success && res.data) {
        setIsReviewModalOpen(false);
        setIsFormModalOpen(false);
        setFeedbackMsg({
          type: 'success',
          text:
            formDeliveryMode === 'now'
              ? `Kampanye "${formName.trim()}" sedang diproses! (${res.data.validRecipients} kontak siap dikirim via antrean persisten).`
              : `Kampanye "${formName.trim()}" berhasil dijadwalkan untuk ${res.data.validRecipients} penerima.`,
        });
        fetchCampaigns();
        onCampaignUpdated?.();
      } else {
        setFormError(res.error || 'Gagal mendaftarkan kampanye ke antrean worker.');
        setIsReviewModalOpen(false);
      }
    } catch (err: any) {
      setFormError(err?.message || 'Terjadi kesalahan sistem saat mengeksekusi kampanye.');
      setIsReviewModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Buka Modal Daftar & Status Penerima
  const handleOpenRecipients = async (camp: Campaign) => {
    setActiveCampaign(camp);
    setIsRecipientsModalOpen(true);
    setIsLoadingRecipients(true);
    refreshGatewayStatus().catch(() => {});
    try {
      const res = await getCampaignRecipientsClient(camp.id, effectiveOrgId);
      if (res.success && res.data) {
        setActiveRecipients(res.data.recipients || []);
        setRecipientMetrics(
          res.data.metrics || {
            total: 0,
            pending: 0,
            processing: 0,
            sent: 0,
            delivered: 0,
            failed: 0,
            skipped: 0,
          }
        );
      } else {
        setFeedbackMsg({ type: 'warning', text: res.error || 'Gagal memuat status penerima' });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'warning', text: err?.message || 'Gagal memuat status penerima' });
    } finally {
      setIsLoadingRecipients(false);
    }
  };

  // Polling berkala status penerima saat modal penerima terbuka
  const isPollingRecipientsRef = useRef(false);

  useEffect(() => {
    if (!isRecipientsModalOpen || !activeCampaign?.id || !effectiveOrgId) {
      return;
    }

    const campId = activeCampaign.id;
    let isMounted = true;

    // Helper polling tanpa menampilkan full screen loading indicator
    const pollRecipients = async () => {
      if (isPollingRecipientsRef.current) return;
      isPollingRecipientsRef.current = true;

      try {
        const res = await getCampaignRecipientsClient(campId, effectiveOrgId);
        // Cegah respons request lama memperbarui state jika modal ditutup atau berpindah ke kampanye lain
        if (!isMounted || activeCampaign?.id !== campId) return;

        if (res.success && res.data) {
          setActiveRecipients(res.data.recipients || []);
          if (res.data.metrics) {
            setRecipientMetrics(res.data.metrics);
          }
        }
      } catch (err: any) {
        // Abaikan error transient selama polling agar UI tidak terganggu
      } finally {
        isPollingRecipientsRef.current = false;
      }
    };

    const intervalId = setInterval(() => {
      // Hentikan polling jika:
      // 1. Status kampanye di frontend sudah terminal ('Selesai' / 'Dibatalkan') dan antrean habis
      // 2. ATAU seluruh penerima sudah berada pada status terminal (pending === 0 && processing === 0)
      //    meskipun status kampanye di state frontend belum tersinkronisasi
      const isCampaignTerminal = activeCampaign.status === 'Selesai' || activeCampaign.status === 'Dibatalkan';
      const isQueueTerminal = recipientMetrics.total > 0 && recipientMetrics.pending === 0 && recipientMetrics.processing === 0;

      if ((isCampaignTerminal && recipientMetrics.pending === 0 && recipientMetrics.processing === 0) || isQueueTerminal) {
        return;
      }
      pollRecipients();
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
      isPollingRecipientsRef.current = false;
    };
  }, [
    isRecipientsModalOpen,
    activeCampaign?.id,
    activeCampaign?.status,
    effectiveOrgId,
    recipientMetrics.total,
    recipientMetrics.pending,
    recipientMetrics.processing,
  ]);

  // Batalkan Jadwal Kampanye di Worker & Supabase
  const handleCancelSchedule = async (camp: Campaign) => {
    if (userRole === 'member') {
      setFeedbackMsg({
        type: 'warning',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak membatalkan jadwal kampanye.',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    if (!effectiveOrgId) return;

    try {
      const res = await cancelCampaignClient(camp.id, effectiveOrgId);
      if (res.success) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === camp.id ? { ...c, status: 'Dibatalkan' } : c))
        );
        if (activeCampaign && activeCampaign.id === camp.id) {
          setActiveCampaign({ ...activeCampaign, status: 'Dibatalkan' });
        }
        setFeedbackMsg({
          type: 'info',
          text: `Jadwal kampanye "${camp.name}" telah dibatalkan.`,
        });
        onCampaignUpdated?.();
      } else {
        setFeedbackMsg({
          type: 'warning',
          text: res.error || 'Gagal membatalkan jadwal kampanye.',
        });
      }
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setFeedbackMsg({
        type: 'warning',
        text: translateCampaignError(msg),
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // Buka Modal Konfirmasi Hapus
  const handleOpenDelete = (camp: Campaign) => {
    if (userRole === 'member') {
      setFeedbackMsg({
        type: 'warning',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak menghapus kampanye.',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    setActiveCampaign(camp);
    setIsDetailModalOpen(false);
    setIsDeleteModalOpen(true);
  };

  // Hapus Kampanye dari Database Supabase
  const handleConfirmDelete = async () => {
    if (userRole === 'member') {
      setFeedbackMsg({
        type: 'warning',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak menghapus kampanye.',
      });
      setIsDeleteModalOpen(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    if (!activeCampaign || !effectiveOrgId || isDeleting) return;

    setIsDeleting(true);
    try {
      const res = await deleteCampaignClient(activeCampaign.id, effectiveOrgId);
      if (!res.success) {
        setFeedbackMsg({
          type: 'warning',
          text: res.error || 'Gagal menghapus kampanye via backend worker.',
        });
      } else {
        setCampaigns((prev) => prev.filter((c) => c.id !== activeCampaign.id));
        onCampaignUpdated?.();
        setFeedbackMsg({
          type: 'success',
          text: res.message || `Kampanye "${activeCampaign.name}" berhasil dihapus.`,
        });
      }

      setIsDeleteModalOpen(false);
      setActiveCampaign(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setFeedbackMsg({
        type: 'warning',
        text: translateCampaignError(msg),
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } finally {
      setIsDeleting(false);
    }
  };

  // Duplikasikan Kampanye sebagai draf baru
  const handleDuplicateCampaign = async (camp: Campaign) => {
    if (userRole === 'member') {
      setFeedbackMsg({
        type: 'warning',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak menduplikasi kampanye.',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    if (!effectiveOrgId) return;

    const copyName = `[Salinan] ${camp.name}`;
    try {
      const { data: newRow, error } = await supabase
        .from('campaigns')
        .insert({
          organization_id: effectiveOrgId,
          name: copyName,
          message_body: camp.messageContent,
          status: 'draft',
        })
        .select('id, organization_id, name, message_body, status, scheduled_at, sent_at, created_at, updated_at')
        .single();

      if (error) {
        setFeedbackMsg({
          type: 'warning',
          text: translateCampaignError(error.message),
        });
      } else if (newRow) {
        const newItem: Campaign = {
          id: newRow.id,
          organizationId: newRow.organization_id,
          name: newRow.name,
          purpose: camp.purpose || '',
          messageContent: newRow.message_body || '',
          targetSegment: camp.targetSegment || 'all',
          status: 'Draft',
          createdAt: newRow.created_at
            ? new Date(newRow.created_at).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Baru saja',
          channel: camp.channel || 'WhatsApp Gateway (Baileys)',
          isDemo: false,
        };
        setCampaigns((prev) => [newItem, ...prev]);
        setFeedbackMsg({
          type: 'success',
          text: `Salinan draf kampanye "${copyName}" berhasil dibuat di database.`,
        });
      }
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setFeedbackMsg({
        type: 'warning',
        text: translateCampaignError(msg),
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const activeFetchError =
    fetchError || (!effectiveOrgId ? 'Organisasi belum dipilih atau tidak aktif. Silakan pilih workspace Anda.' : null);

  return (
    <View style={styles.container}>
      {/* 1. HEADER SECTION */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.titleWithBadge}>
            <Text style={styles.pageTitle}>Kampanye Siaran</Text>
            <View style={styles.counterBadge}>
              <Text style={styles.counterBadgeText}>
                {campaigns.length} Kampanye di Supabase
              </Text>
            </View>
            {userRole && (
              <View style={[styles.userRolePill, isOwnerOrAdmin ? styles.userRoleAdmin : styles.userRoleMember]}>
                <Text style={styles.userRoleText}>Peran Anda: {userRole.toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Text style={styles.pageSubtitle}>
            Kelola draf pesan, jadwal siaran massal, dan arsip komunikasi terpusat di Supabase.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.btnCreateCampaign}
          onPress={handleOpenAddForm}
          activeOpacity={0.8}
        >
          <AppIcon name="plus" size={15} color="#FFFFFF" />
          <Text style={styles.btnCreateCampaignText}>+ Buat Kampanye</Text>
        </TouchableOpacity>
      </View>

      {/* FEEDBACK BANNER (NOTIFIKASI BERHASIL / PERINGATAN) */}
      {feedbackMsg && (
        <View
          style={[
            styles.feedbackBanner,
            feedbackMsg.type === 'success'
              ? styles.feedbackSuccess
              : feedbackMsg.type === 'warning'
              ? styles.feedbackWarning
              : styles.feedbackInfo,
          ]}
        >
          <AppIcon
            name={feedbackMsg.type === 'success' ? 'check' : 'alert'}
            size={16}
            color={
              feedbackMsg.type === 'success'
                ? '#047857'
                : feedbackMsg.type === 'warning'
                ? '#B45309'
                : '#1D4ED8'
            }
          />
          <Text
            style={[
              styles.feedbackBannerText,
              {
                color:
                  feedbackMsg.type === 'success'
                    ? '#047857'
                    : feedbackMsg.type === 'warning'
                    ? '#B45309'
                    : '#1D4ED8',
              },
            ]}
          >
            {feedbackMsg.text}
          </Text>
        </View>
      )}

      {/* ERROR FETCH BANNER */}
      {activeFetchError && (
        <View style={styles.errorBannerBox}>
          <AppIcon name="alert" size={15} color="#DC2626" />
          <Text style={styles.errorBannerText}>{activeFetchError}</Text>
          <TouchableOpacity style={styles.btnRetry} onPress={() => fetchCampaigns()} activeOpacity={0.7}>
            <Text style={styles.btnRetryText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* BANNER STATUS GATEWAY WHATSAPP AKTUAL */}
      <View
        style={[
          styles.noticeBanner,
          gatewayStatus?.code === 'ready'
            ? { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }
            : gatewayStatus?.code === 'waiting_gateway'
            ? { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }
            : gatewayStatus?.code === 'unconfigured' || gatewayStatus?.code === 'connection_error'
            ? { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }
            : { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
        ]}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppIcon
                name={gatewayStatus?.code === 'ready' ? 'check' : 'alert'}
                size={15}
                color={
                  gatewayStatus?.code === 'ready'
                    ? '#059669'
                    : gatewayStatus?.code === 'waiting_gateway'
                    ? '#D97706'
                    : '#DC2626'
                }
              />
              <Text
                style={[
                  styles.noticeBannerTitle,
                  {
                    color:
                      gatewayStatus?.code === 'ready'
                        ? '#065F46'
                        : gatewayStatus?.code === 'waiting_gateway'
                        ? '#92400E'
                        : '#991B1B',
                    marginBottom: 0,
                  },
                ]}
              >
                Kanal Gateway: {gatewayStatus?.providerDisplayName || 'WhatsApp Gateway'}
              </Text>
            </View>
            <GatewayStatusBadge status={gatewayStatus} />
          </View>
          <Text
            style={[
              styles.noticeBannerText,
              {
                color:
                  gatewayStatus?.code === 'ready'
                    ? '#166534'
                    : gatewayStatus?.code === 'waiting_gateway'
                    ? '#78350F'
                    : '#7F1D1D',
              },
            ]}
          >
            {gatewayStatus?.message ||
              'Seluruh data kampanye tersimpan aman di database Supabase organisasi Anda. Pengiriman pesan kampanye memerlukan koneksi aktif ke WhatsApp Gateway.'}
          </Text>
        </View>
      </View>

      {/* 2. FILTER & SEARCH BAR */}
      <View style={styles.filterSection}>
        {/* Search Box */}
        <View style={styles.searchBarBox}>
          <AppIcon name="search" size={15} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchTextInput}
            placeholder="Cari berdasarkan nama kampanye atau isi pesan..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <AppIcon name="close" size={12} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Tab Status */}
        <View style={styles.filterTabsWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <TouchableOpacity
              style={[styles.filterTabPill, activeFilter === 'all' && styles.filterTabPillActive]}
              onPress={() => setActiveFilter('all')}
            >
              <Text style={[styles.filterTabText, activeFilter === 'all' && styles.filterTabTextActive]}>
                Semua ({countAll})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterTabPill, activeFilter === 'Draft' && styles.filterTabPillActive]}
              onPress={() => setActiveFilter('Draft')}
            >
              <Text style={[styles.filterTabText, activeFilter === 'Draft' && styles.filterTabTextActive]}>
                Draft ({countDraft})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterTabPill, activeFilter === 'Terjadwal' && styles.filterTabPillActive]}
              onPress={() => setActiveFilter('Terjadwal')}
            >
              <Text style={[styles.filterTabText, activeFilter === 'Terjadwal' && styles.filterTabTextActive]}>
                Terjadwal ({countScheduled})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterTabPill, activeFilter === 'Berjalan' && styles.filterTabPillActive]}
              onPress={() => setActiveFilter('Berjalan')}
            >
              <Text style={[styles.filterTabText, activeFilter === 'Berjalan' && styles.filterTabTextActive]}>
                Berjalan ({countRunning})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterTabPill, activeFilter === 'Selesai' && styles.filterTabPillActive]}
              onPress={() => setActiveFilter('Selesai')}
            >
              <Text style={[styles.filterTabText, activeFilter === 'Selesai' && styles.filterTabTextActive]}>
                Selesai ({countFinished})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterTabPill, activeFilter === 'Dibatalkan' && styles.filterTabPillActive]}
              onPress={() => setActiveFilter('Dibatalkan')}
            >
              <Text style={[styles.filterTabText, activeFilter === 'Dibatalkan' && styles.filterTabTextActive]}>
                Dibatalkan ({countCancelled})
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {(searchQuery !== '' || activeFilter !== 'all') && (
            <TouchableOpacity
              style={styles.btnResetFilter}
              onPress={() => {
                setSearchQuery('');
                setActiveFilter('all');
              }}
            >
              <AppIcon name="refresh" size={12} color={COLORS.textDark} />
              <Text style={styles.btnResetFilterText}>Reset Filter</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 3. DAFTAR KAMPANYE: TABEL DESKTOP VS KARTU MOBILE */}
      <View style={styles.contentCard}>
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={COLORS.emerald} />
            <Text style={styles.loadingText}>Memuat data kampanye dari Supabase...</Text>
          </View>
        ) : filteredCampaigns.length === 0 ? (
          /* EMPTY STATE */
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <AppIcon name="campaign" size={26} color={COLORS.forestDark} />
            </View>
            <Text style={styles.emptyTitle}>
              {campaigns.length === 0 ? 'Belum Ada Kampanye Tersimpan' : 'Kampanye Tidak Ditemukan'}
            </Text>
            <Text style={styles.emptyDesc}>
              {campaigns.length === 0
                ? 'Belum ada draf kampanye yang disimpan di database organisasi ini. Mulai buat draf kampanye pertama untuk mempersiapkan siaran informasi atau promosi.'
                : 'Tidak ada kampanye yang cocok dengan kata kunci pencarian atau filter status terpilih.'}
            </Text>
            {campaigns.length === 0 ? (
              <TouchableOpacity
                style={styles.btnCreateCampaign}
                onPress={handleOpenAddForm}
                activeOpacity={0.8}
              >
                <Text style={styles.btnCreateCampaignText}>+ Buat Kampanye Pertama</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.btnResetFilter}
                onPress={() => {
                  setSearchQuery('');
                  setActiveFilter('all');
                }}
              >
                <AppIcon name="refresh" size={13} color={COLORS.forestDark} />
                <Text style={styles.btnResetFilterText}>Reset Filter & Pencarian</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : isDesktop ? (
          /* TABEL DESKTOP */
          <View style={styles.tableWrapper}>
            {/* Table Header */}
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thCell, { flex: 2.5 }]}>Nama & Cuplikan Pesan</Text>
              <Text style={[styles.thCell, { flex: 1.3 }]}>Status</Text>
              <Text style={[styles.thCell, { flex: 1.8 }]}>Penyimpanan & Kanal</Text>
              <Text style={[styles.thCell, { flex: 1.8 }]}>Waktu Jadwal / Dibuat</Text>
              <Text style={[styles.thCell, { flex: 2, textAlign: 'right' }]}>Aksi</Text>
            </View>

            {/* Table Rows */}
            <ScrollView showsVerticalScrollIndicator={false}>
              {filteredCampaigns.map((camp) => {
                return (
                  <View key={camp.id} style={styles.tableRow}>
                    {/* Nama & Cuplikan Pesan */}
                    <View style={[styles.tdCell, { flex: 2.5 }]}>
                      <Text style={styles.campNameText} numberOfLines={1}>
                        {camp.name}
                      </Text>
                      <Text style={styles.campPurposeText} numberOfLines={2}>
                        {camp.messageContent}
                      </Text>
                    </View>

                    {/* Status */}
                    <View style={[styles.tdCell, { flex: 1.3 }]}>
                      <CampaignStatusBadge status={camp.status} />
                    </View>

                    {/* Kanal & Penyimpanan */}
                    <View style={[styles.tdCell, { flex: 1.8 }]}>
                      <View style={styles.targetPill}>
                        <AppIcon name="campaign" size={12} color={COLORS.forestDark} />
                        <Text style={styles.targetPillText}>
                          {camp.totalRecipients ? `${camp.sentCount || 0}/${camp.totalRecipients} Terkirim` : 'Tersimpan di Supabase'}
                        </Text>
                      </View>
                      <Text style={styles.targetCountSub}>
                        {camp.senderPhone ? `Dari: ${camp.senderPhone}` : camp.channel}
                      </Text>
                      {camp.status === 'Berjalan' && (camp.sentCount || 0) === 0 && gatewayStatus?.code === 'waiting_gateway' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#D97706' }} />
                          <Text style={{ fontSize: 10, color: '#B45309', fontWeight: '500' }}>Menunggu Gateway</Text>
                        </View>
                      )}
                    </View>

                    {/* Waktu Jadwal / Kirim */}
                    <View style={[styles.tdCell, { flex: 1.8 }]}>
                      {camp.scheduledAt ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <AppIcon name="clock" size={12} color="#1D4ED8" />
                          <Text style={styles.scheduleText}>{camp.scheduledAt}</Text>
                        </View>
                      ) : (
                        <Text style={styles.createdText}>Dibuat: {camp.createdAt}</Text>
                      )}
                    </View>

                    {/* Tombol Aksi Kontekstual */}
                    <View style={[styles.tdCell, { flex: 2.4, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }]}>
                      {/* Status Penerima */}
                      <TouchableOpacity
                        style={[styles.actionBtnSmall, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                        onPress={() => handleOpenRecipients(camp)}
                        accessibilityLabel="Status Penerima"
                      >
                        <AppIcon name="users" size={12} color="#16A34A" />
                        <Text style={[styles.actionBtnSmallText, { color: '#16A34A' }]}>
                          Penerima
                        </Text>
                      </TouchableOpacity>

                      {/* Lihat Detail */}
                      <TouchableOpacity
                        style={styles.actionBtnSmall}
                        onPress={() => {
                          setActiveCampaign(camp);
                          setIsDetailModalOpen(true);
                        }}
                        accessibilityLabel="Lihat Detail"
                      >
                        <AppIcon name="campaign" size={13} color={COLORS.forestDark} />
                        <Text style={styles.actionBtnSmallText}>Detail</Text>
                      </TouchableOpacity>

                      {/* Edit (Draft & Terjadwal) */}
                      {(camp.status === 'Draft' || camp.status === 'Terjadwal') && (
                        <TouchableOpacity
                          style={styles.actionBtnSmall}
                          onPress={() => handleOpenEditForm(camp)}
                          accessibilityLabel="Edit Kampanye"
                        >
                          <AppIcon name="edit" size={12} color={COLORS.forestDark} />
                        </TouchableOpacity>
                      )}

                      {/* Duplikasikan */}
                      <TouchableOpacity
                        style={styles.actionBtnSmall}
                        onPress={() => handleDuplicateCampaign(camp)}
                        accessibilityLabel="Duplikasikan Kampanye"
                      >
                        <AppIcon name="copy" size={12} color={COLORS.forestDark} />
                      </TouchableOpacity>

                      {/* Batalkan Jadwal */}
                      {camp.status === 'Terjadwal' && (
                        <TouchableOpacity
                          style={[styles.actionBtnSmall, styles.actionBtnWarning]}
                          onPress={() => handleCancelSchedule(camp)}
                          accessibilityLabel="Batalkan Jadwal"
                        >
                          <Text style={styles.actionBtnWarningText}>Batal</Text>
                        </TouchableOpacity>
                      )}

                      {/* Hapus */}
                      <TouchableOpacity
                        style={[styles.actionBtnSmall, styles.actionBtnDanger]}
                        onPress={() => handleOpenDelete(camp)}
                        accessibilityLabel="Hapus Kampanye"
                      >
                        <AppIcon name="trash" size={12} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          /* KARTU MOBILE */
          <ScrollView style={styles.mobileCardsList} showsVerticalScrollIndicator={false}>
            {filteredCampaigns.map((camp) => {
              return (
                <View key={camp.id} style={styles.mobileCard}>
                  {/* Top: Status & Channel */}
                  <View style={styles.mobileCardTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <CampaignStatusBadge status={camp.status} />
                      {camp.status === 'Berjalan' && (camp.sentCount || 0) === 0 && gatewayStatus?.code === 'waiting_gateway' && (
                        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 10, color: '#92400E', fontWeight: '600' }}>Menunggu Gateway</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.mobileCardTime}>
                      {camp.scheduledAt ? `Jadwal: ${camp.scheduledAt}` : camp.createdAt}
                    </Text>
                  </View>

                  {/* Title & Preview */}
                  <Text style={styles.campNameText}>{camp.name}</Text>
                  <Text style={styles.campPurposeText} numberOfLines={3}>
                    {camp.messageContent}
                  </Text>

                  {/* Target & DB */}
                  <View style={styles.mobileMetaRow}>
                    <View style={styles.targetPill}>
                      <AppIcon name="campaign" size={12} color={COLORS.forestDark} />
                      <Text style={styles.targetPillText}>
                        {camp.totalRecipients ? `${camp.sentCount || 0}/${camp.totalRecipients} Terkirim` : 'Supabase DB'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>
                      {camp.senderPhone ? `Dari: ${camp.senderPhone}` : camp.channel}
                    </Text>
                  </View>

                  {/* Actions Row */}
                  <View style={styles.mobileActionsRow}>
                    <TouchableOpacity
                      style={[styles.mobileActionBtn, { backgroundColor: '#F0FDF4' }]}
                      onPress={() => handleOpenRecipients(camp)}
                    >
                      <AppIcon name="users" size={13} color="#16A34A" />
                      <Text style={[styles.mobileActionBtnText, { color: '#16A34A' }]}>Penerima</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.mobileActionBtn}
                      onPress={() => {
                        setActiveCampaign(camp);
                        setIsDetailModalOpen(true);
                      }}
                    >
                      <AppIcon name="campaign" size={13} color={COLORS.forestDark} />
                      <Text style={styles.mobileActionBtnText}>Detail</Text>
                    </TouchableOpacity>

                    {(camp.status === 'Draft' || camp.status === 'Terjadwal') && (
                      <TouchableOpacity
                        style={styles.mobileActionBtn}
                        onPress={() => handleOpenEditForm(camp)}
                      >
                        <AppIcon name="edit" size={13} color={COLORS.forestDark} />
                        <Text style={styles.mobileActionBtnText}>Edit</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.mobileActionBtn}
                      onPress={() => handleDuplicateCampaign(camp)}
                    >
                      <AppIcon name="copy" size={13} color={COLORS.forestDark} />
                      <Text style={styles.mobileActionBtnText}>Salin</Text>
                    </TouchableOpacity>

                    {camp.status === 'Terjadwal' && (
                      <TouchableOpacity
                        style={[styles.mobileActionBtn, styles.actionBtnWarning]}
                        onPress={() => handleCancelSchedule(camp)}
                      >
                        <Text style={styles.actionBtnWarningText}>Batal Jadwal</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.mobileActionBtn, styles.actionBtnDanger]}
                      onPress={() => handleOpenDelete(camp)}
                    >
                      <AppIcon name="trash" size={13} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ========================================== */}
      {/* 4. MODAL FORM: BUAT & EDIT KAMPANYE        */}
      {/* ========================================== */}
      <Modal
        visible={isFormModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsFormModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsFormModalOpen(false)}
          />

          <View style={[styles.modalDialog, { maxWidth: 680 }]}>
            {/* Header Modal */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {activeCampaign ? 'Edit Draf Kampanye Siaran' : 'Buat Kampanye Siaran Baru'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Kelola nama kampanye, jadwal, dan draf pesan siaran di basis data Supabase
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsFormModalOpen(false)}
              >
                <AppIcon name="close" size={16} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            {/* Error Message */}
            {formError && (
              <View style={styles.errorBox}>
                <AppIcon name="alert" size={14} color="#DC2626" />
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}

            {/* Form Fields: Urutan Form Sesuai Spesifikasi UX WABiz */}
            <ScrollView style={styles.modalFormBody} showsVerticalScrollIndicator={false}>
              {/* 1. Nama Kampanye */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  1. Nama Kampanye <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TextInput
                  style={styles.inputField}
                  placeholder="Contoh: Pengumuman PSB Gelombang 1"
                  placeholderTextColor={COLORS.textMuted}
                  value={formName}
                  onChangeText={(val) => {
                    setFormName(val);
                    if (formError) setFormError(null);
                  }}
                />
              </View>

              {/* 2. Isi Pesan Siaran */}
              <View style={styles.formGroup}>
                <View style={styles.labelWithCounterRow}>
                  <Text style={styles.formLabel}>
                    2. Isi Pesan Siaran WhatsApp <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <Text style={styles.charCountText}>
                    {formMessage.length} karakter
                  </Text>
                </View>
                <TextInput
                  style={[styles.inputField, styles.textareaField]}
                  placeholder="Ketik draf isi pesan siaran resmi yang akan disimpan..."
                  placeholderTextColor={COLORS.textMuted}
                  value={formMessage}
                  onChangeText={(val) => {
                    setFormMessage(val);
                    if (formError) setFormError(null);
                  }}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* LIVE PREVIEW PESAN WHATSAPP */}
              <View style={styles.previewSection}>
                <Text style={styles.previewSectionTitle}>Pratinjau Pesan Pelanggan (WhatsApp Preview):</Text>
                <View style={styles.waPreviewContainer}>
                  <View style={styles.waPreviewHeader}>
                    <View style={styles.waAvatarDot} />
                    <Text style={styles.waPreviewHeaderText}>WABiz Official Broadcast</Text>
                  </View>
                  <View style={styles.waBubble}>
                    <Text style={styles.waBubbleText}>
                      {formMessage.trim().length > 0
                        ? formMessage
                        : '(Pratinjau pesan Anda akan muncul di sini...)'}
                    </Text>
                    <View style={styles.waBubbleFooter}>
                      <Text style={styles.waTime}>10:00</Text>
                      <AppIcon name="check" size={11} color={COLORS.emerald} />
                    </View>
                  </View>
                </View>
              </View>

              {/* 3. Pilih Penerima Pesan */}
              <View style={styles.formGroup}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.formLabel}>
                    3. Pilih Penerima Pesan <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <View style={styles.recipientCountBadge}>
                    <Text style={styles.recipientCountBadgeText}>
                      {selectedContactIds.length} kontak dipilih
                    </Text>
                  </View>
                </View>

                <View style={styles.recipientBoxCard}>
                  <View style={styles.recipientActionRow}>
                    <TouchableOpacity
                      style={styles.btnOpenPicker}
                      onPress={() => {
                        setContactSearch('');
                        setIsContactPickerOpen(true);
                      }}
                    >
                      <AppIcon name="users" size={14} color="#FFFFFF" />
                      <Text style={styles.btnOpenPickerText}>
                        {selectedContactIds.length === 0 ? '+ Pilih Kontak Penerima' : 'Ubah Kontak Penerima'}
                      </Text>
                    </TouchableOpacity>

                    {selectedContactIds.length > 0 && (
                      <TouchableOpacity
                        style={styles.btnClearPicker}
                        onPress={handleDeselectAllContacts}
                      >
                        <Text style={styles.btnClearPickerText}>Batalkan Pilihan</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {selectedContactIds.length === 0 ? (
                    <View style={styles.emptyRecipientAlert}>
                      <AppIcon name="alert" size={14} color="#D97706" />
                      <Text style={styles.emptyRecipientAlertText}>
                        Belum ada kontak yang dipilih. Penerima kampanye tidak akan otomatis dikirimkan ke seluruh kontak.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8, marginTop: 4 }}>
                      <View style={styles.targetCountBanner}>
                        <Text style={styles.targetCountBannerText}>
                          🎯 <Text style={{ fontWeight: '700' }}>{targetSummary.total} Kontak Terpilih:</Text>{' '}
                          <Text style={{ color: '#059669', fontWeight: '700' }}>{targetSummary.valid} Siap Kirim</Text> •{' '}
                          <Text style={{ color: '#D97706' }}>{targetSummary.optOut} Opt-Out</Text> •{' '}
                          {targetSummary.duplicates > 0 && (
                            <>
                              <Text style={{ color: '#6366F1' }}>{targetSummary.duplicates} Duplikat</Text> •{' '}
                            </>
                          )}
                          <Text style={{ color: '#DC2626' }}>{targetSummary.invalid} Tidak Valid</Text>
                        </Text>
                      </View>

                      {/* Chips Preview Kontak Terpilih */}
                      <View style={styles.chipsWrapper}>
                        {selectedContacts.slice(0, 5).map((c) => (
                          <View key={c.id} style={styles.contactChipItem}>
                            <Text style={styles.contactChipName} numberOfLines={1}>
                              {c.name}
                            </Text>
                            <Text style={styles.contactChipPhone}>{c.phone}</Text>
                            <TouchableOpacity
                              onPress={() => handleRemoveSelectedContact(c.id)}
                              style={styles.chipCloseBtn}
                              accessibilityLabel={`Hapus ${c.name}`}
                            >
                              <AppIcon name="close" size={10} color="#64748B" />
                            </TouchableOpacity>
                          </View>
                        ))}
                        {selectedContacts.length > 5 && (
                          <View style={styles.chipMoreBadge}>
                            <Text style={styles.chipMoreText}>+{selectedContacts.length - 5} lainnya</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* 4. Jenis Pengiriman */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>4. Jenis Pengiriman</Text>
                <View style={styles.deliveryModeRow}>
                  <TouchableOpacity
                    style={[
                      styles.modeOptionCard,
                      formDeliveryMode === 'now' && styles.modeOptionCardSelected,
                    ]}
                    onPress={() => setFormDeliveryMode('now')}
                  >
                    <Text
                      style={[
                        styles.modeOptionTitle,
                        formDeliveryMode === 'now' && styles.modeOptionTitleSelected,
                      ]}
                    >
                      ⚡ Kirim Sekarang
                    </Text>
                    <Text style={styles.modeOptionDesc}>
                      Kirim langsung via antrean persisten WhatsApp worker
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeOptionCard,
                      formDeliveryMode === 'scheduled' && styles.modeOptionCardSelected,
                    ]}
                    onPress={() => setFormDeliveryMode('scheduled')}
                  >
                    <Text
                      style={[
                        styles.modeOptionTitle,
                        formDeliveryMode === 'scheduled' && styles.modeOptionTitleSelected,
                      ]}
                    >
                      📅 Terjadwal
                    </Text>
                    <Text style={styles.modeOptionDesc}>
                      Pilih tanggal kalender dan jam pengiriman WIB
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeOptionCard,
                      formDeliveryMode === 'draft' && styles.modeOptionCardSelected,
                    ]}
                    onPress={() => setFormDeliveryMode('draft')}
                  >
                    <Text
                      style={[
                        styles.modeOptionTitle,
                        formDeliveryMode === 'draft' && styles.modeOptionTitleSelected,
                      ]}
                    >
                      📝 Simpan Draf
                    </Text>
                    <Text style={styles.modeOptionDesc}>Simpan ke database tanpa antrean</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 5. Kalender dan Pemilih Jam Analog Dial (jika Terjadwal) */}
              {formDeliveryMode === 'scheduled' && (
                <View style={styles.formGroup}>
                  <View style={styles.schedulerSectionHeader}>
                    <Text style={styles.formLabel}>
                      5. Jadwal Kalender & Jam Pengiriman Siaran <Text style={styles.requiredStar}>*</Text>
                    </Text>
                    <View style={styles.wibBadgeTop}>
                      <View style={styles.tzPillDot} />
                      <Text style={styles.wibBadgeTopText}>WIB • UTC+7 (Asia/Jakarta)</Text>
                    </View>
                  </View>

                  {/* Split Layout: Kiri Kalender Bulanan, Kanan Dial Jam Analog */}
                  <View style={styles.schedulerSplitLayout}>
                    {/* ========================================== */}
                    {/* PANEL KIRI: KALENDER BULANAN (SENIN-MINGGU) */}
                    {/* ========================================== */}
                    <View style={styles.schedulerCalCard}>
                      {/* Header Navigasi Bulan */}
                      {(() => {
                        const now = new Date();
                        const isPrevMonthDisabled =
                          calendarMonth.getFullYear() < now.getFullYear() ||
                          (calendarMonth.getFullYear() === now.getFullYear() &&
                            calendarMonth.getMonth() <= now.getMonth());

                        return (
                          <View style={styles.calHeaderNav}>
                            <TouchableOpacity
                              style={[
                                styles.calNavArrowBtn,
                                isPrevMonthDisabled && styles.calNavArrowBtnDisabled,
                              ]}
                              onPress={handlePrevMonth}
                              disabled={isPrevMonthDisabled}
                              accessibilityRole="button"
                              accessibilityLabel="Bulan Sebelumnya"
                            >
                              <View style={{ transform: [{ rotate: '180deg' }] }}>
                                <AppIcon
                                  name="chevron-right"
                                  size={14}
                                  color={isPrevMonthDisabled ? '#CBD5E1' : COLORS.forestDark}
                                />
                              </View>
                            </TouchableOpacity>

                            <View style={styles.calHeaderTitleContainer}>
                              <AppIcon name="calendar" size={15} color={COLORS.emerald} />
                              <Text style={styles.calHeaderTitle}>
                                {new Intl.DateTimeFormat('id-ID', {
                                  month: 'long',
                                  year: 'numeric',
                                }).format(calendarMonth)}
                              </Text>
                            </View>

                            <TouchableOpacity
                              style={styles.calNavArrowBtn}
                              onPress={handleNextMonth}
                              accessibilityRole="button"
                              accessibilityLabel="Bulan Berikutnya"
                            >
                              <AppIcon name="chevron-right" size={14} color={COLORS.forestDark} />
                            </TouchableOpacity>
                          </View>
                        );
                      })()}

                      {/* Header Hari dalam Seminggu: Senin s/d Minggu */}
                      <View style={styles.calWeekdaysRow}>
                        {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => (
                          <View key={d} style={styles.calWeekdayColWrapper}>
                            <Text style={styles.calWeekdayCol}>{d}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Grid Hari Kalender (7 Kolom Simetris, Dimulai Hari Senin) */}
                      <View style={styles.calDaysGrid}>
                        {(() => {
                          const year = calendarMonth.getFullYear();
                          const month = calendarMonth.getMonth();
                          // Monday-based index: 0=Senin, ..., 6=Minggu
                          const firstDayIdx = (new Date(year, month, 1).getDay() + 6) % 7;
                          const totalDays = new Date(year, month + 1, 0).getDate();
                          const prevMonthDays = new Date(year, month, 0).getDate();
                          const elements: React.ReactNode[] = [];

                          // Leading days dari bulan sebelumnya
                          for (let b = firstDayIdx - 1; b >= 0; b--) {
                            const pDay = prevMonthDays - b;
                            elements.push(
                              <View key={`leading-${pDay}`} style={styles.calDayBtnCell}>
                                <View style={styles.calDayBtnInnerMuted}>
                                  <Text style={styles.calDayBtnTextMuted}>{pDay}</Text>
                                </View>
                              </View>
                            );
                          }

                          const now = new Date();
                          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                          for (let day = 1; day <= totalDays; day++) {
                            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            const endOfDayMs = new Date(`${dateKey}T23:59:59+07:00`).getTime();
                            const isPastDay = endOfDayMs < Date.now();
                            const isSelectedDay = formScheduleDate === dateKey;
                            const isToday = dateKey === todayStr;

                            elements.push(
                              <View key={`day-${day}`} style={styles.calDayBtnCell}>
                                <TouchableOpacity
                                  style={[
                                    styles.calDayBtnInner,
                                    isSelectedDay && styles.calDayBtnInnerSelected,
                                    isToday && !isSelectedDay && styles.calDayBtnInnerToday,
                                    isPastDay && styles.calDayBtnInnerDisabled,
                                  ]}
                                  disabled={isPastDay}
                                  onPress={() => handleSelectDay(day)}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: isSelectedDay, disabled: isPastDay }}
                                  accessibilityLabel={`${day} ${new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(calendarMonth)}${isSelectedDay ? ', terpilih' : ''}${isToday ? ', hari ini' : ''}${isPastDay ? ', tidak aktif' : ''}`}
                                >
                                  <Text
                                    style={[
                                      styles.calDayBtnText,
                                      isSelectedDay && styles.calDayBtnTextSelected,
                                      isToday && !isSelectedDay && styles.calDayBtnTextToday,
                                      isPastDay && styles.calDayBtnTextDisabled,
                                    ]}
                                  >
                                    {day}
                                  </Text>
                                  {isToday && !isSelectedDay && <View style={styles.todaySmallDot} />}
                                </TouchableOpacity>
                              </View>
                            );
                          }

                          // Trailing days dari bulan berikutnya
                          const totalRendered = firstDayIdx + totalDays;
                          const remainder = totalRendered % 7;
                          const trailingCount = remainder === 0 ? 0 : 7 - remainder;
                          for (let t = 1; t <= trailingCount; t++) {
                            elements.push(
                              <View key={`trailing-${t}`} style={styles.calDayBtnCell}>
                                <View style={styles.calDayBtnInnerMuted}>
                                  <Text style={styles.calDayBtnTextMuted}>{t}</Text>
                                </View>
                              </View>
                            );
                          }

                          return elements;
                        })()}
                      </View>

                      {/* Ringkasan Tanggal Terpilih di Bawah Kalender */}
                      <View style={styles.calSelectedDateBox}>
                        <AppIcon name="calendar" size={13} color={COLORS.emerald} />
                        <Text style={styles.calSelectedDateText} numberOfLines={1}>
                          Tanggal Terpilih: {formatScheduleDateOnly(formScheduleDate) || '(Pilih tanggal)'}
                        </Text>
                      </View>
                    </View>

                    {/* ========================================== */}
                    {/* PANEL KANAN: PEMILIH JAM DIAL ANALOG SUNGGUHAN */}
                    {/* ========================================== */}
                    <View style={styles.schedulerClockCard}>
                      {/* Header Digital Waktu & Tab Jam / Menit */}
                      <View style={styles.clockHeaderBlock}>
                        <View style={styles.clockTimeTabsRow}>
                          <TouchableOpacity
                            style={[
                              styles.clockTabSegment,
                              clockDialMode === 'hour' && styles.clockTabSegmentActive,
                            ]}
                            onPress={() => setClockDialMode('hour')}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: clockDialMode === 'hour' }}
                            accessibilityLabel={`Mode Jam. Terpilih pukul ${formScheduleHour}`}
                          >
                            <Text
                              style={[
                                styles.clockTabNumber,
                                clockDialMode === 'hour' && styles.clockTabNumberActive,
                              ]}
                            >
                              {formScheduleHour}
                            </Text>
                            <Text
                              style={[
                                styles.clockTabSub,
                                clockDialMode === 'hour' && styles.clockTabSubActive,
                              ]}
                            >
                              JAM (00-23)
                            </Text>
                          </TouchableOpacity>

                          <Text style={styles.clockColon}>:</Text>

                          <TouchableOpacity
                            style={[
                              styles.clockTabSegment,
                              clockDialMode === 'minute' && styles.clockTabSegmentActive,
                            ]}
                            onPress={() => setClockDialMode('minute')}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: clockDialMode === 'minute' }}
                            accessibilityLabel={`Mode Menit. Terpilih menit ke ${formScheduleMinute}`}
                          >
                            <Text
                              style={[
                                styles.clockTabNumber,
                                clockDialMode === 'minute' && styles.clockTabNumberActive,
                              ]}
                            >
                              {formScheduleMinute}
                            </Text>
                            <Text
                              style={[
                                styles.clockTabSub,
                                clockDialMode === 'minute' && styles.clockTabSubActive,
                              ]}
                            >
                              MENIT (00-59)
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.clockDialModeIndicator}>
                          <Text style={styles.clockDialModeIndicatorText}>
                            {clockDialMode === 'hour'
                              ? '🔘 Ring Luar: Jam 12–23 • Ring Dalam: Jam 00–11'
                              : '🔘 Dial Menit: Sentuh / geser posisi menit 00–59'}
                          </Text>
                        </View>
                      </View>

                      {/* Lingkaran Dial Jam Analog (260x260) */}
                      {(() => {
                        const hNum = parseInt(formScheduleHour, 10) || 0;
                        const mNum = parseInt(formScheduleMinute, 10) || 0;

                        // Perhitungan Hand dan Tip
                        let currentAngleDeg = 0;
                        let targetR = 0;
                        let tipSize = 28;

                        if (clockDialMode === 'hour') {
                          const isOuter = hNum >= 12;
                          targetR = isOuter ? 98 : 62;
                          currentAngleDeg = ((hNum % 12) * 30) - 90;
                          tipSize = isOuter ? 30 : 26;
                        } else {
                          targetR = 96;
                          currentAngleDeg = (mNum * 6) - 90;
                          tipSize = 28;
                        }

                        const rad = (currentAngleDeg * Math.PI) / 180;
                        const handLength = targetR;
                        const cX = 130 + (handLength / 2) * Math.cos(rad);
                        const cY = 130 + (handLength / 2) * Math.sin(rad);
                        const handLeft = cX - handLength / 2;
                        const handTop = cY - 1;

                        const tipX = 130 + targetR * Math.cos(rad);
                        const tipY = 130 + targetR * Math.sin(rad);
                        const tipLeft = tipX - tipSize / 2;
                        const tipTop = tipY - tipSize / 2;

                        const isCustomMinute = clockDialMode === 'minute' && mNum % 5 !== 0;

                        return (
                          <View
                            style={styles.dialFaceCircle}
                            onStartShouldSetResponder={() => true}
                            onMoveShouldSetResponder={() => true}
                            onResponderGrant={(evt) => {
                              const { locationX, locationY } = evt.nativeEvent;
                              if (typeof locationX !== 'number' || typeof locationY !== 'number') return;
                              const dx = locationX - 130;
                              const dy = locationY - 130;
                              const dist = Math.sqrt(dx * dx + dy * dy);
                              if (dist < 10) return;
                              const aRad = Math.atan2(dy, dx);
                              const cDeg = (aRad * (180 / Math.PI) + 90 + 360) % 360;
                              if (clockDialMode === 'hour') {
                                const hStr = calculateDialHour(cDeg, dist);
                                setFormScheduleHour(hStr);
                                setFormScheduleTime(`${hStr}:${formScheduleMinute}`);
                                if (formError) setFormError(null);
                              } else {
                                const mStr = calculateDialMinute(cDeg);
                                setFormScheduleMinute(mStr);
                                setFormScheduleTime(`${formScheduleHour}:${mStr}`);
                                if (formError) setFormError(null);
                              }
                            }}
                            onResponderMove={(evt) => {
                              const { locationX, locationY } = evt.nativeEvent;
                              if (typeof locationX !== 'number' || typeof locationY !== 'number') return;
                              const dx = locationX - 130;
                              const dy = locationY - 130;
                              const dist = Math.sqrt(dx * dx + dy * dy);
                              if (dist < 10) return;
                              const aRad = Math.atan2(dy, dx);
                              const cDeg = (aRad * (180 / Math.PI) + 90 + 360) % 360;
                              if (clockDialMode === 'hour') {
                                const hStr = calculateDialHour(cDeg, dist);
                                setFormScheduleHour(hStr);
                                setFormScheduleTime(`${hStr}:${formScheduleMinute}`);
                                if (formError) setFormError(null);
                              } else {
                                const mStr = calculateDialMinute(cDeg);
                                setFormScheduleMinute(mStr);
                                setFormScheduleTime(`${formScheduleHour}:${mStr}`);
                                if (formError) setFormError(null);
                              }
                            }}
                            onResponderRelease={() => {
                              if (clockDialMode === 'hour') {
                                setClockDialMode('minute');
                              }
                            }}
                          >
                            {/* Track lingkaran panduan halus */}
                            <View style={styles.dialTrackRingOuter} />
                            <View style={styles.dialTrackRingInner} />

                            {/* Jarum Indikator dari Pusat ke Posisi Terpilih */}
                            <View
                              style={[
                                styles.dialHandLine,
                                {
                                  width: handLength,
                                  left: handLeft,
                                  top: handTop,
                                  transform: [{ rotate: `${currentAngleDeg}deg` }],
                                },
                              ]}
                            />

                            {/* Titik Pusat Dial */}
                            <View style={styles.dialCenterPivot} />

                            {/* Titik/Lingkaran Indikator pada Ujung Jarum */}
                            <View
                              style={[
                                styles.dialTipHighlight,
                                {
                                  width: tipSize,
                                  height: tipSize,
                                  borderRadius: tipSize / 2,
                                  left: tipLeft,
                                  top: tipTop,
                                },
                              ]}
                            >
                              {isCustomMinute && (
                                <Text style={styles.dialTipCustomMinuteText}>{mNum}</Text>
                              )}
                            </View>

                            {/* Angka-angka Dial Sesuai Mode */}
                            {clockDialMode === 'hour' ? (
                              <>
                                {/* Ring Luar: Jam 12 s/d 23 */}
                                {[12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((h) => {
                                  const hStr = String(h);
                                  const isSelected = formScheduleHour === hStr;
                                  const aDeg = ((h % 12) * 30) - 90;
                                  const aRad = (aDeg * Math.PI) / 180;
                                  const x = 130 + 98 * Math.cos(aRad) - 15;
                                  const y = 130 + 98 * Math.sin(aRad) - 15;

                                  return (
                                    <TouchableOpacity
                                      key={`hour-outer-${h}`}
                                      style={[
                                        styles.dialNumberItem,
                                        { left: x, top: y, width: 30, height: 30, borderRadius: 15 },
                                      ]}
                                      onPress={() => {
                                        setFormScheduleHour(hStr);
                                        setFormScheduleTime(`${hStr}:${formScheduleMinute}`);
                                        if (formError) setFormError(null);
                                        setClockDialMode('minute');
                                      }}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Jam ${hStr}`}
                                    >
                                      <Text
                                        style={[
                                          styles.dialNumberText,
                                          isSelected && styles.dialNumberTextSelected,
                                        ]}
                                      >
                                        {hStr}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}

                                {/* Ring Dalam: Jam 00 s/d 11 */}
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((h) => {
                                  const hStr = String(h).padStart(2, '0');
                                  const isSelected = formScheduleHour === hStr;
                                  const aDeg = (h * 30) - 90;
                                  const aRad = (aDeg * Math.PI) / 180;
                                  const x = 130 + 62 * Math.cos(aRad) - 13;
                                  const y = 130 + 62 * Math.sin(aRad) - 13;

                                  return (
                                    <TouchableOpacity
                                      key={`hour-inner-${h}`}
                                      style={[
                                        styles.dialNumberItem,
                                        { left: x, top: y, width: 26, height: 26, borderRadius: 13 },
                                      ]}
                                      onPress={() => {
                                        setFormScheduleHour(hStr);
                                        setFormScheduleTime(`${hStr}:${formScheduleMinute}`);
                                        if (formError) setFormError(null);
                                        setClockDialMode('minute');
                                      }}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Jam ${hStr}`}
                                    >
                                      <Text
                                        style={[
                                          styles.dialNumberTextInner,
                                          isSelected && styles.dialNumberTextSelected,
                                        ]}
                                      >
                                        {hStr}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </>
                            ) : (
                              <>
                                {/* Dial Menit: 00, 05, 10, 15, ..., 55 */}
                                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                                  const mStr = String(m).padStart(2, '0');
                                  const isSelected = formScheduleMinute === mStr;
                                  const aDeg = (m * 6) - 90;
                                  const aRad = (aDeg * Math.PI) / 180;
                                  const x = 130 + 96 * Math.cos(aRad) - 14;
                                  const y = 130 + 96 * Math.sin(aRad) - 14;

                                  return (
                                    <TouchableOpacity
                                      key={`min-${m}`}
                                      style={[
                                        styles.dialNumberItem,
                                        { left: x, top: y, width: 28, height: 28, borderRadius: 14 },
                                      ]}
                                      onPress={() => {
                                        setFormScheduleMinute(mStr);
                                        setFormScheduleTime(`${formScheduleHour}:${mStr}`);
                                        if (formError) setFormError(null);
                                      }}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Menit ${mStr}`}
                                    >
                                      <Text
                                        style={[
                                          styles.dialNumberText,
                                          isSelected && styles.dialNumberTextSelected,
                                        ]}
                                      >
                                        {mStr}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </>
                            )}
                          </View>
                        );
                      })()}

                      {/* Kontrol Penyesuaian Menit Halus (00–59) */}
                      <View style={styles.minuteAdjustRow}>
                        <Text style={styles.minuteAdjustLabel}>Penyelarasan Menit:</Text>
                        <View style={styles.stepperBtnsGroup}>
                          {[
                            { label: '-5m', delta: -5 },
                            { label: '-1m', delta: -1 },
                            { label: '+1m', delta: 1 },
                            { label: '+5m', delta: 5 },
                          ].map((s) => (
                            <TouchableOpacity
                              key={s.label}
                              style={styles.stepperBtn}
                              onPress={() => {
                                const cur = parseInt(formScheduleMinute, 10) || 0;
                                const next = (cur + s.delta + 60) % 60;
                                const mStr = String(next).padStart(2, '0');
                                setFormScheduleMinute(mStr);
                                setFormScheduleTime(`${formScheduleHour}:${mStr}`);
                                if (formError) setFormError(null);
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`Ubah menit ${s.label}`}
                            >
                              <Text style={styles.stepperBtnText}>{s.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>

                      {/* Input Alternatif yang Aksesibel (Ketik Angka Terkontrol) */}
                      <View style={styles.accessibleInputContainer}>
                        <Text style={styles.accessibleInputLabel}>Input Jam & Menit Manual:</Text>
                        <View style={styles.accessibleInputBoxRow}>
                          <TextInput
                            style={styles.accessibleDigitInput}
                            value={formScheduleHour}
                            onChangeText={(val) => {
                              const clean = val.replace(/[^0-9]/g, '').slice(0, 2);
                              if (!clean) {
                                setFormScheduleHour('');
                                return;
                              }
                              const num = parseInt(clean, 10);
                              if (num >= 0 && num <= 23) {
                                const padded = String(num).padStart(2, '0');
                                setFormScheduleHour(padded);
                                setFormScheduleTime(`${padded}:${formScheduleMinute}`);
                                if (formError) setFormError(null);
                              }
                            }}
                            onBlur={() => {
                              if (!formScheduleHour) setFormScheduleHour('09');
                              else setFormScheduleHour(formScheduleHour.padStart(2, '0'));
                            }}
                            keyboardType="number-pad"
                            maxLength={2}
                            placeholder="09"
                            placeholderTextColor="#94A3B8"
                            accessibilityLabel="Ketik jam 00-23"
                          />
                          <Text style={styles.accessibleColon}>:</Text>
                          <TextInput
                            style={styles.accessibleDigitInput}
                            value={formScheduleMinute}
                            onChangeText={(val) => {
                              const clean = val.replace(/[^0-9]/g, '').slice(0, 2);
                              if (!clean) {
                                setFormScheduleMinute('');
                                return;
                              }
                              const num = parseInt(clean, 10);
                              if (num >= 0 && num <= 59) {
                                const padded = String(num).padStart(2, '0');
                                setFormScheduleMinute(padded);
                                setFormScheduleTime(`${formScheduleHour}:${padded}`);
                                if (formError) setFormError(null);
                              }
                            }}
                            onBlur={() => {
                              if (!formScheduleMinute) setFormScheduleMinute('00');
                              else setFormScheduleMinute(formScheduleMinute.padStart(2, '0'));
                            }}
                            keyboardType="number-pad"
                            maxLength={2}
                            placeholder="00"
                            placeholderTextColor="#94A3B8"
                            accessibilityLabel="Ketik menit 00-59"
                          />
                          <View style={styles.accessibleTzPill}>
                            <Text style={styles.accessibleTzText}>WIB</Text>
                          </View>
                        </View>
                      </View>

                      {/* Preset Waktu Populer */}
                      <View style={styles.presetQuickRow}>
                        {[
                          { label: 'Pagi 09:00', h: '09', m: '00' },
                          { label: 'Siang 13:30', h: '13', m: '30' },
                          { label: 'Sore 16:00', h: '16', m: '00' },
                          { label: 'Malam 19:30', h: '19', m: '30' },
                        ].map((p) => {
                          const active =
                            formScheduleHour === p.h && formScheduleMinute === p.m;
                          return (
                            <TouchableOpacity
                              key={p.label}
                              style={[
                                styles.presetPillBtn,
                                active && styles.presetPillBtnActive,
                              ]}
                              onPress={() => {
                                setFormScheduleHour(p.h);
                                setFormScheduleMinute(p.m);
                                setFormScheduleTime(`${p.h}:${p.m}`);
                                if (formError) setFormError(null);
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`Pilih preset ${p.label}`}
                            >
                              <Text
                                style={[
                                  styles.presetPillText,
                                  active && styles.presetPillTextActive,
                                ]}
                              >
                                {p.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>

                  {/* ========================================== */}
                  {/* RINGKASAN JADWAL TERPADU & STATUS REAL-TIME */}
                  {/* ========================================== */}
                  <View style={styles.scheduleSummaryBox}>
                    {(() => {
                      const checkMs = new Date(
                        `${formScheduleDate}T${formScheduleHour}:${formScheduleMinute}:00+07:00`
                      ).getTime();
                      const isFuture = !isNaN(checkMs) && checkMs > Date.now();

                      return (
                        <>
                          <View style={styles.scheduleSummaryHeaderRow}>
                            <View style={styles.scheduleSummaryTitleGroup}>
                              <AppIcon name="clock" size={14} color={COLORS.forestDark} />
                              <Text style={styles.scheduleSummaryTitle}>
                                RINGKASAN JADWAL TERPILIH
                              </Text>
                            </View>
                            <View
                              style={
                                isFuture
                                  ? styles.scheduleBadgeFuture
                                  : styles.scheduleBadgeExpired
                              }
                            >
                              <View
                                style={
                                  isFuture
                                    ? styles.scheduleBadgeDotFuture
                                    : styles.scheduleBadgeDotExpired
                                }
                              />
                              <Text
                                style={
                                  isFuture
                                    ? styles.scheduleBadgeTextFuture
                                    : styles.scheduleBadgeTextExpired
                                }
                              >
                                {isFuture
                                  ? 'Jadwal Valid (Masa Depan)'
                                  : 'Waktu Sudah Terlewat'}
                              </Text>
                            </View>
                          </View>

                          <Text style={styles.scheduleSummaryFormatted}>
                            🗓️ {formatScheduleDisplay(
                              formScheduleDate,
                              `${formScheduleHour}:${formScheduleMinute}`
                            )}
                          </Text>

                          {/* Jika mengedit dan mengubah jadwal lama */}
                          {activeCampaign?.scheduledAt && (
                            <View style={styles.scheduleOldNoticeCard}>
                              <AppIcon name="refresh" size={13} color="#64748B" />
                              <Text style={styles.scheduleOldNoticeText}>
                                Jadwal Sebelumnya: {activeCampaign.scheduledAt}
                              </Text>
                            </View>
                          )}

                          {/* Peringatan waktu lampau */}
                          {!isFuture && !isNaN(checkMs) && (
                            <View style={styles.scheduleExpiredAlert}>
                              <AppIcon name="alert" size={14} color="#DC2626" />
                              <Text style={styles.scheduleExpiredAlertText}>
                                Waktu yang dipilih sudah terlewat ({formatScheduleDisplay(formScheduleDate, `${formScheduleHour}:${formScheduleMinute}`)}). Silakan pilih tanggal atau jam di masa depan sebelum menjadwalkan kampanye.
                              </Text>
                            </View>
                          )}
                        </>
                      );
                    })()}
                  </View>
                </View>
              )}

              {/* 6. Ringkasan Kampanye dan Jumlah Penerima */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>6. Ringkasan Kampanye</Text>
                <View style={styles.summaryCardBox}>
                  <View style={styles.summaryRowItem}>
                    <Text style={styles.summaryRowLabel}>Nama Kampanye:</Text>
                    <Text style={styles.summaryRowValue}>{formName.trim() || '(Belum diisi)'}</Text>
                  </View>
                  <View style={styles.summaryRowItem}>
                    <Text style={styles.summaryRowLabel}>Jumlah Penerima:</Text>
                    <Text
                      style={[
                        styles.summaryRowValue,
                        {
                          color: selectedContactIds.length === 0 ? '#DC2626' : '#059669',
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {selectedContactIds.length === 0
                        ? '0 kontak (Wajib pilih minimal 1 penerima)'
                        : `${selectedContactIds.length} kontak terpilih (${targetSummary.valid} nomor valid siap kirim)`}
                    </Text>
                  </View>
                  <View style={styles.summaryRowItem}>
                    <Text style={styles.summaryRowLabel}>Metode Pengiriman:</Text>
                    <Text style={[styles.summaryRowValue, { color: COLORS.forestDark, fontWeight: '600' }]}>
                      {formDeliveryMode === 'now'
                        ? '⚡ Kirim Sekarang (Antrean Persisten Worker)'
                        : formDeliveryMode === 'scheduled'
                        ? `📅 Terjadwal: ${formatScheduleDisplay(formScheduleDate, `${formScheduleHour}:${formScheduleMinute}`)}`
                        : '📝 Simpan sebagai Draf'}
                    </Text>
                  </View>
                  <View style={styles.summaryRowItem}>
                    <Text style={styles.summaryRowLabel}>Akun Pengirim:</Text>
                    <Text style={styles.summaryRowValue}>
                      {connectedSenderPhone
                        ? `${connectedSenderPhone} (WhatsApp Worker Aktif)`
                        : 'Worker WhatsApp Staging (+6285641886993)'}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* 7. Modal Actions: Tombol Simpan Draft atau Buat Kampanye */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setIsFormModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.btnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.btnSubmit,
                  (isSubmitting || (!activeCampaign && selectedContactIds.length === 0)) && { opacity: 0.7 },
                ]}
                onPress={handleSaveCampaign}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnSubmitText}>
                    {activeCampaign
                      ? 'Simpan Pembaruan'
                      : formDeliveryMode === 'draft'
                      ? 'Simpan Draf'
                      : formDeliveryMode === 'now'
                      ? 'Tinjau & Kirim Sekarang →'
                      : 'Tinjau & Jadwalkan →'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 4.2. MODAL PEMILIH KONTAK PENERIMA         */}
      {/* ========================================== */}
      <Modal
        visible={isContactPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsContactPickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsContactPickerOpen(false)}
          />

          <View style={[styles.modalDialog, { maxWidth: 620, maxHeight: '90%' }]}>
            {/* Header Modal Pemilih Kontak */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Pilih Kontak Penerima Kampanye</Text>
                <Text style={styles.modalSubtitle}>
                  Pilih satu atau beberapa kontak tersimpan untuk menjadi target antrean siaran
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsContactPickerOpen(false)}
              >
                <AppIcon name="close" size={16} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            {/* Pencarian dan Filter Label */}
            <View style={styles.contactPickerFilterBar}>
              <View style={styles.contactSearchInputBox}>
                <AppIcon name="search" size={14} color={COLORS.textMuted} />
                <TextInput
                  style={styles.contactSearchTextInput}
                  placeholder="Cari berdasarkan nama atau nomor WhatsApp..."
                  placeholderTextColor={COLORS.textMuted}
                  value={contactSearch}
                  onChangeText={setContactSearch}
                />
                {contactSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setContactSearch('')}>
                    <AppIcon name="close" size={13} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Filter Label Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
              >
                {(['Semua', 'Calon Santri', 'Orang Tua', 'Santri Aktif', 'Alumni', 'Umum'] as const).map(
                  (lbl) => (
                    <TouchableOpacity
                      key={lbl}
                      style={[
                        styles.pickerFilterPill,
                        contactLabelFilter === lbl && styles.pickerFilterPillActive,
                      ]}
                      onPress={() => setContactLabelFilter(lbl)}
                    >
                      <Text
                        style={[
                          styles.pickerFilterPillText,
                          contactLabelFilter === lbl && styles.pickerFilterPillTextActive,
                        ]}
                      >
                        {lbl}
                      </Text>
                    </TouchableOpacity>
                  )
                )}
              </ScrollView>

              {/* Baris Tombol Aksi Masal: Pilih Semua & Batalkan Pilihan */}
              <View style={styles.pickerBulkActionBar}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.btnBulkSelectAll}
                    onPress={handleSelectAllContacts}
                  >
                    <AppIcon name="check" size={13} color="#047857" />
                    <Text style={styles.btnBulkSelectAllText}>
                      Pilih Semua ({filteredModalContacts.filter((c) => isValidPhoneNumber(c.phone)).length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnBulkDeselect}
                    onPress={handleDeselectAllContacts}
                  >
                    <Text style={styles.btnBulkDeselectText}>Batalkan Pilihan</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.pickerCountIndicator}>
                  <Text style={styles.pickerCountIndicatorText}>
                    {selectedContactIds.length} kontak dipilih
                  </Text>
                </View>
              </View>
            </View>

            {/* Daftar Kontak dengan Checkbox */}
            <ScrollView style={styles.contactListScrollView} showsVerticalScrollIndicator={true}>
              {filteredModalContacts.length === 0 ? (
                <View style={styles.emptyContactsNotice}>
                  <AppIcon name="users" size={24} color={COLORS.textMuted} />
                  <Text style={styles.emptyContactsNoticeTitle}>Tidak Ada Kontak Ditemukan</Text>
                  <Text style={styles.emptyContactsNoticeDesc}>
                    Tidak ada kontak yang cocok dengan kata kunci atau filter label terpilih.
                  </Text>
                </View>
              ) : (
                filteredModalContacts.map((contact) => {
                  const isPhoneValid = isValidPhoneNumber(contact.phone);
                  const isChecked = selectedContactIds.includes(contact.id);
                  const hasOptOut =
                    Boolean((contact as any).is_opted_out) ||
                    (Array.isArray(contact.labels) &&
                      (contact.labels.includes('opt-out') ||
                        contact.labels.includes('optout') ||
                        contact.labels.includes('berhenti')));

                  return (
                    <TouchableOpacity
                      key={contact.id}
                      style={[
                        styles.contactPickerRow,
                        isChecked && styles.contactPickerRowChecked,
                        !isPhoneValid && styles.contactPickerRowDisabled,
                      ]}
                      onPress={() => handleToggleContact(contact.id, contact.phone)}
                      disabled={!isPhoneValid}
                    >
                      {/* Checkbox Indikator */}
                      <View
                        style={[
                          styles.checkboxBox,
                          isChecked && styles.checkboxBoxChecked,
                          !isPhoneValid && styles.checkboxBoxDisabled,
                        ]}
                      >
                        {isChecked ? (
                          <AppIcon name="check" size={12} color="#FFFFFF" />
                        ) : !isPhoneValid ? (
                          <View style={styles.disabledDash} />
                        ) : null}
                      </View>

                      {/* Avatar Kontak */}
                      <View style={styles.contactPickerAvatar}>
                        <Text style={styles.contactPickerAvatarText}>
                          {(contact.name || '?').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>

                      {/* Detail Kontak */}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.contactPickerName} numberOfLines={1}>
                            {contact.name}
                          </Text>
                          {contact.label && (
                            <View style={styles.contactPickerLabelBadge}>
                              <Text style={styles.contactPickerLabelText}>{contact.label}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.contactPickerPhone}>{contact.phone}</Text>
                      </View>

                      {/* Status Badges */}
                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        {!isPhoneValid ? (
                          <View style={styles.badgeInvalidPhone}>
                            <Text style={styles.badgeInvalidPhoneText}>Nomor Tidak Valid</Text>
                          </View>
                        ) : hasOptOut ? (
                          <View style={styles.badgeOptOut}>
                            <Text style={styles.badgeOptOutText}>Opt-Out</Text>
                          </View>
                        ) : isChecked ? (
                          <View style={styles.badgeReady}>
                            <Text style={styles.badgeReadyText}>Terpilih</Text>
                          </View>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* Footer Modal Pemilih Kontak */}
            <View style={styles.contactPickerFooter}>
              <View>
                <Text style={styles.pickerFooterSummaryText}>
                  Total: <Text style={{ fontWeight: '700' }}>{selectedContactIds.length} kontak</Text> terpilih
                </Text>
                <Text style={styles.pickerFooterSubText}>
                  {targetSummary.valid} nomor valid siap menerima siaran
                </Text>
              </View>

              <TouchableOpacity
                style={styles.btnConfirmContactSelection}
                onPress={() => setIsContactPickerOpen(false)}
              >
                <Text style={styles.btnConfirmContactSelectionText}>
                  Selesai Memilih ({selectedContactIds.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 4.5. MODAL TINJAUAN PENERIMA & KONFIRMASI */}
      {/* ========================================== */}
      <Modal
        visible={isReviewModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsReviewModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsReviewModalOpen(false)}
          />

          <View style={[styles.modalDialog, { maxWidth: 520 }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Tinjau Rincian Pengiriman Kampanye</Text>
                <Text style={styles.modalSubtitle}>
                  Periksa jumlah penerima dan akun pengirim sebelum konfirmasi eksekusi
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsReviewModalOpen(false)}
              >
                <AppIcon name="close" size={16} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalFormBody} showsVerticalScrollIndicator={false}>
              {/* Grid Ringkasan Penerima */}
              <View style={styles.reviewGrid}>
                <View style={[styles.reviewCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                  <Text style={[styles.reviewNumber, { color: '#16A34A' }]}>{targetSummary.valid}</Text>
                  <Text style={styles.reviewLabel}>Siap Dikirim</Text>
                </View>

                <View style={[styles.reviewCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                  <Text style={[styles.reviewNumber, { color: '#D97706' }]}>{targetSummary.optOut}</Text>
                  <Text style={styles.reviewLabel}>Opt-Out (Dilewati)</Text>
                </View>

                <View style={[styles.reviewCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                  <Text style={[styles.reviewNumber, { color: '#DC2626' }]}>{targetSummary.invalid}</Text>
                  <Text style={styles.reviewLabel}>Nomor Tak Valid</Text>
                </View>

                <View style={[styles.reviewCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                  <Text style={[styles.reviewNumber, { color: '#475569' }]}>{targetSummary.total}</Text>
                  <Text style={styles.reviewLabel}>Total Kontak</Text>
                </View>
              </View>

              {/* Rincian Konfigurasi */}
              <View style={styles.reviewDetailBox}>
                <View style={styles.reviewDetailRow}>
                  <Text style={styles.reviewDetailLabel}>Nama Kampanye:</Text>
                  <Text style={styles.reviewDetailVal}>{formName}</Text>
                </View>
                <View style={styles.reviewDetailRow}>
                  <Text style={styles.reviewDetailLabel}>Metode Pengiriman:</Text>
                  <Text style={[styles.reviewDetailVal, { color: formDeliveryMode === 'now' ? '#059669' : '#1D4ED8', fontWeight: '700' }]}>
                    {formDeliveryMode === 'now'
                      ? '⚡ Kirim Sekarang (Antrean Persisten Worker)'
                      : `🕒 Terjadwal: ${formatScheduleDisplay(formScheduleDate, `${formScheduleHour}:${formScheduleMinute}`)}`}
                  </Text>
                </View>
                <View style={styles.reviewDetailRow}>
                  <Text style={styles.reviewDetailLabel}>Akun Pengirim:</Text>
                  <Text style={styles.reviewDetailVal}>
                    {connectedSenderPhone || '+6285641886993 (Staging)'}
                  </Text>
                </View>
              </View>

              {/* Cuplikan Pesan */}
              <View style={styles.reviewMessageBox}>
                <Text style={styles.reviewMessageLabel}>Cuplikan Pesan:</Text>
                <Text style={styles.reviewMessageText} numberOfLines={4}>
                  {formMessage}
                </Text>
              </View>

              <Text style={styles.reviewNoteText}>
                🛡️ Sistem akan menyaring otomatis nomor yang tidak valid dan penerima yang telah memilih opt-out. Pesan akan dikirim dengan jeda aman untuk mematuhi kebijakan anti-spam.
              </Text>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setIsReviewModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.btnCancelText}>Kembali & Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSubmit, isSubmitting && { opacity: 0.7 }]}
                onPress={handleConfirmExecution}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnSubmitText}>
                    {formDeliveryMode === 'now' ? '🚀 Konfirmasi & Mulai Kirim' : '📅 Konfirmasi Jadwal'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 5. MODAL DETAIL KAMPANYE                   */}
      {/* ========================================== */}
      <Modal
        visible={isDetailModalOpen && activeCampaign !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDetailModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsDetailModalOpen(false)}
          />

          {activeCampaign && (
            <View style={styles.modalDialog}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.modalTitle}>{activeCampaign.name}</Text>
                  <Text style={styles.modalSubtitle}>Detail data kampanye resmi dalam database Supabase</Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setIsDetailModalOpen(false)}
                >
                  <AppIcon name="close" size={16} color={COLORS.textDark} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalFormBody} showsVerticalScrollIndicator={false}>
                {/* Status & Metadata Strip */}
                <View style={styles.detailMetaGrid}>
                  <View style={styles.detailMetaCard}>
                    <Text style={styles.detailMetaLabel}>Status Saat Ini</Text>
                    <View style={{ marginTop: 4 }}>
                      <CampaignStatusBadge status={activeCampaign.status} />
                    </View>
                  </View>

                  <View style={styles.detailMetaCard}>
                    <Text style={styles.detailMetaLabel}>Waktu Pembuatan</Text>
                    <Text style={styles.detailMetaValue}>
                      {activeCampaign.createdAt || 'Baru saja'}
                    </Text>
                  </View>

                  <View style={styles.detailMetaCard}>
                    <Text style={styles.detailMetaLabel}>Jadwal Pengiriman</Text>
                    <Text style={styles.detailMetaValue}>
                      {activeCampaign.scheduledAt ? activeCampaign.scheduledAt : 'Belum Dijadwalkan'}
                    </Text>
                  </View>

                  <View style={styles.detailMetaCard}>
                    <Text style={styles.detailMetaLabel}>Kanal & Status Gateway</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
                      <Text style={[styles.detailMetaValue, { fontWeight: '600' }]}>
                        {activeCampaign.channel}
                      </Text>
                      <GatewayStatusBadge status={gatewayStatus} />
                    </View>
                    {gatewayStatus?.code !== 'ready' && (
                      <Text style={{ fontSize: 11, color: '#B45309', marginTop: 4, lineHeight: 15 }}>
                        {gatewayStatus?.message || 'Gateway belum terhubung. Antrean penerima ditahan aman di server.'}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Metrik Pengiriman */}
                <View style={[styles.detailMetaGrid, { marginTop: 10 }]}>
                  <View style={styles.detailMetaCard}>
                    <Text style={styles.detailMetaLabel}>Total Penerima</Text>
                    <Text style={[styles.detailMetaValue, { fontWeight: '700' }]}>
                      {activeCampaign.totalRecipients || 0}
                    </Text>
                  </View>
                  <View style={styles.detailMetaCard}>
                    <Text style={styles.detailMetaLabel}>Terkirim</Text>
                    <Text style={[styles.detailMetaValue, { color: '#16A34A', fontWeight: '700' }]}>
                      {activeCampaign.sentCount || 0}
                    </Text>
                  </View>
                  <View style={styles.detailMetaCard}>
                    <Text style={styles.detailMetaLabel}>Gagal</Text>
                    <Text style={[styles.detailMetaValue, { color: '#DC2626', fontWeight: '700' }]}>
                      {activeCampaign.failedCount || 0}
                    </Text>
                  </View>
                  <View style={styles.detailMetaCard}>
                    <Text style={styles.detailMetaLabel}>Dilewati</Text>
                    <Text style={[styles.detailMetaValue, { color: '#D97706', fontWeight: '700' }]}>
                      {activeCampaign.skippedCount || 0}
                    </Text>
                  </View>
                </View>

                {/* Tombol Lihat Status Penerima */}
                <TouchableOpacity
                  style={[styles.btnSubmit, { backgroundColor: COLORS.forestDark, marginVertical: 10 }]}
                  onPress={() => handleOpenRecipients(activeCampaign)}
                >
                  <Text style={styles.btnSubmitText}>
                    👥 Lihat Status Tiap Penerima ({activeCampaign.totalRecipients || 0})
                  </Text>
                </TouchableOpacity>

                {/* Info Pengiriman WhatsApp Staging */}
                <View style={styles.warningAlertBox}>
                  <Text style={styles.warningAlertText}>
                    📡 Pengiriman kampanye dieksekusi secara nyata oleh Baileys socket worker dengan antrean persisten di database Supabase.
                  </Text>
                </View>

                {/* Pratinjau Pesan WhatsApp */}
                <View style={[styles.previewSection, { marginTop: 14 }]}>
                  <Text style={styles.previewSectionTitle}>Isi Pesan Siaran:</Text>
                  <View style={styles.waPreviewContainer}>
                    <View style={styles.waPreviewHeader}>
                      <View style={styles.waAvatarDot} />
                      <Text style={styles.waPreviewHeaderText}>WABiz Official Broadcast</Text>
                    </View>
                    <View style={styles.waBubble}>
                      <Text style={styles.waBubbleText}>{activeCampaign.messageContent}</Text>
                      <View style={styles.waBubbleFooter}>
                        <Text style={styles.waTime}>10:00</Text>
                        <AppIcon name="check" size={11} color={COLORS.emerald} />
                      </View>
                    </View>
                  </View>
                </View>
              </ScrollView>

              {/* Actions Footer */}
              <View style={styles.modalFooterBetween}>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => handleOpenEditForm(activeCampaign)}
                  >
                    <AppIcon name="edit" size={13} color={COLORS.textDark} />
                    <Text style={styles.btnSecondaryText}>Edit Kampanye</Text>
                  </TouchableOpacity>

                  {activeCampaign.status === 'Terjadwal' && (
                    <TouchableOpacity
                      style={[styles.btnCancel, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
                      onPress={() => handleCancelSchedule(activeCampaign)}
                    >
                      <Text style={[styles.btnCancelText, { color: '#DC2626' }]}>Batalkan Jadwal</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => {
                      handleDuplicateCampaign(activeCampaign);
                      setIsDetailModalOpen(false);
                    }}
                  >
                    <AppIcon name="copy" size={13} color={COLORS.textDark} />
                    <Text style={styles.btnSecondaryText}>Duplikasikan</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={() => setIsDetailModalOpen(false)}
                >
                  <Text style={styles.btnCancelText}>Tutup</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 5.5. MODAL STATUS TIAP PENERIMA KAMPANYE  */}
      {/* ========================================== */}
      <Modal
        visible={isRecipientsModalOpen && activeCampaign !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRecipientsModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsRecipientsModalOpen(false)}
          />

          {activeCampaign && (
            <View style={[styles.modalDialog, { maxWidth: 640, maxHeight: '85%' }]}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.modalTitle}>Status Penerima: {activeCampaign.name}</Text>
                  <Text style={styles.modalSubtitle}>
                    Pemantauan status pengiriman riil per nomor WhatsApp dalam antrean persisten
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setIsRecipientsModalOpen(false)}
                >
                  <AppIcon name="close" size={16} color={COLORS.textDark} />
                </TouchableOpacity>
              </View>

              {/* Alert jika Gateway belum siap dan ada antrean pending */}
              {activeCampaign.status === 'Berjalan' &&
                recipientMetrics.pending + recipientMetrics.processing > 0 &&
                gatewayStatus?.code !== 'ready' && (
                  <View
                    style={{
                      marginHorizontal: 16,
                      marginTop: 8,
                      marginBottom: 4,
                      padding: 10,
                      borderRadius: 8,
                      backgroundColor: '#FFFBEB',
                      borderColor: '#FDE68A',
                      borderWidth: 1,
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <AppIcon name="clock" size={16} color="#B45309" />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E' }}>
                          Pengiriman Tertunda: {gatewayStatus?.label || 'Menunggu koneksi gateway'}
                        </Text>
                        <GatewayStatusBadge status={gatewayStatus} />
                      </View>
                      <Text style={{ fontSize: 11, color: '#78350F', marginTop: 2, lineHeight: 15 }}>
                        {gatewayStatus?.message ||
                          'Gateway WhatsApp belum terhubung. Antrean penerima ditahan aman di server tanpa mengurangi jatah retry sampai gateway terhubung.'}
                      </Text>
                    </View>
                  </View>
                )}

              {/* Metrik Bar */}
              <View style={styles.recipientMetricsBar}>
                <View style={styles.metricPill}>
                  <Text style={styles.metricPillNum}>{recipientMetrics.total}</Text>
                  <Text style={styles.metricPillLbl}>Total</Text>
                </View>
                <View style={[styles.metricPill, { backgroundColor: '#ECFDF5' }]}>
                  <Text style={[styles.metricPillNum, { color: '#047857' }]}>
                    {recipientMetrics.sent + recipientMetrics.delivered}
                  </Text>
                  <Text style={styles.metricPillLbl}>Terkirim</Text>
                </View>
                <View style={[styles.metricPill, { backgroundColor: '#FEF2F2' }]}>
                  <Text style={[styles.metricPillNum, { color: '#B91C1C' }]}>{recipientMetrics.failed}</Text>
                  <Text style={styles.metricPillLbl}>Gagal</Text>
                </View>
                <View style={[styles.metricPill, { backgroundColor: '#FFFBEB' }]}>
                  <Text style={[styles.metricPillNum, { color: '#B45309' }]}>{recipientMetrics.skipped}</Text>
                  <Text style={styles.metricPillLbl}>Dilewati</Text>
                </View>
                <View style={[styles.metricPill, { backgroundColor: '#EFF6FF' }]}>
                  <Text style={[styles.metricPillNum, { color: '#1D4ED8' }]}>
                    {recipientMetrics.pending + recipientMetrics.processing}
                  </Text>
                  <Text style={styles.metricPillLbl}>Antrean</Text>
                </View>
              </View>

              {/* Filter Penerima */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[
                    { id: 'all', label: 'Semua' },
                    { id: 'sent', label: 'Terkirim' },
                    { id: 'delivered', label: 'Tersampaikan' },
                    { id: 'failed', label: 'Gagal' },
                    { id: 'skipped', label: 'Dilewati' },
                    { id: 'pending', label: 'Menunggu' },
                  ].map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={[
                        styles.filterTabPill,
                        recipientStatusFilter === f.id && styles.filterTabPillActive,
                      ]}
                      onPress={() => setRecipientStatusFilter(f.id)}
                    >
                      <Text
                        style={[
                          styles.filterTabText,
                          recipientStatusFilter === f.id && styles.filterTabTextActive,
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Daftar Penerima */}
              <ScrollView style={styles.modalFormBody} showsVerticalScrollIndicator={false}>
                {isLoadingRecipients ? (
                  <View style={{ padding: 30, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={COLORS.emerald} />
                    <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 8 }}>
                      Memuat antrean penerima...
                    </Text>
                  </View>
                ) : activeRecipients.length === 0 ? (
                  <View style={{ padding: 25, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                      Belum ada data penerima untuk kampanye ini.
                    </Text>
                  </View>
                ) : (
                  activeRecipients
                    .filter((r) =>
                      recipientStatusFilter === 'all'
                        ? true
                        : r.status === recipientStatusFilter ||
                          (recipientStatusFilter === 'sent' && r.status === 'delivered')
                    )
                    .map((r) => {
                      let badgeBg = '#F1F5F9';
                      let badgeText = '#475569';
                      let label: string = r.status;
                      if (r.status === 'sent') {
                        badgeBg = '#ECFDF5';
                        badgeText = '#047857';
                        label = 'Terkirim';
                      } else if (r.status === 'delivered') {
                        badgeBg = '#D1FAE5';
                        badgeText = '#065F46';
                        label = '✓✓ Tersampaikan';
                      } else if (r.status === 'failed') {
                        badgeBg = '#FEF2F2';
                        badgeText = '#B91C1C';
                        label = 'Gagal';
                      } else if (r.status === 'skipped') {
                        badgeBg = '#FFFBEB';
                        badgeText = '#B45309';
                        label = 'Dilewati';
                      } else if (r.status === 'processing') {
                        badgeBg = '#EFF6FF';
                        badgeText = '#1D4ED8';
                        label = 'Diproses';
                      } else if (r.status === 'pending') {
                        if (gatewayStatus && gatewayStatus.code !== 'ready') {
                          badgeBg = '#FFFBEB';
                          badgeText = '#B45309';
                          label = 'Menunggu Gateway';
                        } else {
                          badgeBg = '#F8FAFC';
                          badgeText = '#64748B';
                          label = 'Menunggu';
                        }
                      }

                      return (
                        <View key={r.id} style={styles.recipientListItem}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.recipientName}>{r.name}</Text>
                            <Text style={styles.recipientPhone}>+{r.phone}</Text>
                            {r.errorMessage ? (
                              <Text style={styles.recipientErrorText}>{r.errorMessage}</Text>
                            ) : r.status === 'pending' && gatewayStatus && gatewayStatus.code !== 'ready' ? (
                              <Text style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
                                Tertunda: {gatewayStatus.label} ({gatewayStatus.providerDisplayName})
                              </Text>
                            ) : null}
                            {r.sentAt && (
                              <Text style={styles.recipientTimeText}>
                                Terkirim: {new Date(r.sentAt).toLocaleTimeString('id-ID')}
                              </Text>
                            )}
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                            <Text style={[styles.statusBadgeText, { color: badgeText }]}>{label}</Text>
                          </View>
                        </View>
                      );
                    })
                )}
              </ScrollView>

              <View style={styles.modalFooterBetween}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => handleOpenRecipients(activeCampaign)}
                  disabled={isLoadingRecipients}
                >
                  <AppIcon name="refresh" size={13} color={COLORS.textDark} />
                  <Text style={styles.btnSecondaryText}>Segarkan Status</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={() => setIsRecipientsModalOpen(false)}
                >
                  <Text style={styles.btnCancelText}>Tutup</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 6. MODAL KONFIRMASI HAPUS KAMPANYE         */}
      {/* ========================================== */}
      <Modal
        visible={isDeleteModalOpen && activeCampaign !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDeleteModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsDeleteModalOpen(false)}
          />

          {activeCampaign && (
            <View style={[styles.modalDialog, { maxWidth: 420 }]}>
              <View style={styles.dialogCenteredContent}>
                <View style={styles.iconCircleRed}>
                  <AppIcon name="trash" size={20} color="#DC2626" />
                </View>
                <Text style={styles.dialogTitle}>Hapus Kampanye Ini?</Text>
                <Text style={styles.dialogDesc}>
                  Apakah Anda yakin ingin menghapus kampanye{' '}
                  <Text style={{ fontWeight: '700' }}>&ldquo;{activeCampaign.name}&rdquo;</Text>? Data kampanye
                  akan dihapus permanen dari basis data Supabase organisasi Anda.
                </Text>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={() => setIsDeleteModalOpen(false)}
                  disabled={isDeleting}
                >
                  <Text style={styles.btnCancelText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnConfirmDelete, isDeleting && { opacity: 0.7 }]}
                  onPress={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.btnConfirmDeleteText}>Ya, Hapus Permanen</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ==========================================
// STYLING DETAIL KAMPANYE B2B SAAS
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    minWidth: 260,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  counterBadge: {
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  counterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  pageSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  btnCreateCampaign: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emerald,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 6,
  },
  btnCreateCampaignText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // Feedback Banner
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 10,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  feedbackWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  feedbackInfo: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  feedbackBannerText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },

  // Error Fetch Banner
  errorBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  btnRetry: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  btnRetryText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // Notice Banner
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  noticeBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.warningText,
    marginBottom: 2,
  },
  noticeBannerText: {
    fontSize: 11,
    color: COLORS.warningText,
    lineHeight: 16,
  },

  // Filter Section
  filterSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 12,
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    paddingHorizontal: 12,
    height: 38,
  },
  searchTextInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textDark,
    marginLeft: 8,
    paddingVertical: 0,
  },
  filterTabsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterTabPill: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  filterTabPillActive: {
    backgroundColor: COLORS.emeraldSubtle,
    borderColor: COLORS.emeraldBorder,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  filterTabTextActive: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },
  btnResetFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  btnResetFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
  },

  // Main Content Card
  contentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    minHeight: 380,
  },

  // Loading Box
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // Empty State
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 440,
    marginBottom: 18,
  },

  tableWrapper: {
    flex: 1,
  },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  thCell: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  tdCell: {
    justifyContent: 'center',
  },
  campNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 2,
  },
  campPurposeText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },
  targetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 5,
  },
  targetPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.forestDark,
  },
  targetCountSub: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  scheduleText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '600',
  },
  createdText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  actionBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  actionBtnSmallText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  actionBtnWarning: {
    borderColor: COLORS.warningBorder,
    backgroundColor: COLORS.warningBg,
  },
  actionBtnWarningText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.warningText,
  },
  actionBtnDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },

  // Mobile Cards
  mobileCardsList: {
    padding: 12,
  },
  mobileCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  mobileCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileCardTime: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  mobileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mobileActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    marginTop: 2,
  },
  mobileActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 4,
  },
  mobileActionBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
  },

  // Status Badge
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  gwBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    gap: 4,
  },
  gwBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Modal Structure
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalDialog: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
    maxWidth: 620,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: COLORS.surfaceMuted,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  modalSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
    borderRadius: 6,
  },
  modalFormBody: {
    padding: 18,
    gap: 14,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 7,
    marginHorizontal: 18,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
    fontWeight: '500',
  },
  formGroup: {
    gap: 6,
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  requiredStar: {
    color: '#DC2626',
  },
  inputField: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.textDark,
  },
  textareaField: {
    height: 90,
    textAlignVertical: 'top',
  },
  labelWithCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  charCountText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // Live WhatsApp Preview
  previewSection: {
    backgroundColor: '#E5DDD5',
    borderRadius: 9,
    padding: 12,
    marginBottom: 14,
  },
  previewSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B4A54',
    marginBottom: 8,
  },
  waPreviewContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
  },
  waPreviewHeader: {
    backgroundColor: COLORS.forestDark,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  waAvatarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.emerald,
  },
  waPreviewHeaderText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  waBubble: {
    backgroundColor: '#DCF8C6',
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderTopLeftRadius: 0,
    margin: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '85%',
  },
  waBubbleText: {
    fontSize: 12,
    color: COLORS.textDark,
    lineHeight: 16,
  },
  waBubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  waTime: {
    fontSize: 9,
    color: COLORS.textSecondary,
  },

  // Delivery Mode Selector
  deliveryModeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  modeOptionCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  modeOptionCardSelected: {
    borderColor: COLORS.emerald,
    backgroundColor: COLORS.emeraldSubtle,
  },
  modeOptionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  modeOptionTitleSelected: {
    color: COLORS.forestDark,
  },
  modeOptionDesc: {
    fontSize: 10,
    color: COLORS.textSecondary,
    lineHeight: 14,
  },
  scheduledInputsRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },

  // Modal Footer
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: COLORS.surfaceMuted,
  },
  modalFooterBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: COLORS.surfaceMuted,
    flexWrap: 'wrap',
    gap: 10,
  },
  btnCancel: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  btnSubmit: {
    backgroundColor: COLORS.emerald,
    borderRadius: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSubmitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },

  // Detail Modal Meta Grid
  detailMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  detailMetaCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
  },
  detailMetaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailMetaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
    marginTop: 2,
  },

  // Centered Dialogs
  dialogCenteredContent: {
    padding: 22,
    alignItems: 'center',
    textAlign: 'center',
  },
  iconCircleRed: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  dialogDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  warningAlertBox: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    borderRadius: 7,
    padding: 10,
  },
  warningAlertText: {
    fontSize: 11,
    color: COLORS.warningText,
    lineHeight: 16,
  },
  btnConfirmDelete: {
    backgroundColor: '#DC2626',
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnConfirmDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userRolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 6,
  },
  userRoleAdmin: {
    backgroundColor: '#EEF2FF',
  },
  userRoleMember: {
    backgroundColor: '#FEF3C7',
  },
  userRoleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4338CA',
  },

  // Phase 3 Campaign Execution & Recipient Tracking Styles
  senderPhoneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  senderPhoneText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  targetCountBanner: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 6,
  },
  targetCountBannerText: {
    fontSize: 11,
    color: COLORS.textDark,
  },
  reviewGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  reviewCard: {
    flex: 1,
    minWidth: 100,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  reviewNumber: {
    fontSize: 20,
    fontWeight: '800',
  },
  reviewLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  reviewDetailBox: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  reviewDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewDetailLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  reviewDetailVal: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  reviewMessageBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  reviewMessageLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  reviewMessageText: {
    fontSize: 12,
    color: COLORS.textDark,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  reviewNoteText: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 16,
    marginTop: 4,
  },
  recipientMetricsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
    flexWrap: 'wrap',
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  metricPillNum: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  metricPillLbl: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  recipientListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  recipientName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  recipientPhone: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  recipientErrorText: {
    fontSize: 10,
    color: '#DC2626',
    marginTop: 2,
  },
  recipientTimeText: {
    fontSize: 10,
    color: '#16A34A',
    marginTop: 2,
  },

  // ----------------------------------------
  // STYLING PILIH PENERIMA & CHIPS
  // ----------------------------------------
  recipientCountBadge: {
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recipientCountBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  recipientBoxCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  recipientActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  btnOpenPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.forestDark,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  btnOpenPickerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnClearPicker: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  btnClearPickerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#DC2626',
  },
  emptyRecipientAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
    padding: 10,
    marginTop: 4,
  },
  emptyRecipientAlertText: {
    flex: 1,
    fontSize: 12,
    color: '#B45309',
    lineHeight: 16,
  },
  chipsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  contactChipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: 200,
  },
  contactChipName: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  contactChipPhone: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  chipCloseBtn: {
    padding: 2,
  },
  chipMoreBadge: {
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  chipMoreText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },

  // ----------------------------------------
  // STYLING REDESAIN TOTAL: KALENDER BULANAN & DIAL JAM ANALOG
  // ----------------------------------------
  schedulerSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  wibBadgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EAF6F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C1E6D3',
  },
  wibBadgeTopText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  tzPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A36A',
  },
  schedulerSplitLayout: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  schedulerCalCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  schedulerClockCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },

  // Header Navigasi Kalender
  calHeaderNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  calNavArrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calNavArrowBtnDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#F1F5F9',
    opacity: 0.4,
  },
  calHeaderTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  calWeekdaysRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
  },
  calWeekdayColWrapper: {
    width: '14.285%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calWeekdayCol: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  calDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 3,
  },
  calDayBtnCell: {
    width: '14.285%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayBtnInner: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  calDayBtnInnerSelected: {
    backgroundColor: COLORS.emerald,
    shadowColor: COLORS.emerald,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  calDayBtnInnerToday: {
    borderWidth: 1.5,
    borderColor: COLORS.emerald,
    backgroundColor: '#EAF6F0',
  },
  calDayBtnInnerDisabled: {
    opacity: 0.35,
  },
  calDayBtnInnerMuted: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.25,
  },
  calDayBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textDark,
  },
  calDayBtnTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  calDayBtnTextToday: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },
  calDayBtnTextDisabled: {
    color: '#94A3B8',
  },
  calDayBtnTextMuted: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  todaySmallDot: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.emerald,
  },
  calSelectedDateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calSelectedDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.forestDark,
    flex: 1,
  },

  // Header Waktu & Tab Mode
  clockHeaderBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  clockTimeTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clockTabSegment: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 64,
  },
  clockTabSegmentActive: {
    backgroundColor: '#EAF6F0',
    borderColor: COLORS.emerald,
  },
  clockTabNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#475569',
  },
  clockTabNumberActive: {
    color: COLORS.forestDark,
  },
  clockTabSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },
  clockTabSubActive: {
    color: COLORS.emerald,
  },
  clockColon: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.forestDark,
  },
  clockDialModeIndicator: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  clockDialModeIndicatorText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.forestDark,
  },

  // Lingkaran Dial Jam Analog (260x260)
  dialFaceCircle: {
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
    overflow: 'hidden',
  },
  dialTrackRingOuter: {
    position: 'absolute',
    width: 196,
    height: 196,
    borderRadius: 98,
    left: 32,
    top: 32,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  dialTrackRingInner: {
    position: 'absolute',
    width: 124,
    height: 124,
    borderRadius: 62,
    left: 68,
    top: 68,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  dialHandLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: COLORS.emerald,
    borderRadius: 1,
  },
  dialCenterPivot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    left: 126,
    top: 126,
    backgroundColor: COLORS.emerald,
  },
  dialTipHighlight: {
    position: 'absolute',
    backgroundColor: COLORS.emerald,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.emerald,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
    elevation: 2,
  },
  dialTipCustomMinuteText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  dialNumberItem: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  dialNumberTextInner: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  dialNumberTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Penyesuaian Menit & Kontrol Aksesibel
  minuteAdjustRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 4,
  },
  minuteAdjustLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  stepperBtnsGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  stepperBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  stepperBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  accessibleInputContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  accessibleInputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  accessibleInputBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  accessibleDigitInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    width: 36,
    height: 28,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.forestDark,
    padding: 0,
  },
  accessibleColon: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  accessibleTzPill: {
    backgroundColor: '#EAF6F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 2,
  },
  accessibleTzText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.emerald,
  },
  presetQuickRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  presetPillBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  presetPillBtnActive: {
    backgroundColor: '#EAF6F0',
    borderColor: COLORS.emerald,
    borderWidth: 1.5,
  },
  presetPillText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  presetPillTextActive: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },

  // Ringkasan Jadwal Terpadu
  scheduleSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  scheduleSummaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  scheduleSummaryTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scheduleSummaryTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  scheduleBadgeFuture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  scheduleBadgeDotFuture: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  scheduleBadgeTextFuture: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  scheduleBadgeExpired: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  scheduleBadgeDotExpired: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  scheduleBadgeTextExpired: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  scheduleSummaryFormatted: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.forestDark,
    lineHeight: 20,
  },
  scheduleOldNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  scheduleOldNoticeText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  scheduleExpiredAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 8,
  },
  scheduleExpiredAlertText: {
    fontSize: 11,
    color: '#DC2626',
    flex: 1,
    lineHeight: 16,
  },

  // ----------------------------------------
  // STYLING RINGKASAN KAMPANYE
  // ----------------------------------------
  summaryCardBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  summaryRowItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryRowLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    minWidth: 120,
  },
  summaryRowValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12,
    color: COLORS.textDark,
  },

  // ----------------------------------------
  // STYLING MODAL PEMILIH KONTAK
  // ----------------------------------------
  contactPickerFilterBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: '#F8FAFC',
  },
  contactSearchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  contactSearchTextInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textDark,
    padding: 0,
  },
  pickerFilterPill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerFilterPillActive: {
    backgroundColor: COLORS.emeraldSubtle,
    borderColor: COLORS.emerald,
  },
  pickerFilterPillText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  pickerFilterPillTextActive: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },
  pickerBulkActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  btnBulkSelectAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  btnBulkSelectAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  btnBulkDeselect: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: '#F1F5F9',
  },
  btnBulkDeselectText: {
    fontSize: 11,
    color: '#64748B',
  },
  pickerCountIndicator: {
    backgroundColor: COLORS.forestDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pickerCountIndicatorText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contactListScrollView: {
    maxHeight: 380,
    paddingHorizontal: 16,
  },
  emptyContactsNotice: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    gap: 6,
  },
  emptyContactsNoticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  emptyContactsNoticeDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  contactPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  contactPickerRowChecked: {
    backgroundColor: '#F0FDF4',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  contactPickerRowDisabled: {
    opacity: 0.5,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxBoxChecked: {
    backgroundColor: '#047857',
    borderColor: '#047857',
  },
  checkboxBoxDisabled: {
    backgroundColor: '#E2E8F0',
    borderColor: '#CBD5E1',
  },
  disabledDash: {
    width: 8,
    height: 2,
    backgroundColor: '#94A3B8',
    borderRadius: 1,
  },
  contactPickerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactPickerAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369A1',
  },
  contactPickerName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
    maxWidth: 160,
  },
  contactPickerPhone: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  contactPickerLabelBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  contactPickerLabelText: {
    fontSize: 9,
    color: '#475569',
  },
  badgeInvalidPhone: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeInvalidPhoneText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#DC2626',
  },
  badgeOptOut: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeOptOutText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#D97706',
  },
  badgeReady: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeReadyText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#047857',
  },
  contactPickerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: '#F8FAFC',
  },
  pickerFooterSummaryText: {
    fontSize: 12,
    color: COLORS.textDark,
  },
  pickerFooterSubText: {
    fontSize: 10,
    color: '#059669',
    marginTop: 1,
  },
  btnConfirmContactSelection: {
    backgroundColor: COLORS.forestDark,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  btnConfirmContactSelectionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
