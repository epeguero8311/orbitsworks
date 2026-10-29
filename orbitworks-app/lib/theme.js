// Shared design tokens: colors, spacing, corner radii and type sizes.
// ThemeContext (useTheme) serves lightColors/darkColors from here; the
// Employee App screens always use lightColors.

export const lightColors = {
  background: "#ffffff",
  card: "#f9fafb",
  surface: "#ffffff",
  text: "#0f172a",
  subtext: "#64748b",
  muted: "#9ca3af",
  border: "#e5e7eb",
  accent: "#3b6fe0",
  accentSoft: "#e8effc",
  green: "#22c55e",
  greenStrong: "#16a34a",
  greenSoft: "#dcfce7",
  greenText: "#15803d",
  red: "#ef4444",
  redStrong: "#dc2626",
  orange: "#f59e0b",
  orangeStrong: "#f97316",
  orangeSoft: "#ffedd5",
  orangeText: "#c2410c",
  neutralSoft: "#f1f5f9",
  track: "#f1f5f9",
  dotOff: "#d1d5db",
  keypad: "#e5e7eb",
  keypadPressed: "#b8bcc4",
  overlay: "rgba(15,23,42,0.5)",
  onColor: "#ffffff",
};

export const darkColors = {
  background: "#0b0b0f",
  card: "#18181b",
  surface: "#18181b",
  text: "#f4f4f5",
  subtext: "#a1a1aa",
  muted: "#71717a",
  border: "#27272a",
  accent: "#5b8def",
  accentSoft: "#1e2a44",
  green: "#22c55e",
  greenStrong: "#16a34a",
  greenSoft: "#14321f",
  greenText: "#4ade80",
  red: "#f87171",
  redStrong: "#ef4444",
  orange: "#f59e0b",
  orangeStrong: "#f97316",
  orangeSoft: "#3a2410",
  orangeText: "#fdba74",
  neutralSoft: "#27272a",
  track: "#27272a",
  dotOff: "#3f3f46",
  keypad: "#27272a",
  keypadPressed: "#52525b",
  overlay: "rgba(0,0,0,0.6)",
  onColor: "#ffffff",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

// System font (San Francisco / Roboto) - no custom font to load.
export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  timer: 52,
};
