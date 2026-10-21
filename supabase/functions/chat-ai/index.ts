import { createClient } from 'npm:@supabase/supabase-js@2';

// ==========================================
// KONTRAK TIPE DATA CHATBOT AI WABIZ
// ==========================================
interface FaqItem {
  id?: string;
  question: string;
  answer: string;
}

interface OrgProfileData {
  orgName?: string;
  shortName?: string;
  institutionType?: string;
  officialDescription?: string;
  studentCount?: string;
  staffCount?: string;
  escalationPhone?: string;
  officialEmail?: string;
  address?: string;
  mapsUrl?: string;
  websiteUrl?: string;
  registrationUrl?: string;
  infoPageUrl?: string;
  admissionSchedule?: string;
  tuitionInfo?: string;
  requirements?: string;
  admissionContact?: string;
  csHours?: string;
  operationalDays?: string;
  facilities?: string;
  faqs?: FaqItem[];
}

interface AiRules {
  tone?: 'formal' | 'friendly' | 'professional';
  language?: 'id' | 'id_islamic' | 'en';
  answerLength?: 'concise' | 'balanced' | 'detailed';
  strictGrounding?: boolean;
  fallbackOfferCS?: boolean;
}

interface IntentRules {
  enabled?: boolean;
  triggerKeywords?: string[];
  actionSendRegLink?: boolean;
  actionOfferCS?: boolean;
  actionTagLead?: boolean;
  actionNotifyAdmin?: boolean;
}

interface EscalationSettings {
  enabled?: boolean;
  destinationDepartment?: 'psb' | 'general' | 'finance' | 'supervisor' | 'admin';
  escalateOnFallback?: boolean;
  escalateOnHumanRequest?: boolean;
}

interface ChatAiRequestBody {
  organization_id: string;
  prompt: string;
  conversation_history?: Array<{
    sender?: 'user' | 'bot' | 'model';
    role?: 'user' | 'model';
    text?: string;
    parts?: Array<{ text: string }>;
  }>;
  rules?: AiRules;
  intent_rules?: IntentRules;
  escalation?: EscalationSettings;
  profile?: OrgProfileData;
}

