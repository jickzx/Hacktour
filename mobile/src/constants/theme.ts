/**
 * Hacktour theme — Xiaohongshu-inspired dark mode design system.
 * Content-first minimalism, generous whitespace, warm coral-red accents.
 */
import { Platform } from "react-native";

export const COLORS = {
  primary: "#FF2442",
  primaryLight: "#FF6B81",
  primaryDark: "#E01E3C",
  primaryBg: "rgba(255,36,66,0.15)",
  primaryBgStrong: "rgba(255,36,66,0.25)",

  accent: "#FF8A00",
  accentLight: "#FFB347",
  accentDim: "rgba(255,138,0,0.2)",

  background: "#000000",
  surface: "#111113",
  surfaceElevated: "#1A1A1D",
  surfaceLight: "#202024",
  surfaceBorder: "#2A2A2E",
  uploadBg: "#0E0E10",

  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.6)",
  textMuted: "rgba(255,255,255,0.38)",
  textOnPrimary: "#FFFFFF",

  border: "#2A2A2E",
  borderLight: "#1C1C1F",

  error: "#FF2442",
  success: "#00C853",
  warning: "#FFB347",
  info: "#64B5F6",

  overlay: "rgba(0,0,0,0.45)",
  overlayLight: "rgba(0,0,0,0.25)",
  overlayDark: "rgba(0,0,0,0.7)",

  gradientStart: "#FF2442",
  gradientEnd: "#FF6B81",

  liveRed: "#FF2442",
  chatBg: "rgba(0,0,0,0.35)",

  glassLight: "rgba(30,30,34,0.65)",
  glassDark: "rgba(10,10,12,0.72)",
  glassBorder: "rgba(255,255,255,0.08)",

  shimmerBase: "#1A1A1D",
  shimmerHighlight: "#2A2A2E",

  tagBg: "rgba(255,36,66,0.12)",
  tagText: "#FF6B81",

  green: "#34D399",
  greenBg: "rgba(52,211,153,0.15)",
  purple: "#A855F7",
  purpleBg: "rgba(168,85,247,0.2)",
  yellow: "#FACC15",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const RADII = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
};

export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 22,
  title: 26,
  hero: 32,
};

export const WEIGHTS = {
  light: "300" as const,
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  heavy: "800" as const,
};

export const SHADOWS = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  float: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  fab: {
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
};

export const ANIMATIONS = {
  spring: { tension: 80, friction: 12, useNativeDriver: true },
  fast: { duration: 150, useNativeDriver: true },
  normal: { duration: 300, useNativeDriver: true },
  slow: { duration: 500, useNativeDriver: true },
};

/** Safe area insets for bottom padding */
export const SAFE_BOTTOM = Platform.OS === "ios" ? 34 : 16;
