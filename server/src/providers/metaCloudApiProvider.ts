// ==========================================
// Meta WhatsApp Cloud API Provider Adapter
// ==========================================

import {
  IWhatsAppProvider,
  ProviderType,
  SendMessageOptions,
  SendTemplateOptions,
  SendMessageResult,
  ProviderConnectionStatus,
  ProviderReadinessResult,
  DeliveryStatus,
} from './types';
import { config } from '../config';
import { createWorkerSupabaseClient } from '../supabase';
import { maskPhone } from '../security';

export interface MetaCredentials {
  phoneNumberId: string;
  accessToken: string;
  displayPhoneNumber?: string;
  qualityRating?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  messagingTier?: string;
}

export class MetaCloudApiProvider implements IWhatsAppProvider {
  public readonly providerType: ProviderType = 'meta_cloud_api';
  private baseUrl: string;
  private apiVersion: string;

  constructor(customBaseUrl?: string, customApiVersion?: string) {
    this.baseUrl = (customBaseUrl || config.metaApiBaseUrl || 'https://graph.facebook.com').replace(/\/+$/, '');
    this.apiVersion = customApiVersion || config.metaGraphApiVersion || 'v21.0';
  }

  /**
   * Mengatur URL basis untuk pengujian mock
   */
  public setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  /**
   * Mengatur versi API untuk pengujian
   */
  public setApiVersion(version: string): void {
    this.apiVersion = version;
  }

  /**
   * Mengambil kredensial Meta Cloud API untuk suatu organisasi
   */
  public async getCredentials(organizationId: string): Promise<MetaCredentials | null> {
    const supabase = createWorkerSupabaseClient();

    // 1. Coba ambil dari database jika Supabase aktif
    if (supabase && organizationId) {
      try {
        const { data: cfg } = await supabase
          .from('organization_whatsapp_configs')
          .select('phone_number_id, display_phone_number, quality_rating, messaging_tier, is_active')
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .maybeSingle();

        if (cfg && cfg.phone_number_id) {
          // Ambil secret dari private schema via query
          const { data: sec } = await supabase
            .from('organization_whatsapp_secrets')
            .select('encrypted_system_token')
            .eq('organization_id', organizationId)
            .maybeSingle();

          if (sec && sec.encrypted_system_token) {
            return {
              phoneNumberId: cfg.phone_number_id,
              accessToken: sec.encrypted_system_token,
              displayPhoneNumber: cfg.display_phone_number,
              qualityRating: cfg.quality_rating,
              messagingTier: cfg.messaging_tier,
            };
          }
        }
      } catch (err: any) {
        console.warn(`[MetaCloudApiProvider] Gagal membaca konfigurasi DB untuk org ${organizationId}:`, err?.message);
      }
    }

    // 2. Fallback lingkungan (Environment fallback untuk staging/pengujian)
    // HANYA diizinkan jika organizationId secara eksplisit cocok dengan workerOrgId konfigurasi
    const configuredWorkerOrg = (config.workerOrgId || '').trim();
    const isExplicitlyAllowedWorkerOrg = Boolean(
      configuredWorkerOrg &&
      organizationId &&
      organizationId.trim() === configuredWorkerOrg
    );

    if (isExplicitlyAllowedWorkerOrg) {
      const envToken = config.metaSystemUserToken || process.env.META_SYSTEM_USER_TOKEN;
      const envPhoneId = process.env.META_PHONE_NUMBER_ID || process.env.META_PHONE_ID;

      if (envToken && envPhoneId) {
        return {
          phoneNumberId: envPhoneId,
          accessToken: envToken,
          displayPhoneNumber: process.env.META_DISPLAY_PHONE,
          qualityRating: 'GREEN',
          messagingTier: 'TIER_1K',
        };
      }
    }

    return null;
  }

