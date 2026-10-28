import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS, AppIcon } from '../theme';
import { Contact } from './ContactsView';
import {
  sendWhatsAppMessage,
  retryRegistrationHandoffClient,
  deleteConversationClient,
} from '../lib/whatsappClient';

// ==========================================
// TIPE DATA PERCAKAPAN & PESAN SUPABASE
// ==========================================
// Database constraint conversations_status_check: ('open', 'pending', 'resolved')
export type ConversationStatus = 'open' | 'pending' | 'resolved';
export type FilterTab = 'all' | 'unread' | 'pending' | 'resolved';
export type MessageSender = 'customer' | 'cs' | 'ai' | 'system';

export interface ChatMessage {
  id: string;
  sender: MessageSender;
  senderName: string;
  text: string;
  time: string;
  createdAt?: string;
}

export interface Conversation {
  id: string;
  organizationId?: string;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  name: string;
  phone: string;
  avatarText: string;
  avatarBg: string;
  status: ConversationStatus;
  unreadCount: number;
  lastTime: string;
  lastSnippet: string;
  tag: string;
  messages: ChatMessage[];
  isDemo?: boolean;
  handoffStatus?: 'none' | 'pending' | 'sent' | 'failed';
  handoffDepartment?: string;
  handoffNotifiedAt?: string;
  handoffSummary?: string;
  handoffError?: string;
  handoffCsPhone?: string;
  assignedToName?: string;
}

// ==========================================
// DATA DEMO AWAL (JELAS DITANDAI SEBAGAI SIMULASI)
// ==========================================
export const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_1',
    name: 'Budi Santoso',
    phone: '+62 812-9821-4433 (Demo)',
    avatarText: 'BS',
    avatarBg: '#059669',
    status: 'pending',
    unreadCount: 1,
    lastTime: '10:42',
    lastSnippet: 'Boleh, tolong hubungkan saya dengan sales atau CS manusia ya kak.',
    tag: 'Prospek Enterprise',
    isDemo: true,
    messages: [
      {
        id: 'm1_1',
        sender: 'customer',
        senderName: 'Budi Santoso',
        text: 'Halo WABiz, saya mau menanyakan paket langganan enterprise untuk 15 agen CS, apakah ada demo produk?',
        time: '10:40',
      },
      {
        id: 'm1_2',
        sender: 'ai',
        senderName: 'Chatbot AI WABiz',
        text: 'Halo Kak Budi! Terima kasih telah menghubungi WABiz. Untuk paket Enterprise 15 agen, kami menyediakan sesi konsultasi dan live demo bersama tim spesialis kami. Apakah ingin dijadwalkan hari ini?',
        time: '10:41',
      },
      {
        id: 'm1_3',
        sender: 'customer',
        senderName: 'Budi Santoso',
        text: 'Boleh, tolong hubungkan saya dengan sales atau CS manusia ya kak.',
        time: '10:42',
      },
      {
        id: 'm1_4',
        sender: 'system',
        senderName: 'Sistem WABiz',
        text: 'Eskalasi Otomatis: Pelanggan meminta bantuan CS manusia. Menunggu alokasi agen.',
        time: '10:42',
      },
    ],
  },
  {
    id: 'conv_2',
    name: 'Rina Marlina',
    phone: '+62 857-1122-3344 (Demo)',
    avatarText: 'RM',
    avatarBg: '#4F46E5',
    status: 'pending',
    unreadCount: 0,
    lastTime: '09:15',
    lastSnippet: 'Selamat pagi Kak Rina! Layanan kami buka Senin - Jumat pukul 08.00 - 18.00 WIB.',
    tag: 'Info Operasional',
    isDemo: true,
    messages: [
      {
        id: 'm2_1',
        sender: 'customer',
        senderName: 'Rina Marlina',
        text: 'Pagi kak, apakah kantor dan layanan buka hari Sabtu ini?',
        time: '09:14',
      },
      {
        id: 'm2_2',
        sender: 'ai',
        senderName: 'Chatbot AI WABiz',
        text: 'Selamat pagi Kak Rina! Layanan kami buka Senin - Jumat pukul 08.00 - 18.00 WIB. Hari Sabtu dan Minggu bot AI kami tetap aktif menjawab pertanyaan produk dan katalog.',
        time: '09:15',
      },
    ],
  },
];

// Template Cepat (Canned Responses)
const QUICK_REPLIES = [
  'Halo, ada yang bisa kami bantu hari ini?',
  'Mohon tunggu sebentar, kami sedang memeriksa datanya.',
  'Terima kasih telah menghubungi layanan pelanggan WABiz.',
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

// Helper inisial nama (2 huruf)
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'WB';
}

// Normalisasi status database: memastikan hanya nilai 'open' | 'pending' | 'resolved'
export function normalizeConversationStatus(raw: string | null | undefined): ConversationStatus {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'resolved' || s === 'closed') {
    return 'resolved';
  }
  if (s === 'pending' || s === 'waiting_cs' || s === 'ai') {
    return 'pending';
  }
  return 'open';
}

// Helper terjemahan error Supabase ke Bahasa Indonesia
export function translateConversationError(errMsg: string): string {
  const lower = errMsg.toLowerCase();
  if (lower.includes('duplicate') || lower.includes('unique') || lower.includes('23505')) {
    return 'Percakapan untuk kontak ini sudah terdaftar dalam organisasi.';
  }
  if (lower.includes('conversations_status_check') || lower.includes('check constraint')) {
    return 'Status percakapan tidak valid untuk database (hanya menerima open, pending, resolved).';
  }
  if (lower.includes('permission denied') || lower.includes('policy') || lower.includes('42501')) {
    return 'Akses ditolak oleh kebijakan keamanan (RLS). Pastikan Anda adalah anggota organisasi aktif.';
  }
  if (lower.includes('foreign key') || lower.includes('violates foreign key')) {
    return 'Kontak atau organisasi tidak valid.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection')) {
    return 'Gagal terhubung ke database Supabase. Periksa koneksi internet Anda.';
  }
  return errMsg || 'Terjadi kendala saat memproses percakapan.';
}

