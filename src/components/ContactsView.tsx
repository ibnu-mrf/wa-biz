import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS, AppIcon } from '../theme';

// ==========================================
// TIPE DATA KONTAK & FILTER
// ==========================================
export type ContactLabel =
  | 'Calon Santri'
  | 'Orang Tua'
  | 'Santri Aktif'
  | 'Alumni'
  | 'Umum';

export type FollowUpStatus =
  | 'Belum Dihubungi'
  | 'Sudah Dihubungi'
  | 'Perlu Follow-up';

export interface Contact {
  id: string;
  organizationId?: string;
  name: string;
  phone: string;
  email?: string | null;
  labels?: string[];
  label: ContactLabel;
  followUpStatus: FollowUpStatus;
  notes?: string;
  createdAt: string;
  isDemo?: boolean;
}

export const CONTACT_LABELS: ContactLabel[] = [
  'Calon Santri',
  'Orang Tua',
  'Santri Aktif',
  'Alumni',
  'Umum',
];

export const FOLLOW_UP_STATUSES: FollowUpStatus[] = [
  'Belum Dihubungi',
  'Sudah Dihubungi',
  'Perlu Follow-up',
];

// ==========================================
// NORMALISASI NOMOR TELEPON UNTUK CEK DUPLIKAT
// ==========================================
export function normalizePhoneNumber(rawPhone: string): string {
  // Buang semua karakter selain digit
  let cleaned = rawPhone.replace(/\D/g, '');
  // Konversi format lokal 08xxx menjadi 628xxx
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.slice(2);
  }
  return cleaned;
}

// ==========================================
// DATA DEMO AWAL KONTAK (REALISTIS & JUJUR)
// ==========================================
export const INITIAL_CONTACTS: Contact[] = [
  {
    id: 'cnt_1',
    name: 'Muhammad Rizky Pratama',
    phone: '+62 812-8899-7711',
    label: 'Calon Santri',
    followUpStatus: 'Perlu Follow-up',
    notes:
      'Tertarik dengan program tahfidz intensif. Sudah meminta brosur kurikulum & rincian biaya pendaftaran tahun ajaran baru.',
    createdAt: '16 Okt 2026',
    isDemo: true,
  },
  {
    id: 'cnt_2',
    name: 'Haji Suhendra (Wali)',
    phone: '+62 813-2233-4455',
    label: 'Orang Tua',
    followUpStatus: 'Sudah Dihubungi',
    notes:
      'Wali dari santri kelas 2. Mengonfirmasi kedatangan pada agenda pertemuan wali santri akhir bulan.',
    createdAt: '15 Okt 2026',
    isDemo: true,
  },
  {
    id: 'cnt_3',
    name: 'Fathur Rahman Al-Ghifari',
    phone: '+62 857-9911-2233',
    label: 'Santri Aktif',
    followUpStatus: 'Sudah Dihubungi',
    notes:
      'Ketua delegasi lomba pidato bahasa Arab. Izin dispensasi kegiatan ekstrakurikuler pesantren.',
    createdAt: '12 Okt 2026',
    isDemo: true,
  },
  {
    id: 'cnt_4',
    name: 'Ustadz Danang Wicaksono, Lc.',
    phone: '+62 878-3344-5566',
    label: 'Alumni',
    followUpStatus: 'Belum Dihubungi',
    notes:
      'Alumni angkatan 2020 (Universitas Al-Azhar Kairo). Rencana diundang untuk sesi sharing motivasi santri.',
    createdAt: '10 Okt 2026',
    isDemo: true,
  },
  {
    id: 'cnt_5',
    name: 'Ibu Nurul Hidayati',
    phone: '+62 896-5566-7788',
    label: 'Umum',
    followUpStatus: 'Belum Dihubungi',
    notes:
      'Menanyakan kemitraan katering dan pengadaan bahan konsumsi untuk asrama santri.',
    createdAt: '08 Okt 2026',
    isDemo: true,
  },
];

