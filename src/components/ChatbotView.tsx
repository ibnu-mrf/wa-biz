import React, { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { COLORS, AppIcon } from '../theme';
import { OrgProfile, DEFAULT_ORG_PROFILE } from './SettingsView';
import {
  AiResponseRules,
  IntentDetectionRules,
  EscalationSettings,
  ChatbotConfig,
  ToneType,
  LengthType,
  LanguageType,
  DepartmentType,
  DEFAULT_RESPONSE_RULES,
  DEFAULT_INTENT_RULES,
  DEFAULT_ESCALATION_SETTINGS,
  DEFAULT_WELCOME_MESSAGE,
  DEFAULT_CHATBOT_CONFIG,
  processGroundedBotReply,
  requestAiChatReply,
  loadChatbotConfig,
  saveChatbotConfig,
  getAiBackendUrl,
} from '../lib/aiService';

export {
  OrgProfile,
  AiResponseRules,
  IntentDetectionRules,
  EscalationSettings,
  ChatbotConfig,
  ToneType,
  LengthType,
  LanguageType,
  DepartmentType,
  DEFAULT_RESPONSE_RULES,
  DEFAULT_INTENT_RULES,
  DEFAULT_ESCALATION_SETTINGS,
  DEFAULT_WELCOME_MESSAGE,
  processGroundedBotReply,
};

// ==========================================
// TIPE STATUS & NAVIGASI TAB CHATBOT AI
// ==========================================
export type AiStatus = 'unconfigured' | 'ready' | 'disabled';
export type ChatbotTab = 'profile' | 'rules' | 'intent' | 'escalation' | 'simulator';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot' | 'system';
  text: string;
  timestamp: string;
  isEscalated?: boolean;
  leadTagged?: boolean;
  links?: { label: string; url: string }[];
  source?: 'local_grounded_rules' | 'backend_edge_function';
}

// ==========================================
// VALIDASI FORMAT URL
// ==========================================
function isValidHttpUrl(stringVal: string): boolean {
  if (!stringVal.trim()) return true; // Opsional/kosong dianggap lolos, namun ada peringatan
  try {
    const url = stringVal.trim();
    return url.startsWith('http://') || url.startsWith('https://');
  } catch {
    return false;
  }
}

// ==========================================
// SEQUENTIAL ID GENERATOR UNTUK PESAN SIMULASI
// Menghindari impure function (Date.now) di dalam alur render React
// ==========================================
let simSeqId = 0;
function getNextMessageId(prefix: 'u' | 'b'): string {
  simSeqId += 1;
  return `${prefix}_${simSeqId}`;
}

// ==========================================
// KOMPONEN UTAMA: CHATBOT VIEW
// ==========================================
export interface ChatbotViewProps {
  organizationId?: string;
  currentUserId?: string;
  isDesktop?: boolean;
  onNavigate?: (page: 'dashboard' | 'chat' | 'users' | 'campaign' | 'bot' | 'team' | 'settings') => void;
  orgProfile?: OrgProfile;
  setOrgProfile?: React.Dispatch<React.SetStateAction<OrgProfile>>;
}

