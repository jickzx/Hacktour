/**
 * Hacktour theme — Xiaohongshu (rednote) dark mode clone.
 * Pure black surfaces, coral-red primary, system font (SF Pro / Roboto).
 */
import { Platform } from "react-native";

export const COLORS = {
  // Brand red (XHS)
  primary: "#FF2442",
  primaryLight: "#FF6B81",
  primaryDark: "#E01E3C",
  primaryBg: "rgba(255,36,66,0.15)",

  // Accent (orange/coral)
  accent: "#FF8A00",
  accentLight: "#FFB347",
  accentDim: "rgba(255,138,0,0.2)",

  // Dark surfaces
  background: "#000000",
  surface: "#111113",
  surfaceElevated: "#1A1A1D",
  surfaceLight: "#202024",
  surfaceBorder: "#2A2A2E",
  uploadBg: "#0E0E10",

  // Text
  text: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.6)",
  textMuted: "rgba(255,255,255,0.38)",
  textOnPrimary: "#FFFFFF",

  // Borders
  border: "#2A2A2E",
  borderLight: "#1C1C1F",

  // States
  error: "#FF2442",
  success: "#00C853",

  // Overlays
  overlay: "rgba(0,0,0,0.45)",
  overlayLight: "rgba(0,0,0,0.25)",
  overlayDark: "rgba(0,0,0,0.7)",

  // Gradients
  gradientStart: "#FF2442",
  gradientEnd: "#FF6B81",

  // Live stream
  liveRed: "#FF2442",
  chatBg: "rgba(0,0,0,0.35)",

  // Glossy panels (dark frosted)
  glassLight: "rgba(30,30,34,0.65)",
  glassDark: "rgba(10,10,12,0.72)",
  glassBorder: "rgba(255,255,255,0.08)",
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
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
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

/**
 * System font — SF Pro on iOS, Roboto on Android.
 * Weights are expressed via `fontWeight` on iOS; Android uses weight-named families.
 * Using `undefined` for fontFamily lets the platform pick the default system font.
 */
const systemFont = Platform.select({ ios: undefined, default: undefined });

export const FONTS = {
  light: systemFont,
  regular: systemFont,
  medium: systemFont,
  semibold: systemFont,
  bold: systemFont,
};

/** Numeric weights matching the old fontFamily slots — use with `fontWeight`. */
export const WEIGHTS = {
  light: "300" as const,
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  heavy: "800" as const,
};