// ==========================================
// CORS HEADERS UNTUK EXPO & WEB CLIENT
// ==========================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ==========================================
// HELPER: PENYUSUNAN SISTEM INSTRUKSI GROUNDED
// ==========================================
function buildSystemInstruction(
  p: OrgProfileData,
  rules: AiRules = {},
  escalation: EscalationSettings = {}
): string {
  const orgName = p.orgName || 'Lembaga Pendidikan WABiz';
  const tone = rules.tone || 'friendly';
  const lang = rules.language || 'id_islamic';
  const len = rules.answerLength || 'balanced';

  const toneGuideline =
    tone === 'formal'
      ? 'Gunakan bahasa formal, sopan, akademis, dan terstruktur rapi.'
      : tone === 'friendly'
      ? 'Gunakan bahasa yang ramah, hangat, mengayomi, bersahabat (gunakan sapaan sopan seperti Ayah/Bunda, Bapak/Ibu, atau Sahabat).'
      : 'Gunakan gaya komunikasi profesional bisnis SaaS yang efisien, santun, dan jelas.';

  const langGuideline =
    lang === 'id_islamic'
      ? 'Gunakan salam Islami (Assalamu\'alaikum Warahmatullahi Wabarakatuh di awal percakapan), serta istilah santun yang lazim di lingkungan pendidikan Islam/pesantren bila relevan (Alhamdulillah, InsyaAllah, Barakallah).'
      : lang === 'en'
      ? 'Respond in clear and courteous English.'
      : 'Gunakan bahasa Indonesia baku yang santun dan mudah dipahami masyarakat umum.';

  const lenGuideline =
    len === 'concise'
      ? 'Jawab secara padat dan langsung ke poin inti (maksimal 2-3 kalimat ringkas).'
      : len === 'detailed'
      ? 'Jawab secara komprehensif, terperinci dengan poin-poin penjelasan yang terstruktur.'
      : 'Jawab dengan panjang seimbang (informatif, jelas, dan tidak berbelit-belit).';

  // Format daftar FAQ
  let faqsFormatted = 'Belum ada FAQ khusus yang ditambahkan.';
  if (Array.isArray(p.faqs) && p.faqs.length > 0) {
    faqsFormatted = p.faqs
      .filter((f) => f && f.question && f.answer)
      .map((f, i) => `${i + 1}. Tanya: "${f.question}"\n   Jawab: "${f.answer}"`)
      .join('\n\n');
  }

  const deptLabel =
    escalation.destinationDepartment === 'psb'
      ? 'Customer Service Pendaftaran (PSB / Admisi)'
      : escalation.destinationDepartment === 'finance'
      ? 'Customer Service Bagian Keuangan'
      : escalation.destinationDepartment === 'supervisor'
      ? 'Supervisor Layanan'
      : escalation.destinationDepartment === 'admin'
      ? 'Administrasi & Tata Usaha'
      : 'Layanan Umum & Humas';

  return `Anda adalah Asisten Virtual Resmi (AI Chatbot) untuk lembaga pendidikan "${orgName}".
Tugas utama Anda adalah melayani pertanyaan calon siswa/santri, wali murid, dan masyarakat dengan cepat, ramah, dan 100% akurat.

==================================================
PRINSIP UTAMA: ANTI-HALUSINASI KETAT (STRICT GROUNDING)
==================================================
1. SUMBER KEBENARAN TUNGGAL: Anda HANYA boleh menjawab berdasarkan "BASIS PENGETAHUAN RESMI LEMBAGA" dan "DAFTAR FAQ RESMI" yang tercantum di bawah ini.
2. JANGAN PERNAH MENGARANG: Jangan pernah mengasumsikan, menebak, atau mengarang informasi apa pun yang tidak tertulis secara eksplisit dalam basis pengetahuan di bawah ini. Hal ini mencakup:
   - Nominal biaya pendidikan, rincian uang pangkal, diskon, atau beasiswa.
   - Tanggal pasti ujian, jadwal seleksi, atau batas akhir pendaftaran.
   - Nama ustadz/guru, kepala sekolah, atau susunan pengurus.
   - Syarat berkas dokumen yang tidak tercantum.
3. JIKA INFORMASI TIDAK TERSEDIA:
   - Jika penanya menanyakan hal yang TIDAK tercantum atau belum lengkap pada data resmi di bawah, Anda HARUS menyatakan secara jujur dan santun bahwa informasi tersebut saat ini belum tersedia dalam data resmi kami.
   - Jangan pernah membuat estimasi angka perkiraan (misalnya: "mungkin sekitar 5 juta").
   - Arahkan penanya untuk menghubungi staf Customer Service kami (${deptLabel}) di jam operasional resmi agar mendapatkan konfirmasi yang pasti.
4. GAYA KOMUNIKASI & BAHASA:
   - ${toneGuideline}
   - ${langGuideline}
   - ${lenGuideline}
5. NIAT PENDAFTARAN & TAUTAN RESMI:
   - Bila penanya berminat mendaftar atau menanyakan formulir, berikan petunjuk jelas dan cantumkan tautan portal pendaftaran resmi jika tersedia (${p.registrationUrl || 'hubungi CS'}).
   - Berikan nomor kontak CS resmi (${p.escalationPhone || p.admissionContact || 'tersedia pada jam kerja'}) bila penanya meminta bantuan langsung.

==================================================
BASIS PENGETAHUAN RESMI LEMBAGA: "${orgName}"
==================================================
• Nama Resmi Lembaga: ${orgName} ${p.shortName ? `(${p.shortName})` : ''}
• Kategori / Jenis Institusi: ${p.institutionType || 'Pesantren / Islamic Boarding School'}
• Profil & Deskripsi Resmi: ${p.officialDescription || 'Belum diisi oleh administrator lembaga.'}
• Statistik Santri / Siswa Aktif: ${p.studentCount || 'Belum dicantumkan.'}
• Tenaga Pengajar & Asatidz: ${p.staffCount || 'Belum dicantumkan.'}
• Fasilitas Lembaga: ${p.facilities || 'Belum dicantumkan secara rinci.'}

--- KONTAK & LOKASI KAMPUS ---
• Alamat Lengkap: ${p.address || 'Belum dicantumkan.'}
• Tautan Google Maps: ${p.mapsUrl || 'Belum tersedia.'}
• Situs Web Resmi: ${p.websiteUrl || 'Belum tersedia.'}
• Email Resmi: ${p.officialEmail || 'Belum tersedia.'}
• Kontak WhatsApp Resmi / CS: ${p.escalationPhone || p.admissionContact || 'Belum dicantumkan.'}
• Jam Layanan CS: ${p.csHours || '08.00 - 16.00 WIB'}
• Hari Kerja Pelayanan: ${p.operationalDays || 'Senin - Sabtu'}

--- INFORMASI PENDAFTARAN & ADMISI (PSB) ---
• Portal Pendaftaran Online: ${p.registrationUrl || 'Belum tersedia.'}
• Informasi Lengkap Pendaftaran: ${p.infoPageUrl || 'Belum tersedia.'}
• Jadwal & Gelombang Pendaftaran: ${p.admissionSchedule || 'Belum dipublikasikan.'}
• Rincian Biaya & Uang Pangkal: ${p.tuitionInfo || 'Belum dipublikasikan secara terbuka di sistem.'}
• Berkas Dokumen & Persyaratan: ${p.requirements || 'Belum dicantumkan.'}
• Kontak Khusus Pendaftaran: ${p.admissionContact || p.escalationPhone || 'Hubungi CS.'}

==================================================
DAFTAR FAQ RESMI LEMBAGA
==================================================
${faqsFormatted}
==================================================`;
}

