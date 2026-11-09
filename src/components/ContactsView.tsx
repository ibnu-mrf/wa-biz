import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { COLORS, AppIcon, useTheme, ThemePalette } from '../theme';
import {
  notifyContactCreated,
  notifyContactUpdated,
  notifyContactDeleted,
} from '../lib/notifications';
import { formatErrorUserMessage } from '../lib/errorHandler';
import {
  getEffectiveContactLabels,
  parseContactLabels,
  buildContactLabelsArray,
  getLabelColors,
  isFollowUpStatus,
  FOLLOW_UP_STATUSES,
  FollowUpStatus,
} from '../lib/organizationTypes';

// ==========================================
// TIPE DATA KONTAK & FILTER
// ==========================================
// ContactLabel kini berupa string dinamis untuk mendukung kustomisasi per organisasi
export type ContactLabel = string;
export { FollowUpStatus, FOLLOW_UP_STATUSES };

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

export const CONTACT_LABELS: string[] = [
  'Calon Santri',
  'Orang Tua',
  'Santri Aktif',
  'Alumni',
  'Umum',
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
// KOMPONEN BADGE LABEL & STATUS DINAMIS
// ==========================================
function LabelBadge({ label }: { label: ContactLabel }) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const labelColors = getLabelColors(label, isDark);
  return (
    <View style={[styles.badgeBase, { backgroundColor: labelColors.bg, borderColor: labelColors.border }]}>
      <Text style={[styles.badgeText, { color: labelColors.text }]}>{label}</Text>
    </View>
  );
}

