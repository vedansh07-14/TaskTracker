export const Colors = {
  // Base
  background: '#0A0A0F',
  surface: '#16161F',
  surfaceElevated: '#1E1E2A',
  surfaceHover: '#252536',
  border: '#2A2A3D',
  borderSubtle: '#1F1F30',

  // Text
  textPrimary: '#F0F0F5',
  textSecondary: '#9090A8',
  textTertiary: '#606078',
  textInverse: '#0A0A0F',

  // Accent / Brand
  accentPrimary: '#6C5CE7',
  accentSecondary: '#00CEFF',
  accentGradientStart: '#6C5CE7',
  accentGradientEnd: '#00CEFF',

  // Status
  done: '#00E676',
  doneBg: 'rgba(0, 230, 118, 0.12)',
  skipped: '#FFD600',
  skippedBg: 'rgba(255, 214, 0, 0.12)',
  missed: '#FF5252',
  missedBg: 'rgba(255, 82, 82, 0.12)',

  // Category tag colors
  categoryColors: [
    '#6C5CE7',
    '#00CEFF',
    '#FF6B6B',
    '#FDCB6E',
    '#00B894',
    '#E84393',
    '#0984E3',
    '#FD79A8',
  ] as const,

  // Tab bar
  tabBarBg: '#0E0E16',
  tabBarBorder: '#1A1A28',
  tabBarActive: '#6C5CE7',
  tabBarInactive: '#606078',

  // Timer
  timerActive: '#00CEFF',
  timerBg: 'rgba(0, 206, 255, 0.08)',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 40,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,
};

export const Shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
