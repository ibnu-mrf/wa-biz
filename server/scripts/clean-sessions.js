/**
 * =====================================================================
 * WABiz — Script Pembersih Kredensial Sesi Baileys (Security Routine)
 * =====================================================================
 * Menghapus seluruh berkas sesi (creds.json, pre-keys, app-state-sync)
 * yang tersimpan di direktori server/sessions/ atau direktori sesi WABiz
 * yang terverifikasi untuk mencegah kebocoran kredensial dan rekoneksi otomatis.
 *
 * PENGAMANAN (SAFETY GUARDRAILS):
 * - Memvalidasi bahwa path target secara ketat bernama 'sessions'.
 * - Memvalidasi bahwa file yang dihapus cocok dengan pola berkas sesi Baileys.
 * - Mencegah path traversal atau penghapusan file di luar direktori sesi.
 * =====================================================================
 */

const fs = require('fs');
const path = require('path');

const defaultSessionDir = path.resolve(__dirname, '../sessions');

// Pola berkas sesi sah Baileys WABiz
const VALID_SESSION_FILE_PATTERNS = [
  /^creds\.json$/i,
  /^pre-key-\d+\.json$/i,
  /^app-state-sync-key-.*\.json$/i,
  /^app-state-sync-version-.*\.json$/i,
  /^session-.*\.json$/i,
  /^processed_message_ids\.json$/i,
];

function isLegitimateSessionFile(fileName) {
  return VALID_SESSION_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

function cleanSessions(customDir) {
  const targetDir = customDir ? path.resolve(customDir) : defaultSessionDir;

  // Validasi Keamanan 1: Nama folder harus secara eksplisit 'sessions'
  if (path.basename(targetDir).toLowerCase() !== 'sessions') {
    throw new Error(`Security Exception: Target direktori "${targetDir}" bukan direktori sesi yang sah (wajib bernama 'sessions').`);
  }

  console.log(`[WABiz Security] Memeriksa folder sesi: ${targetDir}`);
  if (!fs.existsSync(targetDir)) {
    console.log('[WABiz Security] Folder sesi tidak ditemukan. Tidak ada file yang perlu dibersihkan.');
    return { cleaned: 0, targetDir };
  }

  const entries = fs.readdirSync(targetDir);
  console.log(`[WABiz Security] Ditemukan ${entries.length} entri di folder sesi.`);

  let deletedCount = 0;
  for (const entry of entries) {
    const fullPath = path.join(targetDir, entry);
    try {
      const stat = fs.statSync(fullPath);

      // Hanya hapus berkas jika cocok dengan pola sesi sah
      if (stat.isFile() && isLegitimateSessionFile(entry)) {
        fs.unlinkSync(fullPath);
        deletedCount++;
      } else if (stat.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        deletedCount++;
      } else {
        console.warn(`[WABiz Security] Mengabaikan file yang bukan pola sesi: ${entry}`);
      }
    } catch (err) {
      console.warn(`[WABiz Security] Gagal menghapus ${entry}: ${err.message}`);
    }
  }

  console.log(`[WABiz Security] Sukses memusnahkan ${deletedCount} berkas kredensial dari ${targetDir}.`);
  return { cleaned: deletedCount, targetDir };
}

if (require.main === module) {
  cleanSessions();
}

module.exports = { cleanSessions, isLegitimateSessionFile };

