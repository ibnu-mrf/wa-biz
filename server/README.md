# WABiz WhatsApp Staging Worker (Baileys)

Worker staging mandiri berbasis Node.js, TypeScript, dan library [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) untuk memvalidasi integrasi WhatsApp melalui koneksi QR pairing pada proyek WABiz.

> **PENTING**:
> - Worker ini berjalan secara lokal dan terisolasi dari database produksi maupun aplikasi utama Expo.
> - **JANGAN** menggunakan nomor WhatsApp utama lembaga, nomor pribadi penting, atau nomor pelanggan produksi. Gunakan nomor khusus uji coba (staging/burner number).

---

## 1. Arsitektur & Prinsip Keamanan

- **Loopback Only (`127.0.0.1`)**: Server HTTP hanya mengikat ke antarmuka lokal untuk mencegah akses dari jaringan luar/publik.
- **Autentikasi API Key Lokal**: Setiap endpoint mutasi dan inspeksi (`/api/status`, `/api/qr`, `/api/send`, `/api/disconnect`) mewajibkan header `x-api-key` atau `Authorization: Bearer <LOCAL_API_KEY>`.
- **Zero Credential Logging**: Log server tidak pernah mencetak payload kredensial sesi, noise key, token autentikasi, maupun private key ke stdout/file.
- **Pemisahan Sesi**: Kredensial sesi disimpan di direktori `server/sessions/` yang telah dimasukkan ke `.gitignore` sehingga tidak akan terunggah ke repositori Git.

---

## 2. Persyaratan & Instalasi

Pastikan telah menginstal Node.js v20+ atau v22+.

Masuk ke direktori `server`:
```bash
cd server
npm install
```

Salin file konfigurasi environment:
```bash
cp .env.example .env
```
*(Di Windows PowerShell/CMD, gunakan `copy .env.example .env`)*

Sesuaikan nilai di file `.env`:
```env
HOST=127.0.0.1
PORT=4000
LOCAL_API_KEY=ganti_dengan_token_rahasia_lokal_minimal_16_karakter
SESSION_DIR=./sessions
SHOW_TERMINAL_QR=true
MAX_RECONNECT_RETRIES=5
INITIAL_RECONNECT_DELAY_MS=2000
MAX_RECONNECT_DELAY_MS=30000
LOG_LEVEL=info
```

---

## 3. Menjalankan Worker

### Mode Kompilasi & Jalankan (Build & Start)
```bash
npm run build
npm start
```

### Mode Development (Hot Reload)
```bash
npm run dev
```

Saat worker berjalan, socket Baileys akan otomatis memulai inisialisasi koneksi ke server WhatsApp.

---

## 4. Panduan Pairing QR

Untuk menautkan nomor WhatsApp uji coba ke worker:

1. **Buka Aplikasi WhatsApp di Ponsel Uji Coba**:
   - Ketuk menu titik tiga (Android) atau Pengaturan (iOS).
   - Pilih **Perangkat Tertaut** (*Linked Devices*).
   - Ketuk tombol **Tautkan Perangkat** (*Link a Device*).
2. **Scan QR Code**:
   - **Opsi A (Antarmuka Aplikasi WABiz)**: Buka aplikasi WABiz, masuk ke menu **Pengaturan > Gateway WhatsApp**. QR Code pairing terproteksi akan ditampilkan secara visual melalui endpoint `GET /api/qr` yang mewajibkan autentikasi admin.
   - **Opsi B (Terminal Console)**: Jika `SHOW_TERMINAL_QR=true`, QR Code berukuran kecil akan langsung muncul di jendela terminal worker Anda.
   - **Opsi C (API Terautentikasi)**: Gunakan `curl -X GET http://127.0.0.1:4000/api/qr -H "Authorization: Bearer <JWT_ADMIN>"` untuk mengambil payload data URL QR secara terproteksi.
3. Setelah dipindai, status di terminal akan berubah menjadi:
   `[WhatsApp] TERHUBUNG SUKSES! Nomor akun: +628xxxxxxxxxx`

---

## 5. Pengujian Pesan Masuk & Keluar