// ==========================================
// HELPER: DETEKSI INTENT PENDAFTARAN & ESKALASI
// ==========================================
function analyzeIntents(
  prompt: string,
  replyText: string,
  profile: OrgProfileData,
  intentRules?: IntentRules,
  escalation?: EscalationSettings
): {
  isEscalated: boolean;
  leadTagged: boolean;
  links: Array<{ label: string; url: string }>;
} {
  const p = prompt.toLowerCase();
  const r = replyText.toLowerCase();
  const links: Array<{ label: string; url: string }> = [];

  // 1. Deteksi Niat Pendaftaran (Lead Tagging)
  const regKeywords = [
    'daftar',
    'mendaftar',
    'registrasi',
    'psb',
    'formulir',
    'cara masuk',
    'syarat',
    'biaya',
    'uang masuk',
    'spp',
    'jadwal',
    'gelombang',
    'kapan buka',
    'kuota',
  ];
  const hasRegIntent =
    (intentRules?.enabled ?? true) &&
    regKeywords.some((kw) => p.includes(kw));

  const leadTagged = hasRegIntent && (intentRules?.actionTagLead ?? true);

  if (hasRegIntent && profile.registrationUrl) {
    links.push({
      label: 'Portal Pendaftaran Online',
      url: profile.registrationUrl,
    });
  }

  // 2. Deteksi Eskalasi CS
  const humanKeywords = [
    'cs',
    'admin',
    'operator',
    'manusia',
    'bicara langsung',
    'staf',
    'kontak wa',
    'nomor wa',
    'hubungi cs',
  ];
  const isHumanRequested = humanKeywords.some((kw) => p.includes(kw));

  // Cek apakah balasan AI menyatakan data belum tersedia sehingga perlu eskalasi
  const isUnconfirmedInfo =
    r.includes('belum tersedia') ||
    r.includes('belum dicantumkan') ||
    r.includes('hubungi customer service') ||
    r.includes('hubungi cs') ||
    r.includes('menghubungi staf') ||
    r.includes('konfirmasi lebih lanjut');

  const isEscalationEnabled = escalation?.enabled ?? true;
  const isEscalated =
    isEscalationEnabled &&
    ((isHumanRequested && (escalation?.escalateOnHumanRequest ?? true)) ||
      (isUnconfirmedInfo && (escalation?.escalateOnFallback ?? true)));

  if (isEscalated && profile.escalationPhone) {
    const cleanPhone = profile.escalationPhone.replace(/[^0-9]/g, '');
    if (cleanPhone) {
      links.push({
        label: 'Hubungi WhatsApp CS',
        url: `https://wa.me/${cleanPhone}`,
      });
    }
  }

  // 3. Tautan Tambahan Relevan (Maps & Website)
  if ((p.includes('alamat') || p.includes('lokasi') || p.includes('maps')) && profile.mapsUrl) {
    if (!links.some((l) => l.url === profile.mapsUrl)) {
      links.push({
        label: 'Buka di Google Maps',
        url: profile.mapsUrl,
      });
    }
  }

  if ((p.includes('website') || p.includes('situs') || p.includes('web')) && profile.websiteUrl) {
    if (!links.some((l) => l.url === profile.websiteUrl)) {
      links.push({
        label: 'Kunjungi Website Resmi',
        url: profile.websiteUrl,
      });
    }
  }

  return { isEscalated, leadTagged, links };
}

