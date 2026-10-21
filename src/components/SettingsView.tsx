import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS, AppIcon } from '../theme';
import { normalizePhoneNumber } from './ContactsView';
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

// ==========================================
// TIPE DATA & MODEL PENGATURAN ORGANISASI
// ==========================================
export type InstitutionType =
  | 'Pesantren / Islamic Boarding School'
  | 'Sekolah Islam Terpadu'
  | 'Madrasah (MI/MTs/MA)'
  | 'Yayasan Pendidikan'
  | 'Lembaga Kursus & Pelatihan'
  | 'Institusi Lainnya';

export const INSTITUTION_TYPES: InstitutionType[] = [
  'Pesantren / Islamic Boarding School',
  'Sekolah Islam Terpadu',
  'Madrasah (MI/MTs/MA)',
  'Yayasan Pendidikan',
  'Lembaga Kursus & Pelatihan',
  'Institusi Lainnya',
];

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
  institutionType: 'Pesantren / Islamic Boarding School',
  officialDescription: '',
  logoUrl: '',
  studentCount: '',
  staffCount: '',

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
export function translateSettingsError(errMsg: string): string {
  const lower = errMsg.toLowerCase();
  if (lower.includes('permission denied') || lower.includes('policy') || lower.includes('42501')) {
    return 'Akses ditolak oleh kebijakan keamanan (RLS). Hanya pemilik (owner) atau admin organisasi yang diizinkan memperbarui profil lembaga.';
  }
  if (lower.includes('foreign key') || lower.includes('violates foreign key')) {
    return 'Organisasi tidak valid atau tidak ditemukan dalam database.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection')) {
    return 'Gagal terhubung ke Supabase. Periksa koneksi internet Anda.';
  }
  return errMsg || 'Terjadi kendala saat memproses profil organisasi.';
}

