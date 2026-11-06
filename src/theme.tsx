import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { View, Platform, Appearance, ColorSchemeName } from 'react-native';

// ==========================================
// TIPE & PALET TEMA (LIGHT & DARK MODE)
// ==========================================
export type ThemeMode = 'light' | 'dark' | 'system';
export type ActiveTheme = 'light' | 'dark';

export interface ThemePalette {
  isDark: boolean;
  background: string;         // Light: #F6F8FB, Dark: #000000 (Pure Black)
  surface: string;            // Light: #FFFFFF, Dark: #101010
  surfaceSecondary: string;   // Light: #F0F4F7, Dark: #181818
  surfaceCard: string;        // Light: #FFFFFF, Dark: #111111
  surfaceElevated: string;    // Light: #FFFFFF, Dark: #181818
  primary: string;            // Light: #172033, Dark: #FFFFFF
  textPrimary: string;        // Light: #172033, Dark: #FFFFFF
  textSecondary: string;      // Light: #667085, Dark: #C0C0C0
  textMuted: string;          // Light: #64748B, Dark: #A0A0A0
  textPlaceholder: string;    // Light: #8493A7, Dark: #909090
  accent: string;             // Light: #0F8B83, Dark: #2DD4BF
  accentHover: string;        // Light: #0C726B, Dark: #14B8A6
  accentSubtle: string;       // Light: #E6F4F2, Dark: rgba(45, 212, 191, 0.14)
  accentBorder: string;       // Light: #BCE3DF, Dark: rgba(45, 212, 191, 0.3)
  border: string;             // Light: #E7ECF2, Dark: #303030
  borderStrong: string;       // Light: #D0D5DD, Dark: #424242
  inputBg: string;            // Light: #FFFFFF, Dark: #181818
  inputBorder: string;        // Light: #E7ECF2, Dark: #303030
  sidebarBg: string;          // Light: #0F172A, Dark: #000000
  sidebarHeader: string;      // Light: #0A1120, Dark: #000000
  headerBg: string;           // Light: #FFFFFF, Dark: #000000
  bottomNavBg: string;        // Light: #FFFFFF, Dark: #000000
  modalBg: string;            // Light: #FFFFFF, Dark: #101010
  modalOverlay: string;       // Light: rgba(15, 23, 42, 0.65), Dark: rgba(0, 0, 0, 0.85)
  chatCanvas: string;         // Light: #F0F4F7, Dark: #000000
  chatCustomerBubble: string; // Light: #FFFFFF, Dark: #181818
  chatCsBubble: string;       // Light: #E6F4F2, Dark: rgba(45, 212, 191, 0.18)
  chatAiBubble: string;       // Light: #F2F4F7, Dark: rgba(99, 102, 241, 0.18)
  warningBg: string;          // Light: #FFFBEB, Dark: rgba(245, 158, 11, 0.12)
  warningBorder: string;      // Light: #FDE68A, Dark: rgba(245, 158, 11, 0.32)
  warningText: string;        // Light: #B45309, Dark: #FCD34D
  dangerBg: string;           // Light: #FEF2F2, Dark: rgba(239, 68, 68, 0.14)
  dangerBorder: string;       // Light: #FECACA, Dark: rgba(239, 68, 68, 0.32)
  dangerText: string;         // Light: #B91C1C, Dark: #FCA5A5
  successBg: string;          // Light: #ECFDF5, Dark: rgba(16, 185, 129, 0.12)
  successBorder: string;      // Light: #A7F3D0, Dark: rgba(16, 185, 129, 0.32)
  successText: string;        // Light: #047857, Dark: #6EE7B7
  infoBg: string;             // Light: #F0F9FF, Dark: rgba(56, 189, 248, 0.12)
  infoBorder: string;         // Light: #BAE6FD, Dark: rgba(56, 189, 248, 0.3)
  infoText: string;           // Light: #0284C7, Dark: #38BDF8
  purpleBg: string;           // Light: #F5F3FF, Dark: rgba(168, 85, 247, 0.14)
  purpleBorder: string;       // Light: #DDD6FE, Dark: rgba(168, 85, 247, 0.35)
  purpleText: string;         // Light: #6D28D9, Dark: #C084FC
}

export const LIGHT_THEME: ThemePalette = {
  isDark: false,
  background: '#F6F8FB',
  surface: '#FFFFFF',
  surfaceSecondary: '#F0F4F7',
  surfaceCard: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  primary: '#172033',
  textPrimary: '#172033',
  textSecondary: '#667085',
  textMuted: '#64748B',
  textPlaceholder: '#8493A7',
  accent: '#0F8B83',
  accentHover: '#0C726B',
  accentSubtle: '#E6F4F2',
  accentBorder: '#BCE3DF',
  border: '#E7ECF2',
  borderStrong: '#D0D5DD',
  inputBg: '#FFFFFF',
  inputBorder: '#E7ECF2',
  sidebarBg: '#0F172A',
  sidebarHeader: '#0A1120',
  headerBg: '#FFFFFF',
  bottomNavBg: '#FFFFFF',
  modalBg: '#FFFFFF',
  modalOverlay: 'rgba(15, 23, 42, 0.65)',
  chatCanvas: '#F0F4F7',
  chatCustomerBubble: '#FFFFFF',
  chatCsBubble: '#E6F4F2',
  chatAiBubble: '#F2F4F7',
  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
  warningText: '#B45309',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerText: '#B91C1C',
  successBg: '#ECFDF5',
  successBorder: '#A7F3D0',
  successText: '#047857',
  infoBg: '#F0F9FF',
  infoBorder: '#BAE6FD',
  infoText: '#0284C7',
  purpleBg: '#F5F3FF',
  purpleBorder: '#DDD6FE',
  purpleText: '#6D28D9',
};

export const DARK_THEME: ThemePalette = {
  isDark: true,
  background: '#000000',
  surface: '#101010',
  surfaceSecondary: '#181818',
  surfaceCard: '#111111',
  surfaceElevated: '#181818',
  primary: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#C0C0C0',
  textMuted: '#A0A0A0',
  textPlaceholder: '#909090',
  accent: '#2DD4BF',
  accentHover: '#14B8A6',
  accentSubtle: 'rgba(45, 212, 191, 0.14)',
  accentBorder: 'rgba(45, 212, 191, 0.3)',
  border: '#303030',
  borderStrong: '#424242',
  inputBg: '#181818',
  inputBorder: '#303030',
  sidebarBg: '#000000',
  sidebarHeader: '#000000',
  headerBg: '#000000',
  bottomNavBg: '#000000',
  modalBg: '#101010',
  modalOverlay: 'rgba(0, 0, 0, 0.85)',
  chatCanvas: '#000000',
  chatCustomerBubble: '#181818',
  chatCsBubble: 'rgba(45, 212, 191, 0.18)',
  chatAiBubble: 'rgba(99, 102, 241, 0.18)',
  warningBg: 'rgba(245, 158, 11, 0.12)',
  warningBorder: 'rgba(245, 158, 11, 0.32)',
  warningText: '#FCD34D',
  dangerBg: 'rgba(239, 68, 68, 0.14)',
  dangerBorder: 'rgba(239, 68, 68, 0.32)',
  dangerText: '#FCA5A5',
  successBg: 'rgba(16, 185, 129, 0.12)',
  successBorder: 'rgba(16, 185, 129, 0.32)',
  successText: '#6EE7B7',
  infoBg: 'rgba(56, 189, 248, 0.12)',
  infoBorder: 'rgba(56, 189, 248, 0.3)',
  infoText: '#38BDF8',
  purpleBg: 'rgba(168, 85, 247, 0.14)',
  purpleBorder: 'rgba(168, 85, 247, 0.35)',
  purpleText: '#C084FC',
};

