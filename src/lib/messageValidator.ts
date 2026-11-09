/**
 * =====================================================================
 * WABiz Message & Campaign Business Logic Validator
 * =====================================================================
 * Modul murni (pure functions) untuk validasi data nomor, payload pesan,
 * sanitasi teks, dan kalkulasi performa kampanye broadcast.
 */

export interface ValidatedMessagePayload {
  to: string;
  text: string;
  timestamp: number;
}

export interface CampaignMetrics {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  successRate: number;
}

export function sanitizeWhatsAppNumber(phone: string): string {
  let cleaned = '';
  for (let i = 0; i < phone.length; i += 1) {
    const char = phone[i];
    if (char >= '0' && char <= '9') {
      cleaned += char;
    }
  }

  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  }

  return cleaned;
}

export function isValidWhatsAppNumber(phone: string): boolean {
  const sanitized = sanitizeWhatsAppNumber(phone);
  return sanitized.length >= 10 && sanitized.length <= 16 && sanitized.startsWith('62');
}

export function formatMessagePayload(recipient: string, text: string): ValidatedMessagePayload {
  const sanitizedPhone = sanitizeWhatsAppNumber(recipient);
  if (!isValidWhatsAppNumber(sanitizedPhone)) {
    throw new Error('Nomor WhatsApp penerima tidak valid');
  }

  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    throw new Error('Isi pesan tidak boleh kosong');
  }

  return {
    to: sanitizedPhone + '@s.whatsapp.net',
    text: trimmedText,
    timestamp: Date.now(),
  };
}

export function calculateCampaignMetrics(
  totalRecipients: number,
  sentCount: number,
  failedCount: number
): CampaignMetrics {
  const safeTotal = Math.max(0, totalRecipients);
  const safeSent = Math.max(0, sentCount);
  const safeFailed = Math.max(0, failedCount);
  const pending = Math.max(0, safeTotal - (safeSent + safeFailed));

  const rate = safeTotal > 0
    ? Number.parseFloat(((safeSent / safeTotal) * 100).toFixed(2))
    : 0;

  return {
    total: safeTotal,
    sent: safeSent,
    failed: safeFailed,
    pending,
    successRate: rate,
  };
}

export function truncateMessageText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '...';
}