export function mapDbToOrgProfile(row: any, fallbackOrgId?: string): OrgProfile {
  if (!row) return DEFAULT_ORG_PROFILE;

  const validInstType = (
    INSTITUTION_TYPES.includes(row.institution_type)
      ? row.institution_type
      : DEFAULT_ORG_PROFILE.institutionType
  ) as InstitutionType;

  return {
    orgName: row.org_name || DEFAULT_ORG_PROFILE.orgName,
    shortName: row.short_name || DEFAULT_ORG_PROFILE.shortName,
    institutionType: validInstType,
    officialDescription: row.official_description ?? DEFAULT_ORG_PROFILE.officialDescription,
    logoUrl: row.logo_url ?? DEFAULT_ORG_PROFILE.logoUrl,
    studentCount: row.student_count ?? DEFAULT_ORG_PROFILE.studentCount,
    staffCount: row.staff_count ?? DEFAULT_ORG_PROFILE.staffCount,
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
  currentUserId: _currentUserId,
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

  // Role Pengguna Saat Ini dalam Organisasi
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member' | string | null>(null);
  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === null;

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
  const [isWaLoading, setIsWaLoading] = useState<boolean>(false);
  const [waActionMessage, setWaActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const isRefreshingRef = useRef<boolean>(false);

  // Fungsi refresh status & QR dari worker lokal
  const refreshWhatsAppWorkerState = useCallback(async (showLoading = true) => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    if (showLoading) {
      setIsWaLoading(true);
      setWaActionMessage(null);
    }

    try {
      // 1. Health check
      const health = await checkWorkerHealth();
      if (!health.ok) {
        setWorkerOnline(false);
        setWaStatus(null);
        setWaQrDataUrl(null);
        if (showLoading) {
          setWaActionMessage({
            type: 'error',
            text: health.error || 'Worker Baileys lokal belum aktif pada loopback 127.0.0.1:4000.',
          });
        }
        return;
      }

      setWorkerOnline(true);

      // 2. Ambil status terkini
      const statusRes = await getWhatsAppStatus();
      if (!statusRes.success || !statusRes.data) {
        if (showLoading) {
          setWaActionMessage({
            type: 'error',
            text: statusRes.error || 'Gagal mengambil status WhatsApp dari worker.',
          });
        }
        return;
      }

      const currentStatus = statusRes.data;
      setWaStatus(currentStatus);

      // 3. Ambil QR jika statusnya siap dipindai / butuh scan / qr_expired
      if (
        currentStatus.status === 'qr_ready' ||
        currentStatus.status === 'initiating' ||
        currentStatus.status === 'disconnected' ||
        currentStatus.status === 'qr_expired'
      ) {
        const qrRes = await getWhatsAppQr();
        if (qrRes.success && qrRes.qrDataUrl) {
          setWaQrDataUrl(qrRes.qrDataUrl);
          setWaQrGeneratedAt(qrRes.generatedAt ? new Date(qrRes.generatedAt).toLocaleTimeString() : new Date().toLocaleTimeString());
        } else if (qrRes.status === 'connected') {
          setWaQrDataUrl(null);
        }
      } else if (currentStatus.status === 'connected') {
        setWaQrDataUrl(null);
      }
    } catch (err: any) {
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

  // Ambil data WhatsApp otomatis dan jalankan polling berkala saat tab gateway aktif
  useEffect(() => {
    let isCancelled = false;
    let pollInterval: any = null;

    if (activeTab === 'gateway') {
      // Initial fetch with spinner
      const initialTimer = setTimeout(() => {
        if (!isCancelled) {
          void refreshWhatsAppWorkerState(true);
        }
      }, 0);

      // Polling setiap 4 detik tanpa spinner agar QR Code selalu ter-refresh otomatis
      pollInterval = setInterval(() => {
        if (!isCancelled) {
          void refreshWhatsAppWorkerState(false);
        }
      }, 4000);

      return () => {
        isCancelled = true;
        clearTimeout(initialTimer);
        if (pollInterval) {
          clearInterval(pollInterval);
        }
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
        refreshWhatsAppWorkerState(false);
      }, 2000);
    } else {
      setWaActionMessage({
        type: 'error',
        text: res.error || 'Gagal meminta koneksi ulang ke worker.',
      });
      setIsWaLoading(false);
    }
  };

  const handleDisconnectWhatsApp = async (deleteSession: boolean) => {
    setIsWaLoading(true);
    setWaActionMessage(null);
    const res = await disconnectWhatsApp(deleteSession);
    if (res.success) {
      setWaActionMessage({
        type: 'success',
        text: deleteSession
          ? 'Koneksi WhatsApp diputuskan dan seluruh file sesi lokal dihapus.'
          : 'Koneksi WhatsApp berhasil diputuskan.',
      });
      await refreshWhatsAppWorkerState(false);
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

    checkRole();
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

    loadData();

    return () => {
      ignore = true;
    };
  }, [effectiveOrgId, setOrgProfile]);

  // Simpan Pengaturan ke Supabase (UPSERT)
  const handleSaveSettings = async () => {
    if (isSaving) return;

    // Batasi akses: Hanya Owner atau Admin yang boleh mengubah profil lembaga
    if (userRole === 'member') {
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
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
      const payload = {
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
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('organization_profiles')
        .upsert(payload, { onConflict: 'organization_id' })
        .select()
        .single();

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
        type: 'success',
        text: 'Menyimpan profil ke database... Menyinkronkan ke chatbot WhatsApp...',
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
    if (userRole === 'member') {
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

  return (
    <View style={styles.pageContainer}>
      {/* ========================================== */}
      {/* 1. HEADER HALAMAN                          */}
      {/* ========================================== */}
      <View style={styles.pageHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Pengaturan Organisasi</Text>
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
          <Text style={styles.headerSubtitle}>
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
            <AppIcon name="refresh" size={14} color={COLORS.forestDark} />
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

      {/* ========================================== */}
      {/* 2. TAB NAVIGASI PENGATURAN                 */}
      {/* ========================================== */}
      <View style={styles.tabNavRow}>
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
      </View>

      {/* ========================================== */}
      {/* 3. KONTEN TAB: IDENTITAS INSTITUSI         */}
      {/* ========================================== */}
      {activeTab === 'identity' && (
        <View style={styles.cardContainer}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Identitas & Profil Resmi Institusi</Text>
            <Text style={styles.cardSubtitle}>
              Informasi dasar yang mengidentifikasi lembaga pendidikan atau yayasan Anda di seluruh ekosistem WABiz.
            </Text>
          </View>

          <View style={styles.formGrid}>
            {/* Nama Resmi Institusi */}
            <View style={styles.formColFull}>
              <Text style={styles.formLabel}>
                Nama Resmi Institusi / Lembaga <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={styles.formInput}
                value={draft.orgName}
                onChangeText={(val) => setDraft({ ...draft, orgName: val })}
                placeholder="Contoh: Pesantren Modern Darul Ulum WABiz"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Nama Singkat */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>Nama Singkat / Brand Populer</Text>
              <TextInput
                style={styles.formInput}
                value={draft.shortName}
                onChangeText={(val) => setDraft({ ...draft, shortName: val })}
                placeholder="Contoh: Darul Ulum WABiz"
                placeholderTextColor={COLORS.textMuted}
              />
              <Text style={styles.formHelper}>Digunakan pada sapaan ringkas dan footer pesan.</Text>
            </View>

            {/* Jenis Institusi */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>Jenis Institusi Pendidikan</Text>
              <View style={styles.radioPickerGrid}>
                {INSTITUTION_TYPES.map((type) => {
                  const isSelected = draft.institutionType === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.radioCard, isSelected && styles.radioCardActive]}
                      onPress={() => setDraft({ ...draft, institutionType: type })}
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

            {/* Deskripsi Resmi */}
            <View style={styles.formColFull}>
              <Text style={styles.formLabel}>
                Deskripsi Resmi Institusi <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.officialDescription}
                onChangeText={(val) => setDraft({ ...draft, officialDescription: val })}
                placeholder="Jelaskan visi, misi, fokus pendidikan, serta nilai unggulan institusi..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
              />
              <Text style={styles.formHelper}>
                Teks ini menjadi landasan primer Chatbot AI saat menjawab profil dan keunggulan lembaga.
              </Text>
            </View>

            {/* Jumlah Santri / Siswa */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>Jumlah Santri / Siswa Aktif</Text>
              <TextInput
                style={styles.formInput}
                value={draft.studentCount}
                onChangeText={(val) => setDraft({ ...draft, studentCount: val })}
                placeholder="Contoh: 1.250 Santri (Putra & Putri)"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Jumlah Tenaga Pengajar */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>Jumlah Tenaga Pendidik & Staf</Text>
              <TextInput
                style={styles.formInput}
                value={draft.staffCount}
                onChangeText={(val) => setDraft({ ...draft, staffCount: val })}
                placeholder="Contoh: 85 Asatidz & Staf Profesional"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* URL Logo Institusi */}
            <View style={styles.formColFull}>
              <Text style={styles.formLabel}>URL Logo Institusi (Opsional)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TextInput
                  style={[styles.formInput, { flex: 1 }, !isLogoValid && styles.inputInvalid]}
                  value={draft.logoUrl ?? ''}
                  onChangeText={(val) => setDraft({ ...draft, logoUrl: val })}
                  placeholder="https://domain.com/logo.png"
                  placeholderTextColor={COLORS.textMuted}
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
        <View style={styles.cardContainer}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Informasi Kontak Resmi & Lokasi</Text>
            <Text style={styles.cardSubtitle}>
              Kontak resmi yang dipublikasikan kepada orang tua dan dijadikan rujukan eskalasi chatbot.
            </Text>
          </View>

          <View style={styles.formGrid}>
            {/* Nomor WhatsApp Resmi */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>
                Nomor Telepon / WhatsApp Resmi <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={styles.formInput}
                value={draft.escalationPhone}
                onChangeText={(val) => setDraft({ ...draft, escalationPhone: val })}
                placeholder="+62 812-3456-7890"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
              />
              <Text style={styles.formHelper}>
                Digunakan sebagai nomor utama saat bot mengarahkan penanya untuk menghubungi CS via WA.
              </Text>
            </View>

            {/* Email Resmi */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>Alamat Email Resmi Institusi</Text>
              <TextInput
                style={styles.formInput}
                value={draft.officialEmail}
                onChangeText={(val) => setDraft({ ...draft, officialEmail: val })}
                placeholder="info@darululum-wabiz.sch.id"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Alamat Lengkap */}
            <View style={styles.formColFull}>
              <Text style={styles.formLabel}>
                Alamat Lengkap Kampus / Yayasan <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.address}
                onChangeText={(val) => setDraft({ ...draft, address: val })}
                placeholder="Jl. Raya Pesantren No. 45, Cisarua, Bogor, Jawa Barat 16750"
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* URL Google Maps */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>Tautan Navigasi Google Maps</Text>
              <TextInput
                style={[styles.formInput, !isMapsValid && styles.inputInvalid]}
                value={draft.mapsUrl}
                onChangeText={(val) => setDraft({ ...draft, mapsUrl: val })}
                placeholder="https://maps.google.com/?q=..."
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
              />
              {!isMapsValid && (
                <Text style={styles.errorText}>URL Maps harus diawali dengan http:// atau https://</Text>
              )}
            </View>

            {/* Situs Web Resmi */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>URL Situs Web Resmi</Text>
              <TextInput
                style={[styles.formInput, !isWebValid && styles.inputInvalid]}
                value={draft.websiteUrl}
                onChangeText={(val) => setDraft({ ...draft, websiteUrl: val })}
                placeholder="https://darululum-wabiz.sch.id"
                placeholderTextColor={COLORS.textMuted}
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
        <View style={styles.cardContainer}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Informasi Pendaftaran Santri / Siswa Baru (PSB)</Text>
            <Text style={styles.cardSubtitle}>
              Sumber rujukan pendaftaran online, skema biaya, dan persyaratan berkas yang diakses otomatis oleh bot.
            </Text>
          </View>

          <View style={styles.formGrid}>
            {/* URL Formulir Pendaftaran */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>URL Formulir Pendaftaran Online (PSB)</Text>
              <TextInput
                style={[styles.formInput, !isRegValid && styles.inputInvalid]}
                value={draft.registrationUrl}
                onChangeText={(val) => setDraft({ ...draft, registrationUrl: val })}
                placeholder="https://psb.darululum-wabiz.sch.id"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
              />
              {!isRegValid && (
                <Text style={styles.errorText}>Tautan formulir harus diawali http:// atau https://</Text>
              )}
            </View>

            {/* URL Informasi Lengkap PSB */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>URL Halaman Brosur & Informasi Lengkap</Text>
              <TextInput
                style={[styles.formInput, !isInfoValid && styles.inputInvalid]}
                value={draft.infoPageUrl}
                onChangeText={(val) => setDraft({ ...draft, infoPageUrl: val })}
                placeholder="https://darululum-wabiz.sch.id/informasi-psb"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
              />
              {!isInfoValid && (
                <Text style={styles.errorText}>Tautan informasi harus diawali http:// atau https://</Text>
              )}
            </View>

            {/* Kontak Petugas PSB */}
            <View style={styles.formColFull}>
              <Text style={styles.formLabel}>Kontak Petugas / Panitia Pendaftaran</Text>
              <TextInput
                style={styles.formInput}
                value={draft.admissionContact}
                onChangeText={(val) => setDraft({ ...draft, admissionContact: val })}
                placeholder="Contoh: Ustadzah Siti Aisyah (+62 812-3456-7890)"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Periode / Jadwal Pendaftaran */}
            <View style={styles.formColFull}>
              <Text style={styles.formLabel}>Periode & Jadwal Gelombang Pendaftaran</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.admissionSchedule}
                onChangeText={(val) => setDraft({ ...draft, admissionSchedule: val })}
                placeholder="Gelombang 1 dibuka mulai 1 Oktober s.d. 30 November..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Informasi Biaya Resmi */}
            <View style={styles.formColFull}>
              <Text style={styles.formLabel}>Informasi Biaya Pendaftaran & Pendidikan (SPP)</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.tuitionInfo}
                onChangeText={(val) => setDraft({ ...draft, tuitionInfo: val })}
                placeholder="Cantumkan biaya formulir, uang pangkal, atau arahan verifikasi langsung ke CS Keuangan..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
              />
              <Text style={styles.formHelper}>
                {'Prinsip Anti-Halusinasi: Jika bagian ini dikosongkan, chatbot secara tegas menyatakan bahwa informasi biaya belum dipublikasikan dan menawarkan bantuan staf CS.'}
              </Text>
            </View>

            {/* Persyaratan Pendaftaran */}
            <View style={styles.formColFull}>
              <Text style={styles.formLabel}>Persyaratan Berkas & Seleksi Masuk</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.requirements}
                onChangeText={(val) => setDraft({ ...draft, requirements: val })}
                placeholder="Fotokopi KK, Akta Kelahiran, pas foto, tes baca Al-Qur'an..."
                placeholderTextColor={COLORS.textMuted}
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
        <View style={styles.cardContainer}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Jam Operasional, Fasilitas & FAQ Lembaga</Text>
            <Text style={styles.cardSubtitle}>
              Informasi waktu pelayanan, sarana kampus, dan daftar tanya-jawab resmi untuk memperkaya respon otomatis bot.
            </Text>
          </View>

          <View style={styles.formGrid}>
            {/* Jam Layanan CS */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>Jam Layanan Customer Service</Text>
              <TextInput
                style={styles.formInput}
                value={draft.csHours}
                onChangeText={(val) => setDraft({ ...draft, csHours: val })}
                placeholder="Senin - Sabtu: 08.00 - 16.00 WIB"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Hari Operasional */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.formLabel}>Hari Operasional Kantor / Kampus</Text>
              <TextInput
                style={styles.formInput}
                value={draft.operationalDays}
                onChangeText={(val) => setDraft({ ...draft, operationalDays: val })}
                placeholder="Senin s.d. Sabtu (Ahad Libur)"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Fasilitas Institusi */}
            <View style={styles.formColFull}>
              <Text style={styles.formLabel}>Informasi Fasilitas Kampus & Asrama</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={draft.facilities}
                onChangeText={(val) => setDraft({ ...draft, facilities: val })}
                placeholder="Masjid 2 lantai, asrama ber-AC, lab komputer, lapangan panahan..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* FAQ Manager */}
            <View style={styles.formColFull}>
              <Text style={styles.formLabel}>FAQ & Informasi Resmi Tambahan</Text>
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
                  style={styles.formInput}
                  value={newFaqQ}
                  onChangeText={setNewFaqQ}
                  placeholder="Ketik pertanyaan (contoh: 'Apakah santri boleh bawa HP?')..."
                  placeholderTextColor={COLORS.textMuted}
                />
                <TextInput
                  style={[styles.formInput, styles.formTextArea]}
                  value={newFaqA}
                  onChangeText={setNewFaqA}
                  placeholder="Ketik jawaban resmi lembaga..."
                  placeholderTextColor={COLORS.textMuted}
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
          <View style={styles.cardContainer}>
            <View style={styles.cardHeader}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 240 }}>
                  <Text style={styles.cardTitle}>Koneksi WhatsApp Staging (QR Pairing Baileys)</Text>
                  <Text style={styles.cardSubtitle}>
                    Tautkan nomor WhatsApp uji coba melalui scan QR Code perangkat tertaut (Multi-Device).
                  </Text>
                </View>
                <View
                  style={[
                    styles.gatewayStatusPill,
                    workerOnline === false && { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
                    waStatus?.status === 'connected' && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                    waStatus?.status === 'qr_ready' && { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
                    waStatus?.status === 'qr_expired' && { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
                  ]}
                >
                  <View
                    style={[
                      styles.gatewayStatusDot,
                      workerOnline === false && { backgroundColor: '#DC2626' },
                      waStatus?.status === 'connected' && { backgroundColor: '#059669' },
                      waStatus?.status === 'qr_ready' && { backgroundColor: '#2563EB' },
                      waStatus?.status === 'connecting' && { backgroundColor: '#D97706' },
                      waStatus?.status === 'qr_expired' && { backgroundColor: '#F59E0B' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.gatewayStatusText,
                      workerOnline === false && { color: '#B91C1C' },
                      waStatus?.status === 'connected' && { color: '#047857' },
                      waStatus?.status === 'qr_ready' && { color: '#1D4ED8' },
                      waStatus?.status === 'qr_expired' && { color: '#B45309' },
                    ]}
                  >
                    {workerOnline === false
                      ? 'Worker Offline'
                      : waStatus?.status === 'connected'
                      ? 'Terhubung'
                      : waStatus?.status === 'qr_ready'
                      ? 'Siap Dipindai'
                      : waStatus?.status === 'connecting' || waStatus?.status === 'initiating'
                      ? 'Menghubungkan...'
                      : waStatus?.status === 'qr_expired'
                      ? 'Memperbarui QR...'
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
                    <Text style={styles.qrWarningTitle}>Worker Staging Lokal Belum Berjalan</Text>
                  </View>
                  <Text style={styles.qrWarningDesc}>
                    Layanan Baileys worker belum aktif pada loopback <Text style={{ fontWeight: '700' }}>http://127.0.0.1:4000</Text>. Untuk menghubungkan WhatsApp melalui QR, jalankan perintah ini di jendela terminal komputer Anda:
                  </Text>
                  <View style={styles.mockMonoInput}>
                    <Text style={[styles.monoText, { color: COLORS.forestDark, fontWeight: '700' }]}>
                      cd server && npm start
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>
                    {'Setelah worker aktif, tekan tombol "Segarkan Status & QR" di bawah.'}
                  </Text>
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
                    <Text style={styles.qrInstructionTitle}>Pindai QR Code untuk Menautkan Nomor</Text>
                    <Text style={styles.qrInstructionDesc}>
                      Buka aplikasi WhatsApp di <Text style={{ fontWeight: '700' }}>ponsel uji coba</Text> &gt; menu Titik Tiga / Pengaturan &gt; <Text style={{ fontWeight: '700' }}>Perangkat Tertaut</Text> &gt; <Text style={{ fontWeight: '700' }}>Tautkan Perangkat</Text>, lalu scan QR di bawah:
                    </Text>

                    <View style={styles.qrImageWrapper}>
                      <Image
                        source={{ uri: waQrDataUrl }}
                        style={styles.qrImage}
                        resizeMode="contain"
                      />
                    </View>

                    <Text style={styles.qrExpiryText}>
                      QR diperbarui pada: {waQrGeneratedAt || 'Baru saja'}. (Pembaruan otomatis aktif)
                    </Text>

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
                        : 'Sesi Belum Aktif'}
                    </Text>
                    <Text style={styles.qrInfoDesc}>
                      {waStatus?.status === 'logged_out'
                        ? 'Perangkat tertaut telah dikeluarkan dari ponsel WhatsApp. Klik tombol "Hubungkan Ulang" untuk menginisialisasi sesi baru dan memunculkan QR.'
                        : waStatus?.status === 'error'
                        ? `Alasan error: ${waStatus?.lastError || 'Koneksi terputus'}. Klik "Hubungkan Ulang" untuk mencoba kembali.`
                        : waStatus?.status === 'qr_expired'
                        ? 'QR Code telah kedaluwarsa. Sistem sedang meminta QR baru secara otomatis, atau klik "Hubungkan Ulang".'
                        : 'Belum ada sesi aktif. Klik "Hubungkan Ulang" untuk meminta QR pairing baru.'}
                    </Text>
                  </View>
                )}

              {/* TOMBOL AKSI BAILEYS WORKER */}
              <View style={styles.gatewayActionRow}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  disabled={isWaLoading}
                  onPress={() => refreshWhatsAppWorkerState(true)}
                >
                  <AppIcon name="refresh" size={14} color={COLORS.forestDark} />
                  <Text style={styles.btnSecondaryText}>Segarkan Status & QR</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnSecondary}
                  disabled={isWaLoading}
                  onPress={handleReconnectWhatsApp}
                >
                  <AppIcon name="link" size={14} color={COLORS.forestDark} />
                  <Text style={styles.btnSecondaryText}>Hubungkan Ulang</Text>
                </TouchableOpacity>

                {(waStatus?.status === 'connected' || waStatus?.status === 'qr_ready') && (
                  <TouchableOpacity
                    style={styles.btnDanger}
                    disabled={isWaLoading}
                    onPress={() => handleDisconnectWhatsApp(false)}
                  >
                    <AppIcon name="close" size={14} color="#DC2626" />
                    <Text style={styles.btnDangerText}>Putuskan Sesi</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* KARTU 2: KONFIGURASI ALTERNATIF META CLOUD API (OFFICIAL) */}
          <View style={styles.cardContainer}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Konfigurasi Alternatif: Meta Cloud API (Official)</Text>
                <Text style={styles.cardSubtitle}>
                  Opsional untuk lembaga yang menggunakan nomor resmi Meta WhatsApp Business Cloud API.
                </Text>
              </View>
            </View>

            <View style={styles.formGrid}>
              <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
                <Text style={styles.formLabel}>ID Organisasi WABiz</Text>
                <View style={styles.mockMonoInput}>
                  <Text style={styles.monoText}>{draft.orgId}</Text>
                </View>
              </View>

              <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
                <Text style={styles.formLabel}>Zona Waktu Sistem</Text>
                <View style={styles.mockMonoInput}>
                  <Text style={styles.monoText}>Asia/Jakarta (WIB • UTC+7)</Text>
                </View>
              </View>

              <View style={styles.formColFull}>
                <Text style={styles.formLabel}>Webhook Callback URL</Text>
                <TextInput
                  style={styles.formInput}
                  value={draft.webhookUrl}
                  onChangeText={(val) => setDraft({ ...draft, webhookUrl: val })}
                  placeholder="https://gateway.wabiz.id/v1/webhook/..."
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                />
                <Text style={styles.formHelper}>
                  Salin URL ini ke Meta Developer Console pada bagian Webhook WhatsApp Business jika menggunakan Meta Cloud API resmi.
                </Text>
              </View>

              <View style={styles.formColFull}>
                <Text style={styles.formLabel}>Verify Token Webhook</Text>
                <TextInput
                  style={styles.formInput}
                  value={draft.verifyToken}
                  onChangeText={(val) => setDraft({ ...draft, verifyToken: val })}
                  placeholder="Token verifikasi rahasia..."
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                />
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
    </View>
  );
}

// ==========================================
// STYLESHEET B2B SAAS PENGATURAN
// ==========================================
const styles = StyleSheet.create({
  pageContainer: {
    flex: 1,
    gap: 16,
  },

  // HEADER
  pageHeader: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
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
    gap: 10,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
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
    color: COLORS.forestDark,
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
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  feedbackError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  feedbackInfo: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  feedbackWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  feedbackBannerText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  // PROTOTYPE BANNER
  protoBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
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
    color: '#92400E',
    marginBottom: 2,
  },
  protoBannerDesc: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 16,
  },
  protoRestoreBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  protoRestoreBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
  },

  // TAB NAVIGASI
  tabNavRow: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
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
    backgroundColor: COLORS.emeraldSubtle,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabBtnTextActive: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },

  // CARD CONTAINER
  cardContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 16,
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
    color: COLORS.textDark,
    marginBottom: 5,
  },
  requiredStar: {
    color: '#DC2626',
  },
  formInput: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.textDark,
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
    color: COLORS.textMuted,
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
    borderColor: COLORS.border,
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
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  radioCardActive: {
    backgroundColor: COLORS.emeraldSubtle,
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
    color: COLORS.textDark,
    fontWeight: '500',
  },
  radioLabelActive: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },

  // FAQ LIST
  faqList: {
    gap: 8,
    marginTop: 8,
  },
  faqItemCard: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 10,
    gap: 4,
  },
  faqItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqNumberBadge: {
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  faqNumberText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  faqDeleteBtn: {
    padding: 4,
  },
  faqQuestionText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  faqAnswerText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },

  // ADD FAQ
  addFaqBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 8,
    marginTop: 10,
  },
  addFaqTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
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
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  monoText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  gatewayActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.forestDark,
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
  },
  loadingBannerText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // QR & BAILEYS WORKER STYLES
  qrBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  qrInstructionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
    textAlign: 'center',
  },
  qrInstructionDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 500,
  },
  qrImageWrapper: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginVertical: 12,
  },
  qrImage: {
    width: 220,
    height: 220,
  },
  qrExpiryText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  qrNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  qrNoticeText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '500',
  },
  qrWarningBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  qrWarningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
  },
  qrWarningDesc: {
    fontSize: 12,
    color: '#991B1B',
    lineHeight: 18,
  },
  qrSuccessBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
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
    color: '#065F46',
  },
  qrSuccessSubtitle: {
    fontSize: 12,
    color: '#047857',
  },
  qrConnectedDetails: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1FAE5',
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
    color: COLORS.textSecondary,
  },
  qrDetailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  qrCompanionNote: {
    fontSize: 11,
    color: '#047857',
    fontStyle: 'italic',
  },
  qrInfoBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 14,
    gap: 6,
  },
  qrInfoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  qrInfoDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  btnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  btnDangerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#DC2626',
  },
});
