import { TextStyle } from 'react-native';
import { Colors } from './Colors';

/**
 * Typography system for Digital Wall mobile app
 * Based on iOS Human Interface Guidelines with warm color palette
 */

export const FontSizes = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 36,
  '6xl': 48,
} as const;

export const FontWeights = {
  light: '300',
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

export const LineHeights = {
  tight: 20,
  snug: 22,
  normal: 24,
  relaxed: 26,
  loose: 28,
  extraLoose: 32,
} as const;

/**
 * Predefined text styles following iOS guidelines
 */
export const Typography = {
  // Display styles
  displayLarge: {
    fontSize: FontSizes['6xl'],
    fontWeight: FontWeights.heavy,
    lineHeight: LineHeights.extraLoose,
    color: Colors.textPrimary,
    letterSpacing: -1,
  } as TextStyle,
  
  displayMedium: {
    fontSize: FontSizes['4xl'],
    fontWeight: FontWeights.bold,
    lineHeight: LineHeights.loose,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  } as TextStyle,
  
  displaySmall: {
    fontSize: FontSizes['3xl'],
    fontWeight: FontWeights.bold,
    lineHeight: LineHeights.relaxed,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  } as TextStyle,
  
  // Headline styles
  headlineLarge: {
    fontSize: FontSizes['2xl'],
    fontWeight: FontWeights.bold,
    lineHeight: LineHeights.relaxed,
    color: Colors.textPrimary,
  } as TextStyle,
  
  headlineMedium: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    lineHeight: LineHeights.normal,
    color: Colors.textPrimary,
  } as TextStyle,
  
  headlineSmall: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    lineHeight: LineHeights.snug,
    color: Colors.textPrimary,
  } as TextStyle,
  
  // Title styles
  titleLarge: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.semibold,
    lineHeight: LineHeights.snug,
    color: Colors.textPrimary,
  } as TextStyle,
  
  titleMedium: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    lineHeight: LineHeights.normal,
    color: Colors.textPrimary,
  } as TextStyle,
  
  titleSmall: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    lineHeight: LineHeights.tight,
    color: Colors.textPrimary,
  } as TextStyle,
  
  // Body text styles
  bodyLarge: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.regular,
    lineHeight: LineHeights.normal,
    color: Colors.textSecondary,
  } as TextStyle,
  
  bodyMedium: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.regular,
    lineHeight: LineHeights.snug,
    color: Colors.textSecondary,
  } as TextStyle,
  
  bodySmall: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.regular,
    lineHeight: LineHeights.tight,
    color: Colors.textTertiary,
  } as TextStyle,
  
  // Label styles
  labelLarge: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    lineHeight: LineHeights.tight,
    color: Colors.textTertiary,
  } as TextStyle,
  
  labelMedium: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.medium,
    lineHeight: LineHeights.tight,
    color: Colors.textTertiary,
  } as TextStyle,
  
  labelSmall: {
    fontSize: 10,
    fontWeight: FontWeights.medium,
    lineHeight: 16,
    color: Colors.textMuted,
    textTransform: 'uppercase',
  } as TextStyle,
  
  // Button styles
  buttonLarge: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    lineHeight: LineHeights.tight,
    color: Colors.surface,
  } as TextStyle,
  
  buttonMedium: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    lineHeight: LineHeights.tight,
    color: Colors.surface,
  } as TextStyle,
  
  buttonSmall: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    lineHeight: LineHeights.tight,
    color: Colors.surface,
  } as TextStyle,
  
  // Special styles
  caption: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.regular,
    lineHeight: LineHeights.tight,
    color: Colors.textMuted,
    fontStyle: 'italic',
  } as TextStyle,
  
  overline: {
    fontSize: 10,
    fontWeight: FontWeights.bold,
    lineHeight: 16,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  } as TextStyle,
  
  link: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.medium,
    lineHeight: LineHeights.normal,
    color: Colors.primary,
    textDecorationLine: 'underline',
  } as TextStyle,
} as const;

export type TypographyStyle = keyof typeof Typography;

/**
 * Helper function to get typography style
 */
export const getTypographyStyle = (style: TypographyStyle): TextStyle => {
  return Typography[style];
};

/**
 * iOS specific typography mappings
 */
export const IOSTypography = {
  largeTitle: Typography.displayMedium,
  title1: Typography.headlineLarge,
  title2: Typography.headlineMedium,
  title3: Typography.titleLarge,
  headline: Typography.titleMedium,
  body: Typography.bodyLarge,
  callout: Typography.bodyMedium,
  subheadline: Typography.labelLarge,
  footnote: Typography.bodySmall,
  caption1: Typography.labelMedium,
  caption2: Typography.caption,
} as const;