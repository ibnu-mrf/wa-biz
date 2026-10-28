import { Request, Response, NextFunction } from 'express';
import { config } from './config';
import { createWorkerSupabaseClient, isWorkerSupabaseConfigured } from './supabase';

// ==========================================
// 1. PII REDACTION & LOG MASKING
// ==========================================
/**
 * Menyembunyikan (masking) digit tengah nomor telepon untuk mencegah
 * kebocoran data pribadi (PII) pada log aplikasi dan konsol.
 *
 * Contoh:
 * - '6285641886993' -> '62856****6993'
 * - '+62812345678'  -> '62812****5678'
 * - '081234567890'  -> '08123****7890'
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '-';
  const clean = String(phone).replace(/\D/g, '');
  if (clean.length <= 6) {
    return '****' + clean.slice(-2);
  }
  if (clean.length <= 9) {
    return clean.slice(0, 3) + '****' + clean.slice(-2);
  }
  return clean.slice(0, 5) + '****' + clean.slice(-4);
}

// ==========================================
// 2. IN-MEMORY SLIDING WINDOW RATE LIMITER
// ==========================================
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

/**
 * Membuat Express middleware pembuat rate limit berbasis IP
 * dengan pembersihan sampah otomatis (auto-garbage collection)
 * untuk mencegah memory leak.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Terlalu banyak permintaan (Rate limit exceeded). Harap tunggu beberapa saat.',
    keyGenerator = (req: Request) => {
      const forwarded = req.headers['x-forwarded-for'];
      const rawIp = typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : req.socket.remoteAddress || '127.0.0.1';
      return rawIp;
    },
  } = options;

  const hits = new Map<string, RateLimitEntry>();

  // Pembersihan memori berkala setiap 5 menit
  const gcInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now > entry.resetAt) {
        hits.delete(key);
      }
    }
  }, 300000);
  if (gcInterval.unref) gcInterval.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Lewatkan OPTIONS preflight
    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    const key = keyGenerator(req);
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      entry = {
        count: 1,
        resetAt: now + windowMs,
      };
      hits.set(key, entry);
    } else {
      entry.count += 1;
    }

    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (entry.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      res.status(429).json({
        success: false,
        error: message,
        retryAfterSeconds: resetSeconds,
      });
      return;
    }

    next();
  };
}

// Global API Limiter: 120 req/menit per IP
export const globalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Terlalu banyak permintaan ke API WABiz. Silakan coba kembali dalam 1 menit.',
});

// Sensitive Limiter (Kirim pesan, buat kampanye, reconnect): 25 req/menit per IP
export const sensitiveRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 25,
  message: 'Batas frekuensi operasi sensitif tercapai. Harap tunggu sebelum mencoba kembali.',
});

// ==========================================
// 3. MIDDLEWARE AUTENTIKASI & OTORISASI MULTI-TENANT
// ==========================================
export interface AuthOptions {
  requiredRole?: 'owner' | 'admin' | 'member';
  enforceWorkerOrg?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: 'owner' | 'admin' | 'member';
  organizationId: string;
}

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware keamanan utama WABiz:
 * 1. Mendukung otentikasi ganda:
 *    - Supabase User JWT (via header x-supabase-auth atau Authorization: Bearer <jwt>)
 *    - Worker Local API Key (x-api-key) untuk script staging/internal CLI
 * 2. Memvalidasi identitas user di Supabase Auth jika JWT disediakan.
 * 3. Memeriksa keanggotaan dan hak akses (role: owner/admin/member) di tabel public.organization_members.
 * 4. MENCEGAH TENANT SPOOFING: Memastikan organizationId yang diminta cocok dengan tenant
 *    worker staging (WORKER_ORG_ID). Menolak akses ke organisasi lain dengan 403 Forbidden.
 */
