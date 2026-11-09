import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS, AppIcon, SHADOWS, BACKGROUNDS, useTheme, ThemePalette } from '../theme';
import { normalizePhoneNumber } from './ContactsView';
import {
  notifySystemEvent,
  notifyOrgProfileUpdated,
  notifyConfigUpdated,
} from '../lib/notifications';
import { formatErrorUserMessage } from '../lib/errorHandler';
import {
  WhatsAppWorkerStatus,
  checkWorkerHealth,
  getWhatsAppStatus,
  getWhatsAppQr,
  reconnectWhatsApp,
  disconnectWhatsApp,
  getWorkerBaseUrl,
  syncProfileToWorker,
} from '../lib/whatsappClient';
import {
  InstitutionType,
  INSTITUTION_TYPES,
  ALL_INSTITUTION_TYPES,
  CANONICAL_INSTITUTION_TYPES,
  normalizeInstitutionType,
  getEffectiveContactLabels,
  getLabelColors,
  DEFAULT_LABELS_BY_TYPE,
  isFollowUpStatus,
} from '../lib/organizationTypes';

// Re-export untuk backward compatibility dengan modul lain
export { InstitutionType, INSTITUTION_TYPES, CANONICAL_INSTITUTION_TYPES };

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface OrgProfile {
  // A. Identitas Institusi
  orgName: string;
  shortName: string;
  institutionType: InstitutionType;
  officialDescription: string;
  logoUrl?: string;
  studentCount: string;
  staffCount: string;
  customLabels?: string[];

  // B. Informasi Kontak & Lokasi
  escalationPhone: string;
  officialEmail: string;
  address: string;
  mapsUrl: string;
  websiteUrl: string;

  // C. Informasi Pendaftaran
  registrationUrl: string;
  infoPageUrl: string;
  admissionSchedule: string;
  tuitionInfo: string;
  requirements: string;
  admissionContact: string;

  // D. Informasi Operasional & Fasilitas
  csHours: string;
  operationalDays: string;
  facilities: string;
  faqs: FaqItem[];

  // E. Metadata Gateway (WhatsApp Cloud API)
  orgId: string;
  webhookUrl: string;
  verifyToken: string;
  isGatewayConnected: boolean;
}

// ==========================================
// DATA DEFAULT AWAL ORGANISASI (BELUM DIKONFIGURASI)
// Semua field data lembaga sengaja dikosongkan untuk mencegah
// data contoh/dummy ditampilkan sebagai profil resmi.
// Admin lembaga harus mengisi data sesungguhnya melalui formulir ini.
// ==========================================
export const DEFAULT_ORG_PROFILE: OrgProfile = {
  // A. Identitas
  orgName: '',
  shortName: '',
  institutionType: 'Pesantren',
  officialDescription: '',
  logoUrl: '',
  studentCount: '',
  staffCount: '',
  customLabels: [],

  // B. Kontak & Lokasi
  escalationPhone: '',
  officialEmail: '',
  address: '',
  mapsUrl: '',
  websiteUrl: '',

  // C. Pendaftaran
  registrationUrl: '',
  infoPageUrl: '',
  admissionSchedule: '',
  tuitionInfo: '',
  requirements: '',
  admissionContact: '',

  // D. Operasional & Fasilitas
  csHours: '',
  operationalDays: '',
  facilities: '',
  faqs: [],

  // E. Gateway
  orgId: '',
  webhookUrl: '',
  verifyToken: '',
  isGatewayConnected: false,
};

// ==========================================
// VALIDASI URL HTTP/HTTPS
// ==========================================
export function isValidHttpUrl(stringVal: string): boolean {
  if (!stringVal || !stringVal.trim()) return true;
  const url = stringVal.trim();
  return url.startsWith('http://') || url.startsWith('https://');
}

// ==========================================
// TRANSLASI ERROR & PEMETAAN DATA SUPABASE
// ==========================================
// Helper translasi error Supabase ke Bahasa Indonesia
export function translateSettingsError(errMsg: string): string {
  return formatErrorUserMessage(errMsg, { entityName: 'profil organisasi', isWorker: false });
}

export function mapDbToOrgProfile(row: any, fallbackOrgId?: string): OrgProfile {
  if (!row) return DEFAULT_ORG_PROFILE;

  const validInstType = (
    row.institution_type && ALL_INSTITUTION_TYPES.includes(row.institution_type)
      ? row.institution_type
      : normalizeInstitutionType(row.institution_type)
  ) as InstitutionType;

  return {
    orgName: row.org_name || DEFAULT_ORG_PROFILE.orgName,
    shortName: row.short_name || DEFAULT_ORG_PROFILE.shortName,
    institutionType: validInstType,
    officialDescription: row.official_description ?? DEFAULT_ORG_PROFILE.officialDescription,
    logoUrl: row.logo_url ?? DEFAULT_ORG_PROFILE.logoUrl,
    studentCount: row.student_count ?? DEFAULT_ORG_PROFILE.studentCount,
    staffCount: row.staff_count ?? DEFAULT_ORG_PROFILE.staffCount,
    customLabels: Array.isArray(row.custom_labels) ? row.custom_labels : [],
    escalationPhone: row.escalation_phone ?? DEFAULT_ORG_PROFILE.escalationPhone,
    officialEmail: row.official_email ?? DEFAULT_ORG_PROFILE.officialEmail,
    address: row.address ?? DEFAULT_ORG_PROFILE.address,
    mapsUrl: row.maps_url ?? DEFAULT_ORG_PROFILE.mapsUrl,
    websiteUrl: row.website_url ?? DEFAULT_ORG_PROFILE.websiteUrl,
    registrationUrl: row.registration_url ?? DEFAULT_ORG_PROFILE.registrationUrl,
    infoPageUrl: row.info_page_url ?? DEFAULT_ORG_PROFILE.infoPageUrl,
    admissionSchedule: row.admission_schedule ?? DEFAULT_ORG_PROFILE.admissionSchedule,
    tuitionInfo: row.tuition_info ?? DEFAULT_ORG_PROFILE.tuitionInfo,
    requirements: row.requirements ?? DEFAULT_ORG_PROFILE.requirements,
    admissionContact: row.admission_contact ?? DEFAULT_ORG_PROFILE.admissionContact,
    csHours: row.cs_hours ?? DEFAULT_ORG_PROFILE.csHours,
    operationalDays: row.operational_days ?? DEFAULT_ORG_PROFILE.operationalDays,
    facilities: row.facilities ?? DEFAULT_ORG_PROFILE.facilities,
    faqs: Array.isArray(row.faqs) && row.faqs.length > 0 ? row.faqs : DEFAULT_ORG_PROFILE.faqs,
    orgId: row.organization_id || fallbackOrgId || DEFAULT_ORG_PROFILE.orgId,
    webhookUrl: DEFAULT_ORG_PROFILE.webhookUrl,
    verifyToken: DEFAULT_ORG_PROFILE.verifyToken,
    isGatewayConnected: DEFAULT_ORG_PROFILE.isGatewayConnected,
  };
}

// ==========================================
// TIPE TAB PENGATURAN
// ==========================================
export type SettingsTab = 'identity' | 'contact' | 'admission' | 'operational' | 'gateway';

export interface SettingsViewProps {
  organizationId?: string;
  currentUserId?: string;
  orgProfile?: OrgProfile;
  setOrgProfile?: React.Dispatch<React.SetStateAction<OrgProfile>>;
  isDesktop?: boolean;
  initialTab?: SettingsTab;
  onNavigate?: (page: 'dashboard' | 'chat' | 'users' | 'campaign' | 'bot' | 'team' | 'settings', tab?: SettingsTab) => void;
}

