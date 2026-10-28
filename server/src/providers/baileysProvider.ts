// ==========================================
// Baileys Provider Adapter for WABiz Staging
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
import { whatsappService } from '../whatsapp';

export class BaileysProvider implements IWhatsAppProvider {
  public readonly providerType: ProviderType = 'baileys';

  /**
   * Mengirim pesan teks reguler melalui Baileys socket
   */
  public async sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
    const { recipientPhone, text } = options;

    try {
      const result = await whatsappService.sendMessage(recipientPhone, text);
      const timestamp = new Date().toISOString();

      if (result.success) {
        return {
          success: true,
          provider: 'baileys',
          providerMessageId: result.messageId,
          timestamp,
        };
      }

      return {
        success: false,
        provider: 'baileys',
        error: result.error || 'Gagal mengirim pesan melalui Baileys.',
        timestamp,
      };
    } catch (err: any) {
      return {
        success: false,
        provider: 'baileys',
        error: err?.message || 'Exception saat mengirim pesan melalui Baileys.',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Mengirim pesan template melalui Baileys
   * (Baileys tidak memiliki template resmi Meta, sehingga dirender sebagai pesan teks terformat)
   */
  public async sendTemplateMessage(options: SendTemplateOptions): Promise<SendMessageResult> {
    const { recipientPhone, templateName, components } = options;

    // Ekstraksi parameter teks dari components jika ada
    let formattedText = `[Template: ${templateName}]\n`;
    if (components && components.length > 0) {
      for (const comp of components) {
        if (comp.parameters) {
          const paramTexts = comp.parameters
            .filter((p) => p.text)
            .map((p) => p.text)
            .join(' ');
          if (paramTexts) {
            formattedText += `${paramTexts}\n`;
          }
        }
      }
    }

    return this.sendMessage({
      organizationId: options.organizationId,
      recipientPhone,
      text: formattedText.trim(),
    });
  }

  /**
   * Mengambil status koneksi soket Baileys
   */
  public async getConnectionStatus(_organizationId: string): Promise<ProviderConnectionStatus> {
    const state = whatsappService.getState();
    const isConnected = state.status === 'connected';

    return {
      provider: 'baileys',
      isConnected,
      phone: state.phoneNumber || undefined,
      qualityRating: isConnected ? 'GREEN' : 'UNKNOWN',
      messagingTier: 'UNLIMITED_STAGING',
      details: {
        status: state.status,
        whatsappName: state.whatsappName,
        reconnectAttempts: state.reconnectAttempts,
        lastError: state.lastError,
      },
    };
  }

  /**
   * Mengambil status kesiapan Baileys untuk pengiriman kampanye
   */
  public async getReadiness(_organizationId: string): Promise<ProviderReadinessResult> {
    const state = whatsappService.getState();
    const phone = state.phoneNumber || undefined;

    if (state.status === 'connected') {
      return {
        isReady: true,
        code: 'ready',
        label: 'Siap mengirim',
        message: 'Gateway WhatsApp (Baileys) terhubung dan siap memproses pengiriman.',
        provider: 'baileys',
        providerDisplayName: 'WhatsApp Gateway (Baileys)',
        phone,
        details: {
          status: state.status,
          whatsappName: state.whatsappName,
        },
      };
    }

    if (state.status === 'error') {
      return {
        isReady: false,
        code: 'connection_error',
        label: 'Terjadi kesalahan koneksi',
        message: state.lastError || 'Terjadi kesalahan pada soket koneksi Baileys.',
        provider: 'baileys',
        providerDisplayName: 'WhatsApp Gateway (Baileys)',
        phone,
        details: {
          status: state.status,
          lastError: state.lastError,
        },
      };
    }

    // Status: disconnected, initiating, qr_ready, qr_expired, connecting, logged_out
    return {
      isReady: false,
      code: 'waiting_gateway',
      label: 'Menunggu koneksi gateway',
      message: 'Gateway WhatsApp (Baileys) belum terhubung. Perlu scan QR atau inisialisasi koneksi dari menu Pengaturan.',
      provider: 'baileys',
      providerDisplayName: 'WhatsApp Gateway (Baileys)',
      phone,
      details: {
        status: state.status,
        lastQrAvailable: state.lastQrAvailable,
        reconnectAttempts: state.reconnectAttempts,
      },
    };
  }

  /**
   * Normalisasi kode ack Baileys ke standar WABiz
   */
  public normalizeDeliveryStatus(rawStatus: string): DeliveryStatus {
    const status = String(rawStatus).toLowerCase().trim();
    switch (status) {
      case '1':
      case 'server_ack':
      case 'sent':
        return 'sent';
      case '2':
      case 'delivery_ack':
      case 'delivered':
        return 'delivered';
      case '3':
      case '4':
      case 'read':
      case 'played':
        return 'read';
      case 'failed':
      case 'error':
        return 'failed';
      case 'pending':
      case 'queued':
      default:
        return 'queued';
    }
  }
}

export const baileysProvider = new BaileysProvider();
