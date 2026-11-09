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
  Modal,
} from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AppIcon, useTheme, ThemePalette } from '../theme';

// ==========================================
// TIPE & PROPS AUTHENTICATION VIEW
// ==========================================
export type AuthMode = 'login' | 'register';

export interface AuthViewProps {
  initialMode?: AuthMode;
  onSuccess?: () => void;
}

// ==========================================
// LOGO SUPABASE RESMI
// ==========================================
function SupabaseBrandMark({ isDark }: { isDark: boolean }) {
  if (Platform.OS === 'web') {
    return React.createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '7px',
          marginTop: '10px',
        },
      },
      React.createElement(
        'svg',
        {
          width: 22,
          height: 22,
          viewBox: '0 0 24 24',
          fill: 'none',
          style: { flexShrink: 0 },
        },
        React.createElement('path', {
          d: 'M21.362 9.354H12V.396a.396.396 0 0 0-.716-.233L.343 14.288a.792.792 0 0 0 .616 1.284H12v8.958a.396.396 0 0 0 .716.233l10.94-14.125a.792.792 0 0 0-.616-1.284z',
          fill: '#3ECF8E',
        })
      ),
      React.createElement(
        'span',
        {
          style: {
            fontSize: '17px',
            fontWeight: '800',
            letterSpacing: '-0.3px',
            color: isDark ? '#F1F5F9' : '#0F172A',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          },
        },
        'supabase'
      )
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 10 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 4,
          backgroundColor: '#3ECF8E',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon name="shield" size={12} color="#FFFFFF" />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '800', letterSpacing: -0.3, color: isDark ? '#F1F5F9' : '#0F172A' }}>
        supabase
      </Text>
    </View>
  );
}