// ==========================================
// PERSISTENSI TEMA DI PENYIMPANAN LOKAL
// ==========================================
const THEME_STORAGE_KEY = 'wabiz_theme_mode';

export function getSavedThemeMode(): ThemeMode {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    }
  } catch { }
  return 'light';
}

export function saveThemeMode(mode: ThemeMode): void {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    }
  } catch { }
}

// ==========================================
// PALET WARNA B2B SAAS WABIZ (MODERN ENTERPRISE)
// ==========================================
export const COLORS = {
  forestDark: '#0F172A',      // Deep Slate Navy untuk sidebar & brand utama
  forestHeader: '#0A1120',    // Executive Dark Navy untuk header sidebar
  emerald: '#0D9488',         // Enterprise Teal/Emerald untuk aksen primer & CTA utama
  emeraldHover: '#0F766E',    // Teal gelap untuk hover / pressed
  emeraldSubtle: '#F0FDFA',   // Aksen lembut teal untuk badge aktif
  emeraldBorder: '#CCFBF1',   // Border halus untuk aksen teal
  neutralBg: '#F4F7FB',       // Latar canvas netral workspace B2B SaaS (#F4F7FB)
  workspaceBg: '#F4F7FB',     // Palet spesifik: Background utama terang
  surface: '#FFFFFF',         // Kartu & panel putih bersih
  surfaceMuted: '#F1F5F9',    // Latar kartu sekunder
  border: '#E2E8F0',          // Border halus standar CRM
  borderStrong: '#CBD5E1',    // Border lebih tegas untuk fokus / input
  textDark: '#0F172A',        // Teks gelap utama dengan kontras tinggi
  textSecondary: '#64748B',   // Teks abu-abu untuk deskripsi & label
  textMuted: '#94A3B8',       // Teks sangat redup untuk placeholder/sub-info
  textPlaceholder: '#8493A7', // Teks placeholder yang nyaman di semua tema
  warningBg: '#FFFBEB',       // Amber lembut untuk status belum terhubung
  warningBorder: '#FDE68A',   // Border amber
  warningText: '#B45309',     // Teks amber
  warningDot: '#F59E0B',      // Titik indikator amber
  infoBg: '#F0F9FF',          // Biru lembut untuk status AI
  infoBorder: '#BAE6FD',
  infoText: '#0284C7',
  purpleBg: '#F5F3FF',        // Ungu untuk AI
  purpleBorder: '#DDD6FE',
  purpleText: '#6D28D9',
  danger: '#EF4444',          // Merah untuk aksi destruktif & badge unread
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerText: '#B91C1C',
  successBg: '#ECFDF5',       // Hijau lembut untuk status terhubung / online
  successBorder: '#A7F3D0',
  successText: '#047857',
  successDot: '#10B981',
  sidebarNavBg: '#0F172A',
  sidebarActiveBg: 'rgba(13, 148, 136, 0.15)',
  sidebarActiveBorder: '#0D9488',
  sidebarText: '#94A3B8',
  sidebarTextActive: '#FFFFFF',
  navy: '#0F172A',
  deepNavy: '#0F172A',        // Palet spesifik: Deep Navy
  navyDark: '#0A1120',        // Palet spesifik: Navy Dark
  royal: '#2563EB',
  teal: '#0D9488',            // Palet spesifik: Teal
  tealSoft: '#CCFBF1',        // Palet spesifik: Teal Soft
  tealLight: '#14B8A6',
};

// ==========================================
// SINKRONISASI MUTABLE KE PALET GLOBAL WARISAN (COLORS)
// ==========================================
export function applyGlobalColors(theme: ThemePalette) {
  COLORS.neutralBg = theme.background;
  COLORS.workspaceBg = theme.background;
  COLORS.surface = theme.surface;
  COLORS.surfaceMuted = theme.surfaceSecondary;
  COLORS.textDark = theme.textPrimary;
  COLORS.textSecondary = theme.textSecondary;
  COLORS.textMuted = theme.textMuted;
  COLORS.textPlaceholder = theme.textPlaceholder;
  COLORS.emerald = theme.accent;
  COLORS.emeraldHover = theme.accentHover;
  COLORS.border = theme.border;
  COLORS.borderStrong = theme.borderStrong;
  COLORS.forestDark = theme.primary;
  COLORS.emeraldSubtle = theme.accentSubtle;
  COLORS.emeraldBorder = theme.accentBorder;
  COLORS.sidebarNavBg = theme.sidebarBg;
  COLORS.warningBg = theme.warningBg;
  COLORS.warningBorder = theme.warningBorder;
  COLORS.warningText = theme.warningText;
  COLORS.dangerBg = theme.dangerBg;
  COLORS.dangerBorder = theme.dangerBorder;
  COLORS.dangerText = theme.dangerText;
  COLORS.successBg = theme.successBg;
  COLORS.successBorder = theme.successBorder;
  COLORS.successText = theme.successText;
  COLORS.infoBg = theme.infoBg;
  COLORS.infoBorder = theme.infoBorder;
  COLORS.infoText = theme.infoText;
  COLORS.purpleBg = theme.purpleBg;
  COLORS.purpleBorder = theme.purpleBorder;
  COLORS.purpleText = theme.purpleText;
  COLORS.teal = theme.accent;
}

// Inisialisasi awal sinkron saat modul dimuat
applyGlobalColors(getSavedThemeMode() === 'dark' ? DARK_THEME : LIGHT_THEME);

