// ==========================================
// WABiz Grounded AI Engine (Staging Worker)
// Menggunakan basis data resmi lembaga dan aturan anti-halusinasi WABiz
//
// BATASAN ARSITEKTUR STAGING (Tahap 1):
// - Worker ini bersifat SINGLE-TENANT: hanya memiliki SATU activeProfile global.
// - Profil disimpan IN-MEMORY dan HILANG saat worker restart.
// - Untuk multi-tenant produksi, diperlukan map orgId → profile atau
//   pemuatan profil dari Supabase saat startup dan per-pesan masuk.
// - setActiveProfile() melakukan REPLACE PENUH (bukan partial merge)
//   untuk mencegah bocornya field dari organisasi sebelumnya.
// ==========================================

export interface FaqItem {
  id?: string;
  question: string;
  answer: string;
}

export type InstitutionType =
  | 'Pesantren / Islamic Boarding School'
  | 'Sekolah Islam Terpadu'
  | 'Madrasah (MI/MTs/MA)'
  | 'Yayasan Pendidikan'
  | 'Lembaga Kursus & Pelatihan'
  | 'Institusi Lainnya';

export interface OrgProfile {
  orgName: string;
  shortName: string;
  institutionType: InstitutionType;
  officialDescription: string;
  logoUrl?: string;
  studentCount?: string;
  staffCount?: string;
  escalationPhone: string;
  officialEmail: string;
  address: string;
  mapsUrl?: string;
  websiteUrl?: string;
  registrationUrl: string;
  infoPageUrl?: string;
  admissionSchedule: string;
  tuitionInfo: string;
  requirements: string;
  admissionContact?: string;
  csHours: string;
  operationalDays: string;
  facilities?: string;
  faqs: FaqItem[];
  orgId: string;
  webhookUrl: string;
  verifyToken: string;
  isGatewayConnected: boolean;
}

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
// DATA DEFAULT ORGANISASI (BELUM DIKONFIGURASI)
// Semua field data lembaga sengaja dikosongkan untuk mencegah chatbot
// menyampaikan informasi contoh/dummy sebagai data resmi.
// Admin lembaga harus mengisi data sesungguhnya melalui halaman Pengaturan.
// ==========================================
export const DEFAULT_ORG_PROFILE: OrgProfile = {
  orgName: '',
  shortName: '',
  institutionType: 'Pesantren / Islamic Boarding School',
  officialDescription: '',
  logoUrl: '',
  studentCount: '',
  staffCount: '',
  escalationPhone: '',
  officialEmail: '',
  address: '',
  mapsUrl: '',
  websiteUrl: '',
  registrationUrl: '',
  infoPageUrl: '',
  admissionSchedule: '',
  tuitionInfo: '',
  requirements: '',
  admissionContact: '',
  csHours: '',
  operationalDays: '',
  facilities: '',
  faqs: [],
  orgId: '',
  webhookUrl: '',
  verifyToken: '',
  isGatewayConnected: false,
};

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
  welcomeMessage:
    "Assalamu'alaikum Wr. Wb. Selamat datang di asisten otomatis WABiz. Ada yang bisa kami bantu seputar pendaftaran santri baru, jadwal, biaya, atau informasi lokasi?",
  rules: DEFAULT_RESPONSE_RULES,
  intentRules: DEFAULT_INTENT_RULES,
  escalation: DEFAULT_ESCALATION_SETTINGS,
};

// State Konfigurasi Aktif Worker
let activeProfile: OrgProfile = { ...DEFAULT_ORG_PROFILE };
let activeConfig: ChatbotConfig = { ...DEFAULT_CHATBOT_CONFIG };

export function getActiveProfile(): OrgProfile {
  return activeProfile;
}

export function setActiveProfile(profile: Partial<OrgProfile>): void {
  // Replace penuh: mulai dari DEFAULT kosong, lalu timpa dengan profile baru.
  // Ini mencegah bocornya field dari organisasi sebelumnya (celah S4).
  activeProfile = { ...DEFAULT_ORG_PROFILE, ...profile };
}

export function getActiveChatbotConfig(): ChatbotConfig {
  return activeConfig;
}

export function setActiveChatbotConfig(cfg: Partial<ChatbotConfig>): void {
  activeConfig = { ...activeConfig, ...cfg };
}

// In-Memory percakapan singkat per nomor kontak (maksimal 5 interaksi terakhir)
const conversationMemory = new Map<string, Array<{ role: 'user' | 'assistant'; text: string }>>();

export function getConversationHistory(phone: string): Array<{ role: 'user' | 'assistant'; text: string }> {
  return conversationMemory.get(phone) || [];
}

