/**
 * LUMI Design System Tokens
 * All colors, typography, spacing, and shape values.
 * Never hard-code these values in screens or components.
 */

export const colors = {
  light: {
    primary: '#5B5BF0',
    primarySoft: '#EEF0FF',
    primaryText: '#FFFFFF',
    accent: '#FFB84D',
    background: '#FAFAFC',
    surface: '#FFFFFF',
    surfaceRaised: '#F1F3F7',
    surfaceAlt: '#F8F9FC',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textTertiary: '#94A3B8',
    border: '#E8ECF2',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    error: '#EF4444',
  },
  dark: {
    primary: '#8585FF',
    primarySoft: '#222544',
    primaryText: '#FFFFFF',
    accent: '#FFC56E',
    background: '#0B0D17',
    surface: '#141726',
    surfaceRaised: '#1D2136',
    surfaceAlt: '#181C2E',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textTertiary: '#64748B',
    border: '#23283E',
    success: '#34D399',
    warning: '#FBBF24',
    danger: '#F87171',
    error: '#F87171',
  },
} as const;

export type ColorToken = keyof typeof colors.light;
export type ThemeMode = 'light' | 'dark';

export const fonts = {
  heading: 'BricolageGrotesque_700Bold',
  headingBold: 'BricolageGrotesque_800ExtraBold',
  headingSemiBold: 'BricolageGrotesque_600SemiBold',
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemiBold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
} as const;

export const typography = {
  display: {
    fontFamily: fonts.headingBold,
    fontSize: 32,
    lineHeight: 40,
  },
  h1: {
    fontFamily: fonts.heading,
    fontSize: 26,
    lineHeight: 32,
  },
  h2: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 20,
    lineHeight: 28,
  },
  h3: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 18,
    lineHeight: 24,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    lineHeight: 24,
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  bodyBold: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 24,
  },
  bodySmall: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 16,
  },
  button: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 20,
  },
  overline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
  },
} as const;

export type TypographyToken = keyof typeof typography;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  '2xl': 28,
  '3xl': 36,
  '4xl': 48,
  screenPadding: 20,
} as const;

export type SpacingToken = keyof typeof spacing;

export const radius = {
  xs: 6,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
  pill: 999,
} as const;

export const shadows = {
  light: {
    card: {
      shadowColor: '#14142B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 3,
    },
    raised: {
      shadowColor: '#14142B',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 5,
    },
  },
  dark: {
    card: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    raised: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  },
} as const;

export const motion = {
  fast: 200,
  normal: 300,
  slow: 500,
  spring: {
    damping: 20,
    stiffness: 300,
    mass: 0.8,
  },
} as const;

export const hapticIntensity = {
  light: 'light' as const,
  medium: 'medium' as const,
  heavy: 'heavy' as const,
} as const;

// Robot color swatches for pairing
export const robotColors = {
  violet: '#5B5BF0',
  mint: '#2DD4BF',
  teal: '#2DD4BF',
  coral: '#FF6B6B',
  amber: '#FFB84D',
  rose: '#F472B6',
  sky: '#38BDF8',
} as const;

export type RobotColorKey = keyof typeof robotColors;