### A. Pengujian Pesan Masuk (Inbound)
1. Kirim pesan teks dari nomor WhatsApp lain ke nomor uji coba yang terhubung.
2. Pantau jendela terminal worker. Anda akan melihat log pesan masuk:
   ```text
   --- [PESAN MASUK TERDETEKSI] ---
   Dari: +6281234567890 (Nama Pengirim)
   Message ID: 3EB0XXXXX
   Isi Pesan: "Halo admin WABiz, saya mau tanya pendaftaran santri baru."
   Timestamp: 2026-10-20T...
   --------------------------------
   ```

### B. Pengujian Pesan Keluar (Outbound)
Gunakan perintah `curl` atau aplikasi REST Client (Postman / Bruno / Thunder Client) ke endpoint lokal:

```bash
curl -X POST http://127.0.0.1:4000/api/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: <LOCAL_API_KEY>" \
  -d '{
    "to": "6281234567890",
    "message": "Halo! Ini adalah pesan uji coba dari WABiz WhatsApp Staging Worker."
  }'
```

Jika berhasil, respons akan mengembalikan:
```json
{
  "success": true,
  "data": {
    "to": "6281234567890",
    "messageId": "3EB0XXXX",
    "sentAt": "2026-10-20T..."
  }
}
```

---

## 6. Manajemen Sesi & Pemutusan Koneksi (Disconnect)

### Memutuskan Sesi via API
Untuk memutuskan koneksi tanpa menghapus sesi (bisa reconnect nanti):
```bash
curl -X POST http://127.0.0.1:4000/api/disconnect \
  -H "Content-Type: application/json" \
  -H "x-api-key: <LOCAL_API_KEY>" \
  -d '{"deleteSession": false}'
```

Untuk memutuskan koneksi **sekaligus menghapus seluruh kredensial sesi lokal**:
```bash
curl -X POST http://127.0.0.1:4000/api/disconnect \
  -H "Content-Type: application/json" \
  -H "x-api-key: <LOCAL_API_KEY>" \
  -d '{"deleteSession": true}'
```

### Menghapus Sesi Secara Manual
Jika ingin mereset sesi dari awal secara manual:
1. Matikan worker (`Ctrl + C`).
2. Hapus seluruh isi folder `server/sessions/`.
3. Buka WhatsApp di ponsel > **Perangkat Tertaut** > pilih sesi WABiz Staging > **Keluar** (*Log out*).
4. Jalankan kembali `npm start`.

---

## 7. Penjelasan Companion Device & Batasan Platform

### Bagaimana Nomor Uji Coba Tetap Bisa Digunakan di Ponsel?
- Integrasi Baileys memanfaatkan protokol **WhatsApp Multi-Device**.
- Ponsel Anda bertindak sebagai **Primary Device**, sedangkan server WABiz bertindak sebagai **Perangkat Tertaut (Companion Device)** (sama seperti saat Anda membuka WhatsApp Web di laptop).
- Anda tetap dapat membuka aplikasi WhatsApp di ponsel, membaca percakapan pribadi, dan membalas chat seperti biasa tanpa terputus.

### Risiko & Batasan Platform:
1. **Bukan API Resmi Meta**:
   Baileys adalah implementasi rekayasa balik (reverse-engineered) dari protokol WhatsApp Web. Meta tidak memberikan jaminan SLA, dan perubahan protokol sewaktu-waktu dapat memerlukan update versi library.
2. **Batas Perangkat Tertaut**:
   WhatsApp membatasi maksimal 4 perangkat tertaut aktif per nomor.
3. **Inactivity Disconnection (Aturan 14 Hari)**:
   Jika ponsel utama tidak terhubung ke internet selama lebih dari 14 hari berturut-turut, WhatsApp akan secara otomatis mencabut semua sesi perangkat tertaut demi keamanan.
4. **Peringatan Anti-Spam & Pemblokiran Akun**:
   - Dilarang keras melakukan broadcast massal (spam) tanpa jeda waktu atau ke nomor yang tidak menyimpan kontak Anda.
   - Selalu gunakan nomor cadangan/khusus staging untuk pengujian otomatisasi.