export function authenticateAndAuthorize(options: AuthOptions = {}) {
  const { requiredRole = 'member', enforceWorkerOrg = true } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Lewatkan OPTIONS preflight
    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    // Ekstrak token / API key
    const authHeader = req.headers['authorization'] || '';
    const supabaseAuthHeader = (req.headers['x-supabase-auth'] as string) || '';
    const apiKeyHeader = (req.headers['x-api-key'] as string) || '';

    // Ambil JWT jika ada
    let userJwt = supabaseAuthHeader;
    if (!userJwt && authHeader.toLowerCase().startsWith('bearer ')) {
      const candidate = authHeader.slice(7).trim();
      // Bedakan JWT (memiliki 3 bagian dot) dengan shared localApiKey
      if (candidate.split('.').length === 3) {
        userJwt = candidate;
      }
    }

    // Ambil shared API key jika cocok dan server memiliki konfigurasi kunci yang valid
    const isLocalApiKeyValid = Boolean(
      config.localApiKey &&
      ((apiKeyHeader && apiKeyHeader === config.localApiKey) ||
       (authHeader && authHeader.replace(/^Bearer\s+/i, '') === config.localApiKey))
    );

    // Ambil requested organizationId dari body, query, atau header
    const rawRequestedOrgId = (
      req.body?.organizationId ||
      req.query?.organizationId ||
      req.params?.organizationId ||
      req.headers['x-organization-id']
    ) as string | undefined;
    const requestedOrgId = rawRequestedOrgId?.trim() || undefined;

    const workerOrgId = config.workerOrgId?.trim() || '';

    // A. JIKA ADA USER JWT (Otentikasi Pengguna Nyata)
    if (userJwt) {
      const supabase = createWorkerSupabaseClient();
      if (!supabase) {
        res.status(503).json({
          success: false,
          error: 'Layanan Supabase backend belum terkonfigurasi pada worker.',
        });
        return;
      }

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser(userJwt);
        if (userError || !userData?.user) {
          res.status(401).json({
            success: false,
            error: 'Unauthorized: Sesi autentikasi Supabase tidak valid atau telah kedaluwarsa.',
          });
          return;
        }

        const user = userData.user;
        const targetOrgId = requestedOrgId || workerOrgId;

        // 1. ISOLASI TENANT WORKER (FAIL-CLOSED)
        if (enforceWorkerOrg) {
          if (!workerOrgId) {
            res.status(403).json({
              success: false,
              error: 'Forbidden: Worker staging belum dikonfigurasi dengan WORKER_ORG_ID yang valid.',
            });
            return;
          }

          if (!targetOrgId || targetOrgId !== workerOrgId) {
            console.warn(
              `[Security Alert] Tenant Spoofing dicegah: User ${user.id} meminta akses ke org ${targetOrgId || '(kosong)'}, tetapi worker ini terikat ke ${workerOrgId}.`
            );
            res.status(403).json({
              success: false,
              error: `Forbidden: Tenant mismatch. Worker ini terikat secara eksklusif ke organisasi ${workerOrgId}. Akses ke organisasi ${targetOrgId || '(kosong)'} ditolak demi keamanan isolasi data.`,
            });
            return;
          }
        } else if (!targetOrgId) {
          res.status(400).json({
            success: false,
            error: 'ID organisasi tidak ditemukan pada request dan WORKER_ORG_ID belum diset.',
          });
          return;
        }

        // 2. VERIFIKASI KEANGGOTAAN ORGANISASI
        const { data: memberRow, error: memberError } = await supabase
          .from('organization_members')
          .select('role')
          .eq('organization_id', targetOrgId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (memberError || !memberRow) {
          res.status(403).json({
            success: false,
            error: 'Forbidden: Anda bukan anggota dari organisasi ini.',
          });
          return;
        }

        // 3. VERIFIKASI HAK AKSES PERAN (ROLE-BASED ACCESS CONTROL)
        const role = memberRow.role as 'owner' | 'admin' | 'member';
        if (requiredRole === 'admin' && role !== 'owner' && role !== 'admin') {
          res.status(403).json({
            success: false,
            error: 'Forbidden: Hak akses tidak memadai. Diperlukan peran admin atau owner untuk operasi ini.',
          });
          return;
        }

        // Berhasil terautentikasi dan terotorisasi
        req.authenticatedUser = {
          id: user.id,
          email: user.email,
          role,
          organizationId: targetOrgId,
        };

        next();
        return;
      } catch (err: any) {
        console.error('[Security Exception] Gagal verifikasi JWT user:', err?.message || err);
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Gagal memverifikasi token pengguna.',
        });
        return;
      }
    }

    // B. JIKA MENGGUNAKAN LOCAL API KEY (AKSES INTERNAL / DIAGNOSTIK LEVEL MEMBER)
    if (isLocalApiKeyValid) {
      const targetOrgId = requestedOrgId || workerOrgId;

      // STRICT TENANT BOUNDARY: Hanya boleh mengakses workerOrgId (FAIL-CLOSED)
      if (enforceWorkerOrg) {
        if (!workerOrgId) {
          res.status(403).json({
            success: false,
            error: 'Forbidden: Worker staging belum dikonfigurasi dengan WORKER_ORG_ID yang valid.',
          });
          return;
        }

        if (!targetOrgId || targetOrgId !== workerOrgId) {
          console.warn(
            `[Security Alert] Percobaan akses cross-tenant dicegah! Target: ${targetOrgId || '(kosong)'}, Worker: ${workerOrgId}.`
          );
          res.status(403).json({
            success: false,
            error: `Forbidden: Tenant mismatch. Panggilan hanya diizinkan untuk worker staging tenant (${workerOrgId}). Permintaan ke organisasi lain ditolak.`,
          });
          return;
        }
      } else if (!targetOrgId) {
        res.status(400).json({
          success: false,
          error: 'ID organisasi tidak ditemukan pada request dan WORKER_ORG_ID belum diset.',
        });
        return;
      }

      // EVALUASI HAK AKSES PERAN:
      // LOCAL_API_KEY HANYA memiliki peran 'member'.
      // Tindakan administratif (requiredRole === 'admin') WAJIB memerlukan otentikasi JWT Admin/Owner atau master key server.
      if (requiredRole === 'admin') {
        res.status(403).json({
          success: false,
          error: 'Forbidden: Operasi administratif memerlukan otentikasi akun Admin atau Owner via JWT. Kunci API klien tidak mencukupi untuk hak akses administratif.',
        });
        return;
      }

      req.authenticatedUser = {
        id: 'client_local_worker',
        email: 'client-api@wabiz.local',
        role: 'member',
        organizationId: targetOrgId || workerOrgId,
      };

      next();
      return;
    }

    // C. TIDAK ADA KREDENSIAL YANG VALID
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Kredensial tidak ditemukan atau tidak valid. Sertakan token autentikasi Supabase atau x-api-key yang valid.',
    });
  };
}
