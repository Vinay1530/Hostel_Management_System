/**
 * Staff design tokens. The palette now matches the unified foundation in
 * `theme.ts`; only the accent is role-tinted (indigo for manager/owner).
 */
export const design = {
  // Colors — cool slate foundation + indigo accent
  colors: {
    primary: "#4F46E5",
    primaryDark: "#4338CA",
    primaryLight: "#EEF2FF",
    secondary: "#0D9488",
    secondaryLight: "#F0FDFA",
    success: "#10B981",
    successLight: "#ECFDF5",
    warning: "#F59E0B",
    warningLight: "#FFFBEB",
    danger: "#F43F5E",
    dangerLight: "#FFF1F2",
    info: "#0284C7",
    infoLight: "#F0F9FF",

    // Backgrounds
    background: "#F8FAFC",
    surface: "#FFFFFF",
    surfaceVariant: "#F1F5F9",

    // Text
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    textMuted: "#94A3B8",
    textInverse: "#FFFFFF",

    // Borders
    border: "#E2E8F0",
    borderFocus: "#4F46E5",

    // Deep surfaces for KPI cards
    slate: "#475569",
    slateDark: "#334155",

    // Shadows (iOS style)
    shadow: "0px 1px 3px rgba(15, 23, 42, 0.04), 0px 1px 2px rgba(15, 23, 42, 0.03)",
    shadowLg: "0px 8px 24px rgba(15, 23, 42, 0.06), 0px 2px 6px rgba(15, 23, 42, 0.03)",

    // Gradients
    gradientPrimary: ["#4F46E5", "#4338CA"],
    gradientSuccess: ["#10B981", "#059669"],
    gradientDanger: ["#F43F5E", "#E11D48"],
  },

  // Typography scale
  typography: {
    h1: { fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
    h2: { fontSize: 24, fontWeight: "800", letterSpacing: -0.4 },
    h3: { fontSize: 20, fontWeight: "700", letterSpacing: -0.2 },
    h4: { fontSize: 17, fontWeight: "700", letterSpacing: -0.1 },
    bodyLarge: { fontSize: 16, fontWeight: "400" },
    body: { fontSize: 14, fontWeight: "400" },
    bodySmall: { fontSize: 13, fontWeight: "400" },
    caption: { fontSize: 12, fontWeight: "500" },
    label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
    button: { fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
  },

  // 8pt spacing scale
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  // Border radius
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    sheet: 24,
    full: 999,
  },

  // Elevation (Android shadow)
  elevation: {
    sm: 1,
    md: 2,
    lg: 4,
    xlg: 8,
  },
} as const;

export type DesignTokens = typeof design;

/** Ultra-soft ambient shadows shared by cards, sheets and floating controls. */
export function getShadow(level: "sm" | "md" | "lg" | "xlg" = "md") {
  const map: Record<
    string,
    {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    }
  > = {
    sm: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 1,
    },
    md: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 12,
      elevation: 2,
    },
    lg: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.05,
      shadowRadius: 20,
      elevation: 4,
    },
    xlg: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.07,
      shadowRadius: 28,
      elevation: 8,
    },
  };
  return map[level];
}
