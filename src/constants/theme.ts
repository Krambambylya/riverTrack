

import '@/global.css';

import { Platform } from 'react-native';

export const AppTheme = {
  background: '#1E1E1E',
  foreground: '#FFFFFF',
  card: '#2C2C2E',
  red: '#D93A3A',
  primary: '#2B7A4B',
  primaryForeground: '#FFFFFF',
  secondary: '#3A3A3C',
  mutedForeground: '#8E8E93',
  border: 'rgba(255,255,255,0.1)',
  borderStrong: 'rgba(255,255,255,0.12)',
  inputBackground: '#3A3A3C',
  overlayScrim: 'rgba(0,0,0,0.85)',
  mapRouteLine: '#2B7A4B',
  mapPointStart: '#6BCB9A',
  mapPointFinish: '#D93A3A',
  mapUserOrLineBlue: '#4A9FD8',
  mapUserLocation: '#4A9FD8',
  errorSoft: '#FF9A9A',
  deleteBackground: '#5A2E2E',
  deleteForeground: '#FFDADA',
} as const;

export type AppThemeColor = keyof typeof AppTheme;

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
