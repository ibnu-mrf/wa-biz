import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeWhatsAppNumber,
  isValidWhatsAppNumber,
  formatMessagePayload,
  calculateCampaignMetrics,
  truncateMessageText,
} from '../src/lib/messageValidator.js';

describe('Unit Tests: WhatsApp Message & Campaign Logic (src/lib/messageValidator)', () => {
  describe('sanitizeWhatsAppNumber', () => {
    it('mengubah awalan 0 menjadi 62 dan menghapus karakter non-digit', () => {
      assert.equal(sanitizeWhatsAppNumber('0812-3456-7890'), '6281234567890');
      assert.equal(sanitizeWhatsAppNumber('+62 812 3456 7890'), '6281234567890');
      assert.equal(sanitizeWhatsAppNumber('81234567890'), '6281234567890');
    });

    it('mempertahankan nomor yang sudah memiliki awalan 62', () => {
      assert.equal(sanitizeWhatsAppNumber('6281234567890'), '6281234567890');
    });
  });

  describe('isValidWhatsAppNumber', () => {
    it('mengembalikan true untuk nomor WhatsApp Indonesia yang valid', () => {
      assert.equal(isValidWhatsAppNumber('081234567890'), true);
      assert.equal(isValidWhatsAppNumber('6281234567890'), true);
      assert.equal(isValidWhatsAppNumber('+6281987654321'), true);
    });

    it('mengembalikan false untuk nomor yang terlalu pendek, panjang, atau bukan 62', () => {
      assert.equal(isValidWhatsAppNumber('12345'), false);
      assert.equal(isValidWhatsAppNumber('01234567890123456789'), false);
      assert.equal(isValidWhatsAppNumber('abcde'), false);
    });
  });

  describe('formatMessagePayload', () => {
    it('menghasilkan payload terstruktur dengan suffix @s.whatsapp.net', () => {
      const payload = formatMessagePayload('081234567890', '  Halo ini pesan konfirmasi  ');
      assert.equal(payload.to, '6281234567890@s.whatsapp.net');
      assert.equal(payload.text, 'Halo ini pesan konfirmasi');
      assert.equal(typeof payload.timestamp, 'number');
    });

    it('melempar error jika nomor tidak valid', () => {
      assert.throws(() => {
        formatMessagePayload('12345', 'Halo');
      }, /Nomor WhatsApp penerima tidak valid/);
    });

    it('melempar error jika pesan kosong', () => {
      assert.throws(() => {
        formatMessagePayload('081234567890', '   ');
      }, /Isi pesan tidak boleh kosong/);
    });
  });

  describe('calculateCampaignMetrics', () => {
    it('menghitung persentase keberhasilan dan sisa pending secara akurat', () => {
      const metrics = calculateCampaignMetrics(100, 85, 5);
      assert.equal(metrics.total, 100);
      assert.equal(metrics.sent, 85);
      assert.equal(metrics.failed, 5);
      assert.equal(metrics.pending, 10);
      assert.equal(metrics.successRate, 85.0);
    });

    it('mengembalikan successRate 0 saat total penerima adalah 0', () => {
      const metrics = calculateCampaignMetrics(0, 0, 0);
      assert.equal(metrics.total, 0);
      assert.equal(metrics.successRate, 0);
      assert.equal(metrics.pending, 0);
    });
  });

  describe('truncateMessageText', () => {
    it('memotong teks panjang dan menyertakan elipsis', () => {
      const truncated = truncateMessageText('Pesan siaran massal untuk seluruh wali murid', 20);
      assert.equal(truncated, 'Pesan siaran massal ...');
    });

    it('mempertahankan teks utuh jika panjangnya di bawah batas', () => {
      const untouched = truncateMessageText('Pesan pendek', 50);
      assert.equal(untouched, 'Pesan pendek');
    });
  });
});

