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
  source: 'local_grounded_rules' | 'backend_edge_function';
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

  // 5.7 CEK PERTANYAAN KHUSUS DI LUAR KATA KUNCI (KURIKULUM, BAKAT, TAHFIDZ, PROGRAM KHUSUS)
  const isSpecialProgramInquiry =
    p.includes('tahfidz') ||
    p.includes('tahfidzh') ||
    p.includes('tahfiz') ||
    p.includes('kaligrafi') ||
    p.includes('seni') ||
    p.includes('bakat') ||
    p.includes('minat') ||
    p.includes('kurikulum') ||
    p.includes('ekskul') ||
    p.includes('ekstrakurikuler') ||
    p.includes('bahasa arab') ||
    p.includes('kitab kuning') ||
    p.includes('tahsin') ||
    p.includes('program khusus');

  if (isSpecialProgramInquiry) {
    const descLower = (profile.officialDescription || '').toLowerCase();
    const facLower = (profile.facilities || '').toLowerCase();

    // Periksa kata spesifik apa yang ditanyakan pengguna
    const askedKeywords = [
      'tahfidz',
      'tahfidzh',
      'tahfiz',
      'kaligrafi',
      'seni',
      'kurikulum',
      'ekskul',
      'ekstrakurikuler',
      'bahasa arab',
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
      let text = `${greeting}Mohon maaf, informasi mengenai program khusus atau hal tersebut belum tercantum dalam data resmi kami di sistem WABiz.\n\n`;
      text += `Demi menjaga amanah dan ketepatan informasi, asisten kami tidak diizinkan membuat jawaban perkiraan di luar basis pengetahuan resmi yang disahkan lembaga.\n\n`;
      if (rules.fallbackOfferCS && escalation.enabled) {
        text += `Apakah Anda ingin kami berikan kontak Customer Service kami (${escalation.destinationDepartment.toUpperCase()}) agar Anda dapat menanyakan hal ini langsung kepada staf kami?`;
      }
      return {
        text,
        isEscalated: rules.fallbackOfferCS && escalation.enabled,
        detectedIntent: 'special_program',
      };
    }
  }

  // 6. FALLBACK DEFAULT: TIDAK DITEMUKAN PADA PROFIL
  // Menerapkan anti-halusinasi ketat dan penawaran kontak CS
  let fallbackText = `${greeting}Mohon maaf, informasi mengenai hal tersebut belum tercantum dalam data resmi kami di sistem WABiz.\n\n`;
  fallbackText += `Demi menjaga amanah dan ketepatan informasi, asisten kami tidak diizinkan membuat jawaban perkiraan di luar basis pengetahuan resmi yang disahkan lembaga.\n\n`;

  if (rules.fallbackOfferCS && escalation.enabled) {
    fallbackText += `Apakah Anda ingin kami berikan kontak Customer Service kami (${escalation.destinationDepartment.toUpperCase()}) agar Anda dapat menanyakan hal ini langsung kepada staf kami?`;
  }

  return {
    text: fallbackText,
    isEscalated: rules.fallbackOfferCS && escalation.enabled,
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
  const backendUrl = getAiBackendUrl();

  // Jika backend AI Edge Function terkonfigurasi, panggil secara aman
  if (backendUrl && backendUrl.trim() !== '') {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

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
      });

      if (response.ok) {
        const json = await response.json();
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
        'Gagal menghubungi backend AI Edge Function, beralih ke aturan lokal terproteksi:',
        err instanceof Error ? err.message : 'Koneksi terputus'
      );
    }
  }

  // Fallback transparan ke mesin aturan lokal deterministik (Strict Grounded Rules)
  // Tidak mengklaim sebagai model AI eksternal agar transparan kepada pengguna
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
    isAiGenerated: false,
    source: 'local_grounded_rules',
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