export function SettingsView({
  organizationId,
  currentUserId,
  orgProfile: externalProfile,
  setOrgProfile: externalSetProfile,
  isDesktop = true,
  initialTab,
  onNavigate: _onNavigate,
}: SettingsViewProps) {
  const [internalProfile, setInternalProfile] = useState<OrgProfile>(DEFAULT_ORG_PROFILE);
  const orgProfile = externalProfile ?? internalProfile;
  const setOrgProfile = externalSetProfile ?? setInternalProfile;

  // Supabase Organization State (Single Source of Truth)
  const effectiveOrgId = organizationId;

  // Role Pengguna Saat Ini dalam Organisasi (Deny-by-default: null/loading tidak berhak sebagai Owner/Admin)
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member' | string | null>(null);
  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';

  // Status Asinkron
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(organizationId));
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Active Tab: Menggunakan initialTab jika diteruskan, atau default ke 'identity'
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? 'identity');
  const [prevInitialTab, setPrevInitialTab] = useState<SettingsTab | undefined>(initialTab);
  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab);
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }

  // Local Form Draft State (mencegah data loss saat batal)
  const [draft, setDraft] = useState<OrgProfile>(orgProfile);
  const [showVerifyToken, setShowVerifyToken] = useState(false);
  const [prevOrgProfile, setPrevOrgProfile] = useState<OrgProfile>(orgProfile);
  if (orgProfile !== prevOrgProfile) {
    setPrevOrgProfile(orgProfile);
    setDraft(orgProfile);
  }

  // Feedback State
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; text: string } | null>(null);

  // WhatsApp Staging Worker State (Baileys Local Worker)
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [waStatus, setWaStatus] = useState<WhatsAppWorkerStatus | null>(null);
  const [waQrDataUrl, setWaQrDataUrl] = useState<string | null>(null);
  const [waQrGeneratedAt, setWaQrGeneratedAt] = useState<string | null>(null);
  const [waCountdown, setWaCountdown] = useState<number>(0);
  const [isWaLoading, setIsWaLoading] = useState<boolean>(false);
  const [waActionMessage, setWaActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const isRefreshingRef = useRef<boolean>(false);
  const waStatusRef = useRef<WhatsAppWorkerStatus | null>(null);

  useEffect(() => {
    waStatusRef.current = waStatus;
  }, [waStatus]);

  // Countdown timer per detik untuk masa aktif QR
  useEffect(() => {
    if (waCountdown <= 0) return;
    const interval = setInterval(() => {
      setWaCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [waCountdown]);

  // Label Kustom Management State
  const [newLabelInput, setNewLabelInput] = useState<string>('');
  const [labelError, setLabelError] = useState<string | null>(null);

  const activeEffectiveLabels = useMemo(() => {
    return getEffectiveContactLabels(draft.customLabels, draft.institutionType);
  }, [draft.customLabels, draft.institutionType]);

  const handleAddCustomLabel = () => {
    if (!isOwnerOrAdmin) {
      setLabelError('Akses dibatasi: Hanya Owner atau Admin yang dapat menambahkan label.');
      return;
    }
    const trimmed = newLabelInput.trim();
    if (!trimmed) {
      setLabelError('Nama label tidak boleh kosong.');
      return;
    }
    if (trimmed.length > 30) {
      setLabelError('Nama label maksimal 30 karakter.');
      return;
    }
    if (isFollowUpStatus(trimmed)) {
      setLabelError('Nama label tidak boleh menggunakan nama status operasional sistem ("Belum Dihubungi", "Sudah Dihubungi", "Perlu Follow-up").');
      return;
    }
    if (activeEffectiveLabels.some((l) => l.toLowerCase() === trimmed.toLowerCase())) {
      setLabelError(`Label "${trimmed}" sudah terdaftar.`);
      return;
    }

    const currentList = draft.customLabels && draft.customLabels.length > 0
      ? [...draft.customLabels]
      : [...activeEffectiveLabels];

    currentList.push(trimmed);
    setDraft({ ...draft, customLabels: currentList });
    setNewLabelInput('');
    setLabelError(null);
  };

  const handleRemoveCustomLabel = (labelToRemove: string) => {
    if (!isOwnerOrAdmin) {
      setLabelError('Akses dibatasi: Hanya Owner atau Admin yang dapat menghapus label.');
      return;
    }
    if (labelToRemove.toLowerCase() === 'umum') {
      setLabelError('Label "Umum" tidak dapat dihapus sebagai jangkar sistem.');
      return;
    }
    const currentList = draft.customLabels && draft.customLabels.length > 0
      ? [...draft.customLabels]
      : [...activeEffectiveLabels];

    const updated = currentList.filter((l) => l.toLowerCase() !== labelToRemove.toLowerCase());
    setDraft({ ...draft, customLabels: updated });
    setLabelError(null);
  };

  const handleResetLabelsToDefault = () => {
    if (!isOwnerOrAdmin) {
      setLabelError('Akses dibatasi: Hanya Owner atau Admin yang dapat mereset preset label.');
      return;
    }
    const canonical = normalizeInstitutionType(draft.institutionType);
    const presets = DEFAULT_LABELS_BY_TYPE[canonical];
    setDraft({ ...draft, customLabels: [...presets] });
    setLabelError(null);
  };

  // Fungsi refresh status & QR dari worker lokal (dioptimalkan 1 round-trip)
  const refreshWhatsAppWorkerState = useCallback(async (showLoading = false) => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    if (showLoading) {
      setIsWaLoading(true);
      setWaActionMessage(null);
    }

    try {
      // 1. Ambil status terkini langsung via getWhatsAppStatus (1 round-trip efisien)
      const statusRes = await getWhatsAppStatus();
      if (!statusRes.success || !statusRes.data) {
        const errorMsg = statusRes.error || '';
        const isOffline =
          errorMsg.includes('tidak terjangkau') ||
          errorMsg.includes('offline') ||
          errorMsg.includes('belum dikonfigurasi') ||
          errorMsg.includes('ECONNREFUSED');
        setWorkerOnline(!isOffline);
        if (isOffline) {
          setWaStatus(null);
          setWaQrDataUrl(null);
          setWaCountdown(0);
        }
        if (showLoading) {
          setWaActionMessage({
            type: 'error',
            text: statusRes.error || 'Gagal mengambil status WhatsApp dari worker.',
          });
        }
        return;
      }

      setWorkerOnline(true);
      const currentStatus = statusRes.data;
      setWaStatus(currentStatus);

      // Sinkronisasi countdown
      if (typeof currentStatus.countdownSeconds === 'number') {
        setWaCountdown(currentStatus.countdownSeconds);
      }

      // 2. Evaluasi QR data URL langsung dari status worker (tanpa extra round-trip jika cached)
      if (currentStatus.status === 'connected') {
        setWaQrDataUrl(null);
        setWaCountdown(0);
      } else if (currentStatus.qrDataUrl) {
        setWaQrDataUrl(currentStatus.qrDataUrl);
        setWaQrGeneratedAt(
          currentStatus.qrGeneratedAt
            ? new Date(currentStatus.qrGeneratedAt).toLocaleTimeString()
            : new Date().toLocaleTimeString()
        );
      } else if (
        currentStatus.status === 'qr_ready' ||
        currentStatus.status === 'initiating' ||
        currentStatus.status === 'disconnected' ||
        currentStatus.status === 'qr_expired'
      ) {
        // Fallback mengambil QR hanya jika belum ada di payload status
        const qrRes = await getWhatsAppQr();
        if (qrRes.success && qrRes.qrDataUrl) {
          setWaQrDataUrl(qrRes.qrDataUrl);
          setWaQrGeneratedAt(
            qrRes.generatedAt
              ? new Date(qrRes.generatedAt).toLocaleTimeString()
              : new Date().toLocaleTimeString()
          );
          if (typeof qrRes.countdownSeconds === 'number') {
            setWaCountdown(qrRes.countdownSeconds);
          }
        } else if (qrRes.status === 'connected') {
          setWaQrDataUrl(null);
          setWaCountdown(0);
        }
      }
    } catch (err: any) {
      setWorkerOnline(false);
      setWaStatus(null);
      setWaQrDataUrl(null);
      setWaCountdown(0);
      if (showLoading) {
        setWaActionMessage({
          type: 'error',
          text: `Kendala jaringan worker: ${err?.message || 'Gagal terhubung ke worker lokal.'}`,
        });
      }
    } finally {
      isRefreshingRef.current = false;
      if (showLoading) setIsWaLoading(false);
    }
  }, []);

  // Polling adaptif saat tab gateway aktif:
  // - Poll 1200ms saat menunggu QR / initiating / connecting / qr_expired
  // - Poll 2000ms saat qr_ready untuk menjaga validitas QR & deteksi scan ponsel
  // - Berhenti otomatis ketika status 'connected' atau tab ditinggalkan
  useEffect(() => {
    let isCancelled = false;
    let pollTimer: any = null;

    if (activeTab === 'gateway') {
      setTimeout(() => {
        if (!isCancelled) void refreshWhatsAppWorkerState(true);
      }, 0);

      const scheduleNextPoll = () => {
        if (isCancelled) return;
        const currentWa = waStatusRef.current;

        // Berhenti polling jika sudah terhubung
        if (currentWa?.status === 'connected') {
          return;
        }

        // 1200ms untuk inisialisasi cepat, 2000ms saat QR sedang aktif
        const intervalMs = currentWa?.status === 'qr_ready' ? 2000 : 1200;

        pollTimer = setTimeout(async () => {
          if (!isCancelled) {
            await refreshWhatsAppWorkerState(false);
            scheduleNextPoll();
          }
        }, intervalMs);
      };

      scheduleNextPoll();

      return () => {
        isCancelled = true;
        if (pollTimer) clearTimeout(pollTimer);
      };
    }
  }, [activeTab, refreshWhatsAppWorkerState]);

  const handleReconnectWhatsApp = async () => {
    setIsWaLoading(true);
    setWaActionMessage(null);
    const res = await reconnectWhatsApp();
    if (res.success) {
      setWaActionMessage({
        type: 'info',
        text: 'Permintaan koneksi ulang dikirim. Sedang menyiapkan koneksi...',
      });
      setTimeout(() => {
        void refreshWhatsAppWorkerState(false);
      }, 2000);
    } else {
      setWaActionMessage({
        type: 'error',
        text: res.error || 'Gagal meminta koneksi ulang ke worker.',
      });
      setIsWaLoading(false);
    }
  };

  const handleDisconnectWhatsApp = async (deleteSession = true) => {
    setIsWaLoading(true);
    setWaActionMessage(null);
    setShowLogoutConfirm(false);
    const res = await disconnectWhatsApp(deleteSession);
    if (res.success) {
      setWaStatus(null);
      setWaQrDataUrl(null);
      if (setOrgProfile) {
        setOrgProfile((prev) => ({
          ...prev,
          isGatewayConnected: false,
        }));
      }
      const revocation = res.data?.revocationStatus;
      let feedbackText = res.message || 'Koneksi WhatsApp berhasil diputuskan.';
      let feedbackType: 'success' | 'info' = 'success';

      if (deleteSession) {
        if (revocation === 'confirmed') {
          feedbackType = 'success';
          feedbackText = 'Koneksi WhatsApp diputuskan, otorisasi perangkat terverifikasi dicabut oleh server WhatsApp, dan seluruh berkas kredensial lokal telah dimusnahkan.';
        } else if (revocation && revocation.startsWith('unverified')) {
          feedbackType = 'info';
          feedbackText = 'Berkas sesi lokal telah dihapus dan socket dimatikan. Namun pencabutan dari server WhatsApp belum terverifikasi secara online (socket offline/timeout). Silakan periksa menu Perangkat Tertaut di WhatsApp ponsel Anda dan pilih Keluar jika perangkat masih tercantum.';
        }
      }

      setWaActionMessage({
        type: feedbackType,
        text: feedbackText,
      });
      await refreshWhatsAppWorkerState(false);

      if (effectiveOrgId && currentUserId) {
        notifyConfigUpdated({
          organizationId: effectiveOrgId,
          userId: currentUserId,
          configName: 'WhatsApp Gateway',
          detail: 'Sesi perangkat WhatsApp diputuskan dan kredensial dimusnahkan.',
        }).catch((e) => console.warn('[SettingsView] Gagal membuat notifikasi disconnect gateway:', e));
      }
    } else {
      setWaActionMessage({
        type: 'error',
        text: res.error || 'Gagal memutus koneksi WhatsApp.',
      });
      setIsWaLoading(false);
    }
  };

  // FAQ Form State
  const [newFaqQ, setNewFaqQ] = useState('');
  const [newFaqA, setNewFaqA] = useState('');

  // Validasi URL Realtime
  const isMapsValid = isValidHttpUrl(draft.mapsUrl);
  const isWebValid = isValidHttpUrl(draft.websiteUrl);
  const isRegValid = isValidHttpUrl(draft.registrationUrl);
  const isInfoValid = isValidHttpUrl(draft.infoPageUrl);
  const isLogoValid = isValidHttpUrl(draft.logoUrl ?? '');

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
        console.error('Error fetching user role in SettingsView:', e);
      }
    };

    void checkRole();
    return () => {
      ignore = true;
    };
  }, [effectiveOrgId]);

  // Muat data profil organisasi dari tabel public.organization_profiles Supabase
  const fetchProfile = useCallback(
    async (orgId?: string) => {
      const targetOrgId = orgId || effectiveOrgId;
      if (!targetOrgId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setFetchError(null);

      try {
        const { data, error } = await supabase
          .from('organization_profiles')
          .select('*')
          .eq('organization_id', targetOrgId)
          .maybeSingle();

        if (error) {
          console.error('Error fetching organization profile:', error.message);
          setFetchError(translateSettingsError(error.message));
        } else if (data) {
          const mapped = mapDbToOrgProfile(data, targetOrgId);
          setOrgProfile(mapped);
          setDraft(mapped);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        setFetchError(translateSettingsError(msg));
      } finally {
        setIsLoading(false);
      }
    },
    [effectiveOrgId, setOrgProfile]
  );

  // Inisialisasi pemuatan profil saat ID organisasi tersedia
  useEffect(() => {
    let ignore = false;
    if (!effectiveOrgId) return;

    const loadData = async () => {
      try {
        const { data, error } = await supabase
          .from('organization_profiles')
          .select('*')
          .eq('organization_id', effectiveOrgId)
          .maybeSingle();

        if (ignore) return;
        if (error) {
          console.error('Error fetching organization profile:', error.message);
          setFetchError(translateSettingsError(error.message));
        } else if (data) {
          const mapped = mapDbToOrgProfile(data, effectiveOrgId);
          setOrgProfile(mapped);
          setDraft(mapped);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : '';
          setFetchError(translateSettingsError(msg));
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      ignore = true;
    };
  }, [effectiveOrgId, setOrgProfile]);

  // Simpan Pengaturan ke Supabase (UPSERT)
  const handleSaveSettings = async () => {
    if (isSaving) return;

    // Batasi akses: Hanya Owner atau Admin yang boleh mengubah profil lembaga (deny-by-default)
    if (!isOwnerOrAdmin) {
      setFeedback({
        type: 'error',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak menyimpan perubahan profil lembaga.',
      });
      setTimeout(() => setFeedback(null), 4500);
      return;
    }

    if (!effectiveOrgId) {
      setFeedback({
        type: 'error',
        text: 'ID organisasi tidak ditemukan. Silakan pilih workspace yang aktif.',
      });
      return;
    }

    // 1. Validasi Nama Lembaga
    if (!draft.orgName.trim() || draft.orgName.trim().length < 3) {
      setFeedback({
        type: 'error',
        text: 'Nama resmi institusi wajib diisi minimal 3 karakter.',
      });
      return;
    }

    // 2. Validasi Deskripsi
    if (!draft.officialDescription.trim()) {
      setFeedback({
        type: 'error',
        text: 'Deskripsi resmi institusi tidak boleh kosong.',
      });
      return;
    }

    // 3. Validasi Nomor Telepon
    const normPhone = normalizePhoneNumber(draft.escalationPhone);
    if (normPhone.length < 8) {
      setFeedback({
        type: 'error',
        text: 'Nomor telepon resmi wajib diisi minimal 8 digit angka yang valid.',
      });
      return;
    }

    // 4. Validasi Format Email
    if (draft.officialEmail.trim()) {
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      if (!emailRegex.test(draft.officialEmail.trim())) {
        setFeedback({
          type: 'error',
          text: 'Format alamat email institusi tidak valid (contoh: info@domain.com).',
        });
        return;
      }
    }

    // 5. Validasi URL
    if (!isMapsValid || !isWebValid || !isRegValid || !isInfoValid || !isLogoValid) {
      setFeedback({
        type: 'error',
        text: 'Pastikan seluruh tautan URL diawali dengan http:// atau https://.',
      });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const payload: Record<string, any> = {
        organization_id: effectiveOrgId,
        org_name: draft.orgName.trim(),
        short_name: draft.shortName.trim(),
        institution_type: draft.institutionType,
        official_description: draft.officialDescription.trim(),
        logo_url: draft.logoUrl?.trim() || null,
        student_count: draft.studentCount.trim(),
        staff_count: draft.staffCount.trim(),
        escalation_phone: draft.escalationPhone.trim(),
        official_email: draft.officialEmail.trim(),
        address: draft.address.trim(),
        maps_url: draft.mapsUrl.trim(),
        website_url: draft.websiteUrl.trim(),
        registration_url: draft.registrationUrl.trim(),
        info_page_url: draft.infoPageUrl.trim(),
        admission_schedule: draft.admissionSchedule.trim(),
        tuition_info: draft.tuitionInfo.trim(),
        requirements: draft.requirements.trim(),
        admission_contact: draft.admissionContact.trim(),
        cs_hours: draft.csHours.trim(),
        operational_days: draft.operationalDays.trim(),
        facilities: draft.facilities.trim(),
        faqs: draft.faqs,
        custom_labels: draft.customLabels && draft.customLabels.length > 0 ? draft.customLabels : [],
        updated_at: new Date().toISOString(),
      };

      let saveResult = await supabase
        .from('organization_profiles')
        .upsert(payload, { onConflict: 'organization_id' })
        .select()
        .single();

      let customLabelsSkipped = false;
      // Graceful fallback jika kolom custom_labels belum dieksekusi di database cloud
      if (
        saveResult.error &&
        (saveResult.error.code === '42703' ||
          saveResult.error.message?.toLowerCase().includes('custom_labels'))
      ) {
        console.warn('Kolom custom_labels belum tersedia di database, menyimpan field profil lainnya.');
        customLabelsSkipped = true;
        delete payload.custom_labels;
        saveResult = await supabase
          .from('organization_profiles')
          .upsert(payload, { onConflict: 'organization_id' })
          .select()
          .single();
      }

      const { data, error } = saveResult;

      if (error) {
        console.error('Error saving organization profile:', error.message);
        setFeedback({
          type: 'error',
          text: translateSettingsError(error.message),
        });
        return;
      }

      if (data) {
        const saved = mapDbToOrgProfile(data, effectiveOrgId);
        setOrgProfile(saved);
        setDraft(saved);
      } else {
        setOrgProfile(draft);
      }

      if (effectiveOrgId && currentUserId) {
        notifyOrgProfileUpdated({
          organizationId: effectiveOrgId,
          userId: currentUserId,
          orgName: draft.orgName,
        }).catch((e) => console.warn('[SettingsView] Gagal membuat notifikasi sistem:', e));
      }

      // Sinkronkan profil terbaru ke Worker Staging WhatsApp (fire-and-forget)
      // Kegagalan sync tidak dianggap fatal — data sudah tersimpan di Supabase.
      const profileToSync = data ? mapDbToOrgProfile(data, effectiveOrgId) : draft;
      syncProfileToWorker(profileToSync).then((syncResult) => {
        if (syncResult.success) {
          console.log('[SettingsView] Profil berhasil disinkronkan ke Worker WhatsApp.');
          setFeedback({
            type: 'success',
            text: 'Profil berhasil disimpan di database dan disinkronkan ke chatbot WhatsApp.',
          });
        } else {
          console.warn('[SettingsView] Sinkronisasi profil ke Worker gagal (non-fatal):', syncResult.error);
          setFeedback({
            type: 'warning',
            text: `Profil tersimpan di database, tetapi gagal disinkronkan ke chatbot WhatsApp: ${syncResult.error || 'Worker tidak aktif.'}. Chatbot masih menggunakan data sebelumnya.`,
          });
        }
        setTimeout(() => { setFeedback(null); }, 6000);
      }).catch(() => {
        // Worker mungkin tidak aktif
        setFeedback({
          type: 'warning',
          text: 'Profil tersimpan di database, tetapi Worker WhatsApp tidak terjangkau. Chatbot belum memiliki data terbaru.',
        });
        setTimeout(() => { setFeedback(null); }, 6000);
      });

      setFeedback({
        type: customLabelsSkipped ? 'info' : 'success',
        text: customLabelsSkipped
          ? 'Profil tersimpan. Catatan: Kolom label kontak kustom belum tersedia di database server.'
          : 'Menyimpan profil ke database... Menyinkronkan ke chatbot WhatsApp...',
      });

      setTimeout(() => {
        setFeedback(null);
      }, 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setFeedback({
        type: 'error',
        text: translateSettingsError(msg),
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Batalkan Editan (Kembalikan ke profile yang tersimpan)
  const handleDiscardChanges = () => {
    setDraft(orgProfile);
    setFeedback({
      type: 'info',
      text: 'Perubahan yang belum disimpan telah dibatalkan.',
    });
    setTimeout(() => {
      setFeedback(null);
    }, 3000);
  };

  // Pulihkan ke Default
  const handleRestoreDefault = () => {
    if (!isOwnerOrAdmin) {
      setFeedback({
        type: 'error',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak mereset pengaturan profil lembaga.',
      });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    setDraft(DEFAULT_ORG_PROFILE);
    setFeedback({
      type: 'info',
      text: 'Formulir diisi ulang dengan data standar demo. Tekan "Simpan Pengaturan" jika ingin menerapkannya ke Supabase.',
    });
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  // Tambah FAQ Baru
  const handleAddFaq = () => {
    if (!newFaqQ.trim() || !newFaqA.trim()) {
      setFeedback({
        type: 'error',
        text: 'Pertanyaan dan jawaban FAQ wajib diisi.',
      });
      return;
    }

    const newFaqItem: FaqItem = {
      id: `faq_${Date.now()}`,
      question: newFaqQ.trim(),
      answer: newFaqA.trim(),
    };

    setDraft((prev) => ({
      ...prev,
      faqs: [...prev.faqs, newFaqItem],
    }));

    setNewFaqQ('');
    setNewFaqA('');
  };

  // Hapus FAQ
  const handleRemoveFaq = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      faqs: prev.faqs.filter((f) => f.id !== id),
    }));
  };

  const { isDark, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.pageContainer, { backgroundColor: colors.background }]}>
      {/* ========================================== */}
      {/* 1. HEADER HALAMAN                          */}
      {/* ========================================== */}
      <View style={[styles.pageHeader, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Pengaturan Organisasi</Text>
            <View style={styles.statusPill}>
              <View style={styles.statusDotActive} />
              <Text style={styles.statusPillText}>Sesi Aktif</Text>
            </View>
            {userRole && (
              <View style={[styles.userRolePill, isOwnerOrAdmin ? styles.userRoleAdmin : styles.userRoleMember]}>
                <Text style={styles.userRoleText}>Peran Anda: {userRole.toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Kelola identitas resmi institusi, kontak, basis pendaftaran, jam layanan CS, dan integrasi WhatsApp gateway.
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.btnSecondary}
            activeOpacity={0.8}
            onPress={handleDiscardChanges}
            disabled={isSaving || isLoading}
          >
            <AppIcon name="refresh" size={14} color={colors.textPrimary} />
            <Text style={styles.btnSecondaryText}>Batalkan Editan</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnPrimary, (isSaving || isLoading) && { opacity: 0.7 }]}
            activeOpacity={0.8}
            onPress={handleSaveSettings}
            disabled={isSaving || isLoading}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <AppIcon name="check" size={15} color="#FFFFFF" />
                <Text style={styles.btnPrimaryText}>Simpan Pengaturan</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ERROR BANNER */}
      {fetchError && (
        <View style={styles.errorBannerBox}>
          <AppIcon name="alert" size={15} color="#DC2626" />
          <Text style={styles.errorBannerText}>{fetchError}</Text>
          <TouchableOpacity style={styles.btnRetry} onPress={() => fetchProfile()} activeOpacity={0.7}>
            <Text style={styles.btnRetryText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* LOADING BANNER */}
      {isLoading && (
        <View style={styles.loadingBannerBox}>
          <ActivityIndicator size="small" color={COLORS.emerald} />
          <Text style={styles.loadingBannerText}>Memuat profil organisasi dari Supabase...</Text>
        </View>
      )}

      {/* FEEDBACK TOAST BANNER */}
      {feedback && (
        <View
          style={[
            styles.feedbackBanner,
            feedback.type === 'success' && styles.feedbackSuccess,
            feedback.type === 'error' && styles.feedbackError,
            feedback.type === 'info' && styles.feedbackInfo,
            feedback.type === 'warning' && styles.feedbackWarning,
          ]}
        >
          <AppIcon
            name={feedback.type === 'error' || feedback.type === 'warning' ? 'alert' : 'check'}
            size={16}
            color={
              feedback.type === 'success'
                ? '#047857'
                : feedback.type === 'error'
                  ? '#B91C1C'
                  : feedback.type === 'warning'
                    ? '#92400E'
                    : '#1D4ED8'
            }
          />
          <Text
            style={[
              styles.feedbackBannerText,
              feedback.type === 'success' && { color: '#047857' },
              feedback.type === 'error' && { color: '#B91C1C' },
              feedback.type === 'info' && { color: '#1D4ED8' },
              feedback.type === 'warning' && { color: '#92400E' },
            ]}
          >
            {feedback.text}
          </Text>
        </View>
      )}

      {/* BANNER INFORMASI PENYIMPANAN SUPABASE */}
      <View style={styles.protoBanner}>
        <View style={styles.protoIconBox}>
          <AppIcon name="check" size={16} color="#047857" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.protoBannerTitle}>Penyimpanan Terpusat Supabase (Multi-Tenant RLS)</Text>
          <Text style={styles.protoBannerDesc}>
            Seluruh data profil resmi institusi, kontak eskalasi, jadwal PSB, rincian biaya, fasilitas, dan butir FAQ disimpan permanen di tabel public.organization_profiles Supabase dengan isolasi keamanan Row Level Security (RLS). Data ini juga langsung menjadi referensi resmi bagi asisten Chatbot AI.
          </Text>
        </View>
        <TouchableOpacity style={styles.protoRestoreBtn} onPress={handleRestoreDefault}>
          <Text style={styles.protoRestoreBtnText}>Isi Contoh</Text>
        </TouchableOpacity>
      </View>

      {/* 2. TAB NAVIGASI PENGATURAN                 */}
      {/* ========================================== */}
      <View style={[styles.tabNavContainer, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabNavContent}
        >
          {[
            { key: 'identity', label: '1. Identitas Institusi', icon: 'users' },
            { key: 'contact', label: '2. Kontak & Lokasi', icon: 'phone' },
            { key: 'admission', label: '3. Pendaftaran & Biaya', icon: 'calendar' },
            { key: 'operational', label: '4. Operasional & FAQ', icon: 'clock' },
            { key: 'gateway', label: '5. Gateway WhatsApp API', icon: 'link' },
          ].map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabBtn, isSelected && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab.key as SettingsTab)}
              >
                <AppIcon
                  name={tab.icon as any}
                  size={14}
                  color={isSelected ? COLORS.emerald : COLORS.textSecondary}
                />
                <Text style={[styles.tabBtnText, isSelected && styles.tabBtnTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ========================================== */}
      {/* 3. KONTEN TAB: IDENTITAS INSTITUSI         */}
      {/* ========================================== */}
      {activeTab === 'identity' && (
        <View style={[styles.cardContainer, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Identitas & Profil Resmi Institusi</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              Informasi dasar yang mengidentifikasi lembaga pendidikan atau yayasan Anda di seluruh ekosistem WABiz.
            </Text>
          </View>

          <View style={styles.formGrid}>
            {/* Nama Resmi Institusi */}
            <View style={styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>
                Nama Resmi Institusi / Lembaga <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                value={draft.orgName}
                onChangeText={(val) => setDraft({ ...draft, orgName: val })}
                placeholder="Contoh: Pesantren Modern Darul Ulum WABiz"
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>

            {/* Nama Singkat */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Nama Singkat / Brand Populer</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                value={draft.shortName}
                onChangeText={(val) => setDraft({ ...draft, shortName: val })}
                placeholder="Contoh: Darul Ulum WABiz"
                placeholderTextColor={colors.textPlaceholder}
              />
              <Text style={styles.formHelper}>Digunakan pada sapaan ringkas dan footer pesan.</Text>
            </View>

            {/* Jenis Organisasi / Sektor Bisnis */}
            <View style={styles.formColFull}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Jenis Organisasi / Sektor Bisnis</Text>
                <Text style={styles.formHelper}>Mendukung Pesantren, Sekolah, UMKM, Kos-kosan, Jasa, Layanan Kesehatan, dan Yayasan</Text>
              </View>
              <View style={styles.radioPickerGrid}>
                {CANONICAL_INSTITUTION_TYPES.map((type) => {
                  const isSelected = normalizeInstitutionType(draft.institutionType) === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.radioCard, isSelected && styles.radioCardActive]}
                      onPress={() => {
                        const newPresets = DEFAULT_LABELS_BY_TYPE[type];
                        const shouldUpdateLabels = !draft.customLabels || draft.customLabels.length === 0;
                        setDraft({
                          ...draft,
                          institutionType: type,
                          customLabels: shouldUpdateLabels ? [...newPresets] : draft.customLabels,
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.radioDot, isSelected && styles.radioDotActive]}>
                        {isSelected && <View style={styles.radioDotInner} />}
                      </View>
                      <Text style={[styles.radioLabel, isSelected && styles.radioLabelActive]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Segmentasi & Label Kontak Organisasi */}
            <View style={styles.formColFull}>
              <View style={{ backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <AppIcon name="users" size={16} color={colors.accent} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
                      Segmentasi & Label Kontak ({activeEffectiveLabels.length} Label Aktif)
                    </Text>
                  </View>
                  {isOwnerOrAdmin && (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.surfaceCard, borderWidth: 1, borderColor: colors.border }}
                      onPress={handleResetLabelsToDefault}
                      activeOpacity={0.7}
                    >
                      <AppIcon name="refresh" size={12} color={colors.accent} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.accent }}>
                        Reset ke Label Default Sektor
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>
                  Setiap organisasi memiliki label kontak sendiri untuk mengelompokkan pelanggan dan memfilter target kampanye siaran WhatsApp.
                </Text>

                {/* Badge Daftar Label Aktif */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {activeEffectiveLabels.map((lbl) => {
                    const lblColors = getLabelColors(lbl, isDark);
                    const isUmum = lbl.toLowerCase() === 'umum';
                    return (
                      <View
                        key={lbl}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingVertical: 5,
                          paddingHorizontal: 10,
                          borderRadius: 20,
                          backgroundColor: lblColors.bg,
                          borderWidth: 1,
                          borderColor: lblColors.border,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: lblColors.text }}>{lbl}</Text>
                        {isOwnerOrAdmin && !isUmum && (
                          <TouchableOpacity
                            onPress={() => handleRemoveCustomLabel(lbl)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel={`Hapus label ${lbl}`}
                          >
                            <AppIcon name="close" size={11} color={lblColors.text} />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Form Tambah Label Cepat */}
                {isOwnerOrAdmin && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      style={[styles.formInput, { flex: 1, height: 38, paddingVertical: 6, fontSize: 13 }]}
                      placeholder="Tambah label baru (misal: Reseller VIP, Pelanggan Baru)..."
                      placeholderTextColor={colors.textPlaceholder}
                      value={newLabelInput}
                      onChangeText={(val) => {
                        setNewLabelInput(val);
                        if (labelError) setLabelError(null);
                      }}
                      onSubmitEditing={handleAddCustomLabel}
                      returnKeyType="done"
                    />
                    <TouchableOpacity
                      style={[styles.btnPrimary, { height: 38, paddingHorizontal: 14 }]}
                      onPress={handleAddCustomLabel}
                      activeOpacity={0.8}
                    >
                      <AppIcon name="plus" size={13} color="#FFFFFF" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>+ Tambah</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {labelError && (
                  <Text style={{ fontSize: 12, color: '#DC2626', marginTop: 6, fontWeight: '500' }}>
                    {labelError}
                  </Text>
                )}
              </View>
            </View>

            {/* Deskripsi Resmi */}
            <View style={styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>
                Deskripsi Resmi Institusi <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.officialDescription}
                onChangeText={(val) => setDraft({ ...draft, officialDescription: val })}
                placeholder="Jelaskan visi, misi, fokus pendidikan, serta nilai unggulan institusi..."
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={3}
              />
              <Text style={styles.formHelper}>
                Teks ini menjadi landasan primer Chatbot AI saat menjawab profil dan keunggulan lembaga.
              </Text>
            </View>

            {/* Kapasitas / Santri / Klien */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>
                {['Pesantren', 'Sekolah Islam Terpadu', 'Madrasah'].includes(normalizeInstitutionType(draft.institutionType))
                  ? 'Jumlah Santri / Siswa Aktif'
                  : normalizeInstitutionType(draft.institutionType) === 'UMKM / Bisnis Retail'
                    ? 'Estimasi Pelanggan / Member Aktif'
                    : normalizeInstitutionType(draft.institutionType) === 'Properti / Kos-kosan'
                      ? 'Jumlah Kamar / Penghuni Aktif'
                      : normalizeInstitutionType(draft.institutionType) === 'Jasa / Konsultan'
                        ? 'Jumlah Klien / Prospek Aktif'
                        : normalizeInstitutionType(draft.institutionType) === 'Layanan Kesehatan'
                          ? 'Kapasitas Pasien / Tempat Tidur'
                          : normalizeInstitutionType(draft.institutionType) === 'Yayasan / Organisasi Umum'
                            ? 'Jumlah Donatur / Penerima Manfaat'
                            : 'Kapasitas / Anggota Aktif'}
              </Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                value={draft.studentCount}
                onChangeText={(val) => setDraft({ ...draft, studentCount: val })}
                placeholder={
                  ['Pesantren', 'Sekolah Islam Terpadu', 'Madrasah'].includes(normalizeInstitutionType(draft.institutionType))
                    ? 'Contoh: 1.250 Santri (Putra & Putri)'
                    : normalizeInstitutionType(draft.institutionType) === 'UMKM / Bisnis Retail'
                      ? 'Contoh: 1.500+ Pelanggan Terdaftar'
                      : normalizeInstitutionType(draft.institutionType) === 'Properti / Kos-kosan'
                        ? 'Contoh: 48 Kamar (36 Terisi)'
                        : normalizeInstitutionType(draft.institutionType) === 'Jasa / Konsultan'
                          ? 'Contoh: 120 Klien Korporasi'
                          : normalizeInstitutionType(draft.institutionType) === 'Layanan Kesehatan'
                            ? 'Contoh: 50 Tempat Tidur Rawat Inap'
                            : normalizeInstitutionType(draft.institutionType) === 'Yayasan / Organisasi Umum'
                              ? 'Contoh: 500+ Donatur Tetap'
                              : 'Contoh: 200+ Anggota'
                }
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>

            {/* Jumlah Tenaga Pengajar / Staf */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>
                {normalizeInstitutionType(draft.institutionType) === 'Pesantren'
                  ? 'Jumlah Tenaga Pendidik & Asatidz'
                  : ['Sekolah Islam Terpadu', 'Madrasah'].includes(normalizeInstitutionType(draft.institutionType))
                    ? 'Jumlah Tenaga Pendidik & Guru'
                    : normalizeInstitutionType(draft.institutionType) === 'UMKM / Bisnis Retail'
                      ? 'Jumlah Karyawan & Staf Toko'
                      : normalizeInstitutionType(draft.institutionType) === 'Properti / Kos-kosan'
                        ? 'Staf Pengelola & Keamanan'
                        : normalizeInstitutionType(draft.institutionType) === 'Jasa / Konsultan'
                          ? 'Jumlah Konsultan & Staf Ahli'
                          : normalizeInstitutionType(draft.institutionType) === 'Layanan Kesehatan'
                            ? 'Jumlah Dokter & Tenaga Medis'
                            : normalizeInstitutionType(draft.institutionType) === 'Yayasan / Organisasi Umum'
                              ? 'Jumlah Pengurus & Relawan'
                              : 'Jumlah Tim / Karyawan'}
              </Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                value={draft.staffCount}
                onChangeText={(val) => setDraft({ ...draft, staffCount: val })}
                placeholder={
                  normalizeInstitutionType(draft.institutionType) === 'Pesantren'
                    ? 'Contoh: 85 Asatidz & Staf Profesional'
                    : ['Sekolah Islam Terpadu', 'Madrasah'].includes(normalizeInstitutionType(draft.institutionType))
                      ? 'Contoh: 60 Guru & Tenaga Kependidikan'
                      : normalizeInstitutionType(draft.institutionType) === 'UMKM / Bisnis Retail'
                        ? 'Contoh: 15 Karyawan & Pramuniaga'
                        : normalizeInstitutionType(draft.institutionType) === 'Properti / Kos-kosan'
                          ? 'Contoh: 4 Staf Kebersihan & Penjaga'
                          : normalizeInstitutionType(draft.institutionType) === 'Jasa / Konsultan'
                            ? 'Contoh: 12 Konsultan & Associate'
                            : normalizeInstitutionType(draft.institutionType) === 'Layanan Kesehatan'
                              ? 'Contoh: 20 Dokter & 35 Perawat'
                              : normalizeInstitutionType(draft.institutionType) === 'Yayasan / Organisasi Umum'
                                ? 'Contoh: 25 Pengurus & 100 Relawan'
                                : 'Contoh: 10 Staf Profesional'
                }
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>

            {/* URL Logo Institusi */}
            <View style={styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>URL Logo Institusi (Opsional)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TextInput
                  style={[styles.formInput, { flex: 1 }, !isLogoValid && styles.inputInvalid]}
                  value={draft.logoUrl ?? ''}
                  onChangeText={(val) => setDraft({ ...draft, logoUrl: val })}
                  placeholder="https://domain.com/logo.png"
                  placeholderTextColor={colors.textPlaceholder}
                  autoCapitalize="none"
                />
                {draft.logoUrl && isLogoValid ? (
                  <View style={styles.logoPreviewBox}>
                    <Image
                      source={{ uri: draft.logoUrl }}
                      style={styles.logoPreviewImage}
                      resizeMode="cover"
                    />
                  </View>
                ) : null}
              </View>
              {!isLogoValid && (
                <Text style={styles.errorText}>URL logo harus diawali dengan http:// atau https://</Text>
              )}
            </View>
          </View>

          <View style={styles.cardFooter}>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSaveSettings}>
              <AppIcon name="check" size={15} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Simpan Identitas</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================== */}
      {/* 4. KONTEN TAB: KONTAK & LOKASI             */}
      {/* ========================================== */}
      {activeTab === 'contact' && (
        <View style={[styles.cardContainer, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Informasi Kontak Resmi & Lokasi</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              Kontak resmi yang dipublikasikan kepada orang tua dan dijadikan rujukan eskalasi chatbot.
            </Text>
          </View>

          <View style={styles.formGrid}>
            {/* Nomor WhatsApp Resmi */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>
                Nomor Telepon / WhatsApp Resmi <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                value={draft.escalationPhone}
                onChangeText={(val) => setDraft({ ...draft, escalationPhone: val })}
                placeholder="+62 812-3456-7890"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="phone-pad"
              />
              <Text style={styles.formHelper}>
                Digunakan sebagai nomor utama saat bot mengarahkan penanya untuk menghubungi CS via WA.
              </Text>
            </View>

            {/* Email Resmi */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Alamat Email Resmi Institusi</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                value={draft.officialEmail}
                onChangeText={(val) => setDraft({ ...draft, officialEmail: val })}
                placeholder="info@darululum-wabiz.sch.id"
                placeholderTextColor={colors.textPlaceholder}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Alamat Lengkap */}
            <View style={styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>
                Alamat Lengkap Kampus / Yayasan <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.address}
                onChangeText={(val) => setDraft({ ...draft, address: val })}
                placeholder="Jl. Raya Pesantren No. 45, Cisarua, Bogor, Jawa Barat 16750"
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* URL Google Maps */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Tautan Navigasi Google Maps</Text>
              <TextInput
                style={[styles.formInput, !isMapsValid && styles.inputInvalid]}
                value={draft.mapsUrl}
                onChangeText={(val) => setDraft({ ...draft, mapsUrl: val })}
                placeholder="https://maps.google.com/?q=..."
                placeholderTextColor={colors.textPlaceholder}
                autoCapitalize="none"
              />
              {!isMapsValid && (
                <Text style={styles.errorText}>URL Maps harus diawali dengan http:// atau https://</Text>
              )}
            </View>

            {/* Situs Web Resmi */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>URL Situs Web Resmi</Text>
              <TextInput
                style={[styles.formInput, !isWebValid && styles.inputInvalid]}
                value={draft.websiteUrl}
                onChangeText={(val) => setDraft({ ...draft, websiteUrl: val })}
                placeholder="https://darululum-wabiz.sch.id"
                placeholderTextColor={colors.textPlaceholder}
                autoCapitalize="none"
              />
              {!isWebValid && (
                <Text style={styles.errorText}>URL Website harus diawali dengan http:// atau https://</Text>
              )}
            </View>
          </View>

          <View style={styles.cardFooter}>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSaveSettings}>
              <AppIcon name="check" size={15} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Simpan Informasi Kontak</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================== */}
      {/* 5. KONTEN TAB: PENDAFTARAN & BIAYA         */}
      {/* ========================================== */}
      {activeTab === 'admission' && (
        <View style={[styles.cardContainer, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Informasi Pendaftaran Santri / Siswa Baru (PSB)</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              Sumber rujukan pendaftaran online, skema biaya, dan persyaratan berkas yang diakses otomatis oleh bot.
            </Text>
          </View>

          <View style={styles.formGrid}>
            {/* URL Formulir Pendaftaran */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>URL Formulir Pendaftaran Online (PSB)</Text>
              <TextInput
                style={[styles.formInput, !isRegValid && styles.inputInvalid]}
                value={draft.registrationUrl}
                onChangeText={(val) => setDraft({ ...draft, registrationUrl: val })}
                placeholder="https://psb.darululum-wabiz.sch.id"
                placeholderTextColor={colors.textPlaceholder}
                autoCapitalize="none"
              />
              {!isRegValid && (
                <Text style={styles.errorText}>Tautan formulir harus diawali http:// atau https://</Text>
              )}
            </View>

            {/* URL Informasi Lengkap PSB */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>URL Halaman Brosur & Informasi Lengkap</Text>
              <TextInput
                style={[styles.formInput, !isInfoValid && styles.inputInvalid]}
                value={draft.infoPageUrl}
                onChangeText={(val) => setDraft({ ...draft, infoPageUrl: val })}
                placeholder="https://darululum-wabiz.sch.id/informasi-psb"
                placeholderTextColor={colors.textPlaceholder}
                autoCapitalize="none"
              />
              {!isInfoValid && (
                <Text style={styles.errorText}>Tautan informasi harus diawali http:// atau https://</Text>
              )}
            </View>

            {/* Kontak Petugas PSB */}
            <View style={styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Kontak Petugas / Panitia Pendaftaran</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                value={draft.admissionContact}
                onChangeText={(val) => setDraft({ ...draft, admissionContact: val })}
                placeholder="Contoh: Ustadzah Siti Aisyah (+62 812-3456-7890)"
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>

            {/* Periode / Jadwal Pendaftaran */}
            <View style={styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Periode & Jadwal Gelombang Pendaftaran</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.admissionSchedule}
                onChangeText={(val) => setDraft({ ...draft, admissionSchedule: val })}
                placeholder="Gelombang 1 dibuka mulai 1 Oktober s.d. 30 November..."
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Informasi Biaya Resmi */}
            <View style={styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Informasi Biaya Pendaftaran & Pendidikan (SPP)</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.tuitionInfo}
                onChangeText={(val) => setDraft({ ...draft, tuitionInfo: val })}
                placeholder="Cantumkan biaya formulir, uang pangkal, atau arahan verifikasi langsung ke CS Keuangan..."
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={3}
              />
              <Text style={styles.formHelper}>
                {'Prinsip Anti-Halusinasi: Jika bagian ini dikosongkan, chatbot secara tegas menyatakan bahwa informasi biaya belum dipublikasikan dan menawarkan bantuan staf CS.'}
              </Text>
            </View>

            {/* Persyaratan Pendaftaran */}
            <View style={styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Persyaratan Berkas & Seleksi Masuk</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.requirements}
                onChangeText={(val) => setDraft({ ...draft, requirements: val })}
                placeholder="Fotokopi KK, Akta Kelahiran, pas foto, tes baca Al-Qur'an..."
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={3}
              />
            </View>
          </View>

          <View style={styles.cardFooter}>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSaveSettings}>
              <AppIcon name="check" size={15} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Simpan Informasi Pendaftaran</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================== */}
      {/* 6. KONTEN TAB: OPERASIONAL & FAQ           */}
      {/* ========================================== */}
      {activeTab === 'operational' && (
        <View style={[styles.cardContainer, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Jam Operasional, Fasilitas & FAQ Lembaga</Text>
            <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
              Informasi waktu pelayanan, sarana kampus, dan daftar tanya-jawab resmi untuk memperkaya respon otomatis bot.
            </Text>
          </View>

          <View style={styles.formGrid}>
            {/* Jam Layanan CS */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Jam Layanan Customer Service</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                value={draft.csHours}
                onChangeText={(val) => setDraft({ ...draft, csHours: val })}
                placeholder="Senin - Sabtu: 08.00 - 16.00 WIB"
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>

            {/* Hari Operasional */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Hari Operasional Kantor / Kampus</Text>
              <TextInput
                style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                value={draft.operationalDays}
                onChangeText={(val) => setDraft({ ...draft, operationalDays: val })}
                placeholder="Senin s.d. Sabtu (Ahad Libur)"
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>

            {/* Fasilitas Institusi */}
            <View style={styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Informasi Fasilitas Kampus & Asrama</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.facilities}
                onChangeText={(val) => setDraft({ ...draft, facilities: val })}
                placeholder="Masjid 2 lantai, asrama ber-AC, lab komputer, lapangan panahan..."
                placeholderTextColor={colors.textPlaceholder}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* FAQ Manager */}
            <View style={styles.formColFull}>
              <Text style={[styles.formLabel, { color: colors.textPrimary }]}>FAQ & Informasi Resmi Tambahan</Text>
              <Text style={styles.formHelper}>
                Pertanyaan dan jawaban resmi di bawah ini membantu asisten bot menjawab pertanyaan umum wali santri tanpa halusinasi.
              </Text>

              {/* List FAQ Terdaftar */}
              <View style={styles.faqList}>
                {draft.faqs.map((item, index) => (
                  <View key={item.id} style={styles.faqItemCard}>
                    <View style={styles.faqItemHeader}>
                      <View style={styles.faqNumberBadge}>
                        <Text style={styles.faqNumberText}>FAQ #{index + 1}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.faqDeleteBtn}
                        onPress={() => handleRemoveFaq(item.id)}
                      >
                        <AppIcon name="trash" size={13} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.faqQuestionText}>Q: {item.question}</Text>
                    <Text style={styles.faqAnswerText}>A: {item.answer}</Text>
                  </View>
                ))}
              </View>

              {/* Form Tambah FAQ Baru */}
              <View style={styles.addFaqBox}>
                <Text style={styles.addFaqTitle}>+ Tambah Butir FAQ Baru</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                  value={newFaqQ}
                  onChangeText={setNewFaqQ}
                  placeholder="Ketik pertanyaan (contoh: 'Apakah santri boleh bawa HP?')..."
                  placeholderTextColor={colors.textPlaceholder}
                />
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  value={newFaqA}
                  onChangeText={setNewFaqA}
                  placeholder="Ketik jawaban resmi lembaga..."
                  placeholderTextColor={colors.textPlaceholder}
                  multiline
                  numberOfLines={2}
                />
                <TouchableOpacity
                  style={[
                    styles.btnAddFaqSubmit,
                    (!newFaqQ.trim() || !newFaqA.trim()) && styles.btnAddFaqDisabled,
                  ]}
                  onPress={handleAddFaq}
                  disabled={!newFaqQ.trim() || !newFaqA.trim()}
                >
                  <AppIcon name="plus" size={13} color="#FFFFFF" />
                  <Text style={styles.btnAddFaqSubmitText}>Tambahkan ke Daftar FAQ</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.cardFooter}>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSaveSettings}>
              <AppIcon name="check" size={15} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Simpan Operasional & FAQ</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================== */}
      {/* 7. KONTEN TAB: GATEWAY WHATSAPP            */}
      {/* ========================================== */}
      {activeTab === 'gateway' && (
        <View style={{ gap: 16 }}>
          {/* Action Message Banner khusus WhatsApp */}
          {waActionMessage && (
            <View
              style={[
                styles.feedbackBanner,
                waActionMessage.type === 'success' && styles.feedbackSuccess,
                waActionMessage.type === 'error' && styles.feedbackError,
                waActionMessage.type === 'info' && styles.feedbackInfo,
              ]}
            >
              <AppIcon
                name={
                  waActionMessage.type === 'success'
                    ? 'check'
                    : waActionMessage.type === 'error'
                      ? 'alert'
                      : 'refresh'
                }
                size={16}
                color={
                  waActionMessage.type === 'success'
                    ? '#047857'
                    : waActionMessage.type === 'error'
                      ? '#B91C1C'
                      : '#1D4ED8'
                }
              />
              <Text
                style={[
                  styles.feedbackBannerText,
                  waActionMessage.type === 'success' && { color: '#047857' },
                  waActionMessage.type === 'error' && { color: '#B91C1C' },
                  waActionMessage.type === 'info' && { color: '#1D4ED8' },
                ]}
              >
                {waActionMessage.text}
              </Text>
            </View>
          )}

          {/* KARTU 1: KONEKSI WHATSAPP QR (BAILEYS STAGING WORKER) */}
          <View style={[styles.cardContainer, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 240 }}>
                  <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Koneksi WhatsApp Staging</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Tautkan nomor WhatsApp uji coba melalui scan QR Code perangkat tertaut (Multi-Device).
                  </Text>
                </View>
                <View
                  style={[
                    styles.gatewayStatusPill,
                    workerOnline === false && { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
                    waStatus?.status === 'connected' && { backgroundColor: colors.successBg, borderColor: colors.successBorder },
                    waStatus?.status === 'qr_ready' && { backgroundColor: colors.accentSubtle, borderColor: colors.accentBorder },
                    (waStatus?.status === 'connecting' || waStatus?.status === 'initiating') && { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
                    waStatus?.status === 'qr_expired' && { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
                    waStatus?.status === 'error' && { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
                  ]}
                >
                  <View
                    style={[
                      styles.gatewayStatusDot,
                      workerOnline === false && { backgroundColor: '#DC2626' },
                      waStatus?.status === 'connected' && { backgroundColor: '#059669' },
                      waStatus?.status === 'qr_ready' && { backgroundColor: '#2563EB' },
                      (waStatus?.status === 'connecting' || waStatus?.status === 'initiating') && { backgroundColor: '#D97706' },
                      waStatus?.status === 'qr_expired' && { backgroundColor: '#F59E0B' },
                      waStatus?.status === 'error' && { backgroundColor: '#DC2626' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.gatewayStatusText,
                      workerOnline === false && { color: '#B91C1C' },
                      waStatus?.status === 'connected' && { color: '#047857' },
                      waStatus?.status === 'qr_ready' && { color: '#1D4ED8' },
                      (waStatus?.status === 'connecting' || waStatus?.status === 'initiating') && { color: '#B45309' },
                      waStatus?.status === 'qr_expired' && { color: '#B45309' },
                      waStatus?.status === 'error' && { color: '#B91C1C' },
                    ]}
                  >
                    {workerOnline === false
                      ? 'Worker Offline'
                      : waStatus?.status === 'connected'
                        ? 'Terhubung'
                        : waStatus?.status === 'qr_ready'
                          ? 'QR Tersedia'
                          : waStatus?.status === 'connecting'
                            ? 'Menghubungkan...'
                            : waStatus?.status === 'initiating'
                              ? 'Menunggu QR...'
                              : waStatus?.status === 'qr_expired'
                                ? 'QR Kedaluwarsa'
                                : waStatus?.status === 'error'
                                  ? 'Gagal'
                                  : waStatus?.status === 'logged_out'
                                    ? 'Sesi Dicabut'
                                    : 'Belum Terhubung'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ padding: 18, gap: 14 }}>
              {isWaLoading && (
                <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                  <ActivityIndicator size="small" color={COLORS.emerald} />
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 6 }}>
                    Menghubungi worker Baileys lokal...
                  </Text>
                </View>
              )}

              {/* JIKA WORKER OFFLINE */}
              {workerOnline === false && !isWaLoading && (
                <View style={styles.qrWarningBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <AppIcon name="alert" size={16} color="#DC2626" />
                    <Text style={styles.qrWarningTitle}>
                      {getWorkerBaseUrl() ? 'Worker Staging Belum Berjalan' : 'Worker Gateway Belum Terhubung'}
                    </Text>
                  </View>
                  <Text style={styles.qrWarningDesc}>
                    {getWorkerBaseUrl() ? (
                      <>
                        Layanan Baileys worker belum aktif pada URL{' '}
                        <Text style={{ fontWeight: '700' }}>{getWorkerBaseUrl()}</Text>. Untuk menghubungkan WhatsApp melalui QR, jalankan perintah ini di jendela terminal komputer Anda:
                      </>
                    ) : (
                      'Layanan WhatsApp worker belum dikonfigurasi atau belum terhubung ke URL publik (EXPO_PUBLIC_WHATSAPP_WORKER_URL). Pada mode demo web statis, gateway pengiriman WhatsApp ditangguhkan demi keamanan.'
                    )}
                  </Text>
                  {getWorkerBaseUrl() ? (
                    <>
                      <View style={styles.mockMonoInput}>
                        <Text style={[styles.monoText, { color: COLORS.forestDark, fontWeight: '700' }]}>
                          cd server && npm start
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <TouchableOpacity
                          style={styles.btnRetryWorker}
                          onPress={() => refreshWhatsAppWorkerState(true)}
                          activeOpacity={0.8}
                        >
                          <AppIcon name="refresh" size={13} color="#FFFFFF" />
                          <Text style={styles.btnRetryWorkerText}>Coba Lagi</Text>
                        </TouchableOpacity>
                        <Text style={{ fontSize: 11, color: '#64748B' }}>
                          {'Tekan "Coba Lagi" setelah worker aktif.'}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <Text style={{ fontSize: 11, color: '#64748B' }}>
                      Modul profil, kontak, tim, dan dashboard tetap dapat diakses secara mandiri melalui Supabase.
                    </Text>
                  )}
                </View>
              )}

              {/* JIKA SUDAH TERHUBUNG */}
              {workerOnline && waStatus?.status === 'connected' && !isWaLoading && (
                <View style={styles.qrSuccessBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={styles.qrSuccessIconCircle}>
                      <AppIcon name="check" size={18} color="#FFFFFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.qrSuccessTitle}>Nomor WhatsApp Uji Coba Terhubung</Text>
                      <Text style={styles.qrSuccessSubtitle}>
                        Status: Perangkat Tertaut Aktif (Companion Device)
                      </Text>
                    </View>
                  </View>

                  <View style={styles.qrConnectedDetails}>
                    <View style={styles.qrDetailRow}>
                      <Text style={styles.qrDetailLabel}>Nomor WhatsApp:</Text>
                      <Text style={styles.qrDetailValue}>{waStatus.phoneNumber || 'Terdeteksi'}</Text>
                    </View>
                    <View style={styles.qrDetailRow}>
                      <Text style={styles.qrDetailLabel}>Nama Akun WhatsApp:</Text>
                      <Text style={styles.qrDetailValue}>{waStatus.whatsappName || 'Akun Uji Coba'}</Text>
                    </View>
                    <View style={styles.qrDetailRow}>
                      <Text style={styles.qrDetailLabel}>Server Worker:</Text>
                      <Text style={styles.qrDetailValue}>{getWorkerBaseUrl()}</Text>
                    </View>
                  </View>

                  <Text style={styles.qrCompanionNote}>
                    * Ponsel Anda tetap menjadi Primary Device. Anda tetap dapat menggunakan WhatsApp di ponsel secara normal tanpa terganggu.
                  </Text>
                </View>
              )}

              {/* JIKA STATUS SIAP DIPINDAI (QR READY ATAU QR EXPIRED DENGAN GAMBAR) */}
              {workerOnline &&
                (waStatus?.status === 'qr_ready' || (waStatus?.status === 'qr_expired' && waQrDataUrl)) &&
                waQrDataUrl &&
                !isWaLoading && (
                  <View style={styles.qrBox}>
                    <View style={styles.qrHeaderRow}>
                      <Text style={styles.qrInstructionTitle}>Hubungkan WhatsApp</Text>
                      <View
                        style={[
                          styles.gatewayStatusPill,
                          {
                            backgroundColor:
                              waStatus?.status === 'qr_ready' ? colors.accentSubtle : colors.warningBg,
                            borderColor:
                              waStatus?.status === 'qr_ready' ? colors.accentBorder : colors.warningBorder,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.gatewayStatusDot,
                            { backgroundColor: waStatus?.status === 'qr_ready' ? '#2563EB' : '#F59E0B' },
                          ]}
                        />
                        <Text
                          style={[
                            styles.gatewayStatusText,
                            { color: waStatus?.status === 'qr_ready' ? '#1D4ED8' : '#B45309' },
                          ]}
                        >
                          {waStatus?.status === 'qr_ready' ? 'QR Tersedia' : 'QR Kedaluwarsa'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.qrImageWrapper}>
                      <Image
                        source={{ uri: waQrDataUrl }}
                        style={styles.qrImage}
                        resizeMode="contain"
                      />
                    </View>

                    <View style={styles.qrCountdownRow}>
                      <AppIcon name="clock" size={13} color={colors.textSecondary} />
                      <Text style={styles.qrExpiryText}>
                        {waCountdown > 0
                          ? `QR berlaku: ${waCountdown} detik`
                          : `QR diperbarui: ${waQrGeneratedAt || 'Baru saja'}`}
                      </Text>
                      <TouchableOpacity
                        style={styles.btnQrRefreshMini}
                        onPress={() => refreshWhatsAppWorkerState(true)}
                        activeOpacity={0.7}
                      >
                        <AppIcon name="refresh" size={11} color={colors.accent} />
                        <Text style={styles.btnQrRefreshMiniText}>Perbarui QR</Text>
                      </TouchableOpacity>
                    </View>

                    {waStatus?.status === 'qr_expired' && (
                      <TouchableOpacity
                        style={[styles.btnPrimary, { marginTop: 8, marginBottom: 8, alignSelf: 'center' }]}
                        onPress={handleReconnectWhatsApp}
                        activeOpacity={0.8}
                      >
                        <AppIcon name="refresh" size={14} color="#FFFFFF" />
                        <Text style={styles.btnPrimaryText}>Perbarui QR Baru</Text>
                      </TouchableOpacity>
                    )}

                    <View style={styles.qrNoticeBox}>
                      <AppIcon name="alert" size={14} color="#D97706" />
                      <Text style={styles.qrNoticeText}>
                        PENTING: Gunakan nomor khusus uji coba staging. Jangan menggunakan nomor WhatsApp utama lembaga.
                      </Text>
                    </View>
                  </View>
                )}

              {/* JIKA STATUS LAIN (DISCONNECTED / LOGGED OUT / ERROR / QR EXPIRED TANPA GAMBAR) */}
              {workerOnline &&
                waStatus?.status !== 'connected' &&
                waStatus?.status !== 'qr_ready' &&
                !(waStatus?.status === 'qr_expired' && waQrDataUrl) &&
                !isWaLoading && (
                  <View style={styles.qrInfoBox}>
                    <Text style={styles.qrInfoTitle}>
                      {waStatus?.status === 'logged_out'
                        ? 'Sesi Dicabut di Aplikasi WhatsApp Ponsel'
                        : waStatus?.status === 'error'
                          ? 'Kendala Koneksi Socket Baileys'
                          : waStatus?.status === 'qr_expired'
                            ? 'QR Kedaluwarsa'
                            : waStatus?.status === 'initiating'
                              ? 'Menyiapkan QR Baru...'
                              : 'Sesi Belum Aktif'}
                    </Text>
                    <Text style={styles.qrInfoDesc}>
                      {waStatus?.status === 'logged_out'
                        ? 'Perangkat tertaut telah dikeluarkan dari ponsel WhatsApp. Klik tombol "Hubungkan Ulang" untuk menginisialisasi sesi baru dan memunculkan QR.'
                        : waStatus?.status === 'error'
                          ? `Alasan error: ${waStatus?.lastError || 'Koneksi terputus'}. Klik "Coba Lagi" atau "Hubungkan Ulang" untuk mencoba kembali.`
                          : waStatus?.status === 'qr_expired'
                            ? 'QR Code telah kedaluwarsa. Sistem sedang meminta QR baru secara otomatis, atau klik "Perbarui QR".'
                            : waStatus?.status === 'initiating'
                              ? 'Sedang menghubungkan ke server WhatsApp dan membuat kode QR pairing baru. Mohon tunggu sejenak...'
                              : 'Belum ada sesi aktif. Klik "Hubungkan WhatsApp" untuk meminta QR pairing baru.'}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      <TouchableOpacity
                        style={styles.btnPrimary}
                        onPress={handleReconnectWhatsApp}
                        activeOpacity={0.8}
                      >
                        <AppIcon name="link" size={13} color="#FFFFFF" />
                        <Text style={styles.btnPrimaryText}>
                          {waStatus?.status === 'qr_expired' ? 'Perbarui QR' : 'Hubungkan WhatsApp'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.btnSecondary}
                        onPress={() => refreshWhatsAppWorkerState(true)}
                        activeOpacity={0.8}
                      >
                        <AppIcon name="refresh" size={13} color={colors.textPrimary} />
                        <Text style={styles.btnSecondaryText}>Coba Lagi</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

              {/* TOMBOL AKSI BAILEYS WORKER */}
              <View style={styles.gatewayActionRow}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  disabled={isWaLoading}
                  onPress={() => refreshWhatsAppWorkerState(true)}
                >
                  <AppIcon name="refresh" size={14} color={colors.textPrimary} />
                  <Text style={styles.btnSecondaryText}>Segarkan Status</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnSecondary}
                  disabled={isWaLoading}
                  onPress={handleReconnectWhatsApp}
                >
                  <AppIcon name="link" size={14} color={colors.textPrimary} />
                  <Text style={styles.btnSecondaryText}>Hubungkan Ulang</Text>
                </TouchableOpacity>

                {workerOnline && (
                  <TouchableOpacity
                    style={styles.btnDanger}
                    disabled={isWaLoading}
                    onPress={() => setShowLogoutConfirm(true)}
                  >
                    <AppIcon name="close" size={14} color="#DC2626" />
                    <Text style={styles.btnDangerText}>Putuskan & Hapus Sesi</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* KARTU 2: KONFIGURASI ALTERNATIF META CLOUD API (OFFICIAL) */}
          <View style={[styles.cardContainer, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Konfigurasi Alternatif: Meta Cloud API (Official)</Text>
                <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                  Opsional untuk lembaga yang menggunakan nomor resmi Meta WhatsApp Business Cloud API.
                </Text>
              </View>
            </View>

            <View style={styles.formGrid}>
              <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
                <Text style={[styles.formLabel, { color: colors.textPrimary }]}>ID Organisasi WABiz</Text>
                <View style={styles.mockMonoInput}>
                  <Text style={styles.monoText}>{draft.orgId}</Text>
                </View>
              </View>

              <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
                <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Zona Waktu Sistem</Text>
                <View style={styles.mockMonoInput}>
                  <Text style={styles.monoText}>Asia/Jakarta (WIB • UTC+7)</Text>
                </View>
              </View>

              <View style={styles.formColFull}>
                <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Webhook Callback URL</Text>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.inputBorder }]}
                  value={draft.webhookUrl}
                  onChangeText={(val) => setDraft({ ...draft, webhookUrl: val })}
                  placeholder="https://gateway.wabiz.id/v1/webhook/..."
                  placeholderTextColor={colors.textPlaceholder}
                  autoCapitalize="none"
                />
                <Text style={styles.formHelper}>
                  Salin URL ini ke Meta Developer Console pada bagian Webhook WhatsApp Business jika menggunakan Meta Cloud API resmi.
                </Text>
              </View>

              <View style={styles.formColFull}>
                <Text style={[styles.formLabel, { color: colors.textPrimary }]}>Verify Token Webhook</Text>
                <View
                  style={styles.verifyTokenInputContainer}
                  // @ts-ignore
                  dataSet={{ inputContainer: 'true' }}
                >
                  <TextInput
                    style={styles.verifyTokenInput}
                    value={draft.verifyToken}
                    onChangeText={(val) => setDraft({ ...draft, verifyToken: val })}
                    placeholder="Token verifikasi rahasia..."
                    placeholderTextColor={colors.textPlaceholder}
                    autoCapitalize="none"
                    secureTextEntry={!showVerifyToken}
                    // @ts-ignore
                    dataSet={{ embedded: 'true' }}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowVerifyToken(!showVerifyToken)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showVerifyToken
                        ? 'Sembunyikan verify token webhook'
                        : 'Tampilkan verify token webhook'
                    }
                  >
                    <AppIcon
                      name={showVerifyToken ? 'eye' : 'eye-off'}
                      size={17}
                      color={showVerifyToken ? COLORS.teal : COLORS.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.gatewayActionRow}>
              <TouchableOpacity style={styles.btnPrimary} onPress={handleSaveSettings}>
                <AppIcon name="check" size={15} color="#FFFFFF" />
                <Text style={styles.btnPrimaryText}>Simpan Kredensial Meta Gateway</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* MODAL KONFIRMASI LOGOUT & PENGHAPUSAN KREDENSIAL */}
      <Modal
        visible={showLogoutConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, !isDesktop && styles.modalBoxMobile]}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalDangerIconBox}>
                <AppIcon name="alert" size={20} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Putuskan Koneksi & Hapus Sesi?</Text>
                <Text style={styles.modalSubtitle}>
                  Tindakan ini akan menghentikan integrasi WhatsApp Gateway dan memusnahkan kredensial dari server.
                </Text>
              </View>
            </View>

            <View style={styles.modalWarningBox}>
              <View style={styles.modalWarningItem}>
                <AppIcon name="check" size={13} color="#DC2626" />
                <Text style={styles.modalWarningText}>
                  Socket Baileys akan dimatikan dan tidak akan melakukan rekoneksi otomatis.
                </Text>
              </View>
              <View style={styles.modalWarningItem}>
                <AppIcon name="check" size={13} color="#DC2626" />
                <Text style={styles.modalWarningText}>
                  Seluruh file sesi kredensial (creds.json) dimusnahkan secara permanen dari server lokal.
                </Text>
              </View>
              <View style={styles.modalWarningItem}>
                <AppIcon name="check" size={13} color="#DC2626" />
                <Text style={styles.modalWarningText}>
                  Status Dashboard seketika kembali ke &apos;Belum Terhubung&apos; tanpa menampilkan nomor lama.
                </Text>
              </View>
              <View style={styles.modalWarningItem}>
                <AppIcon name="check" size={13} color="#DC2626" />
                <Text style={styles.modalWarningText}>
                  Untuk menghubungkan kembali, Anda harus melakukan scan QR baru melalui ponsel.
                </Text>
              </View>
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                activeOpacity={0.8}
                onPress={() => setShowLogoutConfirm(false)}
                disabled={isWaLoading}
              >
                <Text style={styles.modalBtnCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalBtnConfirmDanger}
                activeOpacity={0.8}
                onPress={() => handleDisconnectWhatsApp(true)}
                disabled={isWaLoading}
              >
                {isWaLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <AppIcon name="close" size={14} color="#FFFFFF" />
                    <Text style={styles.modalBtnConfirmDangerText}>Ya, Putuskan & Hapus Kredensial</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==========================================
// STYLESHEET B2B SAAS PENGATURAN
// ==========================================
const createStyles = (colors: ThemePalette) => StyleSheet.create({
  pageContainer: {
    flex: 1,
    gap: 16,
  },

  // HEADER
  pageHeader: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  headerLeft: {
    flex: 1,
    minWidth: 260,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  statusDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.emerald,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },

  // FEEDBACK TOAST
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
  },
  feedbackError: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  feedbackInfo: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accentBorder,
  },
  feedbackWarning: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  feedbackBannerText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  // PROTOTYPE BANNER
  protoBanner: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  protoIconBox: {
    marginTop: 2,
  },
  protoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.warningText,
    marginBottom: 2,
  },
  protoBannerDesc: {
    fontSize: 12,
    color: colors.warningText,
    lineHeight: 16,
  },
  protoRestoreBtn: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  protoRestoreBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // TAB NAVIGASI
  tabNavContainer: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  tabNavContent: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    padding: 2,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: colors.accentSubtle,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },

  // CARD CONTAINER
  cardContainer: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 16,
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },

  // FORM GRID
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  formColFull: {
    width: '100%',
  },
  formColHalf: {
    width: '48.8%',
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 5,
  },
  requiredStar: {
    color: '#DC2626',
  },
  formInput: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.textPrimary,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  verifyTokenInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
  },
  verifyTokenInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 13,
    color: colors.textPrimary,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  eyeBtn: {
    paddingLeft: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
    }),
  },
  formTextArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  inputInvalid: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  formHelper: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 15,
  },
  errorText: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 4,
  },

  // LOGO PREVIEW
  logoPreviewBox: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  logoPreviewImage: {
    width: '100%',
    height: '100%',
  },

  // RADIO PICKER
  radioPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  radioCardActive: {
    backgroundColor: colors.accentSubtle,
    borderColor: COLORS.emerald,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: COLORS.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioDotActive: {
    borderColor: COLORS.emerald,
  },
  radioDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.emerald,
  },
  radioLabel: {
    fontSize: 11,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  radioLabelActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },

  // FAQ LIST
  faqList: {
    gap: 8,
    marginTop: 8,
  },
  faqItemCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    gap: 4,
  },
  faqItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqNumberBadge: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  faqNumberText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  faqDeleteBtn: {
    padding: 4,
  },
  faqQuestionText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  faqAnswerText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },

  // ADD FAQ
  addFaqBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
    marginTop: 10,
  },
  addFaqTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  btnAddFaqSubmit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.forestDark,
    borderRadius: 5,
    paddingVertical: 7,
  },
  btnAddFaqDisabled: {
    backgroundColor: '#94A3B8',
  },
  btnAddFaqSubmitText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // GATEWAY
  gatewayStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  gatewayStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  gatewayStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  mockMonoInput: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  monoText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  gatewayActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 14,
  },

  // BUTTONS
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.emerald,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // USER ROLE PILL
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

  // ERROR & LOADING BANNERS
  errorBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 18,
  },
  btnRetry: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  btnRetryText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
  },
  loadingBannerText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // QR & BAILEYS WORKER STYLES
  qrBox: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  qrHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  qrCountdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  btnQrRefreshMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  btnQrRefreshMiniText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  btnRetryWorker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  btnRetryWorkerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  qrInstructionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  qrInstructionDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 500,
  },
  qrImageWrapper: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 12,
  },
  qrImage: {
    width: 220,
    height: 220,
  },
  qrExpiryText: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 8,
  },
  qrNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  qrNoticeText: {
    fontSize: 11,
    color: colors.warningText,
    fontWeight: '500',
  },
  qrWarningBox: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  qrWarningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.dangerText,
  },
  qrWarningDesc: {
    fontSize: 12,
    color: colors.dangerText,
    lineHeight: 18,
  },
  qrSuccessBox: {
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: 8,
    padding: 16,
    gap: 12,
  },
  qrSuccessIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrSuccessTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.successText,
  },
  qrSuccessSubtitle: {
    fontSize: 12,
    color: colors.successText,
  },
  qrConnectedDetails: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
  },
  qrDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  qrDetailLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  qrDetailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  qrCompanionNote: {
    fontSize: 11,
    color: colors.successText,
    fontStyle: 'italic',
  },
  qrInfoBox: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  qrInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  qrInfoDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  btnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  btnDangerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.dangerText,
  },

  // MODAL LOGOUT CONFIRMATION
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 520,
    padding: 24,
    gap: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  modalBoxMobile: {
    maxWidth: '100%',
    padding: 18,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  modalDangerIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  modalWarningBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: 14,
    gap: 10,
  },
  modalWarningItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  modalWarningText: {
    fontSize: 12,
    color: colors.dangerText,
    lineHeight: 17,
    flex: 1,
    fontWeight: '500',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  modalBtnCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  modalBtnCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalBtnConfirmDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#DC2626',
  },
  modalBtnConfirmDangerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
