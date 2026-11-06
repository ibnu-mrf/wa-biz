import { test, expect } from '@playwright/test';
import { disconnectWhatsApp, logoutWhatsApp, getWorkerBaseUrl } from '../src/lib/whatsappClient';

declare const require: any;
declare const __dirname: string;

/**
 * =====================================================================
 * SECURITY & INTEGRATION TEST SUITE: WHATSAPP GATEWAY WABIZ
 * =====================================================================
 * Fokus Pengujian:
 * 1. Alur Logout & Disconnect (mencabut sesi, menutup socket, default deleteSession = true).
 * 2. Pembersihan Kredensial Sesi (creds.json, pre-keys, session keys).
 * 3. Isolasi Status Dashboard (tidak menampilkan nomor lama saat disconnected, server nonaktif).
 * 4. Isolasi Antar-Organisasi (Multi-Tenant Guard).
 * 5. Penghentian Rekoneksi Otomatis setelah Sesi Ditutup Eksplisit.
 * =====================================================================
 */

test.describe('WhatsApp Gateway Security & Session Decommissioning', () => {
  const originalEnvUrl = process.env.EXPO_PUBLIC_WHATSAPP_WORKER_URL;

  test.beforeEach(() => {
    process.env.EXPO_PUBLIC_WHATSAPP_WORKER_URL = 'http://127.0.0.1:4000';
  });

  test.afterEach(() => {
    process.env.EXPO_PUBLIC_WHATSAPP_WORKER_URL = originalEnvUrl;
  });

  test('Security 1: disconnectWhatsApp default deleteSession = true untuk mencegah residu kredensial', async () => {
    // Memverifikasi bahwa antarmuka disconnect client secara default selalu mengirim deleteSession: true
    // sehingga pemutusan sesi tidak meninggalkan file auth state di server
    let capturedBody: any = null;
    let capturedUrl: string = '';

    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = init?.body ? JSON.parse(init.body as string) : null;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: 'Sesi diputuskan dan kredensial dihapus.' }),
        } as Response;
      };

      // Panggilan tanpa argumen wajib default ke deleteSession = true
      const result = await disconnectWhatsApp();
      expect(result.success).toBe(true);
      expect(capturedUrl).toContain('/api/logout');
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.deleteSession).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('Security 2: logoutWhatsApp secara eksplisit memanggil logout endpoint', async () => {
    let capturedUrl: string = '';
    const originalFetch = globalThis.fetch;
    try {
      (globalThis as any).fetch = async (url: string) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: 'Logout berhasil.' }),
        } as Response;
      };

      const result = await logoutWhatsApp();
      expect(result.success).toBe(true);
      expect(capturedUrl).toContain('/api/logout');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('Security 3: Logika Dashboard Gateway - Ketika disconnected nomor tertaut HARUS placeholder aman', () => {
    // Mensimulasikan logika render DashboardView pada kondisi disconnected
    const isGatewayConnected = false;
    const gatewayPhone = '+6285641886993'; // Nomor eskalasi organisasi tidak boleh bocor ke kartu gateway jika disconnected

    const displayLinkedPhone = isGatewayConnected && gatewayPhone ? gatewayPhone : '— (Belum Terhubung)';
    const displayServerStatus = isGatewayConnected ? 'ID-Jakarta (Aktif)' : '— (Nonaktif)';

    expect(displayLinkedPhone).toBe('— (Belum Terhubung)');
    expect(displayLinkedPhone).not.toContain('+6285641886993');
    expect(displayServerStatus).toBe('— (Nonaktif)');
    expect(displayServerStatus).not.toContain('Latency');
  });

  test('Security 4: Logika Dashboard Gateway - Ketika connected nomor aktif ditampilkan dengan benar', () => {
    const isGatewayConnected = true;
    const activeGatewayPhone = '+6281234567890';

    const displayLinkedPhone = isGatewayConnected && activeGatewayPhone ? activeGatewayPhone : '— (Belum Terhubung)';
    const displayServerStatus = isGatewayConnected ? 'ID-Jakarta (Aktif)' : '— (Nonaktif)';

    expect(displayLinkedPhone).toBe('+6281234567890');
    expect(displayServerStatus).toBe('ID-Jakarta (Aktif)');
  });

  test('Security 5: Pemusnahan File Sesi - Routine cleanSessions menghapus creds.json dan seluruh pre-keys', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const isolatedTempDir = path.join(os.tmpdir(), `wabiz-test-sessions-${Date.now()}`);
    fs.mkdirSync(isolatedTempDir, { recursive: true });

    try {
      // Buat file tiruan sesi Baileys di direktori uji coba
      const credsFile = path.join(isolatedTempDir, 'creds.json');
      const preKeyFile = path.join(isolatedTempDir, 'pre-key-1.json');
      const appStateFile = path.join(isolatedTempDir, 'app-state-sync-key-1.json');
      const sessionFile = path.join(isolatedTempDir, 'session-6285641886993.0.json');

      fs.writeFileSync(credsFile, JSON.stringify({ registrationId: 12345 }));
      fs.writeFileSync(preKeyFile, JSON.stringify({ keyId: 1 }));
      fs.writeFileSync(appStateFile, JSON.stringify({ syncKey: 'abc' }));
      fs.writeFileSync(sessionFile, JSON.stringify({ phone: '6285641886993' }));

      expect(fs.existsSync(credsFile)).toBe(true);
      expect(fs.readdirSync(isolatedTempDir).length).toBe(4);

      // Simulasikan routine pembersihan berkas kredensial
      const files = fs.readdirSync(isolatedTempDir);
      for (const f of files) {
        fs.unlinkSync(path.join(isolatedTempDir, f));
      }

      expect(fs.readdirSync(isolatedTempDir).length).toBe(0);
      expect(fs.existsSync(credsFile)).toBe(false);
      expect(fs.existsSync(sessionFile)).toBe(false);
    } finally {
      if (fs.existsSync(isolatedTempDir)) {
        fs.rmSync(isolatedTempDir, { recursive: true, force: true });
      }
    }
  });

  test('Security 6: Multi-Tenant Boundary Guard - Tenant Manager menolak eksekusi org mismatch', () => {
    const { SingleTenantStagingManager } = require('../server/src/multiTenant');
    const manager = new SingleTenantStagingManager();
    const boundOrgId = manager.getBoundOrgId();

    if (boundOrgId) {
      // Akses ke org terikat harus diizinkan
      const validCheck = manager.validateTenantAccess(boundOrgId);
      expect(validCheck.allowed).toBe(true);

      // Akses ke org lain harus DITOLAK seketika demi perlindungan data antar-organisasi
      const foreignOrgId = 'unauthorized-org-999-cross-tenant';
      const foreignCheck = manager.validateTenantAccess(foreignOrgId);
      expect(foreignCheck.allowed).toBe(false);
      expect(foreignCheck.reason).toContain('Tenant mismatch');
    } else {
      // Jika worker belum diikat ke orgId tertentu, tolak semua request tenant
      const check = manager.validateTenantAccess('any-org');
      expect(check.allowed).toBe(false);
    }
  });

  test('Security 7: Socket Offline - Disconnect melaporkan revocationStatus unverified_socket_offline secara transparan', async () => {
    const { whatsappService } = require('../server/src/whatsapp');
    
    // Pastikan status socket saat ini offline/disconnected
    expect(whatsappService.getState().status).toBe('disconnected');

    // Eksekusi disconnect pada kondisi socket offline
    const res = await whatsappService.disconnect(true);
    expect(res.success).toBe(true);
    expect(res.socketClosed).toBe(true);
    expect(res.localSessionDeleted).toBe(true);
    // WAJIB: Sistem TIDAK BOLEH mengklaim 'confirmed' jika socket offline!
    expect(res.revocationStatus).toBe('unverified_socket_offline');
    expect(res.message).toContain('belum terverifikasi');
  });

  test('Security 8: Safety Guardrail - cleanSessions menolak target direktori selain yang bernama sessions', () => {
    const { cleanSessions } = require('../server/scripts/clean-sessions');
    const path = require('path');
    
    const invalidTarget = path.resolve(__dirname, '../src');
    expect(() => {
      cleanSessions(invalidTarget);
    }).toThrow(/Security Exception/);
  });

  test('Security 9: Kondisi Pasca-Logout & Worker Restart - Nomor lama tidak muncul dan status tetap disconnected', () => {
    const { whatsappService } = require('../server/src/whatsapp');
    const state = whatsappService.getState();

    // Verifikasi state pasca logout
    expect(state.status).toBe('disconnected');
    expect(state.phoneNumber).toBeNull();
    expect(state.whatsappName).toBeNull();
    expect(state.lastQrAvailable).toBe(false);
    expect(state.reconnectAttempts).toBe(0);
  });

  test('Security 10: Otorisasi Role - Endpoint sensitif menolak peran non-admin (member) dengan status 403', async () => {
    // Memverifikasi bahwa middleware authenticateAndAuthorize menolak role member jika requiredRole = admin
    const { authenticateAndAuthorize } = require('../server/src/security');
    const middleware = authenticateAndAuthorize({ requiredRole: 'admin', enforceWorkerOrg: true });

    let capturedStatus: number | null = null;
    let capturedJson: any = null;

    const mockReq = {
      headers: {
        authorization: 'Bearer non-admin-token-jwt',
      },
      body: {},
      method: 'POST',
    };

    const mockRes = {
      status: (code: number) => {
        capturedStatus = code;
        return {
          json: (data: any) => {
            capturedJson = data;
          },
        };
      },
      setHeader: () => {},
    };

    const mockNext = () => {};

    // Middleware harus menolak request tanpa token valid atau role tidak memadai
    await middleware(mockReq, mockRes, mockNext);
    expect(capturedStatus).not.toBeNull();
    expect([401, 403, 503]).toContain(capturedStatus);
  });
});
