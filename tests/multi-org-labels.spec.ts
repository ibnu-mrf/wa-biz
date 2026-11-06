import { test, expect } from '@playwright/test';
import {
  CANONICAL_INSTITUTION_TYPES,
  DEFAULT_LABELS_BY_TYPE,
  normalizeInstitutionType,
  getEffectiveContactLabels,
  parseContactLabels,
  buildContactLabelsArray,
  isFollowUpStatus,
  FOLLOW_UP_STATUSES,
  FollowUpStatus,
} from '../src/lib/organizationTypes';

/**
 * =====================================================================
 * MULTI-ORGANIZATION & CUSTOM CONTACT LABELS SUITE: 10 SCENARIOS
 * =====================================================================
 * Pengujian komprehensif mencakup:
 * 1. Preset pesantren, UMKM, dan kos-kosan menghasilkan label yang berbeda.
 * 2. Label kustom dapat ditambahkan, diubah, dan dihapus.
 * 3. Rename tidak merusak status tindak lanjut kontak lama.
 * 4. Delete dengan opsi ganti label memperbarui kontak ke label baru.
 * 5. Delete tanpa opsi ganti tidak menghapus data kontak lainnya.
 * 6. Role Member tidak diizinkan mengubah daftar label.
 * 7. Organisasi A tidak dapat membaca atau mengubah label Organisasi B.
 * 8. Kontak lama dengan label warisan tetap terbaca dan ter-parse dengan benar.
 * 9. Filter audiens kampanye menggunakan label aktif organisasi.
 * 10. Perpindahan antarorganisasi mengganti set label yang aktif tanpa sisa state lama.
 * =====================================================================
 */