// Helper warna inisial avatar
function getAvatarBg(name: string): string {
  const colors = ['#059669', '#2563EB', '#7C3AED', '#D97706', '#DB2777', '#0891B2'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

// Inisial nama (2 huruf)
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ==========================================
// KOMPONEN BADGE LABEL & STATUS
// ==========================================
function LabelBadge({ label }: { label: ContactLabel }) {
  let bg = '#F1F5F9';
  let text = '#475569';
  let border = '#E2E8F0';

  switch (label) {
    case 'Calon Santri':
      bg = '#EFF6FF';
      text = '#1D4ED8';
      border = '#BFDBFE';
      break;
    case 'Orang Tua':
      bg = '#F5F3FF';
      text = '#6D28D9';
      border = '#DDD6FE';
      break;
    case 'Santri Aktif':
      bg = '#ECFDF5';
      text = '#047857';
      border = '#A7F3D0';
      break;
    case 'Alumni':
      bg = '#FFFBEB';
      text = '#B45309';
      border = '#FDE68A';
      break;
    case 'Umum':
      bg = '#F8FAFC';
      text = '#475569';
      border = '#E2E8F0';
      break;
  }

  return (
    <View style={[styles.badgeBase, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
    </View>
  );
}

function FollowUpBadge({ status }: { status: FollowUpStatus }) {
  let bg = '#F1F5F9';
  let text = '#475569';
  let border = '#E2E8F0';
  let dot = '#94A3B8';

  switch (status) {
    case 'Belum Dihubungi':
      bg = '#F8FAFC';
      text = '#64748B';
      border = '#E2E8F0';
      dot = '#94A3B8';
      break;
    case 'Sudah Dihubungi':
      bg = '#ECFDF5';
      text = '#047857';
      border = '#A7F3D0';
      dot = '#10B981';
      break;
    case 'Perlu Follow-up':
      bg = '#FFFBEB';
      text = '#B45309';
      border = '#FDE68A';
      dot = '#F59E0B';
      break;
  }

  return (
    <View style={[styles.badgeBase, { backgroundColor: bg, borderColor: border, gap: 5 }]}>
      <View style={[styles.statusDot, { backgroundColor: dot }]} />
      <Text style={[styles.badgeText, { color: text }]}>{status}</Text>
    </View>
  );
}

export interface ContactsViewProps {
  organizationId?: string;
  contacts?: Contact[];
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  isDesktop?: boolean;
  onNavigate?: (page: 'dashboard' | 'chat' | 'users' | 'campaign' | 'bot' | 'team' | 'settings') => void;
}

// ==========================================
// KOMPONEN UTAMA: CONTACTS VIEW
// ==========================================
export function ContactsView({
  organizationId,
  contacts: externalContacts,
  setContacts: externalSetContacts,
  isDesktop = true,
  onNavigate,
}: ContactsViewProps) {
  const [internalContacts, setInternalContacts] = useState<Contact[]>([]);
  const contacts = externalContacts ?? internalContacts;
  const setContacts = externalSetContacts ?? setInternalContacts;

  // Supabase Organization State (Single Source of Truth dari App.tsx)
  const effectiveOrgId = organizationId;

  const [isLoading, setIsLoading] = useState<boolean>(Boolean(organizationId));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelFilter, setSelectedLabelFilter] = useState<string>('Semua');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('Semua');

  // Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  // Form Fields State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formLabel, setFormLabel] = useState<ContactLabel>('Calon Santri');
  const [formStatus, setFormStatus] = useState<FollowUpStatus>('Belum Dihubungi');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Salin Nomor Feedback State
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // Helper terjemahan error Supabase ke Bahasa Indonesia
  const translateContactError = (errMsg: string): string => {
    const lower = errMsg.toLowerCase();
    if (lower.includes('duplicate') || lower.includes('unique') || lower.includes('23505')) {
      return 'Nomor kontak ini sudah terdaftar dalam organisasi Anda.';
    }
    if (lower.includes('permission denied') || lower.includes('policy') || lower.includes('42501')) {
      return 'Akses ditolak oleh kebijakan keamanan (RLS). Pastikan Anda adalah anggota organisasi ini.';
    }
    if (lower.includes('foreign key') || lower.includes('organization')) {
      return 'Organisasi tidak valid atau tidak ditemukan.';
    }
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection')) {
      return 'Gagal terhubung ke Supabase. Periksa koneksi internet Anda.';
    }
    return errMsg || 'Terjadi kendala pada server. Silakan coba lagi.';
  };

  // Muat Kontak dari Tabel public.contacts di Supabase (Manual & Refetch)
  const fetchContacts = useCallback(
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
          .from('contacts')
          .select('id, organization_id, name, phone, email, labels, notes, created_at, updated_at')
          .eq('organization_id', targetOrgId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching contacts:', error.message);
          setFetchError(translateContactError(error.message));
        } else if (data) {
          const mapped: Contact[] = data.map((row) => {
            const labelsArr: string[] = Array.isArray(row.labels) ? row.labels : [];
            const matchedLabel =
              (labelsArr.find((l) => CONTACT_LABELS.includes(l as ContactLabel)) as ContactLabel) ||
              'Umum';
            const matchedStatus =
              (labelsArr.find((l) => FOLLOW_UP_STATUSES.includes(l as FollowUpStatus)) as FollowUpStatus) ||
              'Belum Dihubungi';

            const dateStr = row.created_at
              ? new Date(row.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : '';

            return {
              id: row.id,
              organizationId: row.organization_id,
              name: row.name,
              phone: row.phone,
              email: row.email,
              labels: labelsArr,
              label: matchedLabel,
              followUpStatus: matchedStatus,
              notes: row.notes ?? '',
              createdAt: dateStr,
              isDemo: false,
            };
          });
          setContacts(mapped);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        setFetchError(translateContactError(msg));
      } finally {
        setIsLoading(false);
      }
    },
    [effectiveOrgId, setContacts]
  );

  // Inisialisasi data kontak saat komponen dimuat atau ID organisasi berubah
  useEffect(() => {
    let ignore = false;
    if (!effectiveOrgId) return;

    const loadData = async () => {
      try {
        const { data, error } = await supabase
          .from('contacts')
          .select('id, organization_id, name, phone, email, labels, notes, created_at, updated_at')
          .eq('organization_id', effectiveOrgId)
          .order('created_at', { ascending: false });

        if (ignore) return;
        setIsLoading(false);
        if (error) {
          console.error('Error fetching contacts:', error.message);
          setFetchError(translateContactError(error.message));
        } else if (data) {
          const mapped: Contact[] = data.map((row) => {
            const labelsArr: string[] = Array.isArray(row.labels) ? row.labels : [];
            const matchedLabel =
              (labelsArr.find((l) => CONTACT_LABELS.includes(l as ContactLabel)) as ContactLabel) ||
              'Umum';
            const matchedStatus =
              (labelsArr.find((l) => FOLLOW_UP_STATUSES.includes(l as FollowUpStatus)) as FollowUpStatus) ||
              'Belum Dihubungi';

            const dateStr = row.created_at
              ? new Date(row.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : '';

            return {
              id: row.id,
              organizationId: row.organization_id,
              name: row.name,
              phone: row.phone,
              email: row.email,
              labels: labelsArr,
              label: matchedLabel,
              followUpStatus: matchedStatus,
              notes: row.notes ?? '',
              createdAt: dateStr,
              isDemo: false,
            };
          });
          setContacts(mapped);
        }
      } catch (err: unknown) {
        if (ignore) return;
        setIsLoading(false);
        const msg = err instanceof Error ? err.message : '';
        setFetchError(translateContactError(msg));
      }
    };

    loadData();

    return () => {
      ignore = true;
    };
  }, [effectiveOrgId, setContacts]);

  // ==========================================
  // FILTERING KONTAK
  // ==========================================
  const filteredContacts = contacts.filter((contact) => {
    // Filter label
    if (selectedLabelFilter !== 'Semua' && contact.label !== selectedLabelFilter) {
      return false;
    }
    // Filter status
    if (selectedStatusFilter !== 'Semua' && contact.followUpStatus !== selectedStatusFilter) {
      return false;
    }
    // Filter search
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchName = contact.name.toLowerCase().includes(q);
      const matchPhone = contact.phone.toLowerCase().includes(q);
      const matchEmail = (contact.email ?? '').toLowerCase().includes(q);
      const matchLabel = contact.label.toLowerCase().includes(q);
      const matchNotes = (contact.notes ?? '').toLowerCase().includes(q);
      return matchName || matchPhone || matchEmail || matchLabel || matchNotes;
    }
    return true;
  });

  // Reset Filter
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedLabelFilter('Semua');
    setSelectedStatusFilter('Semua');
  };

  // ==========================================
  // HANDLER FORM TAMBAH & EDIT
  // ==========================================
  const handleOpenAddForm = () => {
    setActiveContact(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormLabel('Calon Santri');
    setFormStatus('Belum Dihubungi');
    setFormNotes('');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditForm = (contact: Contact) => {
    setActiveContact(contact);
    setFormName(contact.name);
    setFormPhone(contact.phone);
    setFormEmail(contact.email ?? '');
    setFormLabel(contact.label);
    setFormStatus(contact.followUpStatus);
    setFormNotes(contact.notes ?? '');
    setFormError(null);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  const handleSaveContact = async () => {
    // Validasi Nama
    const cleanName = formName.trim();
    if (cleanName.length === 0) {
      setFormError('Nama lengkap kontak wajib diisi.');
      return;
    }

    // Validasi Nomor WhatsApp
    const normalizedNew = normalizePhoneNumber(formPhone);
    if (normalizedNew.length < 8) {
      setFormError('Nomor WhatsApp wajib diisi minimal 8 digit angka yang valid.');
      return;
    }

    // Validasi Alamat Email Opsional
    const cleanEmail = formEmail.trim();
    if (cleanEmail && (!cleanEmail.includes('@') || !cleanEmail.includes('.'))) {
      setFormError('Format alamat email tidak valid.');
      return;
    }

    // Validasi Duplikat Nomor WhatsApp
    const isDuplicate = contacts.some((c) => {
      // Jika sedang edit, abaikan nomor kontak itu sendiri
      if (activeContact && c.id === activeContact.id) {
        return false;
      }
      return normalizePhoneNumber(c.phone) === normalizedNew;
    });

    if (isDuplicate) {
      const existing = contacts.find(
        (c) => normalizePhoneNumber(c.phone) === normalizedNew
      );
      setFormError(
        `Nomor WhatsApp ini sudah terdaftar atas nama "${existing?.name}". Nomor tidak boleh duplikat.`
      );
      return;
    }

    if (!effectiveOrgId) {
      setFormError('ID organisasi tidak ditemukan. Silakan muat ulang halaman.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const labelsToSave = [formLabel, formStatus];
      const cleanNotes = formNotes.trim() || null;
      const emailValue = cleanEmail || null;

      if (activeContact && !activeContact.isDemo) {
        // UPDATE KONTAK DI SUPABASE
        const { error } = await supabase
          .from('contacts')
          .update({
            name: cleanName,
            phone: formPhone.trim(),
            email: emailValue,
            labels: labelsToSave,
            notes: cleanNotes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', activeContact.id)
          .eq('organization_id', effectiveOrgId);

        if (error) {
          setFormError(translateContactError(error.message));
          return;
        }
      } else {
        // TAMBAH KONTAK BARU DI SUPABASE
        const { error } = await supabase
          .from('contacts')
          .insert({
            organization_id: effectiveOrgId,
            name: cleanName,
            phone: formPhone.trim(),
            email: emailValue,
            labels: labelsToSave,
            notes: cleanNotes,
          });

        if (error) {
          setFormError(translateContactError(error.message));
          return;
        }
      }

      await fetchContacts(effectiveOrgId);
      setIsFormModalOpen(false);
      setActiveContact(null);
      setFormError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setFormError(translateContactError(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // HANDLER HAPUS KONTAK
  // ==========================================
  const handleOpenDeleteDialog = (contact: Contact) => {
    setActiveContact(contact);
    setDeleteError(null);
    setIsDetailModalOpen(false);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!activeContact) return;
    if (!effectiveOrgId) {
      setDeleteError('ID organisasi tidak ditemukan. Silakan muat ulang halaman.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      if (!activeContact.isDemo) {
        const { error } = await supabase
          .from('contacts')
          .delete()
          .eq('id', activeContact.id)
          .eq('organization_id', effectiveOrgId);

        if (error) {
          setDeleteError(translateContactError(error.message));
          return;
        }
      } else {
        setContacts((prev) => prev.filter((c) => c.id !== activeContact.id));
      }

      await fetchContacts(effectiveOrgId);
      setIsDeleteModalOpen(false);
      setActiveContact(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setDeleteError(translateContactError(msg));
    } finally {
      setIsDeleting(false);
    }
  };

  // ==========================================
  // SALIN NOMOR WHATSAPP
  // ==========================================
  const handleCopyPhone = (phone: string, id: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(phone);
    }
    setCopiedPhoneId(id);
    setTimeout(() => {
      setCopiedPhoneId((curr) => (curr === id ? null : curr));
    }, 2000);
  };

  // ==========================================
  // MULAI PERCAKAPAN
  // ==========================================
  const handleStartChat = () => {
    setIsDetailModalOpen(false);
    if (onNavigate) {
      onNavigate('chat');
    }
  };

  const activeError =
    fetchError || (!effectiveOrgId ? 'Organisasi belum dipilih atau tidak aktif. Silakan pilih workspace Anda.' : null);

  return (
    <View style={styles.container}>
      {/* 1. HEADER SECTION */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.titleWithBadge}>
            <Text style={styles.pageTitle}>Kontak</Text>
            <View style={styles.counterBadge}>
              <Text style={styles.counterBadgeText}>
                {contacts.length} Kontak Terdaftar
              </Text>
            </View>
          </View>
          <Text style={styles.pageSubtitle}>
            Kelola kontak dan calon pelanggan dalam satu tempat.
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.btnRefresh}
            onPress={() => fetchContacts(effectiveOrgId || undefined)}
            disabled={isLoading}
            activeOpacity={0.7}
            accessibilityLabel="Segarkan Data Kontak"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.emerald} />
            ) : (
              <AppIcon name="refresh" size={16} color={COLORS.textDark} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnAddContact}
            onPress={handleOpenAddForm}
            activeOpacity={0.8}
          >
            <AppIcon name="plus" size={15} color="#FFFFFF" />
            <Text style={styles.btnAddContactText}>+ Tambah Kontak</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* BANNER STATUS SINKRONISASI / ERROR STATE */}
      {activeError ? (
        <View style={styles.errorStateBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <AppIcon name="alert" size={14} color="#DC2626" />
            <Text style={styles.errorStateBannerText}>{activeError}</Text>
          </View>
          <TouchableOpacity
            style={styles.btnRetry}
            onPress={() => fetchContacts(effectiveOrgId || undefined)}
            activeOpacity={0.8}
          >
            <Text style={styles.btnRetryText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.syncStateBanner}>
          <View style={styles.syncIndicatorDot} />
          <Text style={styles.syncStateBannerText}>
            Tersinkronisasi dengan Database Supabase • Workspace Terverifikasi
          </Text>
        </View>
      )}

      {/* 2. PENCARIAN & FILTER BAR */}
      <View style={styles.filterSection}>
        {/* Search Box */}
        <View style={styles.searchBarBox}>
          <AppIcon name="search" size={15} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchTextInput}
            placeholder="Cari nama kontak, nomor WhatsApp, atau label..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppIcon name="close" size={12} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Baris: Label & Status */}
        <View style={styles.filterRow}>
          {/* Filter Label Dropdown Chips */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Label:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  selectedLabelFilter === 'Semua' && styles.filterChipActive,
                ]}
                onPress={() => setSelectedLabelFilter('Semua')}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedLabelFilter === 'Semua' && styles.filterChipTextActive,
                  ]}
                >
                  Semua Label
                </Text>
              </TouchableOpacity>
              {CONTACT_LABELS.map((lbl) => (
                <TouchableOpacity
                  key={lbl}
                  style={[
                    styles.filterChip,
                    selectedLabelFilter === lbl && styles.filterChipActive,
                  ]}
                  onPress={() => setSelectedLabelFilter(lbl)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedLabelFilter === lbl && styles.filterChipTextActive,
                    ]}
                  >
                    {lbl}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Filter Status Follow-Up Chips */}
          <View style={styles.filterGroup}>
            <Text style={styles.filterGroupLabel}>Status:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  selectedStatusFilter === 'Semua' && styles.filterChipActive,
                ]}
                onPress={() => setSelectedStatusFilter('Semua')}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedStatusFilter === 'Semua' && styles.filterChipTextActive,
                  ]}
                >
                  Semua Status
                </Text>
              </TouchableOpacity>
              {FOLLOW_UP_STATUSES.map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[
                    styles.filterChip,
                    selectedStatusFilter === st && styles.filterChipActive,
                  ]}
                  onPress={() => setSelectedStatusFilter(st)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedStatusFilter === st && styles.filterChipTextActive,
                    ]}
                  >
                    {st}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Tombol Reset Filter */}
          {(searchQuery !== '' || selectedLabelFilter !== 'Semua' || selectedStatusFilter !== 'Semua') && (
            <TouchableOpacity
              style={styles.btnResetFilter}
              onPress={handleResetFilters}
              activeOpacity={0.7}
            >
              <AppIcon name="refresh" size={13} color={COLORS.textDark} />
              <Text style={styles.btnResetFilterText}>Reset Filter</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 3. DAFTAR KONTAK: TABEL DESKTOP VS KARTU MOBILE */}
      <View style={styles.tableCard}>
        {isLoading && contacts.length === 0 ? (
          /* LOADING STATE */
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.emerald} />
            <Text style={styles.loadingText}>Memuat kontak dari Supabase...</Text>
          </View>
        ) : filteredContacts.length === 0 ? (
          /* EMPTY STATE */
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <AppIcon name="users" size={26} color={COLORS.forestDark} />
            </View>
            <Text style={styles.emptyTitle}>
              {contacts.length === 0 ? 'Belum Ada Kontak' : 'Tidak Ada Kontak Ditemukan'}
            </Text>
            <Text style={styles.emptyDesc}>
              {contacts.length === 0
                ? 'Belum ada kontak tersimpan dalam organisasi ini. Mulai tambahkan kontak baru ke dalam daftar.'
                : 'Tidak ada kontak yang cocok dengan filter atau kata kunci pencarian Anda.'}
            </Text>
            <View style={styles.emptyActions}>
              {contacts.length === 0 ? (
                <TouchableOpacity
                  style={styles.btnAddContact}
                  onPress={handleOpenAddForm}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnAddContactText}>+ Tambah Kontak Pertama</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.btnSecondarySmall}
                  onPress={handleResetFilters}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnSecondarySmallText}>Reset Filter & Pencarian</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : isDesktop ? (
          /* TABEL DESKTOP */
          <View style={styles.tableWrapper}>
            {/* Table Header Row */}
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thCell, { flex: 2.2 }]}>Nama Kontak</Text>
              <Text style={[styles.thCell, { flex: 1.8 }]}>Nomor WhatsApp</Text>
              <Text style={[styles.thCell, { flex: 1.4 }]}>Label</Text>
              <Text style={[styles.thCell, { flex: 1.6 }]}>Status Tindak Lanjut</Text>
              <Text style={[styles.thCell, { flex: 1.2 }]}>Dibuat</Text>
              <Text style={[styles.thCell, { flex: 1.5, textAlign: 'right' }]}>Aksi</Text>
            </View>

            {/* Table Body Rows */}
            <ScrollView showsVerticalScrollIndicator={false}>
              {filteredContacts.map((contact) => (
                <View key={contact.id} style={styles.tableRow}>
                  {/* Nama & Avatar */}
                  <View style={[styles.tdCell, { flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                    <View style={[styles.rowAvatar, { backgroundColor: getAvatarBg(contact.name) }]}>
                      <Text style={styles.rowAvatarText}>{getInitials(contact.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contactNameText} numberOfLines={1}>
                        {contact.name}
                      </Text>
                      {contact.isDemo && (
                        <View style={styles.demoPillSmall}>
                          <Text style={styles.demoPillSmallText}>DEMO</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Nomor WhatsApp + Salin + Email */}
                  <View style={[styles.tdCell, { flex: 1.8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.phoneText}>{contact.phone}</Text>
                      <TouchableOpacity
                        style={styles.copyBtn}
                        onPress={() => handleCopyPhone(contact.phone, contact.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Salin Nomor WhatsApp"
                      >
                        <AppIcon
                          name={copiedPhoneId === contact.id ? 'check' : 'copy'}
                          size={13}
                          color={copiedPhoneId === contact.id ? COLORS.emerald : COLORS.textSecondary}
                        />
                      </TouchableOpacity>
                      {copiedPhoneId === contact.id && (
                        <Text style={styles.copiedFeedbackText}>Disalin!</Text>
                      )}
                    </View>
                    {contact.email ? (
                      <Text style={styles.emailSmallText} numberOfLines={1}>
                        {contact.email}
                      </Text>
                    ) : null}
                  </View>

                  {/* Label */}
                  <View style={[styles.tdCell, { flex: 1.4 }]}>
                    <LabelBadge label={contact.label} />
                  </View>

                  {/* Status Tindak Lanjut */}
                  <View style={[styles.tdCell, { flex: 1.6 }]}>
                    <FollowUpBadge status={contact.followUpStatus} />
                  </View>

                  {/* Tanggal Dibuat */}
                  <View style={[styles.tdCell, { flex: 1.2 }]}>
                    <Text style={styles.dateText}>{contact.createdAt}</Text>
                  </View>

                  {/* Tombol Aksi */}
                  <View style={[styles.tdCell, { flex: 1.5, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }]}>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => {
                        setActiveContact(contact);
                        setIsDetailModalOpen(true);
                      }}
                      accessibilityLabel="Buka Detail Kontak"
                    >
                      <AppIcon name="user" size={14} color={COLORS.forestDark} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => handleOpenEditForm(contact)}
                      accessibilityLabel="Edit Kontak"
                    >
                      <AppIcon name="edit" size={13} color={COLORS.forestDark} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionIconBtn, styles.actionDeleteBtn]}
                      onPress={() => handleOpenDeleteDialog(contact)}
                      accessibilityLabel="Hapus Kontak"
                    >
                      <AppIcon name="trash" size={13} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : (
          /* KARTU MOBILE */
          <ScrollView style={styles.mobileCardsContainer} showsVerticalScrollIndicator={false}>
            {filteredContacts.map((contact) => (
              <View key={contact.id} style={styles.mobileContactCard}>
                {/* Header Kartu */}
                <View style={styles.mobileCardHeader}>
                  <View style={styles.mobileAvatarGroup}>
                    <View style={[styles.rowAvatar, { backgroundColor: getAvatarBg(contact.name) }]}>
                      <Text style={styles.rowAvatarText}>{getInitials(contact.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.contactNameText} numberOfLines={1}>
                          {contact.name}
                        </Text>
                        {contact.isDemo && (
                          <View style={styles.demoPillSmall}>
                            <Text style={styles.demoPillSmallText}>DEMO</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.dateText}>Dibuat: {contact.createdAt}</Text>
                    </View>
                  </View>

                  <View style={styles.mobileActionButtons}>
                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => handleOpenEditForm(contact)}
                    >
                      <AppIcon name="edit" size={13} color={COLORS.forestDark} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionIconBtn, styles.actionDeleteBtn]}
                      onPress={() => handleOpenDeleteDialog(contact)}
                    >
                      <AppIcon name="trash" size={13} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Nomor Telepon & Email & Salin */}
                <View style={styles.mobilePhoneRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.phoneText}>{contact.phone}</Text>
                    {contact.email ? (
                      <Text style={styles.emailSmallText} numberOfLines={1}>
                        {contact.email}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.copyBtn}
                    onPress={() => handleCopyPhone(contact.phone, contact.id)}
                  >
                    <AppIcon
                      name={copiedPhoneId === contact.id ? 'check' : 'copy'}
                      size={13}
                      color={copiedPhoneId === contact.id ? COLORS.emerald : COLORS.textSecondary}
                    />
                    <Text style={styles.copyBtnLabel}>
                      {copiedPhoneId === contact.id ? 'Disalin!' : 'Salin'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Badge Label & Status */}
                <View style={styles.mobileBadgesRow}>
                  <LabelBadge label={contact.label} />
                  <FollowUpBadge status={contact.followUpStatus} />
                </View>

                {/* Footer: Tombol Detail & Catatan */}
                <TouchableOpacity
                  style={styles.btnViewDetailMobile}
                  onPress={() => {
                    setActiveContact(contact);
                    setIsDetailModalOpen(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnViewDetailMobileText}>Lihat Catatan & Detail</Text>
                  <AppIcon name="chevron-right" size={12} color={COLORS.forestDark} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* ========================================== */}
      {/* 4. MODAL FORM: TAMBAH / EDIT KONTAK        */}
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
                  {activeContact ? 'Edit Data Kontak' : 'Tambah Kontak Baru'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {activeContact
                    ? 'Perbarui informasi kontak dan catatan tindak lanjut pelanggan'
                    : 'Lengkapi formulir untuk menambahkan calon pelanggan ke daftar'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsFormModalOpen(false)}
              >
                <AppIcon name="close" size={16} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            {/* Error Message Box */}
            {formError && (
              <View style={styles.errorBox}>
                <AppIcon name="alert" size={14} color="#DC2626" />
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            )}

            {/* Form Fields ScrollView */}
            <ScrollView style={styles.modalFormBody} showsVerticalScrollIndicator={false}>
              {/* Field: Nama Lengkap */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  Nama Lengkap <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TextInput
                  style={styles.inputField}
                  placeholder="Contoh: Budi Santoso"
                  placeholderTextColor={COLORS.textMuted}
                  value={formName}
                  onChangeText={(val) => {
                    setFormName(val);
                    if (formError) setFormError(null);
                  }}
                />
              </View>

              {/* Field: Nomor WhatsApp */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>
                  Nomor WhatsApp <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TextInput
                  style={styles.inputField}
                  placeholder="Contoh: +62 812-3456-7890 atau 081234567890"
                  placeholderTextColor={COLORS.textMuted}
                  value={formPhone}
                  onChangeText={(val) => {
                    setFormPhone(val);
                    if (formError) setFormError(null);
                  }}
                  keyboardType="phone-pad"
                />
                <Text style={styles.fieldHelper}>
                  Format nomor akan dinormalisasi otomatis untuk mencegah pendaftaran duplikat.
                </Text>
              </View>

              {/* Field: Alamat Email (Opsional) */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Alamat Email (Opsional)</Text>
                <TextInput
                  style={styles.inputField}
                  placeholder="Contoh: nama@domain.com"
                  placeholderTextColor={COLORS.textMuted}
                  value={formEmail}
                  onChangeText={(val) => {
                    setFormEmail(val);
                    if (formError) setFormError(null);
                  }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Field: Pilihan Label */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Label Kategori</Text>
                <View style={styles.chipsRow}>
                  {CONTACT_LABELS.map((lbl) => {
                    const isSelected = formLabel === lbl;
                    return (
                      <TouchableOpacity
                        key={lbl}
                        style={[styles.radioChip, isSelected && styles.radioChipSelected]}
                        onPress={() => setFormLabel(lbl)}
                      >
                        <Text
                          style={[
                            styles.radioChipText,
                            isSelected && styles.radioChipTextSelected,
                          ]}
                        >
                          {lbl}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Field: Status Tindak Lanjut */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Status Tindak Lanjut</Text>
                <View style={styles.chipsRow}>
                  {FOLLOW_UP_STATUSES.map((st) => {
                    const isSelected = formStatus === st;
                    return (
                      <TouchableOpacity
                        key={st}
                        style={[styles.radioChip, isSelected && styles.radioChipSelected]}
                        onPress={() => setFormStatus(st)}
                      >
                        <Text
                          style={[
                            styles.radioChipText,
                            isSelected && styles.radioChipTextSelected,
                          ]}
                        >
                          {st}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Field: Catatan Internal */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Catatan Internal & Kebutuhan</Text>
                <TextInput
                  style={[styles.inputField, styles.textareaField]}
                  placeholder="Tuliskan catatan tindak lanjut, referensi wali, atau kebutuhan produk pelanggan..."
                  placeholderTextColor={COLORS.textMuted}
                  value={formNotes}
                  onChangeText={setFormNotes}
                  multiline
                  numberOfLines={4}
                />
              </View>
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
                style={[styles.btnSubmit, isSubmitting && styles.btnDisabled]}
                onPress={handleSaveContact}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.btnSubmitText}>Menyimpan...</Text>
                  </View>
                ) : (
                  <Text style={styles.btnSubmitText}>
                    {activeContact ? 'Simpan Pembaruan' : 'Simpan Kontak'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 5. MODAL DETAIL KONTAK                     */}
      {/* ========================================== */}
      <Modal
        visible={isDetailModalOpen && activeContact !== null}
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

          {activeContact && (
            <View style={styles.modalDialog}>
              {/* Header Detail */}
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={[
                      styles.detailAvatarLarge,
                      { backgroundColor: getAvatarBg(activeContact.name) },
                    ]}
                  >
                    <Text style={styles.detailAvatarLargeText}>
                      {getInitials(activeContact.name)}
                    </Text>
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.modalTitle}>{activeContact.name}</Text>
                      {activeContact.isDemo && (
                        <View style={styles.demoPillSmall}>
                          <Text style={styles.demoPillSmallText}>DEMO</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.modalSubtitle}>Terdaftar sejak {activeContact.createdAt}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setIsDetailModalOpen(false)}
                >
                  <AppIcon name="close" size={16} color={COLORS.textDark} />
                </TouchableOpacity>
              </View>

              {/* Body Detail */}
              <ScrollView style={styles.modalFormBody} showsVerticalScrollIndicator={false}>
                {/* Info Baris: Nomor WhatsApp */}
                <View style={styles.detailInfoCard}>
                  <Text style={styles.detailInfoLabel}>Nomor WhatsApp</Text>
                  <View style={styles.detailPhoneRow}>
                    <Text style={styles.detailPhoneValue}>{activeContact.phone}</Text>
                    <TouchableOpacity
                      style={styles.btnCopyModal}
                      onPress={() => handleCopyPhone(activeContact.phone, activeContact.id)}
                    >
                      <AppIcon
                        name={copiedPhoneId === activeContact.id ? 'check' : 'copy'}
                        size={13}
                        color={copiedPhoneId === activeContact.id ? COLORS.emerald : COLORS.forestDark}
                      />
                      <Text style={styles.btnCopyModalText}>
                        {copiedPhoneId === activeContact.id ? 'Tersalin!' : 'Salin Nomor'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Info Baris: Alamat Email (Jika ada) */}
                {activeContact.email ? (
                  <View style={styles.detailInfoCard}>
                    <Text style={styles.detailInfoLabel}>Alamat Email</Text>
                    <Text style={styles.detailPhoneValue}>{activeContact.email}</Text>
                  </View>
                ) : null}

                {/* Status & Label Row */}
                <View style={styles.detailTwoCols}>
                  <View style={[styles.detailInfoCard, { flex: 1 }]}>
                    <Text style={styles.detailInfoLabel}>Label Kategori</Text>
                    <View style={{ marginTop: 4 }}>
                      <LabelBadge label={activeContact.label} />
                    </View>
                  </View>

                  <View style={[styles.detailInfoCard, { flex: 1 }]}>
                    <Text style={styles.detailInfoLabel}>Status Tindak Lanjut</Text>
                    <View style={{ marginTop: 4 }}>
                      <FollowUpBadge status={activeContact.followUpStatus} />
                    </View>
                  </View>
                </View>

                {/* Catatan Internal */}
                <View style={styles.detailInfoCard}>
                  <Text style={styles.detailInfoLabel}>Catatan Internal</Text>
                  <View style={styles.notesBox}>
                    <Text style={styles.notesText}>
                      {activeContact.notes && activeContact.notes.trim() !== ''
                        ? activeContact.notes
                        : 'Belum ada catatan khusus untuk kontak ini.'}
                    </Text>
                  </View>
                </View>
              </ScrollView>

              {/* Modal Actions */}
              <View style={styles.modalFooterBetween}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.btnActionEdit}
                    onPress={() => handleOpenEditForm(activeContact)}
                  >
                    <AppIcon name="edit" size={13} color={COLORS.textDark} />
                    <Text style={styles.btnActionEditText}>Edit Data</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btnActionEdit, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
                    onPress={() => handleOpenDeleteDialog(activeContact)}
                  >
                    <AppIcon name="trash" size={13} color="#DC2626" />
                    <Text style={[styles.btnActionEditText, { color: '#DC2626' }]}>Hapus</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={styles.btnStartChat}
                    onPress={handleStartChat}
                  >
                    <AppIcon name="chat" size={14} color="#FFFFFF" />
                    <Text style={styles.btnStartChatText}>Mulai Percakapan (Simulasi)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 6. MODAL KONFIRMASI HAPUS KONTAK           */}
      {/* ========================================== */}
      <Modal
        visible={isDeleteModalOpen && activeContact !== null}
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

          {activeContact && (
            <View style={[styles.modalDialog, { maxWidth: 420 }]}>
              <View style={styles.deleteConfirmHeader}>
                <View style={styles.deleteAlertIconCircle}>
                  <AppIcon name="trash" size={20} color="#DC2626" />
                </View>
                <Text style={styles.deleteDialogTitle}>Hapus Kontak Pelanggan?</Text>
                <Text style={styles.deleteDialogDesc}>
                  Apakah Anda yakin ingin menghapus kontak{' '}
                  <Text style={{ fontWeight: '700', color: COLORS.textDark }}>
                    &ldquo;{activeContact.name}&rdquo;
                  </Text>
                  ? Tindakan ini akan menghapus kontak dari database organisasi secara permanen.
                </Text>
              </View>

              {deleteError && (
                <View style={[styles.errorBox, { marginHorizontal: 20, marginBottom: 12 }]}>
                  <AppIcon name="alert" size={14} color="#DC2626" />
                  <Text style={styles.errorText}>{deleteError}</Text>
                </View>
              )}

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={() => setIsDeleteModalOpen(false)}
                  disabled={isDeleting}
                >
                  <Text style={styles.btnCancelText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnConfirmDelete, isDeleting && styles.btnDisabled]}
                  onPress={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.btnConfirmDeleteText}>Menghapus...</Text>
                    </View>
                  ) : (
                    <Text style={styles.btnConfirmDeleteText}>Ya, Hapus Kontak</Text>
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
// STYLING DETAIL B2B SAAS KONTAK
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnRefresh: {
    width: 36,
    height: 36,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAddContact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emerald,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 6,
  },
  btnAddContactText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  // Banner status sinkronisasi Supabase
  syncStateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF6F0',
    borderWidth: 1,
    borderColor: '#C1E6D3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  syncIndicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.emerald,
  },
  syncStateBannerText: {
    fontSize: 11,
    color: '#0E7A4E',
    fontWeight: '600',
    flex: 1,
  },
  errorStateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  errorStateBannerText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '500',
    flex: 1,
  },
  btnRetry: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  btnRetryText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '700',
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  emailSmallText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // ----------------------------------------
  // PENCARIAN & FILTER
  // ----------------------------------------
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 260,
  },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  filterChip: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipActive: {
    backgroundColor: COLORS.emeraldSubtle,
    borderColor: COLORS.emeraldBorder,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
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
    paddingVertical: 6,
    gap: 5,
  },
  btnResetFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
  },

  // ----------------------------------------
  // TABEL DESKTOP
  // ----------------------------------------
  tableCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    minHeight: 400,
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
    paddingVertical: 12,
  },
  tdCell: {
    justifyContent: 'center',
  },
  rowAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 11,
  },
  contactNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  demoPillSmall: {
    backgroundColor: 'rgba(23, 35, 31, 0.06)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  demoPillSmallText: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  phoneText: {
    fontSize: 12,
    color: COLORS.textDark,
    fontWeight: '500',
  },
  copyBtn: {
    padding: 3,
  },
  copiedFeedbackText: {
    fontSize: 10,
    color: COLORS.emerald,
    fontWeight: '700',
  },
  dateText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  actionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDeleteBtn: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },

  // ----------------------------------------
  // KARTU MOBILE
  // ----------------------------------------
  mobileCardsContainer: {
    padding: 12,
  },
  mobileContactCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  mobileCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  mobileAvatarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  mobileActionButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  mobilePhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  copyBtnLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 3,
    fontWeight: '600',
  },
  mobileBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  btnViewDetailMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    marginTop: 2,
  },
  btnViewDetailMobileText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.forestDark,
  },

  // ----------------------------------------
  // BADGE STYLES
  // ----------------------------------------
  badgeBase: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // ----------------------------------------
  // EMPTY STATE
  // ----------------------------------------
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 360,
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 8,
  },
  btnSecondarySmall: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  btnSecondarySmallText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },

  // ----------------------------------------
  // MODAL FORM & DETAIL
  // ----------------------------------------
  modalOverlay: {
    flex: 1,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalDialog: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    padding: 6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  errorText: {
    fontSize: 11,
    color: '#B91C1C',
    fontWeight: '600',
    flex: 1,
  },
  modalFormBody: {
    padding: 18,
  },
  formGroup: {
    marginBottom: 14,
    gap: 6,
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
    borderColor: COLORS.borderStrong,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.textDark,
  },
  textareaField: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fieldHelper: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  radioChip: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  radioChipSelected: {
    backgroundColor: COLORS.emeraldSubtle,
    borderColor: COLORS.emerald,
  },
  radioChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  radioChipTextSelected: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },
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
  },
  btnSubmitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Modal Detail Styles
  detailAvatarLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailAvatarLargeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  detailInfoCard: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  detailInfoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  detailPhoneValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  btnCopyModal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  btnCopyModalText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.forestDark,
  },
  detailTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  notesBox: {
    marginTop: 4,
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notesText: {
    fontSize: 12,
    color: COLORS.textDark,
    lineHeight: 18,
  },
  btnActionEdit: {
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
  btnActionEditText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  btnStartChat: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emerald,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  btnStartChatText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Modal Konfirmasi Hapus
  deleteConfirmHeader: {
    padding: 20,
    alignItems: 'center',
    textAlign: 'center',
  },
  deleteAlertIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  deleteDialogTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  deleteDialogDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  btnConfirmDelete: {
    backgroundColor: '#DC2626',
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnConfirmDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
