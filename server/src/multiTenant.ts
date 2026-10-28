/**
 * =====================================================================
 * WABiz — Arsitektur & Manajemen Multi-Tenant Worker WhatsApp
 * =====================================================================
 * Modul ini mendefinisikan batas arsitektur, interface manajemen sesi,
 * dan adapter isolasi tenant antara mode staging saat ini dengan target produksi.
 *
 * HASIL AUDIT MULTI-TENANT:
 * 1. Status Saat Ini: SINGLE-TENANT STAGING WORKER
 *    - Worker Baileys saat ini terikat pada 1 organisasi (WORKER_ORG_ID).
 *    - Memory heap menyimpan 1 sesi Baileys socket dan 1 activeProfile.
 *    - Direktori sesi disimpan secara lokal di `server/sessions/`.
 *    - Scheduler kampanye memproses pesan antrean untuk WORKER_ORG_ID.
 *
 * 2. Risiko Jika Dijalankan Multi-Tenant Tanpa Pemisahan Bersih:
 *    - Cross-Tenant Messaging: Pesan siaran/balasan Org B terkirim melalui nomor WhatsApp Org A.
 *    - Memory Leaks: Menyimpan puluhan koneksi Baileys dalam 1 proses Node.js akan memicu OOM (Out Of Memory).
 *    - Session Flapping: Jika nomor WhatsApp Org A disconnect/logout, socket Org B bisa ikut terpengaruh.
 *
 * 3. STRATEGI IMPLEMENTASI FASE 4:
 *    - Mengisolasi staging mode dengan validasi boundary ketat (Strict Single-Tenant Isolation).
 *    - Setiap operasi pengiriman pesan, kampanye, atau handoff WAJIB memvalidasi organizationId.
 *    - Jika parameter organizationId berbeda dengan WORKER_ORG_ID, request DITOLAK SEKETIKA (403).
 *    - Menyediakan interface ITenantSessionManager dan blueprint migrasi ke Meta Cloud API.
 * =====================================================================
 */

import path from 'path';
import fs from 'fs';
import { config } from './config';
import { OrgProfile, getActiveProfile } from './ai';

export interface TenantSessionMetadata {
  organizationId: string;
  sessionDir: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  phoneNumber: string | null;
  whatsappName: string | null;
  activeProfile: OrgProfile;
}

export interface ITenantSessionManager {
  /**
   * Mengambil sesi WhatsApp untuk organisasi tertentu
   */
  getSession(organizationId: string): TenantSessionMetadata | null;

  /**
   * Memvalidasi apakah organisasi yang diminta diizinkan dieksekusi pada worker ini
   */
  validateTenantAccess(requestedOrgId: string): { allowed: boolean; reason?: string };

  /**
   * Mengembalikan daftar tenant yang saat ini dilayani oleh worker
   */
  listActiveTenants(): string[];

  /**
   * Menghasilkan path folder sesi Baileys yang terisolasi per tenant
   */
  getIsolatedSessionDir(organizationId: string): string;
}

/**
 * Adapter Single-Tenant Staging (Mode Aman Fase 4)
 * Menegakkan isolasi ketat pada worker staging tunggal.
 */
export class SingleTenantStagingManager implements ITenantSessionManager {
  private readonly boundOrgId: string;
  private readonly baseSessionDir: string;

  constructor() {
    this.boundOrgId = config.workerOrgId;
    this.baseSessionDir = config.sessionDir;
  }

  public getBoundOrgId(): string {
    return this.boundOrgId;
  }

  public validateTenantAccess(requestedOrgId: string): { allowed: boolean; reason?: string } {
    if (!this.boundOrgId) {
      return {
        allowed: false,
        reason: 'Worker staging belum memiliki konfigurasi WORKER_ORG_ID yang valid.',
      };
    }

    if (requestedOrgId !== this.boundOrgId) {
      return {
        allowed: false,
        reason: `Tenant mismatch: Worker staging ini terikat secara eksklusif ke organisasi ${this.boundOrgId}. Permintaan untuk organisasi ${requestedOrgId} ditolak.`,
      };
    }

    return { allowed: true };
  }

  public getSession(organizationId: string): TenantSessionMetadata | null {
    const check = this.validateTenantAccess(organizationId);
    if (!check.allowed) {
      return null;
    }

    return {
      organizationId: this.boundOrgId,
      sessionDir: this.getIsolatedSessionDir(this.boundOrgId),
      status: 'connected', // status sebenarnya disinkronkan dari whatsappService
      phoneNumber: null,
      whatsappName: null,
      activeProfile: getActiveProfile(),
    };
  }

  public listActiveTenants(): string[] {
    return this.boundOrgId ? [this.boundOrgId] : [];
  }

  public getIsolatedSessionDir(organizationId: string): string {
    // Pada multi-tenant masa depan: sessions/<orgId>
    // Pada staging saat ini: kompatibel dengan folder sessions yang sudah di-pairing
    if (organizationId === this.boundOrgId) {
      return this.baseSessionDir;
    }
    const tenantDir = path.join(this.baseSessionDir, 'tenants', organizationId);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }
    return tenantDir;
  }
}

export const tenantManager = new SingleTenantStagingManager();

/**
 * =====================================================================
 * BLUEPRINT PRODUKSI MULTI-TENANT (DOKUMENTASI KESIAPAN PRODUKSI)
 * =====================================================================
 * Untuk beralih ke skala Multi-Tenant Production komersial:
 *
 * PENDEKATAN A (Rekomendasi Utama: WhatsApp Cloud API Resmi Meta)
 * - Skalabilitas: Menggunakan Meta Cloud API resmi berbasis HTTP Webhooks.
 * - Multi-Tenant Asli: Setiap organisasi mendaftarkan Phone Number ID dan WABA (WhatsApp Business Account)
 *   tersendiri di dashboard Supabase / Meta Developer.
 * - Tanpa Socket Persistent: Tidak memerlukan socket Baileys yang boros memori dan rentan putus.
 * - Kepatuhan TOS: 100% legal dan bebas risiko blokir nomor karena nomor didaftarkan resmi di Meta.
 * - Webhook Router: 1 Supabase Edge Function dapat memvalidasi signature webhook Meta dan memetakan
 *   pesan masuk ke tenant yang tepat berdasarkan `entry.changes[0].value.metadata.phone_number_id`.
 *
 * PENDEKATAN B (Arsitektur Baileys Multi-Worker Containerized)
 * - Jika tetap menggunakan Baileys untuk menekan biaya lisensi Meta:
 * - JANGAN satukan ratusan sesi Baileys dalam 1 proses Node.js.
 * - Gunakan Container Orchestration (Kubernetes / Docker Swarm / AWS ECS):
 *   Setiap organisasi memiliki worker pod terpisah dengan volume persistent mount terisolasi
 *   `/var/sessions/<orgId>`.
 * - API Gateway (Nginx / Envoy / Supabase Edge Functions) mengarahkan request
 *   ke worker pod yang sesuai berdasarkan `organization_id` pada JWT pengguna.
 * =====================================================================
 */