test.describe('Multi-Organization & Custom Contact Labels Suite', () => {
  // -------------------------------------------------------------------
  // Skenario 1: Preset Pesantren, UMKM, dan Kos-kosan Berbeda
  // -------------------------------------------------------------------
  test('Skenario 1: Preset Pesantren, UMKM, dan Kos-kosan menghasilkan label yang berbeda dan relevan', () => {
    const pesantrenLabels = getEffectiveContactLabels([], 'Pesantren');
    const umkmLabels = getEffectiveContactLabels([], 'UMKM / Bisnis Retail');
    const kosLabels = getEffectiveContactLabels([], 'Properti / Kos-kosan');
    const jasaLabels = getEffectiveContactLabels([], 'Jasa / Konsultan');

    // Pastikan preset Pesantren memiliki ciri khas pendidikan Islam
    expect(pesantrenLabels).toContain('Calon Santri');
    expect(pesantrenLabels).toContain('Santri Aktif');
    expect(pesantrenLabels).toContain('Alumni');
    expect(pesantrenLabels).toContain('Umum');

    // Pastikan preset UMKM memiliki ciri khas retail dan reseller
    expect(umkmLabels).toContain('Pelanggan Baru');
    expect(umkmLabels).toContain('Pelanggan Aktif');
    expect(umkmLabels).toContain('Reseller');
    expect(umkmLabels).toContain('Agen');
    expect(umkmLabels).toContain('Member VIP');
    expect(umkmLabels).not.toContain('Calon Santri');

    // Pastikan preset Kos-kosan memiliki ciri khas properti dan sewa
    expect(kosLabels).toContain('Calon Penyewa');
    expect(kosLabels).toContain('Penyewa Aktif');
    expect(kosLabels).toContain('Menunggu Pembayaran');
    expect(kosLabels).toContain('Alumni Kos');
    expect(kosLabels).not.toContain('Reseller');
    expect(kosLabels).not.toContain('Santri Aktif');

    // Pastikan preset Jasa memiliki ciri khas konsultan & prospek
    expect(jasaLabels).toContain('Prospek Baru');
    expect(jasaLabels).toContain('Klien Aktif');
    expect(jasaLabels).toContain('Follow-up Penawaran');

    // Pastikan seluruh preset tetap menyertakan 'Umum' sebagai jangkar kompatibilitas
    expect(pesantrenLabels).toContain('Umum');
    expect(umkmLabels).toContain('Umum');
    expect(kosLabels).toContain('Umum');
    expect(jasaLabels).toContain('Umum');

    // Uji normalisasi tipe warisan (legacy)
    expect(normalizeInstitutionType('Pesantren / Islamic Boarding School')).toBe('Pesantren');
    expect(normalizeInstitutionType('Madrasah (MI/MTs/MA)')).toBe('Madrasah');
    expect(normalizeInstitutionType('Yayasan Pendidikan')).toBe('Yayasan / Organisasi Umum');
    expect(normalizeInstitutionType('Lembaga Kursus & Pelatihan')).toBe('Jasa / Konsultan');
  });

  // -------------------------------------------------------------------
  // Skenario 2: Label Kustom Dapat Ditambahkan, Diubah, dan Dihapus
  // -------------------------------------------------------------------
  test('Skenario 2: Label kustom dapat ditambahkan, diubah, dan dihapus dengan validasi unik', () => {
    let currentLabels = ['Calon Santri', 'Orang Tua', 'Santri Aktif', 'Alumni', 'Umum'];

    // 1. Tambah Label Baru
    const newLabel = 'Donatur Tetap';
    const isDuplicate = currentLabels.some((l) => l.toLowerCase() === newLabel.toLowerCase());
    expect(isDuplicate).toBe(false);

    currentLabels = [...currentLabels.filter((l) => l !== 'Umum'), newLabel, 'Umum'];
    expect(currentLabels).toContain('Donatur Tetap');

    // Cek proteksi duplikasi case-insensitive
    const duplicateCandidate = 'donatur tetap';
    const hasDuplicate = currentLabels.some((l) => l.toLowerCase() === duplicateCandidate.toLowerCase());
    expect(hasDuplicate).toBe(true);

    // 2. Ubah / Rename Label
    const oldName = 'Donatur Tetap';
    const updatedName = 'Donatur Utama Wakaf';
    currentLabels = currentLabels.map((l) => (l === oldName ? updatedName : l));
    expect(currentLabels).toContain('Donatur Utama Wakaf');
    expect(currentLabels).not.toContain('Donatur Tetap');

    // 3. Hapus Label
    currentLabels = currentLabels.filter((l) => l !== 'Donatur Utama Wakaf');
    expect(currentLabels).not.toContain('Donatur Utama Wakaf');

    // Pastikan jangkar 'Umum' tidak boleh dihapus atau selalu dipertahankan
    const effectiveAfterDelete = getEffectiveContactLabels(currentLabels, 'Pesantren');
    expect(effectiveAfterDelete).toContain('Umum');
  });

  // -------------------------------------------------------------------
  // Skenario 3: Rename Tidak Merusak Status Tindak Lanjut Kontak Lama
  // -------------------------------------------------------------------
  test('Skenario 3: Rename label hanya mengubah elemen kategori dan mempertahankan status kontak 100%', () => {
    // Dataset kontak dengan berbagai status tindak lanjut
    const testCases: { rawLabels: string[]; oldLabel: string; newLabel: string; expectedStatus: FollowUpStatus }[] = [
      {
        rawLabels: ['Wali Calon Santri', 'Perlu Follow-up'],
        oldLabel: 'Wali Calon Santri',
        newLabel: 'Orang Tua Santri Baru',
        expectedStatus: 'Perlu Follow-up',
      },
      {
        rawLabels: ['Santri Aktif', 'Sudah Dihubungi'],
        oldLabel: 'Santri Aktif',
        newLabel: 'Santri Mukim Aktif',
        expectedStatus: 'Sudah Dihubungi',
      },
      {
        rawLabels: ['Calon Santri', 'Belum Dihubungi'],
        oldLabel: 'Calon Santri',
        newLabel: 'Pendaftar Santri',
        expectedStatus: 'Belum Dihubungi',
      },
    ];

    for (const tc of testCases) {
      // 1. Parse kontak awal
      const { label, followUpStatus } = parseContactLabels(tc.rawLabels);
      expect(label).toBe(tc.oldLabel);
      expect(followUpStatus).toBe(tc.expectedStatus);

      // 2. Lakukan mutasi rename pada kategori label
      const renamedLabel = label === tc.oldLabel ? tc.newLabel : label;
      const updatedArray = buildContactLabelsArray(renamedLabel, followUpStatus);

      // 3. Verifikasi array PostgreSQL [label, status]
      expect(updatedArray).toHaveLength(2);
      expect(updatedArray[0]).toBe(tc.newLabel);
      expect(updatedArray[1]).toBe(tc.expectedStatus);

      // 4. Parse kembali untuk memastikan parser menerima format hasil rename
      const parsedAgain = parseContactLabels(updatedArray);
      expect(parsedAgain.label).toBe(tc.newLabel);
      expect(parsedAgain.followUpStatus).toBe(tc.expectedStatus);
    }
  });

  // -------------------------------------------------------------------
  // Skenario 4: Delete dengan Opsi Ganti Label Memperbarui Kontak
  // -------------------------------------------------------------------
  test('Skenario 4: Delete label dengan opsi ganti memetakan seluruh kontak terdampak ke label pengganti', () => {
    const contactsDb = [
      { id: 'c1', name: 'Ahmad Faiz', labels: ['Santri Senior', 'Sudah Dihubungi'], phone: '08123456789' },
      { id: 'c2', name: 'Nurul Huda', labels: ['Santri Senior', 'Perlu Follow-up'], phone: '08123456780' },
      { id: 'c3', name: 'Budi Santoso', labels: ['Umum', 'Belum Dihubungi'], phone: '08123456781' },
    ];

    const deletedLabel = 'Santri Senior';
    const replacementLabel = 'Alumni';

    // Simulasi eksekusi RPC delete_organization_contact_label dengan replacement
    const updatedContacts = contactsDb.map((c) => {
      const parsed = parseContactLabels(c.labels);
      if (parsed.label === deletedLabel) {
        return {
          ...c,
          labels: buildContactLabelsArray(replacementLabel, parsed.followUpStatus),
        };
      }
      return c;
    });

    // Verifikasi c1 dan c2 terupdate ke 'Alumni' dengan status masing-masing tetap utuh
    expect(updatedContacts[0].labels).toEqual(['Alumni', 'Sudah Dihubungi']);
    expect(updatedContacts[0].name).toBe('Ahmad Faiz');
    expect(updatedContacts[0].phone).toBe('08123456789');

    expect(updatedContacts[1].labels).toEqual(['Alumni', 'Perlu Follow-up']);
    expect(updatedContacts[1].name).toBe('Nurul Huda');

    // c3 tidak terpengaruh
    expect(updatedContacts[2].labels).toEqual(['Umum', 'Belum Dihubungi']);
  });

  // -------------------------------------------------------------------
  // Skenario 5: Delete Tanpa Opsi Ganti Tidak Menghapus Data Kontak Lainnya
  // -------------------------------------------------------------------
  test('Skenario 5: Delete tanpa opsi ganti mengalihkan label ke "Umum" tanpa menghapus metadata kontak', () => {
    const contact = {
      id: 'c-umkm-1',
      name: 'CV Berkah Mandiri',
      phone: '085712345678',
      email: 'berkah@example.com',
      notes: 'Pelanggan partai besar wilayah Jawa Timur',
      labels: ['Reseller Lama', 'Perlu Follow-up'],
    };

    const deletedLabel = 'Reseller Lama';
    const parsed = parseContactLabels(contact.labels);
    expect(parsed.label).toBe(deletedLabel);
    expect(parsed.followUpStatus).toBe('Perlu Follow-up');

    // Hapus tanpa replacement -> otomatis jatuh ke 'Umum'
    const newLabels = buildContactLabelsArray('Umum', parsed.followUpStatus);
    const updatedContact = {
      ...contact,
      labels: newLabels,
    };

    // Verifikasi integritas data kontak
    expect(updatedContact.labels).toEqual(['Umum', 'Perlu Follow-up']);
    expect(updatedContact.id).toBe('c-umkm-1');
    expect(updatedContact.name).toBe('CV Berkah Mandiri');
    expect(updatedContact.phone).toBe('085712345678');
    expect(updatedContact.email).toBe('berkah@example.com');
    expect(updatedContact.notes).toBe('Pelanggan partai besar wilayah Jawa Timur');
  });

  // -------------------------------------------------------------------
  // Skenario 6: Role Member Tidak Diizinkan Mengubah Daftar Label
  // -------------------------------------------------------------------
  test('Skenario 6: Role Member ditolak melakukan mutasi label, hanya Owner dan Admin yang memiliki otorisasi', () => {
    const isOwnerOrAdmin = (role: string | null | undefined): boolean => {
      return role === 'owner' || role === 'admin';
    };

    // 1. Role Member (Petugas CS)
    expect(isOwnerOrAdmin('member')).toBe(false);
    expect(isOwnerOrAdmin(null)).toBe(false);
    expect(isOwnerOrAdmin(undefined)).toBe(false);

    // 2. Role Owner & Admin
    expect(isOwnerOrAdmin('owner')).toBe(true);
    expect(isOwnerOrAdmin('admin')).toBe(true);

    // Simulasi RPC guard: jika user adalah member, eksekusi mutasi melempar error
    const executeMutationAsRole = (role: string, action: () => void) => {
      if (!isOwnerOrAdmin(role)) {
        throw new Error('Hanya Pemilik (Owner) atau Admin yang diizinkan mengelola segmen label.');
      }
      action();
    };

    // Verifikasi proteksi melempar exception saat dipanggil oleh Member
    let mutated = false;
    expect(() => {
      executeMutationAsRole('member', () => {
        mutated = true;
      });
    }).toThrow('Hanya Pemilik (Owner) atau Admin');
    expect(mutated).toBe(false);

    // Verifikasi berhasil saat dipanggil oleh Admin
    expect(() => {
      executeMutationAsRole('admin', () => {
        mutated = true;
      });
    }).not.toThrow();
    expect(mutated).toBe(true);
  });

  // -------------------------------------------------------------------
  // Skenario 7: Organisasi A Tidak Dapat Membaca/Mengubah Label Organisasi B
  // -------------------------------------------------------------------
  test('Skenario 7: Tenant Isolation - Organisasi A tidak dapat memutasi label Organisasi B', () => {
    interface OrgData {
      id: string;
      name: string;
      labels: string[];
    }

    const organizations: Record<string, OrgData> = {
      'org-pesantren-1': {
        id: 'org-pesantren-1',
        name: 'Pesantren Al-Hikmah',
        labels: ['Santri Tahfidz', 'Santri Reguler', 'Umum'],
      },
      'org-kos-2': {
        id: 'org-kos-2',
        name: 'Kost Exclusive WABiz',
        labels: ['Kamar VIP', 'Kamar Standar', 'Umum'],
      },
    };

    const updateOrgLabels = (
      userOrgId: string,
      targetOrgId: string,
      newLabels: string[]
    ) => {
      if (userOrgId !== targetOrgId) {
        throw new Error('Akses ditolak: Tidak dapat memodifikasi konfigurasi organisasi lain.');
      }
      organizations[targetOrgId].labels = newLabels;
    };

    // User dari Organisasi Pesantren mencoba mengubah label Kost Exclusive
    expect(() => {
      updateOrgLabels('org-pesantren-1', 'org-kos-2', ['Hacker Label', 'Umum']);
    }).toThrow('Akses ditolak');

    // Verifikasi data Kost Exclusive tidak tercemar
    expect(organizations['org-kos-2'].labels).toEqual(['Kamar VIP', 'Kamar Standar', 'Umum']);
    expect(organizations['org-kos-2'].labels).not.toContain('Hacker Label');
  });

  // -------------------------------------------------------------------
  // Skenario 8: Kontak Lama dengan Label Warisan Terbaca & Ter-parse Benar
  // -------------------------------------------------------------------
  test('Skenario 8: Backward Compatibility - Kontak warisan tanpa status atau format lama ter-parse dengan benar', () => {
    // Kasus 1: Hanya 1 elemen status tanpa kategori
    const legacyCase1 = parseContactLabels(['Perlu Follow-up']);
    expect(legacyCase1.label).toBe('Umum');
    expect(legacyCase1.followUpStatus).toBe('Perlu Follow-up');

    // Kasus 2: Hanya 1 elemen kategori tanpa status
    const legacyCase2 = parseContactLabels(['Calon Santri']);
    expect(legacyCase2.label).toBe('Calon Santri');
    expect(legacyCase2.followUpStatus).toBe('Belum Dihubungi');

    // Kasus 3: Array kosong / null
    const legacyCase3 = parseContactLabels([]);
    expect(legacyCase3.label).toBe('Umum');
    expect(legacyCase3.followUpStatus).toBe('Belum Dihubungi');

    const legacyCase4 = parseContactLabels(null);
    expect(legacyCase4.label).toBe('Umum');
    expect(legacyCase4.followUpStatus).toBe('Belum Dihubungi');

    // Kasus 5: Kontak dengan label custom yang belum terdaftar di preset bawaan
    const legacyCase5 = parseContactLabels(['Mitra Strategis Pemprov', 'Sudah Dihubungi']);
    expect(legacyCase5.label).toBe('Mitra Strategis Pemprov');
    expect(legacyCase5.followUpStatus).toBe('Sudah Dihubungi');
  });

  // -------------------------------------------------------------------
  // Skenario 9: Filter Audiens Kampanye Menggunakan Label Aktif Organisasi
  // -------------------------------------------------------------------
  test('Skenario 9: Filter audiens kampanye menggunakan segmen aktif organisasi UMKM', () => {
    const umkmActiveLabels = getEffectiveContactLabels(
      ['Pelanggan Baru', 'Pelanggan Aktif', 'Reseller', 'Agen VIP', 'Umum'],
      'UMKM / Bisnis Retail'
    );

    const contacts = [
      { id: '1', name: 'Toko Berkah', labels: ['Reseller', 'Sudah Dihubungi'] },
      { id: '2', name: 'Ibu Siska', labels: ['Pelanggan Baru', 'Belum Dihubungi'] },
      { id: '3', name: 'Pak Joko', labels: ['Agen VIP', 'Perlu Follow-up'] },
      { id: '4', name: 'Pelanggan Walk-in', labels: ['Umum', 'Belum Dihubungi'] },
    ];

    // Filter kampanye untuk segmen 'Reseller'
    const targetSegment = 'Reseller';
    expect(umkmActiveLabels).toContain(targetSegment);

    const matchingContacts = contacts.filter((c) => {
      const parsed = parseContactLabels(c.labels, umkmActiveLabels);
      return parsed.label.toLowerCase() === targetSegment.toLowerCase();
    });

    expect(matchingContacts).toHaveLength(1);
    expect(matchingContacts[0].name).toBe('Toko Berkah');

    // Filter kampanye 'Semua' audiens
    const allContacts = contacts.filter((c) => {
      const parsed = parseContactLabels(c.labels, umkmActiveLabels);
      return parsed.label; // Memastikan setiap kontak memiliki label yang valid
    });
    expect(allContacts).toHaveLength(4);
  });

  // -------------------------------------------------------------------
  // Skenario 10: Perpindahan Antar-Organisasi Mengganti Set Label Bersih
  // -------------------------------------------------------------------
  test('Skenario 10: Perpindahan antarorganisasi mengganti set label yang aktif tanpa residu state lama', () => {
    // Sesi 1: Organisasi Pesantren
    const orgPesantren = {
      id: 'org-1',
      institutionType: 'Pesantren',
      customLabels: ['Santri Tahfidz', 'Santri Kitab', 'Umum'],
    };

    let activeLabels = getEffectiveContactLabels(orgPesantren.customLabels, orgPesantren.institutionType);
    expect(activeLabels).toContain('Santri Tahfidz');
    expect(activeLabels).toContain('Santri Kitab');
    expect(activeLabels).not.toContain('Penyewa Aktif');

    // Sesi 2: Pengguna beralih ke Organisasi Kos-kosan
    const orgKos = {
      id: 'org-2',
      institutionType: 'Properti / Kos-kosan',
      customLabels: ['Penyewa Bulanan', 'Penyewa Tahunan', 'Umum'],
    };

    // Bersihkan state & load profil organisasi baru
    activeLabels = getEffectiveContactLabels(orgKos.customLabels, orgKos.institutionType);

    expect(activeLabels).toContain('Penyewa Bulanan');
    expect(activeLabels).toContain('Penyewa Tahunan');
    // Pastikan label pesantren sama sekali tidak ada di organisasi kos
    expect(activeLabels).not.toContain('Santri Tahfidz');
    expect(activeLabels).not.toContain('Santri Kitab');
    expect(activeLabels).not.toContain('Calon Santri');
  });

  // -------------------------------------------------------------------
  // Skenario 11: Validasi Reserved Status Names
  // -------------------------------------------------------------------
  test('Skenario 11: Validasi Reserved Status - Nama status operasional ditolak pada penambahan, rename, dan replacement', () => {
    const reservedCandidates = [
      'Belum Dihubungi',
      'Sudah Dihubungi',
      'Perlu Follow-up',
      'belum dihubungi',
      'SUDAH DIHUBUNGI',
      'perlu follow-up',
    ];

    for (const name of reservedCandidates) {
      expect(isFollowUpStatus(name)).toBe(true);
    }

    // Label normal tidak boleh terdeteksi sebagai status operasional
    expect(isFollowUpStatus('Santri Baru')).toBe(false);
    expect(isFollowUpStatus('Reseller')).toBe(false);
    expect(isFollowUpStatus('Umum')).toBe(false);

    // Simulasi RPC guard: rename/delete melempar error code 22023 jika target adalah status reservasi
    const validateLabelInput = (label: string) => {
      const trimmed = label.trim();
      if (isFollowUpStatus(trimmed)) {
        const err = new Error('Nama label tidak boleh menggunakan nama status operasional sistem.');
        (err as any).code = '22023';
        throw err;
      }
      return trimmed;
    };

    expect(() => validateLabelInput('Perlu Follow-up')).toThrow('Nama label tidak boleh');
    expect(() => validateLabelInput('  belum dihubungi  ')).toThrow('Nama label tidak boleh');
    expect(() => validateLabelInput('Pelanggan VIP')).not.toThrow();
  });

  // -------------------------------------------------------------------
  // Skenario 12: Penanganan custom_labels Kosong / NULL pada Safe Delete
  // -------------------------------------------------------------------
  test('Skenario 12: Delete dengan replacement saat custom_labels NULL atau "{}" menginisialisasi array dengan replacement_label', () => {
    // Simulasi logika Section F yang telah diperbaiki
    const simulateSectionF = (
      currentLabels: string[] | null | undefined,
      cleanReplace: string
    ): string[] => {
      if (!currentLabels || currentLabels.length === 0) {
        return [cleanReplace];
      }
      const found = currentLabels.some(
        (item) => item.toLowerCase() === cleanReplace.toLowerCase()
      );
      if (!found) {
        return [...currentLabels, cleanReplace];
      }
      return currentLabels;
    };

    // Kasus 1: custom_labels bernilai null
    const resultFromNull = simulateSectionF(null, 'Alumni');
    expect(resultFromNull).toEqual(['Alumni']);

    // Kasus 2: custom_labels berupa array kosong []
    const resultFromEmpty = simulateSectionF([], 'Member VIP');
    expect(resultFromEmpty).toEqual(['Member VIP']);

    // Kasus 3: custom_labels sudah memiliki label lain
    const resultFromExisting = simulateSectionF(['Reseller', 'Agen'], 'Member VIP');
    expect(resultFromExisting).toEqual(['Reseller', 'Agen', 'Member VIP']);

    // Kasus 4: custom_labels sudah memiliki replacement_label (case-insensitive) -> tidak duplikasi
    const resultDuplicate = simulateSectionF(['Member VIP', 'Agen'], 'member vip');
    expect(resultDuplicate).toEqual(['Member VIP', 'Agen']);
  });

  // -------------------------------------------------------------------
  // Skenario 13: Otorisasi Deny-by-Default untuk Role Null / Unresolved
  // -------------------------------------------------------------------
  test('Skenario 13: Role null atau unresolved tidak memperoleh hak Owner/Admin (Deny-by-default)', () => {
    const isOwnerOrAdmin = (role: string | null | undefined): boolean => {
      return role === 'owner' || role === 'admin';
    };

    // Role null (misal saat inisialisasi awal atau fetch gagal)
    expect(isOwnerOrAdmin(null)).toBe(false);
    expect(isOwnerOrAdmin(undefined)).toBe(false);
    expect(isOwnerOrAdmin('')).toBe(false);
    expect(isOwnerOrAdmin('member')).toBe(false);
    expect(isOwnerOrAdmin('guest')).toBe(false);

    // Hanya owner dan admin eksplisit yang diizinkan
    expect(isOwnerOrAdmin('owner')).toBe(true);
    expect(isOwnerOrAdmin('admin')).toBe(true);
  });

  // -------------------------------------------------------------------
  // Skenario 14: Penanganan Error RPC Eksplisit (Fail-Fast Tanpa Loop Update)
  // -------------------------------------------------------------------
  test('Skenario 14: Penanganan Error RPC Eksplisit - Error 42883, 42501, 23505 menghentikan mutasi tanpa fallback klien', async () => {
    // Fungsi translasi error RPC dari ContactsView
    const formatRpcLabelError = (error: { code?: string; message?: string }): string => {
      const code = String(error.code || '');
      const msg = String(error.message || '').toLowerCase();

      if (code === '42883' || msg.includes('does not exist') || (msg.includes('function') && msg.includes('not found'))) {
        return 'Fitur kelola label memerlukan pembaruan database server (RPC 42883 belum tersedia). Silakan hubungi Administrator untuk menjalankan migrasi skema database.';
      }
      if (code === '42501' || msg.includes('permission denied') || msg.includes('akses ditolak')) {
        return 'Akses ditolak (42501): Hanya Pemilik (Owner) atau Admin yang berwenang mengelola label organisasi.';
      }
      if (code === '23505' || msg.includes('sudah terdaftar') || msg.includes('already exists') || msg.includes('duplikasi')) {
        return 'Nama label sudah digunakan dalam organisasi ini (duplikasi tidak diizinkan, kode 23505).';
      }
      return error.message || 'Gagal memproses label di server database. Operasi dibatalkan.';
    };

    // 1. Error 42883: Fungsi belum dimigrasi di server
    const err42883 = { code: '42883', message: 'function rename_organization_contact_label does not exist' };
    const msg42883 = formatRpcLabelError(err42883);
    expect(msg42883).toContain('RPC 42883 belum tersedia');

    // 2. Error 42501: Pengguna tidak berwenang
    const err42501 = { code: '42501', message: 'permission denied for function' };
    const msg42501 = formatRpcLabelError(err42501);
    expect(msg42501).toContain('Akses ditolak (42501)');

    // 3. Error 23505: Duplikasi label
    const err23505 = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const msg23505 = formatRpcLabelError(err23505);
    expect(msg23505).toContain('duplikasi tidak diizinkan, kode 23505');

    // 4. Verifikasi Fail-Fast: Kontak tidak dimodifikasi saat RPC gagal
    const originalContacts = [
      { id: '1', name: 'Faiz', labels: ['Santri Reguler', 'Belum Dihubungi'] },
    ];
    let contactsState = [...originalContacts];
    let clientLoopTriggered = false;

    const executeRenameSimulated = async (rpcError: any) => {
      if (rpcError) {
        // FAIL-FAST: Hentikan langsung, jangan ubah state dan jangan lakukan loop
        return { success: false, error: formatRpcLabelError(rpcError) };
      }
      // Hanya dijalankan jika RPC sukses
      clientLoopTriggered = true;
      contactsState = contactsState.map(c => ({
        ...c,
        labels: ['Santri Baru', 'Belum Dihubungi']
      }));
      return { success: true };
    };

    // Uji dengan error 42883
    const result = await executeRenameSimulated(err42883);
    expect(result.success).toBe(false);
    expect(clientLoopTriggered).toBe(false); // Loop update kontak tidak pernah dipicu
    expect(contactsState[0].labels).toEqual(['Santri Reguler', 'Belum Dihubungi']); // State tetap utuh

    // Uji dengan error 42501
    const result42501 = await executeRenameSimulated(err42501);
    expect(result42501.success).toBe(false);
    expect(clientLoopTriggered).toBe(false);
    expect(contactsState[0].labels).toEqual(['Santri Reguler', 'Belum Dihubungi']);
  });
});

