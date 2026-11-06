import React, { useState, useMemo } from 'react';
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
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AppIcon, BACKGROUNDS, useTheme, ThemePalette } from '../theme';

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
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status fokus input untuk efek visual elegan
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    // 0. Validasi Konfigurasi Supabase
    if (!isSupabaseConfigured()) {
      setErrorMessage(
        'Layanan autentikasi Supabase belum dikonfigurasi. Pastikan EXPO_PUBLIC_SUPABASE_URL dan EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY telah diatur di environment hosting.'
      );
      return;
    }

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

  const { isDark, colors, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop ? styles.scrollContentDesktop : styles.scrollContentMobile,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.authCard, isDesktop ? styles.authCardDesktop : styles.authCardMobile, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}>
          {/* ======================================================== */}
          {/* HEADER / BANNER FUTURISTIK (DARK NAVY, TEAL & PARTICLES) */}
          {/* Tampil pada desktop/tablet, disembunyikan pada mobile HP  */}
          {/* ======================================================== */}
          {isDesktop ? (
            <View style={[styles.futuristicBanner, styles.bannerDesktop]}>
              {/* Latar Ambient Glow */}
              <View style={styles.ambientGlowCyan} />
              <View style={styles.ambientGlowTeal} />

              {/* Gelombang Digital Melengkung (Digital Signal Waves) */}
              <View style={styles.digitalWaveRing1} />
              <View style={styles.digitalWaveRing2} />
              <View style={styles.digitalWaveRing3} />

              {/* Partikel Bercahaya (Luminous Tech Particles) */}
              <View style={[styles.techParticle, { top: 16, right: 38, width: 4, height: 4, borderRadius: 2, backgroundColor: '#2DD4BF', opacity: 0.85 }]} />
              <View style={[styles.techParticle, { top: 32, right: 86, width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#38BDF8', opacity: 0.7 }]} />
              <View style={[styles.techParticle, { bottom: 20, right: 28, width: 3.5, height: 3.5, borderRadius: 1.75, backgroundColor: '#14B8A6', opacity: 0.75 }]} />
              <View style={[styles.techParticle, { top: 22, left: 24, width: 2.5, height: 2.5, borderRadius: 1.25, backgroundColor: '#67E8F9', opacity: 0.6 }]} />
              <View style={[styles.techParticle, { bottom: 18, left: 82, width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#2DD4BF', opacity: 0.65 }]} />

              {/* Indikator Gateway Aktif (Digital Pulse Frequency Bars) */}
              <View style={styles.pulseBarGroup}>
                <View style={[styles.pulseBar, { height: 10, backgroundColor: '#2DD4BF', opacity: 0.6 }]} />
                <View style={[styles.pulseBar, { height: 18, backgroundColor: '#06B6D4', opacity: 0.8 }]} />
                <View style={[styles.pulseBar, { height: 24, backgroundColor: '#14B8A6', opacity: 0.9 }]} />
                <View style={[styles.pulseBar, { height: 14, backgroundColor: '#2DD4BF', opacity: 0.7 }]} />
                <View style={[styles.pulseBar, { height: 20, backgroundColor: '#38BDF8', opacity: 0.85 }]} />
              </View>

              {/* Konten Utama Banner: Logo Resmi & Teks Brand */}
              <View style={styles.bannerBrandRow}>
                <View style={styles.logoBadgeContainer}>
                  <Image
                    source={require('../../assets/icon.png')}
                    style={styles.officialBrandLogo}
                    resizeMode="contain"
                    accessibilityLabel="WABiz Logo"
                  />
                </View>

                <View style={styles.brandTextGroup}>
                  <View style={styles.brandTitleRow}>
                    <Text style={styles.brandTitle}>WABiz</Text>
                    <View style={styles.brandTierBadge}>
                      <Text style={styles.brandTierText}>B2B SAAS</Text>
                    </View>
                  </View>
                  <Text style={styles.brandSubtitle}>WhatsApp Business Management</Text>
                </View>

                <TouchableOpacity
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    alignSelf: 'center',
                    marginLeft: 'auto',
                  }}
                  onPress={toggleTheme}
                  accessibilityLabel="Ganti Mode Tema"
                  accessibilityRole="button"
                  // @ts-ignore
                  title={isDark ? "Beralih ke Mode Terang" : "Beralih ke Mode Gelap"}
                >
                  <AppIcon name={isDark ? "sun" : "moon"} size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Header Mobile: Bersih, serasi dengan background surface card, safe area aware */
            <View style={[styles.mobileCleanBrandHeader, { borderBottomColor: colors.border, backgroundColor: colors.surfaceCard }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <Image
                  source={require('../../assets/icon.png')}
                  style={{ width: 34, height: 34, borderRadius: 8 }}
                  resizeMode="contain"
                  accessibilityLabel="WABiz Logo"
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.mobileCleanBrandTitle, { color: colors.textPrimary }]}>WABiz</Text>
                  <Text style={[styles.mobileCleanBrandSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                    WhatsApp Business Management
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.mobileCleanThemeBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
                onPress={toggleTheme}
                accessibilityLabel="Ganti Mode Tema"
                accessibilityRole="button"
              >
                <AppIcon name={isDark ? "sun" : "moon"} size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          {/* ======================================================== */}
          {/* BADAN FORMULIR (PUTIH BERSIH DENGAN ELEMEN MODERN)        */}
          {/* ======================================================== */}
          <View style={[styles.cardBody, isDesktop ? styles.cardBodyDesktop : styles.cardBodyMobile]}>
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

            {/* SEGMENTED CONTROL TABS */}
            <View style={styles.tabSelector}>
              <TouchableOpacity
                style={[styles.tabButton, mode === 'login' && styles.tabButtonActive]}
                activeOpacity={0.8}
                onPress={() => handleSwitchMode('login')}
                disabled={isLoading}
                accessibilityRole="tab"
                accessibilityLabel="Masuk"
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
                accessibilityRole="tab"
                accessibilityLabel="Daftar Baru"
              >
                <Text style={[styles.tabButtonText, mode === 'register' && styles.tabButtonTextActive]}>
                  Daftar Baru
                </Text>
              </TouchableOpacity>
            </View>

            {/* NOTIFIKASI ERROR / SUKSES */}
            {!isSupabaseConfigured() && (
              <View style={[styles.errorBanner, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <View style={[styles.errorIconCircle, { backgroundColor: '#D97706' }]}>
                  <AppIcon name="alert" size={13} color="#FFFFFF" />
                </View>
                <Text style={[styles.errorBannerText, { color: '#92400E' }]}>
                  Konfigurasi Supabase Cloud belum diatur pada deployment ini. Masuk atau pendaftaran membutuhkan EXPO_PUBLIC_SUPABASE_URL dan EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
                </Text>
              </View>
            )}

            {errorMessage && (
              <View style={styles.errorBanner}>
                <View style={styles.errorIconCircle}>
                  <AppIcon name="alert" size={13} color="#FFFFFF" />
                </View>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
              </View>
            )}

            {successMessage && (
              <View style={styles.successBanner}>
                <View style={styles.successIconCircle}>
                  <AppIcon name="check" size={13} color="#FFFFFF" />
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
                  <View
                    style={[
                      styles.inputFieldContainer,
                      focusedField === 'fullName' && styles.inputFieldContainerFocused,
                    ]}
                    // @ts-ignore
                    dataSet={{ inputContainer: 'true' }}
                  >
                    <View style={styles.inputIconBox}>
                      <AppIcon
                        name="user"
                        size={17}
                        color={focusedField === 'fullName' ? '#0D9488' : '#94A3B8'}
                      />
                    </View>
                    <TextInput
                      style={styles.textInput}
                      placeholder="misal: Ahmad Fauzi"
                      placeholderTextColor={colors.textPlaceholder}
                      value={fullName}
                      onChangeText={setFullName}
                      onFocus={() => setFocusedField('fullName')}
                      onBlur={() => setFocusedField(null)}
                      autoCapitalize="words"
                      returnKeyType="next"
                      editable={!isLoading}
                      // @ts-ignore
                      dataSet={{ embedded: 'true' }}
                    />
                  </View>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Alamat Email <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputFieldContainer,
                    focusedField === 'email' && styles.inputFieldContainerFocused,
                  ]}
                  // @ts-ignore
                  dataSet={{ inputContainer: 'true' }}
                >
                  <View style={styles.inputIconBox}>
                    <AppIcon
                      name="mail"
                      size={17}
                      color={focusedField === 'email' ? '#0D9488' : '#94A3B8'}
                    />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="nama@organisasi.sch.id"
                    placeholderTextColor={colors.textPlaceholder}
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!isLoading}
                    // @ts-ignore
                    dataSet={{ embedded: 'true' }}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Kata Sandi <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputFieldContainer,
                    focusedField === 'password' && styles.inputFieldContainerFocused,
                  ]}
                  // @ts-ignore
                  dataSet={{ inputContainer: 'true' }}
                >
                  <View style={styles.inputIconBox}>
                    <AppIcon
                      name="lock"
                      size={17}
                      color={focusedField === 'password' ? '#0D9488' : '#94A3B8'}
                    />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Minimal 6 karakter"
                    placeholderTextColor={colors.textPlaceholder}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType={mode === 'login' ? 'go' : 'next'}
                    onSubmitEditing={mode === 'login' ? handleSubmit : undefined}
                    editable={!isLoading}
                    // @ts-ignore
                    dataSet={{ embedded: 'true' }}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={(e) => {
                      // @ts-ignore
                      e?.preventDefault?.();
                      setShowPassword((prev) => !prev);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  >
                    <AppIcon
                      name={showPassword ? 'eye' : 'eye-off'}
                      size={18}
                      color={showPassword ? '#0D9488' : '#94A3B8'}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {mode === 'register' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Konfirmasi Kata Sandi <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  <View
                    style={[
                      styles.inputFieldContainer,
                      focusedField === 'confirmPassword' && styles.inputFieldContainerFocused,
                    ]}
                    // @ts-ignore
                    dataSet={{ inputContainer: 'true' }}
                  >
                    <View style={styles.inputIconBox}>
                      <AppIcon
                        name="lock"
                        size={17}
                        color={focusedField === 'confirmPassword' ? '#0D9488' : '#94A3B8'}
                      />
                    </View>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Ulangi kata sandi"
                      placeholderTextColor={colors.textPlaceholder}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => setFocusedField('confirmPassword')}
                      onBlur={() => setFocusedField(null)}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      returnKeyType="go"
                      onSubmitEditing={handleSubmit}
                      editable={!isLoading}
                      // @ts-ignore
                      dataSet={{ embedded: 'true' }}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={(e) => {
                        // @ts-ignore
                        e?.preventDefault?.();
                        setShowConfirmPassword((prev) => !prev);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={showConfirmPassword ? 'Sembunyikan konfirmasi kata sandi' : 'Tampilkan konfirmasi kata sandi'}
                    >
                      <AppIcon
                        name={showConfirmPassword ? 'eye' : 'eye-off'}
                        size={18}
                        color={showConfirmPassword ? '#0D9488' : '#94A3B8'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* TOMBOL AKSI UTAMA (TEAL PREMIUM BERKONTRAS TINGGI) */}
              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                activeOpacity={0.85}
                onPress={handleSubmit}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel={mode === 'login' ? 'Masuk' : 'Buat Akun Sekarang'}
              >
                {isLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>
                      {mode === 'login' ? 'Memverifikasi...' : 'Mendaftarkan...'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.submitBtnContentRow}>
                    <Text style={styles.submitButtonText}>
                      {mode === 'login' ? 'Masuk' : 'Buat Akun Sekarang'}
                    </Text>
                    <AppIcon name="chevron-right" size={15} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* FOOTER KEAMANAN DENGAN SUPABASE AUTH & RLS */}
            <View style={styles.authFooter}>
              <View style={styles.securityBadgeRow}>
                <View style={styles.shieldIconPill}>
                  <AppIcon name="shield" size={13} color="#0D9488" />
                </View>
                <Text style={styles.securityBadgeTitle}>Keamanan Tingkat Enterprise</Text>
              </View>
              <Text style={styles.authFooterText}>
                Dilindungi oleh <Text style={styles.securityHighlight}>Supabase Auth</Text> & Enkripsi <Text style={styles.securityHighlight}>Row Level Security (RLS)</Text> PostgreSQL.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ==========================================
// STYLESHEET DESAIN MODERN SAAS
// ==========================================
const createStyles = (colors: ThemePalette) => StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  scrollContentDesktop: {
    justifyContent: 'center',
    minHeight: '100%',
    padding: 32,
  },
  scrollContentMobile: {
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 24,
  },
  authCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      web: {
        boxShadow: '0 25px 50px -12px rgba(2, 6, 23, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      },
      default: {
        elevation: 8,
      },
    }),
  },
  authCardDesktop: {
    width: 480,
    maxWidth: '100%',
  },
  authCardMobile: {
    width: '100%',
    borderRadius: 0,
    borderWidth: 0,
    minHeight: '100%',
    flex: 1,
  },
  mobileCleanBrandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    paddingTop: (Platform.select<any>({
      web: 'max(36px, env(safe-area-inset-top, 36px))',
      default: 36,
    })),
  },
  mobileCleanBrandTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  mobileCleanBrandSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  mobileCleanThemeBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ==========================================
  // BANNER FUTURISTIK HEADER
  // ==========================================
  futuristicBanner: {
    backgroundColor: '#08101E',
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(45, 212, 191, 0.25)',
  },
  bannerDesktop: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 22,
  },
  bannerMobile: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
  },
  ambientGlowCyan: {
    position: 'absolute',
    top: -50,
    right: -30,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(6, 182, 212, 0.16)',
  },
  ambientGlowTeal: {
    position: 'absolute',
    bottom: -40,
    left: -20,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(13, 148, 136, 0.18)',
  },
  digitalWaveRing1: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.14)',
  },
  digitalWaveRing2: {
    position: 'absolute',
    right: -75,
    top: -75,
    width: 290,
    height: 290,
    borderRadius: 145,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.08)',
  },
  digitalWaveRing3: {
    position: 'absolute',
    right: -110,
    top: -110,
    width: 360,
    height: 360,
    borderRadius: 180,
    borderWidth: 1,
    borderColor: 'rgba(14, 165, 233, 0.05)',
  },
  techParticle: {
    position: 'absolute',
  },
  pulseBarGroup: {
    position: 'absolute',
    right: 22,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  pulseBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  bannerBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logoBadgeContainer: {
    width: 50,
    height: 50,
    borderRadius: 13,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(45, 212, 191, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(6, 182, 212, 0.25)',
      },
      default: {
        elevation: 3,
      },
    }),
  },
  officialBrandLogo: {
    width: 44,
    height: 44,
    borderRadius: 10,
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
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  brandTierBadge: {
    backgroundColor: 'rgba(20, 184, 166, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.45)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  brandTierText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2DD4BF',
    letterSpacing: 0.8,
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },

  // ==========================================
  // BADAN KARTU
  // ==========================================
  cardBody: {
    backgroundColor: colors.surfaceCard,
  },
  cardBodyDesktop: {
    padding: 30,
  },
  cardBodyMobile: {
    padding: 20,
  },
  welcomeBox: {
    marginBottom: 18,
  },
  welcomeTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  welcomeDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },

  // ==========================================
  // SEGMENTED CONTROL TABS
  // ==========================================
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 12,
    padding: 4,
    marginBottom: 18,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: colors.surfaceCard,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
      },
      default: {
        elevation: 2,
      },
    }),
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },

  // ==========================================
  // NOTIFIKASI BANNER
  // ==========================================
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
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
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
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

  // ==========================================
  // FORM & INPUT
  // ==========================================
  formContainer: {
    gap: 15,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  requiredStar: {
    color: '#DC2626',
  },
  inputFieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1.2,
    borderColor: colors.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    height: 46,
  },
  inputFieldContainerFocused: {
    borderColor: '#0D9488',
    backgroundColor: colors.surfaceCard,
    ...Platform.select({
      web: {
        boxShadow: '0 0 0 3px rgba(13, 148, 136, 0.12)',
      },
    }),
  },
  inputIconBox: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    height: '100%',
    paddingVertical: 0,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
        outlineWidth: 0,
      } as any,
    }),
  },
  eyeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      } as any,
    }),
  },

  // ==========================================
  // TOMBOL AKSI UTAMA
  // ==========================================
  submitButton: {
    backgroundColor: '#0D9488',
    borderWidth: 1,
    borderColor: '#14B8A6',
    borderRadius: 11,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 20px -3px rgba(13, 148, 136, 0.42)',
      },
      default: {
        elevation: 4,
      },
    }),
  },
  submitButtonDisabled: {
    opacity: 0.65,
  },
  submitBtnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ==========================================
  // FOOTER KEAMANAN
  // ==========================================
  authFooter: {
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  securityBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  shieldIconPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityBadgeTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.2,
  },
  authFooterText: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  securityHighlight: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
