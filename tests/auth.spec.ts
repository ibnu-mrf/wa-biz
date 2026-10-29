import { test, expect } from '@playwright/test';

/**
 * BDD Automation Testing / Integration Testing untuk Modul Autentikasi WABiz
 * Menggunakan pola Given-When-Then dengan Playwright Test runner.
 */
test.describe('Feature: Autentikasi Pengguna WABiz (BDD Integration Tests)', () => {
  test.beforeEach(async ({ page }) => {
    // Bersihkan sesi browser agar pengujian selalu dimulai dari status belum terautentikasi
    await page.addInitScript(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        // Abaikan jika storage belum siap
      }
    });
  });

  test('Scenario: Halaman autentikasi WABiz berhasil dimuat dan menampilkan elemen UI utama', async ({ page }) => {
    // Given: Pengguna membuka aplikasi WABiz
    await test.step('Given pengguna mengakses URL web WABiz', async () => {
      await page.goto('/');
    });

    // When: Halaman aplikasi selesai dimuat
    await test.step('When halaman selesai di-render di browser', async () => {
      await expect(page.getByText('WABiz').first()).toBeVisible({ timeout: 20000 });
    });

    // Then: Seluruh elemen branding, judul, tab, dan field formulir harus terlihat
    await test.step('Then seluruh elemen visual utama autentikasi harus ditampilkan', async () => {
      await expect(page.getByText('Selamat Datang Kembali')).toBeVisible();
      await expect(page.getByText('WhatsApp Business Management')).toBeVisible();
      await expect(page.getByText('Masuk', { exact: true })).toBeVisible();
      await expect(page.getByText('Daftar Baru', { exact: true })).toBeVisible();
      await expect(page.getByPlaceholder('nama@organisasi.sch.id')).toBeVisible();
      await expect(page.getByPlaceholder('Minimal 6 karakter')).toBeVisible();
      await expect(page.getByText('Masuk ke Workspace')).toBeVisible();
    });
  });

  test('Scenario: Validasi input ketika alamat email tidak diisi (email kosong)', async ({ page }) => {
    // Given: Pengguna berada di halaman formulir autentikasi WABiz
    await test.step('Given pengguna berada di halaman autentikasi', async () => {
      await page.goto('/');
      await expect(page.getByPlaceholder('nama@organisasi.sch.id')).toBeVisible({ timeout: 20000 });
    });

    // When: Pengguna langsung mengklik tombol masuk tanpa memasukkan email
    await test.step('When pengguna menekan tombol "Masuk ke Workspace" dengan email kosong', async () => {
      await page.getByPlaceholder('nama@organisasi.sch.id').fill('');
      await page.getByText('Masuk ke Workspace').click();
    });

    // Then: Pesan validasi email wajib diisi ditampilkan
    await test.step('Then sistem menampilkan pesan validasi "Alamat email wajib diisi."', async () => {
      const errorMsg = page.getByText('Alamat email wajib diisi.');
      await expect(errorMsg).toBeVisible();
    });
  });

  test('Scenario: Validasi input ketika format alamat email tidak valid', async ({ page }) => {
    // Given: Pengguna berada di halaman autentikasi WABiz
    await test.step('Given pengguna berada di halaman autentikasi', async () => {
      await page.goto('/');
      await expect(page.getByPlaceholder('nama@organisasi.sch.id')).toBeVisible({ timeout: 20000 });
    });

    // When: Pengguna memasukkan alamat email dengan format keliru lalu submit
    await test.step('When pengguna memasukkan email dengan format tidak valid', async () => {
      await page.getByPlaceholder('nama@organisasi.sch.id').fill('email-tanpa-domain');
      await page.getByPlaceholder('Minimal 6 karakter').fill('rahasia123');
      await page.getByText('Masuk ke Workspace').click();
    });

    // Then: Pesan validasi format email tidak valid ditampilkan
    await test.step('Then sistem menampilkan pesan validasi "Format alamat email tidak valid."', async () => {
      const errorMsg = page.getByText('Format alamat email tidak valid.');
      await expect(errorMsg).toBeVisible();
    });
  });

  test('Scenario: Validasi input ketika kata sandi tidak diisi', async ({ page }) => {
    // Given: Pengguna berada di halaman autentikasi WABiz
    await test.step('Given pengguna berada di halaman autentikasi', async () => {
      await page.goto('/');
      await expect(page.getByPlaceholder('nama@organisasi.sch.id')).toBeVisible({ timeout: 20000 });
    });

    // When: Pengguna mengisi email valid namun mengosongkan kata sandi
    await test.step('When pengguna memasukkan email valid namun membiarkan kata sandi kosong', async () => {
      await page.getByPlaceholder('nama@organisasi.sch.id').fill('admin@organisasi.sch.id');
      await page.getByPlaceholder('Minimal 6 karakter').fill('');
      await page.getByText('Masuk ke Workspace').click();
    });

    // Then: Pesan validasi kata sandi wajib diisi ditampilkan
    await test.step('Then sistem menampilkan pesan validasi "Kata sandi wajib diisi."', async () => {
      const errorMsg = page.getByText('Kata sandi wajib diisi.');
      await expect(errorMsg).toBeVisible();
    });
  });

  test('Scenario: Validasi kata sandi minimal 6 karakter', async ({ page }) => {
    // Given: Pengguna berada di halaman autentikasi WABiz
    await test.step('Given pengguna berada di halaman autentikasi', async () => {
      await page.goto('/');
      await expect(page.getByPlaceholder('nama@organisasi.sch.id')).toBeVisible({ timeout: 20000 });
    });

    // When: Pengguna memasukkan kata sandi kurang dari 6 karakter
    await test.step('When pengguna mengisi kata sandi hanya 5 karakter', async () => {
      await page.getByPlaceholder('nama@organisasi.sch.id').fill('admin@organisasi.sch.id');
      await page.getByPlaceholder('Minimal 6 karakter').fill('12345');
      await page.getByText('Masuk ke Workspace').click();
    });

    // Then: Pesan validasi kata sandi minimal 6 karakter ditampilkan
    await test.step('Then sistem menampilkan pesan validasi "Kata sandi minimal harus 6 karakter."', async () => {
      const errorMsg = page.getByText('Kata sandi minimal harus 6 karakter.');
      await expect(errorMsg).toBeVisible();
    });
  });

  test('Scenario: Penanganan autentikasi login gagal dengan mock Supabase Auth API', async ({ page }) => {
    // Given: Mock endpoint autentikasi Supabase token password mengembalikan respon error 400
    await test.step('Given endpoint autentikasi Supabase di-mock mengembalikan kredensial salah', async () => {
      await page.route('**/auth/v1/token?grant_type=password', async (route) => {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'invalid_grant',
            error_description: 'Invalid login credentials',
            msg: 'Invalid login credentials',
          }),
        });
      });

      await page.goto('/');
      await expect(page.getByPlaceholder('nama@organisasi.sch.id')).toBeVisible({ timeout: 20000 });
    });

    // When: Pengguna mengirimkan kredensial login
    await test.step('When pengguna mengirimkan formulir login dengan kredensial tersebut', async () => {
      await page.getByPlaceholder('nama@organisasi.sch.id').fill('admin@organisasi.sch.id');
      await page.getByPlaceholder('Minimal 6 karakter').fill('wrongpassword123');
      await page.getByText('Masuk ke Workspace').click();
    });

    // Then: Pesan error terjemahan bahasa Indonesia ditampilkan di banner
    await test.step('Then sistem menampilkan banner error "Email atau kata sandi tidak sesuai. Silakan periksa kembali."', async () => {
      const errorBanner = page.getByText('Email atau kata sandi tidak sesuai. Silakan periksa kembali.');
      await expect(errorBanner).toBeVisible({ timeout: 10000 });
    });
  });

  test('Scenario: Navigasi tab antara formulir Masuk dan Daftar Baru', async ({ page }) => {
    // Given: Pengguna membuka halaman autentikasi
    await test.step('Given pengguna berada di formulir masuk awal', async () => {
      await page.goto('/');
      await expect(page.getByText('Selamat Datang Kembali')).toBeVisible({ timeout: 20000 });
    });

    // When: Pengguna mengklik tab "Daftar Baru"
    await test.step('When pengguna mengklik tab "Daftar Baru"', async () => {
      await page.getByText('Daftar Baru', { exact: true }).click();
    });

    // Then: UI bertransisi ke formulir pendaftaran akun baru
    await test.step('Then formulir berubah menjadi formulir registrasi lengkap', async () => {
      await expect(page.getByText('Buat Akun Workspace Baru')).toBeVisible();
      await expect(page.getByPlaceholder('misal: Ahmad Fauzi')).toBeVisible();
      await expect(page.getByPlaceholder('Ulangi kata sandi')).toBeVisible();
      await expect(page.getByText('Buat Akun Sekarang')).toBeVisible();
    });

    // When: Pengguna mengklik kembali tab "Masuk"
    await test.step('When pengguna mengklik tab "Masuk"', async () => {
      await page.getByText('Masuk', { exact: true }).click();
    });

    // Then: UI kembali ke formulir login
    await test.step('Then formulir kembali ke tampilan masuk', async () => {
      await expect(page.getByText('Selamat Datang Kembali')).toBeVisible();
      await expect(page.getByText('Masuk ke Workspace')).toBeVisible();
    });
  });
});