function FollowUpBadge({ status }: { status: FollowUpStatus }) {
  const { isDark, colors: themeColors } = useTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  let bg = '#F1F5F9';
  let text = '#475569';
  let border = '#E2E8F0';
  let dot = '#94A3B8';

  switch (status) {
    case 'Belum Dihubungi':
      bg = isDark ? 'rgba(148, 163, 184, 0.12)' : '#F8FAFC';
      text = isDark ? '#94A3B8' : '#64748B';
      border = isDark ? 'rgba(148, 163, 184, 0.25)' : '#E2E8F0';
      dot = '#94A3B8';
      break;
    case 'Sudah Dihubungi':
      bg = isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5';
      text = isDark ? '#6EE7B7' : '#047857';
      border = isDark ? 'rgba(16, 185, 129, 0.28)' : '#A7F3D0';
      dot = '#10B981';
      break;
    case 'Perlu Follow-up':
      bg = isDark ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB';
      text = isDark ? '#FCD34D' : '#B45309';
      border = isDark ? 'rgba(245, 158, 11, 0.28)' : '#FDE68A';
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
  currentUserId?: string;
  contacts?: Contact[];
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  isDesktop?: boolean;
  onNavigate?: (page: 'dashboard' | 'chat' | 'users' | 'campaign' | 'bot' | 'team' | 'settings') => void;
  contactLabels?: string[];
  institutionType?: string;
  userRole?: string | null;
  onLabelsUpdated?: (newLabels: string[]) => void;
}

// ==========================================
// KOMPONEN UTAMA: CONTACTS VIEW
// ==========================================
export function ContactsView({
  organizationId,
  currentUserId,
  contacts: externalContacts,
  setContacts: externalSetContacts,
  isDesktop = true,
  onNavigate,
  contactLabels,
  institutionType,
  userRole: propUserRole,
  onLabelsUpdated,
}: ContactsViewProps) {
  const [internalContacts, setInternalContacts] = useState<Contact[]>([]);
  const contacts = externalContacts ?? internalContacts;
  const setContacts = externalSetContacts ?? setInternalContacts;

  // Supabase Organization State (Single Source of Truth dari App.tsx)
  const effectiveOrgId = organizationId;

  // Resolusi Label Efektif per Organisasi
  const effectiveLabels = useMemo(() => {
    return getEffectiveContactLabels(contactLabels, institutionType);
  }, [contactLabels, institutionType]);

  // Hak Akses Role Pengguna
  const [fetchedRole, setFetchedRole] = useState<string | null>(null);
  useEffect(() => {
    if (propUserRole !== undefined) return;
    let ignore = false;
    const fetchRole = async () => {
      if (!effectiveOrgId || !currentUserId) return;
      try {
        const { data } = await supabase
          .from('organization_members')
          .select('role')
          .eq('organization_id', effectiveOrgId)
          .eq('user_id', currentUserId)
          .maybeSingle();
        if (!ignore && data?.role) {
          setFetchedRole(data.role);
        }
      } catch (e) {
        console.warn('[ContactsView] Gagal memeriksa role pengguna:', e);
      }
    };
    void fetchRole();
    return () => {
      ignore = true;
    };
  }, [propUserRole, effectiveOrgId, currentUserId]);

  const userRole = propUserRole !== undefined ? propUserRole : fetchedRole;
  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';

  const [isLoading, setIsLoading] = useState<boolean>(Boolean(organizationId));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabelFilter, setSelectedLabelFilter] = useState<string>('Semua');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('Semua');
  const [isLabelFilterDropdownOpen, setIsLabelFilterDropdownOpen] = useState<boolean>(false);

  // Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);

  // Label Manager Modal State
  const [isLabelManagerOpen, setIsLabelManagerOpen] = useState(false);
  const [newLabelInput, setNewLabelInput] = useState('');
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [renamingInput, setRenamingInput] = useState('');
  const [deletingLabel, setDeletingLabel] = useState<string | null>(null);
  const [deletingInUseCount, setDeletingInUseCount] = useState<number>(0);
  const [replacementLabelChoice, setReplacementLabelChoice] = useState<string>('Umum');
  const [labelActionError, setLabelActionError] = useState<string | null>(null);
  const [labelActionSuccess, setLabelActionSuccess] = useState<string | null>(null);
  const [isLabelActionLoading, setIsLabelActionLoading] = useState<boolean>(false);

  // Form Fields State
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formLabel, setFormLabel] = useState<ContactLabel>(effectiveLabels[0] || 'Umum');
  const [formStatus, setFormStatus] = useState<FollowUpStatus>('Belum Dihubungi');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Salin Nomor Feedback State
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // Helper terjemahan error Supabase ke Bahasa Indonesia
  const translateContactError = (errMsg: string): string => {
    return formatErrorUserMessage(errMsg, { entityName: 'kontak', isWorker: false });
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
            const parsed = parseContactLabels(labelsArr, effectiveLabels);

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
              label: parsed.label,
              followUpStatus: parsed.followUpStatus,
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
    [effectiveOrgId, effectiveLabels, setContacts]
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
            const parsed = parseContactLabels(labelsArr, effectiveLabels);

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
              label: parsed.label,
              followUpStatus: parsed.followUpStatus,
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

    void loadData();

    return () => {
      ignore = true;
    };
  }, [effectiveOrgId, effectiveLabels, setContacts]);

  // Helper penerjemah error RPC mutasi label organisasi
  const formatRpcLabelError = (error: any): string => {
    if (!error) return 'Terjadi kendala pada server database.';
    const code = String(error.code || '');
    const msg = String(error.message || '').toLowerCase();

    if (code === '42883' || msg.includes('does not exist') || (msg.includes('function') && msg.includes('not found'))) {
      return 'Fitur kelola label memerlukan pembaruan database server (RPC 42883 belum tersedia). Silakan hubungi Administrator untuk menjalankan migrasi skema database.';
    }
    if (code === '42501' || msg.includes('permission denied') || msg.includes('akses ditolak')) {
      return 'Akses ditolak (42501): Hanya Pemilik (Owner) atau Admin yang berwenang mengelola label organisasi.';
    }
    if (code === '23505' || msg.includes('sudah terdaftar') || msg.includes('already exists') || msg.includes('duplikasi')) {
      return 'Nama label sudah digunakan dalam organisasi ini (duplikasi tidak diizinkan, kode 23505).';
    }
    if (code === '22023' || msg.includes('status operasional')) {
      return error.message || 'Nama label tidak boleh menggunakan nama status operasional sistem ("Belum Dihubungi", "Sudah Dihubungi", "Perlu Follow-up").';
    }
    return error.message || 'Gagal memproses label di server database. Operasi dibatalkan.';
  };

  // Handler: Tambah Label Baru
  const handleCreateLabel = async () => {
    if (!isOwnerOrAdmin) {
      setLabelActionError('Akses ditolak: Hanya Pemilik (Owner) atau Admin yang berwenang menambahkan label.');
      return;
    }

    const clean = newLabelInput.trim();
    if (!clean) {
      setLabelActionError('Nama label tidak boleh kosong.');
      return;
    }
    if (clean.length > 30) {
      setLabelActionError('Nama label maksimal 30 karakter.');
      return;
    }
    if (isFollowUpStatus(clean)) {
      setLabelActionError('Nama label tidak boleh menggunakan nama status operasional sistem ("Belum Dihubungi", "Sudah Dihubungi", "Perlu Follow-up").');
      return;
    }
    if (effectiveLabels.some((l) => l.toLowerCase() === clean.toLowerCase())) {
      setLabelActionError(`Label "${clean}" sudah terdaftar.`);
      return;
    }

    if (!effectiveOrgId) {
      setLabelActionError('Organisasi belum dipilih atau tidak aktif.');
      return;
    }

    setIsLabelActionLoading(true);
    setLabelActionError(null);
    setLabelActionSuccess(null);

    const updated = [...effectiveLabels, clean];

    try {
      const { error } = await supabase
        .from('organization_profiles')
        .update({ custom_labels: updated })
        .eq('organization_id', effectiveOrgId);

      if (error) {
        console.error('[ContactsView] Gagal menyimpan custom_labels ke DB:', error);
        if (error.code === '42703' || error.message?.toLowerCase().includes('custom_labels')) {
          setLabelActionError('Kolom custom_labels belum tersedia di database server. Silakan hubungi Administrator.');
          return;
        }
        if (error.code === '42501') {
          setLabelActionError('Akses ditolak (42501): Anda tidak memiliki izin untuk memperbarui label organisasi.');
          return;
        }
        setLabelActionError(error.message || 'Gagal menambahkan label.');
        return;
      }

      onLabelsUpdated?.(updated);
      setNewLabelInput('');
      setLabelActionSuccess(`Label "${clean}" berhasil ditambahkan.`);
    } catch (err: any) {
      setLabelActionError(err?.message || 'Gagal menambahkan label.');
    } finally {
      setIsLabelActionLoading(false);
    }
  };

  // Handler: Ubah Nama Label (Atomic Rename via RPC)
  const handleConfirmRename = async () => {
    if (!editingLabel) return;

    if (!isOwnerOrAdmin) {
      setLabelActionError('Akses ditolak: Hanya Pemilik (Owner) atau Admin yang berwenang mengubah nama label.');
      return;
    }

    const cleanNew = renamingInput.trim();
    if (!cleanNew) {
      setLabelActionError('Nama label baru tidak boleh kosong.');
      return;
    }
    if (cleanNew.length > 30) {
      setLabelActionError('Nama label baru maksimal 30 karakter.');
      return;
    }
    if (isFollowUpStatus(cleanNew)) {
      setLabelActionError('Nama label tidak boleh menggunakan nama status operasional sistem ("Belum Dihubungi", "Sudah Dihubungi", "Perlu Follow-up").');
      return;
    }
    if (
      effectiveLabels.some(
        (l) => l.toLowerCase() === cleanNew.toLowerCase() && l.toLowerCase() !== editingLabel.toLowerCase()
      )
    ) {
      setLabelActionError(`Label dengan nama "${cleanNew}" sudah ada.`);
      return;
    }

    if (!effectiveOrgId) {
      setLabelActionError('Organisasi belum dipilih atau tidak aktif.');
      return;
    }

    setIsLabelActionLoading(true);
    setLabelActionError(null);

    try {
      const { error: rpcError } = await supabase.rpc('rename_organization_contact_label', {
        target_org_id: effectiveOrgId,
        old_label: editingLabel,
        new_label: cleanNew,
      });

      if (rpcError) {
        console.error('[ContactsView] RPC rename_organization_contact_label gagal:', rpcError);
        setLabelActionError(formatRpcLabelError(rpcError));
        return; // Hentikan operasi. JANGAN lakukan fallback klien unbatched!
      }

      // Update state lokal contacts HANYA jika RPC benar-benar berhasil di database
      setContacts((prev) =>
        prev.map((c) => {
          if (c.label.toLowerCase() === editingLabel.toLowerCase()) {
            return {
              ...c,
              label: cleanNew,
              labels: buildContactLabelsArray(cleanNew, c.followUpStatus),
            };
          }
          return c;
        })
      );

      const updatedLabels = effectiveLabels.map((l) =>
        l.toLowerCase() === editingLabel.toLowerCase() ? cleanNew : l
      );
      onLabelsUpdated?.(updatedLabels);

      setEditingLabel(null);
      setRenamingInput('');
      setLabelActionSuccess(`Label "${editingLabel}" berhasil diubah menjadi "${cleanNew}".`);
    } catch (err: any) {
      setLabelActionError(err?.message || 'Gagal mengubah nama label.');
    } finally {
      setIsLabelActionLoading(false);
    }
  };

  // Handler: Buka Dialog Hapus Label
  const handleOpenDeleteLabel = (lbl: string, inUseCount: number) => {
    if (lbl.toLowerCase() === 'umum') {
      setLabelActionError('Label "Umum" tidak dapat dihapus sebagai jangkar sistem.');
      return;
    }
    setDeletingLabel(lbl);
    setDeletingInUseCount(inUseCount);
    const fallbackChoice = effectiveLabels.find((l) => l.toLowerCase() !== lbl.toLowerCase()) || 'Umum';
    setReplacementLabelChoice(fallbackChoice);
    setLabelActionError(null);
    setLabelActionSuccess(null);
  };

  // Handler: Konfirmasi Hapus Label (Safe Delete via RPC)
  const handleConfirmDeleteLabel = async (withReplacement: boolean) => {
    if (!deletingLabel) return;

    if (!isOwnerOrAdmin) {
      setLabelActionError('Akses ditolak: Hanya Pemilik (Owner) atau Admin yang berwenang menghapus label.');
      return;
    }

    const replacement = withReplacement ? replacementLabelChoice : null;

    if (replacement && isFollowUpStatus(replacement)) {
      setLabelActionError('Label pengganti tidak boleh menggunakan nama status operasional sistem.');
      return;
    }

    if (!effectiveOrgId) {
      setLabelActionError('Organisasi belum dipilih atau tidak aktif.');
      return;
    }

    setIsLabelActionLoading(true);
    setLabelActionError(null);

    try {
      const { error: rpcError } = await supabase.rpc('delete_organization_contact_label', {
        target_org_id: effectiveOrgId,
        label_to_delete: deletingLabel,
        replacement_label: replacement,
      });

      if (rpcError) {
        console.error('[ContactsView] RPC delete_organization_contact_label gagal:', rpcError);
        setLabelActionError(formatRpcLabelError(rpcError));
        return; // Hentikan operasi. JANGAN lakukan fallback klien unbatched!
      }

      // Update state lokal contacts HANYA jika RPC benar-benar berhasil di database
      setContacts((prev) =>
        prev.map((c) => {
          if (c.label.toLowerCase() === deletingLabel.toLowerCase()) {
            const newLabel = withReplacement && replacement ? replacement : 'Umum';
            return {
              ...c,
              label: newLabel,
              labels: buildContactLabelsArray(newLabel, c.followUpStatus),
            };
          }
          return c;
        })
      );

      const updatedLabels = effectiveLabels.filter((l) => l.toLowerCase() !== deletingLabel.toLowerCase());
      onLabelsUpdated?.(updatedLabels);

      setDeletingLabel(null);
      setLabelActionSuccess(`Label "${deletingLabel}" berhasil dihapus.`);
    } catch (err: any) {
      setLabelActionError(err?.message || 'Gagal menghapus label.');
    } finally {
      setIsLabelActionLoading(false);
    }
  };

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
    setIsLabelFilterDropdownOpen(false);
  };

  // ==========================================
  // HANDLER FORM TAMBAH & EDIT
  // ==========================================
  const handleOpenAddForm = () => {
    setActiveContact(null);
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormLabel(effectiveLabels[0] || 'Umum');
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
      const labelsToSave = buildContactLabelsArray(formLabel, formStatus);
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

        if (effectiveOrgId && currentUserId) {
          notifyContactUpdated({
            organizationId: effectiveOrgId,
            userId: currentUserId,
            contactName: cleanName,
            phone: formPhone.trim(),
          }).catch((e) => console.warn('[ContactsView] Gagal membuat notifikasi update kontak:', e));
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

        if (effectiveOrgId && currentUserId) {
          notifyContactCreated({
            organizationId: effectiveOrgId,
            userId: currentUserId,
            contactName: cleanName,
            phone: formPhone.trim(),
          }).catch((e) => console.warn('[ContactsView] Gagal membuat notifikasi kontak:', e));
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

      if (effectiveOrgId && currentUserId && activeContact) {
        notifyContactDeleted({
          organizationId: effectiveOrgId,
          userId: currentUserId,
          contactName: activeContact.name,
          phone: activeContact.phone,
        }).catch((e) => console.warn('[ContactsView] Gagal membuat notifikasi hapus kontak:', e));
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
      void navigator.clipboard.writeText(phone);
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

  const { isDark, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 1. HEADER SECTION */}
      <View style={[styles.headerRow, !isDesktop && styles.headerRowMobile]}>
        <View style={[styles.headerLeft, !isDesktop && styles.headerLeftMobile]}>
          <View style={styles.titleWithBadge}>
            <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>Kontak</Text>
            <View style={styles.counterBadge}>
              <Text style={styles.counterBadgeText}>
                {contacts.length} Kontak Terdaftar
              </Text>
            </View>
          </View>
          {isDesktop && (
            <Text style={[styles.pageSubtitle, { color: colors.textSecondary }]}>
              Kelola kontak dan calon pelanggan dalam satu tempat.
            </Text>
          )}
        </View>

        <View style={[styles.headerActions, !isDesktop && styles.headerActionsMobile]}>
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
              <AppIcon name="refresh" size={16} color={colors.textPrimary} />
            )}
          </TouchableOpacity>

          {isOwnerOrAdmin && (
            <TouchableOpacity
              style={styles.btnManageLabels}
              onPress={() => {
                setIsLabelManagerOpen(true);
                setLabelActionError(null);
                setLabelActionSuccess(null);
              }}
              activeOpacity={0.8}
              accessibilityLabel="Kelola Label"
            >
              <AppIcon name="users" size={14} color={colors.accent} />
              <Text style={styles.btnManageLabelsText}>Kelola Label</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.btnAddContact}
            onPress={handleOpenAddForm}
            activeOpacity={0.8}
          >
            <Text style={styles.btnAddContactText}>+ Tambah Kontak</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* BANNER STATUS SINKRONISASI / ERROR STATE */}
      {activeError ? (
        <View style={styles.errorStateBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <AppIcon name="alert" size={14} color={colors.dangerText} />
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
      <View style={[styles.filterSection, !isDesktop && styles.filterSectionMobile, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
        {/* Search Box */}
        <View
          style={[styles.searchBarBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
          // @ts-ignore
          dataSet={{ inputContainer: 'true' }}
        >
          <AppIcon name="search" size={15} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchTextInput, { color: colors.textPrimary }]}
            placeholder="Cari nama kontak, nomor WhatsApp, atau label..."
            placeholderTextColor={colors.textPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            // @ts-ignore
            dataSet={{ embedded: 'true' }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <AppIcon name="close" size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Baris: Dropdown Label & Status */}
        <View style={[styles.filterRow, !isDesktop && styles.filterRowMobile]}>
          {/* Dropdown Filter Label */}
          <View style={[styles.dropdownContainer, !isDesktop && styles.dropdownContainerMobile]}>
            <Text style={styles.filterGroupLabel}>Filter Label:</Text>
            <TouchableOpacity
              style={[
                styles.filterDropdownTrigger,
                isLabelFilterDropdownOpen && styles.filterDropdownTriggerActive,
              ]}
              onPress={() => setIsLabelFilterDropdownOpen(!isLabelFilterDropdownOpen)}
              activeOpacity={0.8}
              accessibilityLabel="Pilih Filter Label Kontak"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <AppIcon
                  name="filter"
                  size={14}
                  color={selectedLabelFilter === 'Semua' ? colors.textSecondary : colors.accent}
                />
                <Text
                  style={[
                    styles.filterDropdownTriggerText,
                    { color: colors.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  {selectedLabelFilter === 'Semua' ? 'Semua Label' : selectedLabelFilter}
                </Text>
                {selectedLabelFilter !== 'Semua' && (
                  <View
                    style={[
                      styles.filterDropdownBadge,
                      { backgroundColor: colors.accentSubtle, borderColor: colors.accentBorder },
                    ]}
                  >
                    <Text style={[styles.filterDropdownBadgeText, { color: colors.accent }]}>
                      {contacts.filter((c) => c.label.toLowerCase() === selectedLabelFilter.toLowerCase()).length}
                    </Text>
                  </View>
                )}
              </View>
              <AppIcon
                name={isLabelFilterDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {/* Dropdown Menu Daftar Label */}
            {isLabelFilterDropdownOpen && (
              <View style={styles.filterDropdownMenu}>
                <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled showsVerticalScrollIndicator>
                  {/* Pilihan: Semua Label */}
                  <TouchableOpacity
                    style={[
                      styles.filterDropdownItem,
                      selectedLabelFilter === 'Semua' && styles.filterDropdownItemActive,
                    ]}
                    onPress={() => {
                      setSelectedLabelFilter('Semua');
                      setIsLabelFilterDropdownOpen(false);
                    }}
                    activeOpacity={0.7}
                    accessibilityLabel="Pilih Opsi Label Semua"
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <Text
                        style={[
                          styles.filterDropdownItemText,
                          selectedLabelFilter === 'Semua' && styles.filterDropdownItemTextActive,
                        ]}
                      >
                        Semua Label
                      </Text>
                      <View style={[styles.filterDropdownCountBadge, { backgroundColor: colors.surfaceSecondary }]}>
                        <Text style={[styles.filterDropdownCountBadgeText, { color: colors.textSecondary }]}>
                          {contacts.length} kontak
                        </Text>
                      </View>
                    </View>
                    {selectedLabelFilter === 'Semua' && (
                      <AppIcon name="check" size={14} color={colors.accent} />
                    )}
                  </TouchableOpacity>

                  {/* Pilihan Setiap Label Efektif */}
                  {effectiveLabels.map((lbl) => {
                    const isSelected = selectedLabelFilter === lbl;
                    const count = contacts.filter((c) => c.label.toLowerCase() === lbl.toLowerCase()).length;
                    const labelColors = getLabelColors(lbl, isDark);

                    return (
                      <TouchableOpacity
                        key={lbl}
                        style={[
                          styles.filterDropdownItem,
                          isSelected && styles.filterDropdownItemActive,
                        ]}
                        onPress={() => {
                          setSelectedLabelFilter(lbl);
                          setIsLabelFilterDropdownOpen(false);
                        }}
                        activeOpacity={0.7}
                        accessibilityLabel={`Pilih Opsi Label ${lbl}`}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <View
                            style={{
                              paddingHorizontal: 7,
                              paddingVertical: 2,
                              borderRadius: 4,
                              backgroundColor: labelColors.bg,
                              borderWidth: 1,
                              borderColor: labelColors.border,
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: labelColors.text }}>
                              {lbl}
                            </Text>
                          </View>
                          <Text style={[styles.filterDropdownCountText, { color: colors.textSecondary }]}>
                            {count} kontak
                          </Text>
                        </View>
                        {isSelected && (
                          <AppIcon name="check" size={14} color={colors.accent} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Filter Status Follow-Up Chips */}
          <View style={[styles.filterGroup, !isDesktop && styles.filterGroupMobile]}>
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
              <AppIcon name="refresh" size={13} color={colors.textPrimary} />
              <Text style={styles.btnResetFilterText}>Reset Filter</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Label Chips Horizontal Bar */}
        <View style={styles.quickChipsRow}>
          <Text style={[styles.quickChipsLabel, { color: colors.textMuted }]}>Quick Label:</Text>
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
                Semua
              </Text>
            </TouchableOpacity>
            {effectiveLabels.map((lbl) => (
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
      </View>

      {/* 3. DAFTAR KONTAK: TABEL DESKTOP VS KARTU MOBILE */}
      <View style={[styles.tableCard, !isDesktop && styles.tableCardMobile]}>
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
              <AppIcon name="users" size={26} color={colors.textPrimary} />
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
          <View style={[styles.tableWrapper, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
            {/* Table Header Row */}
            <View style={[styles.tableHeadRow, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
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
                      <AppIcon name="user" size={14} color={colors.textPrimary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionIconBtn}
                      onPress={() => handleOpenEditForm(contact)}
                      accessibilityLabel="Edit Kontak"
                    >
                      <AppIcon name="edit" size={13} color={colors.textPrimary} />
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
          <View style={[styles.mobileCardsContainer, !isDesktop && styles.mobileCardsContainerMobile]}>
            {filteredContacts.map((contact) => (
              <View key={contact.id} style={styles.mobileContactCard}>
                {/* Header Kartu */}
                <View style={styles.mobileCardHeader}>
                  <View style={styles.mobileAvatarGroup}>
                    <View style={[styles.rowAvatar, { backgroundColor: getAvatarBg(contact.name) }]}>
                      <Text style={styles.rowAvatarText}>{getInitials(contact.name)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.contactNameText} numberOfLines={1} ellipsizeMode="tail">
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
                      <AppIcon name="edit" size={13} color={colors.textPrimary} />
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
                  <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <Text style={styles.phoneText}>{contact.phone}</Text>
                    {contact.email ? (
                      <Text style={styles.emailSmallText} numberOfLines={1} ellipsizeMode="middle">
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
                      color={copiedPhoneId === contact.id ? colors.accent : colors.textSecondary}
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
                  <AppIcon name="chevron-right" size={12} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
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
              <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
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
                <AppIcon name="close" size={16} color={colors.textPrimary} />
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
                  placeholderTextColor={colors.textPlaceholder}
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
                  placeholderTextColor={colors.textPlaceholder}
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
                  placeholderTextColor={colors.textPlaceholder}
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
                  {effectiveLabels.map((lbl) => {
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
                  placeholderTextColor={colors.textPlaceholder}
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, marginRight: 8 }}>
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
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.modalTitle} numberOfLines={1} ellipsizeMode="tail">{activeContact.name}</Text>
                      {activeContact.isDemo && (
                        <View style={styles.demoPillSmall}>
                          <Text style={styles.demoPillSmallText}>DEMO</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.modalSubtitle} numberOfLines={1} ellipsizeMode="tail">Terdaftar sejak {activeContact.createdAt}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setIsDetailModalOpen(false)}
                >
                  <AppIcon name="close" size={16} color={colors.textPrimary} />
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
                    <AppIcon name="edit" size={13} color={colors.textPrimary} />
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
                  <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
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

      {/* ========================================== */}
      {/* 7. MODAL KELOLA LABEL KONTAK (Owner/Admin) */}
      {/* ========================================== */}
      <Modal
        visible={isLabelManagerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsLabelManagerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsLabelManagerOpen(false)}
          />

          <View style={[styles.modalDialog, { maxWidth: 520, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.modalHeader, { backgroundColor: colors.surfaceSecondary, borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Kelola Label Kontak Organisasi</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  Tambah, ubah nama, dan atur segmen audiens unik untuk organisasi Anda
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsLabelManagerOpen(false)}
                accessibilityLabel="Tutup Kelola Label"
              >
                <AppIcon name="close" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380, paddingHorizontal: 20, paddingVertical: 14 }}>
              {/* Feedback Error / Success */}
              {labelActionError && (
                <View style={{ backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 12 }}>
                  <Text style={{ color: colors.dangerText, fontSize: 12, fontWeight: '600' }}>{labelActionError}</Text>
                </View>
              )}
              {labelActionSuccess && (
                <View style={{ backgroundColor: colors.successBg, borderColor: colors.successBorder, borderWidth: 1, padding: 10, borderRadius: 8, marginBottom: 12 }}>
                  <Text style={{ color: colors.successText, fontSize: 12, fontWeight: '600' }}>{labelActionSuccess}</Text>
                </View>
              )}

              {/* Input Tambah Label Baru */}
              <View style={{ backgroundColor: colors.surfaceSecondary, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
                  Tambah Label Baru
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.inputField, { flex: 1, height: 38, fontSize: 13, backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="Contoh: Reseller VIP, Pelanggan Baru..."
                    placeholderTextColor={colors.textPlaceholder}
                    value={newLabelInput}
                    onChangeText={(t) => {
                      setNewLabelInput(t);
                      if (labelActionError) setLabelActionError(null);
                    }}
                    onSubmitEditing={handleCreateLabel}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={[styles.btnAddContact, { backgroundColor: colors.accent, paddingHorizontal: 14, height: 38 }]}
                    onPress={handleCreateLabel}
                    disabled={isLabelActionLoading}
                  >
                    {isLabelActionLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>+ Tambah</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Daftar Label Aktif */}
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 }}>
                Label Aktif ({effectiveLabels.length})
              </Text>

              <View style={{ gap: 8, marginBottom: 12 }}>
                {effectiveLabels.map((lbl) => {
                  const labelColors = getLabelColors(lbl, isDark);
                  const isUmum = lbl.toLowerCase() === 'umum';
                  const inUseCount = contacts.filter((c) => c.label.toLowerCase() === lbl.toLowerCase()).length;
                  const isEditing = editingLabel === lbl;

                  return (
                    <View
                      key={lbl}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 10,
                        backgroundColor: colors.surfaceSecondary,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 8,
                      }}
                    >
                      {isEditing ? (
                        <View style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          <TextInput
                            style={[styles.inputField, { flex: 1, height: 34, fontSize: 12, paddingVertical: 4, backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border }]}
                            value={renamingInput}
                            onChangeText={setRenamingInput}
                            placeholderTextColor={colors.textPlaceholder}
                            autoFocus
                          />
                          <TouchableOpacity
                            style={[styles.btnAddContact, { backgroundColor: colors.accent, height: 34, paddingHorizontal: 10 }]}
                            onPress={handleConfirmRename}
                            disabled={isLabelActionLoading}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Simpan</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.btnCancel, { backgroundColor: colors.surfaceCard, borderColor: colors.border, height: 34, paddingHorizontal: 8 }]}
                            onPress={() => setEditingLabel(null)}
                          >
                            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>Batal</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View
                              style={{
                                paddingVertical: 3.5,
                                paddingHorizontal: 8,
                                borderRadius: 6,
                                backgroundColor: labelColors.bg,
                                borderWidth: 1,
                                borderColor: labelColors.border,
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary }}>{lbl}</Text>
                            </View>
                            <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                              {inUseCount} kontak
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <TouchableOpacity
                              style={{
                                padding: 6,
                                borderRadius: 4,
                                backgroundColor: colors.surfaceCard,
                                borderWidth: 1,
                                borderColor: colors.border,
                              }}
                              onPress={() => {
                                setEditingLabel(lbl);
                                setRenamingInput(lbl);
                                setLabelActionError(null);
                                setLabelActionSuccess(null);
                              }}
                              accessibilityLabel={`Ubah nama label ${lbl}`}
                            >
                              <AppIcon name="edit" size={13} color={colors.textPrimary} />
                            </TouchableOpacity>

                            {!isUmum && (
                              <TouchableOpacity
                                style={{
                                  padding: 6,
                                  borderRadius: 4,
                                  backgroundColor: colors.dangerBg,
                                  borderWidth: 1,
                                  borderColor: colors.dangerBorder,
                                }}
                                onPress={() => handleOpenDeleteLabel(lbl, inUseCount)}
                                accessibilityLabel={`Hapus label ${lbl}`}
                              >
                                <AppIcon name="trash" size={13} color={colors.dangerText} />
                              </TouchableOpacity>
                            )}
                          </View>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={[styles.modalFooter, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.btnAddContact, { backgroundColor: colors.accent, width: '100%', justifyContent: 'center' }]}
                onPress={() => setIsLabelManagerOpen(false)}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 8. MODAL KONFIRMASI HAPUS LABEL AMAN       */}
      {/* ========================================== */}
      <Modal
        visible={deletingLabel !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeletingLabel(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setDeletingLabel(null)}
          />

          <View style={[styles.modalDialog, { maxWidth: 440, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.deleteConfirmHeader}>
              <View style={[styles.deleteAlertIconCircle, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
                <AppIcon name="alert" size={20} color={colors.dangerText} />
              </View>
              <Text style={[styles.deleteDialogTitle, { color: colors.textPrimary }]}>Hapus Label &ldquo;{deletingLabel}&rdquo;?</Text>
              <Text style={[styles.deleteDialogDesc, { color: colors.textSecondary }]}>
                {deletingInUseCount > 0
                  ? `Label ini sedang digunakan oleh ${deletingInUseCount} kontak. Anda dapat mengalihkan kontak ke label pengganti agar data segmentasi tetap terawat.`
                  : 'Label ini belum digunakan oleh kontak mana pun dan aman untuk langsung dihapus.'}
              </Text>
            </View>

            {deletingInUseCount > 0 && (
              <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 }}>
                  Pilih Label Pengganti Kontak:
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {effectiveLabels
                    .filter((l) => l.toLowerCase() !== deletingLabel?.toLowerCase())
                    .map((alt) => {
                      const isSel = replacementLabelChoice === alt;
                      return (
                        <TouchableOpacity
                          key={alt}
                          style={[
                            styles.radioChip,
                            isSel && styles.radioChipSelected,
                            { paddingVertical: 4, paddingHorizontal: 8 },
                          ]}
                          onPress={() => setReplacementLabelChoice(alt)}
                        >
                          <Text style={[styles.radioChipText, isSel && styles.radioChipTextSelected, { fontSize: 12 }]}>
                            {alt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </View>
            )}

            <View style={[styles.modalFooter, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border, flexDirection: 'column', gap: 8 }]}>
              {deletingInUseCount > 0 ? (
                <>
                  <TouchableOpacity
                    style={[styles.btnAddContact, { backgroundColor: colors.accent, width: '100%', justifyContent: 'center' }]}
                    onPress={() => handleConfirmDeleteLabel(true)}
                    disabled={isLabelActionLoading}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                      Alihkan ke &ldquo;{replacementLabelChoice}&rdquo; & Hapus
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnConfirmDelete, { width: '100%', justifyContent: 'center', backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderWidth: 1 }]}
                    onPress={() => handleConfirmDeleteLabel(false)}
                    disabled={isLabelActionLoading}
                  >
                    <Text style={{ color: colors.dangerText, fontWeight: '700', fontSize: 13 }}>
                      Hapus Label Tanpa Pengganti
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.btnConfirmDelete, { width: '100%', justifyContent: 'center' }]}
                  onPress={() => handleConfirmDeleteLabel(false)}
                  disabled={isLabelActionLoading}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                    Ya, Hapus Label Ini
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.btnCancel, { width: '100%', alignItems: 'center', backgroundColor: colors.surfaceCard, borderColor: colors.border, marginTop: 4 }]}
                onPress={() => setDeletingLabel(null)}
                disabled={isLabelActionLoading}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>Batal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ==========================================
// STYLING DETAIL B2B SAAS KONTAK
// ==========================================
const createStyles = (colors: ThemePalette) => StyleSheet.create({
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
    color: colors.textPrimary,
  },
  counterBadge: {
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  counterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  pageSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
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
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceCard,
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
  btnManageLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 6,
  },
  btnManageLabelsText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
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
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  syncIndicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.accent,
  },
  syncStateBannerText: {
    fontSize: 11,
    color: colors.successText,
    fontWeight: '600',
    flex: 1,
  },
  errorStateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  errorStateBannerText: {
    fontSize: 11,
    color: colors.dangerText,
    fontWeight: '500',
    flex: 1,
  },
  btnRetry: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  btnRetryText: {
    fontSize: 11,
    color: colors.dangerText,
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
    color: colors.textSecondary,
    fontWeight: '500',
  },
  emailSmallText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // ----------------------------------------
  // PENCARIAN & FILTER
  // ----------------------------------------
  filterSection: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
    zIndex: 30,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.06)',
      },
      default: {
        elevation: 2,
      },
    }),
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 7,
    paddingHorizontal: 12,
    height: 38,
  },
  searchTextInput: {
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  dropdownContainer: {
    position: 'relative',
    zIndex: 50,
    minWidth: 220,
    flex: 1,
    gap: 4,
  },
  filterDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 38,
  },
  filterDropdownTriggerActive: {
    borderColor: colors.accent,
  },
  filterDropdownTriggerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  filterDropdownBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterDropdownBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  filterDropdownMenu: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 999,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
      },
      default: {
        elevation: 8,
      },
    }),
  },
  filterDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterDropdownItemActive: {
    backgroundColor: colors.accentSubtle,
  },
  filterDropdownItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  filterDropdownItemTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  filterDropdownCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
  },
  filterDropdownCountBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  filterDropdownCountText: {
    fontSize: 11,
  },
  quickChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  quickChipsLabel: {
    fontSize: 11,
    fontWeight: '600',
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
    color: colors.textSecondary,
  },
  filterChip: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipActive: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  btnResetFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
  },
  btnResetFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // ----------------------------------------
  // TABEL DESKTOP
  // ----------------------------------------
  tableCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    minHeight: 400,
  },
  tableWrapper: {
    flex: 1,
  },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  thCell: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.textPrimary,
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
    color: colors.textSecondary,
  },
  phoneText: {
    fontSize: 12,
    color: colors.textPrimary,
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
    color: colors.textSecondary,
  },
  actionIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDeleteBtn: {
    borderColor: colors.isDark ? colors.dangerBorder : '#FECACA',
    backgroundColor: colors.isDark ? colors.dangerBg : '#FEF2F2',
  },

  // ----------------------------------------
  // RESPONSIVE MOBILE OVERRIDES
  // ----------------------------------------
  headerRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  headerLeftMobile: {
    minWidth: 0,
    width: '100%',
  },
  headerActionsMobile: {
    width: '100%',
    justifyContent: 'flex-start',
    gap: 6,
    flexWrap: 'wrap',
  },
  btnRefreshMobile: {
    width: 34,
    height: 34,
  },
  btnManageLabelsMobile: {
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  btnAddContactMobile: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterSectionMobile: {
    padding: 14,
    gap: 12,
    borderRadius: 10,
    width: '100%',
  },
  filterRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    width: '100%',
  },
  dropdownContainerMobile: {
    minWidth: 0,
    width: '100%',
  },
  filterGroupMobile: {
    width: '100%',
    minWidth: 0,
  },
  tableCardMobile: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    minHeight: 0,
    padding: 0,
    width: '100%',
  },
  mobileCardsContainerMobile: {
    padding: 0,
    width: '100%',
  },

  // ----------------------------------------
  // KARTU MOBILE
  // ----------------------------------------
  mobileCardsContainer: {
    padding: 12,
    width: '100%',
  },
  mobileContactCard: {
    width: '100%',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
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
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyBtnLabel: {
    fontSize: 11,
    color: colors.textSecondary,
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
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 2,
  },
  btnViewDetailMobileText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
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
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: colors.textSecondary,
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
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  btnSecondarySmallText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
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
    backgroundColor: colors.surfaceCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSecondary,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
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
    color: colors.textPrimary,
  },
  requiredStar: {
    color: '#DC2626',
  },
  inputField: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 7,
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
  textareaField: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fieldHelper: {
    fontSize: 10,
    color: colors.textMuted,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  radioChip: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  radioChipSelected: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accent,
  },
  radioChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  radioChipTextSelected: {
    color: colors.accent,
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: colors.surfaceSecondary,
  },
  modalFooterBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: colors.surfaceSecondary,
    flexWrap: 'wrap',
    gap: 10,
  },
  btnCancel: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
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
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  detailInfoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
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
    color: colors.textPrimary,
  },
  btnCopyModal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  btnCopyModalText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  detailTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  notesBox: {
    marginTop: 4,
    backgroundColor: colors.surfaceCard,
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notesText: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  btnActionEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  btnActionEditText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
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
    color: colors.textPrimary,
    marginBottom: 6,
  },
  deleteDialogDesc: {
    fontSize: 12,
    color: colors.textSecondary,
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
