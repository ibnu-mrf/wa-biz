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
import { deleteTeamMemberClient } from '../lib/whatsappClient';

// ==========================================
// TIPE DATA TIM CUSTOMER SERVICE (SUPABASE)
// ==========================================
// Tabel Supabase public.team_members kolom resmi:
// id, organization_id, full_name, email, department, role, is_active, created_at, updated_at

export const CS_DEPARTMENTS = [
  'Pendaftaran / PSB',
  'Administrasi',
  'Keuangan',
  'Informasi Umum / Humas',
  'Supervisor',
  'Layanan Pelanggan',
] as const;

export type CsDepartment = (typeof CS_DEPARTMENTS)[number] | string;

export const CS_ROLES = ['Admin', 'Supervisor', 'Customer Service'] as const;
export type CsRole = (typeof CS_ROLES)[number] | string;

export interface TeamMember {
  id: string;
  organizationId?: string;
  name: string; // alias untuk full_name agar kompatibel dengan UI
  fullName: string;
  email: string;
  phone?: string;
  department: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  isDemo?: boolean;
}

// ==========================================
// DATA DEMO AWAL (JIKA DATABASE KOSONG / OFFLINE)
// ==========================================
export const INITIAL_TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'team_1',
    name: 'Ustadz H. Ahmad Dahlan, S.Pd.I',
    fullName: 'Ustadz H. Ahmad Dahlan, S.Pd.I',
    email: 'ahmad.dahlan@darululum-wabiz.sch.id',
    phone: '081234567890',
    department: 'Supervisor',
    role: 'Supervisor',
    isActive: true,
    createdAt: '01 Okt 2026',
    isDemo: true,
  },
  {
    id: 'team_2',
    name: 'Siti Aisyah, S.Kom',
    fullName: 'Siti Aisyah, S.Kom',
    email: 'aisyah.psb@darululum-wabiz.sch.id',
    phone: '085641886993',
    department: 'Pendaftaran / PSB',
    role: 'Customer Service',
    isActive: true,
    createdAt: '05 Okt 2026',
    isDemo: true,
  },
];

// Helper inisial nama (2 huruf)
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'CS';
}

