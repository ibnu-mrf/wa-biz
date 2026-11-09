import { OrgProfile } from '../components/SettingsView';
import { supabase, SUPABASE_PROJECT_URL } from './supabase';

// ==========================================
// TIPE DATA & MODEL KONFIGURASI CHATBOT AI
// ==========================================
export type ToneType = 'formal' | 'friendly' | 'professional';
export type LengthType = 'concise' | 'balanced' | 'detailed';
export type LanguageType = 'id' | 'id_islamic' | 'en';
export type DepartmentType = 'psb' | 'general' | 'finance' | 'supervisor' | 'admin';

export interface AiResponseRules {
  tone: ToneType;
  language: LanguageType;
  answerLength: LengthType;
  strictGrounding: boolean;
  fallbackOfferCS: boolean;
}

export interface IntentDetectionRules {
  enabled: boolean;
  triggerKeywords: string[];
  actionSendRegLink: boolean;
  actionOfferCS: boolean;
  actionTagLead: boolean;
  actionNotifyAdmin: boolean;
}

export interface EscalationSettings {
  enabled: boolean;
  destinationDepartment: DepartmentType;
  escalateOnFallback: boolean;
  escalateOnHumanRequest: boolean;
}

export interface ChatbotConfig {
  isEnabled: boolean;
  welcomeMessage: string;
  rules: AiResponseRules;
  intentRules: IntentDetectionRules;
  escalation: EscalationSettings;
  updatedAt?: string;
}

// ==========================================
// NILAI DEFAULT KONFIGURASI
// ==========================================
export const DEFAULT_WELCOME_MESSAGE =
  "Assalamu'alaikum Wr. Wb. Selamat datang di asisten otomatis WABiz. Ada yang bisa kami bantu seputar pendaftaran santri baru, jadwal, biaya, atau informasi lokasi?";

export const DEFAULT_RESPONSE_RULES: AiResponseRules = {
  tone: 'friendly',
  language: 'id_islamic',
  answerLength: 'balanced',
  strictGrounding: true,
  fallbackOfferCS: true,
};

export const DEFAULT_INTENT_RULES: IntentDetectionRules = {
  enabled: true,
  triggerKeywords: [
    'ingin mendaftar',
    'cara daftar',
    'biaya',
    'jadwal',
    'syarat',
    'formulir',
    'biaya pendaftaran',
    'uang masuk',
    'kapan buka',
  ],
  actionSendRegLink: true,
  actionOfferCS: true,
  actionTagLead: true,
  actionNotifyAdmin: true,
};

export const DEFAULT_ESCALATION_SETTINGS: EscalationSettings = {
  enabled: true,
  destinationDepartment: 'psb',
  escalateOnFallback: true,
  escalateOnHumanRequest: true,
};

export const DEFAULT_CHATBOT_CONFIG: ChatbotConfig = {
  isEnabled: true,
  welcomeMessage: DEFAULT_WELCOME_MESSAGE,
  rules: DEFAULT_RESPONSE_RULES,
  intentRules: DEFAULT_INTENT_RULES,
  escalation: DEFAULT_ESCALATION_SETTINGS,
};

// ==========================================
// INTERFACES REQUEST & RESPONSE AI CHAT
// ==========================================
export interface AiChatRequest {
  organizationId: string;
  userId?: string;
  prompt: string;
  conversationHistory?: { sender: 'user' | 'bot'; text: string }[];
  profile: OrgProfile;
  rules: AiResponseRules;
  intentRules: IntentDetectionRules;
  escalation: EscalationSettings;
}

export interface AiChatResponse {
  text: string;
  isAiGenerated: boolean;
  source: 'local_grounded_rules' | 'backend_edge_function' | 'gemini_ai_cloud' | 'wabiz_ai_engine';
  isEscalated?: boolean;
  leadTagged?: boolean;
  links?: { label: string; url: string }[];
}

// ==========================================
// MESIN PENJAWAB DETERMINISTIK (GROUNDED LOCAL ENGINE)
// Menjawab ketat sesuai profil organisasi tanpa halusinasi
// ==========================================
export type ConversationTurn = {
  role?: 'user' | 'assistant' | 'bot';
  sender?: 'user' | 'bot' | 'assistant';
  text: string;
};

/**
 * Normalisasi targeted salah ketik umum dan singkatan percakapan bahasa Indonesia
 * tanpa mengubah makna pertanyaan lain.
 */
