import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { COLORS } from '../theme';

// ==========================================
// TIPE & PROPS ONBOARDING VIEW
// ==========================================
export interface OnboardingViewProps {
  onOrganizationCreated: () => void | Promise<void>;
  onLogout?: () => void | Promise<void>;
}

export function OnboardingView({ onOrganizationCreated, onLogout }: OnboardingViewProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Rekomendasi / Preset Organisasi Cepat
  const ORG_PRESETS = [
    'Pesantren Darul Ulum',
    'SMP IT Bina Insani',
    'Koperasi Syariah Sejahtera',
    'Kos Graha Mahasiswa',
    'Yayasan Amal Mulia',
  ];

  // Helper terjemahan error Supabase ke Bahasa Indonesia
  const translateRpcError = (err: string): string => {
    const lower = err.toLowerCase();
    if (lower.includes('permission denied')) {
      return 'Izin ditolak. Pastikan sesi login Anda masih aktif.';
    }
    if (lower.includes('unique') || lower.includes('duplicate')) {
      return 'Nama organisasi sudah terdaftar. Silakan gunakan nama lain.';
    }
    if (lower.includes('network') || lower.includes('fetch')) {
      return 'Gagal terhubung ke server Supabase. Periksa koneksi internet Anda.';
    }
    return err || 'Terjadi kesalahan saat membuat organisasi. Silakan coba lagi.';
  };

  const handleCreateOrganization = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanName = orgName.trim();
    if (!cleanName) {
      setErrorMessage('Nama organisasi wajib diisi.');
      return;
    }

    if (cleanName.length < 3) {
      setErrorMessage('Nama organisasi minimal harus terdiri dari 3 karakter.');
      return;
    }

    setIsLoading(true);

    try {
      // Panggil fungsi RPC resmi di Supabase
      const { error } = await supabase.rpc('create_organization_for_current_user', {
        org_name: cleanName,
      });

      if (error) {
        setErrorMessage(translateRpcError(error.message));
      } else {
        setSuccessMessage('Organisasi berhasil dibuat! Membuka dashboard workspace...');
        // Muat ulang status organisasi di parent App.tsx
        await onOrganizationCreated();
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Terjadi kendala saat memproses pembuatan organisasi.';
      setErrorMessage(translateRpcError(msg));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, isDesktop ? styles.cardDesktop : styles.cardMobile]}>
        {/* BRAND HEADER */}
        <View style={styles.brandHeader}>
          <View style={styles.brandLogoBox}>
            <Text style={styles.brandLogoText}>W</Text>
          </View>
          <View style={styles.brandTextGroup}>
            <View style={styles.brandTitleRow}>
              <Text style={styles.brandTitle}>WABiz</Text>
              <View style={styles.brandTierBadge}>
                <Text style={styles.brandTierText}>ONBOARDING</Text>
              </View>
            </View>
            <Text style={styles.brandSubtitle}>Langkah Terakhir Inisialisasi Workspace</Text>
          </View>
        </View>

        {/* WELCOME / INSTRUKSI */}
        <View style={styles.welcomeBox}>
          <Text style={styles.welcomeTitle}>Buat Organisasi Pertama Anda</Text>
          <Text style={styles.welcomeDesc}>
            Akun Anda belum terhubung ke organisasi mana pun. WABiz dirancang sebagai platform multi-tenant
            untuk pesantren, sekolah, UMKM, kos-kosan, yayasan, dan bisnis lainnya. Masukkan nama resmi
            organisasi Anda untuk mengaktifkan workspace.
          </Text>
        </View>

        {/* NOTIFIKASI ERROR / SUKSES */}
        {errorMessage && (
          <View style={styles.errorBanner}>
            <View style={styles.errorIconCircle}>
              <Text style={styles.errorIconText}>!</Text>
            </View>
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}

        {successMessage && (
          <View style={styles.successBanner}>
            <View style={styles.successIconCircle}>
              <Text style={styles.successIconText}>✓</Text>
            </View>
            <Text style={styles.successBannerText}>{successMessage}</Text>
          </View>
        )}

        {/* FORM INPUT ORGANISASI */}
        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              Nama Organisasi / Lembaga <Text style={styles.requiredStar}>*</Text>
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="misal: Pesantren Darul Ulum, CV Berkah Abadi, dll."
              placeholderTextColor={COLORS.textMuted}
              value={orgName}
              onChangeText={setOrgName}
              autoCapitalize="words"
              editable={!isLoading}
              onSubmitEditing={handleCreateOrganization}
            />
            <Text style={styles.helperText}>
              Nama ini akan menjadi identitas workspace WhatsApp Business Anda.
            </Text>
          </View>

          {/* CHIPS REKOMENDASI NAMA */}
          <View style={styles.presetsWrapper}>
            <Text style={styles.presetsTitle}>Contoh Cepat:</Text>
            <View style={styles.presetsList}>
              {ORG_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={styles.presetChip}
                  activeOpacity={0.7}
                  onPress={() => setOrgName(preset)}
                  disabled={isLoading}
                >
                  <Text style={styles.presetChipText}>{preset}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* TOMBOL AKSI UTAMA */}
          <TouchableOpacity
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            activeOpacity={0.8}
            onPress={handleCreateOrganization}
            disabled={isLoading}
          >
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.submitButtonText}>Membuat Organisasi...</Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>Buat Organisasi</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* LOGOUT OPTION */}
        {onLogout && (
          <View style={styles.logoutFooter}>
            <Text style={styles.logoutText}>Masuk menggunakan akun lain?</Text>
            <TouchableOpacity onPress={onLogout} activeOpacity={0.7} disabled={isLoading}>
              <Text style={styles.logoutLink}>Keluar dari Akun</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ==========================================
// STYLESHEET
// ==========================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F6',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: '100%',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4EAE6',
    padding: 32,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 30px rgba(18, 60, 50, 0.08)',
      },
      default: {
        elevation: 4,
      },
    }),
  },
  cardDesktop: {
    width: 520,
    maxWidth: '100%',
  },
  cardMobile: {
    width: '100%',
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F2',
  },
  brandLogoBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.forestDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.emerald,
  },
  brandLogoText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  brandTextGroup: {
    flex: 1,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.forestDark,
    letterSpacing: -0.5,
  },
  brandTierBadge: {
    backgroundColor: COLORS.emeraldSubtle,
    borderWidth: 1,
    borderColor: COLORS.emeraldBorder,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  brandTierText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.emerald,
    letterSpacing: 0.6,
  },
  brandSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  welcomeBox: {
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 8,
  },
  welcomeDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 10,
  },
  errorIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  errorIconText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 18,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 10,
  },
  successIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  successIconText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  successBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#065F46',
    lineHeight: 18,
  },
  formContainer: {
    gap: 18,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  requiredStar: {
    color: '#DC2626',
  },
  textInput: {
    backgroundColor: '#FAFCFB',
    borderWidth: 1,
    borderColor: '#D7DFDB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.textDark,
  },
  helperText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  presetsWrapper: {
    marginTop: -4,
  },
  presetsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  presetsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    backgroundColor: '#EEF3F0',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2EAE5',
  },
  presetChipText: {
    fontSize: 11,
    color: COLORS.forestDark,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: COLORS.emerald,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(22, 163, 106, 0.25)',
      },
      default: {
        elevation: 3,
      },
    }),
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  logoutFooter: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  logoutText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  logoutLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.emerald,
  },
});
