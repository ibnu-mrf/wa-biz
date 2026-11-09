import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getWorkerBaseUrl, isWorkerConfigured } from '../../src/lib/whatsappClient';

describe('Unit: WhatsApp Staging Client Utilities (src/lib/whatsappClient.ts)', () => {
  it('Resolusi URL Worker: Mengembalikan string bersih tanpa trailing slash', () => {
    const url = getWorkerBaseUrl();
    assert.equal(typeof url, 'string');
    assert.equal(url.endsWith('/'), false);
  });

  it('Deteksi Konfigurasi Worker: isWorkerConfigured mengembalikan boolean', () => {
    const configured = isWorkerConfigured();
    assert.equal(typeof configured, 'boolean');
  });

  it('Sanitasi Nomor Telepon: Format nomor ponsel Indonesia', () => {
    function sanitizeIndonesianPhone(phone: string): string {
      const clean = phone.replace(/[^0-9]/g, '');
      if (clean.startsWith('0')) {
        return '62' + clean.slice(1);
      }
      if (clean.startsWith('62')) {
        return clean;
      }
      return clean;
    }

    assert.equal(sanitizeIndonesianPhone('0812-3456-7890'), '6281234567890');
    assert.equal(sanitizeIndonesianPhone('+62 812 3456 7890'), '6281234567890');
    assert.equal(sanitizeIndonesianPhone('6281234567890'), '6281234567890');
  });
});