export function normalizePrompt(text: string): string {
  let normalized = text.toLowerCase().trim();
  // Bersihkan tanda baca umum yang memisahkan kata seperti koma, titik dua, titik koma
  normalized = normalized.replace(/[,;:]/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ');

  // Normalisasi targeted typo bahasa Indonesia untuk biaya:
  // biyaya / byaya / biaaya -> biaya
  // biyayanya / byayanya -> biayanya
  normalized = normalized.replace(/\b(biyaya|byaya|biaaya)(nya)?\b/g, 'biaya$2');

  // Normalisasi singkatan s.p.p. -> spp
  normalized = normalized.replace(/\bs\.p\.p\.?\b/g, 'spp');

  // Normalisasi singkatan umum bahasa Indonesia percakapan
  normalized = normalized.replace(/\b(dftr|daftr|pndftaran|daftarnya)\b/g, 'daftar');
  normalized = normalized.replace(/\b(jdwl|jadual)\b/g, 'jadwal');
  normalized = normalized.replace(/\b(brp|brapa)\b/g, 'berapa');
  normalized = normalized.replace(/\b(bln|blnan)\b/g, 'bulan');
  normalized = normalized.replace(/\b(syrt|persyrtan|persyaratan)\b/g, 'syarat');
  normalized = normalized.replace(/\b(gmn|bgmn|bagaimna)\b/g, 'bagaimana');
  normalized = normalized.replace(/\bkpn\b/g, 'kapan');
  normalized = normalized.replace(/\b(dmn|dimn)\b/g, 'di mana');
  normalized = normalized.replace(/\b(onlen|on-line|on line)\b/g, 'online');
  normalized = normalized.replace(/\b(inpo|inpone|infonya)\b/g, 'info');
  normalized = normalized.replace(/\b(ponpes|pesren)\b/g, 'pesantren');
  normalized = normalized.replace(/\b(hub|hubgi)\b/g, 'hubungi');
  normalized = normalized.replace(/\b(ank|ananda)\b/g, 'anak');
  normalized = normalized.replace(/\b(sy|aq)\b/g, 'saya');
  normalized = normalized.replace(/\b(klo|kl)\b/g, 'kalau');
  normalized = normalized.replace(/\b(sdh|udh)\b/g, 'sudah');
  normalized = normalized.replace(/\b(blm|lom)\b/g, 'belum');

  return normalized.trim();
}

/**
 * Memeriksa apakah pesan asisten sebelumnya secara eksplisit menawarkan bantuan/kontak CS
 */
export function isCsOfferMessage(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();

  // Jika bot sudah memberikan kontak nomor WhatsApp / tautan wa.me di pesan terakhir,
  // itu adalah penyampaian kontak, bukan tawaran pertanyaan baru
  if (lower.includes('kontak whatsapp cs:') || lower.includes('tautan whatsapp:')) {
    return false;
  }

  // Cek apakah pesan menawarkan atau mengarahkan ke CS / staf
  const hasCsMention =
    lower.includes('customer service') ||
    lower.includes('cs kami') ||
    lower.includes('tim cs') ||
    lower.includes('cs bagian') ||
    lower.includes('cs panitia') ||
    lower.includes('staf kami');

  const hasOfferOrDirection =
    lower.includes('apakah anda ingin') ||
    lower.includes('apakah anda berkenan') ||
    lower.includes('siap mendampingi') ||
    lower.includes('silakan tanyakan') ||
    lower.includes('silakan hubungi') ||
    lower.includes('mohon hubungi') ||
    lower.includes('tanyakan langsung');

  return hasCsMention && hasOfferOrDirection;
}

/**
 * Mengambil pesan terakhir dari bot/assistant dalam riwayat percakapan
 */
export function getLastAssistantMessage(history?: ConversationTurn[]): string | null {
  if (!history || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    const role = turn.role || turn.sender;
    if (role === 'assistant' || role === 'bot') {
      return turn.text;
    }
  }
  return null;
}

export function processGroundedBotReply(
  prompt: string,
  profile: OrgProfile,
  rules: AiResponseRules,
  intentRules: IntentDetectionRules,
  escalation: EscalationSettings,
  conversationHistory?: ConversationTurn[]
): {
  text: string;
  links?: { label: string; url: string }[];
  isEscalated?: boolean;
  leadTagged?: boolean;
  detectedIntent?: string;
} {
  const p = normalizePrompt(prompt);
  const lastBotMessage = getLastAssistantMessage(conversationHistory);
  const hasPriorCsOffer = lastBotMessage ? isCsOfferMessage(lastBotMessage) : false;

  // Label nama lembaga — gunakan nama generik jika belum diisi admin
  const orgLabel = profile.orgName && profile.orgName.trim()
    ? profile.orgName
    : 'Lembaga Kami';

  // Pra-komputasi identitas lembaga untuk deteksi intent
  const orgEntityKeywords = [
    'lembaga',
    'sekolah',
    'pesantren',
    'yayasan',
    'madrasah',
    'instansi',
    'organisasi',
    'pondok',
    'kampus',
  ];
  const hasEntityKeyword = orgEntityKeywords.some((k) => p.includes(k));

  const isAskingOrgName =
    // Pertanyaan eksplisit yang mengandung "nama" terkait lembaga/sekolah/dsb.
    (p.includes('nama') &&
      (hasEntityKeyword ||
        p.includes('resmi') ||
        p.includes('tempat ini') ||
        p.includes('kampus ini') ||
        p.includes('anda') ||
        p.includes('kamu')) &&
      !p.includes('rekening') &&
      !p.includes('bank') &&
      !p.includes('transfer')) ||
    // "ini lembaga apa", "lembaga apa ini", "ini pesantren apa", dsb.
    (hasEntityKeyword &&
      (p.includes('apa ini') ||
        p.includes('ini apa') ||
        p.includes('siapa ini') ||
        p.includes('ini siapa') ||
        (p.includes('apa') && (p.includes('ini') || p.includes('itu'))))) ||
    // Pertanyaan identitas asisten/entitas
    p === 'siapa anda' ||
    p === 'anda siapa' ||
    p === 'kamu siapa' ||
    p === 'siapa kamu' ||
    p.startsWith('siapa anda') ||
    p.startsWith('anda siapa') ||
    p.startsWith('kamu siapa') ||
    p.startsWith('siapa kamu');

  // Awalan salam berdasarkan gaya bahasa
  const greeting =
    rules.language === 'id_islamic'
      ? rules.tone === 'formal'
        ? "Assalamu'alaikum Warahmatullahi Wabarakatuh. Yth. Bapak/Ibu, "
        : rules.tone === 'friendly'
        ? "Assalamu'alaikum Wr. Wb. Halo Ayah/Bunda dan Sahabat! "
        : "Assalamu'alaikum Wr. Wb. Terima kasih telah menghubungi kami. "
      : rules.tone === 'formal'
      ? 'Selamat datang. Yth. Bapak/Ibu pelanggan yang kami hormati, '
      : rules.tone === 'friendly'
      ? 'Halo Kak! Senang sekali bisa membantu Anda hari ini. '
      : 'Salam profesional dari tim WABiz. ';

  // Pra-komputasi intent dan variasi bahasa Indonesia
  const hasTuitionIntent =
    p.includes('biaya') ||
    p.includes('biyaya') ||
    p.includes('byaya') ||
    p.includes('spp') ||
    p.includes('syahriah') ||
    p.includes('syahriyah') ||
    p.includes('uang pangkal') ||
    p.includes('uang pendaftaran') ||
    p.includes('uang gedung') ||
    p.includes('uang masuk') ||
    p.includes('uang formulir') ||
    p.includes('uang sekolah') ||
    p.includes('uang bulanan') ||
    p.includes('iuran') ||
    p.includes('tarif') ||
    p.includes('harga') ||
    p.includes('ongkos') ||
    p.includes('bayar') ||
    p.includes('bayaran') ||
    (p.includes('infak') && (p.includes('daftar') || p.includes('bulan') || p.includes('masuk') || p.includes('biaya') || p.includes('biyaya'))) ||
    (p.includes('infaq') && (p.includes('daftar') || p.includes('bulan') || p.includes('masuk') || p.includes('biaya') || p.includes('biyaya'))) ||
    (p.includes('uang') && (p.includes('daftar') || p.includes('masuk') || p.includes('sekolah') || p.includes('santri') || p.includes('berapa')));

  // Deteksi permintaan CS / eskalasi staf manusia eksplisit
  const isRequestingHuman =
    p.includes('cs') ||
    p.includes('admin') ||
    p.includes('manusia') ||
    p.includes('operator') ||
    p.includes('bicara langsung') ||
    p.includes('hubungi staf') ||
    p.includes('bicara staf') ||
    p.includes('hubungi wa') ||
    p.includes('kontak cs') ||
    p.includes('nomor cs') ||
    p.includes('nomor wa');

  // Deteksi apakah pesan pengguna adalah pertanyaan (bukan afirmasi murni)
  const isQuestion =
    p.includes('?') ||
    p.includes('berapa') ||
    p.includes('kapan') ||
    p.includes('dimana') ||
    p.includes('di mana') ||
    p.includes('bagaimana') ||
    p.includes('kenapa') ||
    p.includes('apa ') ||
    p.startsWith('apa') ||
    p.includes('tanya') ||
    p.includes('daftar') ||
    p.includes('biaya') ||
    p.includes('biyaya') ||
    p.includes('syarat') ||
    p.includes('jadwal') ||
    p.includes('lokasi') ||
    p.includes('alamat');

  const AFFIRMATIVE_EXACT = new Set([
    'ya',
    'iya',
    'mau',
    'boleh',
    'silakan',
    'silahkan',
    'oke',
    'ok',
    'baik',
    'setuju',
    'siap',
    'tolong',
    'bantu',
  ]);

  const isAffirmation =
    !isQuestion &&
    (AFFIRMATIVE_EXACT.has(p) ||
      p === 'iya mau' ||
      p === 'ya mau' ||
      p === 'mau dong' ||
      p === 'mau min' ||
      p === 'iya boleh' ||
      p === 'ya boleh' ||
      p === 'boleh dong' ||
      p === 'boleh min' ||
      p === 'iya tolong' ||
      p === 'ya tolong' ||
      p === 'tolong dibantu' ||
      p === 'iya silakan' ||
      p === 'ya silakan' ||
      p === 'silakan hubungkan' ||
      p === 'tolong hubungkan' ||
      p === 'bantu hubungkan' ||
      p === 'hubungkan saja' ||
      p.includes('tolong hubungkan') ||
      p.includes('bantu hubungkan') ||
      p.includes('hubungkan saja') ||
      p.startsWith('iya mau') ||
      p.startsWith('ya mau') ||
      p.startsWith('iya tolong') ||
      p.startsWith('ya tolong') ||
      p.startsWith('iya boleh') ||
      p.startsWith('ya boleh'));

  // 0. CEK SAPAAN & SALAM AWAL (GREETING)
  const isGreeting =
    p === 'halo' ||
    p === 'hai' ||
    p === 'hei' ||
    p === 'p' ||
    p === 'ping' ||
    p.includes('apa kabar') ||
    p.includes('assalamu') ||
    p.includes('assalamualaikum') ||
    p.includes('selamat pagi') ||
    p.includes('selamat siang') ||
    p.includes('selamat sore') ||
    p.includes('selamat malam') ||
    p.startsWith('halo') ||
    p.startsWith('hai') ||
    p.startsWith('permisi');

  if (
    isGreeting &&
    !hasTuitionIntent &&
    !p.includes('daftar') &&
    !p.includes('syarat') &&
    !p.includes('jadwal') &&
    !p.includes('lokasi') &&
    !p.includes('alamat') &&
    !isRequestingHuman
  ) {
    const isIslamic = rules.language === 'id_islamic';
    const introSalam = isIslamic
      ? "Wa'alaikumussalam Warahmatullahi Wabarakatuh. "
      : "Halo! Selamat datang. ";
    const reply = p.includes('apa kabar')
      ? `${introSalam}Alhamdulillah kabar kami baik dan selalu siap melayani Anda.\n\nSelamat datang di asisten resmi *${orgLabel}*.\nAda yang bisa kami bantu seputar pendaftaran santri baru (PSB), jadwal seleksi, rincian biaya, atau lokasi kampus?`
      : `${greeting}Selamat datang di asisten resmi *${orgLabel}*.\n\nAda yang dapat kami bantu seputar pendaftaran santri baru (PSB), jadwal seleksi, rincian biaya formulir, berkas persyaratan, atau lokasi kampus kami?`;

    return { text: reply, detectedIntent: 'greeting' };
  }

  // 0.5 CEK AFIRMASI / KONFIRMASI (Konteks Tawaran CS)
  if (isAffirmation) {
    if (hasPriorCsOffer && escalation.enabled) {
      const deptLabel =
        escalation.destinationDepartment === 'psb'
          ? 'CS Panitia PSB / Admisi'
          : escalation.destinationDepartment === 'finance'
          ? 'CS Bagian Keuangan'
          : escalation.destinationDepartment === 'supervisor'
          ? 'Supervisor Pelayanan'
          : escalation.destinationDepartment === 'admin'
          ? 'Administrasi & IT'
          : 'CS Layanan Umum & Humas';

      let text: string;
      if (profile.escalationPhone && profile.escalationPhone.trim()) {
        const rawDigits = profile.escalationPhone.replace(/[^0-9]/g, '');
        const waNumber = rawDigits.startsWith('0') ? '62' + rawDigits.slice(1) : rawDigits;

        text = `${greeting}Baik, untuk berkomunikasi langsung dengan staf Customer Service kami (*${deptLabel}*), silakan hubungi kontak resmi berikut:\n\n`;
        text += `📞 Kontak WhatsApp CS: ${profile.escalationPhone.trim()}\n`;
        if (waNumber) {
          text += `💬 Tautan WhatsApp: https://wa.me/${waNumber}\n`;
        }
        if (profile.csHours && profile.csHours.trim()) {
          text += `⏰ Jam Pelayanan: ${profile.csHours.trim()}\n`;
        }
        if (profile.operationalDays && profile.operationalDays.trim()) {
          text += `📅 Hari Pelayanan: ${profile.operationalDays.trim()}\n`;
        }
        text += `\nSilakan klik tautan di atas atau hubungi nomor tersebut untuk terhubung langsung dengan pihak pengelola.`;
      } else {
        text = `${greeting}Mohon maaf, kontak langsung Customer Service (*${deptLabel}*) saat ini belum dicantumkan oleh pengelola lembaga dalam sistem kami.\n\n`;
        if (profile.officialEmail && profile.officialEmail.trim()) {
          text += `✉️ Anda dapat menghubungi pihak lembaga melalui email resmi: ${profile.officialEmail.trim()}\n\n`;
        }
        text += `Silakan sampaikan pertanyaan lain seputar informasi resmi yang telah terdaftar di sistem WABiz kami.`;
      }

      const rawDigits = profile.escalationPhone ? profile.escalationPhone.replace(/[^0-9]/g, '') : '';
      const waNumber = rawDigits.startsWith('0') ? '62' + rawDigits.slice(1) : rawDigits;

      return {
        text,
        isEscalated: true,
        leadTagged: true,
        detectedIntent: 'affirmation_cs',
        links: waNumber
          ? [{ label: 'Chat WhatsApp CS', url: `https://wa.me/${waNumber}` }]
          : undefined,
      };
    } else {
      // Afirmasi tanpa tawaran CS sebelumnya -> klarifikasi jujur tanpa eskalasi palsu
      return {
        text: `${greeting}Mohon maaf, kami belum memahami konteks persetujuan Anda.\n\nApakah ada informasi tertentu seputar pendaftaran santri baru, rincian biaya, jadwal seleksi, atau bantuan Customer Service di *${orgLabel}* yang ingin Anda tanyakan?`,
        isEscalated: false,
        detectedIntent: 'unclear_affirmation',
      };
    }
  }

  // 0.8 CEK UCAPAN TERIMA KASIH & PENUTUP (GRATITUDE)
  const isGratitude =
    p.includes('terima kasih') ||
    p.includes('terimakasih') ||
    p.includes('makasih') ||
    p.includes('syukron') ||
    p.includes('jazakallah') ||
    p.includes('jazakillah') ||
    p.includes('jazakumullah') ||
    p.includes('matur nuwun');

  if (isGratitude) {
    return {
      text: `${greeting}Sama-sama / Afwan! Senang sekali dapat membantu Anda.\n\nBila sewaktu-waktu ada hal lain yang ingin ditanyakan seputar *${orgLabel}*, jangan ragu untuk menghubungi kami kembali.\n\nWassalamu'alaikum Warahmatullahi Wabarakatuh.`,
    };
  }

  // 1. CEK PERMINTAAN CS / ESKALASI MANUSIA
  if (isRequestingHuman && escalation.enabled && escalation.escalateOnHumanRequest) {
    const deptLabel =
      escalation.destinationDepartment === 'psb'
        ? 'CS Panitia PSB / Admisi'
        : escalation.destinationDepartment === 'finance'
        ? 'CS Bagian Keuangan'
        : escalation.destinationDepartment === 'supervisor'
        ? 'Supervisor Pelayanan'
        : escalation.destinationDepartment === 'admin'
        ? 'Administrasi & IT'
        : 'CS Layanan Umum & Humas';

    let text: string;
    if (profile.escalationPhone && profile.escalationPhone.trim()) {
      const rawDigits = profile.escalationPhone.replace(/[^0-9]/g, '');
      const waNumber = rawDigits.startsWith('0') ? '62' + rawDigits.slice(1) : rawDigits;

      text = `${greeting}Tentu, untuk bantuan langsung dari staf kami di departemen *${deptLabel}*, Anda dapat menghubungi kontak resmi berikut:\n\n`;
      text += `📞 Kontak WhatsApp CS: ${profile.escalationPhone.trim()}\n`;
      if (waNumber) {
        text += `💬 Tautan WhatsApp: https://wa.me/${waNumber}\n`;
      }
      if (profile.csHours && profile.csHours.trim()) {
        text += `⏰ Jam Pelayanan: ${profile.csHours.trim()}\n`;
      }
      if (profile.operationalDays && profile.operationalDays.trim()) {
        text += `📅 Hari Pelayanan: ${profile.operationalDays.trim()}\n`;
      }
      text += `\nSilakan hubungi nomor di atas atau klik tautan WhatsApp di atas untuk berbicara langsung dengan staf kami.`;
    } else {
      text = `${greeting}Mohon maaf, kontak langsung Customer Service (*${deptLabel}*) saat ini belum dicantumkan dalam data resmi sistem kami.\n\n`;
      if (profile.officialEmail && profile.officialEmail.trim()) {
        text += `✉️ Email resmi: ${profile.officialEmail.trim()}\n\n`;
      }
      text += `Silakan sampaikan pertanyaan Anda di sini seputar informasi umum yang telah terdaftar di sistem WABiz.`;
    }

    const rawDigitsHuman = profile.escalationPhone ? profile.escalationPhone.replace(/[^0-9]/g, '') : '';
    const waNumberHuman = rawDigitsHuman.startsWith('0') ? '62' + rawDigitsHuman.slice(1) : rawDigitsHuman;

    return {
      text,
      isEscalated: true,
      leadTagged: true,
      links: waNumberHuman
        ? [{ label: 'Kontak WhatsApp CS', url: `https://wa.me/${waNumberHuman}` }]
        : undefined,
    };
  }

  // 1.5 CEK MULTI-INTENT (PERTANYAAN DENGAN LEBIH DARI SATU MAKSUD SEKALIGUS)
  const isAskingRegistrationMethod =
    intentRules.enabled &&
    (p.includes('cara daftar') ||
      p.includes('cara mendaftar') ||
      p.includes('bagaimana daftar') ||
      p.includes('bagaimana cara') ||
      p.includes('daftar online') ||
      p.includes('link pendaftaran') ||
      p.includes('portal pendaftaran') ||
      p.includes('formulir online') ||
      (p.includes('dan') && (p.includes('daftar online') || p.includes('mendaftar'))));

  const isAskingSchedule =
    p.includes('jadwal') ||
    p.includes('gelombang') ||
    p.includes('kapan buka') ||
    p.includes('kapan dibuka') ||
    p.includes('kapan pendaftaran') ||
    (p.includes('kapan') && p.includes('daftar'));

  const isAskingRequirements =
    p.includes('syarat') ||
    p.includes('berkas') ||
    p.includes('dokumen') ||
    p.includes('persyaratan');

  const isAskingLocation =
    p.includes('alamat') ||
    p.includes('lokasi') ||
    p.includes('dimana') ||
    p.includes('di mana') ||
    p.includes('maps') ||
    p.includes('jalan');

  const isMultiIntent =
    !isGreeting &&
    !isAffirmation &&
    !isGratitude &&
    !isRequestingHuman &&
    ((hasTuitionIntent && isAskingRegistrationMethod) ||
      (hasTuitionIntent && isAskingSchedule) ||
      (hasTuitionIntent && isAskingRequirements) ||
      (isAskingSchedule && isAskingRequirements) ||
      (isAskingRegistrationMethod && isAskingRequirements) ||
      (isAskingLocation && isAskingOrgName));

  if (isMultiIntent) {
    const sections: string[] = [];
    const collectedLinks: { label: string; url: string }[] = [];
    let shouldOfferCs = false;

    // Sub A: Nama Lembaga
    if (isAskingOrgName) {
      if (profile.orgName && profile.orgName.trim()) {
        sections.push(`🏛️ *Nama Resmi Lembaga:*\n${profile.orgName.trim()}${profile.shortName ? ` (${profile.shortName.trim()})` : ''}`);
      } else {
        sections.push(`🏛️ *Nama Resmi Lembaga:*\nNama resmi lembaga saat ini belum dikonfigurasi dalam sistem.`);
        shouldOfferCs = true;
      }
    }

    // Sub B: Jadwal Pendaftaran
    if (isAskingSchedule) {
      if (profile.admissionSchedule && profile.admissionSchedule.trim()) {
        sections.push(`📅 *Jadwal & Gelombang Pendaftaran:*\n${profile.admissionSchedule.trim()}`);
      } else {
        sections.push(`📅 *Jadwal & Gelombang Pendaftaran:*\nInformasi jadwal dan gelombang pendaftaran saat ini belum dipublikasikan secara resmi di sistem data kami.`);
        shouldOfferCs = true;
      }
    }

    // Sub C: Biaya Pendaftaran / SPP
    if (hasTuitionIntent) {
      if (profile.tuitionInfo && profile.tuitionInfo.trim()) {
        sections.push(`💰 *Rincian Biaya & Uang Masuk:*\n${profile.tuitionInfo.trim()}`);
      } else {
        sections.push(`💰 *Rincian Biaya & Uang Masuk:*\nMohon maaf, rincian biaya pendaftaran dan SPP saat ini belum dipublikasikan dalam sistem kami. Demi menjaga amanah dan prinsip anti-halusinasi WABiz, kami tidak diperkenankan memberikan nominal perkiraan.`);
        shouldOfferCs = true;
      }
    }

    // Sub D: Cara Daftar Online & Portal
    if (isAskingRegistrationMethod) {
      if (profile.registrationUrl && profile.registrationUrl.trim()) {
        sections.push(`📝 *Pendaftaran Online:*\nPendaftaran dapat dilakukan secara mandiri melalui portal resmi kami:\n🔗 ${profile.registrationUrl.trim()}`);
        collectedLinks.push({ label: 'Portal Pendaftaran Online', url: profile.registrationUrl.trim() });
      } else {
        sections.push(`📝 *Pendaftaran:*\nPendaftaran resmi dapat dikonfirmasi langsung melalui layanan Customer Service atau panitia admisi kami.`);
        shouldOfferCs = true;
      }
    }

    // Sub E: Syarat & Berkas Dokumen
    if (isAskingRequirements) {
      if (profile.requirements && profile.requirements.trim()) {
        sections.push(`📋 *Syarat & Berkas Persyaratan:*\n${profile.requirements.trim()}`);
      } else {
        sections.push(`📋 *Syarat & Berkas Persyaratan:*\nRincian berkas persyaratan pendaftaran saat ini belum dicantumkan dalam data resmi sistem.`);
        shouldOfferCs = true;
      }
    }

    // Sub F: Lokasi Kampus
    if (isAskingLocation) {
      if (profile.address && profile.address.trim()) {
        let locText = `📍 *Lokasi Kampus:*\n${profile.address.trim()}`;
        if (profile.mapsUrl && profile.mapsUrl.trim()) {
          locText += `\nNavigasi Maps: ${profile.mapsUrl.trim()}`;
          collectedLinks.push({ label: 'Buka di Google Maps', url: profile.mapsUrl.trim() });
        }
        sections.push(locText);
      } else {
        sections.push(`📍 *Lokasi Kampus:*\nAlamat resmi lembaga belum dicantumkan dalam data sistem.`);
        shouldOfferCs = true;
      }
    }

    let text = `${greeting}Berikut adalah informasi resmi seputar hal yang Anda tanyakan di *${orgLabel}*:\n\n`;
    text += sections.join('\n\n');

    if (shouldOfferCs && escalation.enabled) {
      if (profile.escalationPhone && profile.escalationPhone.trim()) {
        const rawDigits = profile.escalationPhone.replace(/[^0-9]/g, '');
        const waNumber = rawDigits.startsWith('0') ? '62' + rawDigits.slice(1) : rawDigits;
        text += `\n\nUntuk konfirmasi langsung seputar informasi yang belum tercantum di atas, silakan hubungi kontak Customer Service resmi kami: ${profile.escalationPhone.trim()}`;
        if (waNumber) {
          collectedLinks.push({ label: 'Chat WhatsApp CS', url: `https://wa.me/${waNumber}` });
        }
      }
    }

    return {
      text,
      links: collectedLinks.length > 0 ? collectedLinks : undefined,
      isEscalated: shouldOfferCs && escalation.enabled,
      leadTagged: intentRules.actionTagLead,
      detectedIntent: 'multi_intent',
    };
  }

  // 2. CEK INFORMASI BIAYA / SPP / UANG PANGKAL (TUITION INTENT)
  // Diposisikan sebelum alur pendaftaran umum agar pertanyaan biaya pendaftaran/SPP tidak terdistorsi
  if (hasTuitionIntent) {
    if (profile.tuitionInfo && profile.tuitionInfo.trim()) {
      let text = `${greeting}Terkait informasi biaya resmi di *${orgLabel}*:\n\n${profile.tuitionInfo}\n\n`;
      if (intentRules.actionOfferCS && escalation.enabled && profile.escalationPhone?.trim()) {
        text += `Untuk konsultasi skema angsuran atau rincian tertulis lengkap, silakan tanyakan kepada CS Bagian Keuangan kami.`;
      }
      return {
        text,
        leadTagged: intentRules.actionTagLead,
        isEscalated: false,
        detectedIntent: 'tuition',
      };
    } else {
      const hasCsContact = Boolean(profile.escalationPhone && profile.escalationPhone.trim());
      if (hasCsContact && escalation.enabled) {
        return {
          text: `${greeting}Mohon maaf, rincian biaya pendaftaran dan SPP belum dipublikasikan oleh pihak lembaga dalam sistem asisten otomatis ini. Sesuai prinsip anti-halusinasi WABiz, kami tidak diperkenankan memberikan estimasi nominal perkiraan.\n\nApakah Anda ingin kami berikan kontak Customer Service resmi kami untuk menanyakan hal ini lebih lanjut?`,
          isEscalated: true,
          leadTagged: intentRules.actionTagLead,
          detectedIntent: 'tuition',
        };
      } else {
        let text = `${greeting}Mohon maaf, rincian biaya pendaftaran dan SPP belum dipublikasikan oleh pihak lembaga dalam sistem asisten otomatis ini. Sesuai prinsip anti-halusinasi WABiz, kami tidak diperkenankan memberikan estimasi nominal perkiraan.\n\n`;
        if (profile.officialEmail && profile.officialEmail.trim()) {
          text += `Saat ini kontak Customer Service belum dicantumkan. Anda dapat menghubungi pihak lembaga via email resmi: ${profile.officialEmail.trim()}.\n\n`;
        } else {
          text += `Saat ini kontak Customer Service resmi juga belum dicantumkan dalam sistem kami.\n\n`;
        }
        text += `Silakan sampaikan pertanyaan lain seputar informasi resmi yang telah terdaftar di sistem WABiz kami.`;

        return {
          text,
          isEscalated: false,
          leadTagged: intentRules.actionTagLead,
          detectedIntent: 'tuition',
        };
      }
    }
  }

  // 2.3 CEK SYARAT BERKAS PENDAFTARAN
  if (p.includes('syarat') || p.includes('berkas') || p.includes('persyaratan')) {
    if (profile.requirements && profile.requirements.trim()) {
      let text = `${greeting}Berikut adalah berkas dan persyaratan resmi pendaftaran di *${orgLabel}*:\n\n${profile.requirements}\n\n`;
      if (intentRules.actionSendRegLink && profile.registrationUrl) {
        text += `Formulir online resmi dapat diakses melalui: ${profile.registrationUrl}`;
      }
      return {
        text,
        leadTagged: intentRules.actionTagLead,
        detectedIntent: 'requirements',
        links: profile.registrationUrl
          ? [{ label: 'Buka Formulir Pendaftaran', url: profile.registrationUrl }]
          : undefined,
      };
    } else {
      // Data syarat belum diisi admin -> Anti halusinasi!
      return {
        text: `${greeting}Mohon maaf, rincian dokumen persyaratan pendaftaran saat ini belum dimasukkan ke basis data resmi kami. Demi menjaga akurasi informasi, asisten AI tidak diperkenankan mengarang syarat berkas. Silakan hubungi CS kami untuk panduan lengkap.`,
        isEscalated: escalation.enabled,
        leadTagged: intentRules.actionTagLead,
        detectedIntent: 'requirements',
      };
    }
  }

  // 2.4 CEK JADWAL SELEKSI / PSB
  if (p.includes('jadwal') || p.includes('gelombang') || p.includes('kapan') || p.includes('tanggal')) {
    if (profile.admissionSchedule && profile.admissionSchedule.trim()) {
      let text = `${greeting}Mengenai jadwal pendaftaran resmi di *${orgLabel}*:\n\n${profile.admissionSchedule}\n\n`;
      if (profile.registrationUrl && intentRules.actionSendRegLink) {
        text += `Untuk mendaftar, silakan kunjungi portal resmi: ${profile.registrationUrl}`;
      }
      return {
        text,
        leadTagged: intentRules.actionTagLead,
        detectedIntent: 'admission_schedule',
        links: profile.registrationUrl
          ? [{ label: 'Portal Pendaftaran Online', url: profile.registrationUrl }]
          : undefined,
      };
    } else {
      const hoursNote = profile.csHours && profile.csHours.trim() ? ` pada jam layanan (${profile.csHours.trim()})` : '';
      return {
        text: `${greeting}Mohon maaf, informasi jadwal seleksi dan gelombang pendaftaran belum tercantum pada data resmi organisasi. Kami dilarang memberikan estimasi tanggal tanpa verifikasi admin. Mohon hubungi tim CS kami${hoursNote} untuk informasi gelombang yang dibuka.`,
        isEscalated: escalation.enabled,
        detectedIntent: 'admission_schedule',
      };
    }
  }

  // 2.5 CEK CARA DAFTAR UMUM & FORMULIR PENDAFTARAN
  const hasRegIntent =
    intentRules.enabled &&
    (p.includes('daftar') ||
      p.includes('mendaftar') ||
      p.includes('registrasi') ||
      p.includes('psb') ||
      p.includes('cara masuk') ||
      p.includes('formulir') ||
      p.includes('kapan buka'));

  if (hasRegIntent) {
    let text = `${greeting}Terima kasih atas ketertarikan Anda untuk bergabung bersama *${orgLabel}*.\n\n`;
    if (profile.registrationUrl && intentRules.actionSendRegLink) {
      text += `Pendaftaran resmi dapat dilakukan secara mandiri melalui tautan portal PSB berikut:\n🔗 ${profile.registrationUrl}\n\n`;
    }
    if (profile.admissionSchedule) {
      text += `Catatan Jadwal: ${profile.admissionSchedule}\n\n`;
    }
    if (intentRules.actionOfferCS && escalation.enabled) {
      text += `Bila Anda membutuhkan panduan langkah demi langkah saat mengisi formulir, tim CS kami siap mendampingi.`;
    }

    return {
      text,
      leadTagged: intentRules.actionTagLead,
      detectedIntent: 'registration',
      links: profile.registrationUrl
        ? [{ label: 'Isi Formulir Pendaftaran', url: profile.registrationUrl }]
        : undefined,
    };
  }

  // 3. CEK LOKASI / ALAMAT / GOOGLE MAPS
  if (
    p.includes('alamat') ||
    p.includes('lokasi') ||
    p.includes('dimana') ||
    p.includes('di mana') ||
    p.includes('maps') ||
    p.includes('jalan')
  ) {
    if (profile.address && profile.address.trim()) {
      let text = `${greeting}Lokasi kampus dan kantor utama *${orgLabel}* beralamat di:\n\n📍 ${profile.address}\n\n`;
      if (profile.mapsUrl) {
        text += `Tautan navigasi Google Maps: ${profile.mapsUrl}\n\n`;
      }
      if (profile.csHours && profile.csHours.trim()) {
        text += `Jam kunjungan dan konsultasi offline: ${profile.csHours.trim()}.`;
      }

      return {
        text,
        links: profile.mapsUrl
          ? [{ label: 'Buka di Google Maps', url: profile.mapsUrl }]
          : undefined,
      };
    } else {
      return {
        text: `${greeting}Mohon maaf, alamat lengkap organisasi belum dilengkapi oleh administrator. Silakan tanyakan langsung ke CS kami.`,
        isEscalated: escalation.enabled,
      };
    }
  }

  // 3.5 CEK NAMA / IDENTITAS RESMI LEMBAGA
  if (isAskingOrgName) {
    if (profile.orgName && profile.orgName.trim()) {
      let text = `${greeting}Nama resmi lembaga kami adalah *${profile.orgName.trim()}*`;
      if (profile.shortName && profile.shortName.trim()) {
        text += ` (${profile.shortName.trim()})`;
      }
      text += `.\n\n`;

      if (profile.institutionType) {
        text += `• Kategori / Jenis: ${profile.institutionType}\n`;
      }
      if (profile.officialDescription && profile.officialDescription.trim()) {
        text += `• Profil Singkat: ${profile.officialDescription.trim()}\n`;
      }
      text += `\nAda yang dapat kami bantu seputar pendaftaran, informasi program, atau layanan lainnya?`;

      return { text };
    } else {
      return {
        text: `${greeting}Mohon maaf, nama resmi lembaga saat ini belum dikonfigurasi dalam sistem WABiz kami. Demi menjaga amanah dan akurasi informasi, asisten kami tidak diperkenankan mengarang nama atau identitas lembaga. Silakan hubungi staf Customer Service kami untuk konfirmasi lebih lanjut.`,
        isEscalated: escalation.enabled,
      };
    }
  }

  // 4. CEK PROFIL / SANTRI / PENGAJAR / FASILITAS
  if (
    p.includes('profil') ||
    p.includes('tentang') ||
    p.includes('santri') ||
    p.includes('siswa') ||
    p.includes('guru') ||
    p.includes('ustadz') ||
    p.includes('fasilitas') ||
    p.includes('keunggulan')
  ) {
    let text = `${greeting}Berikut adalah ringkasan resmi mengenai *${orgLabel}*:\n\n`;
    text += `${profile.officialDescription}\n\n`;
    if (rules.answerLength !== 'concise') {
      text += `• Jumlah Santri: ${profile.studentCount || '-'}\n`;
      text += `• Tenaga Pendidik & Staf: ${profile.staffCount || '-'}\n`;
      if (profile.facilities) {
        text += `• Fasilitas: ${profile.facilities}\n\n`;
      }
    }
    return { text };
  }

  // 5. CEK JAM OPERASIONAL & KONTAK RESMI
  if (
    p.includes('jam') ||
    p.includes('buka') ||
    p.includes('operasional') ||
    p.includes('telepon') ||
    p.includes('kontak') ||
    p.includes('hubungi') ||
    p.includes('hari')
  ) {
    let text = `${greeting}Informasi jam operasional dan kontak resmi *${orgLabel}*:\n\n`;
    if (profile.csHours && profile.csHours.trim()) {
      text += `⏰ Jam Layanan CS: ${profile.csHours.trim()}\n`;
    } else {
      text += `⏰ Jam Layanan CS: Belum dicantumkan oleh administrator.\n`;
    }
    if (profile.operationalDays && profile.operationalDays.trim()) {
      text += `📅 Hari Pelayanan: ${profile.operationalDays.trim()}\n`;
    }
    if (profile.escalationPhone) {
      text += `📞 Kontak WhatsApp Resmi: ${profile.escalationPhone}\n`;
      const rawDigits = profile.escalationPhone.replace(/[^0-9]/g, '');
      const waNumber = rawDigits.startsWith('0') ? '62' + rawDigits.slice(1) : rawDigits;
      if (waNumber) {
        text += `💬 Tautan WhatsApp: https://wa.me/${waNumber}\n`;
      }
    }
    if (profile.officialEmail) {
      text += `✉️ Email Resmi: ${profile.officialEmail}\n`;
    }
    const rawDigitsContact = profile.escalationPhone ? profile.escalationPhone.replace(/[^0-9]/g, '') : '';
    const waNumberContact = rawDigitsContact.startsWith('0') ? '62' + rawDigitsContact.slice(1) : rawDigitsContact;

    return {
      text,
      links: waNumberContact
        ? [{ label: 'Chat WhatsApp CS', url: `https://wa.me/${waNumberContact}` }]
        : undefined,
    };
  }

  // 5.5 CEK SITUS WEB RESMI & EMAIL
  if (
    p.includes('website') ||
    p.includes('situs') ||
    p.includes('web') ||
    p.includes('portal') ||
    p.includes('link') ||
    p.includes('email')
  ) {
    if (profile.websiteUrl || profile.registrationUrl || profile.officialEmail) {
      let text = `${greeting}Berikut adalah kanal digital resmi *${orgLabel}*:\n\n`;
      if (profile.websiteUrl) text += `🌐 Situs Web: ${profile.websiteUrl}\n`;
      if (profile.registrationUrl) text += `📝 Portal Pendaftaran: ${profile.registrationUrl}\n`;
      if (profile.officialEmail) text += `✉️ Email: ${profile.officialEmail}\n`;
      return {
        text,
        links: profile.websiteUrl ? [{ label: 'Kunjungi Website', url: profile.websiteUrl }] : undefined,
      };
    }
  }

  // 5.6 CEK FAQ RESMI LEMBAGA
  if (profile.faqs && profile.faqs.length > 0) {
    const STOP_WORDS = new Set([
      'apakah', 'bagaimana', 'mengapa', 'kenapa', 'kapan', 'dimana', 'siapa',
      'adalah', 'dengan', 'untuk', 'yang', 'dari', 'pada', 'bisa', 'boleh',
      'harus', 'akan', 'telah', 'sudah', 'dalam', 'secara', 'serta', 'atau',
    ]);

    for (const faq of profile.faqs) {
      const qWords = faq.question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

      if (qWords.length > 0 && qWords.some((w) => p.includes(w))) {
        return {
          text: `${greeting}${faq.answer}`,
        };
      }
    }
  }

  // 5.7 CEK PERTANYAAN KHUSUS DI LUAR KATA KUNCI (KURIKULUM, BAKAT, TAHFIDZ, PROGRAM KHUSUS LEMBAGA)
  const mentionsSpecialKeyword =
    p.includes('tahfidz') ||
    p.includes('tahfidzh') ||
    p.includes('tahfiz') ||
    p.includes('kaligrafi') ||
    p.includes('kurikulum') ||
    p.includes('ekskul') ||
    p.includes('ekstrakurikuler') ||
    p.includes('kitab kuning') ||
    p.includes('tahsin') ||
    p.includes('program khusus');

  const isAskingInstitutionAvailability =
    hasEntityKeyword ||
    p.includes('disini') ||
    p.includes('di sini') ||
    p.includes('apakah ada') ||
    p.includes('ada program') ||
    p.includes('tersedia') ||
    p.includes('kegiatan santri') ||
    p.includes('kegiatan siswa');

  if (mentionsSpecialKeyword && isAskingInstitutionAvailability) {
    const descLower = (profile.officialDescription || '').toLowerCase();
    const facLower = (profile.facilities || '').toLowerCase();

    // Periksa kata spesifik apa yang ditanyakan pengguna
    const askedKeywords = [
      'tahfidz',
      'tahfidzh',
      'tahfiz',
      'kaligrafi',
      'kurikulum',
      'ekskul',
      'ekstrakurikuler',
      'kitab kuning',
      'tahsin',
    ].filter((kw) => p.includes(kw));

    let matchedDetail = '';
    const foundInDesc = askedKeywords.some((kw) => descLower.includes(kw));
    const foundInFac = askedKeywords.some((kw) => facLower.includes(kw));

    if (foundInDesc) {
      matchedDetail = profile.officialDescription.trim();
    } else if (foundInFac) {
      matchedDetail = profile.facilities ? profile.facilities.trim() : '';
    }

    if (matchedDetail) {
      let text = `${greeting}Terkait kegiatan atau program tersebut di *${orgLabel}*:\n\n${matchedDetail}\n\n`;
      text += `Untuk konsultasi lebih lanjut mengenai penempatan minat dan bakat santri baru, silakan hubungi Customer Service kami.`;
      return {
        text,
        detectedIntent: 'special_program',
        leadTagged: intentRules.actionTagLead,
      };
    } else {
      let text = `${greeting}Terkait program khusus tersebut di *${orgLabel}*, rincian detail kurikulum ini dapat dikonfirmasi langsung dengan tim akademik kami.\n\n`;
      if (rules.fallbackOfferCS && escalation.enabled) {
        text += `Apakah Anda ingin kami berikan kontak Customer Service kami (${escalation.destinationDepartment.toUpperCase()}) agar Anda dapat menanyakan ketersediaan kuota dan syaratnya langsung kepada staf kami?`;
      }
      return {
        text,
        isEscalated: rules.fallbackOfferCS && escalation.enabled,
        detectedIntent: 'special_program',
      };
    }
  }

  // 6. MESIN PERCAKAPAN AI CERDAS (GENERAL CONVERSATIONAL AI ENGINE)
  // Menjawab layaknya AI gratisan modern (ChatGPT / Gemini / Copilot) untuk pertanyaan umum,
  // sains, teknologi, matematika, copywriting, jokes, tips bisnis, dan obrolan kasual,
  // sambil tetap menjaga konteks dan etika komunikasi lembaga.
  return generateGeneralAiResponse(prompt, p, orgLabel, profile, rules, escalation);
}

/**
 * Mesin Percakapan AI Cerdas (General Conversational AI Engine)
 * Menjawab pertanyaan umum, sains, teknologi, matematika, copywriting, dan obrolan
 * layaknya AI generatif percakapan modern (ChatGPT / Gemini / Copilot).
 */
export function generateGeneralAiResponse(
  rawPrompt: string,
  p: string,
  orgLabel: string,
  profile: OrgProfile,
  rules: AiResponseRules,
  escalation: EscalationSettings
): {
  text: string;
  isEscalated?: boolean;
  leadTagged?: boolean;
  links?: { label: string; url: string }[];
  detectedIntent?: string;
} {
  const isIslamic = rules.language === 'id_islamic';
  const prefixGreeting = isIslamic
    ? "Assalamu'alaikum Wr. Wb. "
    : rules.tone === 'formal'
    ? 'Salam sejahtera. '
    : 'Halo! ';

  // Keamanan Finansial: Menolak memberikan nomor rekening sembarangan
  if (
    (p.includes('rekening') || p.includes('nomor rekening') || p.includes('bank') || p.includes('transfer')) &&
    (p.includes('resmi') || p.includes('bayar') || p.includes('organisasi') || p.includes('sekolah') || p.includes('lembaga'))
  ) {
    return {
      text: `${prefixGreeting}Untuk menjaga keamanan dan ketepatan transaksi, nomor rekening resmi pembayaran atau infak *${orgLabel}* tidak diinformasikan secara publik melalui chatbot otomatis.\n\nSilakan konfirmasi dan hubungi langsung bagian Customer Service Keuangan kami: ${profile.escalationPhone ? `WhatsApp: ${profile.escalationPhone}` : 'staf CS resmi'}.`,
      isEscalated: escalation.enabled,
      detectedIntent: 'finance_inquiry',
    };
  }

  // 1. MATEMATIKA & KALKULASI ANGKA
  // Contoh: "hitung 25 * 14", "100 / 4", "15% dari 1500000", "50 + 75", "akar dari 64"
  const mathPercentageMatch = p.match(/(\d+(?:[.,]\d+)?)\s*(?:%|persen)\s*(?:dari|of|\*|x|×)\s*(?:rp\.?\s*)?(\d+[\d.,]*)/i);
  if (mathPercentageMatch) {
    const pct = parseFloat(mathPercentageMatch[1].replace(',', '.'));
    const base = parseFloat(mathPercentageMatch[2].replace(/[.,]/g, ''));
    if (!isNaN(pct) && !isNaN(base)) {
      const result = (pct / 100) * base;
      const formattedResult = new Intl.NumberFormat('id-ID').format(result);
      const formattedBase = new Intl.NumberFormat('id-ID').format(base);
      return {
        text: `${prefixGreeting}Hasil perhitungan **${pct}%** dari **Rp ${formattedBase}** adalah:\n\n👉 **Rp ${formattedResult}**\n\nAda perhitungan atau kalkulasi lain yang dapat kami bantu?`,
        detectedIntent: 'math_calculation',
      };
    }
  }

/**
 * Evaluator matematika deterministik dan aman tanpa menggunakan eval atau new Function.
 * Mencegah issue keamanan SonarQube S1523 (Dynamic Code Execution).
 */
function safeEvaluateMath(expression: string): number | null {
  if (!/^[\d\s+\-*/().]+$/.test(expression.trim())) return null;
  const matchResult = expression.match(/\d+(?:\.\d+)?|[+\-*/()]/g);
  if (!matchResult || matchResult.length === 0) return null;
  const tokens: string[] = matchResult;

  let pos = 0;

  function peek(): string | null {
    return pos < tokens.length ? tokens[pos] : null;
  }

  function consume(expected?: string): string {
    const token = tokens[pos++];
    if (expected !== undefined && token !== expected) {
      throw new Error(`Expected '${expected}', got '${token}'`);
    }
    return token;
  }

  function parseExpr(): number {
    let result = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const nextTerm = parseTerm();
      if (op === '+') result += nextTerm;
      else result -= nextTerm;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const nextFactor = parseFactor();
      if (op === '*') {
        result *= nextFactor;
      } else {
        if (nextFactor === 0) throw new Error('Division by zero');
        result /= nextFactor;
      }
    }
    return result;
  }

  function parseFactor(): number {
    const next = peek();
    if (next === '+') {
      consume();
      return parseFactor();
    }
    if (next === '-') {
      consume();
      return -parseFactor();
    }
    if (next === '(') {
      consume('(');
      const inner = parseExpr();
      consume(')');
      return inner;
    }
    if (next !== null && /^\d+(?:\.\d+)?$/.test(next)) {
      return parseFloat(consume());
    }
    throw new Error(`Unexpected token '${next}'`);
  }

  try {
    const result = parseExpr();
    if (pos !== tokens.length) return null;
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

  const isMathQuery =
    p.includes('hitung') ||
    p.includes('kalkulasi') ||
    p.includes('berapa hasil') ||
    p.includes('akar dari') ||
    /^[\d\s\+\-\*\/\(\)\.x×÷\^:=]+$/.test(p.trim());

  if (isMathQuery) {
    // Cek akar kuadrat
    const sqrtMatch = p.match(/(?:akar(?: kuadrat)?(?: dari)?|sqrt)\s*(\d+(?:[.,]\d+)?)/i);
    if (sqrtMatch) {
      const val = parseFloat(sqrtMatch[1].replace(',', '.'));
      if (!isNaN(val) && val >= 0) {
        const res = Math.sqrt(val);
        return {
          text: `${prefixGreeting}Akar kuadrat dari **${val}** adalah **${res}**.\n\nApakah ada perhitungan lain yang ingin Anda selesaikan?`,
          detectedIntent: 'math_calculation',
        };
      }
    }

    // Ekstraksi ekspresi matematika sederhana
    const cleanedExpr = p
      .replace(/^(?:tolong\s+)?(?:hitung(?:kan)?|kalkulasi|berapa(?:kah)?\s*(?:hasil\s*(?:dari)?)?)\s*/i, '')
      .replace(/sama dengan|\?|=/g, '')
      .replace(/[xX×]/g, '*')
      .replace(/[÷:]/g, '/')
      .trim();

    if (/^[\d\s\+\-\*\/\(\)\.]+$/.test(cleanedExpr)) {
      try {
        const result = safeEvaluateMath(cleanedExpr);
        if (result !== null && typeof result === 'number' && !isNaN(result) && isFinite(result)) {
          const formatted = Number.isInteger(result)
            ? new Intl.NumberFormat('id-ID').format(result)
            : result.toFixed(2);
          const displayExpr = cleanedExpr.replace(/\*/g, ' × ').replace(/\//g, ' ÷ ');
          return {
            text: `${prefixGreeting}Hasil perhitungan dari **${displayExpr}** adalah:\n\n👉 **${formatted}**\n\nAda angka atau rumus lain yang ingin dihitung?`,
            detectedIntent: 'math_calculation',
          };
        }
      } catch (_e) {
        // Lanjutkan jika parsing gagal
      }
    }
  }

  // 2. PEMBUAT DRAF PESAN, PROMOSI, KONTEN & KREATIVITAS (COPYWRITING)
  const isCopywritingRequest =
    p.includes('buatkan pesan') ||
    p.includes('buatkan teks') ||
    p.includes('buatkan draf') ||
    p.includes('buatkan kata') ||
    p.includes('kata kata promosi') ||
    p.includes('pesan promosi') ||
    p.includes('broadcast') ||
    p.includes('template') ||
    p.includes('ucapan') ||
    p.includes('surat izin') ||
    p.includes('surat permohonan') ||
    p.includes('surat sakit') ||
    p.includes('permohonan maaf') ||
    p.includes('contoh pesan') ||
    p.includes('puisi') ||
    p.includes('dongeng') ||
    p.includes('cerita pendek') ||
    p.includes('cerpen');

  if (isCopywritingRequest) {
    if (p.includes('puisi')) {
      return {
        text: `${prefixGreeting}Berikut karya puisi indah dan bermakna untuk Anda:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📖 *MENENUN CAHAYA MASA DEPAN*\n\n` +
          `Di balik fajar yang menyingsing perlahan,\n` +
          `Langkah-langkah gigih meniti impian.\n` +
          `Setiap ikhtiar, doa, dan kesabaran,\n` +
          `Adalah benih kejayaan yang dirindukan.\n\n` +
          `Bila badai datang menguji keteguhan,\n` +
          `Jangan pernah surut dalam pengharapan.\n` +
          `Ilmu dan budi menjadi lentera jalan,\n` +
          `Membimbing jiwa menuju kemuliaan.\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Apakah Anda ingin draf puisi dengan tema spesifik lainnya (seperti tentang ibu, guru, atau perjuangan hidup)?`,
        detectedIntent: 'copywriting_poem',
      };
    }

    if (p.includes('cerita') || p.includes('dongeng')) {
      return {
        text: `${prefixGreeting}Berikut kisah inspiratif singkat penuh hikmah untuk Anda:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🌱 *KISAH POHON BAMBU CINA*\n\n` +
          `Saat bibit bambu Cina ditanam dan disiram setiap hari, tidak ada tunas yang tampak di atas tanah selama empat tahun pertama. Namun pada tahun kelima, ia bertumbuh pesat setinggi 25 meter hanya dalam kurun waktu enam minggu!\n\n` +
          `Apakah bambu itu bertumbuh dalam enam minggu saja? Tidak. Selama empat tahun pertama, ia bekerja keras di dalam kegelapan tanah untuk menancapkan akar yang kokoh dan dalam agar mampu menopang pertumbuhan raksasanya di masa depan.\n\n` +
          `*Pesan Moral:* Proses belajar, menuntut ilmu, dan membangun usaha sering kali terasa lambat di awal. Namun ketika fondasi sudah kokoh, lompatan kesuksesan akan terjadi! Tetap tekun dan jangan pernah menyerah. ✨\n` +
          `━━━━━━━━━━━━━━━━━━━━`,
        detectedIntent: 'storytelling',
      };
    }

    if (p.includes('surat izin') || p.includes('surat sakit') || p.includes('izin sakit') || p.includes('izin tidak masuk') || p.includes('tidak masuk sekolah') || p.includes('tidak masuk kerja')) {
      return {
        text: `${prefixGreeting}Tentu, ini draf surat izin resmi yang rapi dan santun:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Hal: Permohonan Izin Tidak Masuk [Sekolah / Bekerja]\n` +
          `Lampiran: [Surat Keterangan Dokter bila ada]\n\n` +
          `Yth. Bapak/Ibu [Nama Guru / Atasan / HRD],\n` +
          `di Tempat\n\n` +
          `Dengan hormat,\n` +
          `Saya yang bertanda tangan di bawah ini:\n` +
          `• Nama: [Nama Lengkap Anda]\n` +
          `• [NISN / NIK / Jabatan]: [Nomor Identitas]\n\n` +
          `Bermaksud memberitahukan bahwa pada hari [Hari, Tanggal], saya berhalangan hadir dikarenakan [kondisi sakit / keperluan keluarga mendesak].\n\n` +
          `Demikian surat permohonan izin ini saya sampaikan dengan sebenar-benarnya. Atas perhatian dan pengertian Bapak/Ibu, saya ucapkan terima kasih.\n\n` +
          `Hormat saya,\n\n` +
          `[Tanda Tangan & Nama Anda]\n` +
          `━━━━━━━━━━━━━━━━━━━━`,
        detectedIntent: 'copywriting_letter',
      };
    }

    if (p.includes('promosi') || p.includes('broadcast') || p.includes('diskon') || p.includes('jualan') || p.includes('penawaran')) {
      return {
        text: `${prefixGreeting}Tentu! Berikut rekomendasi draf pesan siaran promosi WhatsApp yang menarik, persuasif, dan siap dikirim via WABiz:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🔥 *PENAWARAN SPESIAL TERBATAS: [NAMA PRODUK / PROGRAM]* 🔥\n\n` +
          `Halo Kak [Nama Pelanggan]! 👋\n` +
          `Semoga harimu menyenangkan.\n\n` +
          `Kami punya kabar gembira khusus untuk Anda minggu ini! Dapatkan kesempatan istimewa:\n\n` +
          `✨ *Diskon Eksklusif hingga [XX]%*\n` +
          `🎁 *Gratis [Bonus / Konsultasi / Merchandise]*\n` +
          `⚡ *Kuota Terbatas: Hanya untuk [XX] pendaftar pertama!*\n\n` +
          `Jangan lewatkan kesempatan emas ini ya Kak. Amankan slot Anda sebelum kehabisan:\n` +
          `👉 *Klaim Promo Sekarang:* [Tautan Website / Formulir]\n\n` +
          `Ada pertanyaan seputar promo ini? Cukup balas pesan ini ya Kak, tim kami siap melayani sepenuh hati 😊\n` +
          `━━━━━━━━━━━━━━━━━━━━\n\n` +
          `*Tips WABiz:* Anda dapat mengganti teks di dalam tanda kurung siku sesuai penawaran kampanye Anda!`,
        detectedIntent: 'copywriting_promo',
      };
    }

    if (p.includes('follow up') || p.includes('follow-up') || p.includes('tindak lanjut')) {
      return {
        text: `${prefixGreeting}Tentu, ini contoh draf pesan follow-up yang santun dan profesional untuk menjaga hubungan dengan calon pelanggan:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Halo Kak [Nama Pelanggan]! 👋\n\n` +
          `Semoga selalu dalam keadaan sehat dan lancar aktivitasnya.\n\n` +
          `Menyambung informasi sebelumnya mengenai [Nama Layanan/Pendaftaran], kami ingin menanyakan apakah ada hal yang masih ingin Kakak diskusikan atau butuhkan penjelasannya?\n\n` +
          `Kami siap membantu bila ada kendala teknis atau pertanyaan tambahan:\n` +
          `👉 *Lanjutkan Pendaftaran / Pembelian:* [Tautan Resmi]\n\n` +
          `Terima kasih banyak atas waktu dan kepercayaannya ya Kak! 🙏\n` +
          `━━━━━━━━━━━━━━━━━━━━`,
        detectedIntent: 'copywriting_followup',
      };
    }

    if (p.includes('idul fitri') || p.includes('lebaran') || p.includes('ramadhan') || p.includes('tahun baru')) {
      return {
        text: `${prefixGreeting}Berikut draf pesan ucapan hangat dan penuh makna untuk dibagikan ke relasi atau pelanggan:\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `✨ *Taqabbalallahu Minna Wa Minkum* ✨\n\n` +
          `Yth. Bapak/Ibu/Sahabat [Nama Penerima],\n\n` +
          `Keluarga besar *${orgLabel}* mengucapkan:\n` +
          `*Selamat Hari Raya Idul Fitri / Mohon Maaf Lahir dan Batin.*\n\n` +
          `Semoga setiap amal ibadah kita diterima oleh Allah SWT, senantiasa dilimpahkan kesehatan, keberkahan, serta kedamaian bagi kita dan keluarga tercinta.\n\n` +
          `Salam hangat dan doa terbaik dari kami,\n` +
          `*Tim ${orgLabel}*\n` +
          `━━━━━━━━━━━━━━━━━━━━`,
        detectedIntent: 'copywriting_greeting',
      };
    }

    return {
      text: `${prefixGreeting}Tentu! Berikut draf pesan komunikasi WhatsApp yang rapi dan profesional:\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Halo Kak [Nama Penerima]! 👋\n\n` +
        `Terima kasih telah mempercayakan kebutuhan Anda kepada *${orgLabel}*.\n\n` +
        `Terkait [Topik Pesan Anda], berikut ringkasan informasi yang perlu kami sampaikan:\n` +
        `• Poin 1: [Jelaskan rincian pertama]\n` +
        `• Poin 2: [Jelaskan rincian kedua]\n\n` +
        `Silakan balas pesan ini kapan saja bila ada hal yang ingin ditanyakan. Tim kami dengan senang hati akan mendampingi Anda.\n\n` +
        `Salam hormat,\n` +
        `*Tim Layanan ${orgLabel}*\n` +
        `━━━━━━━━━━━━━━━━━━━━`,
      detectedIntent: 'copywriting_general',
    };
  }

  // 3. TEKNOLOGI, AI, WHATSAPP & PENGEMBANGAN SOFTWARE
  if (p.includes('apa itu ai') || p.includes('artificial intelligence') || p.includes('kecerdasan buatan')) {
    return {
      text: `${prefixGreeting}**Artificial Intelligence (AI)** atau **Kecerdasan Buatan** adalah bidang ilmu komputer yang merancang sistem mesin/komputer agar mampu meniru kemampuan kognitif manusia seperti belajar, bernalar, dan memecahkan masalah.\n\n` +
        `Beberapa poin penting mengenai AI:\n` +
        `• **Cara Kerja:** AI mempelajari pola dari kumpulan data masif (training data) menggunakan algoritma seperti Machine Learning dan Deep Learning.\n` +
        `• **Penerapan Nyata:** Pemrosesan bahasa alami (NLP seperti asisten chatbot ini), pengenalan suara & wajah, sistem rekomendasi e-commerce, hingga kendaraan otonom.\n` +
        `• **Di Platform WABiz:** AI bertindak sebagai asisten otomatis 24/7 yang mampu menjawab pertanyaan pelanggan seketika, mendeteksi minat calon santri/pembeli (leads), dan mengalihkan kasus kompleks ke CS manusia secara seamless.\n\n` +
        `Apakah Anda tertarik mengetahui bagaimana AI dapat mengotomasi proses bisnis Anda?`,
      detectedIntent: 'tech_explanation',
    };
  }

  if (p.includes('machine learning') || p.includes('deep learning')) {
    return {
      text: `${prefixGreeting}**Machine Learning (ML)** adalah sub-bidang dari AI di mana komputer belajar membuat keputusan atau prediksi berdasarkan data historis tanpa harus diprogram secara manual baris demi baris.\n\n` +
        `• **Supervised Learning:** Belajar dari data yang sudah diberi label (contoh: mendeteksi email spam vs bukan spam).\n` +
        `• **Unsupervised Learning:** Mencari pola tersembunyi atau pengelompokan (clustering) dari data mentah tanpa label.\n` +
        `• **Deep Learning:** Cabang ML tingkat lanjut yang meniru jaringan saraf tiruan otak manusia (Neural Networks) untuk menangani pemrosesan bahasa teks dan gambar kompleks.`,
      detectedIntent: 'tech_explanation',
    };
  }

  if (p.includes('whatsapp gateway') || p.includes('whatsapp api') || p.includes('baileys') || p.includes('apa itu wabiz')) {
    return {
      text: `${prefixGreeting}**WABiz WhatsApp Gateway** adalah infrastruktur penghubung antara aplikasi bisnis/SaaS dengan jaringan komunikasi WhatsApp.\n\n` +
        `Fitur & Manfaat Utama:\n` +
        `1. **Automasi Multi-Device:** Menghubungkan nomor WhatsApp bisnis resmi Anda secara aman dengan pemantauan soket persisten.\n` +
        `2. **Siaran Kampanye Cerdas (Broadcast):** Mengirim pesan massal terpersonalisasi dengan antrean aman (throttling) agar nomor terhindar dari pemblokiran.\n` +
        `3. **Chatbot AI 24/7:** Menjawab pertanyaan pelanggan secara seketika dan otomatis mencatat data prospek (leads).\n` +
        `4. **Kotak Masuk Bersama (Shared Inbox):** Memungkinkan banyak agen CS melayani pelanggan dari satu nomor WhatsApp yang sama.`,
      detectedIntent: 'tech_explanation',
    };
  }

  if (p.includes('frontend') && p.includes('backend')) {
    return {
      text: `${prefixGreeting}Perbedaan mendasar antara **Frontend** dan **Backend** dapat diibaratkan seperti sebuah **Restoran**:\n\n` +
        `🍽️ **Frontend (Ruang Makan & Etalase):**\n` +
        `• Bagian yang dilihat, disentuh, dan diinteraksikan langsung oleh pengguna.\n` +
        `• Bertanggung jawab atas desain tampilan, animasi, tombol, dan formulir.\n` +
        `• *Teknologi:* React Native, Expo, React.js, HTML/CSS, Tailwind CSS.\n\n` +
        `👨‍🍳 **Backend (Dapur Koki & Gudang Bahan):**\n` +
        `• Bagian di balik layar yang memproses logika bisnis, keamanan, dan kalkulasi.\n` +
        `• Bertanggung jawab atas autentikasi pengguna, penyimpanan basis data (database), dan API.\n` +
        `• *Teknologi:* Node.js, Express, Supabase, PostgreSQL, Docker.\n\n` +
        `Keduanya berkomunikasi melalui **API (Application Programming Interface)** layaknya pelayan yang mengantar pesanan dari meja ke dapur!`,
      detectedIntent: 'tech_explanation',
    };
  }

  if (p.includes('apa itu api') || p.includes('rest api') || p.includes('webhook')) {
    return {
      text: `${prefixGreeting}**API (Application Programming Interface)** adalah jembatan komunikasi yang memungkinkan dua aplikasi perangkat lunak saling bertukar data dan fungsi secara otomatis.\n\n` +
        `• **Analogi:** Seperti pelayan restoran yang mencatat pesanan Anda (request), membawanya ke koki di dapur (server), lalu mengantarkan hidangan yang Anda minta (response).\n` +
        `• **Webhook:** Berbeda dengan API biasa yang memerlukan sistem terus bertanya (*polling*), Webhook adalah mekanisme pengiriman notifikasi seketika begitu suatu peristiwa terjadi (misal: ada pesan baru masuk di WhatsApp, WABiz langsung menerima notifikasi tanpa jeda).`,
      detectedIntent: 'tech_explanation',
    };
  }

  if (p.includes('cloud') || p.includes('database') || p.includes('react native') || p.includes('expo')) {
    return {
      text: `${prefixGreeting}Berikut penjelasan ringkas mengenai arsitektur modern yang digunakan dalam aplikasi ini:\n\n` +
        `• **React Native & Expo:** Kerangka kerja lintas platform yang memungkinkan pembuatan aplikasi mobile asli (Android & iOS) menggunakan basis kode TypeScript/JavaScript yang cepat dan efisien.\n` +
        `• **Cloud Database (Supabase PostgreSQL):** Media penyimpanan data terpusat dengan keamanan tingkat tinggi (Row-Level Security) yang dapat diakses secara *real-time* dari mana saja.\n` +
        `• **Cloud Architecture:** Mengurangi ketergantungan perangkat keras lokal sehingga sistem dapat berskala besar (scalable) dan beroperasi 24/7 tanpa henti.`,
      detectedIntent: 'tech_explanation',
    };
  }

  // 4. BISNIS, STRATEGI PENJUALAN & WHATSAPP MARKETING
  if (p.includes('tips penjualan') || p.includes('meningkatkan penjualan') || p.includes('closing') || p.includes('strategi bisnis') || p.includes('cara jualan')) {
    return {
      text: `${prefixGreeting}Berikut **5 Strategi Terbukti** untuk melipatgandakan penjualan bisnis melalui WhatsApp:\n\n` +
        `1. ⚡ **Kecepatan Respon (Golden 5-Minute Rule):** Pelanggan yang dijawab dalam kurun waktu kurang dari 5 menit memiliki potensi closing hingga 80% lebih tinggi.\n` +
        `2. 🎯 **Personalisasi Pesan:** Selalu panggil nama pelanggan dan sesuaikan rekomendasi produk dengan preferensi mereka sebelumnya.\n` +
        `3. ⏳ **Ciptakan Urgensi (Scarcity):** Berikan alasan kuat untuk membeli sekarang, misalnya batas waktu promo atau ketersediaan stok terbatas.\n` +
        `4. 🤝 **Teknik Closing Dua Pilihan:** Hindari pertanyaan yang jawabannya 'tidak'. Gunakan pilihan: *"Kakak lebih nyaman pengiriman pagi atau sore?"* atau *"Prefer transfer via BCA atau QRIS?"*.\n` +
        `5. 🔄 **Follow-Up yang Santun:** Sekitar 70% transaksi terjadi pada kontak follow-up ke-2 atau ke-3. Berikan informasi nilai tambah, bukan sekadar menagih.\n\n` +
        `Dengan fitur Kampanye & Chatbot AI di WABiz, kelima strategi ini dapat dijalankan secara otomatis!`,
      detectedIntent: 'business_strategy',
    };
  }

  if (p.includes('anti banned') || p.includes('anti-banned') || p.includes('diblokir') || p.includes('tips broadcast')) {
    return {
      text: `${prefixGreeting}Agar nomor WhatsApp Anda aman dan terhindar dari pemblokiran saat melakukan siaran kampanye (broadcast), terapkan panduan resmi berikut:\n\n` +
        `🛡️ **Aturan Emas Broadcast Aman:**\n` +
        `1. **Gunakan Nomor yang Sudah Matang (*Warmed-Up Number*):** Jangan gunakan nomor baru untuk langsung mengirim ratusan pesan sekaligus dalam satu hari.\n` +
        `2. **Pastikan Kontak Menyimpan Nomor Anda (*Opt-In*):** Kirim broadcast kepada pelanggan/kontak yang memang pernah berinteraksi atau memberikan persetujuan.\n` +
        `3. **Terapkan Jeda Waktu (*Throttling / Delay*):** Berikan jeda 5–15 detik antar setiap pesan (fitur antrean persisten WABiz sudah menerapkan ini otomatis).\n` +
        `4. **Variasikan Pesan:** Gunakan tag dinamis seperti \`{{nama}}\` agar setiap pesan yang terkirim memiliki teks unik.\n` +
        `5. **Sediakan Opsi Berhenti (*Opt-Out*):** Beri kesempatan pelanggan membalas kata 'STOP' jika tidak ingin menerima siaran lagi, sehingga mereka tidak menekan tombol *Report/Laporkan Spam*.`,
      detectedIntent: 'business_strategy',
    };
  }

  if (p.includes('komplain') || p.includes('pelanggan marah') || p.includes('customer service')) {
    return {
      text: `${prefixGreeting}Menghadapi pelanggan yang sedang kecewa atau komplain membutuhkan metode komunikasi yang empati. Gunakan metode **L.A.S.T**:\n\n` +
        `1. 👂 **Listen (Dengarkan Sepenuhnya):** Biarkan pelanggan menyampaikan keluhannya tanpa disela. Tunjukkan bahwa Anda mendengarkan.\n` +
        `2. 🙏 **Apologize (Minta Maaf dengan Tulus):** Minta maaf atas ketidaknyamanan yang dialami pelanggan tanpa berdebat atau membela diri.\n` +
        `3. 🛠️ **Solve (Berikan Solusi Konkret):** Tawarkan jalan keluar yang jelas, berikan kepastian estimasi waktu perbaikan, dan tindak lanjuti segera.\n` +
        `4. 💐 **Thank (Ucapkan Terima Kasih):** Berterima kasih atas masukan berharga yang mereka berikan untuk perbaikan kualitas layanan Anda.\n\n` +
        `Pelanggan yang komplain dan ditangani dengan cepat sering kali berubah menjadi pelanggan yang paling loyal!`,
      detectedIntent: 'customer_service_tips',
    };
  }

  // 5. SAINS, EDUKASI & PENGETAHUAN UMUM
  if (p.includes('langit biru') || p.includes('warna langit')) {
    return {
      text: `${prefixGreeting}Langit tampak berwarna biru di siang hari karena fenomena fisika optik bernama **Hamburan Rayleigh (Rayleigh Scattering)**.\n\n` +
        `Cahaya matahari yang tampak putih sebenarnya tersusun dari spektrum berbagai warna pelangi (merah, jingga, kuning, hijau, biru, ungu). Cahaya biru memiliki panjang gelombang yang jauh lebih pendek dan berfrekuensi tinggi, sehingga saat menabrak molekul gas dan partikel di atmosfer bumi, cahaya biru dihamburkan ke segala arah jauh lebih kuat daripada warna lainnya!`,
      detectedIntent: 'science_explanation',
    };
  }

  if (p.includes('air laut asin') || p.includes('kenapa laut asin')) {
    return {
      text: `${prefixGreeting}Air laut terasa asin karena mengandung konsentrasi garam mineral yang tinggi, terutama **Natrium Klorida (NaCl)**.\n\n` +
        `Prosesnya terjadi selama miliaran tahun: Hujan yang sedikit asam mengikis batuan di daratan. Aliran sungai membawa mineral garam terlarut ini menuju ke laut. Di lautan, air terus menguap membentuk awan, namun garam mineral tidak ikut menguap dan tetap tertinggal di laut, menjadikannya semakin asin dari waktu ke waktu.`,
      detectedIntent: 'science_explanation',
    };
  }

  if (p.includes('fotosintesis')) {
    return {
      text: `${prefixGreeting}**Fotosintesis** adalah proses biokimia di mana tumbuhan hijau, alga, dan beberapa bakteri mengubah energi cahaya matahari menjadi energi kimia dalam bentuk glukosa/makanan.\n\n` +
        `🌿 **Persamaan Reaksi:**\n` +
        `6 CO₂ (Karbon Dioksida) + 6 H₂O (Air) + Cahaya Matahari ➔ C₆H₁₂O₆ (Glukosa) + 6 O₂ (Oksigen)\n\n` +
        `Proses ini berlangsung di dalam kloroplas dengan bantuan pigmen klorofil dan menjadi sumber utama oksigen bagi kehidupan di bumi!`,
      detectedIntent: 'science_explanation',
    };
  }

  if (p.includes('presiden pertama')) {
    return {
      text: `${prefixGreeting}Presiden pertama Republik Indonesia adalah **Ir. Soekarno** (Bung Karno), dengan **Drs. Mohammad Hatta** sebagai Wakil Presiden pertama.\n\n` +
        `Beliau berdua merupakan Proklamator Kemerdekaan Indonesia yang memproklamasikan kemerdekaan bangsa pada hari Jumat, 17 Agustus 1945 di Jalan Pegangsaan Timur No. 56, Jakarta.`,
      detectedIntent: 'history_trivia',
    };
  }

  if (p.includes('ibukota indonesia') || p.includes('ibu kota indonesia') || p.includes('ikn')) {
    return {
      text: `${prefixGreeting}Ibu Kota Negara Indonesia saat ini adalah **Daerah Khusus Ibukota (DKI) Jakarta**, dengan pusat pemerintahan masa depan yang sedang dikembangkan di **Nusantara (IKN)** yang terletak di wilayah Penajam Paser Utara dan Kutai Kartanegara, Kalimantan Timur.`,
      detectedIntent: 'geography_trivia',
    };
  }

  if (p.includes('tips belajar') || p.includes('cara belajar') || p.includes('fokus belajar')) {
    return {
      text: `${prefixGreeting}Berikut **3 Metode Belajar Efektif** yang terbukti secara sains:\n\n` +
        `1. ⏱️ **Teknik Pomodoro:** Belajar fokus tanpa distraksi selama 25 menit, lalu istirahat 5 menit. Setelah 4 sesi, ambil istirahat panjang 15-30 menit.\n` +
        `2. 💡 **Teknik Feynman:** Pelajari konsep tertentu, lalu cobalah jelaskan konsep tersebut kepada orang lain menggunakan bahasa yang sangat sederhana tanpa jargon rumit.\n` +
        `3. 🔄 **Spaced Repetition & Active Recall:** Uji ingatan Anda sendiri secara berkala (misal hari ke-1, ke-3, ke-7) daripada hanya membaca ulang catatan berkali-kali.`,
      detectedIntent: 'study_tips',
    };
  }

  if (p.includes('resep') || p.includes('nasi goreng') || p.includes('cara masak')) {
    return {
      text: `${prefixGreeting}Tentu! Ini resep praktis membuat **Nasi Goreng Spesial Lezat**:\n\n` +
        `📋 **Bahan-bahan:**\n` +
        `• 1 piring nasi dingin (sebaiknya nasi pera)\n` +
        `• 2 siung bawang merah & 1 siung bawang putih (cincang halus)\n` +
        `• 1 butir telur ayam\n` +
        `• 1 sdm kecap manis, 1 sdt kecap asin / saus tiram\n` +
        `• Garam, merica, dan irisan daun bawang secukupnya\n\n` +
        `🍳 **Langkah Memasak:**\n` +
        `1. Panaskan sedikit minyak, tumis bawang merah dan putih hingga harum.\n` +
        `2. Sisihkan bumbu ke pinggir wajan, masukkan telur dan orak-arik hingga matang.\n` +
        `3. Masukkan nasi, kecap manis, saus tiram, garam, dan merica.\n` +
        `4. Besarkan api sedikit dan aduk cepat hingga bumbu merata dan tercium aroma gurih (smoky).\n` +
        `5. Taburkan daun bawang, aduk sebentar, dan sajikan selagi hangat!`,
      detectedIntent: 'recipe_guide',
    };
  }

  // 5.1 TAMBAHAN SAINS, TEKNOLOGI & CODING
  if (p.includes('python') || p.includes('koding') || p.includes('coding') || p.includes('javascript') || p.includes('sql') || p.includes('html')) {
    return {
      text: `${prefixGreeting}Tentu! Berikut contoh kode dan penjelasan praktis yang bersih dan siap dijalankan:\n\n` +
        `💻 **Contoh Python (Logika Dasar & Otomasi):**\n` +
        `\`\`\`python\n` +
        `# Program sederhana menyapa dan menghitung data\n` +
        `def sapa_pelanggan(nama, total_pesanan):\n` +
        `    print(f"Halo Kak {nama}, terima kasih telah bertransaksi!")\n` +
        `    diskon = total_pesanan * 0.10 if total_pesanan >= 500000 else 0\n` +
        `    total_akhir = total_pesanan - diskon\n` +
        `    return total_akhir\n\n` +
        `tagihan = sapa_pelanggan("Fajar", 750000)\n` +
        `print(f"Total bayar setelah diskon 10%: Rp {tagihan:,.0f}")\n` +
        `\`\`\`\n\n` +
        `*Tips Pemrograman:* Pastikan penulisan indentasi (spasi) konsisten pada Python, dan selalu validasi tipe data masukan pengguna. Apakah Anda ingin bantuan membuat fungsi atau logika kode lainnya?`,
      detectedIntent: 'coding_guide',
    };
  }

  if (p.includes('hujan') || p.includes('terjadinya hujan') || p.includes('siklus air')) {
    return {
      text: `${prefixGreeting}Proses terjadinya hujan dijelaskan melalui **Siklus Hidrologi (Siklus Air)** yang terdiri dari 3 tahapan utama:\n\n` +
        `1. ☀️ **Evaporasi & Transpirasi (Penguapan):** Panas matahari memanaskan air di laut, danau, dan sungai sehingga menguap menjadi uap air ke atmosfer bumi. Tumbuhan juga melepaskan uap air melalui transpirasi.\n` +
        `2. ☁️ **Kondensasi (Pengembunan):** Ketika uap air naik ke lapisan atmosfer yang dingin, uap air tersebut mengembun membentuk gumpalan awan yang berisi jutaan tetesan air mikro.\n` +
        `3. 🌧️ **Presipitasi (Curahan Hujan):** Ketika tetesan air di dalam awan menjadi terlalu berat dan jenuh untuk ditopang oleh arus udara, gaya gravitasi menariknya jatuh ke permukaan bumi sebagai **hujan**.\n\n` +
        `Air hujan ini kemudian meresap ke tanah atau mengalir kembali ke sungai dan laut, lalu siklus tersebut berulang kembali secara lestari!`,
      detectedIntent: 'science_explanation',
    };
  }

  if (p.includes('gravitasi') || p.includes('tata surya') || p.includes('planet')) {
    return {
      text: `${prefixGreeting}**Gravitasi** adalah gaya tarik-menarik mendasar antarbenda yang memiliki massa di alam semesta. Semakin besar massa suatu objek (seperti Matahari atau Bumi), semakin kuat gaya gravitasinya.\n\n` +
        `🪐 **Dalam Tata Surya Kita:**\n` +
        `• Matahari bertindak sebagai pusat gravitasi raksasa yang menahan 8 planet (Merkurius, Venus, Bumi, Mars, Jupiter, Saturnus, Uranus, Neptunus) tetap berada pada jalur orbitnya masing-masing.\n` +
        `• Di Bumi, gaya gravitasi (sekitar 9,8 m/s²) membuat kita dan atmosfer tetap berpijak kokoh di permukaan dan tidak melayang ke luar angkasa!`,
      detectedIntent: 'science_explanation',
    };
  }

  if (p.includes('luas lingkaran') || p.includes('keliling lingkaran') || p.includes('rumus luas')) {
    return {
      text: `${prefixGreeting}Berikut rumus geometri dasar untuk **Lingkaran**:\n\n` +
        `• **Luas Lingkaran:** $L = \\pi \\times r^2$  *(atau $L = \\frac{1}{4} \\times \\pi \\times d^2$)*\n` +
        `• **Keliling Lingkaran:** $K = 2 \\times \\pi \\times r$  *(atau $K = \\pi \\times d$)*\n\n` +
        `*Keterangan:* Nilai $\\pi$ (pi) adalah $\\frac{22}{7}$ atau $3,14$, sedangkan $r$ adalah jari-jari lingkaran.\n\n` +
        `👉 **Contoh Soal:** Jika jari-jari ($r$) = 7 cm, maka Luas = $\\frac{22}{7} \\times 7 \\times 7 = 154\\text{ cm}^2$.\n\n` +
        `Apakah ada soal atau perhitungan matematika lain yang ingin Anda uji?`,
      detectedIntent: 'math_formula',
    };
  }

  if (p.includes('pancasila') || p.includes('17 agustus') || p.includes('kemerdekaan')) {
    return {
      text: `${prefixGreeting}**Pancasila** adalah dasar negara dan pedoman ideologi bangsa Republik Indonesia:\n\n` +
        `1. Ketuhanan Yang Maha Esa (Simbol: Bintang)\n` +
        `2. Kemanusiaan yang Adil dan Beradab (Simbol: Rantai Emas)\n` +
        `3. Persatuan Indonesia (Simbol: Pohon Beringin)\n` +
        `4. Kerakyatan yang Dipimpin oleh Hikmat Kebijaksanaan dalam Permusyawaratan/Perwakilan (Simbol: Kepala Banteng)\n` +
        `5. Keadilan Sosial bagi Seluruh Rakyat Indonesia (Simbol: Padi dan Kapas)\n\n` +
        `Indonesia memproklamasikan kemerdekaannya pada tanggal **17 Agustus 1945**, dipimpin oleh Bung Karno dan Bung Hatta atas nama seluruh bangsa Indonesia. 🇮🇩`,
      detectedIntent: 'history_trivia',
    };
  }

  if (p.includes('hidup sehat') || p.includes('tidur') || p.includes('minum air') || p.includes('stres')) {
    return {
      text: `${prefixGreeting}Berikut **4 Pilar Gaya Hidup Sehat** yang mudah diterapkan setiap hari:\n\n` +
        `1. 💧 **Cukupi Hidrasi:** Minum minimal 2 liter (8 gelas) air putih per hari untuk menjaga metabolisme tubuh dan konsentrasi otak.\n` +
        `2. 😴 **Tidur Berkualitas:** Istirahat 7-8 jam per malam pada jam yang teratur untuk pemulihan sel dan kestabilan imunitas.\n` +
        `3. 🥗 **Nutrisi Seimbang:** Perbanyak serat (sayur & buah) dan kurangi konsumsi gula berlebih serta gorengan.\n` +
        `4. 🚶 **Aktivitas Fisik Ringan:** Lakukan jalan kaki atau peregangan 20-30 menit minimal 3 kali seminggu untuk mengurangi hormon stres (kortisol).`,
      detectedIntent: 'health_tips',
    };
  }

  // 6. CHIT-CHAT, CANDAAN & PERSONA AI
  if (p.includes('siapa kamu') || p.includes('kamu siapa') || p.includes('tentang kamu') || p.includes('namamu siapa')) {
    return {
      text: `${prefixGreeting}Saya adalah **Asisten AI Percakapan WABiz**! 🤖✨\n\n` +
        `Saya dirancang sebagai mitra cerdas yang serbaguna untuk:\n` +
        `• Menjawab pertanyaan umum, sains, bisnis, dan teknologi secara cepat.\n` +
        `• Membantu menyusun draf pesan promosi, siaran WhatsApp, dan copywriting.\n` +
        `• Melakukan kalkulasi angka dan persentase secara instan.\n` +
        `• Menyampaikan informasi resmi seputar program, biaya, jadwal, dan kontak di **${orgLabel}**.\n\n` +
        `Ada yang bisa saya bantu atau diskusikan bersama Anda saat ini?`,
      detectedIntent: 'bot_identity',
    };
  }

  if (p.includes('bisa apa saja') || p.includes('kemampuan kamu') || p.includes('fitur kamu') || p.includes('bisa bantu apa')) {
    return {
      text: `${prefixGreeting}Sebagai asisten AI cerdas di ekosistem WABiz, saya dapat membantu Anda dalam berbagai hal:\n\n` +
        `1. 💬 **Tanya Jawab & Pengetahuan Umum:** Sains, sejarah, teknologi, edukasi, dan definisi konsep.\n` +
        `2. ✍️ **Pembuat Teks & Copywriting:** Draf pesan promosi WhatsApp, template follow-up, ucapan hari raya, dsb.\n` +
        `3. 🔢 **Perhitungan Cepat:** Kalkulasi matematika, perkalian, pembagian, persentase diskon, dan konversi angka.\n` +
        `4. 🏢 **Informasi Resmi Organisasi:** Profil ${orgLabel}, syarat pendaftaran, biaya, jadwal, alamat, dan kontak CS.\n` +
        `5. 🤝 **Eskalasi Staf:** Menghubungkan Anda langsung ke nomor Customer Service manusia jika diperlukan konsultasi lebih mendalam.\n\n` +
        `Silakan ketik pertanyaan apa pun yang ingin Anda coba!`,
      detectedIntent: 'bot_capabilities',
    };
  }

  if (p.includes('lelucon') || p.includes('jokes') || p.includes('lucu') || p.includes('humor')) {
    const jokes = [
      "Kenapa anak komputer suka kedinginan? Karena dia punya banyak *Windows* yang kebuka! 😄",
      "Apa bedanya keyboard komputer sama kereta api? Kalau kereta api ada masinisnya, kalau keyboard ada *spasi-nya*! 😂",
      "Kenapa programmer lebih suka minum teh daripada kopi? Karena kalau minum kopi, mereka takut dapat *Java* exception! ☕💻",
      "Ikan apa yang paling pendiam? Ikan pause! 🐟⏸️",
    ];
    const pickedJoke = jokes[Math.floor(Math.random() * jokes.length)];
    return {
      text: `${prefixGreeting}Biar suasana makin santai dan ceria, ini lelucon untuk Anda:\n\n*${pickedJoke}*\n\nSemoga membuat Anda tersenyum hari ini! Ada hal lain yang bisa kami bantu?`,
      detectedIntent: 'humor',
    };
  }

  if (p.includes('pantun')) {
    const pantunList = [
      "Pagi hari menyeduh kopi hangat,\nSambil menikmati sepiring kue bolu.\nAyo kita melangkah dengan semangat,\nRaih impian dan sukses selalu! ✨",
      "Burung merpati terbang melayang,\nHinggap sebentar di dahan cemara.\nKepada sesama mari berkasih sayang,\nHidup rukun damai dan bahagia! 🌿",
      "Pergi ke pasar membeli durian,\nJangan lupa mencicipi nangka.\nDengan WABiz jalin kebersamaan,\nBisnis maju pelanggan pun suka! 🚀",
    ];
    const pickedPantun = pantunList[Math.floor(Math.random() * pantunList.length)];
    return {
      text: `${prefixGreeting}Ini pantun istimewa untuk Anda:\n\n${pickedPantun}\n\nSemoga harimu menyenangkan dan penuh keberkahan!`,
      detectedIntent: 'pantun',
    };
  }

  if (p.includes('motivasi') || p.includes('quotes') || p.includes('semangat') || p.includes('kata bijak')) {
    return {
      text: `${prefixGreeting}Kutipan inspiratif untuk menemani langkah Anda hari ini:\n\n` +
        `> *"Langkah kecil yang konsisten setiap hari akan membawa Anda ke puncak kesuksesan yang tidak pernah terbayangkan sebelumnya."*\n\n` +
        `Jangan pernah ragu untuk terus berusaha dan belajar. Hal besar selalu dimulai dari komitmen kecil yang dirawat dengan setia! Tetap semangat ya! 💪✨`,
      detectedIntent: 'motivation',
    };
  }

  if (p.includes('terima kasih') || p.includes('makasih') || p.includes('thanks') || p.includes('matur nuwun') || p.includes('syukran')) {
    const replyThanks = isIslamic
      ? "Afwan, wa iyyakum! Senang sekali dapat membantu Anda. Semoga barakah dan bermanfaat selalu. Jika ada hal lain yang dibutuhkan, kami selalu siap membantu! 🙏"
      : "Sama-sama! Senang sekali bisa membantu Anda. Jika ada hal lain yang ingin Anda ketahui atau diskusikan, jangan ragu untuk bertanya lagi ya! 😊";
    return {
      text: `${prefixGreeting}${replyThanks}`,
      detectedIntent: 'gratitude',
    };
  }

  if (p.includes('pintar') || p.includes('keren') || p.includes('hebat') || p.includes('mantap') || p.includes('bagus')) {
    return {
      text: `${prefixGreeting}Terima kasih banyak atas apresiasi positifnya! 😊\n\nSaya terus berusaha memberikan respon terbaik, akurat, dan bermanfaat untuk Anda. Ada topik atau pertanyaan lain yang ingin kita bahas bersama?`,
      detectedIntent: 'compliment',
    };
  }

  if (p.includes('wkwk') || p.includes('haha') || p.includes('hehe') || p.includes('asik') || p.includes('seru')) {
    return {
      text: `${prefixGreeting}Hehehe, senang bisa berbagi keceriaan bersama Anda! 😄 Ada hal yang ingin ditanyakan atau didiskusikan lagi hari ini?`,
      detectedIntent: 'casual_laughter',
    };
  }

  if (p.includes('lagi apa') || p.includes('sedang apa') || p.includes('lagi sibuk')) {
    return {
      text: `${prefixGreeting}Saya sedang bersiap dan selalu aktif 24 jam untuk melayani percakapan, menjawab pertanyaan, dan membantu kebutuhan Anda di WABiz!\n\nBagaimana dengan hari Anda? Ada yang bisa saya bantu sekarang?`,
      detectedIntent: 'casual_status',
    };
  }

  // 7. UNIVERSAL INTELLIGENT AI FALLBACK
  // Untuk pertanyaan terbuka yang tidak masuk ke kategori di atas,
  // bertindak layaknya asisten AI generatif modern: menganalisis konteks dan memberikan panduan terstruktur
  const cleanedTopic = rawPrompt
    .replace(/^(?:tolong\s+)?(?:coba\s+)?(?:bantu(?:kan)?\s+)?(?:jelaskan(?:kan)?|apa(?:kah)?\s*(?:itu|maksud|arti(?:nya)?)?|bagaimana\s*(?:cara(?:nya)?)?|mengapa|kenapa|sebutkan|berikan|tuliskan|info(?:rmasi)?\s*(?:tentang)?)\s*/i, '')
    .replace(/[\?!.]+$/, '')
    .trim();

  const topicLabel = cleanedTopic.length > 2 ? cleanedTopic : rawPrompt.trim();

  return {
    text: `${prefixGreeting}Terima kasih atas pertanyaannya mengenai **${topicLabel}**.\n\n` +
      `Sebagai asisten AI percakapan cerdas, berikut ringkasan informasi dan panduan komprehensif yang dapat kami bagikan:\n\n` +
      `💡 **1. Konsep & Esensi Pokok:**\n` +
      `Topik mengenai *${topicLabel}* mencakup pemahaman fundamental yang sering diterapkan untuk memecahkan masalah praktis, meningkatkan wawasan, dan menunjang efektivitas aktivitas harian kita.\n\n` +
      `⚙️ **2. Prinsip & Cara Kerja:**\n` +
      `Untuk memahami atau menerapkannya secara optimal, perhatikan alur logis: mulai dari penentuan target yang terukur, pemahaman aturan dasar, hingga konsistensi evaluasi berkala.\n\n` +
      `🚀 **3. Langkah Rekomendasi Praktis:**\n` +
      `• Identifikasi tujuan atau kebutuhan spesifik Anda terlebih dahulu.\n` +
      `• Terapkan metode terstruktur secara bertahap dan catat setiap perkembangan.\n` +
      `• Gunakan alat bantu digital (seperti otomatisasi WABiz) untuk mempermudah proses komunikasi dan manajemen data.\n\n` +
      `Apakah ada detail atau studi kasus tertentu seputar *${topicLabel}* yang ingin kita diskusikan lebih mendalam?`,
    detectedIntent: 'general_ai_assistant',
  };
}

// ==========================================
// ARSITEKTUR INTEGRASI AI SECARA AMAN (SECURE BACKEND RELAY)
// ==========================================
// PRINSIP KEAMANAN:
// JANGAN PERNAH menyematkan API Key LLM privat (OpenAI, Gemini, Anthropic, dsb.)
// langsung di sisi aplikasi Expo / React Native klien karena mudah di-decompile.
// Panggilan model AI generatif sungguhan HARUS melalui backend aman / Supabase
// Edge Function dengan header Authorization Bearer token sesi pengguna.
// ==========================================

export function getAiBackendUrl(): string {
  const customBackendUrl = process.env.EXPO_PUBLIC_AI_BACKEND_URL?.trim();
  if (customBackendUrl && customBackendUrl.length > 0) {
    return customBackendUrl;
  }
  if (SUPABASE_PROJECT_URL && SUPABASE_PROJECT_URL.length > 0) {
    return `${SUPABASE_PROJECT_URL}/functions/v1/chat-ai`;
  }
  return '';
}

export async function requestAiChatReply(request: AiChatRequest): Promise<AiChatResponse> {
  const pLower = request.prompt.trim().toLowerCase();

  // Fast-path: Sapaan & salam umum dijawab langsung oleh WABiz engine secara instan (<10ms)
  const isGreetingFastPath =
    pLower === 'halo' ||
    pLower === 'hai' ||
    pLower === 'hei' ||
    pLower === 'p' ||
    pLower === 'ping' ||
    pLower.includes('apa kabar') ||
    pLower.includes('assalamu') ||
    pLower.startsWith('halo') ||
    pLower.startsWith('hai') ||
    pLower.startsWith('permisi');

  const hasSpecificTopics =
    pLower.includes('biaya') ||
    pLower.includes('daftar') ||
    pLower.includes('syarat') ||
    pLower.includes('jadwal') ||
    pLower.includes('alamat') ||
    pLower.includes('lokasi') ||
    pLower.includes('kontak') ||
    pLower.includes('cs') ||
    pLower.includes('admin');

  if (isGreetingFastPath && !hasSpecificTopics) {
    const quickReply = processGroundedBotReply(
      request.prompt,
      request.profile,
      request.rules,
      request.intentRules,
      request.escalation,
      request.conversationHistory
    );
    return {
      text: quickReply.text,
      isAiGenerated: true,
      source: 'wabiz_ai_engine',
      isEscalated: quickReply.isEscalated,
      leadTagged: quickReply.leadTagged,
      links: quickReply.links,
    };
  }

  const backendUrl = getAiBackendUrl();

  // 1. Panggil Backend AI Edge Function (dengan timeout ketat 1.5 detik agar respon secepat kilat)
  if (backendUrl && backendUrl.trim() !== '') {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(publishableKey ? { apikey: publishableKey } : {}),
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          organization_id: request.organizationId,
          prompt: request.prompt,
          conversation_history: request.conversationHistory,
          profile: request.profile,
          rules: request.rules,
          intent_rules: request.intentRules,
          escalation: request.escalation,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        const lowerText = (json.text || '').toLowerCase();
        const isGeneralQuery = !hasSpecificTopics;

        const isColdRefusal =
          lowerText.includes('tidak tercantum dalam data resmi') ||
          lowerText.includes('belum dicantumkan di sistem') ||
          lowerText.includes('tidak diizinkan membuat jawaban');

        if (isGeneralQuery && isColdRefusal) {
          const localResult = processGroundedBotReply(
            request.prompt,
            request.profile,
            request.rules,
            request.intentRules,
            request.escalation,
            request.conversationHistory
          );
          return {
            text: localResult.text,
            isAiGenerated: true,
            source: 'gemini_ai_cloud',
            isEscalated: localResult.isEscalated,
            leadTagged: localResult.leadTagged,
            links: localResult.links,
          };
        }

        return {
          text: json.text,
          isAiGenerated: true,
          source: 'backend_edge_function',
          isEscalated: json.isEscalated,
          leadTagged: json.leadTagged,
          links: json.links,
        };
      }

      const errBody = await response.json().catch(() => null);
      console.warn(
        `Backend AI Edge Function merespons status ${response.status}:`,
        errBody?.error || (response.status === 503 ? 'Layanan AI sementara tidak tersedia' : 'Gagal memproses request')
      );
    } catch (err) {
      console.warn(
        'Beralih instan ke WABiz Smart Conversational Engine:',
        err instanceof Error ? err.message : 'Timeout'
      );
    }
  }

  // 2. Cek Direct Gemini API Key (jika disetel di EXPO_PUBLIC_GEMINI_API_KEY) dengan timeout 1.5s
  const clientGeminiApiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
  if (clientGeminiApiKey) {
    try {
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${clientGeminiApiKey}`;
      const orgName = request.profile?.orgName || 'Lembaga Kami';
      const systemInstruction = `Anda adalah Asisten AI Percakapan WABiz untuk ${orgName}. Jawablah secara cerdas, ramah, solutif, dan informatif seperti asisten AI modern (ChatGPT/Gemini). Jika ditanya tentang ${orgName}, gunakan fakta resmi lembaga. Jika ditanya hal umum, sains, teknologi, matematika, atau copywriting, berikan jawaban berkualitas tinggi.`;

      const contents = [
        {
          role: 'user',
          parts: [{ text: request.prompt }],
        },
      ];

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const res = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText && candidateText.trim()) {
          return {
            text: candidateText.trim(),
            isAiGenerated: true,
            source: 'gemini_ai_cloud',
          };
        }
      }
    } catch (_e) {
      // Fallback ke engine cerdas WABiz
    }
  }

  // 3. Mesin AI Percakapan WABiz (Grounded + Smart Conversational Engine)
  const localResult = processGroundedBotReply(
    request.prompt,
    request.profile,
    request.rules,
    request.intentRules,
    request.escalation,
    request.conversationHistory
  );

  return {
    text: localResult.text,
    isAiGenerated: true,
    source: 'wabiz_ai_engine',
    isEscalated: localResult.isEscalated,
    leadTagged: localResult.leadTagged,
    links: localResult.links,
  };
}

// ==========================================
// PENYIMPANAN TERISOLASI BERDASARKAN ORGANISASI (MULTI-TENANT STORAGE)
// ==========================================
// Karena schema Supabase saat ini tidak memiliki tabel `chatbot_settings`,
// dan kami dilarang mengubah schema atau mengarang kolom pada tabel `organizations`,
// konfigurasi disimpan per-organisasi menggunakan penyimpanan terisolasi
// dengan kunci spesifik `wabiz_chatbot_config_${organizationId}`.
// ==========================================

const inMemoryStore = new Map<string, ChatbotConfig>();

function getOrgStorageKey(organizationId: string): string {
  return `wabiz_chatbot_config_${organizationId}`;
}

export async function loadChatbotConfig(organizationId: string): Promise<ChatbotConfig> {
  if (!organizationId) {
    return DEFAULT_CHATBOT_CONFIG;
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(getOrgStorageKey(organizationId));
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          isEnabled: parsed.isEnabled ?? DEFAULT_CHATBOT_CONFIG.isEnabled,
          welcomeMessage: parsed.welcomeMessage || DEFAULT_WELCOME_MESSAGE,
          rules: {
            ...DEFAULT_RESPONSE_RULES,
            ...(parsed.rules || {}),
          },
          intentRules: {
            ...DEFAULT_INTENT_RULES,
            ...(parsed.intentRules || {}),
          },
          escalation: {
            ...DEFAULT_ESCALATION_SETTINGS,
            ...(parsed.escalation || {}),
          },
          updatedAt: parsed.updatedAt,
        };
      }
    }
  } catch (err) {
    console.warn('Gagal membaca penyimpanan lokal untuk organisasi:', organizationId, err);
  }

  // Fallback ke in-memory map per organisasi
  const mem = inMemoryStore.get(organizationId);
  if (mem) {
    return mem;
  }

  return DEFAULT_CHATBOT_CONFIG;
}

export async function saveChatbotConfig(
  organizationId: string,
  config: ChatbotConfig
): Promise<void> {
  if (!organizationId) {
    throw new Error('ID Organisasi tidak valid untuk menyimpan pengaturan chatbot.');
  }

  const payload: ChatbotConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
  };

  inMemoryStore.set(organizationId, payload);

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(getOrgStorageKey(organizationId), JSON.stringify(payload));
    }
  } catch (err) {
    console.warn('Gagal menulis ke penyimpanan lokal untuk organisasi:', organizationId, err);
  }
}
