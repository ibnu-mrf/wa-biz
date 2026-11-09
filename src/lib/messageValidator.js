/**
 * =====================================================================
 * WABiz Message & Campaign Business Logic Validator (Runtime JS)
 * =====================================================================
 */

export function sanitizeWhatsAppNumber(phone) {
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

export function isValidWhatsAppNumber(phone) {
  const sanitized = sanitizeWhatsAppNumber(phone);
  return sanitized.length >= 10 && sanitized.length <= 16 && sanitized.startsWith('62');
}

export function formatMessagePayload(recipient, text) {
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

export function calculateCampaignMetrics(totalRecipients, sentCount, failedCount) {
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

export function truncateMessageText(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + '...';
}
