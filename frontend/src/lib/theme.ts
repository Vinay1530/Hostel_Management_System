/**
 * Unified design tokens for PG Manager.
 *
 * One neutral foundation (cool slate) is shared by every role; only the accent
 * changes: Indigo for managers, Sky for tenants and Teal for the guest portal.
 */
export const palette = {
  // Neutral foundation
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceAlt: "#F1F5F9",
  border: "#E2E8F0",
  text: "#0F172A",
  textLight: "#64748B",
  textMuted: "#94A3B8",

  // Role accents
  indigo: "#4F46E5",
  indigoDark: "#4338CA",
  indigoSoft: "#EEF2FF",
  sky: "#0284C7",
  skyDark: "#0369A1",
  skySoft: "#F0F9FF",
  skyTint: "#E0F2FE",
  teal: "#0D9488",
  tealDark: "#0F766E",
  tealSoft: "#F0FDFA",

  // Status
  emerald: "#10B981",
  emeraldSoft: "#ECFDF5",
  amber: "#F59E0B",
  amberSoft: "#FFFBEB",
  rose: "#F43F5E",
  roseSoft: "#FFF1F2",

  // Deep slate used by KPI cards / dark surfaces
  slate: "#475569",
  slateDark: "#334155",
} as const;

export const roleAccents = {
  manager: {
    accent: palette.indigo,
    accentDark: palette.indigoDark,
    accentSoft: palette.indigoSoft,
    accentText: palette.indigoDark,
  },
  tenant: {
    accent: palette.sky,
    accentDark: palette.skyDark,
    accentSoft: palette.skySoft,
    accentText: palette.skyDark,
  },
  guest: {
    accent: palette.teal,
    accentDark: palette.tealDark,
    accentSoft: palette.tealSoft,
    accentText: palette.tealDark,
  },
} as const;

export type RoleAccent = (typeof roleAccents)[keyof typeof roleAccents];

/**
 * Tenant-facing theme. Kept for backwards compatibility with existing screens;
 * the neutral surface values now match the shared foundation.
 */
export const theme = {
  bg: palette.background,
  bgDeep: "#EEF2F7",
  card: palette.surface,
  cardSoft: "#F8FAFC",
  border: palette.border,
  text: palette.text,
  textLight: palette.textLight,
  textMuted: palette.textMuted,
  accent: palette.sky,
  accentDark: palette.skyDark,
  accentSoft: palette.skySoft,
  accentText: palette.skyDark,
  dark: palette.text,

  success: palette.emerald,
  successSoft: palette.emeraldSoft,
  warn: palette.amber,
  warnSoft: palette.amberSoft,
  warning: palette.amber,
  warningSoft: palette.amberSoft,
  danger: palette.rose,
  dangerSoft: palette.roseSoft,
  info: palette.sky,
  infoSoft: palette.skySoft,

  chipBg: palette.surfaceAlt,
  chipBorder: palette.border,

  // Convenience aliases
  background: palette.background,
  surface: palette.surface,
  primary: palette.indigo,
  primaryLight: palette.indigoSoft,
} as const;

export const FACILITY_OPTIONS = [
  { key: "wifi", label: "WiFi", icon: "wifi" },
  { key: "laundry", label: "Laundry", icon: "shirt-outline" },
  { key: "parking", label: "Parking", icon: "car-outline" },
  { key: "mess", label: "Mess / Food", icon: "restaurant-outline" },
  { key: "hot-water", label: "Hot Water", icon: "water-outline" },
  { key: "water-purifier", label: "Water Purifier", icon: "water-outline" },
  { key: "cctv", label: "CCTV", icon: "videocam-outline" },
  { key: "power-backup", label: "Power Backup", icon: "flash-outline" },
  { key: "housekeeping", label: "Housekeeping", icon: "sparkles-outline" },
  { key: "ac", label: "AC", icon: "snow-outline" },
] as const;

export function parseFacilities(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function facilityIcon(key: string): string {
  return FACILITY_OPTIONS.find((f) => f.key === key)?.icon ?? "checkmark-circle-outline";
}

export function facilityLabel(key: string): string {
  return FACILITY_OPTIONS.find((f) => f.key === key)?.label ?? key;
}