// ==========================================
// THEME CONTEXT & HOOK
// ==========================================
export interface ThemeContextValue {
  themeMode: ThemeMode;
  activeTheme: ActiveTheme;
  isDark: boolean;
  colors: ThemePalette;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  themeMode: 'light',
  activeTheme: 'light',
  isDark: false,
  colors: LIGHT_THEME,
  setThemeMode: () => { },
  toggleTheme: () => { },
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getSavedThemeMode);
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(Appearance.getColorScheme() ?? 'light');

  useEffect(() => {
    const listener = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? 'light');
    });
    return () => {
      listener?.remove?.();
    };
  }, []);

  const activeTheme: ActiveTheme = useMemo(() => {
    if (themeMode === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light';
    }
    return themeMode;
  }, [themeMode, systemScheme]);

  const isDark = activeTheme === 'dark';
  const colors = useMemo(() => (isDark ? DARK_THEME : LIGHT_THEME), [isDark]);

  // Sinkronisasi warna global secara instan di setiap render
  applyGlobalColors(colors);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (document.documentElement) {
        document.documentElement.style.backgroundColor = colors.background;
        document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
      }
      if (document.body) {
        document.body.style.backgroundColor = colors.background;
        document.body.style.color = colors.textPrimary;
        document.body.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
      }
    }
  }, [colors, isDark]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    saveThemeMode(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeModeState((prev) => {
      const isCurrentlyDark = prev === 'dark' || (prev === 'system' && (Appearance.getColorScheme() === 'dark'));
      const next: ThemeMode = isCurrentlyDark ? 'light' : 'dark';
      saveThemeMode(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      themeMode,
      activeTheme,
      isDark,
      colors,
      setThemeMode,
      toggleTheme,
    }),
    [themeMode, activeTheme, isDark, colors, setThemeMode, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// ==========================================
// SISTEM SKALA TIPOGRAFI ENTERPRISE SAAS (B2B SaaS Typography Standard)
// ==========================================
export const TYPOGRAPHY = {
  fontFamily: Platform.select({
    web: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    default: undefined,
  }),
  // Hierarki Judul Halaman (22-24 px)
  pageTitle: { fontSize: 23, fontWeight: '700' as const, letterSpacing: -0.3, lineHeight: 29 },
  pageTitleMobile: { fontSize: 19.5, fontWeight: '700' as const, letterSpacing: -0.2, lineHeight: 25 },
  pageSubtitle: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18.5 },
  
  // Hierarki Judul Section (16-18 px)
  sectionTitle: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2, lineHeight: 22 },
  sectionTitleMobile: { fontSize: 15.5, fontWeight: '600' as const, letterSpacing: -0.15, lineHeight: 21 },
  sectionSubtitle: { fontSize: 12.5, fontWeight: '400' as const, lineHeight: 17.5 },

  // Hierarki Judul Kartu / Modul (14-16 px)
  cardTitle: { fontSize: 15, fontWeight: '600' as const, letterSpacing: -0.1, lineHeight: 20 },
  cardTitleSm: { fontSize: 14, fontWeight: '600' as const, letterSpacing: -0.05, lineHeight: 19 },
  cardSubtitle: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16.5 },

  // Hierarki Teks Utama / Body (13-15 px)
  body: { fontSize: 13.5, fontWeight: '400' as const, lineHeight: 19.5 },
  bodyMedium: { fontSize: 13.5, fontWeight: '500' as const, lineHeight: 19.5 },
  bodyBold: { fontSize: 13.5, fontWeight: '600' as const, lineHeight: 19.5 },

  // Hierarki Tombol Aksi (13-14 px)
  btnLabel: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  btnLabelSm: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },

  // Hierarki Keterangan / Caption / Helper (11-12 px)
  supporting: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16.5 },
  supportingMedium: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16.5 },
  caption: { fontSize: 11.5, fontWeight: '400' as const, lineHeight: 15.5 },
  captionMedium: { fontSize: 11.5, fontWeight: '500' as const, lineHeight: 15.5 },
  captionBold: { fontSize: 11.5, fontWeight: '700' as const, lineHeight: 15.5 },
  helper: { fontSize: 11, fontWeight: '400' as const, lineHeight: 15 },
  badgeText: { fontSize: 10.5, fontWeight: '700' as const, lineHeight: 14, letterSpacing: 0.3 },

  // Statistik & Metrik
  statNumber: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.5, lineHeight: 32 },
  statNumberCompact: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4, lineHeight: 27 },
};

// ==========================================
// BACKGROUND PRESETS (PREMIUM MODERN SAAS WORKSPACE)
// ==========================================
export const BACKGROUNDS = {
  workspace: {
    backgroundColor: '#F4F7FB',
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(1200px circle at 15% -5%, rgba(13, 148, 136, 0.05) 0%, rgba(244, 247, 251, 1) 60%), radial-gradient(900px circle at 85% 20%, rgba(37, 99, 235, 0.03) 0%, rgba(244, 247, 251, 0) 70%)',
      },
      default: {},
    }),
  },
  aiCanvas: {
    backgroundColor: '#F4F7FB',
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(900px circle at 90% 0%, rgba(13, 148, 136, 0.07) 0%, rgba(37, 99, 235, 0.04) 50%, rgba(244, 247, 251, 0) 80%)',
      },
      default: {},
    }),
  },
  chatCanvas: {
    backgroundColor: '#F1F5F9',
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(1000px circle at 50% 0%, rgba(13, 148, 136, 0.03) 0%, rgba(241, 245, 249, 1) 70%)',
      },
      default: {},
    }),
  },
  authBg: {
    backgroundColor: '#0A1120',
    ...Platform.select({
      web: {
        backgroundImage: 'radial-gradient(1000px circle at 50% -10%, rgba(13, 148, 136, 0.22) 0%, rgba(15, 23, 42, 0.95) 55%, #0A1120 100%)',
      },
      default: {},
    }),
  },
};

// ==========================================
// BAYANGAN MODERN ENTERPRISE SAAS (SHADOWS)
// ==========================================
export const SHADOWS = {
  card: {
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.05)',
      },
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      default: {
        elevation: 2,
      },
    }),
  },
  cardElevated: {
    ...Platform.select({
      web: {
        boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)',
      },
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      default: {
        elevation: 3,
      },
    }),
  },
  modal: {
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
      },
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      default: {
        elevation: 8,
      },
    }),
  },
};

// ==========================================
// SISTEM IKON VEKTOR MANDIRI (MURNI REACT NATIVE)
// ==========================================
export interface AppIconProps {
  name:
  | 'dashboard'
  | 'chat'
  | 'users'
  | 'campaign'
  | 'bot'
  | 'team'
  | 'settings'
  | 'search'
  | 'bell'
  | 'user'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'chevron-up'
  | 'plus'
  | 'check'
  | 'check-circle'
  | 'check-check'
  | 'alert'
  | 'help'
  | 'info'
  | 'link'
  | 'menu'
  | 'close'
  | 'log-out'
  | 'arrow-left'
  | 'arrow-right'
  | 'send'
  | 'refresh'
  | 'edit'
  | 'trash'
  | 'copy'
  | 'phone'
  | 'filter'
  | 'calendar'
  | 'clock'
  | 'eye'
  | 'eye-off'
  | 'mail'
  | 'lock'
  | 'shield'
  | 'sun'
  | 'moon'
  | 'laptop'
  | 'monitor'
  | 'zap'
  | 'file-text'
  | 'more-vertical'
  | 'external-link'
  | 'download'
  | 'upload';
  size?: number;
  color?: string;
}