export function appendConversation(phone: string, role: 'user' | 'assistant', text: string): void {
  const history = conversationMemory.get(phone) || [];
  history.push({ role, text });
  if (history.length > 10) {
    history.shift();
  }
  conversationMemory.set(phone, history);
}

// ==========================================
// MESIN PENJAWAB DETERMINISTIK (GROUNDED LOCAL ENGINE)
// Menjawab ketat sesuai profil organisasi tanpa halusinasi (Mirror of src/lib/aiService.ts)
// ==========================================
export const WORKER_BUILD_VERSION = '2026-10-21_v1.0.3_honest_cs_escalation';

export function processGroundedBotReply(
  prompt: string,
  profile: OrgProfile,
  rules: AiResponseRules,
  intentRules: IntentDetectionRules,
  escalation: EscalationSettings
): {
  text: string;
  links?: { label: string; url: string }[];
  isEscalated?: boolean;
  leadTagged?: boolean;
  detectedIntent?: string;
} {
  const p = prompt.toLowerCase().trim();

  // Label nama lembaga — gunakan nama generik jika belum diisi admin
  const orgLabel = profile.orgName && profile.orgName.trim()
    ? profile.orgName
    : 'Lembaga Kami';

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
    !p.includes('daftar') &&
    !p.includes('biaya') &&
    !p.includes('syarat') &&
    !p.includes('jadwal') &&
    !p.includes('lokasi') &&
    !p.includes('alamat') &&
    !p.includes('cs')
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

  // 0.5 CEK AFIRMASI / KONFIRMASI BANTUAN CS
  const isAffirmation =
    p === 'ya' ||
    p === 'iya' ||
    p === 'mau' ||
    p === 'boleh' ||
    p === 'silakan' ||
    p === 'silahkan' ||
    p === 'tolong' ||
    p === 'bantu' ||
    p === 'oke' ||
    p === 'ok' ||
    p === 'baik' ||
    p.startsWith('ya ') ||
    p.startsWith('iya ') ||
    p.startsWith('mau ') ||
    p.startsWith('boleh ') ||
    p.includes('tolong hubungkan') ||
    p.includes('bantu hubungkan');

  if (isAffirmation && escalation.enabled) {
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
      detectedIntent: 'gratitude',
    };
  }

  // 1. CEK PERMINTAAN CS / ESKALASI MANUSIA
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
      detectedIntent: 'human_cs_request',
      links: waNumberHuman
        ? [{ label: 'Kontak WhatsApp CS', url: `https://wa.me/${waNumberHuman}` }]
        : undefined,
    };
  }

  // 2. CEK DETEKSI INTENT PENDAFTARAN & SYARAT
  const hasRegIntent =
    intentRules.enabled &&
    (p.includes('daftar') ||
      p.includes('mendaftar') ||
      p.includes('registrasi') ||
      p.includes('psb') ||
      p.includes('cara masuk') ||
      p.includes('formulir') ||
      p.includes('syarat') ||
      p.includes('berkas') ||
      p.includes('jadwal') ||
      p.includes('gelombang') ||
      p.includes('kapan buka'));

  // Jika tanya syarat berkas
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
      return {
        text: `${greeting}Mohon maaf, rincian dokumen persyaratan pendaftaran saat ini belum dimasukkan ke basis data resmi kami. Demi menjaga akurasi informasi, asisten AI tidak diperkenankan mengarang syarat berkas. Silakan hubungi CS kami untuk panduan lengkap.`,
        isEscalated: escalation.enabled,
        leadTagged: intentRules.actionTagLead,
        detectedIntent: 'requirements',
      };
    }
  }

  // Jika tanya jadwal seleksi / PSB
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

  // Jika tanya biaya / SPP / uang pangkal
  if (
    p.includes('biaya') ||
    p.includes('spp') ||
    p.includes('uang') ||
    p.includes('tarif') ||
    p.includes('harga') ||
    p.includes('bayar')
  ) {
    if (profile.tuitionInfo && profile.tuitionInfo.trim()) {
      let text = `${greeting}Terkait informasi biaya resmi di *${orgLabel}*:\n\n${profile.tuitionInfo}\n\n`;
      if (intentRules.actionOfferCS && escalation.enabled) {
        text += `Untuk konsultasi skema angsuran atau rincian tertulis lengkap, silakan tanyakan kepada CS Bagian Keuangan kami.`;
      }
      return {
        text,
        leadTagged: intentRules.actionTagLead,
        isEscalated: false,
        detectedIntent: 'tuition',
      };
    } else {
      return {
        text: `${greeting}Mohon maaf, rincian biaya pendaftaran dan SPP belum dipublikasikan oleh pihak lembaga dalam sistem asisten otomatis ini. Sesuai prinsip anti-halusinasi WABiz, kami tidak diperkenankan memberikan estimasi nominal perkiraan. Apakah Anda ingin kami berikan kontak Customer Service resmi kami untuk menanyakan hal ini lebih lanjut?`,
        isEscalated: escalation.enabled,
        leadTagged: intentRules.actionTagLead,
        detectedIntent: 'tuition',
      };
    }
  }

  // Jika tanya cara daftar umum atau ada niat pendaftaran
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
        detectedIntent: 'location',
        links: profile.mapsUrl
          ? [{ label: 'Buka di Google Maps', url: profile.mapsUrl }]
          : undefined,
      };
    } else {
      return {
        text: `${greeting}Mohon maaf, alamat lengkap organisasi belum dilengkapi oleh administrator. Silakan tanyakan langsung ke CS kami.`,
        isEscalated: escalation.enabled,
        detectedIntent: 'location',
      };
    }
  }

  // 3.5 CEK NAMA / IDENTITAS RESMI LEMBAGA
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

      return { text, detectedIntent: 'org_name' };
    } else {
      return {
        text: `${greeting}Mohon maaf, nama resmi lembaga saat ini belum dikonfigurasi dalam sistem WABiz kami. Demi menjaga amanah dan akurasi informasi, asisten kami tidak diperkenankan mengarang nama atau identitas lembaga. Silakan hubungi staf Customer Service kami untuk konfirmasi lebih lanjut.`,
        isEscalated: escalation.enabled,
        detectedIntent: 'org_name',
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
    return { text, detectedIntent: 'about_facilities' };
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
      detectedIntent: 'hours_contact',
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
        detectedIntent: 'digital_channels',
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
          detectedIntent: 'faq',
        };
      }
    }
  }

  // 6. FALLBACK DEFAULT: TIDAK DITEMUKAN PADA PROFIL
  let fallbackText = `${greeting}Mohon maaf, informasi mengenai hal tersebut belum tercantum dalam data resmi kami di sistem WABiz.\n\n`;
  fallbackText += `Demi menjaga amanah dan ketepatan informasi, asisten kami tidak diizinkan membuat jawaban perkiraan di luar basis pengetahuan resmi yang disahkan lembaga.\n\n`;

  if (rules.fallbackOfferCS && escalation.enabled) {
    fallbackText += `Apakah Anda ingin kami berikan kontak Customer Service kami (${escalation.destinationDepartment.toUpperCase()}) agar Anda dapat menanyakan hal ini langsung kepada staf kami?`;
  }

  return {
    text: fallbackText,
    isEscalated: rules.fallbackOfferCS && escalation.enabled,
    detectedIntent: 'fallback_unknown',
  };
}