// ==========================================
// ELEMEN DEKORATIF LATAR BELAKANG (GELOMBANG & AMBIENT GLOW)
// ==========================================
function BackgroundDecorations({ isDark }: { isDark: boolean }) {
  const waveStrokeTopRight = isDark ? 'rgba(45, 212, 191, 0.22)' : 'rgba(14, 165, 233, 0.35)';
  const waveStrokeBottomLeft = isDark ? 'rgba(20, 184, 166, 0.25)' : 'rgba(20, 184, 166, 0.4)';
  const waveStrokeTopLeft = isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(56, 189, 248, 0.3)';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Ambient Radial Glows */}
      <View
        style={[
          stylesNative.ambientGlow,
          {
            top: -90,
            right: -70,
            width: 320,
            height: 320,
            borderRadius: 160,
            backgroundColor: isDark ? 'rgba(6, 182, 212, 0.16)' : 'rgba(186, 230, 253, 0.65)',
          },
        ]}
      />
      <View
        style={[
          stylesNative.ambientGlow,
          {
            bottom: -110,
            left: -80,
            width: 340,
            height: 340,
            borderRadius: 170,
            backgroundColor: isDark ? 'rgba(13, 148, 136, 0.18)' : 'rgba(204, 251, 241, 0.75)',
          },
        ]}
      />
      <View
        style={[
          stylesNative.ambientGlow,
          {
            top: 60,
            left: -80,
            width: 220,
            height: 220,
            borderRadius: 110,
            backgroundColor: isDark ? 'rgba(20, 184, 166, 0.12)' : 'rgba(224, 242, 254, 0.5)',
          },
        ]}
      />

      {/* Gelombang Vektor Halus (SVG di Web, Rings di Native) */}
      {Platform.OS === 'web' ? (
        <>
          {/* Top Right Flowing Waves */}
          {React.createElement(
            'div',
            {
              style: {
                position: 'absolute',
                top: 0,
                right: 0,
                pointerEvents: 'none',
                overflow: 'hidden',
                width: 280,
                height: 280,
              },
            },
            React.createElement(
              'svg',
              { width: 280, height: 280, viewBox: '0 0 280 280', fill: 'none' },
              React.createElement('path', { d: 'M50 0 C130 50, 210 130, 280 240', stroke: waveStrokeTopRight, strokeWidth: 1 }),
              React.createElement('path', { d: 'M80 0 C150 60, 220 140, 280 210', stroke: waveStrokeTopRight, strokeWidth: 1, opacity: 0.85 }),
              React.createElement('path', { d: 'M110 0 C170 70, 230 150, 280 180', stroke: waveStrokeTopRight, strokeWidth: 1, opacity: 0.7 }),
              React.createElement('path', { d: 'M140 0 C190 80, 240 160, 280 150', stroke: waveStrokeTopRight, strokeWidth: 1, opacity: 0.55 }),
              React.createElement('path', { d: 'M170 0 C210 90, 250 170, 280 120', stroke: waveStrokeTopRight, strokeWidth: 1, opacity: 0.4 })
            )
          )}

          {/* Bottom Left Flowing Waves */}
          {React.createElement(
            'div',
            {
              style: {
                position: 'absolute',
                bottom: 0,
                left: 0,
                pointerEvents: 'none',
                overflow: 'hidden',
                width: 280,
                height: 280,
              },
            },
            React.createElement(
              'svg',
              { width: 280, height: 280, viewBox: '0 0 280 280', fill: 'none' },
              React.createElement('path', { d: 'M0 50 C50 130, 130 210, 240 280', stroke: waveStrokeBottomLeft, strokeWidth: 1 }),
              React.createElement('path', { d: 'M0 80 C60 150, 140 220, 210 280', stroke: waveStrokeBottomLeft, strokeWidth: 1, opacity: 0.85 }),
              React.createElement('path', { d: 'M0 110 C70 170, 150 230, 180 280', stroke: waveStrokeBottomLeft, strokeWidth: 1, opacity: 0.7 }),
              React.createElement('path', { d: 'M0 140 C80 190, 160 240, 150 280', stroke: waveStrokeBottomLeft, strokeWidth: 1, opacity: 0.55 }),
              React.createElement('path', { d: 'M0 170 C90 210, 170 250, 120 280', stroke: waveStrokeBottomLeft, strokeWidth: 1, opacity: 0.4 })
            )
          )}

          {/* Top Left Delicate Curves */}
          {React.createElement(
            'div',
            {
              style: {
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                overflow: 'hidden',
                width: 200,
                height: 200,
              },
            },
            React.createElement(
              'svg',
              { width: 200, height: 200, viewBox: '0 0 200 200', fill: 'none' },
              React.createElement('path', { d: 'M0 140 C60 120, 120 60, 140 0', stroke: waveStrokeTopLeft, strokeWidth: 1, opacity: 0.75 }),
              React.createElement('path', { d: 'M0 100 C50 80, 80 50, 100 0', stroke: waveStrokeTopLeft, strokeWidth: 1, opacity: 0.55 }),
              React.createElement('path', { d: 'M0 60 C30 40, 40 30, 60 0', stroke: waveStrokeTopLeft, strokeWidth: 1, opacity: 0.4 })
            )
          )}
        </>
      ) : (
        <>
          {/* Top Right Rings (Native Android/iOS fallback) */}
          <View style={[stylesNative.waveRing, { right: -50, top: -50, width: 240, height: 240, borderRadius: 120, borderColor: waveStrokeTopRight }]} />
          <View style={[stylesNative.waveRing, { right: -85, top: -85, width: 310, height: 310, borderRadius: 155, borderColor: waveStrokeTopRight, opacity: 0.7 }]} />
          <View style={[stylesNative.waveRing, { right: -120, top: -120, width: 380, height: 380, borderRadius: 190, borderColor: waveStrokeTopRight, opacity: 0.45 }]} />

          {/* Bottom Left Rings */}
          <View style={[stylesNative.waveRing, { left: -50, bottom: -50, width: 240, height: 240, borderRadius: 120, borderColor: waveStrokeBottomLeft }]} />
          <View style={[stylesNative.waveRing, { left: -85, bottom: -85, width: 310, height: 310, borderRadius: 155, borderColor: waveStrokeBottomLeft, opacity: 0.7 }]} />
          <View style={[stylesNative.waveRing, { left: -120, bottom: -120, width: 380, height: 380, borderRadius: 190, borderColor: waveStrokeBottomLeft, opacity: 0.45 }]} />
        </>
      )}
    </View>
  );
}