function getLucideSvgElements(name: AppIconProps['name'], color: string) {
  switch (name) {
    case 'sun':
      return [
        React.createElement('circle', { key: 'c', cx: 12, cy: 12, r: 4, stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: 'p1', d: 'M12 2v2', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: 'p2', d: 'M12 20v2', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: 'p3', d: 'm4.93 4.93 1.41 1.41', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: 'p4', d: 'm17.66 17.66 1.41 1.41', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: 'p5', d: 'M2 12h2', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: 'p6', d: 'M20 12h2', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: 'p7', d: 'm6.34 17.66-1.41 1.41', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: 'p8', d: 'm19.07 4.93-1.41 1.41', stroke: color, strokeWidth: 2 }),
      ];
    case 'moon':
      return [
        React.createElement('path', { key: 'm', d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z', stroke: color, strokeWidth: 2, fill: 'none' }),
      ];
    case 'laptop':
    case 'monitor':
      return [
        React.createElement('rect', { key: 'r', width: 20, height: 14, x: 2, y: 3, rx: 2, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: 'l1', x1: 8, x2: 16, y1: 21, y2: 21, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: 'l2', x1: 12, x2: 12, y1: 17, y2: 21, stroke: color, strokeWidth: 2 }),
      ];
    case 'dashboard':
      return [
        React.createElement('rect', { key: '1', width: 7, height: 9, x: 3, y: 3, rx: 1, stroke: color, strokeWidth: 2 }),
        React.createElement('rect', { key: '2', width: 7, height: 5, x: 14, y: 3, rx: 1, stroke: color, strokeWidth: 2 }),
        React.createElement('rect', { key: '3', width: 7, height: 9, x: 14, y: 12, rx: 1, stroke: color, strokeWidth: 2 }),
        React.createElement('rect', { key: '4', width: 7, height: 5, x: 3, y: 16, rx: 1, stroke: color, strokeWidth: 2 }),
      ];
    case 'chat':
      return [
        React.createElement('path', { key: '1', d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', stroke: color, strokeWidth: 2, fill: 'none' }),
      ];
    case 'users':
      return [
        React.createElement('path', { key: '1', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', stroke: color, strokeWidth: 2 }),
        React.createElement('circle', { key: '2', cx: 9, cy: 7, r: 4, stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '3', d: 'M22 21v-2a4 4 0 0 0-3-3.87', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '4', d: 'M16 3.13a4 4 0 0 1 0 7.75', stroke: color, strokeWidth: 2 }),
      ];
    case 'campaign':
      return [
        React.createElement('path', { key: '1', d: 'm3 11 18-5v12L3 14v-3z', stroke: color, strokeWidth: 2, fill: 'none' }),
        React.createElement('path', { key: '2', d: 'M11.6 16.8a3 3 0 1 1-5.8-1.6', stroke: color, strokeWidth: 2 }),
      ];
    case 'bot':
      return [
        React.createElement('path', { key: '1', d: 'M12 8V4H8', stroke: color, strokeWidth: 2 }),
        React.createElement('rect', { key: '2', width: 16, height: 12, x: 4, y: 8, rx: 2, stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '3', d: 'M2 14h2', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '4', d: 'M20 14h2', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '5', d: 'M15 13v2', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '6', d: 'M9 13v2', stroke: color, strokeWidth: 2 }),
      ];
    case 'team':
      return [
        React.createElement('path', { key: '1', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', stroke: color, strokeWidth: 2 }),
        React.createElement('circle', { key: '2', cx: 9, cy: 7, r: 4, stroke: color, strokeWidth: 2 }),
        React.createElement('polyline', { key: '3', points: '16 11 18 13 22 9', stroke: color, strokeWidth: 2 }),
      ];
    case 'settings':
      return [
        React.createElement('path', { key: '1', d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', stroke: color, strokeWidth: 2 }),
        React.createElement('circle', { key: '2', cx: 12, cy: 12, r: 3, stroke: color, strokeWidth: 2 }),
      ];
    case 'search':
      return [
        React.createElement('circle', { key: '1', cx: 11, cy: 11, r: 8, stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'm21 21-4.3-4.3', stroke: color, strokeWidth: 2 }),
      ];
    case 'bell':
      return [
        React.createElement('path', { key: '1', d: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M10.3 21a1.94 1.94 0 0 0 3.4 0', stroke: color, strokeWidth: 2 }),
      ];
    case 'user':
      return [
        React.createElement('path', { key: '1', d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', stroke: color, strokeWidth: 2 }),
        React.createElement('circle', { key: '2', cx: 12, cy: 7, r: 4, stroke: color, strokeWidth: 2 }),
      ];
    case 'plus':
      return [
        React.createElement('path', { key: '1', d: 'M5 12h14', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M12 5v14', stroke: color, strokeWidth: 2 }),
      ];
    case 'check':
      return [
        React.createElement('path', { key: '1', d: 'M20 6 9 17l-5-5', stroke: color, strokeWidth: 2 }),
      ];
    case 'check-circle':
      return [
        React.createElement('path', { key: '1', d: 'M22 11.08V12a10 10 0 1 1-5.93-9.14', stroke: color, strokeWidth: 2 }),
        React.createElement('polyline', { key: '2', points: '22 4 12 14.01 9 11.01', stroke: color, strokeWidth: 2 }),
      ];
    case 'check-check':
      return [
        React.createElement('path', { key: '1', d: 'M18 6 7 17l-5-5', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'm22 10-7.5 7.5L13 16', stroke: color, strokeWidth: 2 }),
      ];
    case 'chevron-right':
      return [
        React.createElement('path', { key: '1', d: 'm9 18 6-6-6-6', stroke: color, strokeWidth: 2 }),
      ];
    case 'chevron-left':
      return [
        React.createElement('path', { key: '1', d: 'm15 18-6-6 6-6', stroke: color, strokeWidth: 2 }),
      ];
    case 'chevron-down':
      return [
        React.createElement('path', { key: '1', d: 'm6 9 6 6 6-6', stroke: color, strokeWidth: 2 }),
      ];
    case 'chevron-up':
      return [
        React.createElement('path', { key: '1', d: 'm18 15-6-6-6 6', stroke: color, strokeWidth: 2 }),
      ];
    case 'alert':
      return [
        React.createElement('circle', { key: '1', cx: 12, cy: 12, r: 10, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '2', x1: 12, x2: 12, y1: 8, y2: 12, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '3', x1: 12, x2: 12.01, y1: 16, y2: 16, stroke: color, strokeWidth: 2 }),
      ];
    case 'help':
      return [
        React.createElement('circle', { key: '1', cx: 12, cy: 12, r: 10, stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '3', x1: 12, x2: 12.01, y1: 17, y2: 17, stroke: color, strokeWidth: 2 }),
      ];
    case 'info':
      return [
        React.createElement('circle', { key: '1', cx: 12, cy: 12, r: 10, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '2', x1: 12, x2: 12, y1: 16, y2: 12, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '3', x1: 12, x2: 12.01, y1: 8, y2: 8, stroke: color, strokeWidth: 2 }),
      ];
    case 'filter':
      return [
        React.createElement('polygon', { key: '1', points: '22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3', stroke: color, strokeWidth: 2 }),
      ];
    case 'calendar':
      return [
        React.createElement('rect', { key: '1', width: 18, height: 18, x: 3, y: 4, rx: 2, ry: 2, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '2', x1: 16, x2: 16, y1: 2, y2: 6, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '3', x1: 8, x2: 8, y1: 2, y2: 6, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '4', x1: 3, x2: 21, y1: 10, y2: 10, stroke: color, strokeWidth: 2 }),
      ];
    case 'clock':
      return [
        React.createElement('circle', { key: '1', cx: 12, cy: 12, r: 10, stroke: color, strokeWidth: 2 }),
        React.createElement('polyline', { key: '2', points: '12 6 12 12 16 14', stroke: color, strokeWidth: 2 }),
      ];
    case 'eye':
      return [
        React.createElement('path', { key: '1', d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z', stroke: color, strokeWidth: 2 }),
        React.createElement('circle', { key: '2', cx: 12, cy: 12, r: 3, stroke: color, strokeWidth: 2 }),
      ];
    case 'eye-off':
      return [
        React.createElement('path', { key: '1', d: 'M9.88 9.88a3 3 0 1 0 4.24 4.24', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '3', d: 'M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61', stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '4', x1: 2, x2: 22, y1: 2, y2: 22, stroke: color, strokeWidth: 2 }),
      ];
    case 'mail':
      return [
        React.createElement('rect', { key: '1', width: 20, height: 16, x: 2, y: 4, rx: 2, stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7', stroke: color, strokeWidth: 2 }),
      ];
    case 'lock':
      return [
        React.createElement('rect', { key: '1', width: 18, height: 11, x: 3, y: 11, rx: 2, ry: 2, stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M7 11V7a5 5 0 0 1 10 0v4', stroke: color, strokeWidth: 2 }),
      ];
    case 'shield':
      return [
        React.createElement('path', { key: '1', d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10', stroke: color, strokeWidth: 2 }),
      ];
    case 'link':
      return [
        React.createElement('path', { key: '1', d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71', stroke: color, strokeWidth: 2 }),
      ];
    case 'send':
      return [
        React.createElement('path', { key: '1', d: 'm22 2-7 20-4-9-9-4Z', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M22 2 11 13', stroke: color, strokeWidth: 2 }),
      ];
    case 'refresh':
      return [
        React.createElement('path', { key: '1', d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M21 3v5h-5', stroke: color, strokeWidth: 2 }),
      ];
    case 'menu':
      return [
        React.createElement('line', { key: '1', x1: 4, x2: 20, y1: 12, y2: 12, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '2', x1: 4, x2: 20, y1: 6, y2: 6, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '3', x1: 4, x2: 20, y1: 18, y2: 18, stroke: color, strokeWidth: 2 }),
      ];
    case 'close':
      return [
        React.createElement('path', { key: '1', d: 'M18 6 6 18', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'm6 6 12 12', stroke: color, strokeWidth: 2 }),
      ];
    case 'log-out':
      return [
        React.createElement('path', { key: '1', d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', stroke: color, strokeWidth: 2 }),
        React.createElement('polyline', { key: '2', points: '16 17 21 12 16 7', stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '3', x1: 21, x2: 9, y1: 12, y2: 12, stroke: color, strokeWidth: 2 }),
      ];
    case 'arrow-left':
      return [
        React.createElement('line', { key: '1', x1: 19, x2: 5, y1: 12, y2: 12, stroke: color, strokeWidth: 2 }),
        React.createElement('polyline', { key: '2', points: '12 19 5 12 12 5', stroke: color, strokeWidth: 2 }),
      ];
    case 'arrow-right':
      return [
        React.createElement('line', { key: '1', x1: 5, x2: 19, y1: 12, y2: 12, stroke: color, strokeWidth: 2 }),
        React.createElement('polyline', { key: '2', points: '12 5 19 12 12 19', stroke: color, strokeWidth: 2 }),
      ];
    case 'edit':
      return [
        React.createElement('path', { key: '1', d: 'M12 20h9', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z', stroke: color, strokeWidth: 2 }),
      ];
    case 'trash':
      return [
        React.createElement('path', { key: '1', d: 'M3 6h18', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '3', d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '4', x1: 10, x2: 10, y1: 11, y2: 17, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '5', x1: 14, x2: 14, y1: 11, y2: 17, stroke: color, strokeWidth: 2 }),
      ];
    case 'copy':
      return [
        React.createElement('rect', { key: '1', width: 14, height: 14, x: 8, y: 8, rx: 2, ry: 2, stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: '2', d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2', stroke: color, strokeWidth: 2 }),
      ];
    case 'phone':
      return [
        React.createElement('path', { key: '1', d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z', stroke: color, strokeWidth: 2 }),
      ];
    case 'zap':
      return [
        React.createElement('polygon', { key: '1', points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2', stroke: color, strokeWidth: 2, fill: 'none' }),
      ];
    case 'file-text':
      return [
        React.createElement('path', { key: '1', d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', stroke: color, strokeWidth: 2 }),
        React.createElement('polyline', { key: '2', points: '14 2 14 8 20 8', stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '3', x1: 16, x2: 8, y1: 13, y2: 13, stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '4', x1: 16, x2: 8, y1: 17, y2: 17, stroke: color, strokeWidth: 2 }),
      ];
    case 'more-vertical':
      return [
        React.createElement('circle', { key: '1', cx: 12, cy: 12, r: 1.5, stroke: color, strokeWidth: 2, fill: color }),
        React.createElement('circle', { key: '2', cx: 12, cy: 5, r: 1.5, stroke: color, strokeWidth: 2, fill: color }),
        React.createElement('circle', { key: '3', cx: 12, cy: 19, r: 1.5, stroke: color, strokeWidth: 2, fill: color }),
      ];
    case 'external-link':
      return [
        React.createElement('path', { key: '1', d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', stroke: color, strokeWidth: 2 }),
        React.createElement('polyline', { key: '2', points: '15 3 21 3 21 9', stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '3', x1: 10, x2: 21, y1: 14, y2: 3, stroke: color, strokeWidth: 2 }),
      ];
    case 'download':
      return [
        React.createElement('path', { key: '1', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', stroke: color, strokeWidth: 2 }),
        React.createElement('polyline', { key: '2', points: '7 10 12 15 17 10', stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '3', x1: 12, x2: 12, y1: 15, y2: 3, stroke: color, strokeWidth: 2 }),
      ];
    case 'upload':
      return [
        React.createElement('path', { key: '1', d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', stroke: color, strokeWidth: 2 }),
        React.createElement('polyline', { key: '2', points: '17 8 12 3 7 8', stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: '3', x1: 12, x2: 12, y1: 3, y2: 15, stroke: color, strokeWidth: 2 }),
      ];
    default:
      // Fallback profesional: Lucide Help Circle daripada elemen kosong atau teks rusak
      return [
        React.createElement('circle', { key: 'fb-c', cx: 12, cy: 12, r: 10, stroke: color, strokeWidth: 2 }),
        React.createElement('path', { key: 'fb-p', d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3', stroke: color, strokeWidth: 2 }),
        React.createElement('line', { key: 'fb-l', x1: 12, x2: 12.01, y1: 17, y2: 17, stroke: color, strokeWidth: 2 }),
      ];
  }
}

export function AppIcon({ name, size = 18, color = COLORS.textSecondary }: AppIconProps) {
  if (Platform.OS === 'web') {
    const svgChildren = getLucideSvgElements(name, color);
    if (svgChildren) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: color,
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 },
        },
        svgChildren
      );
    }
  }

  switch (name) {
    case 'dashboard':
      return (
        <View style={{ width: size, height: size, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', height: size * 0.44 }}>
            <View style={{ width: size * 0.44, backgroundColor: color, borderRadius: 2 }} />
            <View style={{ width: size * 0.44, backgroundColor: color, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', height: size * 0.44 }}>
            <View style={{ width: size * 0.44, backgroundColor: color, borderRadius: 2 }} />
            <View style={{ width: size * 0.44, backgroundColor: color, borderRadius: 2 }} />
          </View>
        </View>
      );

    case 'chat':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.88,
              height: size * 0.72,
              borderRadius: size * 0.22,
              borderWidth: 1.6,
              borderColor: color,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', gap: 2 }}>
              <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color }} />
              <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color }} />
              <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color }} />
            </View>
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: 1,
              left: 3,
              width: 4,
              height: 4,
              borderLeftWidth: 1.6,
              borderBottomWidth: 1.6,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'users':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.36,
              height: size * 0.36,
              borderRadius: (size * 0.36) / 2,
              borderWidth: 1.6,
              borderColor: color,
              marginBottom: 1.5,
            }}
          />
          <View
            style={{
              width: size * 0.74,
              height: size * 0.36,
              borderTopLeftRadius: size * 0.36,
              borderTopRightRadius: size * 0.36,
              borderWidth: 1.6,
              borderColor: color,
            }}
          />
        </View>
      );

    case 'campaign':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.7,
              height: size * 0.52,
              borderWidth: 1.6,
              borderColor: color,
              borderTopRightRadius: size * 0.26,
              borderBottomRightRadius: size * 0.26,
              borderLeftWidth: 3,
            }}
          />
          <View
            style={{
              width: 2,
              height: 4,
              backgroundColor: color,
              position: 'absolute',
              bottom: 2,
              left: 4,
            }}
          />
        </View>
      );

    case 'bot':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 1.6, height: 3, backgroundColor: color, marginBottom: 1 }} />
          <View
            style={{
              width: size * 0.8,
              height: size * 0.58,
              borderRadius: 3,
              borderWidth: 1.6,
              borderColor: color,
              flexDirection: 'row',
              justifyContent: 'space-around',
              alignItems: 'center',
              paddingHorizontal: 2,
            }}
          >
            <View style={{ width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: color }} />
            <View style={{ width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'team':
      return (
        <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ position: 'absolute', left: 1, opacity: 0.55 }}>
            <View style={{ width: 5, height: 5, borderRadius: 2.5, borderWidth: 1.2, borderColor: color }} />
            <View style={{ width: 8, height: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderWidth: 1.2, borderColor: color }} />
          </View>
          <View style={{ position: 'absolute', right: 2 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, borderWidth: 1.4, borderColor: color }} />
            <View style={{ width: 11, height: 5, borderTopLeftRadius: 5, borderTopRightRadius: 5, borderWidth: 1.4, borderColor: color }} />
          </View>
        </View>
      );

    case 'settings':
      return (
        <View style={{ width: size, height: size, justifyContent: 'space-around', paddingVertical: 2 }}>
          <View style={{ height: 1.6, backgroundColor: color, position: 'relative' }}>
            <View style={{ position: 'absolute', left: 3, top: -2.2, width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
          </View>
          <View style={{ height: 1.6, backgroundColor: color, position: 'relative' }}>
            <View style={{ position: 'absolute', right: 3, top: -2.2, width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
          </View>
          <View style={{ height: 1.6, backgroundColor: color, position: 'relative' }}>
            <View style={{ position: 'absolute', left: 7, top: -2.2, width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'search':
      return (
        <View style={{ width: size, height: size }}>
          <View
            style={{
              width: size * 0.62,
              height: size * 0.62,
              borderRadius: (size * 0.62) / 2,
              borderWidth: 1.6,
              borderColor: color,
              top: 1,
              left: 1,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: 1.8,
              height: size * 0.36,
              backgroundColor: color,
              transform: [{ rotate: '-45deg' }],
              borderRadius: 1,
            }}
          />
        </View>
      );

    case 'bell':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.65,
              height: size * 0.58,
              borderTopLeftRadius: size * 0.32,
              borderTopRightRadius: size * 0.32,
              borderWidth: 1.6,
              borderColor: color,
              borderBottomWidth: 0,
            }}
          />
          <View style={{ width: size * 0.84, height: 1.6, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ width: 3, height: 2, backgroundColor: color, borderBottomLeftRadius: 1.5, borderBottomRightRadius: 1.5, marginTop: 1 }} />
        </View>
      );

    case 'user':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.44,
              height: size * 0.44,
              borderRadius: (size * 0.44) / 2,
              borderWidth: 1.6,
              borderColor: color,
              marginBottom: 1,
            }}
          />
          <View
            style={{
              width: size * 0.8,
              height: size * 0.38,
              borderTopLeftRadius: size * 0.4,
              borderTopRightRadius: size * 0.4,
              borderWidth: 1.6,
              borderColor: color,
            }}
          />
        </View>
      );

    case 'chevron-right':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.35,
              height: size * 0.35,
              borderTopWidth: 1.8,
              borderRightWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'chevron-left':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.35,
              height: size * 0.35,
              borderTopWidth: 1.8,
              borderLeftWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '-45deg' }],
              marginLeft: 2,
            }}
          />
        </View>
      );

    case 'chevron-down':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.35,
              height: size * 0.35,
              borderBottomWidth: 1.8,
              borderRightWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
              marginTop: -2,
            }}
          />
        </View>
      );

    case 'chevron-up':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.35,
              height: size * 0.35,
              borderTopWidth: 1.8,
              borderLeftWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
              marginTop: 2,
            }}
          />
        </View>
      );

    case 'arrow-left':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: size * 0.7,
              height: 1.8,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 2,
              width: size * 0.35,
              height: size * 0.35,
              borderTopWidth: 1.8,
              borderLeftWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'arrow-right':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: size * 0.7,
              height: 1.8,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: 2,
              width: size * 0.35,
              height: size * 0.35,
              borderTopWidth: 1.8,
              borderRightWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'plus':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: size * 0.75, height: 1.8, backgroundColor: color }} />
          <View style={{ position: 'absolute', height: size * 0.75, width: 1.8, backgroundColor: color }} />
        </View>
      );

    case 'check':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.35,
              height: size * 0.65,
              borderBottomWidth: 1.8,
              borderRightWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
              marginTop: -2,
            }}
          />
        </View>
      );

    case 'check-circle':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.86,
              height: size * 0.86,
              borderRadius: (size * 0.86) / 2,
              borderWidth: 1.6,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: size * 0.28,
                height: size * 0.48,
                borderBottomWidth: 1.6,
                borderRightWidth: 1.6,
                borderColor: color,
                transform: [{ rotate: '45deg' }],
                marginTop: -2,
              }}
            />
          </View>
        </View>
      );

    case 'check-check':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              left: size * 0.12,
              width: size * 0.3,
              height: size * 0.55,
              borderBottomWidth: 1.6,
              borderRightWidth: 1.6,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
              marginTop: -2,
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: size * 0.18,
              width: size * 0.3,
              height: size * 0.55,
              borderBottomWidth: 1.6,
              borderRightWidth: 1.6,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
              marginTop: -2,
            }}
          />
        </View>
      );

    case 'alert':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.85,
              height: size * 0.85,
              borderRadius: (size * 0.85) / 2,
              borderWidth: 1.6,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: 1.8, height: size * 0.35, backgroundColor: color, borderRadius: 1, marginBottom: 2 }} />
            <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'info':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.86,
              height: size * 0.86,
              borderRadius: (size * 0.86) / 2,
              borderWidth: 1.6,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color, marginBottom: 2 }} />
            <View style={{ width: 1.8, height: size * 0.32, backgroundColor: color, borderRadius: 1 }} />
          </View>
        </View>
      );

    case 'help':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.86,
              height: size * 0.86,
              borderRadius: (size * 0.86) / 2,
              borderWidth: 1.6,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: size * 0.34,
                height: size * 0.24,
                borderTopWidth: 1.6,
                borderRightWidth: 1.6,
                borderLeftWidth: 1.6,
                borderColor: color,
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
                marginBottom: 1,
              }}
            />
            <View style={{ width: 1.6, height: size * 0.12, backgroundColor: color, borderRadius: 1, marginBottom: 1.5 }} />
            <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'link':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.65,
              height: size * 0.42,
              borderRadius: size * 0.2,
              borderWidth: 1.6,
              borderColor: color,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'send':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: 0,
              height: 0,
              borderTopWidth: size * 0.36,
              borderBottomWidth: size * 0.36,
              borderLeftWidth: size * 0.65,
              borderTopColor: 'transparent',
              borderBottomColor: 'transparent',
              borderLeftColor: color,
              marginLeft: 2,
            }}
          />
        </View>
      );

    case 'refresh':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.75,
              height: size * 0.75,
              borderRadius: (size * 0.75) / 2,
              borderWidth: 1.6,
              borderColor: color,
              borderTopColor: 'transparent',
            }}
          />
        </View>
      );

    case 'menu':
      return (
        <View style={{ width: size, height: size, justifyContent: 'space-around', paddingVertical: 2 }}>
          <View style={{ height: 1.8, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ height: 1.8, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ height: 1.8, backgroundColor: color, borderRadius: 1 }} />
        </View>
      );

    case 'close':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: size * 0.8, height: 1.8, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />
          <View style={{ position: 'absolute', width: size * 0.8, height: 1.8, backgroundColor: color, transform: [{ rotate: '-45deg' }] }} />
        </View>
      );

    case 'log-out':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              left: 1,
              width: size * 0.45,
              height: size * 0.8,
              borderWidth: 1.6,
              borderColor: color,
              borderRightWidth: 0,
              borderRadius: 2,
            }}
          />
          <View style={{ position: 'absolute', right: 2, width: size * 0.45, height: 1.6, backgroundColor: color }} />
          <View
            style={{
              position: 'absolute',
              right: 2,
              width: size * 0.25,
              height: size * 0.25,
              borderTopWidth: 1.6,
              borderRightWidth: 1.6,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'edit':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.7,
              height: size * 0.28,
              borderWidth: 1.5,
              borderColor: color,
              borderRadius: 2,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'trash':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: size * 0.75, height: 1.6, backgroundColor: color, borderRadius: 1, marginBottom: 1 }} />
          <View
            style={{
              width: size * 0.55,
              height: size * 0.6,
              borderWidth: 1.5,
              borderColor: color,
              borderTopWidth: 0,
              borderBottomLeftRadius: 2,
              borderBottomRightRadius: 2,
            }}
          />
        </View>
      );

    case 'copy':
      return (
        <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
          <View
            style={{
              position: 'absolute',
              top: 2,
              left: 2,
              width: size * 0.55,
              height: size * 0.65,
              borderWidth: 1.3,
              borderColor: color,
              borderRadius: 2,
              opacity: 0.6,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 2,
              right: 2,
              width: size * 0.55,
              height: size * 0.65,
              borderWidth: 1.5,
              borderColor: color,
              borderRadius: 2,
              backgroundColor: 'transparent',
            }}
          />
        </View>
      );

    case 'phone':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.5,
              height: size * 0.8,
              borderRadius: 3,
              borderWidth: 1.6,
              borderColor: color,
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingVertical: 2,
            }}
          >
            <View style={{ width: 4, height: 1.2, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'filter':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: size * 0.8, height: 1.8, backgroundColor: color, borderRadius: 1, marginBottom: 2.5 }} />
          <View style={{ width: size * 0.52, height: 1.8, backgroundColor: color, borderRadius: 1, marginBottom: 2.5 }} />
          <View style={{ width: size * 0.26, height: 1.8, backgroundColor: color, borderRadius: 1 }} />
        </View>
      );

    case 'calendar':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {/* Top header tabs */}
          <View style={{ width: size * 0.75, height: 2, backgroundColor: color, borderTopLeftRadius: 1, borderTopRightRadius: 1 }} />
          <View
            style={{
              width: size * 0.75,
              height: size * 0.65,
              borderWidth: 1.5,
              borderColor: color,
              borderTopWidth: 0,
              borderBottomLeftRadius: 3,
              borderBottomRightRadius: 3,
              justifyContent: 'center',
              alignItems: 'center',
              paddingTop: 1,
            }}
          >
            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'clock':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.82,
              height: size * 0.82,
              borderRadius: (size * 0.82) / 2,
              borderWidth: 1.5,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Center dot + hands */}
            <View
              style={{
                position: 'absolute',
                top: 2,
                width: 1.4,
                height: (size * 0.82) / 2 - 2,
                backgroundColor: color,
                borderRadius: 0.7,
              }}
            />
            <View
              style={{
                position: 'absolute',
                right: 2,
                width: (size * 0.82) / 2 - 2,
                height: 1.4,
                backgroundColor: color,
                borderRadius: 0.7,
              }}
            />
          </View>
        </View>
      );

    case 'eye':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.88,
              height: size * 0.54,
              borderRadius: (size * 0.54) / 2,
              borderWidth: 1.6,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: size * 0.24,
                height: size * 0.24,
                borderRadius: (size * 0.24) / 2,
                backgroundColor: color,
              }}
            />
          </View>
        </View>
      );

    case 'eye-off':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.88,
              height: size * 0.54,
              borderRadius: (size * 0.54) / 2,
              borderWidth: 1.6,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: size * 0.24,
                height: size * 0.24,
                borderRadius: (size * 0.24) / 2,
                backgroundColor: color,
              }}
            />
          </View>
          <View
            style={{
              position: 'absolute',
              width: size * 0.96,
              height: 1.8,
              backgroundColor: color,
              transform: [{ rotate: '-45deg' }],
              borderRadius: 1,
            }}
          />
        </View>
      );

    case 'mail':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.88,
              height: size * 0.64,
              borderRadius: 3,
              borderWidth: 1.5,
              borderColor: color,
              overflow: 'hidden',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: size * 0.58,
                height: size * 0.58,
                borderBottomWidth: 1.5,
                borderRightWidth: 1.5,
                borderColor: color,
                transform: [{ rotate: '45deg' }],
                marginTop: -size * 0.32,
              }}
            />
          </View>
        </View>
      );

    case 'lock':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.48,
              height: size * 0.38,
              borderTopLeftRadius: size * 0.24,
              borderTopRightRadius: size * 0.24,
              borderWidth: 1.5,
              borderBottomWidth: 0,
              borderColor: color,
              marginBottom: -1,
            }}
          />
          <View
            style={{
              width: size * 0.76,
              height: size * 0.52,
              borderRadius: 3,
              borderWidth: 1.5,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: 2, height: 3, backgroundColor: color, borderRadius: 1 }} />
          </View>
        </View>
      );

    case 'shield':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.78,
              height: size * 0.82,
              borderWidth: 1.5,
              borderColor: color,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3,
              borderBottomLeftRadius: size * 0.39,
              borderBottomRightRadius: size * 0.39,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: size * 0.22,
                height: size * 0.36,
                borderBottomWidth: 1.5,
                borderRightWidth: 1.5,
                borderColor: color,
                transform: [{ rotate: '45deg' }],
                marginTop: -2,
              }}
            />
          </View>
        </View>
      );

    case 'sun':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.44,
              height: size * 0.44,
              borderRadius: size * 0.22,
              borderWidth: 1.6,
              borderColor: color,
              backgroundColor: color,
            }}
          />
          <View style={{ position: 'absolute', top: 1, width: 1.5, height: size * 0.16, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ position: 'absolute', bottom: 1, width: 1.5, height: size * 0.16, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ position: 'absolute', left: 1, width: size * 0.16, height: 1.5, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ position: 'absolute', right: 1, width: size * 0.16, height: 1.5, backgroundColor: color, borderRadius: 1 }} />
          <View style={{ position: 'absolute', width: size * 0.88, height: 1.4, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '45deg' }], opacity: 0.85 }} />
          <View style={{ position: 'absolute', width: size * 0.88, height: 1.4, backgroundColor: color, borderRadius: 1, transform: [{ rotate: '-45deg' }], opacity: 0.85 }} />
        </View>
      );

    case 'moon':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.72,
              height: size * 0.72,
              borderRadius: size * 0.36,
              borderWidth: 1.8,
              borderColor: color,
              borderRightWidth: 0,
              transform: [{ rotate: '-25deg' }],
              alignItems: 'flex-end',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: size * 0.46,
                height: size * 0.6,
                borderRadius: size * 0.25,
                borderLeftWidth: 1.8,
                borderColor: color,
                marginRight: -1,
              }}
            />
          </View>
        </View>
      );

    case 'laptop':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.72,
              height: size * 0.5,
              borderRadius: 2,
              borderWidth: 1.4,
              borderColor: color,
              marginBottom: 1,
            }}
          />
          <View
            style={{
              width: size * 0.9,
              height: 2,
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
        </View>
      );

    case 'monitor':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.84,
              height: size * 0.58,
              borderRadius: 2,
              borderWidth: 1.5,
              borderColor: color,
              marginBottom: 1,
            }}
          />
          <View style={{ width: 2, height: 2, backgroundColor: color }} />
          <View style={{ width: size * 0.44, height: 1.6, backgroundColor: color, borderRadius: 1 }} />
        </View>
      );

    case 'zap':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.22,
              borderRightWidth: 0,
              borderBottomWidth: size * 0.45,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: color,
              transform: [{ rotate: '15deg' }],
              marginRight: 2,
            }}
          />
          <View
            style={{
              width: 0,
              height: 0,
              borderRightWidth: size * 0.22,
              borderLeftWidth: 0,
              borderTopWidth: size * 0.45,
              borderRightColor: 'transparent',
              borderLeftColor: 'transparent',
              borderTopColor: color,
              transform: [{ rotate: '15deg' }],
              marginLeft: 2,
              marginTop: -2,
            }}
          />
        </View>
      );

    case 'file-text':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              width: size * 0.68,
              height: size * 0.84,
              borderRadius: 2,
              borderWidth: 1.5,
              borderColor: color,
              paddingVertical: 2,
              paddingHorizontal: 2,
              justifyContent: 'space-around',
            }}
          >
            <View style={{ width: '80%', height: 1.4, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: '60%', height: 1.4, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: '70%', height: 1.4, backgroundColor: color, borderRadius: 1 }} />
          </View>
        </View>
      );

    case 'more-vertical':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'space-evenly', paddingVertical: 1 }}>
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
        </View>
      );

    case 'external-link':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              bottom: 2,
              left: 2,
              width: size * 0.65,
              height: size * 0.65,
              borderWidth: 1.5,
              borderColor: color,
              borderTopWidth: 0,
              borderRightWidth: 0,
              borderRadius: 2,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: size * 0.35,
              height: size * 0.35,
              borderTopWidth: 1.6,
              borderRightWidth: 1.6,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 3,
              right: 3,
              width: size * 0.5,
              height: 1.6,
              backgroundColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'download':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', top: 2, width: 1.8, height: size * 0.48, backgroundColor: color }} />
          <View
            style={{
              position: 'absolute',
              top: size * 0.28,
              width: size * 0.32,
              height: size * 0.32,
              borderBottomWidth: 1.8,
              borderRightWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 2,
              width: size * 0.75,
              height: 1.8,
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
        </View>
      );

    case 'upload':
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', bottom: 4, width: 1.8, height: size * 0.48, backgroundColor: color }} />
          <View
            style={{
              position: 'absolute',
              top: 3,
              width: size * 0.32,
              height: size * 0.32,
              borderTopWidth: 1.8,
              borderLeftWidth: 1.8,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 2,
              width: size * 0.75,
              height: 1.8,
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
        </View>
      );

    default:
      return (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.2,
            borderColor: color,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.6,
          }}
        >
          <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: color }} />
        </View>
      );
  }
}


