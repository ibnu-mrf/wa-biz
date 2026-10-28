import dotenv from 'dotenv';
import path from 'path';

// Muat .env dari folder server jika ada
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export interface WorkerConfig {
  host: string;
  port: number;
  localApiKey: string;
  sessionDir: string;
  showTerminalQr: boolean;
  maxReconnectRetries: number;
  initialReconnectDelayMs: number;
  maxReconnectDelayMs: number;
  logLevel: string;
  allowedOrigins: string[];
  workerOrgId: string;
  autoStartWhatsApp: boolean;
  metaGraphApiVersion: string;
  metaAppId: string;
  metaAppSecret: string;
  metaWebhookVerifyToken: string;
  metaSystemUserToken: string;
  metaApiBaseUrl: string;
  openwaBaseUrl: string;
  openwaApiKey: string;
  openwaSessionId: string;
  openwaTestOrgId: string;
  openwaRequestTimeoutMs: number;
  openwaWebhookSecret: string;
}

export function loadConfig(): WorkerConfig {
  const host = process.env.HOST || '127.0.0.1';
  const port = parseInt(process.env.PORT || '4000', 10);
  const localApiKey = process.env.LOCAL_API_KEY?.trim() || '';
  const sessionDir = path.resolve(process.env.SESSION_DIR || path.join(__dirname, '../sessions'));
  const showTerminalQr = process.env.SHOW_TERMINAL_QR !== 'false';
  const maxReconnectRetries = parseInt(process.env.MAX_RECONNECT_RETRIES || '5', 10);
  const initialReconnectDelayMs = parseInt(process.env.INITIAL_RECONNECT_DELAY_MS || '2000', 10);
  const maxReconnectDelayMs = parseInt(process.env.MAX_RECONNECT_DELAY_MS || '30000', 10);
  const logLevel = process.env.LOG_LEVEL || 'info';
  const workerOrgId = process.env.WORKER_ORG_ID?.trim() || '';
  const autoStartWhatsApp = process.env.AUTO_START_WHATSAPP === 'true';
  const metaGraphApiVersion = process.env.META_GRAPH_API_VERSION?.trim() || 'v21.0';
  const metaAppId = process.env.META_APP_ID?.trim() || '';
  const metaAppSecret = process.env.META_APP_SECRET?.trim() || '';
  const metaWebhookVerifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || '';
  const metaSystemUserToken = process.env.META_SYSTEM_USER_TOKEN?.trim() || '';
  const metaApiBaseUrl = process.env.META_API_BASE_URL?.trim() || 'https://graph.facebook.com';
  const openwaBaseUrl = (process.env.OPENWA_BASE_URL || 'http://127.0.0.1:2785').replace(/\/+$/, '');
  const openwaApiKey = process.env.OPENWA_API_KEY?.trim() || '';
  const openwaSessionId = process.env.OPENWA_SESSION_ID?.trim() || '';
  const openwaTestOrgId = process.env.OPENWA_TEST_ORG_ID?.trim() || '';
  const openwaRequestTimeoutMs = parseInt(process.env.OPENWA_REQUEST_TIMEOUT_MS || '10000', 10);
  const openwaWebhookSecret = process.env.OPENWA_WEBHOOK_SECRET?.trim() || '';

  const defaultOrigins = [
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:8082',
    'http://127.0.0.1:8082',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
  ];
  const customOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const allowedOrigins = Array.from(new Set([...defaultOrigins, ...customOrigins]));

  return {
    host,
    port,
    localApiKey,
    sessionDir,
    showTerminalQr,
    maxReconnectRetries,
    initialReconnectDelayMs,
    maxReconnectDelayMs,
    logLevel,
    allowedOrigins,
    workerOrgId,
    autoStartWhatsApp,
    metaGraphApiVersion,
    metaAppId,
    metaAppSecret,
    metaWebhookVerifyToken,
    metaSystemUserToken,
    metaApiBaseUrl,
    openwaBaseUrl,
    openwaApiKey,
    openwaSessionId,
    openwaTestOrgId,
    openwaRequestTimeoutMs,
    openwaWebhookSecret,
  };
}

export const config = loadConfig();

/**
 * Memvalidasi konfigurasi keamanan wajib sebelum worker dapat melayani request.
 * Jika konfigurasi penting tidak ada, proses ditolak untuk berjalan demi mencegah celah keamanan.
 */
export function validateWorkerConfig(cfg: WorkerConfig): void {
  if (!cfg.localApiKey) {
    throw new Error(
      '[Config Security Error] LOCAL_API_KEY wajib dikonfigurasi secara eksplisit di environment backend (server/.env). Fallback kunci default dinonaktifkan demi keamanan.'
    );
  }
}