  /**
   * Memeriksa apakah penerima berada di dalam jendela layanan 24 jam (24-Hour Customer Service Window).
   * Meta mewajibkan pesan teks bebas hanya dikirimkan maksimal 24 jam sejak pesan pelanggan terakhir.
   */
  public async isWithin24HourWindow(organizationId: string, recipientPhone: string): Promise<boolean> {
    const supabase = createWorkerSupabaseClient();
    if (!supabase || !organizationId || !recipientPhone) {
      return true; // Jika DB tidak terhubung, loloskan untuk validasi tingkat API
    }

    try {
      // Cari kontak berdasarkan nomor
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('phone', recipientPhone)
        .maybeSingle();

      if (!contact) return false;

      // Cari waktu pesan terakhir dari percakapan
      const { data: conv } = await supabase
        .from('conversations')
        .select('last_message_at')
        .eq('organization_id', organizationId)
        .eq('contact_id', contact.id)
        .maybeSingle();

      if (!conv || !conv.last_message_at) return false;

      const lastMsgTime = new Date(conv.last_message_at).getTime();
      const now = Date.now();
      const diffHours = (now - lastMsgTime) / (1000 * 60 * 60);

      return diffHours <= 24;
    } catch {
      return true; // Aman: serahkan keputusan akhir kepada respon resmi Graph API jika query gagal
    }
  }

  /**
   * Memeriksa apakah nomor tujuan telah meminta opt-out (berhenti berlangganan)
   */
  public async isRecipientOptedOut(organizationId: string, recipientPhone: string): Promise<boolean> {
    const supabase = createWorkerSupabaseClient();
    if (!supabase || !organizationId || !recipientPhone) {
      return false;
    }

    try {
      const { data: contact } = await supabase
        .from('contacts')
        .select('is_opted_out, labels')
        .eq('organization_id', organizationId)
        .eq('phone', recipientPhone)
        .maybeSingle();

      if (!contact) return false;

      const hasOptOutLabel = Array.isArray(contact.labels) && (
        contact.labels.includes('opt-out') ||
        contact.labels.includes('optout') ||
        contact.labels.includes('berhenti')
      );

      return Boolean(contact.is_opted_out) || hasOptOutLabel;
    } catch {
      return false;
    }
  }

  /**
   * Mengirim pesan teks reguler via Meta WhatsApp Cloud API (REST)
   */
  public async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    const { organizationId, recipientPhone, text, metadata } = options;
    const timestamp = new Date().toISOString();

    if (!recipientPhone || !text.trim()) {
      return {
        success: false,
        provider: 'meta_cloud_api',
        error: 'Nomor penerima dan isi teks pesan wajib diisi.',
        timestamp,
      };
    }