/**
 * Memformat nomor telepon dengan masking karakter tengah untuk privasi.
 * Contoh: '+62 812-9821-4433' -> '+6281****4433'
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const clean = String(phone).trim();
  const digits = clean.replace(/\D/g, '');
  if (digits.length <= 4) {
    return clean;
  }
  const prefix = clean.startsWith('+') ? '+' : '';
  if (digits.length <= 8) {
    return prefix + digits.slice(0, 3) + '****' + digits.slice(-2);
  }
  return prefix + digits.slice(0, 4) + '****' + digits.slice(-4);
}

// Helper mapping pesan Supabase ke ChatMessage
export function mapDbMessageToChatMessage(
  row: { id: string; sender_type: string; body: string; created_at: string; sent_at?: string | null },
  contactName: string,
  agentName: string
): ChatMessage {
  const timeStr = row.created_at
    ? new Date(row.created_at).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  let sender: MessageSender = 'customer';
  let senderName = contactName || 'Pelanggan';

  const st = (row.sender_type || '').toLowerCase();
  if (st === 'agent' || st === 'cs') {
    sender = 'cs';
    senderName = agentName ? `CS (${agentName})` : 'CS (Agen WABiz)';
  } else if (st === 'ai' || st === 'bot') {
    sender = 'ai';
    senderName = 'Chatbot AI WABiz';
  } else if (st === 'system') {
    sender = 'system';
    senderName = 'Sistem WABiz';
  } else {
    sender = 'customer';
    senderName = contactName || 'Pelanggan';
  }

  return {
    id: row.id,
    sender,
    senderName,
    text: row.body,
    time: timeStr,
    createdAt: row.created_at,
  };
}

// ==========================================
// KOMPONEN BADGE STATUS PENANGANAN
// ==========================================
export function StatusBadge({ status }: { status: ConversationStatus | string }) {
  const normalized = normalizeConversationStatus(status);
  switch (normalized) {
    case 'open':
      return (
        <View style={styles.badgeHandling}>
          <View style={styles.dotHandling} />
          <Text style={styles.badgeHandlingText}>Ditangani CS</Text>
        </View>
      );
    case 'pending':
      return (
        <View style={styles.badgeWaiting}>
          <View style={styles.dotWaiting} />
          <Text style={styles.badgeWaitingText}>Menunggu Tindak Lanjut</Text>
        </View>
      );
    case 'resolved':
      return (
        <View style={styles.badgeResolved}>
          <Text style={styles.badgeResolvedText}>✓ Selesai</Text>
        </View>
      );
  }
}

export type NavDestination = 'dashboard' | 'chat' | 'users' | 'campaign' | 'bot' | 'team' | 'settings';

export interface ConversationsViewProps {
  organizationId?: string;
  currentUserId?: string;
  currentUserFullName?: string;
  contacts?: Contact[];
  conversations?: Conversation[];
  setConversations?: React.Dispatch<React.SetStateAction<Conversation[]>>;
  selectedId?: string | null;
  setSelectedId?: React.Dispatch<React.SetStateAction<string | null>>;
  isDesktop: boolean;
  onNavigate?: (page: NavDestination) => void;
  onConversationDeleted?: (deletedConv: Conversation) => void;
  onConversationUpdated?: () => void;
}

// ==========================================
// KOMPONEN UTAMA HALAMAN PERCAKAPAN
// ==========================================
export function ConversationsView({
  organizationId,
  currentUserId: _currentUserId,
  currentUserFullName,
  contacts: externalContacts,
  conversations: externalConversations,
  setConversations: externalSetConversations,
  selectedId: externalSelectedId,
  setSelectedId: externalSetSelectedId,
  isDesktop,
  onNavigate,
  onConversationDeleted,
  onConversationUpdated,
}: ConversationsViewProps) {
  const [internalConversations, setInternalConversations] = useState<Conversation[]>([]);
  const conversations = externalConversations ?? internalConversations;
  const setConversations = externalSetConversations ?? setInternalConversations;

  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId;
  const setSelectedId = externalSetSelectedId ?? setInternalSelectedId;

  // Supabase Organization State (Single Source of Truth dari App.tsx)
  const effectiveOrgId = organizationId;

  // Async States
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(Boolean(organizationId));
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [sendSuccessNotice, setSendSuccessNotice] = useState<string | null>(null);
  const [isRetryingHandoff, setIsRetryingHandoff] = useState<boolean>(false);
  const [retryHandoffError, setRetryHandoffError] = useState<string | null>(null);
  const [retryHandoffNotice, setRetryHandoffNotice] = useState<string | null>(null);

  // Filters & Search
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');

  // Modal Mulai Percakapan Baru
  const [isNewConvModalOpen, setIsNewConvModalOpen] = useState(false);
  const [orgContacts, setOrgContacts] = useState<Contact[]>([]);
  const [isLoadingOrgContacts, setIsLoadingOrgContacts] = useState(false);
  const [selectedContactForNew, setSelectedContactForNew] = useState<Contact | null>(null);
  const [newConvInitialMessage, setNewConvInitialMessage] = useState('');
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [createConvError, setCreateConvError] = useState<string | null>(null);
  const [isSubmittingNewConv, setIsSubmittingNewConv] = useState(false);

  // Modal Konfirmasi Hapus Percakapan
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccessNotice, setDeleteSuccessNotice] = useState<string | null>(null);
  const hasUserClosedDetailRef = React.useRef(false);

  // Muat Daftar Percakapan dari Supabase public.conversations
  const fetchConversations = useCallback(
    async (orgId?: string, silent = false) => {
      const targetOrgId = orgId || effectiveOrgId;
      if (!targetOrgId) {
        if (!silent) {
          setIsLoadingConversations(false);
          setFetchError('Organisasi belum dipilih atau tidak aktif. Silakan pilih workspace Anda.');
        }
        return;
      }

      if (!silent) {
        setIsLoadingConversations(true);
        setFetchError(null);
      }

      try {
        const { data: convData, error: convError } = await supabase
          .from('conversations')
          .select(`
            id,
            organization_id,
            contact_id,
            assigned_to,
            status,
            handoff_status,
            handoff_department,
            handoff_notified_at,
            handoff_summary,
            handoff_error,
            handoff_cs_phone,
            last_message_at,
            created_at,
            updated_at,
            contacts (
              id,
              name,
              phone,
              email,
              labels
            ),
            team_members (
              id,
              full_name,
              department,
              phone
            )
          `)
          .eq('organization_id', targetOrgId)
          .order('last_message_at', { ascending: false });

        if (convError) {
          console.error('Error fetching conversations:', convError.message);
          if (!silent) setFetchError(translateConversationError(convError.message));
          return;
        }

        if (convData) {
          // Ambil cuplikan pesan terakhir untuk snippet preview
          const { data: recentMsgs } = await supabase
            .from('messages')
            .select('id, conversation_id, body, created_at, sender_type')
            .eq('organization_id', targetOrgId)
            .order('created_at', { ascending: false })
            .limit(100);

          const latestMsgMap: Record<string, { body: string; created_at: string }> = {};
          if (recentMsgs) {
            for (const m of recentMsgs) {
              if (!latestMsgMap[m.conversation_id]) {
                latestMsgMap[m.conversation_id] = { body: m.body, created_at: m.created_at };
              }
            }
          }

          setConversations((prev) => {
            const mapped: Conversation[] = convData.map((row) => {
              const contactObj = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
              const name = contactObj?.name || 'Kontak Tanpa Nama';
              const phone = contactObj?.phone || '-';
              const avatarText = getInitials(name);
              const avatarBg = getAvatarBg(name);

              const status = normalizeConversationStatus(row.status);

              const latestMsg = latestMsgMap[row.id];
              const displayTime = latestMsg?.created_at
                ? new Date(latestMsg.created_at).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : row.last_message_at
                ? new Date(row.last_message_at).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';

              const displaySnippet = latestMsg?.body || 'Belum ada pesan';
              const tag = (Array.isArray(contactObj?.labels) && contactObj.labels[0]) || 'WhatsApp Kontak';

              // Pertahankan riwayat pesan yang sudah dimuat sebelumnya
              const existingConv = prev.find((c) => c.id === row.id);
              const existingMessages = existingConv?.messages || [];
              const teamMemberObj = Array.isArray(row.team_members) ? row.team_members[0] : row.team_members;
              const assignedToName = teamMemberObj?.full_name;

              return {
                id: row.id,
                organizationId: row.organization_id,
                contactId: row.contact_id,
                contactName: name,
                contactPhone: phone,
                name,
                phone,
                avatarText,
                avatarBg,
                status,
                unreadCount: existingConv ? existingConv.unreadCount : 0,
                lastTime: displayTime,
                lastSnippet: displaySnippet,
                tag,
                messages: existingMessages,
                isDemo: false,
                handoffStatus: row.handoff_status || 'none',
                handoffDepartment: row.handoff_department || teamMemberObj?.department,
                handoffNotifiedAt: row.handoff_notified_at
                  ? new Date(row.handoff_notified_at).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : undefined,
                handoffSummary: row.handoff_summary || undefined,
                handoffError: row.handoff_error || undefined,
                handoffCsPhone: row.handoff_cs_phone || teamMemberObj?.phone,
                assignedToName,
              };
            });

            return mapped;
          });

          // Pada desktop jika belum ada percakapan terpilih, pilih percakapan pertama
          if (isDesktop && convData.length > 0) {
            setSelectedId((prev) => prev || convData[0].id);
          }
        }
      } catch (err: unknown) {
        if (!silent) {
          const msg = err instanceof Error ? err.message : '';
          setFetchError(translateConversationError(msg));
        }
      } finally {
        if (!silent) {
          setIsLoadingConversations(false);
        }
      }
    },
    [effectiveOrgId, isDesktop, setConversations, setSelectedId]
  );

  // Muat Pesan untuk Percakapan Tertentu
  const fetchMessages = useCallback(
    async (convId: string, silent = false) => {
      if (!convId || !effectiveOrgId) return;

      if (!silent) {
        setIsLoadingMessages(true);
        setMessageError(null);
      }

      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id, conversation_id, organization_id, sender_type, body, created_at, sent_at')
          .eq('conversation_id', convId)
          .eq('organization_id', effectiveOrgId)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error fetching messages:', error.message);
          if (!silent) setMessageError(translateConversationError(error.message));
          return;
        }

        if (data) {
          setConversations((prev) => {
            const targetConv = prev.find((c) => c.id === convId);
            const contactName = targetConv?.name || 'Pelanggan';
            const mapped = data.map((m) =>
              mapDbMessageToChatMessage(m, contactName, currentUserFullName || 'Ahmad Fauzi')
            );
            const lastMsg = mapped[mapped.length - 1];

            return prev.map((c) => {
              if (c.id === convId) {
                return {
                  ...c,
                  messages: mapped,
                  lastSnippet: lastMsg ? lastMsg.text : (mapped.length === 0 ? 'Belum ada pesan' : c.lastSnippet),
                  lastTime: lastMsg ? lastMsg.time : c.lastTime,
                  unreadCount: 0,
                };
              }
              return c;
            });
          });
        }
      } catch (err: unknown) {
        if (!silent) {
          const msg = err instanceof Error ? err.message : '';
          setMessageError(translateConversationError(msg));
        }
      } finally {
        if (!silent) {
          setIsLoadingMessages(false);
        }
      }
    },
    [effectiveOrgId, currentUserFullName, setConversations]
  );

  // Inisialisasi muat percakapan ketika ID organisasi tersedia
  useEffect(() => {
    let ignore = false;
    if (!effectiveOrgId) return;

    const timer = setTimeout(() => {
      if (!ignore) {
        fetchConversations(effectiveOrgId, false);
      }
    }, 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [effectiveOrgId, fetchConversations]);

  // Muat Pesan untuk Percakapan yang Sedang Dibuka
  useEffect(() => {
    let ignore = false;
    if (!selectedId || !effectiveOrgId) return;

    const timer = setTimeout(() => {
      if (!ignore) {
        fetchMessages(selectedId, false);
      }
    }, 0);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [selectedId, effectiveOrgId, fetchMessages]);

  // Pada desktop jika ada percakapan dan belum ada yang dipilih, pilih percakapan pertama secara otomatis
  useEffect(() => {
    let ignore = false;
    if (isDesktop && conversations.length > 0 && !selectedId && !hasUserClosedDetailRef.current) {
      const timer = setTimeout(() => {
        if (!ignore) {
          setSelectedId(conversations[0].id);
        }
      }, 0);
      return () => {
        ignore = true;
        clearTimeout(timer);
      };
    }
  }, [isDesktop, conversations, selectedId, setSelectedId]);

  // Sinkronisasi Real-time (Supabase Realtime) dan Polling Cadangan (4 detik)
  useEffect(() => {
    if (!effectiveOrgId) return;

    // 1. Supabase Realtime Channel
    const channel = supabase
      .channel(`realtime_chat_${effectiveOrgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `organization_id=eq.${effectiveOrgId}`,
        },
        () => {
          fetchConversations(effectiveOrgId, true);
          if (selectedId) {
            fetchMessages(selectedId, true);
          }
          onConversationUpdated?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `organization_id=eq.${effectiveOrgId}`,
        },
        () => {
          fetchConversations(effectiveOrgId, true);
          onConversationUpdated?.();
        }
      )
      .subscribe();

    // 2. Polling cadangan setiap 4 detik untuk jaminan sinkronisasi jika websocket terbatas
    const pollInterval = setInterval(() => {
      fetchConversations(effectiveOrgId, true);
      if (selectedId) {
        fetchMessages(selectedId, true);
      }
    }, 4000);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [effectiveOrgId, selectedId, fetchConversations, fetchMessages]);

  // Hitung jumlah data per kategori
  // 'open': percakapan aktif/sedang ditangani
  // 'pending': percakapan menunggu tindak lanjut
  // 'resolved': percakapan selesai
  const countAll = conversations.length;
  const countUnread = conversations.filter((c) => c.unreadCount > 0).length;
  const countPending = conversations.filter((c) => c.status === 'pending').length;
  const countResolved = conversations.filter((c) => c.status === 'resolved').length;

  // Filter percakapan berdasarkan tab dan input pencarian
  const filteredConversations = conversations.filter((conv) => {
    if (activeFilter === 'unread' && conv.unreadCount === 0) return false;
    if (activeFilter === 'pending' && conv.status !== 'pending') return false;
    if (activeFilter === 'resolved' && conv.status !== 'resolved') return false;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchName = conv.name.toLowerCase().includes(q);
      const matchPhone = conv.phone.toLowerCase().includes(q);
      const matchSnippet = conv.lastSnippet.toLowerCase().includes(q);
      return matchName || matchPhone || matchSnippet;
    }
    return true;
  });

  // Percakapan aktif yang sedang dibuka
  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;

  // Handler memilih percakapan
  const handleSelectConversation = (id: string) => {
    hasUserClosedDetailRef.current = false;
    setSelectedId(id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );
  };

  // Handler membuka modal konfirmasi hapus percakapan
  const handleOpenDeleteDialog = (conv: Conversation, e?: any) => {
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    setConversationToDelete(conv);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  // Handler membatalkan proses hapus percakapan
  const handleCancelDelete = () => {
    if (isDeleting) return;
    setIsDeleteModalOpen(false);
    setConversationToDelete(null);
    setDeleteError(null);
  };

  // Handler eksekusi konfirmasi hapus percakapan
  const handleConfirmDelete = async () => {
    if (!conversationToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);

    const targetConv = conversationToDelete;
    const isTargetSelected = selectedId === targetConv.id;

    try {
      if (!targetConv.isDemo && effectiveOrgId) {
        let deletedOnServer = false;

        // 1. Coba panggil backend worker terautentikasi terlebih dahulu
        try {
          const clientRes = await deleteConversationClient(targetConv.id, effectiveOrgId);
          if (clientRes.success) {
            deletedOnServer = true;
          } else if (
            clientRes.error &&
            !clientRes.error.includes('tidak terjangkau') &&
            !clientRes.error.includes('Network') &&
            !clientRes.error.includes('fetch')
          ) {
            console.warn('[Delete Conversation] Worker returned error:', clientRes.error);
          }
        } catch (workerErr) {
          // Worker offline / unreachable, fallback ke Supabase client langsung
        }

        // 2. Jika worker belum menghapus (misal worker offline), jalankan via Supabase client langsung dengan RLS
        if (!deletedOnServer) {
          const { error: sbError } = await supabase
            .from('conversations')
            .delete()
            .eq('id', targetConv.id)
            .eq('organization_id', effectiveOrgId);

          if (sbError) {
            console.error('[Delete Conversation] Supabase delete error:', sbError.message);
            setDeleteError(translateConversationError(sbError.message));
            setIsDeleting(false);
            return;
          }
        }
      }

      // Hapus dari state lokal percakapan
      setConversations((prev) => prev.filter((c) => c.id !== targetConv.id));

      // Jika percakapan yang dihapus adalah yang sedang dibuka, tutup panel detail
      if (isTargetSelected) {
        hasUserClosedDetailRef.current = true;
        setSelectedId(null);
      }

      // Notifikasi ke parent (App.tsx / Dashboard) agar metrik Pesan Masuk & Percakapan langsung sinkron
      onConversationDeleted?.(targetConv);
      onConversationUpdated?.();

      // Tutup dialog konfirmasi
      setIsDeleteModalOpen(false);
      setConversationToDelete(null);

      // Tampilkan notifikasi sukses sementara
      setDeleteSuccessNotice(`Riwayat percakapan dengan "${targetConv.name}" berhasil dihapus.`);
      setTimeout(() => {
        setDeleteSuccessNotice(null);
      }, 3500);

      // Sinkronkan daftar terbaru jika terhubung ke Supabase
      if (!targetConv.isDemo && effectiveOrgId) {
        fetchConversations(effectiveOrgId, true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Delete Conversation] Exception:', msg);
      setDeleteError(translateConversationError(msg));
    } finally {
      setIsDeleting(false);
    }
  };

  // Handler mengubah status penanganan di Supabase (hanya mengirim 'open' | 'pending' | 'resolved')
  const handleUpdateStatus = async (newStatus: ConversationStatus) => {
    if (!selectedId || !effectiveOrgId) return;

    // Update lokal terlebih dahulu untuk responsivitas instan
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, status: newStatus } : c))
    );

    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedId)
        .eq('organization_id', effectiveOrgId);

      if (error) {
        console.error('Error updating status in Supabase:', error.message);
      }
    } catch (err) {
      console.error('Exception updating conversation status:', err);
    }
  };

  // Handler kirim pesan teks dari agen CS: WhatsApp FIRST -> Supabase Database
  const handleSendMessage = useCallback(
    async (textOverride?: string) => {
      const messageToSend = (typeof textOverride === 'string' ? textOverride : inputText).trim();
      if (!selectedId || !effectiveOrgId || messageToSend === '' || isSending) return;

      const targetPhone = selectedConversation?.phone;
      if (!targetPhone || targetPhone === '-') {
        setSendError('Nomor telepon pelanggan tidak valid atau kosong.');
        return;
      }

      if (targetPhone.includes('(Demo)')) {
        setSendError('Percakapan demo hanya untuk simulasi antarmuka. Silakan pilih kontak WhatsApp nyata dari organisasi Anda.');
        return;
      }

      setIsSending(true);
      setSendError(null);
      setLastFailedMessage(null);
      setSendSuccessNotice(null);

      // Bersihkan input teks segera agar responsif
      if (!textOverride) {
        setInputText('');
      }

      const nowIso = new Date().toISOString();
      const nowTime = new Date().toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });

      try {
        // 1. KIRIM KE WHATSAPP TERLEBIH DAHULU via Worker Staging (/api/send)
        // Jangan menganggap pesan berhasil terkirim ke WhatsApp hanya karena tersimpan di DB
        const sendRes = await sendWhatsAppMessage(targetPhone, messageToSend);

        if (!sendRes.success) {
          console.warn('[CS Chat] Gagal mengirim pesan ke WhatsApp worker:', sendRes.error);
          setSendError(`Gagal mengirim ke WhatsApp: ${sendRes.error || 'Worker tidak terjangkau'}`);
          setLastFailedMessage(messageToSend);
          // Pulihkan teks ke input field jika belum diisi teks lain
          setInputText((prev) => (prev === '' ? messageToSend : prev));
          setIsSending(false);
          return;
        }

        const waMessageId = sendRes.data?.messageId;

        // 2. SIMPAN HASIL DAN STATUS PENGIRIMAN KE SUPABASE (public.messages)
        const { data: insertedMsg, error: msgError } = await supabase
          .from('messages')
          .insert({
            conversation_id: selectedId,
            organization_id: effectiveOrgId,
            sender_type: 'agent',
            body: messageToSend,
            sent_at: nowIso,
          })
          .select('id, conversation_id, organization_id, sender_type, body, created_at, sent_at')
          .single();

        if (msgError) {
          console.error('[CS Chat] Pesan terkirim ke WhatsApp namun error simpan DB:', msgError.message);
          setSendError('Pesan terkirim ke WhatsApp pelanggan, namun sinkronisasi riwayat database tertunda.');
        }

        // 3. PERBARUI PERCAKAPAN (public.conversations)
        await supabase
          .from('conversations')
          .update({
            last_message_at: nowIso,
            status: 'open',
            updated_at: nowIso,
          })
          .eq('id', selectedId)
          .eq('organization_id', effectiveOrgId);

        // 4. PERBARUI TAMPILAN PERCAKAPAN LOKAL TANPA DUPLIKASI
        const officialMessageId = insertedMsg?.id || waMessageId || `msg_${Date.now()}`;
        const newChatMessage: ChatMessage = {
          id: officialMessageId,
          sender: 'cs',
          senderName: currentUserFullName ? `CS (${currentUserFullName})` : 'CS (Ahmad Fauzi)',
          text: messageToSend,
          time: nowTime,
          createdAt: nowIso,
        };

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === selectedId) {
              const alreadyExists = c.messages.some(
                (m) =>
                  m.id === officialMessageId ||
                  (m.text === messageToSend && m.sender === 'cs' && m.time === nowTime)
              );
              return {
                ...c,
                lastSnippet: messageToSend,
                lastTime: nowTime,
                status: 'open',
                messages: alreadyExists ? c.messages : [...c.messages, newChatMessage],
              };
            }
            return c;
          })
        );

        setSendSuccessNotice('Pesan berhasil terkirim ke WhatsApp pelanggan ✓');
        onConversationUpdated?.();
        setTimeout(() => {
          setSendSuccessNotice(null);
        }, 3000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[CS Chat] Exception saat pengiriman pesan:', msg);
        setSendError(`Terjadi kendala pengiriman: ${msg}`);
        setLastFailedMessage(messageToSend);
        setInputText((prev) => (prev === '' ? messageToSend : prev));
      } finally {
        setIsSending(false);
      }
    },
    [
      selectedId,
      effectiveOrgId,
      inputText,
      isSending,
      currentUserFullName,
      selectedConversation,
      setConversations,
    ]
  );

  // Handler retry pengalihan pendaftar ke CS dari dashboard
  const handleRetryHandoff = async () => {
    if (!selectedId || isRetryingHandoff) return;
    setIsRetryingHandoff(true);
    setRetryHandoffError(null);
    setRetryHandoffNotice(null);

    try {
      const res = await retryRegistrationHandoffClient(selectedId, effectiveOrgId);
      if (res.success) {
        setRetryHandoffNotice('Notifikasi pendaftaran berhasil dikirim ulang ke WhatsApp petugas CS!');
        await fetchConversations(undefined, true);
        setTimeout(() => setRetryHandoffNotice(null), 4000);
      } else {
        setRetryHandoffError(res.error || 'Gagal mengirim notifikasi ke CS pendaftaran.');
      }
    } catch (err: any) {
      setRetryHandoffError(err?.message || 'Gagal menghubungi worker.');
    } finally {
      setIsRetryingHandoff(false);
    }
  };

  // Menambahkan template cepat ke input teks
  const handleApplyQuickReply = (text: string) => {
    setInputText(text);
  };

  // Reset pencarian & filter
  const handleResetFilters = () => {
    setSearchQuery('');
    setActiveFilter('all');
  };

  // Buka Modal Mulai Percakapan Baru
  const handleOpenNewConvModal = async () => {
    setIsNewConvModalOpen(true);
    setCreateConvError(null);
    setSelectedContactForNew(null);
    setNewConvInitialMessage('');
    setContactSearchQuery('');

    if (externalContacts && externalContacts.length > 0) {
      setOrgContacts(externalContacts);
      return;
    }

    if (!effectiveOrgId) {
      setCreateConvError('Organisasi belum dipilih atau tidak aktif. Silakan pilih workspace Anda.');
      return;
    }

    setIsLoadingOrgContacts(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, organization_id, name, phone, email, labels, notes, created_at, updated_at')
        .eq('organization_id', effectiveOrgId)
        .order('name', { ascending: true });

      if (!error && data) {
        const mappedContacts: Contact[] = data.map((row) => ({
          id: row.id,
          organizationId: row.organization_id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          labels: Array.isArray(row.labels) ? row.labels : [],
          label: 'Umum',
          followUpStatus: 'Belum Dihubungi',
          notes: row.notes || '',
          createdAt: row.created_at || '',
        }));
        setOrgContacts(mappedContacts);
      }
    } catch (e) {
      console.error('Error fetching org contacts:', e);
    } finally {
      setIsLoadingOrgContacts(false);
    }
  };

  // Submit Mulai Percakapan Baru ke Supabase (status default: 'open')
  const handleCreateNewConversation = async () => {
    if (!selectedContactForNew || isSubmittingNewConv) return;
    if (!effectiveOrgId) {
      setCreateConvError('ID organisasi tidak ditemukan. Silakan muat ulang halaman.');
      return;
    }

    // Cek apakah percakapan dengan kontak ini sudah ada
    const existing = conversations.find((c) => c.contactId === selectedContactForNew.id);
    if (existing) {
      setSelectedId(existing.id);
      setIsNewConvModalOpen(false);

      if (newConvInitialMessage.trim()) {
        const trimmed = newConvInitialMessage.trim();
        const nowIso = new Date().toISOString();
        try {
          await supabase.from('messages').insert({
            conversation_id: existing.id,
            organization_id: effectiveOrgId,
            sender_type: 'agent',
            body: trimmed,
            sent_at: nowIso,
          });
          await supabase
            .from('conversations')
            .update({
              last_message_at: nowIso,
              status: 'open',
              updated_at: nowIso,
            })
            .eq('id', existing.id)
            .eq('organization_id', effectiveOrgId);

          if (existing.phone && existing.phone !== '-' && !existing.phone.includes('(Demo)')) {
            await sendWhatsAppMessage(existing.phone, trimmed);
          }
        } catch (e) {
          console.error('Error sending message to existing conversation:', e);
        }
      }
      return;
    }

    setIsSubmittingNewConv(true);
    setCreateConvError(null);
    const nowIso = new Date().toISOString();

    try {
      // 1. Buat baris baru di public.conversations dengan status: 'open' (memenuhi check constraint)
      const { data: newConvRow, error: convError } = await supabase
        .from('conversations')
        .insert({
          organization_id: effectiveOrgId,
          contact_id: selectedContactForNew.id,
          status: 'open',
          last_message_at: nowIso,
        })
        .select(`
          id,
          organization_id,
          contact_id,
          assigned_to,
          status,
          last_message_at,
          created_at,
          updated_at,
          contacts (
            id,
            name,
            phone,
            email,
            labels
          )
        `)
        .single();

      if (convError) {
        console.error('Error creating conversation:', convError.message);
        setCreateConvError(translateConversationError(convError.message));
        return;
      }

      let firstChatMessage: ChatMessage | null = null;
      // 2. Simpan pesan awal jika diisi
      if (newConvInitialMessage.trim() && newConvRow) {
        const trimmed = newConvInitialMessage.trim();
        const { data: insertedMsg } = await supabase
          .from('messages')
          .insert({
            conversation_id: newConvRow.id,
            organization_id: effectiveOrgId,
            sender_type: 'agent',
            body: trimmed,
            sent_at: nowIso,
          })
          .select('id, conversation_id, organization_id, sender_type, body, created_at, sent_at')
          .single();

        if (insertedMsg) {
          firstChatMessage = mapDbMessageToChatMessage(
            insertedMsg,
            selectedContactForNew.name,
            currentUserFullName || 'Ahmad Fauzi'
          );

          if (selectedContactForNew.phone && selectedContactForNew.phone !== '-' && !selectedContactForNew.phone.includes('(Demo)')) {
            try {
              await sendWhatsAppMessage(selectedContactForNew.phone, trimmed);
            } catch (sendErr) {
              console.warn('Gagal mengirim pesan awal ke WhatsApp worker:', sendErr);
            }
          }
        }
      }

      // 3. Masukkan ke state lokal
      const contactObj = Array.isArray(newConvRow.contacts) ? newConvRow.contacts[0] : newConvRow.contacts;
      const cName = contactObj?.name || selectedContactForNew.name;
      const cPhone = contactObj?.phone || selectedContactForNew.phone;
      const nowTime = new Date(nowIso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      const newConvItem: Conversation = {
        id: newConvRow.id,
        organizationId: newConvRow.organization_id,
        contactId: newConvRow.contact_id,
        contactName: cName,
        contactPhone: cPhone,
        name: cName,
        phone: cPhone,
        avatarText: getInitials(cName),
        avatarBg: getAvatarBg(cName),
        status: 'open',
        unreadCount: 0,
        lastTime: nowTime,
        lastSnippet: firstChatMessage ? firstChatMessage.text : 'Percakapan baru dibuat',
        tag: (Array.isArray(contactObj?.labels) && contactObj.labels[0]) || 'WhatsApp Kontak',
        messages: firstChatMessage ? [firstChatMessage] : [],
        isDemo: false,
      };

      setConversations((prev) => [newConvItem, ...prev]);
      setSelectedId(newConvRow.id);
      setIsNewConvModalOpen(false);
      setSelectedContactForNew(null);
      setNewConvInitialMessage('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setCreateConvError(translateConversationError(msg));
    } finally {
      setIsSubmittingNewConv(false);
    }
  };

  // Filter kontak di modal
  const filteredModalContacts = orgContacts.filter((c) => {
    if (!contactSearchQuery.trim()) return true;
    const q = contactSearchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q);
  });

  const activeFetchError =
    fetchError || (!effectiveOrgId ? 'Organisasi belum dipilih atau tidak aktif. Silakan pilih workspace Anda.' : null);

  // ==========================================
  // RENDER SUB-KOMPONEN: DAFTAR PERCAKAPAN
  // ==========================================
  const renderConversationList = () => (
    <View style={[styles.listColumn, !isDesktop && styles.listColumnMobile]}>
      {/* Search & Tombol Percakapan Baru */}
      <View style={styles.listSearchContainer}>
        <View style={styles.listSearchRow}>
          <View style={styles.searchBox}>
            <AppIcon name="search" size={15} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari nama, nomor, pesan..."
              placeholderTextColor={COLORS.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <AppIcon name="close" size={13} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={styles.btnNewConversation}
            onPress={handleOpenNewConvModal}
            activeOpacity={0.8}
            accessibilityLabel="Mulai Percakapan Baru"
          >
            <AppIcon name="plus" size={14} color="#FFFFFF" />
            <Text style={styles.btnNewConversationText}>Baru</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Banner Error Pemuatan Jika Ada */}
      {activeFetchError && (
        <View style={styles.fetchErrorBanner}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppIcon name="alert" size={13} color="#DC2626" />
            <Text style={styles.fetchErrorText} numberOfLines={2}>
              {activeFetchError}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.btnRetryFetch}
            onPress={() => fetchConversations()}
            activeOpacity={0.7}
          >
            <Text style={styles.btnRetryFetchText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Tabs */}
      <View style={styles.filterTabsRow}>
        <TouchableOpacity
          style={[styles.filterTabItem, activeFilter === 'all' && styles.filterTabItemActive]}
          onPress={() => setActiveFilter('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterTabText, activeFilter === 'all' && styles.filterTabTextActive]}>
            Semua ({countAll})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterTabItem, activeFilter === 'unread' && styles.filterTabItemActive]}
          onPress={() => setActiveFilter('unread')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterTabText, activeFilter === 'unread' && styles.filterTabTextActive]}>
            Belum Dibaca ({countUnread})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterTabItem, activeFilter === 'pending' && styles.filterTabItemActive]}
          onPress={() => setActiveFilter('pending')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterTabText, activeFilter === 'pending' && styles.filterTabTextActive]}>
            Menunggu ({countPending})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterTabItem, activeFilter === 'resolved' && styles.filterTabItemActive]}
          onPress={() => setActiveFilter('resolved')}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterTabText, activeFilter === 'resolved' && styles.filterTabTextActive]}>
            Selesai ({countResolved})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Banner Sukses Hapus Percakapan */}
      {deleteSuccessNotice && (
        <View style={styles.deleteSuccessBanner}>
          <AppIcon name="check" size={13} color="#166534" />
          <Text style={styles.deleteSuccessText}>{deleteSuccessNotice}</Text>
        </View>
      )}

      {/* Daftar Item Percakapan */}
      {isLoadingConversations ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.emerald} />
          <Text style={styles.loadingText}>Memuat percakapan Supabase...</Text>
        </View>
      ) : (
        <ScrollView style={styles.conversationScrollList} showsVerticalScrollIndicator={false}>
          {filteredConversations.length === 0 ? (
            <View style={styles.listEmptyState}>
              <View style={styles.emptyIconBox}>
                <AppIcon name="chat" size={20} color={COLORS.emerald} />
              </View>
              {conversations.length === 0 ? (
                <>
                  <Text style={styles.listEmptyTitle}>Belum Ada Percakapan</Text>
                  <Text style={styles.listEmptyDesc}>
                    Organisasi ini belum memiliki percakapan. Mulai percakapan pertama dengan memilih kontak yang sudah terdaftar.
                  </Text>
                  <TouchableOpacity
                    style={styles.btnCreatePrimary}
                    onPress={handleOpenNewConvModal}
                    activeOpacity={0.8}
                  >
                    <AppIcon name="plus" size={13} color="#FFFFFF" />
                    <Text style={styles.btnCreatePrimaryText}>Mulai Percakapan Baru</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={styles.listEmptyTitle}>Percakapan Tidak Ditemukan</Text>
                  <Text style={styles.listEmptyDesc}>
                    Tidak ada percakapan yang cocok dengan filter atau kata kunci pencarian saat ini.
                  </Text>
                  <TouchableOpacity
                    style={styles.btnResetFilter}
                    onPress={handleResetFilters}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.btnResetFilterText}>Reset Filter & Pencarian</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedId === conv.id;
              return (
                <TouchableOpacity
                  key={conv.id}
                  style={[styles.convCard, isSelected && styles.convCardSelected]}
                  onPress={() => handleSelectConversation(conv.id)}
                  activeOpacity={0.75}
                >
                  {/* Inisial Avatar */}
                  <View style={[styles.convAvatar, { backgroundColor: conv.avatarBg }]}>
                    <Text style={styles.convAvatarText}>{conv.avatarText}</Text>
                  </View>

                  {/* Info Ringkas Percakapan */}
                  <View style={styles.convContent}>
                    <View style={styles.convTopRow}>
                      <Text style={[styles.convName, isSelected && styles.convNameSelected]} numberOfLines={1}>
                        {conv.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.convTime}>{conv.lastTime}</Text>
                        <TouchableOpacity
                          style={styles.btnDeleteConvCard}
                          onPress={(e) => {
                            e?.stopPropagation?.();
                            handleOpenDeleteDialog(conv, e);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel={`Hapus percakapan dengan ${conv.name}`}
                          accessibilityRole="button"
                          activeOpacity={0.7}
                        >
                          <AppIcon name="trash" size={12} color={COLORS.textMuted} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Text style={styles.convPhone} numberOfLines={1}>
                      {conv.phone}
                    </Text>

                    <Text
                      style={[styles.convSnippet, conv.unreadCount > 0 && styles.convSnippetBold]}
                      numberOfLines={1}
                    >
                      {conv.lastSnippet}
                    </Text>

                    <View style={styles.convFooterRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                        <StatusBadge status={conv.status} />
                        {conv.handoffStatus === 'sent' && (
                          <View style={styles.handoffPillSent}>
                            <Text style={styles.handoffPillTextSent}>PSB: CS</Text>
                          </View>
                        )}
                        {conv.handoffStatus === 'failed' && (
                          <View style={styles.handoffPillFailed}>
                            <Text style={styles.handoffPillTextFailed}>PSB: Gagal</Text>
                          </View>
                        )}
                      </View>
                      {conv.unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{conv.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );

  // ==========================================
  // RENDER SUB-KOMPONEN: DETAIL CHAT THREAD
  // ==========================================
  const renderConversationDetail = () => {
    if (!selectedConversation) {
      return (
        <View style={styles.emptyDetailWrapper}>
          <View style={styles.emptyDetailCenter}>
            <View style={styles.emptyDetailIconCircle}>
              <AppIcon name="chat" size={28} color={COLORS.forestDark} />
            </View>
            <Text style={styles.emptyDetailTitle}>Pilih Percakapan Pelanggan</Text>
            <Text style={styles.emptyDetailDesc}>
              Pilih salah satu percakapan di sebelah kiri untuk melihat riwayat pesan pelanggan atau mulai percakapan baru.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              {conversations.length > 0 && (
                <TouchableOpacity
                  style={styles.btnSelectFirst}
                  onPress={() => setSelectedId(conversations[0].id)}
                  activeOpacity={0.8}
                >
                  <AppIcon name="chat" size={13} color={COLORS.forestDark} />
                  <Text style={styles.btnSelectFirstText}>Buka Percakapan Pertama</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.btnCreatePrimary}
                onPress={handleOpenNewConvModal}
                activeOpacity={0.8}
              >
                <AppIcon name="plus" size={13} color="#FFFFFF" />
                <Text style={styles.btnCreatePrimaryText}>Mulai Percakapan Baru</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Kolom Input Nonaktif sebagai Petunjuk Visual Tempat Mengetik Pesan */}
          <View style={styles.inputAreaDisabled}>
            <View style={styles.inputWrapperDisabled}>
              <Text style={styles.inputPlaceholderDisabled}>
                Pilih percakapan dari daftar di sebelah kiri untuk mulai membalas pesan WhatsApp...
              </Text>
              <View style={styles.btnSendDisabledPlaceholder}>
                <AppIcon name="send" size={14} color={COLORS.textMuted} />
                <Text style={styles.btnSendDisabledText}>Kirim</Text>
              </View>
            </View>
            <Text style={styles.inputHelperText}>
              Pesan balasan CS akan dikirim langsung ke WhatsApp pelanggan dan dicatat di database Supabase.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.detailContainer}>
        {/* Detail Header: Customer identity & Status actions */}
        <View style={styles.detailHeader}>
          <View style={styles.detailHeaderCustomer}>
            {!isDesktop && (
              <TouchableOpacity
                style={styles.btnBackMobile}
                onPress={() => setSelectedId(null)}
                activeOpacity={0.7}
                accessibilityLabel="Kembali ke Daftar"
              >
                <AppIcon name="arrow-left" size={16} color={COLORS.textDark} />
              </TouchableOpacity>
            )}

            <View style={[styles.detailAvatar, { backgroundColor: selectedConversation.avatarBg }]}>
              <Text style={styles.detailAvatarText}>{selectedConversation.avatarText}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.detailNameRow}>
                <Text style={styles.detailCustomerName} numberOfLines={1}>
                  {selectedConversation.name}
                </Text>
                <View style={styles.tagBadge}>
                  <Text style={styles.tagBadgeText}>{selectedConversation.tag}</Text>
                </View>
              </View>
              <Text style={styles.detailCustomerPhone}>{selectedConversation.phone}</Text>
            </View>
          </View>

          {/* Action Buttons: Status Transition (selalu 'open' | 'pending' | 'resolved') */}
          <View style={styles.detailActionButtonsRow}>
            <StatusBadge status={selectedConversation.status} />

            {/* Tombol Ambil Alih (CS): mengubah status menjadi 'open' */}
            {selectedConversation.status !== 'open' && selectedConversation.status !== 'resolved' && (
              <TouchableOpacity
                style={styles.btnTakeOver}
                onPress={() => handleUpdateStatus('open')}
                activeOpacity={0.8}
              >
                <Text style={styles.btnTakeOverText}>Ambil Alih (CS)</Text>
              </TouchableOpacity>
            )}

            {/* Tombol Tandai Selesai: mengubah status menjadi 'resolved' */}
            {selectedConversation.status !== 'resolved' ? (
              <TouchableOpacity
                style={styles.btnResolve}
                onPress={() => handleUpdateStatus('resolved')}
                activeOpacity={0.8}
              >
                <Text style={styles.btnResolveText}>Tandai Selesai</Text>
              </TouchableOpacity>
            ) : (
              /* Tombol Buka Kembali: mengaktifkan kembali percakapan menjadi 'open' */
              <TouchableOpacity
                style={styles.btnReopen}
                onPress={() => handleUpdateStatus('open')}
                activeOpacity={0.8}
              >
                <Text style={styles.btnReopenText}>Buka Kembali</Text>
              </TouchableOpacity>
            )}

            {/* Tombol Alihkan ke AI: mengubah status menjadi 'pending' (menunggu bot / tindak lanjut) */}
            {selectedConversation.status !== 'pending' && selectedConversation.status !== 'resolved' && (
              <TouchableOpacity
                style={styles.btnSwitchAi}
                onPress={() => handleUpdateStatus('pending')}
                activeOpacity={0.8}
              >
                <Text style={styles.btnSwitchAiText}>Alihkan ke AI</Text>
              </TouchableOpacity>
            )}

            {/* Tombol Hapus Percakapan */}
            <TouchableOpacity
              style={styles.btnDeleteDetail}
              onPress={() => handleOpenDeleteDialog(selectedConversation)}
              activeOpacity={0.8}
              accessibilityLabel="Hapus percakapan ini"
            >
              <AppIcon name="trash" size={12} color="#DC2626" />
              <Text style={styles.btnDeleteDetailText}>Hapus</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Sinkronisasi WhatsApp & Database */}
        <View style={styles.disclaimerBar}>
          <AppIcon name="check" size={13} color={COLORS.emerald} />
          <Text style={styles.disclaimerText}>
            Tersinkronisasi langsung dengan basis data Supabase & Worker WhatsApp Staging. Pesan masuk dan keluar tersimpan secara persisten.
          </Text>
        </View>

        {/* Banner Pengalihan CS Pendaftaran (Handoff Tracking) */}
        {selectedConversation.handoffStatus === 'sent' && (
          <View style={styles.handoffSentBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 }}>
              <View style={styles.handoffSentIconBox}>
                <AppIcon name="check" size={14} color="#166534" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={styles.handoffSentTitle}>
                    Pendaftar Dialihkan ke CS: {selectedConversation.assignedToName || selectedConversation.handoffDepartment || 'Panitia PSB'}
                  </Text>
                  <View style={styles.handoffStatusTagSent}>
                    <Text style={styles.handoffStatusTagTextSent}>TERKIRIM</Text>
                  </View>
                </View>
                <Text style={styles.handoffSentSub}>
                  Notifikasi WhatsApp terkirim ke {selectedConversation.handoffCsPhone ? `+${selectedConversation.handoffCsPhone}` : 'petugas CS'}
                  {selectedConversation.handoffNotifiedAt ? ` pada ${selectedConversation.handoffNotifiedAt}` : ''}.
                  {selectedConversation.handoffSummary ? ` Ringkasan: "${selectedConversation.handoffSummary}"` : ''}
                </Text>
              </View>
            </View>
          </View>
        )}

        {selectedConversation.handoffStatus === 'failed' && (
          <View style={styles.handoffFailedBanner}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 }}>
              <View style={styles.handoffFailedIconBox}>
                <AppIcon name="alert" size={14} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={styles.handoffFailedTitle}>Pengalihan CS Pendaftaran Gagal</Text>
                  <View style={styles.handoffStatusTagFailed}>
                    <Text style={styles.handoffStatusTagTextFailed}>GAGAL</Text>
                  </View>
                </View>
                <Text style={styles.handoffFailedSub}>
                  {selectedConversation.handoffError || retryHandoffError || 'Notifikasi WhatsApp tidak berhasil disampaikan ke nomor petugas pendaftaran.'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.btnRetryHandoff, isRetryingHandoff && { opacity: 0.7 }]}
              onPress={handleRetryHandoff}
              disabled={isRetryingHandoff}
              activeOpacity={0.8}
            >
              {isRetryingHandoff ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <AppIcon name="link" size={12} color="#FFFFFF" />
                  <Text style={styles.btnRetryHandoffText}>Coba Alihkan Lagi</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {retryHandoffNotice && (
          <View style={styles.sendSuccessBanner}>
            <AppIcon name="check" size={13} color="#166534" />
            <Text style={styles.sendSuccessText}>{retryHandoffNotice}</Text>
          </View>
        )}

        {/* Chat History Thread */}
        <ScrollView style={styles.chatThreadScroll} contentContainerStyle={styles.chatThreadContent}>
          {isLoadingMessages ? (
            <View style={{ padding: 24, alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={COLORS.emerald} />
              <Text style={{ fontSize: 11, color: COLORS.textSecondary }}>Memuat riwayat pesan...</Text>
            </View>
          ) : messageError ? (
            <View style={styles.messageErrorBox}>
              <Text style={styles.messageErrorText}>{messageError}</Text>
            </View>
          ) : selectedConversation.messages.length === 0 ? (
            <View style={styles.emptyMessagesBox}>
              <Text style={styles.emptyMessagesTitle}>Belum Ada Pesan</Text>
              <Text style={styles.emptyMessagesDesc}>
                Belum ada pesan yang tercatat untuk percakapan ini. Kirim balasan pertama melalui formulir di bawah.
              </Text>
            </View>
          ) : (
            selectedConversation.messages.map((msg) => {
              if (msg.sender === 'system') {
                return (
                  <View key={msg.id} style={styles.systemMessageContainer}>
                    <Text style={styles.systemMessageText}>{msg.text}</Text>
                    <Text style={styles.systemMessageTime}>{msg.time}</Text>
                  </View>
                );
              }

              const isCustomer = msg.sender === 'customer';
              const isAi = msg.sender === 'ai';
              const isCs = msg.sender === 'cs';

              return (
                <View
                  key={msg.id}
                  style={[
                    styles.messageRow,
                    isCustomer && styles.messageRowCustomer,
                    (isCs || isAi) && styles.messageRowAgent,
                  ]}
                >
                  <View
                    style={[
                      styles.messageBubble,
                      isCustomer && styles.bubbleCustomer,
                      isCs && styles.bubbleCs,
                      isAi && styles.bubbleAi,
                    ]}
                  >
                    {/* Header Pengirim */}
                    <View style={styles.bubbleHeader}>
                      <Text
                        style={[
                          styles.bubbleSenderName,
                          isCustomer && styles.senderCustomer,
                          isCs && styles.senderCs,
                          isAi && styles.senderAi,
                        ]}
                      >
                        {msg.senderName}
                      </Text>
                      {isAi && (
                        <View style={styles.aiTag}>
                          <Text style={styles.aiTagText}>AUTO-REPLY</Text>
                        </View>
                      )}
                    </View>

                    {/* Isi Pesan Teks */}
                    <Text style={styles.bubbleText}>{msg.text}</Text>

                    {/* Waktu & Tanda Centang */}
                    <View style={styles.bubbleFooter}>
                      <Text style={styles.bubbleTime}>{msg.time}</Text>
                      {isCs && (
                        <View style={styles.doubleCheckMark}>
                          <AppIcon name="check" size={11} color={COLORS.emerald} />
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Template Cepat (Canned Responses) */}
        <View style={styles.quickRepliesStrip}>
          <Text style={styles.quickReplyLabel}>Balasan Cepat:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {QUICK_REPLIES.map((qr, index) => (
              <TouchableOpacity
                key={index}
                style={styles.quickReplyPill}
                onPress={() => handleApplyQuickReply(qr)}
                activeOpacity={0.7}
              >
                <Text style={styles.quickReplyText} numberOfLines={1}>
                  {qr}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Input Kirim Pesan CS */}
        <View style={styles.inputArea}>
          {/* Banner Notifikasi Berhasil */}
          {sendSuccessNotice && (
            <View style={styles.sendSuccessBanner}>
              <AppIcon name="check" size={13} color="#166534" />
              <Text style={styles.sendSuccessText}>{sendSuccessNotice}</Text>
            </View>
          )}

          {/* Banner Error dengan Tombol Coba Lagi */}
          {sendError && (
            <View style={styles.sendErrorBanner}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AppIcon name="alert" size={13} color="#DC2626" />
                <Text style={styles.sendErrorText} numberOfLines={2}>
                  {sendError}
                </Text>
              </View>
              {lastFailedMessage && (
                <TouchableOpacity
                  style={styles.btnRetrySend}
                  onPress={() => handleSendMessage(lastFailedMessage)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnRetrySendText}>Coba Lagi</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setSendError(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <AppIcon name="close" size={11} color="#DC2626" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.chatTextInput}
              placeholder="Ketik balasan pesan agen CS (tekan Enter untuk kirim)..."
              placeholderTextColor={COLORS.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              editable={!isSending}
              onKeyPress={(e: any) => {
                if (Platform.OS === 'web' && e.nativeEvent?.key === 'Enter' && !e.nativeEvent?.shiftKey) {
                  e.preventDefault();
                  if (inputText.trim().length > 0 && !isSending) {
                    handleSendMessage();
                  }
                }
              }}
              onSubmitEditing={() => {
                if (inputText.trim().length > 0 && !isSending) {
                  handleSendMessage();
                }
              }}
            />
            <TouchableOpacity
              style={[
                styles.btnSend,
                (inputText.trim().length === 0 || isSending) && styles.btnSendDisabled,
              ]}
              onPress={() => handleSendMessage()}
              disabled={inputText.trim().length === 0 || isSending}
              activeOpacity={0.8}
              accessibilityLabel="Kirim pesan balasan ke WhatsApp"
            >
              {isSending ? (
                <>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.btnSendText}>Mengirim...</Text>
                </>
              ) : (
                <>
                  <AppIcon name="send" size={14} color="#FFFFFF" />
                  <Text style={styles.btnSendText}>Kirim</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.inputFooterRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <View style={styles.statusDotSmall} />
              <Text style={styles.inputHelperText}>
                Terkirim langsung ke WhatsApp pelanggan & tersimpan di database Supabase.
              </Text>
            </View>
            {inputText.trim().length > 0 && (
              <Text style={styles.charCountText}>{inputText.trim().length} karakter</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  // ==========================================
  // RENDER MODAL: MULAI PERCAKAPAN BARU
  // ==========================================
  const renderNewConversationModal = () => (
    <Modal
      visible={isNewConvModalOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setIsNewConvModalOpen(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header Modal */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Mulai Percakapan Baru</Text>
              <Text style={styles.modalSubtitle}>Pilih kontak dari organisasi untuk membuka percakapan</Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsNewConvModalOpen(false)}
              style={styles.modalCloseBtn}
              activeOpacity={0.7}
            >
              <AppIcon name="close" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {createConvError && (
            <View style={styles.modalErrorBanner}>
              <AppIcon name="alert" size={13} color="#DC2626" />
              <Text style={styles.modalErrorText}>{createConvError}</Text>
            </View>
          )}

          {/* Search Kontak */}
          <View style={styles.modalSearchBox}>
            <AppIcon name="search" size={14} color={COLORS.textSecondary} />
            <TextInput
              style={styles.modalSearchInput}
              placeholder="Cari nama atau nomor telepon..."
              placeholderTextColor={COLORS.textMuted}
              value={contactSearchQuery}
              onChangeText={setContactSearchQuery}
            />
            {contactSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setContactSearchQuery('')}>
                <AppIcon name="close" size={12} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Daftar Kontak */}
          <Text style={styles.modalSectionLabel}>PILIH KONTAK TUJUAN</Text>
          {isLoadingOrgContacts ? (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={COLORS.emerald} />
              <Text style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 6 }}>
                Memuat data kontak...
              </Text>
            </View>
          ) : filteredModalContacts.length === 0 ? (
            <View style={styles.modalEmptyContacts}>
              <Text style={styles.modalEmptyTitle}>Tidak ada kontak yang cocok</Text>
              <Text style={styles.modalEmptyDesc}>
                {orgContacts.length === 0
                  ? 'Belum ada kontak terdaftar pada organisasi ini. Tambahkan kontak di Direktori Kontak terlebih dahulu.'
                  : 'Coba ubah kata kunci pencarian nama atau nomor telepon.'}
              </Text>
              {orgContacts.length === 0 && onNavigate && (
                <TouchableOpacity
                  style={[styles.btnCreatePrimary, { marginTop: 10 }]}
                  onPress={() => {
                    setIsNewConvModalOpen(false);
                    onNavigate('users');
                  }}
                >
                  <Text style={styles.btnCreatePrimaryText}>Buka Direktori Kontak</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <ScrollView style={styles.modalContactsList} showsVerticalScrollIndicator={false}>
              {filteredModalContacts.map((c) => {
                const isSelected = selectedContactForNew?.id === c.id;
                const existingConv = conversations.find((conv) => conv.contactId === c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.modalContactItem, isSelected && styles.modalContactItemSelected]}
                    onPress={() => setSelectedContactForNew(c)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.convAvatar, { backgroundColor: getAvatarBg(c.name), width: 34, height: 34 }]}>
                      <Text style={[styles.convAvatarText, { fontSize: 11 }]}>{getInitials(c.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.modalContactName} numberOfLines={1}>
                          {c.name}
                        </Text>
                        {existingConv && (
                          <View style={styles.existingConvTag}>
                            <Text style={styles.existingConvTagText}>Aktif</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.modalContactPhone}>{c.phone}</Text>
                    </View>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Input Pesan Pembuka Opsional */}
          <View style={{ marginTop: 12 }}>
            <Text style={styles.modalSectionLabel}>PESAN PEMBUKA (OPSIONAL)</Text>
            <TextInput
              style={styles.modalMessageInput}
              placeholder="Contoh: Halo Kak, terima kasih telah menghubungi tim layanan kami..."
              placeholderTextColor={COLORS.textMuted}
              value={newConvInitialMessage}
              onChangeText={setNewConvInitialMessage}
              multiline
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.modalFooterActions}>
            <TouchableOpacity
              style={styles.modalBtnCancel}
              onPress={() => setIsNewConvModalOpen(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalBtnCancelText}>Batal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalBtnSubmit,
                (!selectedContactForNew || isSubmittingNewConv) && styles.modalBtnSubmitDisabled,
              ]}
              onPress={handleCreateNewConversation}
              disabled={!selectedContactForNew || isSubmittingNewConv}
              activeOpacity={0.8}
            >
              {isSubmittingNewConv ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalBtnSubmitText}>Mulai Percakapan</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ==========================================
  // RENDER MODAL: KONFIRMASI HAPUS PERCAKAPAN
  // ==========================================
  const renderDeleteConfirmModal = () => (
    <Modal
      visible={isDeleteModalOpen && conversationToDelete !== null}
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

        {conversationToDelete && (
          <View style={[styles.modalCard, { maxWidth: 440 }]}>
            <View style={styles.deleteConfirmHeader}>
              <View style={styles.deleteAlertIconCircle}>
                <AppIcon name="trash" size={20} color="#DC2626" />
              </View>
              <Text style={styles.deleteDialogTitle}>Hapus Percakapan WABiz?</Text>
              <Text style={styles.deleteDialogDesc}>
                Anda akan menghapus riwayat percakapan untuk kontak berikut:
              </Text>

              {/* Kartu Identitas Percakapan */}
              <View style={styles.deleteTargetCard}>
                <View style={[styles.deleteTargetAvatar, { backgroundColor: conversationToDelete.avatarBg }]}>
                  <Text style={styles.deleteTargetAvatarText}>{conversationToDelete.avatarText}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deleteTargetName} numberOfLines={1}>
                    {conversationToDelete.name}
                  </Text>
                  <Text style={styles.deleteTargetPhone}>
                    {maskPhone(conversationToDelete.phone)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <StatusBadge status={conversationToDelete.status} />
                    <Text style={styles.deleteTargetMsgCount}>
                      {conversationToDelete.messages.length} pesan riwayat
                    </Text>
                  </View>
                </View>
              </View>

              {/* Catatan / Disclaimer Keamanan */}
              <View style={styles.deleteDisclaimerBox}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <AppIcon name="alert" size={14} color="#D97706" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deleteDisclaimerTitle}>Cakupan Penghapusan:</Text>
                    <Text style={styles.deleteDisclaimerText}>
                      • Menghapus riwayat pesan dan percakapan ini dari sistem WABiz.{'\n'}
                      • Kontak pelanggan <Text style={{ fontWeight: '700' }}>tetap tersimpan</Text> di modul Kontak.{'\n'}
                      • Tindakan ini <Text style={{ fontWeight: '700' }}>TIDAK</Text> menghapus pesan pada aplikasi WhatsApp pelanggan.
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {deleteError && (
              <View style={styles.modalErrorBanner}>
                <AppIcon name="alert" size={13} color="#DC2626" />
                <Text style={styles.modalErrorText}>{deleteError}</Text>
              </View>
            )}

            <View style={styles.modalFooterActions}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={handleCancelDelete}
                disabled={isDeleting}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnConfirmDelete, isDeleting && styles.modalBtnSubmitDisabled]}
                onPress={handleConfirmDelete}
                disabled={isDeleting}
                activeOpacity={0.8}
              >
                {isDeleting ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.btnConfirmDeleteText}>Menghapus...</Text>
                  </View>
                ) : (
                  <Text style={styles.btnConfirmDeleteText}>Hapus Percakapan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );

  // ==========================================
  // UTAMA: RESPONSIVE SPLIT / SINGLE VIEW
  // ==========================================
  return (
    <View style={styles.inboxWrapper}>
      {/* Header Halaman Percakapan */}
      <View style={styles.pageHeader}>
        <View>
          <View style={styles.pageTitleRow}>
            <Text style={styles.pageTitle}>Pusat Percakapan</Text>
            <View style={styles.modeBadge}>
              <View style={styles.modeDot} />
              <Text style={styles.modeBadgeText}>Penyimpanan Database Aktif</Text>
            </View>
          </View>
          <Text style={styles.pageSubtitle}>
            Kotak masuk terpadu respon pelanggan WhatsApp, eskalasi agen CS, dan pencatatan riwayat pesan Supabase.
          </Text>
        </View>

        {onNavigate && (
          <TouchableOpacity
            style={styles.btnConnectGateway}
            onPress={() => onNavigate('settings')}
            activeOpacity={0.8}
          >
            <AppIcon name="link" size={14} color={COLORS.forestDark} />
            <Text style={styles.btnConnectGatewayText}>Setup Gateway WhatsApp</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Kontainer Komunikasi: Desktop (Split 2 Kolom) vs Mobile (Pindah Tampilan) */}
      <View style={[styles.inboxContainer, !isDesktop && styles.inboxContainerMobile]}>
        {isDesktop ? (
          <>
            {renderConversationList()}
            <View style={styles.detailPanelDesktop}>{renderConversationDetail()}</View>
          </>
        ) : (
          <>{selectedId === null ? renderConversationList() : renderConversationDetail()}</>
        )}
      </View>

      {/* Render Modal Buat Percakapan */}
      {renderNewConversationModal()}
      {/* Render Modal Konfirmasi Hapus Percakapan */}
      {renderDeleteConfirmModal()}
    </View>
  );
}

// ==========================================
// STYLING DETAIL INBOX CUSTOMER SERVICE
// ==========================================
const styles = StyleSheet.create({
  inboxWrapper: {
    flex: 1,
    gap: 16,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  pageTitleRow: {
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
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 6,
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.emerald,
  },
  modeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.forestDark,
    letterSpacing: 0.3,
  },
  pageSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    maxWidth: 620,
  },
  btnConnectGateway: {
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
  btnConnectGatewayText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.forestDark,
  },

  // ----------------------------------------
  // KONTAINER UTAMA
  // ----------------------------------------
  inboxContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    flex: 1,
    minHeight: 480,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  inboxContainerMobile: {
    flexDirection: 'column',
    minHeight: 0,
    flex: 1,
  },

  // ----------------------------------------
  // KOLOM KIRI: DAFTAR PERCAKAPAN
  // ----------------------------------------
  listColumn: {
    width: 340,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: 'column',
    height: '100%',
  },
  listColumnMobile: {
    width: '100%',
    borderRightWidth: 0,
    flex: 1,
    height: '100%',
  },
  listSearchContainer: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  listSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    paddingHorizontal: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textDark,
    marginLeft: 8,
    paddingVertical: 0,
  },
  btnNewConversation: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emerald,
    borderRadius: 7,
    paddingHorizontal: 10,
    height: 36,
    gap: 4,
  },
  btnNewConversationText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  fetchErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEE2E2',
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  fetchErrorText: {
    fontSize: 11,
    color: '#DC2626',
    flex: 1,
  },
  btnRetryFetch: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  btnRetryFetchText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#DC2626',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  filterTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 4,
    flexWrap: 'wrap',
  },
  filterTabItem: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    backgroundColor: 'transparent',
  },
  filterTabItemActive: {
    backgroundColor: COLORS.emeraldSubtle,
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
  conversationScrollList: {
    flex: 1,
  },
  convCard: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
    alignItems: 'flex-start',
  },
  convCardSelected: {
    backgroundColor: COLORS.surfaceMuted,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.emerald,
  },
  convAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  convAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  convContent: {
    flex: 1,
  },
  convTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  convName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
    flex: 1,
    marginRight: 6,
  },
  convNameSelected: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },
  convTime: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  convPhone: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  convSnippet: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
    marginBottom: 6,
  },
  convSnippetBold: {
    fontWeight: '600',
    color: COLORS.textDark,
  },
  convFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  unreadBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.emerald,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  listEmptyState: {
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  listEmptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
    textAlign: 'center',
  },
  listEmptyDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 14,
  },
  btnCreatePrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emerald,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  btnCreatePrimaryText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  btnResetFilter: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnResetFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
  },

  // ----------------------------------------
  // KOLOM KANAN: PANEL DETAIL & CHAT THREAD
  // ----------------------------------------
  detailPanelDesktop: {
    flex: 1,
    backgroundColor: COLORS.surface,
    height: '100%',
  },
  detailContainer: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: COLORS.surface,
    height: '100%',
  },
  detailHeader: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: COLORS.surface,
  },
  detailHeaderCustomer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 220,
  },
  btnBackMobile: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  detailAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  detailNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailCustomerName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  tagBadge: {
    backgroundColor: 'rgba(23, 35, 31, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  tagBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  detailCustomerPhone: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  detailActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  btnTakeOver: {
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnTakeOverText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  btnResolve: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnResolveText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  btnReopen: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnReopenText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.warningText,
  },
  btnSwitchAi: {
    backgroundColor: COLORS.purpleBg,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  btnSwitchAiText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.purpleText,
  },

  // Disclaimer / Sync Status banner
  disclaimerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 8,
  },
  disclaimerText: {
    fontSize: 11,
    color: '#166534',
    flex: 1,
    lineHeight: 15,
  },

  // Handoff Status Banners & Tags
  handoffSentBanner: {
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#BBF7D0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  handoffSentIconBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  handoffSentTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  handoffSentSub: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 2,
    lineHeight: 15,
  },
  handoffStatusTagSent: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  handoffStatusTagTextSent: {
    fontSize: 9,
    fontWeight: '700',
    color: '#166534',
    letterSpacing: 0.3,
  },
  handoffFailedBanner: {
    backgroundColor: '#FEF2F2',
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  handoffFailedIconBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  handoffFailedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
  },
  handoffFailedSub: {
    fontSize: 11,
    color: '#DC2626',
    marginTop: 2,
    lineHeight: 15,
  },
  handoffStatusTagFailed: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  handoffStatusTagTextFailed: {
    fontSize: 9,
    fontWeight: '700',
    color: '#B91C1C',
    letterSpacing: 0.3,
  },
  btnRetryHandoff: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  btnRetryHandoffText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  handoffPillSent: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  handoffPillTextSent: {
    fontSize: 9,
    fontWeight: '700',
    color: '#166534',
  },
  handoffPillFailed: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  handoffPillTextFailed: {
    fontSize: 9,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Chat Thread
  chatThreadScroll: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#F7FAF8',
  },
  chatThreadContent: {
    padding: 16,
    gap: 12,
  },
  systemMessageContainer: {
    alignSelf: 'center',
    backgroundColor: 'rgba(23, 35, 31, 0.05)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginVertical: 4,
    alignItems: 'center',
    maxWidth: '85%',
  },
  systemMessageText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  systemMessageTime: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  messageRow: {
    flexDirection: 'row',
    width: '100%',
  },
  messageRowCustomer: {
    justifyContent: 'flex-start',
  },
  messageRowAgent: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  bubbleCustomer: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: 2,
  },
  bubbleCs: {
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    borderTopRightRadius: 2,
  },
  bubbleAi: {
    backgroundColor: COLORS.purpleBg,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    borderTopRightRadius: 2,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  bubbleSenderName: {
    fontSize: 11,
    fontWeight: '700',
  },
  senderCustomer: {
    color: COLORS.textDark,
  },
  senderCs: {
    color: COLORS.forestDark,
  },
  senderAi: {
    color: COLORS.purpleText,
  },
  aiTag: {
    backgroundColor: 'rgba(109, 40, 217, 0.12)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  aiTagText: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.purpleText,
  },
  bubbleText: {
    fontSize: 13,
    color: COLORS.textDark,
    lineHeight: 19,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  bubbleTime: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  doubleCheckMark: {
    marginLeft: 2,
  },
  messageErrorBox: {
    padding: 12,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    marginVertical: 8,
  },
  messageErrorText: {
    fontSize: 11,
    color: '#DC2626',
    textAlign: 'center',
  },
  emptyMessagesBox: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMessagesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  emptyMessagesDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 16,
  },

  // Quick replies
  quickRepliesStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  quickReplyLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  quickReplyPill: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 240,
  },
  quickReplyText: {
    fontSize: 11,
    color: COLORS.textDark,
  },

  // Input Box
  inputArea: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: 6,
  },
  sendErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 8,
  },
  sendErrorText: {
    fontSize: 11,
    color: '#DC2626',
    flex: 1,
  },
  btnRetrySend: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  btnRetrySendText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sendSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  sendSuccessText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
    flex: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chatTextInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textDark,
    minHeight: 38,
    maxHeight: 90,
    paddingVertical: 6,
  },
  btnSend: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emerald,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  btnSendDisabled: {
    backgroundColor: COLORS.borderStrong,
  },
  btnSendText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  inputFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.emerald,
  },
  charCountText: {
    fontSize: 10,
    color: COLORS.textMuted,
  },
  inputHelperText: {
    fontSize: 10,
    color: COLORS.textMuted,
  },

  // Empty Detail Placeholder
  emptyDetailWrapper: {
    flex: 1,
    flexDirection: 'column',
    height: '100%',
    backgroundColor: COLORS.surface,
  },
  emptyDetailCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: COLORS.surfaceMuted,
  },
  emptyDetailIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyDetailTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  emptyDetailDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 380,
    lineHeight: 18,
  },
  btnSelectFirst: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 7,
    gap: 6,
  },
  btnSelectFirstText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  inputAreaDisabled: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
    gap: 6,
  },
  inputWrapperDisabled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    opacity: 0.7,
  },
  inputPlaceholderDisabled: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  btnSendDisabledPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  btnSendDisabledText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },

  // ----------------------------------------
  // BADGE STATUS PENANGANAN
  // ----------------------------------------
  badgeWaiting: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
    gap: 5,
  },
  dotWaiting: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.warningDot,
  },
  badgeWaitingText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.warningText,
  },
  badgeHandling: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
    gap: 5,
  },
  dotHandling: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.emerald,
  },
  badgeHandlingText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  badgeResolved: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
  },
  badgeResolvedText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  // ----------------------------------------
  // MODAL MULAI PERCAKAPAN BARU
  // ----------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  modalErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    padding: 8,
    gap: 6,
    marginBottom: 12,
  },
  modalErrorText: {
    fontSize: 11,
    color: '#DC2626',
    flex: 1,
  },
  modalSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 12,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textDark,
    marginLeft: 8,
    paddingVertical: 0,
  },
  modalSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  modalContactsList: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  modalContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  modalContactItemSelected: {
    backgroundColor: COLORS.emeraldSubtle,
  },
  modalContactName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  modalContactPhone: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  existingConvTag: {
    backgroundColor: 'rgba(22, 163, 106, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  existingConvTagText: {
    fontSize: 9,
    color: COLORS.emerald,
    fontWeight: '700',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: COLORS.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: COLORS.emerald,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: COLORS.emerald,
  },
  modalEmptyContacts: {
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  modalEmptyTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  modalEmptyDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 15,
  },
  modalMessageInput: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    padding: 10,
    fontSize: 12,
    color: COLORS.textDark,
    minHeight: 56,
    maxHeight: 90,
  },
  modalFooterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  modalBtnCancel: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
  },
  modalBtnCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  modalBtnSubmit: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: COLORS.emerald,
  },
  modalBtnSubmitDisabled: {
    backgroundColor: COLORS.borderStrong,
  },
  modalBtnSubmitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ----------------------------------------
  // HAPUS PERCAKAPAN: UI & MODAL KONFIRMASI
  // ----------------------------------------
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  btnDeleteConvCard: {
    padding: 4,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  btnDeleteDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  btnDeleteDetailText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
  deleteSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 14,
    marginBottom: 8,
  },
  deleteSuccessText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    flex: 1,
  },
  deleteConfirmHeader: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: 'center',
  },
  deleteAlertIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  deleteDialogTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
    textAlign: 'center',
  },
  deleteDialogDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 12,
  },
  deleteTargetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    width: '100%',
    marginBottom: 12,
  },
  deleteTargetAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteTargetAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  deleteTargetName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  deleteTargetPhone: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  deleteTargetMsgCount: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  deleteDisclaimerBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 8,
    padding: 10,
    width: '100%',
    marginBottom: 4,
  },
  deleteDisclaimerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 3,
  },
  deleteDisclaimerText: {
    fontSize: 11,
    color: '#78350F',
    lineHeight: 16,
  },
  btnConfirmDelete: {
    backgroundColor: '#DC2626',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnConfirmDeleteText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
