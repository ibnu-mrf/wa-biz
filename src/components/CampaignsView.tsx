import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

// ==========================================
// TIPE DATA KAMPANYE (SUPABASE & UI)
// ==========================================
// Tabel public.campaigns di Supabase memiliki kolom:
// - id (uuid)
// - organization_id (uuid)
// - name (text)
// - message_body (text)
// - status (text: draft, scheduled, running, completed, cancelled)
// - scheduled_at (timestamptz, nullable)
// - sent_at (timestamptz, nullable)
// - created_at (timestamptz)
// - updated_at (timestamptz)

export type CampaignStatus = 'Draft' | 'Terjadwal' | 'Berjalan' | 'Selesai' | 'Dibatalkan';
export type CampaignFilter = 'all' | CampaignStatus;
export type DeliveryMode = 'draft' | 'scheduled';

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
  sentAt?: string;
  channel: string;
  deliveredCount?: number;
  isDemo?: boolean;
}

// Normalisasi status dari database Supabase ke label UI
export function normalizeStatusFromDb(status: string | null | undefined): CampaignStatus {
  if (!status) return 'Draft';
  const s = status.toLowerCase();
  if (s === 'scheduled' || s === 'terjadwal') return 'Terjadwal';
  if (s === 'running' || s === 'berjalan' || s === 'sending') return 'Berjalan';
  if (s === 'completed' || s === 'selesai' || s === 'sent') return 'Selesai';
  if (s === 'cancelled' || s === 'canceled' || s === 'dibatalkan') return 'Dibatalkan';
  return 'Draft';
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
}