    let cleanPhone = recipientPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    }

    // 1. Validasi Opt-Out
    if (metadata?.skipOptOutCheck !== true) {
      const optedOut = await this.isRecipientOptedOut(organizationId, cleanPhone);
      if (optedOut) {
        console.warn(`[MetaCloudApi] Pengiriman ke +${maskPhone(cleanPhone)} dibatalkan: Kontak berstatus Opt-Out.`);
        return {
          success: false,
          provider: 'meta_cloud_api',
          errorCode: 'RECIPIENT_OPTED_OUT',
          error: 'Penerima telah memilih untuk berhenti menerima pesan (Opt-out).',
          timestamp,
        };
      }
    }

    // 2. Validasi Jendela Layanan 24 Jam untuk pesan teks biasa
    if (metadata?.skipWindowCheck !== true) {
      const withinWindow = await this.isWithin24HourWindow(organizationId, cleanPhone);
      if (!withinWindow) {
        console.warn(`[MetaCloudApi] Pengiriman teks ke +${maskPhone(cleanPhone)} ditolak: Di luar jendela 24 jam.`);
        return {
          success: false,
          provider: 'meta_cloud_api',
          errorCode: 131047,
          error: 'Di luar jendela layanan 24 jam. Kirim pesan template resmi untuk membuka kembali percakapan (Meta Error 131047).',
          timestamp,
        };
      }
    }

    // 3. Resolusi Kredensial
    const creds = await this.getCredentials(organizationId);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return {
        success: false,
        provider: 'meta_cloud_api',
        errorCode: 'CREDENTIALS_MISSING',
        error: 'Kredensial Meta WhatsApp Cloud API tidak ditemukan untuk organisasi ini.',
        timestamp,
      };
    }

    // 4. Bangun Payload Pesan Teks Sesuai Spesifikasi Graph API
    const url = `${this.baseUrl}/${this.apiVersion}/${creds.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: text,
      },
    };

    try {
      console.log(`[MetaCloudApi] Mengirim teks via Graph API (${this.apiVersion}) ke +${maskPhone(cleanPhone)}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorObj = data.error || {};
        const code = errorObj.code || response.status;
        const msg = errorObj.message || `Meta Cloud API HTTP ${response.status}`;
        console.error(`[MetaCloudApi] Error ${code}: ${msg}`);

        return {
          success: false,
          provider: 'meta_cloud_api',
          errorCode: code,
          error: msg,
          timestamp,
        };
      }

      const providerMessageId = data.messages?.[0]?.id;
      console.log(`[MetaCloudApi] Sukses terkirim! Provider Message ID: ${providerMessageId}`);

      return {
        success: true,
        provider: 'meta_cloud_api',
        providerMessageId,
        timestamp,
      };
    } catch (err: any) {
      console.error('[MetaCloudApi] Network exception:', err?.message || err);
      return {
        success: false,
        provider: 'meta_cloud_api',
        error: err?.message || 'Gagal tersambung ke endpoint Meta Graph API.',
        timestamp,
      };
    }
  }

  /**
   * Mengirim pesan template resmi via Meta WhatsApp Cloud API (REST)
   */
  public async sendTemplateMessage(options: SendTemplateOptions): Promise<SendMessageResult> {
    const { organizationId, recipientPhone, templateName, languageCode, components, metadata } = options;
    const timestamp = new Date().toISOString();

    if (!recipientPhone || !templateName) {
      return {
        success: false,
        provider: 'meta_cloud_api',
        error: 'Nomor penerima dan nama template wajib diisi.',
        timestamp,
      };
    }

    let cleanPhone = recipientPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.slice(1);
    }

    // 1. Validasi Opt-Out
    if (metadata?.skipOptOutCheck !== true) {
      const optedOut = await this.isRecipientOptedOut(organizationId, cleanPhone);
      if (optedOut) {
        return {
          success: false,
          provider: 'meta_cloud_api',
          errorCode: 'RECIPIENT_OPTED_OUT',
          error: 'Penerima telah memilih untuk berhenti menerima pesan (Opt-out).',
          timestamp,
        };
      }
    }

    // 2. Resolusi Kredensial
    const creds = await this.getCredentials(organizationId);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return {
        success: false,
        provider: 'meta_cloud_api',
        errorCode: 'CREDENTIALS_MISSING',
        error: 'Kredensial Meta WhatsApp Cloud API tidak ditemukan untuk organisasi ini.',
        timestamp,
      };
    }

    // 3. Bangun Payload Template
    const url = `${this.baseUrl}/${this.apiVersion}/${creds.phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode || 'id',
        },
        components: components || [],
      },
    };

    try {
      console.log(`[MetaCloudApi] Mengirim template [${templateName}] ke +${maskPhone(cleanPhone)}...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorObj = data.error || {};
        const code = errorObj.code || response.status;
        const msg = errorObj.message || `Meta Cloud API HTTP ${response.status}`;
        console.error(`[MetaCloudApi] Error template ${code}: ${msg}`);

        return {
          success: false,
          provider: 'meta_cloud_api',
          errorCode: code,
          error: msg,
          timestamp,
        };
      }

      const providerMessageId = data.messages?.[0]?.id;
      return {
        success: true,
        provider: 'meta_cloud_api',
        providerMessageId,
        timestamp,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'meta_cloud_api',
        error: err?.message || 'Gagal tersambung ke endpoint Meta Graph API.',
        timestamp,
      };
    }
  }

  /**
   * Mengambil status koneksi dan kesehatan nomor resmi di Graph API
   */
  public async getConnectionStatus(organizationId: string): Promise<ProviderConnectionStatus> {
    const creds = await this.getCredentials(organizationId);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return {
        provider: 'meta_cloud_api',
        isConnected: false,
        qualityRating: 'UNKNOWN',
        messagingTier: 'UNCONFIGURED',
        details: { error: 'Kredensial Meta belum dikonfigurasi' },
      };
    }

    try {
      const url = `${this.baseUrl}/${this.apiVersion}/${creds.phoneNumberId}?fields=verified_name,code_verification_status,display_phone_number,quality_rating,messaging_limit_tier`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${creds.accessToken}`,
        },
      });

      if (!response.ok) {
        return {
          provider: 'meta_cloud_api',
          isConnected: false,
          qualityRating: creds.qualityRating || 'UNKNOWN',
          messagingTier: creds.messagingTier || 'TIER_1K',
          details: { error: `HTTP ${response.status}` },
        };
      }

      const data = await response.json();
      return {
        provider: 'meta_cloud_api',
        isConnected: true,
        phone: data.display_phone_number || creds.displayPhoneNumber,
        qualityRating: data.quality_rating || creds.qualityRating || 'GREEN',
        messagingTier: data.messaging_limit_tier || creds.messagingTier || 'TIER_1K',
        details: {
          verifiedName: data.verified_name,
          verificationStatus: data.code_verification_status,
        },
      };
    } catch (err: any) {
      return {
        provider: 'meta_cloud_api',
        isConnected: false,
        qualityRating: creds.qualityRating || 'UNKNOWN',
        messagingTier: creds.messagingTier || 'TIER_1K',
        details: { error: err?.message },
      };
    }
  }

  /**
   * Mengambil status kesiapan Meta Cloud API untuk pengiriman kampanye
   */
  public async getReadiness(organizationId: string): Promise<ProviderReadinessResult> {
    const creds = await this.getCredentials(organizationId);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return {
        isReady: false,
        code: 'unconfigured',
        label: 'Konfigurasi provider belum lengkap',
        message: 'Kredensial Meta WhatsApp Cloud API (Phone Number ID / Access Token) belum dikonfigurasi untuk organisasi ini.',
        provider: 'meta_cloud_api',
        providerDisplayName: 'Meta WhatsApp Cloud API',
        phone: creds?.displayPhoneNumber,
        details: { missingCredentials: true },
      };
    }

    const connStatus = await this.getConnectionStatus(organizationId);
    if (connStatus.isConnected) {
      return {
        isReady: true,
        code: 'ready',
        label: 'Siap mengirim',
        message: 'Meta WhatsApp Cloud API siap mengirim pesan kampanye.',
        provider: 'meta_cloud_api',
        providerDisplayName: 'Meta WhatsApp Cloud API',
        phone: connStatus.phone || creds.displayPhoneNumber,
        details: connStatus.details,
      };
    }

    return {
      isReady: false,
      code: 'connection_error',
      label: 'Terjadi kesalahan koneksi',
      message: (connStatus.details?.error as string) || 'Gagal menghubungi Meta Graph API.',
      provider: 'meta_cloud_api',
      providerDisplayName: 'Meta WhatsApp Cloud API',
      phone: connStatus.phone || creds.displayPhoneNumber,
      details: connStatus.details,
    };
  }

  /**
   * Normalisasi status pengiriman Meta ke format standar WABiz
   */
  public normalizeDeliveryStatus(rawStatus: string): DeliveryStatus {
    const status = String(rawStatus).toLowerCase().trim();
    switch (status) {
      case 'sent':
        return 'sent';
      case 'delivered':
        return 'delivered';
      case 'read':
        return 'read';
      case 'failed':
        return 'failed';
      default:
        return 'queued';
    }
  }
}

export const metaCloudApiProvider = new MetaCloudApiProvider();
