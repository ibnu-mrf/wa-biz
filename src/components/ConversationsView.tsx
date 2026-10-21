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

  // Muat Daftar Percakapan dari Supabase public.conversations
  const fetchConversations = useCallback(
    async (orgId?: string) => {
      const targetOrgId = orgId || effectiveOrgId;
      if (!targetOrgId) {
        setIsLoadingConversations(false);
        setFetchError('Organisasi belum dipilih atau tidak aktif. Silakan pilih workspace Anda.');
        return;
      }

      setIsLoadingConversations(true);
      setFetchError(null);

      try {
        const { data: convData, error: convError } = await supabase
          .from('conversations')
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
          .eq('organization_id', targetOrgId)
          .order('last_message_at', { ascending: false });

        if (convError) {
          console.error('Error fetching conversations:', convError.message);
          setFetchError(translateConversationError(convError.message));
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
              unreadCount: 0,
              lastTime: displayTime,
              lastSnippet: displaySnippet,
              tag,
              messages: [],
              isDemo: false,
            };
          });

          setConversations(mapped);

          // Pada desktop jika belum ada percakapan terpilih, pilih percakapan pertama
          if (isDesktop && mapped.length > 0 && !selectedId) {
            setSelectedId(mapped[0].id);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        setFetchError(translateConversationError(msg));
      } finally {
        setIsLoadingConversations(false);
      }
    },
    [effectiveOrgId, isDesktop, selectedId, setConversations, setSelectedId]
  );

  // Inisialisasi muat percakapan ketika ID organisasi tersedia
  useEffect(() => {
    let ignore = false;
    if (!effectiveOrgId) return;

    const loadData = async () => {
      try {
        const { data: convData, error: convError } = await supabase
          .from('conversations')
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
          .eq('organization_id', effectiveOrgId)
          .order('last_message_at', { ascending: false });

        if (ignore) return;
        if (convError) {
          setFetchError(translateConversationError(convError.message));
        } else if (convData) {
          const { data: recentMsgs } = await supabase
            .from('messages')
            .select('id, conversation_id, body, created_at, sender_type')
            .eq('organization_id', effectiveOrgId)
            .order('created_at', { ascending: false })
            .limit(100);

          if (ignore) return;

          const latestMsgMap: Record<string, { body: string; created_at: string }> = {};
          if (recentMsgs) {
            for (const m of recentMsgs) {
              if (!latestMsgMap[m.conversation_id]) {
                latestMsgMap[m.conversation_id] = { body: m.body, created_at: m.created_at };
              }
            }
          }

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
              unreadCount: 0,
              lastTime: displayTime,
              lastSnippet: displaySnippet,
              tag,
              messages: [],
              isDemo: false,
            };
          });

          setConversations(mapped);
          if (isDesktop && mapped.length > 0) {
            setSelectedId((prev) => prev || mapped[0].id);
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : '';
          setFetchError(translateConversationError(msg));
        }
      } finally {
        if (!ignore) {
          setIsLoadingConversations(false);
        }
      }
    };

    loadData();

    return () => {
      ignore = true;
    };
  }, [effectiveOrgId, isDesktop, setConversations, setSelectedId]);

  // Muat Pesan untuk Percakapan yang Sedang Dibuka
  useEffect(() => {
    let ignore = false;
    if (!selectedId || !effectiveOrgId) {
      return;
    }

    const loadMessages = async () => {
      setIsLoadingMessages(true);
      setMessageError(null);
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('id, conversation_id, organization_id, sender_type, body, created_at, sent_at')
          .eq('conversation_id', selectedId)
          .eq('organization_id', effectiveOrgId)
          .order('created_at', { ascending: true });

        if (ignore) return;
        if (error) {
          console.error('Error fetching messages:', error.message);
          setMessageError(translateConversationError(error.message));
        } else if (data) {
          setConversations((prev) => {
            const targetConv = prev.find((c) => c.id === selectedId);
            const contactName = targetConv?.name || 'Pelanggan';
            const mapped = data.map((m) =>
              mapDbMessageToChatMessage(m, contactName, currentUserFullName || 'Ahmad Fauzi')
            );
            const lastMsg = mapped[mapped.length - 1];

            return prev.map((c) => {
              if (c.id === selectedId) {
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
        if (!ignore) {
          const msg = err instanceof Error ? err.message : '';
          setMessageError(translateConversationError(msg));
        }
      } finally {
        if (!ignore) {
          setIsLoadingMessages(false);
        }
      }
    };

    loadMessages();

    return () => {
      ignore = true;
    };
  }, [selectedId, effectiveOrgId, currentUserFullName, setConversations]);

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
    setSelectedId(id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );
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

  // Handler kirim pesan teks dari agen CS dan simpan ke public.messages
  const handleSendMessage = async () => {
    if (!selectedId || !effectiveOrgId || inputText.trim() === '' || isSending) return;

    const trimmed = inputText.trim();
    const nowIso = new Date().toISOString();
    const nowTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const tempId = `temp_${Date.now()}`;
    const agentDisplay = currentUserFullName ? `CS (${currentUserFullName})` : 'CS (Ahmad Fauzi)';
    const optimisticMsg: ChatMessage = {
      id: tempId,
      sender: 'cs',
      senderName: agentDisplay,
      text: trimmed,
      time: nowTime,
      createdAt: nowIso,
    };

    setInputText('');
    setIsSending(true);
    setSendError(null);

    // Optimistic UI Update: pesan agen yang sedang ditangani selalu berstatus 'open'
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === selectedId) {
          return {
            ...c,
            lastSnippet: trimmed,
            lastTime: nowTime,
            status: 'open',
            messages: [...c.messages, optimisticMsg],
          };
        }
        return c;
      })
    );

    try {
      // 1. Simpan pesan ke public.messages
      const { data: insertedMsg, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: selectedId,
          organization_id: effectiveOrgId,
          sender_type: 'agent',
          body: trimmed,
          sent_at: nowIso,
        })
        .select('id, conversation_id, organization_id, sender_type, body, created_at, sent_at')
        .single();

      if (msgError) {
        console.error('Error inserting message:', msgError.message);
        setSendError(translateConversationError(msgError.message));
        // Rollback pesan optimistik jika gagal
        setConversations((prev) =>
          prev.map((c) =>
            c.id === selectedId
              ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) }
              : c
          )
        );
        return;
      }

      // 2. Perbarui last_message_at dan status percakapan di public.conversations (menjadi 'open')
      await supabase
        .from('conversations')
        .update({
          last_message_at: nowIso,
          status: 'open',
          updated_at: nowIso,
        })
        .eq('id', selectedId)
        .eq('organization_id', effectiveOrgId);

      // 3. Ganti ID sementara dengan ID resmi dari Supabase
      if (insertedMsg) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === selectedId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === tempId ? { ...m, id: insertedMsg.id } : m
                ),
              };
            }
            return c;
          })
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setSendError(translateConversationError(msg));
    } finally {
      setIsSending(false);
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
                      <Text style={styles.convTime}>{conv.lastTime}</Text>
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
                      <StatusBadge status={conv.status} />
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
        <View style={styles.emptyDetailContainer}>
          <View style={styles.emptyDetailIconCircle}>
            <AppIcon name="chat" size={28} color={COLORS.forestDark} />
          </View>
          <Text style={styles.emptyDetailTitle}>Pilih Percakapan Pelanggan</Text>
          <Text style={styles.emptyDetailDesc}>
            Pilih salah satu percakapan di sebelah kiri untuk melihat riwayat pesan pelanggan atau mulai percakapan baru.
          </Text>
          <TouchableOpacity
            style={[styles.btnCreatePrimary, { marginTop: 14 }]}
            onPress={handleOpenNewConvModal}
            activeOpacity={0.8}
          >
            <AppIcon name="plus" size={13} color="#FFFFFF" />
            <Text style={styles.btnCreatePrimaryText}>Mulai Percakapan Baru</Text>
          </TouchableOpacity>
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
          </View>
        </View>

        {/* Disclaimer Bar: Kejujuran Penyimpanan Database */}
        <View style={styles.disclaimerBar}>
          <AppIcon name="alert" size={14} color={COLORS.warningText} />
          <Text style={styles.disclaimerText}>
            Pesan tersimpan di basis data Supabase (Mode Antrean Agen CS). Pengiriman pesan sungguhan ke WhatsApp memerlukan integrasi gateway resmi.
          </Text>
        </View>

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

        {/* Input Kirim Pesan */}
        <View style={styles.inputArea}>
          {sendError && (
            <View style={styles.sendErrorBanner}>
              <Text style={styles.sendErrorText}>{sendError}</Text>
              <TouchableOpacity onPress={() => setSendError(null)}>
                <AppIcon name="close" size={11} color="#DC2626" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.chatTextInput}
              placeholder="Ketik balasan pesan agen CS (tersimpan ke tabel messages)..."
              placeholderTextColor={COLORS.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              editable={!isSending}
            />
            <TouchableOpacity
              style={[
                styles.btnSend,
                (inputText.trim().length === 0 || isSending) && styles.btnSendDisabled,
              ]}
              onPress={handleSendMessage}
              disabled={inputText.trim().length === 0 || isSending}
              activeOpacity={0.8}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <AppIcon name="send" size={14} color="#FFFFFF" />
                  <Text style={styles.btnSendText}>Kirim</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.inputHelperText}>
            Pesan terkirim akan disimpan ke tabel public.messages dengan relasi organization_id dan status aktif (open).
          </Text>
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
      <View style={styles.inboxContainer}>
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
    minHeight: 640,
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

  // ----------------------------------------
  // KOLOM KIRI: DAFTAR PERCAKAPAN
  // ----------------------------------------
  listColumn: {
    width: 350,
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    backgroundColor: COLORS.surface,
    flexDirection: 'column',
  },
  listColumnMobile: {
    width: '100%',
    borderRightWidth: 0,
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
  },
  detailContainer: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: COLORS.surface,
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

  // Disclaimer banner
  disclaimerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warningBorder,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 8,
  },
  disclaimerText: {
    fontSize: 11,
    color: COLORS.warningText,
    flex: 1,
    lineHeight: 15,
  },

  // Chat Thread
  chatThreadScroll: {
    flex: 1,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sendErrorText: {
    fontSize: 11,
    color: '#DC2626',
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
  inputHelperText: {
    fontSize: 10,
    color: COLORS.textMuted,
    paddingHorizontal: 4,
  },

  // Empty Detail Placeholder
  emptyDetailContainer: {
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
});