// ==========================================
// SUPABASE EDGE FUNCTION MAIN ENTRYPOINT
// ==========================================
Deno.serve(async (req: Request) => {
  // 1. Tangani Preflight Request (CORS OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. Hanya izinkan metode HTTP POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Gunakan metode POST.' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // 3. Validasi Autentikasi Klien (Header Authorization)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized: Header Authorization Bearer diperlukan.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({
          error: 'Server configuration error: SUPABASE_URL atau SUPABASE_ANON_KEY belum terpasang.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Inisialisasi Supabase Client menggunakan token JWT pengguna untuk menjaga RLS
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // 4. Verifikasi Keabsahan Sesi Pengguna
    const {
      data: { user },
      error: userAuthError,
    } = await supabase.auth.getUser();

    if (userAuthError || !user) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized: Sesi autentikasi tidak valid atau telah kedaluwarsa.',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 5. Baca & Validasi Body Request
    const body: ChatAiRequestBody = await req.json();
    const { organization_id, prompt, conversation_history, rules, intent_rules, escalation, profile: clientProfile } = body;

    if (!organization_id || typeof organization_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Field "organization_id" wajib disertakan.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Field "prompt" tidak boleh kosong.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (prompt.trim().length > 1000) {
      return new Response(
        JSON.stringify({ error: 'Pertanyaan melebihi batas maksimal 1000 karakter.' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 6. Validasi Isolasi Multi-Tenant (User harus anggota aktif organisasi)
    const { data: memberRecord, error: memberCheckError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organization_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberCheckError || !memberRecord) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden: Anda tidak memiliki akses ke organisasi ini.',
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 7. Ambil Data Profil Resmi dari Supabase (organization_profiles)
    // KEAMANAN: Database adalah satu-satunya sumber kebenaran (Single Source of Truth).
    // clientProfile dari payload request DIABAIKAN untuk mencegah penyisipan data palsu.
    let finalProfile: OrgProfileData = {};

    try {
      const { data: dbProfile, error: profileErr } = await supabase
        .from('organization_profiles')
        .select('*')
        .eq('organization_id', organization_id)
        .maybeSingle();

      if (!profileErr && dbProfile) {
        finalProfile = {
          orgName: dbProfile.org_name || '',
          shortName: dbProfile.short_name || '',
          institutionType: dbProfile.institution_type || '',
          officialDescription: dbProfile.official_description || '',
          studentCount: dbProfile.student_count || '',
          staffCount: dbProfile.staff_count || '',
          escalationPhone: dbProfile.escalation_phone || '',
          officialEmail: dbProfile.official_email || '',
          address: dbProfile.address || '',
          mapsUrl: dbProfile.maps_url || '',
          websiteUrl: dbProfile.website_url || '',
          registrationUrl: dbProfile.registration_url || '',
          infoPageUrl: dbProfile.info_page_url || '',
          admissionSchedule: dbProfile.admission_schedule || '',
          tuitionInfo: dbProfile.tuition_info || '',
          requirements: dbProfile.requirements || '',
          admissionContact: dbProfile.admission_contact || '',
          csHours: dbProfile.cs_hours || '',
          operationalDays: dbProfile.operational_days || '',
          facilities: dbProfile.facilities || '',
          faqs: Array.isArray(dbProfile.faqs) ? dbProfile.faqs : [],
        };
      } else if (profileErr) {
        console.warn('Gagal memuat organization_profiles dari DB:', profileErr.message);
      }
    } catch (profileFetchErr) {
      console.warn('Exception saat memuat organization_profiles dari DB:', profileFetchErr);
    }

    // 8. Cek Ketersediaan Kunci Rahasia Gemini API di Secrets Backend
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey || geminiApiKey.trim() === '') {
      return new Response(
        JSON.stringify({
          error: 'GEMINI_API_KEY belum dikonfigurasi pada Supabase Secrets.',
          hint: 'Jalankan perintah: npx supabase secrets set GEMINI_API_KEY=AIzaSy...',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 9. Susun System Instruction Berdasarkan Pengetahuan Resmi Lembaga
    const systemInstruction = buildSystemInstruction(finalProfile, rules, escalation);

    // 10. Format Riwayat Percakapan Sesuai Format Gemini API
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    if (Array.isArray(conversation_history) && conversation_history.length > 0) {
      const recentTurns = conversation_history.slice(-6);
      for (const turn of recentTurns) {
        const text =
          turn.text ||
          (turn.parts && turn.parts.length > 0 ? turn.parts[0].text : '');
        if (text && text.trim()) {
          const role: 'user' | 'model' =
            turn.role === 'model' || turn.sender === 'bot' || turn.sender === 'model'
              ? 'model'
              : 'user';

          // Cegah giliran berturut-turut dengan role yang sama
          if (contents.length > 0 && contents[contents.length - 1].role === role) {
            contents[contents.length - 1].parts[0].text += `\n${text.trim()}`;
          } else {
            contents.push({
              role,
              parts: [{ text: text.trim() }],
            });
          }
        }
      }
    }

    // Tambahkan pertanyaan pengguna saat ini sebagai giliran terakhir
    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents[contents.length - 1].parts[0].text += `\n${prompt.trim()}`;
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: prompt.trim() }],
      });
    }

    // 11. Panggil Google Gemini API (Model Resmi: gemini-3.8-flash)
    const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';
    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;

    const geminiPayload = {
      contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.2, // Rendah agar konsisten, faktual, dan tidak berhalusinasi
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 1000,
      },
    };

    let geminiResponse: Response;
    try {
      geminiResponse = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiPayload),
      });
    } catch (_networkErr: unknown) {
      // Retry maksimal 1 kali jika terjadi kegagalan koneksi awal
      console.warn('Koneksi awal ke Google Gemini gagal. Mencoba 1 kali lagi setelah jeda 1000ms...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      geminiResponse = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(geminiPayload),
      });
    }

    // Penanganan error 503 UNAVAILABLE sementara dari Google Gemini:
    // Tambahkan maksimal 1 kali percobaan ulang dengan jeda singkat (1200ms)
    if (!geminiResponse.ok && geminiResponse.status === 503) {
      console.warn('Google Gemini API merespons status 503 UNAVAILABLE sementara. Menjalankan 1 kali percobaan ulang setelah jeda 1200ms...');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        geminiResponse = await fetch(geminiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(geminiPayload),
        });
      } catch (_retryErr: unknown) {
        console.error('Percobaan ulang ke Google Gemini API gagal.');
      }
    }

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`Error dari Gemini API setelah percobaan: status ${geminiResponse.status}`);
      return new Response(
        JSON.stringify({
          error: `Gagal memproses AI (Gemini status ${geminiResponse.status}).`,
          detail: geminiResponse.status === 503 ? 'Layanan Google Gemini sedang mengalami beban tinggi (UNAVAILABLE).' : errorText,
        }),
        {
          status: geminiResponse.status === 503 ? 503 : 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const geminiResult = await geminiResponse.json();
    const candidate = geminiResult.candidates?.[0];
    const generatedText = candidate?.content?.parts?.[0]?.text;

    if (!generatedText || generatedText.trim().length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Model AI tidak menghasilkan respon teks yang valid.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const cleanReplyText = generatedText.trim();

    // 12. Pasca-Proses: Deteksi Intent Pendaftaran, Eskalasi CS, & Tautan Terkait
    const { isEscalated, leadTagged, links } = analyzeIntents(
      prompt,
      cleanReplyText,
      finalProfile,
      intent_rules,
      escalation
    );

    // 13. Kembalikan Respon Terstruktur
    const responsePayload = {
      text: cleanReplyText,
      isAiGenerated: true,
      source: 'backend_edge_function',
      isEscalated,
      leadTagged,
      links: links.length > 0 ? links : undefined,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Unhandled Edge Function error:', err);
    return new Response(
      JSON.stringify({
        error: 'Terjadi kesalahan internal pada backend AI Edge Function.',
        detail: errorMsg,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