// ==========================================
// FUNGSI UTAMA GENERASI BALASAN AI UNTUK WHATSAPP
// ==========================================
export async function generateWhatsAppAiReply(
  prompt: string,
  senderPhone: string
): Promise<{ text: string; source: string; isEscalated?: boolean }> {
  const profile = getActiveProfile();
  const config = getActiveChatbotConfig();

  // Jika bot dinonaktifkan oleh pengaturan lembaga
  if (!config.isEnabled) {
    return {
      text: '',
      source: 'disabled',
    };
  }

  const result = processGroundedBotReply(
    prompt,
    profile,
    config.rules,
    config.intentRules,
    config.escalation
  );

  // Log diagnostik aman (hanya: build version, intent terdeteksi, sumber profil, status orgName)
  // Keamanan: TIDAK mencatat nomor pengirim, isi pesan lengkap, kredensial, atau seluruh profil.
  console.log(
    `[Diagnostic AI] Build: ${WORKER_BUILD_VERSION} | Intent: ${result.detectedIntent || 'unknown'} | Sumber: in-memory activeProfile | Status orgName: ${profile.orgName?.trim() ? 'Tersedia' : 'Kosong'}`
  );

  let replyText = result.text;

  // Format link tambahan agar langsung dapat diklik di WhatsApp
  if (result.links && result.links.length > 0) {
    const unmentionedLinks = result.links.filter((l) => !replyText.includes(l.url));
    if (unmentionedLinks.length > 0) {
      replyText += '\n\n---\n*Tautan Resmi:*';
      for (const link of unmentionedLinks) {
        replyText += `\n• ${link.label}: ${link.url}`;
      }
    }
  }

  // Catat riwayat ke memori percakapan
  appendConversation(senderPhone, 'user', prompt);
  appendConversation(senderPhone, 'assistant', replyText);

  return {
    text: replyText,
    source: 'local_grounded_rules',
    isEscalated: result.isEscalated,
  };
}
