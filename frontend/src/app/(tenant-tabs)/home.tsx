import { api, rupeesFromPaise } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";
import { getShadow } from "@/lib/design";
import { roleAccents, theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCallback, useState } from "react";
import { Skeleton } from "@/components/ui-components";

type DuesRow = {
  invoice_id: string;
  period_month: string;
  amount_paise: number;
  paid_paise: number;
  balance_paise: number;
  due_date: string;
  status: string;
  property_name: string;
  room_number: string;
  bed_label: string;
};

type MyProfile = {
  full_name: string;
  phone: string;
  email?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  id_number?: string | null;
  room_number: string | null;
  bed_label: string | null;
  property_name: string | null;
  rent_paise: number | null;
  deposit_paise: number | null;
  move_in_date: string | null;
  notice_start_date: string | null;
  notice_end_date: string | null;
  notice_period_days: number | null;
};

type MyOverview = {
  profile: MyProfile;
  invoices: DuesRow[];
};

const accent = roleAccents.tenant;

function d(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

function prettyDate(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function monthLabel(month?: string | null): string {
  if (!month) return "Rent";
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return `${new Date(year, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  })} rent`;
}

function formatTenure(moveInIso: string | null): string {
  if (!moveInIso) return "—";
  const start = new Date(moveInIso);
  const now = new Date();
  if (isNaN(start.getTime()) || start > now) return "Just started";

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonthDays;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} day${days !== 1 ? "s" : ""}`);
  return parts.join(", ");
}

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function TenantHome() {
  const { ready, token } = useAuth();
  const { unread } = useNotifications();
  const router = useRouter();
  const [data, setData] = useState<MyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setData(await api.get<MyOverview>("/my/overview"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load your details");
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!ready) return <Splash />;
  if (!token) return <Redirect href="/login" />;

  const p = data?.profile;
  const onNotice = !!p?.notice_start_date;
  const invoices = data?.invoices ?? [];
  const unpaid = invoices.filter((inv) => inv.status !== "void" && inv.balance_paise > 0);
  const totalDue = unpaid.reduce((sum, inv) => sum + inv.balance_paise, 0);
  const nextDue = [...unpaid].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];
  const bookingActive = !!p?.room_number;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>MY STAY</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {p?.full_name ? `Hi, ${p.full_name.split(" ")[0]}` : "My Stay"}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {p?.property_name ?? "Your PG home"}
          </Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => router.push("/notifications")}>
          <Ionicons name="notifications-outline" size={20} color={theme.text} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={styles.avatarBtn}
          onPress={() => router.push("/(tenant-tabs)/profile")}
          accessibilityLabel="Open profile"
        >
          <Text style={styles.avatarBtnText}>{initials(p?.full_name ?? "U")}</Text>
        </Pressable>
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Loading skeleton */}
      {!data && !error && (
        <View style={{ gap: 12 }}>
          <View style={styles.statsRow}>
            <Skeleton height={108} radius={16} style={{ flex: 1 }} />
            <Skeleton height={108} radius={16} style={{ flex: 1 }} />
            <Skeleton height={108} radius={16} style={{ flex: 1 }} />
          </View>
          <Skeleton height={150} radius={16} />
          <Skeleton height={90} radius={16} />
        </View>
      )}

      {p && (
        <>
          {/* KPI cards */}
          <View style={styles.statsRow}>
            <View style={[styles.kpiCard, styles.kpiPrimary]}>
              <View style={styles.kpiIconLight}>
                <Ionicons name="cash" size={15} color="#fff" />
              </View>
              <Text style={styles.kpiLabelLight}>RENT DUE</Text>
              <Text style={styles.kpiValueLight} numberOfLines={1} adjustsFontSizeToFit>
                {rupeesFromPaise(totalDue)}
              </Text>
              <Text style={styles.kpiSubLight} numberOfLines={1}>
                {totalDue > 0 ? `Due ${prettyDate(nextDue?.due_date)}` : "All clear"}
              </Text>
            </View>

            <Pressable
              style={styles.kpiCard}
              onPress={() => router.push("/(tenant-tabs)/profile")}
            >
              <View style={styles.kpiIcon}>
                <Ionicons name="bed" size={15} color={accent.accent} />
              </View>
              <Text style={styles.kpiLabel}>ROOM</Text>
              <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
                {p.room_number ?? "—"}
              </Text>
              <Text style={styles.kpiSub} numberOfLines={1}>
                Bed {p.bed_label ?? "—"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.kpiCard}
              onPress={() => router.push("/(tenant-tabs)/profile")}
            >
              <View style={[styles.kpiIcon, { backgroundColor: theme.successSoft }]}>
                <Ionicons name="calendar" size={15} color={theme.success} />
              </View>
              <Text style={styles.kpiLabel}>MY BOOKING</Text>
              <Text
                style={[styles.kpiValue, { color: bookingActive ? theme.success : theme.warn }]}
                numberOfLines={1}
              >
                {bookingActive ? "Active" : "Pending"}
              </Text>
              <Text style={styles.kpiSub} numberOfLines={1}>
                {formatTenure(p.move_in_date)}
              </Text>
            </Pressable>
          </View>

          {/* Next payment */}
          <View style={styles.card}>
            <View style={styles.cardHeaderStatic}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>
                  {totalDue > 0 ? "Next payment" : "All caught up"}
                </Text>
                <Text style={styles.cardHeaderSub}>
                  {totalDue > 0
                    ? monthLabel(nextDue?.period_month)
                    : "You have no pending dues"}
                </Text>
              </View>
              <View
                style={[
                  styles.statusChip,
                  { backgroundColor: totalDue > 0 ? theme.warnSoft : theme.successSoft },
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    { color: totalDue > 0 ? "#92400e" : theme.success },
                  ]}
                >
                  {totalDue > 0 ? "Due" : "Clear"}
                </Text>
              </View>
            </View>

            <View style={styles.amountRow}>
              <Text style={styles.amountValue} numberOfLines={1} adjustsFontSizeToFit>
                {rupeesFromPaise(totalDue)}
              </Text>
              <Text style={styles.amountSub}>
                {totalDue > 0 ? `Due by ${prettyDate(nextDue?.due_date)}` : "Nothing to pay"}
              </Text>
            </View>

            <Pressable
              style={styles.primaryBtn}
              onPress={() => router.push("/(tenant-tabs)/dues")}
            >
              <Text style={styles.primaryBtnText}>
                {totalDue > 0 ? "Pay rent" : "View payment history"}
              </Text>
            </Pressable>
          </View>

          {/* Notice summary */}
          {onNotice && (
            <Pressable
              style={styles.noticeCard}
              onPress={() => router.push("/(tenant-tabs)/profile")}
            >
              <View style={styles.noticeIcon}>
                <Ionicons name="time-outline" size={17} color={theme.danger} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.noticeTitle}>Notice period active</Text>
                <Text style={styles.noticeSub} numberOfLines={1}>
                  {d(p.notice_start_date)} → {d(p.notice_end_date)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
            </Pressable>
          )}

          {/* Quick actions */}
          <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
          <View style={styles.quickRow}>
            <QuickAction icon="cash" label="Pay Rent" onPress={() => router.push("/(tenant-tabs)/dues")} />
            <QuickAction icon="chatbubbles" label="Chat" onPress={() => router.push("/(tenant-tabs)/inbox")} />
            <QuickAction icon="construct" label="Complaint" onPress={() => router.push("/complaints/new")} />
            <QuickAction icon="receipt" label="History" onPress={() => router.push("/(tenant-tabs)/history")} />
          </View>

          <Pressable
            style={styles.profileLink}
            onPress={() => router.push("/(tenant-tabs)/profile")}
          >
            <Ionicons name="person-circle-outline" size={17} color={accent.accent} />
            <Text style={styles.profileLinkText}>
              Stay details, rent, notice and account in Profile
            </Text>
            <Ionicons name="chevron-forward" size={15} color={theme.textMuted} />
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickItem} onPress={onPress}>
      <View style={styles.quickCircle}>
        <Ionicons name={icon as any} size={21} color={accent.accent} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Splash() {
  return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingTop: 8, paddingBottom: 40 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: accent.accent,
    marginBottom: 3,
  },
  headerTitle: { fontSize: 23, fontWeight: "800", color: theme.text, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: theme.textLight, fontWeight: "600", marginTop: 1 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    ...getShadow("sm"),
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: accent.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  // KPI cards
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  kpiCard: {
    flex: 1,
    minHeight: 108,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    padding: 11,
    ...getShadow("sm"),
  },
  kpiPrimary: {
    backgroundColor: accent.accent,
    borderColor: accent.accent,
    ...getShadow("md"),
  },
  kpiIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  kpiIconLight: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  kpiLabel: { color: theme.textLight, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  kpiLabelLight: { color: "rgba(255,255,255,0.75)", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  kpiValue: { color: theme.text, fontSize: 21, fontWeight: "800", letterSpacing: -0.3, marginTop: 2 },
  kpiValueLight: { color: "#fff", fontSize: 20, fontWeight: "800", letterSpacing: -0.3, marginTop: 2 },
  kpiSub: { color: theme.textLight, fontSize: 10, fontWeight: "600", marginTop: 2 },
  kpiSubLight: { color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: "600", marginTop: 2 },

  // Cards
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
    ...getShadow("sm"),
  },
  cardHeaderStatic: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardHeaderSub: { fontSize: 12, color: theme.textLight, marginTop: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: theme.text },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: theme.textLight,
    marginBottom: 9,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusChipText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  amountRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 14,
    marginBottom: 12,
  },
  amountValue: { fontSize: 28, fontWeight: "800", color: theme.text, letterSpacing: -0.5 },
  amountSub: { fontSize: 11, fontWeight: "700", color: theme.textLight },

  // Notice summary
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
    ...getShadow("sm"),
  },
  noticeIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: theme.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeTitle: { fontSize: 13, fontWeight: "800", color: theme.text },
  noticeSub: { fontSize: 11, color: theme.textLight, marginTop: 1 },

  // Quick actions
  quickRow: { flexDirection: "row", gap: 4, marginBottom: 16 },
  quickItem: { flex: 1, alignItems: "center", gap: 6 },
  quickCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { fontSize: 10, fontWeight: "700", color: theme.textLight, textAlign: "center" },

  profileLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    ...getShadow("sm"),
  },
  profileLinkText: { flex: 1, fontSize: 11, fontWeight: "700", color: theme.textLight },

  // Buttons
  primaryBtn: {
    backgroundColor: accent.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  // Error
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.dangerSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { flex: 1, color: theme.danger, fontSize: 12 },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: "#fff" },
  retryText: { color: theme.danger, fontSize: 11, fontWeight: "800" },
});
