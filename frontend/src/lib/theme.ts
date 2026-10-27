export const theme = {
  bg: "#eaf4fd",
  bgDeep: "#dcecfb",
  card: "#ffffff",
  cardSoft: "#f7fbfe",
  border: "#dce9f6",
  text: "#122733",
  textLight: "#7991a5",
  accent: "#2f9df3",
  accentDark: "#1687e0",
  accentSoft: "#e2f2ff",
  accentText: "#1779c4",
  dark: "#0f1e29",
  success: "#1fb573",
  successSoft: "#e3f8ee",
  warn: "#f2a33c",
  warnSoft: "#fdf1de",
  danger: "#ef4444",
  info: "#2f9df3",
  infoSoft: "#e6f4fe",
  chipBg: "#f3f9fe",
  chipBorder: "#d9e9f7",
} as const;

export const FACILITY_OPTIONS = [
  { key: "wifi", label: "WiFi", icon: "wifi" },
  { key: "laundry", label: "Laundry", icon: "shirt-outline" },
  { key: "parking", label: "Parking", icon: "car-outline" },
  { key: "mess", label: "Mess / Food", icon: "restaurant-outline" },
  { key: "hot-water", label: "Hot Water", icon: "water-outline" },
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
