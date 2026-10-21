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
}

export function loadConfig(): WorkerConfig {
  const host = process.env.HOST || '127.0.0.1';
  const port = parseInt(process.env.PORT || '4000', 10);
  const localApiKey = process.env.LOCAL_API_KEY || 'wabiz_staging_local_key_dev';
  const sessionDir = path.resolve(process.env.SESSION_DIR || path.join(__dirname, '../sessions'));
  const showTerminalQr = process.env.SHOW_TERMINAL_QR !== 'false';
  const maxReconnectRetries = parseInt(process.env.MAX_RECONNECT_RETRIES || '5', 10);
  const initialReconnectDelayMs = parseInt(process.env.INITIAL_RECONNECT_DELAY_MS || '2000', 10);
  const maxReconnectDelayMs = parseInt(process.env.MAX_RECONNECT_DELAY_MS || '30000', 10);
  const logLevel = process.env.LOG_LEVEL || 'info';

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
  };
}

export const config = loadConfig();
