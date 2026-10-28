// ==========================================
// WABiz WhatsApp Provider Registry & Factory
// ==========================================

import { IWhatsAppProvider, ProviderType, ProviderReadinessResult } from './types';
import { baileysProvider } from './baileysProvider';
import { metaCloudApiProvider } from './metaCloudApiProvider';
import { openwaProvider } from './openwaProvider';
import { createWorkerSupabaseClient } from '../supabase';

export * from './types';
export * from './baileysProvider';
export * from './metaCloudApiProvider';
export * from './openwaProvider';

export class WhatsAppProviderFactory {
  private static providers: Map<ProviderType, IWhatsAppProvider> = new Map();

  static {
    // Daftarkan provider bawaan
    WhatsAppProviderFactory.register(baileysProvider);
    WhatsAppProviderFactory.register(metaCloudApiProvider);
    WhatsAppProviderFactory.register(openwaProvider);
  }

  /**
   * Mendaftarkan provider baru
   */
  public static register(provider: IWhatsAppProvider): void {
    this.providers.set(provider.providerType, provider);
  }

  /**
   * Mengambil provider terdaftar berdasarkan tipe
   */
  public static getProviderByType(type: ProviderType): IWhatsAppProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      console.warn(`[ProviderFactory] Provider [${type}] tidak ditemukan, fallback ke Baileys.`);
      return baileysProvider;
    }
    return provider;
  }

  /**
   * Mengambil provider aktif untuk suatu organisasi.
   * KETENTUAN WAJIB: Default adalah 'baileys' untuk staging.
   * Beralih ke 'openwa' atau 'meta_cloud_api' HANYA jika tabel config organisasi secara eksplisit mengaktifkannya.
   */
  public static async getProviderForOrg(
    organizationId?: string,
    supabaseClient?: any
  ): Promise<IWhatsAppProvider> {
    if (!organizationId) {
      return baileysProvider;
    }

    const supabase = supabaseClient || createWorkerSupabaseClient();
    if (!supabase) {
      return baileysProvider;
    }

    try {
      const { data: config } = await supabase
        .from('organization_whatsapp_configs')
        .select('provider_type, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .maybeSingle();

      if (config && config.is_active) {
        if (config.provider_type === 'openwa') {
          return openwaProvider;
        }
        if (config.provider_type === 'meta_cloud_api') {
          return metaCloudApiProvider;
        }
      }
    } catch (err: any) {
      console.warn(`[ProviderFactory] Gagal membaca provider organisasi ${organizationId}:`, err?.message);
    }

    return baileysProvider;
  }

  /**
   * Mengambil status kesiapan pengiriman provider untuk suatu organisasi
   */
  public static async getProviderReadiness(
    organizationId?: string,
    supabaseClient?: any
  ): Promise<ProviderReadinessResult> {
    const provider = await this.getProviderForOrg(organizationId, supabaseClient);
    if (typeof provider.getReadiness === 'function') {
      return provider.getReadiness(organizationId || '');
    }
    // Fallback jika provider kustom/mock belum memiliki method getReadiness
    const status = await provider.getConnectionStatus(organizationId || '');
    return {
      isReady: Boolean(status.isConnected),
      code: status.isConnected ? 'ready' : 'waiting_gateway',
      label: status.isConnected ? 'Siap mengirim' : 'Menunggu koneksi gateway',
      message: status.isConnected ? 'Provider siap mengirim pesan.' : 'Gateway belum terhubung.',
      provider: provider.providerType,
      providerDisplayName: provider.providerType,
      phone: status.phone,
    };
  }
}

/**
 * Helper ringkas untuk mendapatkan provider organisasi
 */
export async function getProvider(
  organizationId?: string,
  supabaseClient?: any
): Promise<IWhatsAppProvider> {
  return WhatsAppProviderFactory.getProviderForOrg(organizationId, supabaseClient);
}

/**
 * Helper ringkas untuk mendapatkan status kesiapan provider organisasi
 */
export async function getProviderReadiness(
  organizationId?: string,
  supabaseClient?: any
): Promise<ProviderReadinessResult> {
  return WhatsAppProviderFactory.getProviderReadiness(organizationId, supabaseClient);
}
