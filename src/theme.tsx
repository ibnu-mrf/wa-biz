import React from 'react';
import { View } from 'react-native';

// ==========================================
// PALET WARNA B2B SAAS WABIZ
// ==========================================
export const COLORS = {
  forestDark: '#123C32',      // Deep forest green untuk sidebar & brand utama
  forestHeader: '#0E3028',    // Sedikit lebih gelap untuk header sidebar
  emerald: '#16A36A',         // Emerald untuk aksen primer & CTA utama
  emeraldHover: '#0E7A4E',    // Emerald gelap untuk hover / pressed
  emeraldSubtle: '#EAF6F0',   // Aksen lembut hijau untuk badge aktif
  emeraldBorder: '#C1E6D3',   // Border halus untuk aksen hijau
  neutralBg: '#F5F7F6',       // Latar canvas netral profesional
  surface: '#FFFFFF',         // Kartu & panel putih bersih
  surfaceMuted: '#FAFCFB',    // Latar kartu sekunder
  border: '#E4EAE6',          // Border halus standar CRM
  borderStrong: '#CDD7D1',    // Border lebih tegas untuk fokus / input
  textDark: '#17231F',        // Teks gelap utama dengan kontras tinggi
  textSecondary: '#718078',   // Teks abu-abu untuk deskripsi & label
  textMuted: '#95A39C',       // Teks sangat redup untuk placeholder/sub-info
  warningBg: '#FFFBEB',       // Amber lembut untuk status belum terhubung
  warningBorder: '#FDE68A',   // Border amber
  warningText: '#B45309',     // Teks amber
  warningDot: '#F59E0B',      // Titik indikator amber
  infoBg: '#EFF6FF',          // Biru lembut untuk status AI
  infoBorder: '#BFDBFE',
  infoText: '#1D4ED8',
  purpleBg: '#F5F3FF',        // Ungu untuk AI
  purpleBorder: '#DDD6FE',
  purpleText: '#6D28D9',
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
    | 'plus'
    | 'check'
    | 'alert'
    | 'link'
    | 'menu'
    | 'close'
    | 'arrow-left'
    | 'send'
    | 'refresh'
    | 'edit'
    | 'trash'
    | 'copy'
    | 'phone'
    | 'filter'
    | 'calendar'
    | 'clock';
  size?: number;
  color?: string;
}

export function AppIcon({ name, size = 18, color = COLORS.textSecondary }: AppIconProps) {
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

    default:
      return <View style={{ width: size, height: size }} />;
  }
}