export function ChatbotView({
  organizationId,
  currentUserId,
  isDesktop = true,
  onNavigate,
  orgProfile: externalProfile,
  setOrgProfile: externalSetProfile,
}: ChatbotViewProps) {
  // Master Switch & Status
  const [isEnabled, setIsEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<ChatbotTab>('profile');

  // Loading & Saving States
  const [isSaving, setIsSaving] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Form Profile State (Shared with SettingsView)
  const [internalProfile, setInternalProfile] = useState<OrgProfile>(DEFAULT_ORG_PROFILE);
  const profile = externalProfile ?? internalProfile;
  const setProfile = externalSetProfile ?? setInternalProfile;

  // Welcome Message State
  const [welcomeMessage, setWelcomeMessage] = useState<string>(DEFAULT_WELCOME_MESSAGE);

  // Response Rules State
  const [rules, setRules] = useState<AiResponseRules>(DEFAULT_RESPONSE_RULES);
  // Intent Rules State
  const [intentRules, setIntentRules] = useState<IntentDetectionRules>(DEFAULT_INTENT_RULES);
  // Escalation Settings State
  const [escalation, setEscalation] = useState<EscalationSettings>(DEFAULT_ESCALATION_SETTINGS);

  // Notification / Feedback State
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Interactive Simulator State
  const [simulatorInput, setSimulatorInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm_init',
      sender: 'bot',
      text: DEFAULT_WELCOME_MESSAGE,
      timestamp: '09:00',
      source: 'local_grounded_rules',
    },
  ]);

  // Muat konfigurasi chatbot tersimpan berdasarkan ID organisasi secara asynchronous
  useEffect(() => {
    if (!organizationId) {
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const cfg = await loadChatbotConfig(organizationId);
        if (!isMounted) return;
        setIsEnabled(cfg.isEnabled);
        const msg = cfg.welcomeMessage || DEFAULT_WELCOME_MESSAGE;
        setWelcomeMessage(msg);
        setRules(cfg.rules);
        setIntentRules(cfg.intentRules);
        setEscalation(cfg.escalation);
        setMessages([
          {
            id: 'm_init',
            sender: 'bot',
            text: msg,
            timestamp: '09:00',
            source: 'local_grounded_rules',
          },
        ]);
      } catch (err) {
        console.warn('Gagal memuat konfigurasi chatbot organisasi:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [organizationId]);

  // Evaluasi Status Chatbot
  const currentStatus: AiStatus = useMemo(() => {
    if (!isEnabled) return 'disabled';
    if (!profile.orgName.trim() || !profile.officialDescription.trim() || !profile.address.trim()) {
      return 'unconfigured';
    }
    return 'ready';
  }, [isEnabled, profile.orgName, profile.officialDescription, profile.address]);

  // Cek ketersediaan endpoint AI Backend
  const hasAiBackend = useMemo(() => {
    return getAiBackendUrl().length > 0;
  }, []);

  // Validasi URL
  const isMapsUrlValid = isValidHttpUrl(profile.mapsUrl);
  const isRegUrlValid = isValidHttpUrl(profile.registrationUrl);

  // Simpan Pengaturan
  const handleSaveSettings = async () => {
    // 1. Validasi Nama Organisasi
    if (!profile.orgName.trim() || profile.orgName.trim().length < 3) {
      setFeedbackMsg({
        type: 'error',
        text: 'Nama lembaga wajib diisi minimal 3 karakter pada profil organisasi.',
      });
      return;
    }

    // 2. Validasi Pesan Sambutan
    if (!welcomeMessage.trim() || welcomeMessage.trim().length < 5) {
      setFeedbackMsg({
        type: 'error',
        text: 'Pesan sambutan otomatis wajib diisi minimal 5 karakter.',
      });
      return;
    }

    // 3. Validasi Format URL
    if (!isMapsUrlValid || !isRegUrlValid) {
      setFeedbackMsg({
        type: 'error',
        text: 'Format tautan web harus diawali dengan http:// atau https://.',
      });
      return;
    }

    if (!organizationId) {
      setFeedbackMsg({
        type: 'error',
        text: 'Organisasi belum terdeteksi. Silakan pilih workspace organisasi yang aktif.',
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveChatbotConfig(organizationId, {
        isEnabled,
        welcomeMessage: welcomeMessage.trim(),
        rules,
        intentRules,
        escalation,
      });

      setFeedbackMsg({
        type: 'success',
        text: `Pengaturan Chatbot AI berhasil disimpan untuk organisasi ${profile.orgName}. Konfigurasi aktif!`,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Terjadi kesalahan sistem';
      setFeedbackMsg({
        type: 'error',
        text: `Gagal menyimpan konfigurasi: ${errMsg}`,
      });
    } finally {
      setIsSaving(false);
      setTimeout(() => {
        setFeedbackMsg(null);
      }, 4500);
    }
  };

  // Reset Default
  const handleResetDefault = async () => {
    setProfile(DEFAULT_ORG_PROFILE);
    setRules(DEFAULT_RESPONSE_RULES);
    setIntentRules(DEFAULT_INTENT_RULES);
    setEscalation(DEFAULT_ESCALATION_SETTINGS);
    setWelcomeMessage(DEFAULT_WELCOME_MESSAGE);
    setIsEnabled(true);
    setMessages([
      {
        id: getNextMessageId('b'),
        sender: 'bot',
        text: DEFAULT_WELCOME_MESSAGE,
        timestamp: '09:00',
        source: 'local_grounded_rules',
      },
    ]);

    if (organizationId) {
      try {
        await saveChatbotConfig(organizationId, DEFAULT_CHATBOT_CONFIG);
      } catch (err) {
        console.warn('Gagal mereset pengaturan di storage:', err);
      }
    }

    setFeedbackMsg({
      type: 'info',
      text: 'Konfigurasi Chatbot AI telah dikembalikan ke pengaturan standar WABiz.',
    });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  // Pengiriman Simulator
  const handleSendSimulatorMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || simulatorInput).trim();
    if (!textToSend || isSimulating) return;

    const currentTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    if (!isEnabled) {
      setMessages((prev) => [
        ...prev,
        {
          id: getNextMessageId('u'),
          sender: 'user',
          text: textToSend,
          timestamp: currentTime,
        },
        {
          id: getNextMessageId('b'),
          sender: 'bot',
          text: '[Simulasi: Chatbot Nonaktif] Chatbot AI saat ini dinonaktifkan. Aktifkan sakelar bot di bagian atas untuk mulai menguji respon.',
          timestamp: currentTime,
          source: 'local_grounded_rules',
        },
      ]);
      if (!customPrompt) setSimulatorInput('');
      return;
    }

    const userMsgId = getNextMessageId('u');
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        text: textToSend,
        timestamp: currentTime,
      },
    ]);
    if (!customPrompt) setSimulatorInput('');
    setIsSimulating(true);

    const history = messages
      .filter((m) => m.sender === 'user' || m.sender === 'bot')
      .slice(-6)
      .map((m) => ({ sender: m.sender as 'user' | 'bot', text: m.text }));

    try {
      const reply = await requestAiChatReply({
        organizationId: organizationId || 'preview-mode',
        userId: currentUserId,
        prompt: textToSend,
        conversationHistory: history,
        profile,
        rules,
        intentRules,
        escalation,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: getNextMessageId('b'),
          sender: 'bot',
          text: reply.text,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          isEscalated: reply.isEscalated,
          leadTagged: reply.leadTagged,
          links: reply.links,
          source: reply.source,
        },
      ]);
    } catch (err) {
      console.error('Error saat menghasilkan respon simulator:', err);
      const localReply = processGroundedBotReply(textToSend, profile, rules, intentRules, escalation, history);
      setMessages((prev) => [
        ...prev,
        {
          id: getNextMessageId('b'),
          sender: 'bot',
          text: localReply.text,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
          isEscalated: localReply.isEscalated,
          leadTagged: localReply.leadTagged,
          links: localReply.links,
          source: 'local_grounded_rules',
        },
      ]);
    } finally {
      setIsSimulating(false);
    }
  };

  // Reset Percakapan Simulator
  const handleClearSimulator = () => {
    setMessages([
      {
        id: getNextMessageId('b'),
        sender: 'bot',
        text: welcomeMessage || `Assalamu'alaikum Wr. Wb. Selamat datang di asisten otomatis ${profile.orgName || 'WABiz'}. Ada yang bisa kami bantu seputar pendaftaran santri baru, jadwal, atau lokasi?`,
        timestamp: '09:00',
        source: 'local_grounded_rules',
      },
    ]);
  };

  // Salin Payload Preview
  const handleCopyPayload = () => {
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2500);
  };

  // Payload Preview JSON Object
  const samplePayloadPreview = useMemo(() => ({
    ticket_id: 'ESC-2026-9812',
    customer_name: 'Ibu Rahmawati (Wali Calon Santri)',
    phone_number: '+62 813-9876-5432',
    channel: 'WhatsApp Business Cloud API',
    destination_department:
      escalation.destinationDepartment === 'psb'
        ? 'CS Pendaftaran (PSB & Admisi)'
        : escalation.destinationDepartment === 'finance'
        ? 'CS Bagian Keuangan'
        : escalation.destinationDepartment === 'supervisor'
        ? 'Supervisor Pelayanan'
        : escalation.destinationDepartment === 'admin'
        ? 'Administrasi & IT'
        : 'CS Layanan Umum & Humas',
    last_user_query: 'Berapa biaya masuk asrama dan apakah ada beasiswa tahfidz?',
    escalation_reason:
      'Pertanyaan rincian biaya khusus & beasiswa belum terdaftar di basis pengetahuan resmi.',
    escalated_at: '17 Okt 2026, 14:32 WIB',
    conversation_status: 'Menunggu CS (Eskalasi Otomatis)',
    lead_score: 'Tinggi (Potensi Pendaftar Santri Baru)',
    strict_grounding_verified: rules.strictGrounding,
  }), [escalation.destinationDepartment, rules.strictGrounding]);

  // Tampilan Empty State bila organisasi belum ada / belum dipilih
  if (!organizationId) {
    return (
      <View style={styles.pageContainer}>
        <View style={styles.emptyStateBox}>
          <View style={styles.emptyIconCircle}>
            <AppIcon name="bot" size={28} color={COLORS.forestDark} />
          </View>
          <Text style={styles.emptyTitle}>Organisasi Belum Dipilih</Text>
          <Text style={styles.emptyDesc}>
            Silakan pilih atau buat ruang kerja organisasi Anda terlebih dahulu untuk mengonfigurasi dan menguji Chatbot AI WABiz.
          </Text>
          {onNavigate && (
            <TouchableOpacity
              style={styles.emptyBtn}
              activeOpacity={0.8}
              onPress={() => onNavigate('dashboard')}
            >
              <Text style={styles.emptyBtnText}>Buka Dashboard</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.pageContainer}>
      {/* ========================================== */}
      {/* 1. HEADER HALAMAN & MASTER STATUS */}
      {/* ========================================== */}
      <View style={styles.pageHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Chatbot AI</Text>
            <View
              style={[
                styles.statusBadge,
                currentStatus === 'ready' && styles.statusBadgeReady,
                currentStatus === 'unconfigured' && styles.statusBadgeWarn,
                currentStatus === 'disabled' && styles.statusBadgeDisabled,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  currentStatus === 'ready' && styles.statusDotReady,
                  currentStatus === 'unconfigured' && styles.statusDotWarn,
                  currentStatus === 'disabled' && styles.statusDotDisabled,
                ]}
              />
              <Text
                style={[
                  styles.statusBadgeText,
                  currentStatus === 'ready' && styles.statusBadgeTextReady,
                  currentStatus === 'unconfigured' && styles.statusBadgeTextWarn,
                  currentStatus === 'disabled' && styles.statusBadgeTextDisabled,
                ]}
              >
                {currentStatus === 'ready'
                  ? 'Siap Diuji'
                  : currentStatus === 'unconfigured'
                  ? 'Belum Dikonfigurasi'
                  : 'Dinonaktifkan'}
              </Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>
            Atur perilaku asisten otomatis WhatsApp, basis pengetahuan organisasi, aturan respon anti-halusinasi, dan alur eskalasi ke staf CS.
          </Text>
        </View>

        {/* Action Buttons & Master Toggle */}
        <View style={styles.headerActions}>
          {/* Toggle Switch Aktif/Nonaktif */}
          <TouchableOpacity
            style={[styles.masterToggleBtn, isEnabled ? styles.masterToggleActive : styles.masterToggleInactive]}
            activeOpacity={0.8}
            onPress={() => setIsEnabled(!isEnabled)}
          >
            <View style={[styles.toggleThumb, isEnabled ? styles.toggleThumbRight : styles.toggleThumbLeft]} />
            <Text style={[styles.masterToggleLabel, isEnabled ? styles.masterToggleLabelActive : styles.masterToggleLabelInactive]}>
              {isEnabled ? 'Bot Aktif' : 'Bot Nonaktif'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryHeaderBtn}
            onPress={() => setActiveTab('simulator')}
          >
            <AppIcon name="bot" size={15} color={COLORS.forestDark} />
            <Text style={styles.secondaryHeaderBtnText}>Uji Chatbot</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryHeaderBtn, isSaving && { opacity: 0.7 }]}
            onPress={handleSaveSettings}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <AppIcon name="check" size={15} color="#FFFFFF" />
            )}
            <Text style={styles.primaryHeaderBtnText}>
              {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* FEEDBACK TOAST / BANNER */}
      {feedbackMsg && (
        <View
          style={[
            styles.feedbackBanner,
            feedbackMsg.type === 'success' && styles.feedbackSuccess,
            feedbackMsg.type === 'error' && styles.feedbackError,
            feedbackMsg.type === 'info' && styles.feedbackInfo,
          ]}
        >
          <AppIcon
            name={feedbackMsg.type === 'error' ? 'alert' : 'check'}
            size={16}
            color={
              feedbackMsg.type === 'success'
                ? '#047857'
                : feedbackMsg.type === 'error'
                ? '#B91C1C'
                : '#1D4ED8'
            }
          />
          <Text
            style={[
              styles.feedbackBannerText,
              feedbackMsg.type === 'success' && { color: '#047857' },
              feedbackMsg.type === 'error' && { color: '#B91C1C' },
              feedbackMsg.type === 'info' && { color: '#1D4ED8' },
            ]}
          >
            {feedbackMsg.text}
          </Text>
        </View>
      )}

      {/* BANNER DISCLAIMER / STATUS ENGINE AI */}
      <View style={[styles.simulationNoticeCard, hasAiBackend && styles.aiNoticeCard]}>
        <View style={[styles.noticeIconBox, hasAiBackend && { backgroundColor: '#F3E8FF' }]}>
          <AppIcon name={hasAiBackend ? 'bot' : 'alert'} size={18} color={hasAiBackend ? '#7E22CE' : '#B45309'} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Text style={[styles.noticeTitle, hasAiBackend && { color: '#6B21A8' }]}>
              {hasAiBackend
                ? 'Backend Supabase Edge Function & Gemini AI Aktif'
                : 'Mode Simulasi Lokal (Prototipe AI Mandiri)'}
            </Text>
            <View style={[styles.demoPill, hasAiBackend && { backgroundColor: '#E9D5FF' }]}>
              <Text style={[styles.demoPillText, hasAiBackend && { color: '#7E22CE' }]}>
                {hasAiBackend ? 'GEMINI LIVE' : 'SIMULASI'}
              </Text>
            </View>
          </View>
          <Text style={[styles.noticeText, hasAiBackend && { color: '#581C87' }]}>
            {hasAiBackend
              ? 'Asisten WABiz terhubung ke backend Supabase Edge Function yang memproses query menggunakan Google Gemini API. Pengetahuan dijaga ketat oleh data resmi Profil Organisasi untuk mencegah halusinasi.'
              : 'Asisten WABiz saat ini berjalan dalam mode simulasi berbasis aturan lokal tanpa biaya API eksternal dan belum terhubung ke nomor WhatsApp nyata. Seluruh respon dijawab secara ketat (grounded) berdasarkan Profil Organisasi Anda untuk mencegah halusinasi data.'}
          </Text>
        </View>
        <TouchableOpacity style={styles.resetGhostBtn} onPress={handleResetDefault}>
          <AppIcon name="refresh" size={13} color={COLORS.textSecondary} />
          <Text style={styles.resetGhostBtnText}>Reset Preset</Text>
        </TouchableOpacity>
      </View>

      {/* ========================================== */}
      {/* 2. TAB NAVIGATOR */}
      {/* ========================================== */}
      <View style={styles.tabNavContainer}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'profile' && styles.tabItemActive]}
          onPress={() => setActiveTab('profile')}
        >
          <AppIcon
            name="users"
            size={15}
            color={activeTab === 'profile' ? COLORS.emerald : COLORS.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>
            1. Profil Organisasi (Knowledge)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'rules' && styles.tabItemActive]}
          onPress={() => setActiveTab('rules')}
        >
          <AppIcon
            name="settings"
            size={15}
            color={activeTab === 'rules' ? COLORS.emerald : COLORS.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'rules' && styles.tabTextActive]}>
            2. Aturan Respon & Sambutan
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'intent' && styles.tabItemActive]}
          onPress={() => setActiveTab('intent')}
        >
          <AppIcon
            name="campaign"
            size={15}
            color={activeTab === 'intent' ? COLORS.emerald : COLORS.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'intent' && styles.tabTextActive]}>
            3. Deteksi Minat Pendaftaran
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'escalation' && styles.tabItemActive]}
          onPress={() => setActiveTab('escalation')}
        >
          <AppIcon
            name="phone"
            size={15}
            color={activeTab === 'escalation' ? COLORS.emerald : COLORS.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'escalation' && styles.tabTextActive]}>
            4. Penerusan CS & Alur
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'simulator' && styles.tabItemActive]}
          onPress={() => setActiveTab('simulator')}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppIcon
              name="chat"
              size={15}
              color={activeTab === 'simulator' ? COLORS.emerald : COLORS.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === 'simulator' && styles.tabTextActive]}>
              5. Simulator Chat
            </Text>
            <View style={styles.tabBadgeLive}>
              <Text style={styles.tabBadgeLiveText}>LIVE</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* ========================================== */}
      {/* 3. KONTEN TAB: PROFIL ORGANISASI */}
      {/* ========================================== */}
      {activeTab === 'profile' && (
        <View style={styles.tabContentCard}>
          <View style={styles.sectionTitleBlock}>
            <Text style={styles.sectionMainTitle}>Profil Resmi Lembaga & Basis Pengetahuan</Text>
            <Text style={styles.sectionSubtitle}>
              Informasi ini menjadi satu-satunya sumber kebenaran resmi yang digunakan chatbot untuk menjawab pertanyaan. Chatbot tidak akan mengarang hal yang tidak Anda masukkan di sini.
            </Text>
          </View>

          <View style={styles.formGrid}>
            {/* Nama Lembaga */}
            <View style={styles.formColFull}>
              <Text style={styles.inputLabel}>
                Nama Lembaga / Yayasan <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                value={profile.orgName}
                onChangeText={(text) => setProfile({ ...profile, orgName: text })}
                placeholder="Contoh: Pesantren Modern Darul Ulum WABiz"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Deskripsi Resmi */}
            <View style={styles.formColFull}>
              <Text style={styles.inputLabel}>
                Deskripsi Resmi Lembaga <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={profile.officialDescription}
                onChangeText={(text) => setProfile({ ...profile, officialDescription: text })}
                placeholder="Jelaskan visi, fokus pendidikan, kurikulum, dan nilai utama lembaga..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
              />
              <Text style={styles.helperText}>
                {'Digunakan chatbot saat pengguna bertanya "Tentang lembaga", "Apa visi pesantren", atau "Profil WABiz".'}
              </Text>
            </View>

            {/* Jumlah Santri / Siswa */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.inputLabel}>Jumlah Santri / Siswa Aktif</Text>
              <TextInput
                style={styles.textInput}
                value={profile.studentCount}
                onChangeText={(text) => setProfile({ ...profile, studentCount: text })}
                placeholder="Contoh: 1.250 Santri (Putra & Putri)"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Tenaga Pengajar & Staf */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.inputLabel}>Jumlah Tenaga Pengajar & Asatidz</Text>
              <TextInput
                style={styles.textInput}
                value={profile.staffCount}
                onChangeText={(text) => setProfile({ ...profile, staffCount: text })}
                placeholder="Contoh: 85 Asatidz & Staf Profesional"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Alamat Lengkap */}
            <View style={styles.formColFull}>
              <Text style={styles.inputLabel}>
                Alamat Lengkap Lembaga <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                value={profile.address}
                onChangeText={(text) => setProfile({ ...profile, address: text })}
                placeholder="Jalan, kelurahan, kecamatan, kota, provinsi, kode pos"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* URL Google Maps */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.inputLabel}>URL Lokasi Google Maps</Text>
              <TextInput
                style={[styles.textInput, !isMapsUrlValid && styles.inputInvalid]}
                value={profile.mapsUrl}
                onChangeText={(text) => setProfile({ ...profile, mapsUrl: text })}
                placeholder="https://maps.google.com/?q=..."
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
              />
              {!isMapsUrlValid && (
                <Text style={styles.errorText}>URL harus diawali dengan http:// atau https://</Text>
              )}
            </View>

            {/* URL Pendaftaran Online */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.inputLabel}>URL Formulir / Situs Pendaftaran Resmi</Text>
              <TextInput
                style={[styles.textInput, !isRegUrlValid && styles.inputInvalid]}
                value={profile.registrationUrl}
                onChangeText={(text) => setProfile({ ...profile, registrationUrl: text })}
                placeholder="https://psb.darululum-wabiz.sch.id"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="none"
              />
              {!isRegUrlValid && (
                <Text style={styles.errorText}>URL harus diawali dengan http:// atau https://</Text>
              )}
            </View>

            {/* Jam Operasional CS */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.inputLabel}>Jam Operasional Customer Service</Text>
              <TextInput
                style={styles.textInput}
                value={profile.csHours}
                onChangeText={(text) => setProfile({ ...profile, csHours: text })}
                placeholder="Contoh: Senin - Sabtu: 08.00 - 16.00 WIB"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Kontak Resmi untuk Eskalasi */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.inputLabel}>Nomor / Kontak Resmi untuk Eskalasi</Text>
              <TextInput
                style={styles.textInput}
                value={profile.escalationPhone}
                onChangeText={(text) => setProfile({ ...profile, escalationPhone: text })}
                placeholder="Contoh: +62 812-3456-7890"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Informasi Biaya Resmi */}
            <View style={styles.formColFull}>
              <Text style={styles.inputLabel}>Informasi Biaya Resmi & SPP</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={profile.tuitionInfo}
                onChangeText={(text) => setProfile({ ...profile, tuitionInfo: text })}
                placeholder="Cantumkan biaya formulir pendaftaran, uang pangkal, atau arahan verifikasi langsung ke CS Keuangan..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={2}
              />
              <Text style={styles.helperText}>
                Catatan Penting: Jika bagian ini dikosongkan, chatbot secara tegas menyatakan rincian biaya belum dipublikasikan dan menawarkan bantuan CS manusia.
              </Text>
            </View>

            {/* Jadwal PSB & Syarat */}
            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.inputLabel}>Jadwal Seleksi / Gelombang Pendaftaran</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={profile.admissionSchedule}
                onChangeText={(text) => setProfile({ ...profile, admissionSchedule: text })}
                placeholder="Gelombang 1: 1 Okt - 30 Nov 2026..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={isDesktop ? styles.formColHalf : styles.formColFull}>
              <Text style={styles.inputLabel}>Fasilitas Unggulan Kampus</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={profile.facilities}
                onChangeText={(text) => setProfile({ ...profile, facilities: text })}
                placeholder="Masjid 2 lantai, asrama ber-AC, lab komputer, poliklinik 24 jam..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={2}
              />
            </View>
          </View>

          {/* Tombol Simpan Tab */}
          <View style={styles.formFooterRow}>
            <TouchableOpacity
              style={[styles.saveTabBtn, isSaving && { opacity: 0.7 }]}
              onPress={handleSaveSettings}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <AppIcon name="check" size={15} color="#FFFFFF" />
              )}
              <Text style={styles.saveTabBtnText}>
                {isSaving ? 'Menyimpan...' : 'Simpan Perubahan Profil'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================== */}
      {/* 4. KONTEN TAB: ATURAN JAWABAN AI */}
      {/* ========================================== */}
      {activeTab === 'rules' && (
        <View style={styles.tabContentCard}>
          <View style={styles.sectionTitleBlock}>
            <Text style={styles.sectionMainTitle}>Aturan Respon, Pesan Sambutan & Kebijakan Anti-Halusinasi</Text>
            <Text style={styles.sectionSubtitle}>
              Tentukan salam pembuka resmi, gaya penyampaian asisten, panjang balasan, serta batasan ketat agar bot tidak pernah mengarang informasi yang tidak valid.
            </Text>
          </View>

          {/* PESAN SAMBUTAN OTOMATIS (WELCOME MESSAGE) */}
          <View style={styles.settingBlock}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.settingBlockLabel}>
                Pesan Sambutan Otomatis (Welcome Message) <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TouchableOpacity
                style={styles.resetGhostBtn}
                onPress={() => setWelcomeMessage(DEFAULT_WELCOME_MESSAGE)}
              >
                <AppIcon name="refresh" size={12} color={COLORS.textSecondary} />
                <Text style={styles.resetGhostBtnText}>Preset Standar</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={welcomeMessage}
              onChangeText={setWelcomeMessage}
              placeholder="Masukkan pesan sambutan pembuka otomatis saat kontak pertama kali menyapa..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={3}
            />
            <Text style={styles.helperText}>
              Pesan pembuka resmi yang dikirimkan secara otomatis kepada pengguna saat memulai percakapan baru atau saat menguji simulasi bot.
            </Text>
          </View>

          {/* PILIHAN GAYA BAHASA */}
          <View style={styles.settingBlock}>
            <Text style={styles.settingBlockLabel}>Gaya Bahasa & Nada Bicara (Tone of Voice)</Text>
            <View style={styles.choiceRow}>
              {[
                {
                  id: 'formal',
                  title: 'Formal',
                  desc: 'Santun, menggunakan tata bahasa baku KBBI, cocok untuk hubungan institusional resmi.',
                },
                {
                  id: 'friendly',
                  title: 'Ramah (Recommended)',
                  desc: 'Hangat, suportif, menyapa wali santri dengan akrab dan santun kekeluargaan.',
                },
                {
                  id: 'professional',
                  title: 'Profesional',
                  desc: 'Lugas, ringkas, informatif khas B2B CRM modern tanpa basa-basi berlebih.',
                },
              ].map((item) => {
                const isSelected = rules.tone === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.choiceCard, isSelected && styles.choiceCardActive]}
                    onPress={() => setRules({ ...rules, tone: item.id as ToneType })}
                  >
                    <View style={styles.choiceHeader}>
                      <View style={[styles.choiceRadio, isSelected && styles.choiceRadioActive]}>
                        {isSelected && <View style={styles.choiceRadioInner} />}
                      </View>
                      <Text style={[styles.choiceTitle, isSelected && styles.choiceTitleActive]}>
                        {item.title}
                      </Text>
                    </View>
                    <Text style={styles.choiceDesc}>{item.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* PILIHAN PANJANG JAWABAN */}
          <View style={styles.settingBlock}>
            <Text style={styles.settingBlockLabel}>Panjang Balasan Pesan</Text>
            <View style={styles.choiceRow}>
              {[
                {
                  id: 'concise',
                  title: 'Ringkas',
                  desc: '1-2 kalimat padat langsung ke poin utama untuk pengguna yang serba cepat.',
                },
                {
                  id: 'balanced',
                  title: 'Seimbang (Default)',
                  desc: '2-4 kalimat dengan penjelasan pokok dan arahan tindakan yang nyaman dibaca.',
                },
                {
                  id: 'detailed',
                  title: 'Detail & Komprehensif',
                  desc: 'Penjelasan lengkap disertai poin-poin terstruktur, jam kerja, dan tautan resmi.',
                },
              ].map((item) => {
                const isSelected = rules.answerLength === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.choiceCard, isSelected && styles.choiceCardActive]}
                    onPress={() => setRules({ ...rules, answerLength: item.id as LengthType })}
                  >
                    <View style={styles.choiceHeader}>
                      <View style={[styles.choiceRadio, isSelected && styles.choiceRadioActive]}>
                        {isSelected && <View style={styles.choiceRadioInner} />}
                      </View>
                      <Text style={[styles.choiceTitle, isSelected && styles.choiceTitleActive]}>
                        {item.title}
                      </Text>
                    </View>
                    <Text style={styles.choiceDesc}>{item.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* PILIHAN BAHASA DAN SALAM */}
          <View style={styles.settingBlock}>
            <Text style={styles.settingBlockLabel}>Bahasa & Pola Salam</Text>
            <View style={styles.choiceRow}>
              {[
                {
                  id: 'id_islamic',
                  title: 'Indonesia + Salam Islami',
                  desc: "Diawali Assalamu'alaikum Wr. Wb. Sangat sesuai untuk kultur pesantren & madrasah.",
                },
                {
                  id: 'id',
                  title: 'Bahasa Indonesia Standar',
                  desc: 'Salam universal formal (Selamat pagi/siang, Salam hangat) untuk audiens umum.',
                },
                {
                  id: 'en',
                  title: 'English (International)',
                  desc: 'Respon berbahasa Inggris untuk calon santri mancanegara atau program internasional.',
                },
              ].map((item) => {
                const isSelected = rules.language === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.choiceCard, isSelected && styles.choiceCardActive]}
                    onPress={() => setRules({ ...rules, language: item.id as LanguageType })}
                  >
                    <View style={styles.choiceHeader}>
                      <View style={[styles.choiceRadio, isSelected && styles.choiceRadioActive]}>
                        {isSelected && <View style={styles.choiceRadioInner} />}
                      </View>
                      <Text style={[styles.choiceTitle, isSelected && styles.choiceTitleActive]}>
                        {item.title}
                      </Text>
                    </View>
                    <Text style={styles.choiceDesc}>{item.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* KOTAK MODE ANTI-HALUSINASI KETAT */}
          <View style={styles.strictCard}>
            <View style={styles.strictCardHeader}>
              <View style={styles.shieldIconBox}>
                <AppIcon name="check" size={16} color="#047857" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.strictTitle}>Mode Anti-Halusinasi WABiz (Strict Grounding)</Text>
                <Text style={styles.strictSubtitle}>
                  Chatbot dilarang keras mengarang biaya, jadwal tes, kuota, atau janji penerimaan yang tidak tercantum di Profil Organisasi.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.subToggle, rules.strictGrounding ? styles.subToggleOn : styles.subToggleOff]}
                onPress={() => setRules({ ...rules, strictGrounding: !rules.strictGrounding })}
              >
                <View style={[styles.subToggleThumb, rules.strictGrounding ? styles.subToggleThumbOn : styles.subToggleThumbOff]} />
              </TouchableOpacity>
            </View>

            <View style={styles.strictRuleList}>
              <View style={styles.strictRuleItem}>
                <View style={styles.strictDot} />
                <Text style={styles.strictRuleText}>
                  Jika ditanya biaya dan data biaya kosong: Bot wajib mengakui belum tersedia dan menawarkan bantuan CS.
                </Text>
              </View>
              <View style={styles.strictRuleItem}>
                <View style={styles.strictDot} />
                <Text style={styles.strictRuleText}>
                  Jika ditanya hal di luar profil: Mengarahkan secara sopan ke penerusan customer service resmi.
                </Text>
              </View>
            </View>
          </View>

          {/* Tombol Simpan Tab */}
          <View style={styles.formFooterRow}>
            <TouchableOpacity
              style={[styles.saveTabBtn, isSaving && { opacity: 0.7 }]}
              onPress={handleSaveSettings}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <AppIcon name="check" size={15} color="#FFFFFF" />
              )}
              <Text style={styles.saveTabBtnText}>
                {isSaving ? 'Menyimpan...' : 'Simpan Aturan Respon & Sambutan'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================== */}
      {/* 5. KONTEN TAB: DETEKSI MINAT & INTENT */}
      {/* ========================================== */}
      {activeTab === 'intent' && (
        <View style={styles.tabContentCard}>
          <View style={styles.sectionTitleBlock}>
            <Text style={styles.sectionMainTitle}>Deteksi Niat Calon Pendaftar (Lead Intent Engine)</Text>
            <Text style={styles.sectionSubtitle}>
              Otomatis mengenali pertanyaan calon santri atau orang tua yang berniat mendaftar, lalu memberikan aksi proaktif secara instan.
            </Text>
          </View>

          {/* Toggle Utama Deteksi Niat */}
          <View style={styles.switchRowCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchCardTitle}>Aktifkan Deteksi Niat Pendaftaran</Text>
              <Text style={styles.switchCardDesc}>
                Pindai pesan masuk untuk mendeteksi intensi calon santri baru secara otomatis.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.subToggle, intentRules.enabled ? styles.subToggleOn : styles.subToggleOff]}
              onPress={() => setIntentRules({ ...intentRules, enabled: !intentRules.enabled })}
            >
              <View style={[styles.subToggleThumb, intentRules.enabled ? styles.subToggleThumbOn : styles.subToggleThumbOff]} />
            </TouchableOpacity>
          </View>

          {/* Kata Kunci Pemicu (Chips) */}
          <View style={styles.settingBlock}>
            <Text style={styles.settingBlockLabel}>Kata Kunci Pemicu Terdaftar (Intent Triggers)</Text>
            <View style={styles.keywordChipsContainer}>
              {intentRules.triggerKeywords.map((kw, idx) => (
                <View key={idx} style={styles.keywordChip}>
                  <Text style={styles.keywordChipText}>&ldquo;{kw}&rdquo;</Text>
                </View>
              ))}
            </View>
            <Text style={styles.helperText}>
              Bila pengguna mengetik salah satu kata kunci di atas, sistem akan mengidentifikasi percakapan sebagai calon pendaftar potensial.
            </Text>
          </View>

          {/* Aksi Otomatis Ketika Niat Terdeteksi */}
          <View style={styles.settingBlock}>
            <Text style={styles.settingBlockLabel}>Aksi Otomatis Ketika Niat Pendaftaran Terdeteksi</Text>
            
            <View style={styles.actionCheckboxList}>
              {/* Aksi 1: Kirim Tautan Form */}
              <TouchableOpacity
                style={styles.actionCheckboxItem}
                onPress={() =>
                  setIntentRules({
                    ...intentRules,
                    actionSendRegLink: !intentRules.actionSendRegLink,
                  })
                }
              >
                <View
                  style={[
                    styles.checkboxBox,
                    intentRules.actionSendRegLink && styles.checkboxBoxChecked,
                  ]}
                >
                  {intentRules.actionSendRegLink && <AppIcon name="check" size={12} color="#FFFFFF" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionCheckboxTitle}>Kirimkan tautan formulir pendaftaran online resmi</Text>
                  <Text style={styles.actionCheckboxSubtitle}>
                    Menyertakan link {profile.registrationUrl || 'portal PSB'} langsung di pesan balasan.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Aksi 2: Tawarkan Bantuan CS */}
              <TouchableOpacity
                style={styles.actionCheckboxItem}
                onPress={() =>
                  setIntentRules({
                    ...intentRules,
                    actionOfferCS: !intentRules.actionOfferCS,
                  })
                }
              >
                <View
                  style={[
                    styles.checkboxBox,
                    intentRules.actionOfferCS && styles.checkboxBoxChecked,
                  ]}
                >
                  {intentRules.actionOfferCS && <AppIcon name="check" size={12} color="#FFFFFF" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionCheckboxTitle}>Tawarkan penerusan langsung ke Customer Service</Text>
                  <Text style={styles.actionCheckboxSubtitle}>
                    Memberikan opsi eskalasi satu klik ke panitia admisi bila calon pendaftar membutuhkan bantuan khusus.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Aksi 3: Beri Tag Lead Baru */}
              <TouchableOpacity
                style={styles.actionCheckboxItem}
                onPress={() =>
                  setIntentRules({
                    ...intentRules,
                    actionTagLead: !intentRules.actionTagLead,
                  })
                }
              >
                <View
                  style={[
                    styles.checkboxBox,
                    intentRules.actionTagLead && styles.checkboxBoxChecked,
                  ]}
                >
                  {intentRules.actionTagLead && <AppIcon name="check" size={12} color="#FFFFFF" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionCheckboxTitle}>{'Tandai percakapan sebagai "Calon Pendaftar Potensial"'}</Text>
                  <Text style={styles.actionCheckboxSubtitle}>
                    Menambahkan label hijau pada kotak masuk Percakapan agar diprioritaskan oleh tim CS.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Aksi 4: Notifikasi Admin */}
              <TouchableOpacity
                style={styles.actionCheckboxItem}
                onPress={() =>
                  setIntentRules({
                    ...intentRules,
                    actionNotifyAdmin: !intentRules.actionNotifyAdmin,
                  })
                }
              >
                <View
                  style={[
                    styles.checkboxBox,
                    intentRules.actionNotifyAdmin && styles.checkboxBoxChecked,
                  ]}
                >
                  {intentRules.actionNotifyAdmin && <AppIcon name="check" size={12} color="#FFFFFF" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionCheckboxTitle}>Kirim ringkasan lead ke dashboard admin WABiz</Text>
                  <Text style={styles.actionCheckboxSubtitle}>
                    Memperbarui metrik calon santri masuk pada layar Dashboard secara real-time.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tombol Simpan Tab */}
          <View style={styles.formFooterRow}>
            <TouchableOpacity
              style={[styles.saveTabBtn, isSaving && { opacity: 0.7 }]}
              onPress={handleSaveSettings}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <AppIcon name="check" size={15} color="#FFFFFF" />
              )}
              <Text style={styles.saveTabBtnText}>
                {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan Deteksi Minat'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================== */}
      {/* 6. KONTEN TAB: PENERUSAN CS & ESKALASI */}
      {/* ========================================== */}
      {activeTab === 'escalation' && (
        <View style={styles.tabContentCard}>
          <View style={styles.sectionTitleBlock}>
            <Text style={styles.sectionMainTitle}>Penerusan CS & Alur Eskalasi Manusia</Text>
            <Text style={styles.sectionSubtitle}>
              Atur bagaimana percakapan diteruskan dari asisten bot ke staf manusia ketika penanya membutuhkan penanganan lebih lanjut.
            </Text>
          </View>

          {/* Switch Penerusan CS */}
          <View style={styles.switchRowCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchCardTitle}>Aktifkan Alur Penerusan ke Tim CS</Text>
              <Text style={styles.switchCardDesc}>
                Izinkan bot mentransfer percakapan langsung ke staf CS saat bot tidak dapat menjawab atau diminta oleh pengguna.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.subToggle, escalation.enabled ? styles.subToggleOn : styles.subToggleOff]}
              onPress={() => setEscalation({ ...escalation, enabled: !escalation.enabled })}
            >
              <View style={[styles.subToggleThumb, escalation.enabled ? styles.subToggleThumbOn : styles.subToggleThumbOff]} />
            </TouchableOpacity>
          </View>

          {/* Pilihan Departemen Tujuan */}
          <View style={styles.settingBlock}>
            <Text style={styles.settingBlockLabel}>Departemen / Tim Tujuan Penerusan Utama</Text>
            <View style={styles.choiceRow}>
              {[
                {
                  id: 'psb',
                  title: 'CS Pendaftaran (PSB)',
                  desc: 'Menangani registrasi santri, jadwal tes wawancara, dan berkas persyaratan.',
                },
                {
                  id: 'general',
                  title: 'CS Layanan Umum & Humas',
                  desc: 'Menangani informasi umum kampus, kunjungan tamu, dan profil yayasan.',
                },
                {
                  id: 'finance',
                  title: 'CS Bagian Keuangan',
                  desc: 'Menangani konfirmasi pembayaran, uang pangkal, dan nomor rekening resmi.',
                },
                {
                  id: 'supervisor',
                  title: 'Supervisor Tim CS',
                  desc: 'Menangani keluhan mendesak dan eskalasi tingkat tinggi langsung ke pimpinan.',
                },
                {
                  id: 'admin',
                  title: 'Administrasi & Tata Usaha',
                  desc: 'Menangani surat-menyurat resmi, legalitas dokumen, dan bantuan teknis.',
                },
              ].map((item) => {
                const isSelected = escalation.destinationDepartment === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.choiceCard, isSelected && styles.choiceCardActive]}
                    onPress={() =>
                      setEscalation({
                        ...escalation,
                        destinationDepartment: item.id as DepartmentType,
                      })
                    }
                  >
                    <View style={styles.choiceHeader}>
                      <View style={[styles.choiceRadio, isSelected && styles.choiceRadioActive]}>
                        {isSelected && <View style={styles.choiceRadioInner} />}
                      </View>
                      <Text style={[styles.choiceTitle, isSelected && styles.choiceTitleActive]}>
                        {item.title}
                      </Text>
                    </View>
                    <Text style={styles.choiceDesc}>{item.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* PREVIEW RINGKASAN INFORMASI YANG DITERUSKAN */}
          <View style={styles.settingBlock}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.settingBlockLabel}>
                Pratinjau Paket Data yang Diteruskan ke CS (Payload Summary)
              </Text>
              <TouchableOpacity style={styles.copyPayloadBtn} onPress={handleCopyPayload}>
                <AppIcon name="copy" size={13} color={COLORS.forestDark} />
                <Text style={styles.copyPayloadBtnText}>
                  {copiedPayload ? 'Tersalin!' : 'Salin Contoh'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              Ketika tiket eskalasi dibuat, sistem WABiz merangkum poin-poin berikut agar staf CS langsung mengetahui konteks tanpa membaca ulang seluruh riwayat chat.
            </Text>

            <View style={styles.payloadPreviewCard}>
              <View style={styles.payloadHeader}>
                <View style={styles.ticketBadge}>
                  <Text style={styles.ticketBadgeText}>{samplePayloadPreview.ticket_id}</Text>
                </View>
                <View style={styles.waitingPill}>
                  <View style={styles.waitingDot} />
                  <Text style={styles.waitingPillText}>{samplePayloadPreview.conversation_status}</Text>
                </View>
              </View>

              <View style={styles.payloadGrid}>
                <View style={styles.payloadItem}>
                  <Text style={styles.payloadItemLabel}>Nama & Kontak Penanya</Text>
                  <Text style={styles.payloadItemVal}>{samplePayloadPreview.customer_name}</Text>
                  <Text style={styles.payloadItemSub}>{samplePayloadPreview.phone_number}</Text>
                </View>
                <View style={styles.payloadItem}>
                  <Text style={styles.payloadItemLabel}>Departemen Tujuan</Text>
                  <Text style={styles.payloadItemVal}>{samplePayloadPreview.destination_department}</Text>
                  <Text style={styles.payloadItemSub}>{samplePayloadPreview.channel}</Text>
                </View>
                <View style={styles.payloadItemFull}>
                  <Text style={styles.payloadItemLabel}>Pertanyaan Terakhir Penanya</Text>
                  <Text style={styles.payloadItemVal}>&ldquo;{samplePayloadPreview.last_user_query}&rdquo;</Text>
                </View>
                <View style={styles.payloadItemFull}>
                  <Text style={styles.payloadItemLabel}>Alasan Eskalasi Otomatis</Text>
                  <Text style={styles.payloadItemReason}>{samplePayloadPreview.escalation_reason}</Text>
                </View>
                <View style={styles.payloadItem}>
                  <Text style={styles.payloadItemLabel}>Waktu Eskalasi</Text>
                  <Text style={styles.payloadItemVal}>{samplePayloadPreview.escalated_at}</Text>
                </View>
                <View style={styles.payloadItem}>
                  <Text style={styles.payloadItemLabel}>Status Prospek / Lead</Text>
                  <Text style={[styles.payloadItemVal, { color: '#047857', fontWeight: '700' }]}>
                    {samplePayloadPreview.lead_score}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Tombol Simpan Tab */}
          <View style={styles.formFooterRow}>
            <TouchableOpacity
              style={[styles.saveTabBtn, isSaving && { opacity: 0.7 }]}
              onPress={handleSaveSettings}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <AppIcon name="check" size={15} color="#FFFFFF" />
              )}
              <Text style={styles.saveTabBtnText}>
                {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan Eskalasi'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ========================================== */}
      {/* 7. KONTEN TAB: SIMULATOR CHAT INTERAKTIF */}
      {/* ========================================== */}
      {activeTab === 'simulator' && (
        <View style={styles.simulatorContainer}>
          {/* SISI KIRI: PETUNJUK & PERTANYAAN CEPAT */}
          <View style={isDesktop ? styles.simulatorLeftPanel : styles.simulatorLeftPanelMobile}>
            <View style={styles.simCardHeader}>
              <View style={styles.simHeaderIcon}>
                <AppIcon name="bot" size={16} color={COLORS.forestDark} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.simPanelTitle}>Uji Skenario Interaktif</Text>
                <Text style={styles.simPanelSub}>
                  Uji kecerdasan asisten terhadap profil lembaga yang sedang dikonfigurasi.
                </Text>
              </View>
            </View>

            {/* STATUS RINGKASAN PROFIL */}
            <View style={styles.simStatusBox}>
              <View style={styles.simStatusRow}>
                <Text style={styles.simStatusKey}>Lembaga:</Text>
                <Text style={styles.simStatusVal} numberOfLines={1}>
                  {profile.orgName || 'Belum diisi'}
                </Text>
              </View>
              <View style={styles.simStatusRow}>
                <Text style={styles.simStatusKey}>Gaya Bahasa:</Text>
                <Text style={styles.simStatusVal}>
                  {rules.tone.toUpperCase()} ({rules.language})
                </Text>
              </View>
              <View style={styles.simStatusRow}>
                <Text style={styles.simStatusKey}>Anti-Halusinasi:</Text>
                <Text style={[styles.simStatusVal, { color: '#047857', fontWeight: '700' }]}>
                  {rules.strictGrounding ? 'AKTIF (Grounded)' : 'NONAKTIF'}
                </Text>
              </View>
              <View style={styles.simStatusRow}>
                <Text style={styles.simStatusKey}>Eskalasi CS:</Text>
                <Text style={styles.simStatusVal}>
                  {escalation.enabled ? escalation.destinationDepartment.toUpperCase() : 'Nonaktif'}
                </Text>
              </View>
            </View>

            {/* CHIPS PERTANYAAN CEPAT */}
            <Text style={styles.quickPromptLabel}>Pilih Pertanyaan Uji Coba Cepat:</Text>
            <View style={styles.quickPromptGrid}>
              {[
                {
                  label: 'Bagaimana cara mendaftar santri baru?',
                  desc: 'Menguji deteksi niat pendaftaran & tautan portal PSB',
                },
                {
                  label: 'Di mana alamat lengkap lembaga & Google Maps?',
                  desc: 'Menguji rujukan alamat & link maps resmi',
                },
                {
                  label: 'Berapa biaya pendaftaran & uang pangkal?',
                  desc: 'Menguji kepatuhan anti-halusinasi biaya',
                },
                {
                  label: 'Berapa jumlah santri dan tenaga pengajar?',
                  desc: 'Menguji penyajian statistik resmi',
                },
                {
                  label: 'Kapan jam operasional dan kontak CS resmi?',
                  desc: 'Menguji informasi jam kerja & no WA eskalasi',
                },
                {
                  label: 'Saya ingin bicara langsung dengan CS pendaftaran.',
                  desc: 'Menguji pembuatan tiket transfer eskalasi',
                },
                {
                  label: 'Apakah ada kuota beasiswa luar negeri dan asrama VIP?',
                  desc: 'Menguji perilaku saat pertanyaan di luar profil (fallback)',
                },
              ].map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.quickPromptCard}
                  onPress={() => handleSendSimulatorMessage(item.label)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <AppIcon name="chat" size={13} color={COLORS.emerald} />
                    <Text style={styles.quickPromptTitle}>{item.label}</Text>
                  </View>
                  <Text style={styles.quickPromptSub}>{item.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* SISI KANAN: JENDELA PERCAKAPAN WHATSAPP */}
          <View style={isDesktop ? styles.simulatorRightPanel : styles.simulatorRightPanelMobile}>
            {/* Header Simulator WhatsApp */}
            <View style={styles.chatWindowHeader}>
              <View style={styles.chatAvatar}>
                <AppIcon name="bot" size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.chatBotName}>{profile.orgName || 'WABiz AI Assistant'}</Text>
                  <View style={[styles.waVerifiedPill, hasAiBackend && { backgroundColor: '#A855F7' }]}>
                    <Text style={[styles.waVerifiedText, hasAiBackend && { color: '#FFFFFF' }]}>
                      {hasAiBackend ? 'GEMINI AI' : 'SIMULASI'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.chatBotStatus}>
                  {isEnabled
                    ? hasAiBackend
                      ? '● Aktif (Gemini AI Cloud Terkoneksi)'
                      : '● Aktif (Mode Aturan Lokal)'
                    : '○ Nonaktif'}
                </Text>
              </View>

              <TouchableOpacity style={styles.chatResetBtn} onPress={handleClearSimulator}>
                <AppIcon name="refresh" size={14} color={COLORS.textSecondary} />
                <Text style={styles.chatResetBtnText}>Reset Chat</Text>
              </TouchableOpacity>
            </View>

            {/* Banner Atas Chat */}
            <View style={[styles.chatDisclaimerBanner, hasAiBackend && styles.chatDisclaimerBannerAi]}>
              <Text style={[styles.chatDisclaimerText, hasAiBackend && styles.chatDisclaimerTextAi]}>
                {hasAiBackend
                  ? '⚡ Mode AI Cloud: Jawaban diolah oleh Google Gemini API (Edge Function) dan dibatasi ketat oleh profil resmi lembaga untuk mencegah halusinasi data.'
                  : '🔒 Mode Simulasi Lokal: Chatbot berjalan menggunakan aturan deterministik mandiri tanpa biaya API eksternal.'}
              </Text>
            </View>

            {/* Riwayat Balon Pesan */}
            <ScrollView
              style={styles.chatMessageScroll}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {messages.map((m) => {
                const isUser = m.sender === 'user';
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.chatBubbleContainer,
                      isUser ? styles.chatBubbleUserAlign : styles.chatBubbleBotAlign,
                    ]}
                  >
                    <View
                      style={[
                        styles.chatBubble,
                        isUser ? styles.chatBubbleUser : styles.chatBubbleBot,
                      ]}
                    >
                      {/* Badge Lead atau Eskalasi */}
                      {!isUser && m.isEscalated && (
                        <View style={styles.bubbleEscalatedBadge}>
                          <AppIcon name="phone" size={11} color="#B45309" />
                          <Text style={styles.bubbleEscalatedText}>KONTAK ESKALASI CS</Text>
                        </View>
                      )}
                      {!isUser && m.leadTagged && (
                        <View style={styles.bubbleLeadBadge}>
                          <AppIcon name="check" size={11} color="#047857" />
                          <Text style={styles.bubbleLeadText}>CALON PENDAFTAR POTENSIAL</Text>
                        </View>
                      )}

                      <Text style={[styles.chatBubbleText, isUser && styles.chatBubbleTextUser]}>
                        {m.text}
                      </Text>

                      {/* Tautan Lampiran Jika Ada (Klik untuk membuka) */}
                      {m.links && m.links.length > 0 && (
                        <View style={styles.chatLinksContainer}>
                          {m.links.map((link, lidx) => (
                            <TouchableOpacity
                              key={lidx}
                              style={styles.chatLinkCard}
                              activeOpacity={0.7}
                              onPress={() => {
                                if (link.url) {
                                  Linking.openURL(link.url).catch(() => {});
                                }
                              }}
                            >
                              <AppIcon name="link" size={12} color={COLORS.emerald} />
                              <Text style={styles.chatLinkText} numberOfLines={1}>
                                {link.label} ↗
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {/* Waktu & Status Badge Asal AI */}
                      <View style={styles.chatBubbleMeta}>
                        <Text
                          style={[
                            styles.chatTimeText,
                            isUser && { color: 'rgba(255,255,255,0.75)' },
                          ]}
                        >
                          {m.timestamp}
                        </Text>
                        {!isUser && (
                          <View style={styles.bubbleSourceBadgeRow}>
                            {m.source === 'backend_edge_function' ? (
                              <View style={styles.bubbleGeminiBadge}>
                                <View style={styles.bubbleGeminiDot} />
                                <Text style={styles.bubbleGeminiText}>Gemini AI Cloud</Text>
                              </View>
                            ) : (
                              <View style={styles.bubbleLocalBadge}>
                                <Text style={styles.bubbleLocalText}>Simulasi Aturan Lokal</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}

              {isSimulating && (
                <View style={[styles.chatBubbleContainer, styles.chatBubbleBotAlign]}>
                  <View
                    style={[
                      styles.chatBubble,
                      styles.chatBubbleBot,
                      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
                    ]}
                  >
                    <ActivityIndicator size="small" color={COLORS.emerald} />
                    <Text style={{ fontSize: 11, color: COLORS.textSecondary, fontStyle: 'italic' }}>
                      Asisten memproses respon simulasi...
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Input Bar Pesan */}
            <View style={styles.chatInputBar}>
              <TextInput
                style={styles.chatTextInput}
                value={simulatorInput}
                onChangeText={setSimulatorInput}
                placeholder="Ketik pertanyaan uji coba (contoh: 'Berapa biaya pendaftaran?')..."
                placeholderTextColor={COLORS.textMuted}
                onSubmitEditing={() => handleSendSimulatorMessage()}
              />
              <TouchableOpacity
                style={[
                  styles.chatSendBtn,
                  (!simulatorInput.trim() || isSimulating) && styles.chatSendBtnDisabled,
                ]}
                onPress={() => handleSendSimulatorMessage()}
                disabled={!simulatorInput.trim() || isSimulating}
              >
                <AppIcon name="send" size={15} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ==========================================
// STYLESHEET B2B SAAS PROFESIONAL
// ==========================================
const styles = StyleSheet.create({
  pageContainer: {
    flex: 1,
    gap: 16,
  },

  // 0. LOADING & EMPTY STATES
  loadingContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  emptyStateBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 280,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.emeraldSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  emptyDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 19,
  },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: COLORS.forestDark,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // 1. HEADER
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
    minWidth: 280,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  masterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  masterToggleActive: {
    backgroundColor: COLORS.emeraldSubtle,
    borderColor: COLORS.emeraldBorder,
  },
  masterToggleInactive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  toggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  toggleThumbRight: {
    backgroundColor: COLORS.emerald,
  },
  toggleThumbLeft: {
    backgroundColor: '#94A3B8',
  },
  masterToggleLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  masterToggleLabelActive: {
    color: COLORS.emerald,
  },
  masterToggleLabelInactive: {
    color: '#64748B',
  },
  secondaryHeaderBtn: {
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
  secondaryHeaderBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.forestDark,
  },
  primaryHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.emerald,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  primaryHeaderBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // STATUS BADGES
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusBadgeReady: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusBadgeWarn: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusBadgeDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotReady: {
    backgroundColor: '#10B981',
  },
  statusDotWarn: {
    backgroundColor: '#F59E0B',
  },
  statusDotDisabled: {
    backgroundColor: '#94A3B8',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextReady: {
    color: '#047857',
  },
  statusBadgeTextWarn: {
    color: '#B45309',
  },
  statusBadgeTextDisabled: {
    color: '#64748B',
  },

  // FEEDBACK BANNER
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
  feedbackBannerText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },

  // NOTICE CARD
  simulationNoticeCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  noticeIconBox: {
    marginTop: 2,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  demoPill: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  demoPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
    letterSpacing: 0.5,
  },
  noticeText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
  },
  resetGhostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  resetGhostBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },

  // 2. TAB NAVIGATOR
  tabNavContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  tabItemActive: {
    backgroundColor: COLORS.emeraldSubtle,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.forestDark,
  },
  tabBadgeLive: {
    backgroundColor: COLORS.emerald,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  tabBadgeLiveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // 3. TAB CONTENT CARD
  tabContentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    gap: 20,
  },
  sectionTitleBlock: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 12,
  },
  sectionMainTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
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
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textDark,
    marginBottom: 5,
  },
  requiredStar: {
    color: '#DC2626',
  },
  textInput: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.textDark,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  inputInvalid: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  helperText: {
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
  formFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
  },
  saveTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.emerald,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 6,
  },
  saveTabBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // 4. ATURAN RESPON & CHOICE CARDS
  settingBlock: {
    gap: 8,
  },
  settingBlockLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  choiceCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  choiceCardActive: {
    borderColor: COLORS.emerald,
    backgroundColor: COLORS.emeraldSubtle,
  },
  choiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  choiceRadio: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: COLORS.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceRadioActive: {
    borderColor: COLORS.emerald,
  },
  choiceRadioInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.emerald,
  },
  choiceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  choiceTitleActive: {
    color: COLORS.forestDark,
  },
  choiceDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },

  // STRICT GROUNDING CARD
  strictCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  strictCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shieldIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  strictTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  strictSubtitle: {
    fontSize: 12,
    color: '#15803D',
    lineHeight: 16,
  },
  strictRuleList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  strictRuleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  strictDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#16A34A',
  },
  strictRuleText: {
    fontSize: 11,
    color: '#374151',
    lineHeight: 15,
  },

  // SUB TOGGLE SWITCH
  subToggle: {
    width: 38,
    height: 20,
    borderRadius: 10,
    padding: 2,
    justifyContent: 'center',
  },
  subToggleOn: {
    backgroundColor: COLORS.emerald,
  },
  subToggleOff: {
    backgroundColor: '#CBD5E1',
  },
  subToggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  subToggleThumbOn: {
    alignSelf: 'flex-end',
  },
  subToggleThumbOff: {
    alignSelf: 'flex-start',
  },

  // SWITCH ROW CARD
  switchRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  switchCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  switchCardDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },

  // KEYWORD CHIPS
  keywordChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keywordChip: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  keywordChipText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },

  // ACTION CHECKBOXES
  actionCheckboxList: {
    gap: 8,
  },
  actionCheckboxItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 12,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: COLORS.textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxBoxChecked: {
    backgroundColor: COLORS.emerald,
    borderColor: COLORS.emerald,
  },
  actionCheckboxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  actionCheckboxSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // PAYLOAD PREVIEW
  copyPayloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  copyPayloadBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.forestDark,
  },
  payloadPreviewCard: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
    padding: 16,
    gap: 12,
  },
  payloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    paddingBottom: 10,
  },
  ticketBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ticketBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  waitingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  waitingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  waitingPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FCD34D',
  },
  payloadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  payloadItem: {
    width: '47%',
  },
  payloadItemFull: {
    width: '100%',
  },
  payloadItemLabel: {
    fontSize: 10,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  payloadItemVal: {
    fontSize: 12,
    color: '#F8FAFC',
    fontWeight: '600',
  },
  payloadItemSub: {
    fontSize: 11,
    color: '#64748B',
  },
  payloadItemReason: {
    fontSize: 12,
    color: '#FCD34D',
    fontStyle: 'italic',
  },

  // 7. SIMULATOR LAYOUT
  simulatorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  simulatorLeftPanel: {
    flex: 1,
    minWidth: 320,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 18,
    gap: 14,
  },
  simulatorLeftPanelMobile: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 16,
    gap: 14,
  },
  simCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
  },
  simHeaderIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: COLORS.emeraldSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  simPanelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  simPanelSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },
  simStatusBox: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 6,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  simStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simStatusKey: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  simStatusVal: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textDark,
    maxWidth: '65%',
  },
  quickPromptLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
  },
  quickPromptGrid: {
    gap: 6,
  },
  quickPromptCard: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 10,
  },
  quickPromptTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textDark,
    flex: 1,
  },
  quickPromptSub: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },

  // SISI KANAN WHATSAPP CHAT
  simulatorRightPanel: {
    flex: 1.3,
    minWidth: 360,
    height: 600,
    backgroundColor: '#EFEAE2',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  simulatorRightPanelMobile: {
    width: '100%',
    height: 520,
    backgroundColor: '#EFEAE2',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  chatWindowHeader: {
    backgroundColor: '#075E54',
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#128C7E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatBotName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: 200,
  },
  waVerifiedPill: {
    backgroundColor: '#25D366',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  waVerifiedText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#075E54',
  },
  chatBotStatus: {
    fontSize: 10,
    color: '#D1E7DD',
  },
  chatResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  chatResetBtnText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  chatDisclaimerBanner: {
    backgroundColor: '#FFF9C4',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FFF59D',
  },
  chatDisclaimerText: {
    fontSize: 10,
    color: '#F57F17',
    textAlign: 'center',
    lineHeight: 14,
  },
  chatMessageScroll: {
    flex: 1,
  },
  chatBubbleContainer: {
    width: '100%',
    flexDirection: 'row',
  },
  chatBubbleUserAlign: {
    justifyContent: 'flex-end',
  },
  chatBubbleBotAlign: {
    justifyContent: 'flex-start',
  },
  chatBubble: {
    maxWidth: '82%',
    padding: 10,
    borderRadius: 8,
    gap: 6,
  },
  chatBubbleUser: {
    backgroundColor: '#005C4B',
    borderTopRightRadius: 2,
  },
  chatBubbleBot: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chatBubbleText: {
    fontSize: 12.5,
    color: '#111827',
    lineHeight: 18,
  },
  chatBubbleTextUser: {
    color: '#FFFFFF',
  },
  chatBubbleMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
  },
  chatTimeText: {
    fontSize: 9.5,
    color: '#9CA3AF',
  },
  chatGroundingTag: {
    fontSize: 9,
    color: COLORS.emerald,
    fontWeight: '700',
  },
  aiNoticeCard: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  chatDisclaimerBannerAi: {
    backgroundColor: '#F3E8FF',
    borderBottomColor: '#E9D5FF',
  },
  chatDisclaimerTextAi: {
    color: '#6B21A8',
  },
  bubbleSourceBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bubbleGeminiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  bubbleGeminiDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#7E22CE',
  },
  bubbleGeminiText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#7E22CE',
  },
  bubbleLocalBadge: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },
  bubbleLocalText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#64748B',
  },
  bubbleEscalatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  bubbleEscalatedText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
  },
  bubbleLeadBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  bubbleLeadText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
  },
  chatLinksContainer: {
    gap: 4,
    marginTop: 2,
  },
  chatLinkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 4,
    padding: 6,
  },
  chatLinkText: {
    fontSize: 11,
    color: COLORS.emerald,
    fontWeight: '600',
    flex: 1,
  },
  chatInputBar: {
    backgroundColor: '#F0F2F5',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.textDark,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chatSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00A884',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatSendBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
});
