// ==========================================
// WABiz WhatsApp Provider Interface & Types
// ==========================================

export type ProviderType = 'baileys' | 'meta_cloud_api' | 'openwa';

export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface SendMessageOptions {
  organizationId: string;
  recipientPhone: string;
  text: string;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
}

export interface TemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  [key: string]: unknown;
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: string;
  index?: number | string;
  parameters: TemplateParameter[];
}

export interface SendTemplateOptions {
  organizationId: string;
  recipientPhone: string;
  templateName: string;
  languageCode: string;
  components?: TemplateComponent[];
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  success: boolean;
  provider: ProviderType;
  providerMessageId?: string;
  timestamp: string;
  error?: string;
  errorCode?: string | number;
}

export interface ProviderConnectionStatus {
  provider: ProviderType;
  isConnected: boolean;
  phone?: string;
  qualityRating?: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  messagingTier?: string;
  details?: Record<string, unknown>;
}

export type GatewayReadinessCode =
  | 'ready'
  | 'waiting_gateway'
  | 'unconfigured'
  | 'unsupported'
  | 'connection_error';

export interface ProviderReadinessResult {
  isReady: boolean;
  code: GatewayReadinessCode;
  label: string;
  message: string;
  provider: ProviderType;
  providerDisplayName: string;
  phone?: string;
  details?: Record<string, unknown>;
}

export interface IncomingMessageEvent {
  provider: ProviderType;
  providerMessageId: string;
  organizationId: string;
  senderPhone: string;
  senderName?: string;
  messageType: 'text' | 'image' | 'interactive' | 'button' | 'unknown';
  body: string;
  timestamp: string;
  rawPayload: unknown;
}

export interface DeliveryStatusEvent {
  provider: ProviderType;
  providerMessageId: string;
  organizationId: string;
  recipientPhone: string;
  status: DeliveryStatus;
  timestamp: string;
  errorCode?: string | number;
  errorMessage?: string;
  rawPayload: unknown;
}

export interface IWhatsAppProvider {
  readonly providerType: ProviderType;

  /**
   * Mengirim pesan teks reguler
   */
  sendMessage(options: SendMessageOptions): Promise<SendMessageResult>;

  /**
   * Mengirim pesan berbasis template Meta resmi
   */
  sendTemplateMessage(options: SendTemplateOptions): Promise<SendMessageResult>;

  /**
   * Mendapatkan status konektivitas nomor dan provider
   */
  getConnectionStatus(organizationId: string): Promise<ProviderConnectionStatus>;

  /**
   * Mendapatkan status kesiapan provider untuk pengiriman pesan / kampanye
   */
  getReadiness(organizationId: string): Promise<ProviderReadinessResult>;

  /**
   * Menormalisasi status pengiriman provider ke format standar WABiz
   */
  normalizeDeliveryStatus(rawStatus: string): DeliveryStatus;
}