const stylesNative = StyleSheet.create({
  ambientGlow: {
    position: 'absolute',
  },
  waveRing: {
    position: 'absolute',
    borderWidth: 1,
  },
});

// ==========================================
// KOMPONEN UTAMA AUTH VIEW
// ==========================================
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

  // Status fokus input untuk efek visual cincin cahaya
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // State untuk Modal "Lupa Kata Sandi?"
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordStatus, setForgotPasswordStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const { isDark, colors, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

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
          setSuccessMessage('Pendaftaran berhasil! Sedang masuk ke workspace...');
          if (onSuccess) onSuccess();
        } else if (data.user) {
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

  // Handler Lupa Kata Sandi
  const handleSendPasswordReset = async () => {
    setForgotPasswordStatus(null);
    const cleanEmail = forgotPasswordEmail.trim();
    if (!cleanEmail) {
      setForgotPasswordStatus({ type: 'error', message: 'Silakan masukkan alamat email Anda.' });
      return;
    }

    setForgotPasswordLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) {
        setForgotPasswordStatus({ type: 'error', message: translateAuthError(error.message) });
      } else {
        setForgotPasswordStatus({
          type: 'success',
          message: 'Tautan pemulihan kata sandi telah dikirim ke email Anda. Silakan periksa kotak masuk/spam.',
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal mengirim email reset kata sandi.';
      setForgotPasswordStatus({ type: 'error', message: msg });
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Background Ambient Gradient & Waves */}
      <BackgroundDecorations isDark={isDark} />

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
        <View style={[styles.authCard, isDesktop ? styles.authCardDesktop : styles.authCardMobile]}>
          {/* ======================================================== */}
          {/* TOP BAR / BRAND HEADER                                   */}
          {/* ======================================================== */}
          <View style={styles.topBrandBar}>
            <View style={styles.brandLeftGroup}>
              <View style={styles.appLogoContainer}>
                <Image
                  source={require('../../assets/android-icon-foreground.png')}
                  style={styles.appLogoImage}
                  resizeMode="contain"
                  accessibilityLabel="WABiz Logo"
                />
              </View>
              <View style={styles.brandTitles}>
                <Text style={styles.brandTitleText}>WABiz</Text>
                <Text style={styles.brandSubtitleText} numberOfLines={1}>
                  WhatsApp Business Management
                </Text>
              </View>
            </View>

            {/* Floating Glassmorphism Theme Panel */}
            <View style={styles.topRightCornerPanel}>
              <TouchableOpacity
                style={styles.floatingGlassThemeBtn}
                onPress={toggleTheme}
                accessibilityLabel="Ganti Mode Tema"
                accessibilityRole="button"
                activeOpacity={0.8}
              >
                <AppIcon name={isDark ? 'sun' : 'moon'} size={18} color={isDark ? '#2DD4BF' : '#0D9488'} />
              </TouchableOpacity>
            </View>
          </View>

          {/* ======================================================== */}
          {/* KONTEN UTAMA FORMULIR                                    */}
          {/* ======================================================== */}
          <View style={styles.contentBody}>
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
                  >
                    <View style={styles.inputIconBox}>
                      <AppIcon
                        name="user"
                        size={17}
                        color={focusedField === 'fullName' ? '#0D9488' : '#0D9488'}
                      />
                    </View>
                    <TextInput
                      style={styles.textInput}
                      placeholder="misal: Ahmad Fauzi"
                      placeholderTextColor="#94A3B8"
                      value={fullName}
                      onChangeText={setFullName}
                      onFocus={() => setFocusedField('fullName')}
                      onBlur={() => setFocusedField(null)}
                      autoCapitalize="words"
                      returnKeyType="next"
                      editable={!isLoading}
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
                >
                  <View style={styles.inputIconBox}>
                    <AppIcon
                      name="mail"
                      size={17}
                      color="#0D9488"
                    />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="nama@organisasi.sch.id"
                    placeholderTextColor="#94A3B8"
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    editable={!isLoading}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.labelWithLinkRow}>
                  <Text style={styles.inputLabel}>
                    Kata Sandi <Text style={styles.requiredStar}>*</Text>
                  </Text>
                  {mode === 'login' && (
                    <TouchableOpacity
                      onPress={() => {
                        setForgotPasswordEmail(email);
                        setForgotPasswordStatus(null);
                        setShowForgotPasswordModal(true);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                    >
                      <Text style={styles.forgotPasswordLink}>Lupa Kata Sandi?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View
                  style={[
                    styles.inputFieldContainer,
                    focusedField === 'password' && styles.inputFieldContainerFocused,
                  ]}
                >
                  <View style={styles.inputIconBox}>
                    <AppIcon
                      name="lock"
                      size={17}
                      color="#0D9488"
                    />
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Minimal 6 karakter"
                    placeholderTextColor="#94A3B8"
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    returnKeyType={mode === 'login' ? 'go' : 'next'}
                    onSubmitEditing={mode === 'login' ? handleSubmit : undefined}
                    editable={!isLoading}
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
                      color={showPassword ? '#0D9488' : '#64748B'}
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
                  >
                    <View style={styles.inputIconBox}>
                      <AppIcon
                        name="lock"
                        size={17}
                        color="#0D9488"
                      />
                    </View>
                    <TextInput
                      style={styles.textInput}
                      placeholder="Ulangi kata sandi"
                      placeholderTextColor="#94A3B8"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      onFocus={() => setFocusedField('confirmPassword')}
                      onBlur={() => setFocusedField(null)}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      returnKeyType="go"
                      onSubmitEditing={handleSubmit}
                      editable={!isLoading}
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
                        color={showConfirmPassword ? '#0D9488' : '#64748B'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* TOMBOL AKSI UTAMA ("Masuk >") */}
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
                    <AppIcon name="chevron-right" size={16} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* ======================================================== */}
            {/* FOOTER KEAMANAN & SUPABASE BRANDING                      */}
            {/* ======================================================== */}
            <View style={styles.authFooter}>
              <View style={styles.securityBadgeRow}>
                <View style={styles.shieldIconPill}>
                  <AppIcon name="shield" size={13} color="#059669" />
                </View>
                <Text style={styles.securityBadgeTitle}>Keamanan Tingkat Enterprise</Text>
              </View>
              <Text style={styles.authFooterText}>
                Dilindungi oleh <Text style={styles.securityHighlight}>Supabase Auth</Text> & Enkripsi <Text style={styles.securityHighlight}>Row Level Security (RLS)</Text> PostgreSQL.
              </Text>

              {/* Logo Supabase */}
              <SupabaseBrandMark isDark={isDark} />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ======================================================== */}
      {/* MODAL LUPA KATA SANDI                                    */}
      {/* ======================================================== */}
      <Modal
        visible={showForgotPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowForgotPasswordModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderIcon}>
                <AppIcon name="lock" size={18} color="#0D9488" />
              </View>
              <Text style={styles.modalTitle}>Pemulihan Kata Sandi</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Masukkan alamat email akun WABiz Anda. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi Anda.
            </Text>

            {forgotPasswordStatus && (
              <View
                style={[
                  styles.modalStatusBox,
                  forgotPasswordStatus.type === 'error' ? styles.modalStatusBoxError : styles.modalStatusBoxSuccess,
                ]}
              >
                <Text
                  style={[
                    styles.modalStatusText,
                    forgotPasswordStatus.type === 'error' ? styles.modalStatusTextError : styles.modalStatusTextSuccess,
                  ]}
                >
                  {forgotPasswordStatus.message}
                </Text>
              </View>
            )}

            <View style={[styles.inputFieldContainer, { marginTop: 14 }]}>
              <View style={styles.inputIconBox}>
                <AppIcon name="mail" size={17} color="#0D9488" />
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="nama@organisasi.sch.id"
                placeholderTextColor="#94A3B8"
                value={forgotPasswordEmail}
                onChangeText={setForgotPasswordEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!forgotPasswordLoading}
              />
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowForgotPasswordModal(false)}
                disabled={forgotPasswordLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, forgotPasswordLoading && { opacity: 0.6 }]}
                onPress={handleSendPasswordReset}
                disabled={forgotPasswordLoading}
                activeOpacity={0.85}
              >
                {forgotPasswordLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Kirim Tautan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ==========================================
// STYLESHEET DESAIN SAAS MODERN
// ==========================================
const createStyles = (colors: ThemePalette, isDark: boolean) => StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
    backgroundColor: isDark ? '#070E1A' : '#F0F9FF',
    position: 'relative',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
    paddingBottom: 28,
  },
  authCard: {
    overflow: 'hidden',
    position: 'relative',
    zIndex: 2,
  },
  authCardDesktop: {
    width: 480,
    maxWidth: '100%',
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.92)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.9)',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 50px -10px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.6)',
        backdropFilter: 'blur(20px)',
      } as any,
      default: {
        elevation: 8,
      },
    }),
  },
  authCardMobile: {
    width: '100%',
    backgroundColor: 'transparent',
    minHeight: '100%',
    flex: 1,
  },

  // ==========================================
  // TOP BRAND BAR
  // ==========================================
  topBrandBar: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: Platform.select<any>({
      web: 'max(28px, env(safe-area-inset-top, 28px))',
      default: 28,
    }),
    paddingBottom: 16,
    minHeight: 88,
  },
  brandLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
    marginRight: 64,
  },
  appLogoContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: isDark ? '#0F172A' : '#0B132B',
    borderWidth: 1.5,
    borderColor: 'rgba(45, 212, 191, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(6, 182, 212, 0.22)',
      } as any,
      default: {
        elevation: 3,
      },
    }),
  },
  appLogoImage: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
  brandTitles: {
    flex: 1,
    minWidth: 0,
  },
  brandTitleText: {
    fontSize: 20,
    fontWeight: '800',
    color: isDark ? '#FFFFFF' : '#0F172A',
    letterSpacing: -0.4,
  },
  brandSubtitleText: {
    fontSize: 12,
    fontWeight: '500',
    color: isDark ? '#94A3B8' : '#64748B',
    marginTop: 1,
  },
  topRightCornerPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 76,
    height: 88,
    borderBottomLeftRadius: 28,
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.45)' : 'rgba(255, 255, 255, 0.45)',
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.select<any>({
      web: 'max(14px, env(safe-area-inset-top, 14px))',
      default: 14,
    }),
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      } as any,
      default: {
        elevation: 2,
      },
    }),
    zIndex: 10,
  },
  floatingGlassThemeBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(45, 212, 191, 0.4)' : '#2DD4BF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: isDark
          ? '0 0 16px rgba(45, 212, 191, 0.35)'
          : '0 0 16px rgba(45, 212, 191, 0.5)',
      } as any,
      default: {
        elevation: 3,
      },
    }),
  },

  // ==========================================
  // BADAN KONTEN
  // ==========================================
  contentBody: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 24,
  },
  welcomeBox: {
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: isDark ? '#F8FAFC' : '#0F172A',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  welcomeDesc: {
    fontSize: 13.5,
    color: isDark ? '#94A3B8' : '#475569',
    lineHeight: 20,
  },

  // ==========================================
  // SEGMENTED CONTROL TABS
  // ==========================================
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(226, 232, 240, 0.8)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    height: 48,
    alignItems: 'center',
  },
  tabButton: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: isDark ? '#334155' : '#FFFFFF',
    ...Platform.select({
      web: {
        boxShadow: '0 3px 10px rgba(15, 23, 42, 0.08)',
      } as any,
      default: {
        elevation: 2,
      },
    }),
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: isDark ? '#94A3B8' : '#64748B',
  },
  tabButtonTextActive: {
    color: isDark ? '#FFFFFF' : '#0F172A',
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
    borderRadius: 12,
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
    borderRadius: 12,
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
    gap: 16,
  },
  inputGroup: {
    gap: 6,
  },
  labelWithLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: isDark ? '#F1F5F9' : '#0F172A',
  },
  requiredStar: {
    color: '#DC2626',
  },
  forgotPasswordLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0D9488',
  },
  inputFieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
    borderWidth: 1.5,
    borderColor: isDark ? '#334155' : '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 52,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
        transition: 'all 0.15s ease-in-out',
      } as any,
      default: {
        elevation: 1,
      },
    }),
  },
  inputFieldContainerFocused: {
    borderColor: '#2DD4BF',
    backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
    ...Platform.select({
      web: {
        boxShadow: '0 0 0 3px rgba(45, 212, 191, 0.3)',
      } as any,
    }),
  },
  inputIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: isDark ? 'rgba(45, 212, 191, 0.16)' : 'rgba(13, 148, 136, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    ...Platform.select({
      web: {
        boxShadow: isDark
          ? '0 0 10px rgba(45, 212, 191, 0.25)'
          : '0 0 10px rgba(13, 148, 136, 0.15)',
      } as any,
    }),
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: isDark ? '#F8FAFC' : '#0F172A',
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
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...Platform.select({
      web: {
        background: 'linear-gradient(135deg, #0D9488 0%, #059669 100%)',
        boxShadow: '0 10px 24px -4px rgba(13, 148, 136, 0.45)',
        cursor: 'pointer',
      } as any,
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
    gap: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ==========================================
  // FOOTER KEAMANAN & SUPABASE
  // ==========================================
  authFooter: {
    marginTop: 26,
    paddingTop: 18,
    alignItems: 'center',
  },
  securityBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: isDark ? 'rgba(6, 78, 59, 0.45)' : 'rgba(209, 250, 229, 0.75)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(52, 211, 153, 0.3)' : '#A7F3D0',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 8,
  },
  shieldIconPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityBadgeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: isDark ? '#34D399' : '#065F46',
    letterSpacing: 0.2,
  },
  authFooterText: {
    fontSize: 11.5,
    color: isDark ? '#94A3B8' : '#475569',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  securityHighlight: {
    fontWeight: '700',
    color: isDark ? '#F1F5F9' : '#0F172A',
  },

  // ==========================================
  // MODAL LUPA KATA SANDI
  // ==========================================
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(8px)',
      } as any,
    }),
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25)',
      } as any,
      default: {
        elevation: 8,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  modalHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(13, 148, 136, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: isDark ? '#F8FAFC' : '#0F172A',
  },
  modalSubtitle: {
    fontSize: 13,
    color: isDark ? '#94A3B8' : '#64748B',
    lineHeight: 19,
  },
  modalStatusBox: {
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
  },
  modalStatusBoxError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  modalStatusBoxSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  modalStatusText: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  modalStatusTextError: {
    color: '#991B1B',
  },
  modalStatusTextSuccess: {
    color: '#065F46',
  },
  modalBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 18,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalCancelBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: isDark ? '#94A3B8' : '#64748B',
  },
  modalSubmitBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