// Helper warna avatar
function getAvatarBg(name: string): string {
  const colors = ['#059669', '#2563EB', '#7C3AED', '#D97706', '#DB2777', '#0891B2'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

// Helper terjemahan error Supabase ke Bahasa Indonesia
export function translateTeamError(errMsg: string): string {
  const lower = errMsg.toLowerCase();
  if (lower.includes('duplicate') || lower.includes('unique') || lower.includes('23505')) {
    return 'Alamat email ini sudah terdaftar sebagai anggota tim dalam organisasi Anda.';
  }
  if (lower.includes('permission denied') || lower.includes('policy') || lower.includes('42501')) {
    return 'Akses ditolak oleh kebijakan keamanan (RLS). Hanya pemilik (owner) atau admin organisasi yang diizinkan mengelola anggota tim.';
  }
  if (lower.includes('foreign key') || lower.includes('violates foreign key')) {
    return 'Organisasi tidak valid atau tidak ditemukan.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection')) {
    return 'Gagal terhubung ke database Supabase. Periksa koneksi internet Anda.';
  }
  return errMsg || 'Terjadi kendala saat memproses data anggota tim.';
}

// ==========================================
// BADGE KOMPONEN: STATUS, PERAN & DEPARTEMEN
// ==========================================
export function CsStatusBadge({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <View style={[styles.statusBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
        <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
        <Text style={[styles.statusBadgeText, { color: '#047857' }]}>Aktif</Text>
      </View>
    );
  }
  return (
    <View style={[styles.statusBadge, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]}>
      <View style={[styles.statusDot, { backgroundColor: '#94A3B8' }]} />
      <Text style={[styles.statusBadgeText, { color: '#64748B' }]}>Tidak Aktif</Text>
    </View>
  );
}

export function CsRoleBadge({ role }: { role: string }) {
  let bg = '#F1F5F9';
  let text = '#475569';
  let border = '#E2E8F0';

  const r = role.toLowerCase();
  if (r.includes('admin')) {
    bg = '#F5F3FF';
    text = '#6D28D9';
    border = '#DDD6FE';
  } else if (r.includes('supervisor')) {
    bg = '#E0F2FE';
    text = '#0369A1';
    border = '#BAE6FD';
  } else {
    bg = '#EAF6F0';
    text = '#0E7A4E';
    border = '#C1E6D3';
  }

  return (
    <View style={[styles.roleBadge, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.roleBadgeText, { color: text }]}>{role}</Text>
    </View>
  );
}

export function CsDepartmentBadge({ department }: { department: string }) {
  return (
    <View style={styles.deptBadge}>
      <Text style={styles.deptBadgeText}>{department}</Text>
    </View>
  );
}

// ==========================================
// KOMPONEN UTAMA: TEAM VIEW
// ==========================================
export interface TeamViewProps {
  organizationId?: string;
  currentUserId?: string;
  teamMembers?: TeamMember[];
  setTeamMembers?: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  isDesktop?: boolean;
  onNavigate?: (page: 'dashboard' | 'chat' | 'users' | 'campaign' | 'bot' | 'team' | 'settings') => void;
}

export function TeamView({
  organizationId,
  currentUserId: _currentUserId,
  teamMembers: externalTeamMembers,
  setTeamMembers: externalSetTeamMembers,
  isDesktop = true,
  onNavigate: _onNavigate,
}: TeamViewProps) {
  const [internalTeamMembers, setInternalTeamMembers] = useState<TeamMember[]>([]);
  const teamMembers = externalTeamMembers ?? internalTeamMembers;
  const setTeamMembers = externalSetTeamMembers ?? setInternalTeamMembers;

  // Supabase Organization State (Single Source of Truth dari App.tsx)
  const effectiveOrgId = organizationId;

  // Role Pengguna Saat Ini dalam Organisasi
  const [userRole, setUserRole] = useState<'owner' | 'admin' | 'member' | string | null>(null);
  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === null;

  // Async States
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(organizationId));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('Semua');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('Semua');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('Semua');

  // Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeMember, setActiveMember] = useState<TeamMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<TeamMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Form State
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDept, setFormDept] = useState<string>('Layanan Pelanggan');
  const [formRole, setFormRole] = useState<string>('Customer Service');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Feedback Banner
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'info' | 'warning'; text: string } | null>(null);

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
        console.error('Error fetching user role:', e);
      }
    };

    checkRole();
    return () => {
      ignore = true;
    };
  }, [effectiveOrgId]);

  // Muat Anggota Tim dari Supabase public.team_members
  const fetchTeamMembers = useCallback(
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
          .from('team_members')
          .select('id, organization_id, full_name, email, department, role, phone, is_active, created_at, updated_at')
          .eq('organization_id', targetOrgId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching team members:', error.message);
          setFetchError(translateTeamError(error.message));
        } else if (data) {
          const mapped: TeamMember[] = data.map((row) => ({
            id: row.id,
            organizationId: row.organization_id,
            name: row.full_name,
            fullName: row.full_name,
            email: row.email || '',
            phone: row.phone || '',
            department: row.department || 'Umum',
            role: row.role || 'Customer Service',
            isActive: Boolean(row.is_active),
            createdAt: row.created_at
              ? new Date(row.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : '',
            isDemo: false,
          }));
          setTeamMembers(mapped);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        setFetchError(translateTeamError(msg));
      } finally {
        setIsLoading(false);
      }
    },
    [effectiveOrgId, setTeamMembers]
  );

  // Inisialisasi muat anggota tim saat ID organisasi berubah
  useEffect(() => {
    let ignore = false;
    if (!effectiveOrgId) return;

    const loadData = async () => {
      try {
        const { data, error } = await supabase
          .from('team_members')
          .select('id, organization_id, full_name, email, department, role, phone, is_active, created_at, updated_at')
          .eq('organization_id', effectiveOrgId)
          .order('created_at', { ascending: false });

        if (ignore) return;
        if (error) {
          setFetchError(translateTeamError(error.message));
        } else if (data) {
          const mapped: TeamMember[] = data.map((row) => ({
            id: row.id,
            organizationId: row.organization_id,
            name: row.full_name,
            fullName: row.full_name,
            email: row.email || '',
            phone: row.phone || '',
            department: row.department || 'Umum',
            role: row.role || 'Customer Service',
            isActive: Boolean(row.is_active),
            createdAt: row.created_at
              ? new Date(row.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : '',
            isDemo: false,
          }));
          setTeamMembers(mapped);
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : '';
          setFetchError(translateTeamError(msg));
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
  }, [effectiveOrgId, setTeamMembers]);

  // Statistik Ringkasan Tim
  const stats = useMemo(() => {
    const total = teamMembers.length;
    const active = teamMembers.filter((m) => m.isActive).length;
    const inactive = teamMembers.filter((m) => !m.isActive).length;
    return { total, active, inactive };
  }, [teamMembers]);

  // Statistik Per Departemen
  const deptStats = useMemo(() => {
    return CS_DEPARTMENTS.map((dept) => {
      const inDept = teamMembers.filter((m) => m.department === dept);
      const activeCount = inDept.filter((m) => m.isActive).length;
      return {
        department: dept,
        total: inDept.length,
        active: activeCount,
      };
    });
  }, [teamMembers]);

  // Filtering Anggota
  const filteredMembers = useMemo(() => {
    return teamMembers.filter((member) => {
      // Filter Departemen
      if (selectedDeptFilter !== 'Semua' && member.department !== selectedDeptFilter) {
        return false;
      }
      // Filter Status
      if (selectedStatusFilter === 'Aktif' && !member.isActive) return false;
      if (selectedStatusFilter === 'Tidak Aktif' && member.isActive) return false;

      // Filter Peran
      if (selectedRoleFilter !== 'Semua' && member.role !== selectedRoleFilter) {
        return false;
      }
      // Filter Pencarian
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase().trim();
        const matchName = member.fullName.toLowerCase().includes(q);
        const matchEmail = member.email.toLowerCase().includes(q);
        const matchDept = member.department.toLowerCase().includes(q);
        const matchRole = member.role.toLowerCase().includes(q);
        return matchName || matchEmail || matchDept || matchRole;
      }
      return true;
    });
  }, [teamMembers, selectedDeptFilter, selectedStatusFilter, selectedRoleFilter, searchQuery]);

  // Reset Filter
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedDeptFilter('Semua');
    setSelectedStatusFilter('Semua');
    setSelectedRoleFilter('Semua');
  };

  const isFilterActive =
    searchQuery.trim() !== '' ||
    selectedDeptFilter !== 'Semua' ||
    selectedStatusFilter !== 'Semua' ||
    selectedRoleFilter !== 'Semua';

  // Buka Modal Tambah
  const handleOpenAddForm = () => {
    if (userRole === 'member') {
      setFeedbackMsg({
        type: 'warning',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak menambahkan anggota tim baru.',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    setActiveMember(null);
    setFormFullName('');
    setFormEmail('');
    setFormPhone('');
    setFormDept('Layanan Pelanggan');
    setFormRole('Customer Service');
    setFormIsActive(true);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  // Buka Modal Edit
  const handleOpenEditForm = (member: TeamMember) => {
    if (userRole === 'member') {
      setFeedbackMsg({
        type: 'warning',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak mengubah data anggota tim.',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    setActiveMember(member);
    setFormFullName(member.fullName);
    setFormEmail(member.email);
    setFormPhone(member.phone || '');
    setFormDept(member.department);
    setFormRole(member.role);
    setFormIsActive(member.isActive);
    setFormError(null);
    setIsDetailModalOpen(false);
    setIsFormModalOpen(true);
  };

  // Simpan Anggota (Tambah / Edit ke Supabase)
  const handleSaveMember = async () => {
    if (isSubmitting) return;
    if (!effectiveOrgId) {
      setFormError('ID organisasi tidak ditemukan. Silakan muat ulang halaman.');
      return;
    }

    // 1. Validasi Nama
    if (formFullName.trim().length < 3) {
      setFormError('Nama lengkap anggota tim wajib diisi minimal 3 karakter.');
      return;
    }

    // 2. Validasi Format Email
    const emailTrimmed = formEmail.trim();
    if (emailTrimmed.length === 0) {
      setFormError('Alamat email anggota tim wajib diisi.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      setFormError('Format alamat email tidak valid. Contoh: nama@domain.com');
      return;
    }

    // 3. Validasi Nomor WhatsApp
    const phoneTrimmed = formPhone.trim();
    if (phoneTrimmed.length > 0) {
      const cleanDigits = phoneTrimmed.replace(/\D/g, '');
      if (cleanDigits.length < 9) {
        setFormError('Nomor WhatsApp wajib minimal 9 digit angka (contoh: 085641886993).');
        return;
      }
    }

    // 4. Validasi Duplikat Email di Tim Lokal
    const isDuplicate = teamMembers.some((m) => {
      if (activeMember && m.id === activeMember.id) return false;
      return m.email.toLowerCase() === emailTrimmed.toLowerCase();
    });

    if (isDuplicate) {
      setFormError(`Alamat email "${emailTrimmed}" sudah terdaftar pada anggota tim lain.`);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (activeMember) {
        // Operasi UPDATE ke Supabase
        const { error: updateError } = await supabase
          .from('team_members')
          .update({
            full_name: formFullName.trim(),
            email: emailTrimmed,
            phone: phoneTrimmed || null,
            department: formDept,
            role: formRole,
            is_active: formIsActive,
            updated_at: new Date().toISOString(),
          })
          .eq('id', activeMember.id)
          .eq('organization_id', effectiveOrgId);

        if (updateError) {
          console.error('Error updating team member:', updateError.message);
          setFormError(translateTeamError(updateError.message));
          return;
        }

        // Perbarui state lokal
        setTeamMembers((prev) =>
          prev.map((m) =>
            m.id === activeMember.id
              ? {
                  ...m,
                  name: formFullName.trim(),
                  fullName: formFullName.trim(),
                  email: emailTrimmed,
                  phone: phoneTrimmed,
                  department: formDept,
                  role: formRole,
                  isActive: formIsActive,
                }
              : m
          )
        );

        setFeedbackMsg({
          type: 'success',
          text: `Data anggota "${formFullName.trim()}" berhasil diperbarui.`,
        });
      } else {
        // Operasi INSERT ke Supabase
        const { data: newRow, error: insertError } = await supabase
          .from('team_members')
          .insert({
            organization_id: effectiveOrgId,
            full_name: formFullName.trim(),
            email: emailTrimmed,
            phone: phoneTrimmed || null,
            department: formDept,
            role: formRole,
            is_active: formIsActive,
          })
          .select('id, organization_id, full_name, email, department, role, phone, is_active, created_at, updated_at')
          .single();

        if (insertError) {
          console.error('Error adding team member:', insertError.message);
          setFormError(translateTeamError(insertError.message));
          return;
        }

        if (newRow) {
          const newItem: TeamMember = {
            id: newRow.id,
            organizationId: newRow.organization_id,
            name: newRow.full_name,
            fullName: newRow.full_name,
            email: newRow.email || '',
            phone: newRow.phone || '',
            department: newRow.department || 'Umum',
            role: newRow.role || 'Customer Service',
            isActive: Boolean(newRow.is_active),
            createdAt: newRow.created_at
              ? new Date(newRow.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : 'Hari ini',
            isDemo: false,
          };
          setTeamMembers((prev) => [newItem, ...prev]);
        }

        setFeedbackMsg({
          type: 'success',
          text: `Anggota baru "${formFullName.trim()}" berhasil didaftarkan.`,
        });
      }

      setIsFormModalOpen(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setFormError(translateTeamError(msg));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Buka Modal Konfirmasi Nonaktifkan / Aktifkan
  const handleOpenDeactivateModal = (member: TeamMember) => {
    if (userRole === 'member') {
      setFeedbackMsg({
        type: 'warning',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak mengubah status aktif anggota.',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    setActiveMember(member);
    setIsDeactivateModalOpen(true);
  };

  // Toggle Status Aktif / Nonaktif di Supabase
  const handleToggleActiveStatus = async () => {
    if (!activeMember || !effectiveOrgId || isSubmitting) return;

    const nextState = !activeMember.isActive;
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('team_members')
        .update({
          is_active: nextState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeMember.id)
        .eq('organization_id', effectiveOrgId);

      if (error) {
        console.error('Error toggling member status:', error.message);
        setFeedbackMsg({
          type: 'warning',
          text: translateTeamError(error.message),
        });
      } else {
        setTeamMembers((prev) =>
          prev.map((m) =>
            m.id === activeMember.id ? { ...m, isActive: nextState } : m
          )
        );
        setFeedbackMsg({
          type: 'success',
          text: nextState
            ? `Anggota tim "${activeMember.fullName}" telah diaktifkan kembali.`
            : `Anggota tim "${activeMember.fullName}" telah dinonaktifkan.`,
        });
      }

      setIsDeactivateModalOpen(false);
      setActiveMember(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setFeedbackMsg({
        type: 'warning',
        text: translateTeamError(msg),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Buka Modal Konfirmasi Hapus Anggota
  const handleOpenDeleteModal = (member: TeamMember) => {
    if (userRole === 'member') {
      setFeedbackMsg({
        type: 'warning',
        text: 'Akses dibatasi: Hanya Owner atau Admin organisasi yang berhak menghapus anggota tim.',
      });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    setMemberToDelete(member);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  // Batal Hapus Anggota
  const handleCancelDelete = () => {
    if (isDeleting) return;
    setIsDeleteModalOpen(false);
    setMemberToDelete(null);
    setDeleteError(null);
  };

  // Konfirmasi Eksekusi Hapus Anggota
  const handleConfirmDelete = async () => {
    if (!memberToDelete || isDeleting) return;
    if (!memberToDelete.isDemo && !effectiveOrgId) {
      setDeleteError('ID organisasi tidak ditemukan. Silakan muat ulang halaman.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    const targetMember = memberToDelete;

    try {
      if (!targetMember.isDemo) {
        // Data persisten: wajib dihapus melalui backend terautentikasi dengan validasi tenant
        const clientRes = await deleteTeamMemberClient(targetMember.id, effectiveOrgId);
        if (!clientRes.success) {
          setDeleteError(clientRes.error || 'Gagal menghapus anggota tim melalui backend worker.');
          setIsDeleting(false);
          return;
        }
      }

      // Hapus dari state lokal
      setTeamMembers((prev) => prev.filter((m) => m.id !== targetMember.id));

      // Jika modal detail sedang terbuka untuk anggota ini, tutup modal detail
      if (activeMember && activeMember.id === targetMember.id) {
        setIsDetailModalOpen(false);
        setActiveMember(null);
      }

      // Tutup modal konfirmasi hapus dan reset target
      setIsDeleteModalOpen(false);
      setMemberToDelete(null);

      // Tampilkan feedback notifikasi sukses yang tidak menghalangi pengguna
      setFeedbackMsg({
        type: 'success',
        text: `Anggota tim "${targetMember.fullName}" berhasil dihapus dari organisasi.`,
      });
      setTimeout(() => setFeedbackMsg(null), 4000);

      // Sinkronisasi data terbaru secara silent jika online
      if (!targetMember.isDemo && effectiveOrgId) {
        fetchTeamMembers(effectiveOrgId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Delete Team Member] Exception:', msg);
      setDeleteError(translateTeamError(msg));
    } finally {
      setIsDeleting(false);
    }
  };

  const activeFetchError =
    fetchError || (!effectiveOrgId ? 'Organisasi belum dipilih atau tidak aktif. Silakan pilih workspace Anda.' : null);

  return (
    <View style={styles.pageContainer}>
      {/* ========================================== */}
      {/* 1. HEADER HALAMAN                          */}
      {/* ========================================== */}
      <View style={styles.pageHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Tim Customer Service</Text>
            <View style={styles.memberCountPill}>
              <Text style={styles.memberCountPillText}>{stats.total} Anggota</Text>
            </View>
            {userRole && (
              <View style={[styles.userRolePill, isOwnerOrAdmin ? styles.userRoleAdmin : styles.userRoleMember]}>
                <Text style={styles.userRoleText}>Peran Anda: {userRole.toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Text style={styles.headerSubtitle}>
            Kelola petugas CS, alokasi departemen, status ketersediaan, dan pembagian tugas penanganan percakapan Supabase.
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.btnPrimary}
            activeOpacity={0.8}
            onPress={handleOpenAddForm}
          >
            <AppIcon name="plus" size={15} color="#FFFFFF" />
            <Text style={styles.btnPrimaryText}>Tambah Anggota</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* FEEDBACK BANNER */}
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
          <TouchableOpacity style={styles.btnRetry} onPress={() => fetchTeamMembers()} activeOpacity={0.7}>
            <Text style={styles.btnRetryText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ========================================== */}
      {/* 2. KARTU STATISTIK RINGKASAN TIM           */}
      {/* ========================================== */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Anggota Tim</Text>
          <Text style={styles.statVal}>{stats.total}</Text>
          <Text style={styles.statSub}>Petugas terdaftar di Supabase</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Petugas Aktif</Text>
          <Text style={[styles.statVal, { color: '#047857' }]}>{stats.active}</Text>
          <Text style={styles.statSub}>Siap menerima alokasi pesan</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Tidak Aktif</Text>
          <Text style={[styles.statVal, { color: '#64748B' }]}>{stats.inactive}</Text>
          <Text style={styles.statSub}>Non-aktif / dinonaktifkan</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Departemen</Text>
          <Text style={[styles.statVal, { color: COLORS.forestDark }]}>{CS_DEPARTMENTS.length}</Text>
          <Text style={styles.statSub}>Pilihan divisi penanganan</Text>
        </View>
      </View>

      {/* ========================================== */}
      {/* 3. RINGKASAN PEMBAGIAN TUGAS DEPARTEMEN    */}
      {/* ========================================== */}
      <View style={styles.deptSummaryCard}>
        <View style={styles.deptSummaryHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppIcon name="team" size={16} color={COLORS.forestDark} />
            <Text style={styles.deptSummaryTitle}>Ringkasan Pembagian Tugas Departemen</Text>
          </View>
          <Text style={styles.deptSummaryHint}>Klik departemen untuk memfilter daftar petugas</Text>
        </View>

        <View style={styles.deptGrid}>
          {deptStats.map((item) => {
            const isSelected = selectedDeptFilter === item.department;
            return (
              <TouchableOpacity
                key={item.department}
                style={[styles.deptItemCard, isSelected && styles.deptItemCardActive]}
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedDeptFilter(isSelected ? 'Semua' : item.department);
                }}
              >
                <View style={styles.deptItemTop}>
                  <Text style={[styles.deptItemName, isSelected && styles.deptItemNameActive]}>
                    {item.department}
                  </Text>
                  {isSelected && (
                    <View style={styles.deptItemActiveBadge}>
                      <Text style={styles.deptItemActiveBadgeText}>Filter</Text>
                    </View>
                  )}
                </View>
                <View style={styles.deptItemNumbers}>
                  <Text style={styles.deptTotalText}>
                    <Text style={{ fontWeight: '700', color: COLORS.textDark }}>{item.total}</Text> Anggota
                  </Text>
                  <Text style={styles.deptActiveText}>
                    • <Text style={{ color: '#047857', fontWeight: '600' }}>{item.active}</Text> Aktif
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ========================================== */}
      {/* 4. BAR PENCARIAN & FILTER                  */}
      {/* ========================================== */}
      <View style={styles.filterSectionCard}>
        {/* Search Bar */}
        <View style={styles.searchBarRow}>
          <View style={styles.searchBox}>
            <AppIcon name="search" size={16} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari berdasarkan nama, email, departemen, atau peran..."
              placeholderTextColor={COLORS.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.trim().length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <AppIcon name="close" size={14} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {isFilterActive && (
            <TouchableOpacity
              style={styles.btnResetFilter}
              onPress={handleResetFilters}
              activeOpacity={0.8}
            >
              <AppIcon name="refresh" size={13} color={COLORS.forestDark} />
              <Text style={styles.btnResetFilterText}>Reset Filter</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills: Departemen */}
        <View style={styles.filterPillGroup}>
          <Text style={styles.filterGroupLabel}>Departemen:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {['Semua', ...CS_DEPARTMENTS].map((dept) => {
              const isSelected = selectedDeptFilter === dept;
              return (
                <TouchableOpacity
                  key={dept}
                  style={[styles.filterChip, isSelected && styles.filterChipActive]}
                  onPress={() => setSelectedDeptFilter(dept)}
                >
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                    {dept}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Filter Pills: Status & Peran */}
        <View style={styles.filterSubRow}>
          <View style={styles.filterPillGroupSub}>
            <Text style={styles.filterGroupLabel}>Status:</Text>
            {['Semua', 'Aktif', 'Tidak Aktif'].map((st) => {
              const isSelected = selectedStatusFilter === st;
              return (
                <TouchableOpacity
                  key={st}
                  style={[styles.filterChip, isSelected && styles.filterChipActive]}
                  onPress={() => setSelectedStatusFilter(st)}
                >
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                    {st}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.filterPillGroupSub}>
            <Text style={styles.filterGroupLabel}>Peran:</Text>
            {['Semua', ...CS_ROLES].map((rl) => {
              const isSelected = selectedRoleFilter === rl;
              return (
                <TouchableOpacity
                  key={rl}
                  style={[styles.filterChip, isSelected && styles.filterChipActive]}
                  onPress={() => setSelectedRoleFilter(rl)}
                >
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                    {rl}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Dynamic Count Indicator */}
        <View style={styles.filterFooterRow}>
          <Text style={styles.filterCountText}>
            Menampilkan <Text style={{ fontWeight: '700', color: COLORS.textDark }}>{filteredMembers.length}</Text> dari{' '}
            <Text style={{ fontWeight: '700', color: COLORS.textDark }}>{teamMembers.length}</Text> anggota tim
          </Text>
        </View>
      </View>

      {/* ========================================== */}
      {/* 5. DAFTAR ANGGOTA (DESKTOP TABEL / MOBILE) */}
      {/* ========================================== */}
      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={COLORS.emerald} />
          <Text style={styles.loadingText}>Memuat data tim CS dari Supabase...</Text>
        </View>
      ) : filteredMembers.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconCircle}>
            <AppIcon name="users" size={26} color={COLORS.forestDark} />
          </View>
          <Text style={styles.emptyTitle}>
            {teamMembers.length === 0 ? 'Belum Ada Anggota Tim CS' : 'Anggota Tim Tidak Ditemukan'}
          </Text>
          <Text style={styles.emptyDesc}>
            {teamMembers.length === 0
              ? 'Organisasi ini belum memiliki anggota tim customer service. Tambahkan anggota pertama untuk mulai mengelola pembagian penanganan percakapan.'
              : 'Tidak ada anggota tim yang cocok dengan kata kunci pencarian atau filter departemen saat ini.'}
          </Text>
          {teamMembers.length === 0 ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={handleOpenAddForm}>
              <AppIcon name="plus" size={15} color="#FFFFFF" />
              <Text style={styles.btnPrimaryText}>Tambah Anggota Pertama</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.btnSecondary} onPress={handleResetFilters}>
              <AppIcon name="refresh" size={14} color={COLORS.forestDark} />
              <Text style={styles.btnSecondaryText}>Reset Filter & Pencarian</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : isDesktop ? (
        /* TABEL DESKTOP */
        <View style={styles.tableWrapper}>
          <View style={styles.tableHeadRow}>
            <Text style={[styles.thCell, { flex: 2.2 }]}>Nama Anggota</Text>
            <Text style={[styles.thCell, { flex: 2.0 }]}>Email</Text>
            <Text style={[styles.thCell, { flex: 1.6 }]}>Departemen</Text>
            <Text style={[styles.thCell, { flex: 1.4 }]}>Peran</Text>
            <Text style={[styles.thCell, { flex: 1.3 }]}>Status</Text>
            <Text style={[styles.thCell, { flex: 1.9, textAlign: 'right' }]}>Aksi</Text>
          </View>

          {filteredMembers.map((member, index) => {
            return (
              <View
                key={member.id}
                style={[
                  styles.tableBodyRow,
                  index % 2 === 1 && styles.tableBodyRowAlt,
                ]}
              >
                {/* Kolom 1: Nama & Avatar */}
                <View style={[styles.tdCell, { flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                  <View style={[styles.avatarCircle, { backgroundColor: getAvatarBg(member.fullName) }]}>
                    <Text style={styles.avatarText}>{getInitials(member.fullName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberNameText} numberOfLines={1}>
                      {member.fullName}
                    </Text>
                    {member.createdAt ? (
                      <Text style={styles.memberDateText}>Terdaftar {member.createdAt}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Kolom 2: Email & WhatsApp */}
                <View style={[styles.tdCell, { flex: 2.0 }]}>
                  <Text style={styles.emailText} numberOfLines={1}>
                    {member.email ? member.email : 'Belum ada email'}
                  </Text>
                  {member.phone ? (
                    <Text style={{ fontSize: 10, color: '#16A36A', marginTop: 2, fontWeight: '600' }} numberOfLines={1}>
                      WA: +{member.phone}
                    </Text>
                  ) : null}
                </View>

                {/* Kolom 3: Departemen */}
                <View style={[styles.tdCell, { flex: 1.6 }]}>
                  <CsDepartmentBadge department={member.department} />
                </View>

                {/* Kolom 4: Peran */}
                <View style={[styles.tdCell, { flex: 1.4 }]}>
                  <CsRoleBadge role={member.role} />
                </View>

                {/* Kolom 5: Status */}
                <View style={[styles.tdCell, { flex: 1.3 }]}>
                  <CsStatusBadge isActive={member.isActive} />
                </View>

                {/* Kolom 6: Aksi */}
                <View style={[styles.tdCell, { flex: 1.9, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }]}>
                  <TouchableOpacity
                    style={styles.actionIconBtn}
                    onPress={() => {
                      setActiveMember(member);
                      setIsDetailModalOpen(true);
                    }}
                    accessibilityLabel="Lihat Detail"
                  >
                    <AppIcon name="user" size={14} color={COLORS.forestDark} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionIconBtn}
                    onPress={() => handleOpenEditForm(member)}
                    accessibilityLabel="Edit Anggota"
                  >
                    <AppIcon name="edit" size={14} color={COLORS.forestDark} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionIconBtn,
                      member.isActive ? styles.actionIconBtnDanger : styles.actionIconBtnSuccess,
                    ]}
                    onPress={() => handleOpenDeactivateModal(member)}
                    accessibilityLabel={member.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  >
                    <AppIcon
                      name={member.isActive ? 'close' : 'check'}
                      size={13}
                      color={member.isActive ? '#DC2626' : '#047857'}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionIconBtn, styles.actionIconBtnDanger]}
                    onPress={() => handleOpenDeleteModal(member)}
                    accessibilityLabel="Hapus Anggota"
                  >
                    <AppIcon name="trash" size={13} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        /* KARTU MOBILE */
        <View style={styles.mobileCardList}>
          {filteredMembers.map((member) => {
            return (
              <View key={member.id} style={styles.mobileCard}>
                <View style={styles.mobileCardTop}>
                  <View style={[styles.avatarCircle, { backgroundColor: getAvatarBg(member.fullName) }]}>
                    <Text style={styles.avatarText}>{getInitials(member.fullName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberNameText} numberOfLines={1}>
                      {member.fullName}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <CsRoleBadge role={member.role} />
                      <CsStatusBadge isActive={member.isActive} />
                    </View>
                  </View>
                </View>

                <View style={styles.mobileCardBody}>
                  <View style={styles.mobileInfoRow}>
                    <Text style={styles.mobileInfoLabel}>Departemen:</Text>
                    <CsDepartmentBadge department={member.department} />
                  </View>

                  <View style={styles.mobileInfoRow}>
                    <Text style={styles.mobileInfoLabel}>Email:</Text>
                    <Text style={styles.emailText}>{member.email || 'Belum ada email'}</Text>
                  </View>

                  <View style={styles.mobileInfoRow}>
                    <Text style={styles.mobileInfoLabel}>WhatsApp:</Text>
                    <Text style={{ fontSize: 11, color: member.phone ? '#16A36A' : COLORS.textMuted, fontWeight: '600' }}>
                      {member.phone ? `+${member.phone}` : 'Belum diisi'}
                    </Text>
                  </View>
                </View>

                <View style={styles.mobileCardActions}>
                  <TouchableOpacity
                    style={styles.mobileBtnSecondary}
                    onPress={() => {
                      setActiveMember(member);
                      setIsDetailModalOpen(true);
                    }}
                  >
                    <AppIcon name="user" size={13} color={COLORS.forestDark} />
                    <Text style={styles.mobileBtnSecondaryText}>Detail</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.mobileBtnSecondary}
                    onPress={() => handleOpenEditForm(member)}
                  >
                    <AppIcon name="edit" size={13} color={COLORS.forestDark} />
                    <Text style={styles.mobileBtnSecondaryText}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.mobileBtnSecondary,
                      member.isActive ? styles.mobileBtnDanger : styles.mobileBtnSuccess,
                    ]}
                    onPress={() => handleOpenDeactivateModal(member)}
                  >
                    <AppIcon
                      name={member.isActive ? 'close' : 'check'}
                      size={13}
                      color={member.isActive ? '#DC2626' : '#047857'}
                    />
                    <Text
                      style={
                        member.isActive ? styles.mobileBtnDangerText : styles.mobileBtnSuccessText
                      }
                    >
                      {member.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.mobileBtnSecondary, styles.mobileBtnDanger]}
                    onPress={() => handleOpenDeleteModal(member)}
                  >
                    <AppIcon name="trash" size={13} color="#DC2626" />
                    <Text style={styles.mobileBtnDangerText}>Hapus</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ========================================== */}
      {/* 6. MODAL FORM: TAMBAH & EDIT ANGGOTA       */}
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

          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {activeMember ? 'Edit Data Anggota Tim CS' : 'Tambah Anggota Tim CS Baru'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {activeMember
                    ? 'Perbarui informasi identitas, divisi tugas, peran, atau status keaktifan.'
                    : 'Daftarkan petugas customer service baru ke tabel team_members Supabase.'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsFormModalOpen(false)}
              >
                <AppIcon name="close" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Error Message Alert */}
            {formError && (
              <View style={styles.formErrorBox}>
                <AppIcon name="alert" size={15} color="#DC2626" />
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            )}

            <ScrollView style={styles.modalFormScroll} contentContainerStyle={{ gap: 14 }}>
              {/* Nama Lengkap */}
              <View>
                <Text style={styles.formLabel}>
                  Nama Lengkap Petugas <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TextInput
                  style={styles.formInput}
                  value={formFullName}
                  onChangeText={(val) => {
                    setFormFullName(val);
                    if (formError) setFormError(null);
                  }}
                  placeholder="Contoh: Siti Aisyah, S.Kom"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              {/* Email */}
              <View>
                <Text style={styles.formLabel}>
                  Alamat Email Resmi <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TextInput
                  style={styles.formInput}
                  value={formEmail}
                  onChangeText={(val) => {
                    setFormEmail(val);
                    if (formError) setFormError(null);
                  }}
                  placeholder="nama@perusahaan.com"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Nomor WhatsApp CS */}
              <View>
                <Text style={styles.formLabel}>
                  Nomor WhatsApp Petugas {formDept === 'Pendaftaran / PSB' ? <Text style={styles.requiredStar}>* (Wajib untuk Handoff PSB)</Text> : '(Opsional)'}
                </Text>
                <TextInput
                  style={styles.formInput}
                  value={formPhone}
                  onChangeText={(val) => {
                    setFormPhone(val);
                    if (formError) setFormError(null);
                  }}
                  placeholder="Contoh: 085641886993 atau +6285641886993"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Departemen */}
              <View>
                <Text style={styles.formLabel}>
                  Departemen Tugas <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View style={styles.radioGrid}>
                  {CS_DEPARTMENTS.map((dept) => {
                    const isSelected = formDept === dept;
                    return (
                      <TouchableOpacity
                        key={dept}
                        style={[styles.radioItem, isSelected && styles.radioItemActive]}
                        onPress={() => setFormDept(dept)}
                      >
                        <View style={[styles.radioDot, isSelected && styles.radioDotActive]}>
                          {isSelected && <View style={styles.radioDotInner} />}
                        </View>
                        <Text style={[styles.radioText, isSelected && styles.radioTextActive]}>
                          {dept}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Peran / Jabatan */}
              <View>
                <Text style={styles.formLabel}>
                  Peran / Wewenang <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View style={styles.rolePickerRow}>
                  {CS_ROLES.map((r) => {
                    const isSelected = formRole === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[styles.rolePickerCard, isSelected && styles.rolePickerCardActive]}
                        onPress={() => setFormRole(r)}
                      >
                        <View style={[styles.radioDot, isSelected && styles.radioDotActive]}>
                          {isSelected && <View style={styles.radioDotInner} />}
                        </View>
                        <Text style={[styles.rolePickerText, isSelected && styles.rolePickerTextActive]}>
                          {r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Status Keaktifan */}
              <View>
                <Text style={styles.formLabel}>
                  Status Keaktifan <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View style={styles.statusPickerRow}>
                  <TouchableOpacity
                    style={[styles.statusPickerCard, formIsActive && styles.statusPickerCardActive]}
                    onPress={() => setFormIsActive(true)}
                  >
                    <View style={[styles.radioDot, formIsActive && styles.radioDotActive]}>
                      {formIsActive && <View style={styles.radioDotInner} />}
                    </View>
                    <Text style={[styles.statusPickerText, formIsActive && styles.statusPickerTextActive]}>
                      Aktif
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusPickerCard, !formIsActive && styles.statusPickerCardActive]}
                    onPress={() => setFormIsActive(false)}
                  >
                    <View style={[styles.radioDot, !formIsActive && styles.radioDotActive]}>
                      {!formIsActive && <View style={styles.radioDotInner} />}
                    </View>
                    <Text style={[styles.statusPickerText, !formIsActive && styles.statusPickerTextActive]}>
                      Tidak Aktif
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={() => setIsFormModalOpen(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.btnCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnPrimary, isSubmitting && styles.btnPrimaryDisabled]}
                onPress={handleSaveMember}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <AppIcon name="check" size={15} color="#FFFFFF" />
                    <Text style={styles.btnPrimaryText}>
                      {activeMember ? 'Simpan Perubahan' : 'Tambahkan Anggota'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 7. MODAL DETAIL ANGGOTA                    */}
      {/* ========================================== */}
      <Modal
        visible={isDetailModalOpen && activeMember !== null}
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

          {activeMember && (
            <View style={[styles.modalCard, { maxWidth: 520 }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={[
                      styles.avatarCircleLarge,
                      { backgroundColor: getAvatarBg(activeMember.fullName) },
                    ]}
                  >
                    <Text style={styles.avatarTextLarge}>{getInitials(activeMember.fullName)}</Text>
                  </View>
                  <View>
                    <Text style={styles.modalTitle}>{activeMember.fullName}</Text>
                    <Text style={styles.modalSubtitle}>{activeMember.email || 'Email belum diisi'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setIsDetailModalOpen(false)}
                >
                  <AppIcon name="close" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.detailBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Departemen:</Text>
                  <CsDepartmentBadge department={activeMember.department} />
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Nomor WhatsApp:</Text>
                  <Text style={[styles.detailValue, { color: activeMember.phone ? '#16A36A' : COLORS.textMuted, fontWeight: '700' }]}>
                    {activeMember.phone ? `+${activeMember.phone}` : 'Belum diisi'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Peran Organisasi:</Text>
                  <CsRoleBadge role={activeMember.role} />
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status Keaktifan:</Text>
                  <CsStatusBadge isActive={activeMember.isActive} />
                </View>

                {activeMember.createdAt ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Terdaftar Sejak:</Text>
                    <Text style={styles.detailValue}>{activeMember.createdAt}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => setIsDetailModalOpen(false)}
                >
                  <Text style={styles.btnSecondaryText}>Tutup</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnActionDelete}
                  onPress={() => {
                    handleOpenDeleteModal(activeMember);
                  }}
                >
                  <AppIcon name="trash" size={14} color="#DC2626" />
                  <Text style={styles.btnActionDeleteText}>Hapus</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => handleOpenEditForm(activeMember)}
                >
                  <AppIcon name="edit" size={14} color="#FFFFFF" />
                  <Text style={styles.btnPrimaryText}>Edit Anggota</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 8. MODAL NONAKTIFKAN / AKTIFKAN ANGGOTA    */}
      {/* ========================================== */}
      <Modal
        visible={isDeactivateModalOpen && activeMember !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDeactivateModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setIsDeactivateModalOpen(false)}
          />

          {activeMember && (
            <View style={[styles.modalCard, { maxWidth: 440 }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={[
                      styles.iconCircleWarning,
                      activeMember.isActive ? styles.bgDangerLight : styles.bgSuccessLight,
                    ]}
                  >
                    <AppIcon
                      name={activeMember.isActive ? 'alert' : 'check'}
                      size={18}
                      color={activeMember.isActive ? '#DC2626' : '#047857'}
                    />
                  </View>
                  <View>
                    <Text style={styles.modalTitle}>
                      {activeMember.isActive ? 'Nonaktifkan Anggota Tim?' : 'Aktifkan Kembali Anggota?'}
                    </Text>
                    <Text style={styles.modalSubtitle}>Konfirmasi perubahan status keaktifan</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setIsDeactivateModalOpen(false)}
                >
                  <AppIcon name="close" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={styles.confirmText}>
                {activeMember.isActive ? (
                  <>
                    Apakah Anda yakin ingin menonaktifkan akun petugas{' '}
                    <Text style={{ fontWeight: '700', color: COLORS.textDark }}>
                      {activeMember.fullName}
                    </Text>
                    ? Petugas tidak akan menerima alokasi antrean percakapan baru sampai diaktifkan kembali.
                  </>
                ) : (
                  <>
                    Apakah Anda ingin mengaktifkan kembali petugas{' '}
                    <Text style={{ fontWeight: '700', color: COLORS.textDark }}>
                      {activeMember.fullName}
                    </Text>
                    ? Petugas akan dapat menerima kembali pembagian tugas dan antrean percakapan.
                  </>
                )}
              </Text>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={() => setIsDeactivateModalOpen(false)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.btnCancelText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.btnPrimary,
                    activeMember.isActive ? styles.btnDanger : styles.btnSuccess,
                    isSubmitting && styles.btnPrimaryDisabled,
                  ]}
                  onPress={handleToggleActiveStatus}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>
                      {activeMember.isActive ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ========================================== */}
      {/* 9. MODAL KONFIRMASI HAPUS ANGGOTA TIM      */}
      {/* ========================================== */}
      <Modal
        visible={isDeleteModalOpen && memberToDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCancelDelete}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={handleCancelDelete}
          />

          {memberToDelete && (
            <View style={[styles.modalCard, { maxWidth: 460 }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.iconCircleWarning, styles.bgDangerLight]}>
                    <AppIcon name="trash" size={18} color="#DC2626" />
                  </View>
                  <View>
                    <Text style={styles.modalTitle}>Hapus Anggota Tim CS?</Text>
                    <Text style={styles.modalSubtitle}>Konfirmasi penghapusan anggota tim organisasi</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={handleCancelDelete}
                  disabled={isDeleting}
                >
                  <AppIcon name="close" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Kartu Informasi Anggota yang Akan Dihapus */}
              <View style={styles.deleteMemberCard}>
                <View
                  style={[
                    styles.avatarCircle,
                    { backgroundColor: getAvatarBg(memberToDelete.fullName), width: 38, height: 38, borderRadius: 19 },
                  ]}
                >
                  <Text style={styles.avatarText}>{getInitials(memberToDelete.fullName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deleteMemberName} numberOfLines={1}>
                    {memberToDelete.fullName}
                  </Text>
                  <Text style={styles.deleteMemberEmail} numberOfLines={1}>
                    {memberToDelete.email || 'Email belum diisi'}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <CsDepartmentBadge department={memberToDelete.department} />
                    <CsRoleBadge role={memberToDelete.role} />
                  </View>
                </View>
              </View>

              {/* Disclaimer / Catatan Keamanan */}
              <View style={styles.deleteDisclaimerBox}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <AppIcon name="alert" size={14} color="#D97706" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deleteDisclaimerTitle}>Cakupan Penghapusan:</Text>
                    <Text style={styles.deleteDisclaimerText}>
                      • Menghapus profil petugas ini dari daftar tim CS organisasi.{'\n'}
                      • Tindakan ini <Text style={{ fontWeight: '700' }}>TIDAK</Text> menghapus riwayat percakapan pelanggan yang pernah dialokasikan ke petugas ini (seluruh pesan dan data kontak tetap aman tersimpan).
                    </Text>
                  </View>
                </View>
              </View>

              {deleteError && (
                <View style={styles.formErrorBox}>
                  <AppIcon name="alert" size={14} color="#DC2626" />
                  <Text style={styles.formErrorText}>{deleteError}</Text>
                </View>
              )}

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.btnCancel}
                  onPress={handleCancelDelete}
                  disabled={isDeleting}
                >
                  <Text style={styles.btnCancelText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.btnPrimary, styles.btnDanger, isDeleting && styles.btnPrimaryDisabled]}
                  onPress={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.btnPrimaryText}>Menghapus...</Text>
                    </View>
                  ) : (
                    <Text style={styles.btnPrimaryText}>Ya, Hapus Anggota</Text>
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
// STYLESHEET RESMI B2B SAAS
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
    flexWrap: 'wrap',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  memberCountPill: {
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  memberCountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  userRolePill: {
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderWidth: 1,
  },
  userRoleAdmin: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  userRoleMember: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  userRoleText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // FEEDBACK BANNER
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  feedbackSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
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
  errorBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  btnRetryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },

  // STATS
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginBottom: 6,
  },
  statVal: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  statSub: {
    fontSize: 11,
    color: COLORS.textMuted,
  },

  // DEPARTEMEN SUMMARY
  deptSummaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    gap: 14,
  },
  deptSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  deptSummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  deptSummaryHint: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  deptGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  deptItemCard: {
    flex: 1,
    minWidth: 170,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    padding: 12,
    gap: 6,
  },
  deptItemCardActive: {
    borderColor: COLORS.emerald,
    backgroundColor: COLORS.emeraldSubtle,
  },
  deptItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deptItemName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
    flex: 1,
  },
  deptItemNameActive: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },
  deptItemActiveBadge: {
    backgroundColor: COLORS.emerald,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  deptItemActiveBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  deptItemNumbers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deptTotalText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  deptActiveText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },

  // FILTER & SEARCH
  filterSectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  searchBarRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textDark,
    paddingVertical: 0,
  },
  btnResetFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 12,
    height: 40,
    gap: 6,
  },
  btnResetFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.forestDark,
  },
  filterPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterGroupLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterSubRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    alignItems: 'center',
  },
  filterPillGroupSub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
  },
  filterChipActive: {
    backgroundColor: COLORS.emeraldSubtle,
    borderColor: COLORS.emeraldBorder,
  },
  filterChipText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },
  filterFooterRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  filterCountText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // LOADING & EMPTY
  loadingBox: {
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  emptyDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 18,
    marginBottom: 8,
  },

  // TABEL DESKTOP
  tableWrapper: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  thCell: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tableBodyRowAlt: {
    backgroundColor: '#FAFCFB',
  },
  tdCell: {
    justifyContent: 'center',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  memberNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  memberDateText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  emailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  actionIconBtnDanger: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  actionIconBtnSuccess: {
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },

  // MOBILE CARDS
  mobileCardList: {
    gap: 12,
  },
  mobileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 12,
  },
  mobileCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mobileCardBody: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    gap: 6,
  },
  mobileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mobileInfoLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  mobileCardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  mobileBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
    gap: 5,
  },
  mobileBtnSecondaryText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  mobileBtnDanger: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  mobileBtnDangerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  mobileBtnSuccess: {
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },
  mobileBtnSuccessText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },

  // BADGES
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
    alignSelf: 'flex-start',
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
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  deptBadge: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  deptBadgeText: {
    fontSize: 11,
    color: COLORS.textDark,
    fontWeight: '500',
  },

  // BUTTONS
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emerald,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  btnPrimaryDisabled: {
    backgroundColor: COLORS.borderStrong,
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  btnSecondaryText: {
    color: COLORS.textDark,
    fontSize: 12,
    fontWeight: '600',
  },
  btnCancel: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
  },
  btnCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  btnDanger: {
    backgroundColor: '#DC2626',
  },
  btnSuccess: {
    backgroundColor: '#047857',
  },

  // MODALS
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
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  modalSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 12,
  },
  formErrorText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  modalFormScroll: {
    maxHeight: 380,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 6,
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
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.textDark,
  },
  radioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
  },
  radioItemActive: {
    backgroundColor: COLORS.emeraldSubtle,
    borderColor: COLORS.emeraldBorder,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
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
  radioText: {
    fontSize: 11,
    color: COLORS.textDark,
  },
  radioTextActive: {
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  rolePickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rolePickerCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  rolePickerCardActive: {
    backgroundColor: COLORS.emeraldSubtle,
    borderColor: COLORS.emeraldBorder,
  },
  rolePickerText: {
    fontSize: 11,
    color: COLORS.textDark,
  },
  rolePickerTextActive: {
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  statusPickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusPickerCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  statusPickerCardActive: {
    backgroundColor: COLORS.emeraldSubtle,
    borderColor: COLORS.emeraldBorder,
  },
  statusPickerText: {
    fontSize: 12,
    color: COLORS.textDark,
  },
  statusPickerTextActive: {
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },

  // MODAL DETAIL
  avatarCircleLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTextLarge: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  detailBody: {
    paddingVertical: 12,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 12,
    color: COLORS.textDark,
    fontWeight: '600',
  },

  // MODAL KONFIRMASI
  iconCircleWarning: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bgDangerLight: {
    backgroundColor: '#FEE2E2',
  },
  bgSuccessLight: {
    backgroundColor: '#ECFDF5',
  },
  confirmText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginVertical: 12,
  },

  // HAPUS ANGGOTA TIM
  btnActionDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  btnActionDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  deleteMemberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    marginBottom: 12,
  },
  deleteMemberName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  deleteMemberEmail: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  deleteDisclaimerBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  deleteDisclaimerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 4,
  },
  deleteDisclaimerText: {
    fontSize: 11,
    color: '#78350F',
    lineHeight: 16,
  },
});
