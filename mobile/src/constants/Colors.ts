/**
 * Color palette for Digital Wall mobile app
 * Warm, inviting color scheme designed for optimal screen estate utilization
 */

export const Colors = {
  // Primary warm orange palette
  primary: '#FF6B35',
  primaryLight: '#FF8E53',
  primaryDark: '#E55722',
  
  // Secondary warm tones
  secondary: '#FFA726',
  secondaryLight: '#FFB74D',
  secondaryDark: '#FF9800',
  
  // Background colors
  background: '#FFF8F6',        // Warm off-white
  backgroundSecondary: '#FFF0ED', // Light warm tint
  surface: '#FFFFFF',           // Pure white for cards
  
  // Text colors - warm brown palette
  textPrimary: '#2D1810',       // Deep warm brown
  textSecondary: '#5D4037',     // Medium warm brown
  textTertiary: '#8B4513',      // Warm brown
  textMuted: '#A1887F',         // Light warm brown
  
  // Accent colors
  accent: '#E91E63',            // Pink for videos
  accentBlue: '#3F51B5',        // Blue for articles
  accentGreen: '#4CAF50',       // Green for text content
  
  // Status colors
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',
  
  // Neutral grays (minimal use)
  gray50: '#F5F5F5',
  gray100: '#EEEEEE',
  gray200: '#E0E0E0',
  gray300: '#BDBDBD',
  gray400: '#9E9E9E',
  gray500: '#757575',
  
  // Transparent overlays
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  primaryOverlay: 'rgba(255, 107, 53, 0.1)',
  
  // Shadow colors
  shadowPrimary: '#FF6B35',
  shadowDark: '#000000',
} as const;

export type ColorKey = keyof typeof Colors;

/**
 * Content type specific color mappings
 */
export const ContentTypeColors = {
  image: Colors.primary,
  video: Colors.accent,
  article: Colors.accentBlue,
  link: Colors.secondary,
  text: Colors.accentGreen,
  pdf: Colors.textTertiary,
  default: Colors.primary,
} as const;

/**
 * Get color for content type
 */
export const getContentTypeColor = (contentType: string): string => {
  const type = contentType.toLowerCase() as keyof typeof ContentTypeColors;
  return ContentTypeColors[type] || ContentTypeColors.default;
};

/**
 * iOS specific color mappings for system integration
 */
export const IOSColors = {
  systemBackground: Colors.background,
  label: Colors.textPrimary,
  secondaryLabel: Colors.textSecondary,
  tertiaryLabel: Colors.textTertiary,
  placeholderText: Colors.textMuted,
  separator: Colors.gray200,
  link: Colors.primary,
} as const;