export function CampaignsView({
  organizationId,
  currentUserId: _currentUserId,
  campaigns: externalCampaigns,
  setCampaigns: externalSetCampaigns,
  contacts = [],
  isDesktop = true,
  onNavigate: _onNavigate,
}: CampaignsViewProps) {
  const [internalCampaigns, setInternalCampaigns] = useState<Campaign[]>([]);
  const campaigns = externalCampaigns ?? internalCampaigns;
  const setCampaigns = externalSetCampaigns ?? setInternalCampaigns;

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
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

  // Form Fields State
  const [formName, setFormName] = useState('');
  const [formPurpose, setFormPurpose] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formSegment, setFormSegment] = useState<'all' | ContactLabel>('all');
  const [formDeliveryMode, setFormDeliveryMode] = useState<DeliveryMode>('draft');
  const [formScheduleDate, setFormScheduleDate] = useState('');
  const [formScheduleTime, setFormScheduleTime] = useState('09:00');
  const [formError, setFormError] = useState<string | null>(null);

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
          .select('id, organization_id, name, message_body, status, scheduled_at, sent_at, created_at, updated_at')
          .eq('organization_id', targetOrgId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching campaigns:', error.message);
          setFetchError(translateCampaignError(error.message));
        } else if (data) {
          const mapped: Campaign[] = data.map((row) => ({
            id: row.id,
            organizationId: row.organization_id,
            name: row.name,
            purpose: '',
            messageContent: row.message_body || '',
            targetSegment: 'all',
            status: normalizeStatusFromDb(row.status),
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
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : undefined,
            sentAt: row.sent_at
              ? new Date(row.sent_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : undefined,
            channel: 'WhatsApp Business API (Tersimpan di Supabase)',
            deliveredCount: undefined,
            isDemo: false,
          }));
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
          .select('id, organization_id, name, message_body, status, scheduled_at, sent_at, created_at, updated_at')
          .eq('organization_id', effectiveOrgId)
          .order('created_at', { ascending: false });

        if (ignore) return;
        if (error) {
          setFetchError(translateCampaignError(error.message));
        } else if (data) {
          const mapped: Campaign[] = data.map((row) => ({
            id: row.id,
            organizationId: row.organization_id,
            name: row.name,
            purpose: '',
            messageContent: row.message_body || '',
            targetSegment: 'all',
            status: normalizeStatusFromDb(row.status),
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
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : undefined,
            sentAt: row.sent_at
              ? new Date(row.sent_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : undefined,
            channel: 'WhatsApp Business API (Tersimpan di Supabase)',
            deliveredCount: undefined,
            isDemo: false,
          }));
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

  // Buka Modal Tambah Kampanye Baru
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
    setFormDeliveryMode('draft');

    // Jadwal default: besok pukul 09:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    setFormScheduleDate(`${yyyy}-${mm}-${dd}`);
    setFormScheduleTime('09:00');

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
    setActiveCampaign(camp);
    setFormName(camp.name);
    setFormPurpose(camp.purpose || '');
    setFormMessage(camp.messageContent);
    setFormSegment(camp.targetSegment || 'all');
    setFormDeliveryMode(camp.status === 'Terjadwal' ? 'scheduled' : 'draft');

    if (camp.scheduledAt) {
      const parts = camp.scheduledAt.split(', ');
      if (parts.length >= 2) {
        setFormScheduleDate(parts[0]);
        setFormScheduleTime(parts[1]);
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yyyy = tomorrow.getFullYear();
        const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const dd = String(tomorrow.getDate()).padStart(2, '0');
        setFormScheduleDate(`${yyyy}-${mm}-${dd}`);
        setFormScheduleTime('09:00');
      }
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const dd = String(tomorrow.getDate()).padStart(2, '0');
      setFormScheduleDate(`${yyyy}-${mm}-${dd}`);
      setFormScheduleTime('09:00');
    }

    setFormError(null);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  // Simpan Kampanye ke Supabase (INSERT / UPDATE)
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

    // 3. Validasi Waktu Jadwal jika dijadwalkan
    let scheduleIso: string | null = null;
    let computedStatusUi: CampaignStatus = 'Draft';
    let computedScheduleDisplay: string | undefined = undefined;

    if (formDeliveryMode === 'scheduled') {
      if (!formScheduleDate || !formScheduleTime) {
        setFormError('Tanggal dan jam jadwal pengiriman wajib diisi.');
        return;
      }

      // Format ISO yang aman: YYYY-MM-DDTHH:mm:00
      const dateTimeString = `${formScheduleDate}T${formScheduleTime}:00`;
      const scheduleDateTime = new Date(dateTimeString);

      if (isNaN(scheduleDateTime.getTime())) {
        setFormError('Format tanggal atau jam jadwal tidak valid (Contoh: YYYY-MM-DD dan 09:00).');
        return;
      }

      if (scheduleDateTime.getTime() <= Date.now()) {
        setFormError('Waktu jadwal siaran harus berada di masa depan.');
        return;
      }

      scheduleIso = scheduleDateTime.toISOString();
      computedStatusUi = 'Terjadwal';
      computedScheduleDisplay = scheduleDateTime.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    const dbStatus = mapStatusToDb(computedStatusUi);
    setIsSubmitting(true);
    setFormError(null);

    try {
      if (activeCampaign) {
        // Operasi UPDATE ke Supabase
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({
            name: formName.trim(),
            message_body: formMessage.trim(),
            status: dbStatus,
            scheduled_at: scheduleIso,
            updated_at: new Date().toISOString(),
          })
          .eq('id', activeCampaign.id)
          .eq('organization_id', effectiveOrgId);

        if (updateError) {
          console.error('Error updating campaign:', updateError.message);
          setFormError(translateCampaignError(updateError.message));
          return;
        }

        // Perbarui state lokal
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
                  scheduledAt: computedScheduleDisplay,
                }
              : c
          )
        );

        setFeedbackMsg({
          type: 'success',
          text: `Kampanye "${formName.trim()}" berhasil diperbarui di database Supabase.`,
        });
      } else {
        // Operasi INSERT ke Supabase
        const { data: newRow, error: insertError } = await supabase
          .from('campaigns')
          .insert({
            organization_id: effectiveOrgId,
            name: formName.trim(),
            message_body: formMessage.trim(),
            status: dbStatus,
            scheduled_at: scheduleIso,
          })
          .select('id, organization_id, name, message_body, status, scheduled_at, sent_at, created_at, updated_at')
          .single();

        if (insertError) {
          console.error('Error inserting campaign:', insertError.message);
          setFormError(translateCampaignError(insertError.message));
          return;
        }

        if (newRow) {
          const newItem: Campaign = {
            id: newRow.id,
            organizationId: newRow.organization_id,
            name: newRow.name,
            purpose: formPurpose.trim(),
            messageContent: newRow.message_body || '',
            targetSegment: formSegment,
            status: normalizeStatusFromDb(newRow.status),
            createdAt: newRow.created_at
              ? new Date(newRow.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Baru saja',
            scheduledAt: newRow.scheduled_at
              ? new Date(newRow.scheduled_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : undefined,
            channel: 'WhatsApp Business API (Tersimpan di Supabase)',
            isDemo: false,
          };
          setCampaigns((prev) => [newItem, ...prev]);
        }

        setFeedbackMsg({
          type: 'success',
          text: `Draf kampanye "${formName.trim()}" berhasil disimpan ke database Supabase.`,
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

  // Batalkan Jadwal Kampanye di Supabase
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
      const { error } = await supabase
        .from('campaigns')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', camp.id)
        .eq('organization_id', effectiveOrgId);

      if (error) {
        setFeedbackMsg({
          type: 'warning',
          text: translateCampaignError(error.message),
        });
      } else {
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
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', activeCampaign.id)
        .eq('organization_id', effectiveOrgId);

      if (error) {
        console.error('Error deleting campaign:', error.message);
        setFeedbackMsg({
          type: 'warning',
          text: translateCampaignError(error.message),
        });
      } else {
        setCampaigns((prev) => prev.filter((c) => c.id !== activeCampaign.id));
        setFeedbackMsg({
          type: 'success',
          text: `Kampanye "${activeCampaign.name}" berhasil dihapus dari database Supabase.`,
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
          channel: 'WhatsApp Business API (Tersimpan di Supabase)',
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

      {/* BANNER TRANSPARANSI INTEGRASI WHATSAPP & BASIS DATA */}
      <View style={styles.noticeBanner}>
        <AppIcon name="alert" size={15} color={COLORS.warningText} />
        <View style={{ flex: 1 }}>
          <Text style={styles.noticeBannerTitle}>
            Penyimpanan Basis Data Supabase & Integrasi WhatsApp
          </Text>
          <Text style={styles.noticeBannerText}>
            Seluruh data kampanye tersimpan aman di database Supabase organisasi Anda. Pengiriman siaran pesan massal yang sesungguhnya ke nomor WhatsApp pelanggan memerlukan aktivasi dan penautan resmi gateway WhatsApp Business API.
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
                        <Text style={styles.targetPillText}>Tersimpan di Supabase</Text>
                      </View>
                      <Text style={styles.targetCountSub}>WhatsApp Business API</Text>
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
                    <View style={[styles.tdCell, { flex: 2, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }]}>
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
                    <CampaignStatusBadge status={camp.status} />
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
                      <Text style={styles.targetPillText}>Supabase DB</Text>
                    </View>
                  </View>

                  {/* Actions Row */}
                  <View style={styles.mobileActionsRow}>
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

          <View style={styles.modalDialog}>
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

            {/* Form Fields */}
            <ScrollView style={styles.modalFormBody} showsVerticalScrollIndicator={false}>
              {/* Field: Nama Kampanye */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  Nama Kampanye <Text style={styles.requiredStar}>*</Text>
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

              {/* Field: Isi Pesan WhatsApp */}
              <View style={styles.formGroup}>
                <View style={styles.labelWithCounterRow}>
                  <Text style={styles.formLabel}>
                    Isi Pesan Siaran WhatsApp <Text style={styles.requiredStar}>*</Text>
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

              {/* Field: Opsi Pengiriman */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Opsi Pengiriman & Penyimpanan</Text>
                <View style={styles.deliveryModeRow}>
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
                      Simpan sebagai Draf (Draft)
                    </Text>
                    <Text style={styles.modeOptionDesc}>Simpan ke database Supabase tanpa jadwal pengiriman</Text>
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
                      Jadwalkan Siaran (Scheduled)
                    </Text>
                    <Text style={styles.modeOptionDesc}>Atur tanggal dan jam siaran yang diharapkan</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sub-fields jika Dijadwalkan */}
              {formDeliveryMode === 'scheduled' && (
                <View style={styles.scheduledInputsRow}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.formLabel}>
                      Tanggal Pengiriman <Text style={styles.requiredStar}>*</Text>
                    </Text>
                    <TextInput
                      style={styles.inputField}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={COLORS.textMuted}
                      value={formScheduleDate}
                      onChangeText={setFormScheduleDate}
                    />
                  </View>

                  <View style={{ width: 120, gap: 4 }}>
                    <Text style={styles.formLabel}>
                      Jam (WIB) <Text style={styles.requiredStar}>*</Text>
                    </Text>
                    <TextInput
                      style={styles.inputField}
                      placeholder="09:00"
                      placeholderTextColor={COLORS.textMuted}
                      value={formScheduleTime}
                      onChangeText={setFormScheduleTime}
                    />
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Modal Actions */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setIsFormModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.btnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnSubmit, isSubmitting && { opacity: 0.7 }]}
                onPress={handleSaveCampaign}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnSubmitText}>
                    {activeCampaign ? 'Perbarui di Supabase' : 'Simpan ke Supabase'}
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
                    <Text style={styles.detailMetaValue}>
                      {activeCampaign.channel}
                    </Text>
                  </View>
                </View>

                {/* Info Disclaimer Pengiriman */}
                <View style={styles.warningAlertBox}>
                  <Text style={styles.warningAlertText}>
                    ℹ️ Pesan kampanye ini tersimpan di database Supabase. Pengiriman pesan siaran langsung ke nomor WhatsApp penerima memerlukan gateway WhatsApp Business Platform yang tertaut aktif.
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
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => handleOpenEditForm(activeCampaign)}
                  >
                    <AppIcon name="edit" size={13} color={COLORS.textDark} />
                    <Text style={styles.btnSecondaryText}>Edit Kampanye</Text>
                  </TouchableOpacity>

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
});
