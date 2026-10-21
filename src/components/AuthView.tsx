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
// TIPE & PROPS AUTHENTICATION VIEW
// ==========================================
export type AuthMode = 'login' | 'register';

export interface AuthViewProps {
  initialMode?: AuthMode;
  onSuccess?: () => void;
}

export function AuthView({ initialMode = 'login', onSuccess }: AuthViewProps) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Helper terjemahan error Supabase ke Bahasa Indonesia
  const translateAuthError = (err: string): string => {
    const lower = err.toLowerCase();
    if (lower.includes('invalid login credentials')) {
      return 'Email atau kata sandi tidak sesuai. Silakan periksa kembali.';
    }
    if (lower.includes('user already registered')) {
      return 'Email ini sudah terdaftar. Silakan beralih ke tab Masuk.';
    }
    if (lower.includes('password should be at least')) {
      return 'Kata sandi minimal harus terdiri dari 6 karakter.';
    }
    if (lower.includes('email not confirmed')) {
      return 'Email Anda belum dikonfirmasi. Silakan periksa kotak masuk/spam email Anda.';
    }
    if (lower.includes('rate limit')) {
      return 'Terlalu banyak percobaan. Harap tunggu beberapa saat sebelum mencoba kembali.';
    }
    if (lower.includes('network') || lower.includes('fetch')) {
      return 'Gagal terhubung ke server Supabase. Periksa koneksi internet Anda.';
    }
    return err;
  };

  const handleSwitchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    // 1. Validasi Input Dasar
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Alamat email wajib diisi.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMessage('Format alamat email tidak valid.');
      return;
    }

    if (!password) {
      setErrorMessage('Kata sandi wajib diisi.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Kata sandi minimal harus 6 karakter.');
      return;
    }

    if (mode === 'register') {
      if (!fullName.trim()) {
        setErrorMessage('Nama lengkap wajib diisi.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Konfirmasi kata sandi tidak cocok.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          setErrorMessage(translateAuthError(error.message));
        } else {
          // Berhasil login - onAuthStateChange di App.tsx akan otomatis mengalirkan sesi
          if (onSuccess) onSuccess();
        }
      } else {
        // Mode Register
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });

        if (error) {
          setErrorMessage(translateAuthError(error.message));
        } else if (data.session) {
          // Berhasil registrasi & auto login
          setSuccessMessage('Pendaftaran berhasil! Sedang masuk ke workspace...');
          if (onSuccess) onSuccess();
        } else if (data.user) {
          // Butuh konfirmasi email
          setSuccessMessage(
            'Pendaftaran berhasil! Tautan verifikasi telah dikirimkan ke email Anda. Silakan cek kotak masuk dan masuk ke akun Anda.'
          );
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kendala saat memproses autentikasi.';
      setErrorMessage(translateAuthError(msg));
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
      <View style={[styles.authCard, isDesktop ? styles.authCardDesktop : styles.authCardMobile]}>
        {/* LOGO & BRANDING */}
        <View style={styles.brandHeader}>
          <View style={styles.brandLogoBox}>
            <Text style={styles.brandLogoText}>W</Text>
          </View>
          <View style={styles.brandTextGroup}>
            <View style={styles.brandTitleRow}>
              <Text style={styles.brandTitle}>WABiz</Text>
              <View style={styles.brandTierBadge}>
                <Text style={styles.brandTierText}>SAAS</Text>
              </View>
            </View>
            <Text style={styles.brandSubtitle}>WhatsApp Business Management</Text>
          </View>
        </View>

        {/* WELCOME NOTE */}
        <View style={styles.welcomeBox}>
          <Text style={styles.welcomeTitle}>
            {mode === 'login' ? 'Selamat Datang Kembali' : 'Buat Akun Workspace Baru'}
          </Text>
          <Text style={styles.welcomeDesc}>
            {mode === 'login'
              ? 'Masuk menggunakan email terdaftar untuk mengakses dashboard, percakapan, dan manajemen kontak Anda.'
              : 'Daftarkan akun administrator atau customer service Anda untuk memulai otomatisasi WhatsApp.'}
          </Text>
        </View>

        {/* TABS SELECTOR */}
        <View style={styles.tabSelector}>
          <TouchableOpacity
            style={[styles.tabButton, mode === 'login' && styles.tabButtonActive]}
            activeOpacity={0.8}
            onPress={() => handleSwitchMode('login')}
            disabled={isLoading}
          >
            <Text style={[styles.tabButtonText, mode === 'login' && styles.tabButtonTextActive]}>
              Masuk
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, mode === 'register' && styles.tabButtonActive]}
            activeOpacity={0.8}
            onPress={() => handleSwitchMode('register')}
            disabled={isLoading}
          >
            <Text style={[styles.tabButtonText, mode === 'register' && styles.tabButtonTextActive]}>
              Daftar Baru
            </Text>
          </TouchableOpacity>
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

        {/* FORM INPUTS */}
        <View style={styles.formContainer}>
          {mode === 'register' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Nama Lengkap <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="misal: Ahmad Fauzi"
                placeholderTextColor={COLORS.textMuted}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                editable={!isLoading}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              Alamat Email <Text style={styles.requiredStar}>*</Text>
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="nama@organisasi.sch.id"
              placeholderTextColor={COLORS.textMuted}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>
                Kata Sandi <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <Text style={styles.showPasswordText}>
                  {showPassword ? 'Sembunyikan' : 'Perlihatkan'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="Minimal 6 karakter"
              placeholderTextColor={COLORS.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!isLoading}
            />
          </View>

          {mode === 'register' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Konfirmasi Kata Sandi <Text style={styles.requiredStar}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ulangi kata sandi"
                placeholderTextColor={COLORS.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                editable={!isLoading}
              />
            </View>
          )}

          {/* TOMBOL AKSI UTAMA */}
          <TouchableOpacity
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            activeOpacity={0.8}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.submitButtonText}>
                  {mode === 'login' ? 'Memverifikasi...' : 'Mendaftarkan...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === 'login' ? 'Masuk ke Workspace' : 'Buat Akun Sekarang'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* FOOTER INFO */}
        <View style={styles.authFooter}>
          <Text style={styles.authFooterText}>
            Dilindungi oleh Supabase Auth & PostgreSQL Row Level Security (RLS).
          </Text>
        </View>
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
  authCard: {
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
  authCardDesktop: {
    width: 460,
    maxWidth: '100%',
  },
  authCardMobile: {
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
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textDark,
    marginBottom: 6,
  },
  welcomeDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: '#EEF3F0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 7,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      web: {
        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
      },
      default: {
        elevation: 2,
      },
    }),
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    color: COLORS.forestDark,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 18,
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
    marginBottom: 18,
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
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textDark,
  },
  requiredStar: {
    color: '#DC2626',
  },
  showPasswordText: {
    fontSize: 12,
    color: COLORS.emerald,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#FAFCFB',
    borderWidth: 1,
    borderColor: '#D7DFDB',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textDark,
  },
  submitButton: {
    backgroundColor: COLORS.emerald,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
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
  authFooter: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F4F2',
    alignItems: 'center',
  },
  authFooterText: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
