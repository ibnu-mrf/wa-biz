import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidWhatsAppNumber,
  formatMessagePayload,
  calculateCampaignMetrics,
  truncateMessageText,
} from '../src/lib/messageValidator.js';

describe('Integration Tests: Campaign Dispatch Pipeline & Message Gateway Flow', () => {
  it('Alur Sempurna: Validasi antrean broadcast, transformasi payload, dan kalkulasi metrik akhir', () => {
    const rawRecipients = [
      { name: 'Ahmad Dahlan', phone: '0812-3456-7890' },
      { name: 'Siti Walidah', phone: '+62 813 9876 5432' },
      { name: 'Nomor Rusak', phone: '12345' }, // Invalid
    ];

    const templateText = 'Halo {name}, ini adalah pengumuman resmi dari lembaga.';

    const dispatchResults = {
      sent: [],
      failed: [],
    };

    for (const recipient of rawRecipients) {
      if (!isValidWhatsAppNumber(recipient.phone)) {
        dispatchResults.failed.push({
          recipient,
          error: 'Nomor tidak valid',
        });
        continue;
      }

      const personalizedText = templateText.replace('{name}', recipient.name);
      const payload = formatMessagePayload(recipient.phone, personalizedText);

      dispatchResults.sent.push({
        ...payload,
        name: recipient.name,
        preview: truncateMessageText(payload.text, 25),
      });
    }

    assert.equal(dispatchResults.sent.length, 2);
    assert.equal(dispatchResults.failed.length, 1);
    assert.equal(dispatchResults.sent[0].to, '6281234567890@s.whatsapp.net');
    assert.equal(dispatchResults.sent[1].to, '6281398765432@s.whatsapp.net');

    // Kalkulasi metrik keseluruhan kampanye
    const metrics = calculateCampaignMetrics(
      rawRecipients.length,
      dispatchResults.sent.length,
      dispatchResults.failed.length
    );

    assert.equal(metrics.total, 3);
    assert.equal(metrics.sent, 2);
    assert.equal(metrics.failed, 1);
    assert.equal(metrics.pending, 0);
    assert.equal(metrics.successRate, 66.67);
  });

  it('Isolasi Kesalahan: Pesan dengan template kosong ditolak secara aman tanpa menghentikan batch', () => {
    const batch = [
      { phone: '081234567891', text: 'Pesan valid' },
      { phone: '081234567892', text: '   ' }, // Kosong
      { phone: '081234567893', text: 'Pesan valid 2' },
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const item of batch) {
      try {
        formatMessagePayload(item.phone, item.text);
        successCount += 1;
      } catch {
        errorCount += 1;
      }
    }

    assert.equal(successCount, 2);
    assert.equal(errorCount, 1);
  });
});
