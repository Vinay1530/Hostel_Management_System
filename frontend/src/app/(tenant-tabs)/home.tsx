import { ConfirmDialog, Sheet } from "@/components/ui";
import { api, rupeesFromPaise } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";
import { fetchPublicPg, type PublicPgDetail } from "@/lib/public";
import { getShadow } from "@/lib/design";
import { roleAccents, theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  const { logout, ready, token, orgId } = useAuth();
  const { unread } = useNotifications();
  const router = useRouter();
  const [data, setData] = useState<MyOverview | null>(null);
  const [pg, setPg] = useState<PublicPgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noticeConfirm, setNoticeConfirm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [confirmSignout, setConfirmSignout] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(true);
  const [busy, setBusy] = useState(false);

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
      if (orgId) fetchPublicPg(orgId).then(setPg).catch(() => setPg(null));
    }, [load, orgId])
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

  async function startNotice() {
    setNoticeConfirm(false);
    setBusy(true);
    try {
      await api.post("/my/notice", {});
      await load();
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Failed to start notice");
    } finally {
      setBusy(false);
    }
  }

  async function cancelNotice() {
    setCancelConfirm(false);
    setBusy(true);
    try {
      await api.post("/my/notice/cancel", {});
      await load();
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Failed to cancel notice");
    } finally {
      setBusy(false);
    }
  }

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
        <Pressable style={styles.avatarBtn} onPress={() => setProfileOpen(true)}>
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
          <Skeleton height={190} radius={16} />
          <Skeleton height={80} radius={16} />
          <Skeleton height={150} radius={16} />
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

            <View style={styles.kpiCard}>
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
            </View>

            <View style={styles.kpiCard}>
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
            </View>
          </View>

          {/* Room details */}
          <View style={styles.card}>
            <Pressable style={styles.cardHeader} onPress={() => setRoomOpen((v) => !v)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Room Details</Text>
                <Text style={styles.cardHeaderSub}>
                  {p.property_name ? `${p.property_name} · Room ${p.room_number ?? "—"}` : "No room assigned yet"}
                </Text>
              </View>
              <Ionicons
                name={roomOpen ? "chevron-up" : "chevron-down"}
                size={18}
                color={theme.textLight}
              />
            </Pressable>

            <View style={styles.roomHero}>
              <View style={styles.roomIcon}>
                <Ionicons name="bed" size={22} color={accent.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roomTitle}>
                  Room {p.room_number ?? "—"}
                </Text>
                <Text style={styles.roomSub}>
                  Bed {p.bed_label ?? "—"} · {p.property_name ?? "PG"}
                </Text>
              </View>
              <View
                style={[
                  styles.statusChip,
                  {
                    backgroundColor:
                      totalDue > 0 ? theme.warnSoft : theme.successSoft,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    { color: totalDue > 0 ? "#92400e" : theme.success },
                  ]}
                >
                  {totalDue > 0 ? "Next bill pending" : "All clear"}
                </Text>
              </View>
            </View>

            {roomOpen && (
              <View style={styles.detailRows}>
                <DetailRow
                  label="Rent due date"
                  value={totalDue > 0 ? prettyDate(nextDue?.due_date) : "No dues"}
                  valueColor={totalDue > 0 ? theme.warn : theme.success}
                />
                <DetailRow
                  label="Notice period"
                  value={
                    onNotice
                      ? `${d(p.notice_start_date)} → ${d(p.notice_end_date)}`
                      : `${p.notice_period_days ?? 30} days`
                  }
                  valueColor={onNotice ? theme.danger : theme.text}
                />
                <DetailRow
                  label="Moved in"
                  value={d(p.move_in_date)}
                />
                <DetailRow
                  label="Stay duration"
                  value={formatTenure(p.move_in_date)}
                  valueColor={accent.accentText}
                />
              </View>
            )}
          </View>

          {/* Quick actions */}
          <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
          <View style={styles.quickRow}>
            <QuickAction icon="cash" label="Pay Rent" onPress={() => router.push("/(tenant-tabs)/dues")} />
            <QuickAction icon="chatbubbles" label="Chat" onPress={() => router.push("/(tenant-tabs)/inbox")} />
            <QuickAction icon="construct" label="Complaint" onPress={() => router.push("/complaints/new")} />
            <QuickAction icon="receipt" label="History" onPress={() => router.push("/(tenant-tabs)/history")} />
          </View>

          {/* Rent & deposit */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Rent & Deposit</Text>
            <DetailRow
              label="Agreed rent"
              value={p.rent_paise != null ? `${rupeesFromPaise(p.rent_paise)} / month` : "—"}
            />
            <DetailRow
              label="Security deposit"
              value={p.deposit_paise != null ? rupeesFromPaise(p.deposit_paise) : "—"}
            />
            {pg?.contact_phone && (
              <Pressable
                style={styles.callBtn}
                onPress={() => Linking.openURL(`tel:${pg.contact_phone}`)}
              >
                <Ionicons name="call" size={15} color="#fff" />
                <Text style={styles.callText}>Call manager · {pg.contact_phone}</Text>
              </Pressable>
            )}
          </View>

          {/* Notice */}
          {p.notice_period_days != null && (
            <View style={styles.card}>
              <View style={styles.cardHeaderStatic}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Notice Period</Text>
                  <Text style={styles.cardHeaderSub}>
                    {onNotice ? "Your notice is active" : "Planning to leave?"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusChip,
                    { backgroundColor: onNotice ? theme.dangerSoft : theme.chipBg },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      { color: onNotice ? theme.danger : theme.textLight },
                    ]}
                  >
                    {onNotice ? "Active" : `${p.notice_period_days} days`}
                  </Text>
                </View>
              </View>
              <Text style={styles.noticeText}>
                {onNotice
                  ? `Notice runs ${d(p.notice_start_date)} → ${d(p.notice_end_date)}. Talk to your manager about the handover.`
                  : `Start your notice and your manager is informed automatically. Default period is ${p.notice_period_days} day(s).`}
              </Text>
              <Pressable
                style={onNotice ? styles.ghostBtn : styles.primaryBtn}
                onPress={() => (onNotice ? setCancelConfirm(true) : setNoticeConfirm(true))}
                disabled={busy}
              >
                <Text style={onNotice ? styles.ghostBtnText : styles.primaryBtnText}>
                  {onNotice ? "Cancel notice" : "Start notice"}
                </Text>
              </Pressable>
            </View>
          )}

          {/* My requests */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>My Requests</Text>
            <RequestRow
              icon="swap-horizontal"
              label="Bed / room change"
              onPress={() => router.push("/change-request")}
            />
            <RequestRow
              icon="alert-circle"
              label="My complaints"
              onPress={() => router.push("/complaints")}
            />
            <RequestRow
              icon="star"
              label="Share feedback"
              onPress={() => router.push("/feedback")}
              last
            />
          </View>
        </>
      )}

      <ConfirmDialog
        visible={noticeConfirm}
        title="Start notice period?"
        message={`Notice starts today. Your manager is notified automatically. Leave after ${p?.notice_period_days ?? 30} day(s).`}
        confirmLabel="Start notice"
        busy={busy}
        onCancel={() => setNoticeConfirm(false)}
        onConfirm={startNotice}
      />
      <ConfirmDialog
        visible={cancelConfirm}
        title="Cancel notice?"
        message="This clears your notice dates and informs your manager."
        confirmLabel="Cancel notice"
        busy={busy}
        onCancel={() => setCancelConfirm(false)}
        onConfirm={cancelNotice}
      />
      <ConfirmDialog
        visible={confirmSignout}
        title="Sign out?"
        message="You can log back in anytime with your phone number and password."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignout(false)}
        onConfirm={() => {
          setConfirmSignout(false);
          logout().then(() => router.replace("/login"));
        }}
      />

      <Sheet visible={profileOpen} onClose={() => setProfileOpen(false)}>
        <View style={styles.profileTop}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {initials(p?.full_name ?? "U")}
            </Text>
          </View>
          <Text style={styles.profileName}>{p?.full_name}</Text>
          <Text style={styles.profilePhone}>{p?.phone}</Text>
        </View>

        <View style={{ gap: 2, marginVertical: 6 }}>
          <DetailRow
            label="Stay location"
            value={
              p?.property_name
                ? `${p.property_name} · Room ${p.room_number} · Bed ${p.bed_label}`
                : "None"
            }
          />
          {p?.email ? <DetailRow label="Email" value={p.email} /> : null}
          {p?.id_number ? <DetailRow label="Govt ID / KYC" value={p.id_number} /> : null}
          {p?.emergency_contact_name ? (
            <DetailRow
              label="Emergency contact"
              value={`${p.emergency_contact_name}${p.emergency_contact_phone ? ` (${p.emergency_contact_phone})` : ""}`}
            />
          ) : null}
        </View>

        <Pressable
          style={styles.signoutBtn}
          onPress={() => {
            setProfileOpen(false);
            setConfirmSignout(true);
          }}
        >
          <Ionicons name="log-out-outline" size={18} color={theme.danger} />
          <Text style={styles.signoutText}>Sign out</Text>
        </Pressable>
        <Pressable style={styles.closeBtn} onPress={() => setProfileOpen(false)}>
          <Text style={styles.closeBtnText}>Close</Text>
        </Pressable>
      </Sheet>
    </ScrollView>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
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

function RequestRow({
  icon,
  label,
  onPress,
  last,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      style={[styles.requestRow, last && { borderBottomWidth: 0 }]}
      onPress={onPress}
    >
      <View style={styles.requestIcon}>
        <Ionicons name={icon as any} size={17} color={accent.accent} />
      </View>
      <Text style={styles.requestLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
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
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
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
  roomHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    padding: 11,
    borderRadius: 12,
    backgroundColor: accent.accentSoft,
  },
  roomIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  roomTitle: { fontSize: 16, fontWeight: "800", color: theme.text },
  roomSub: { fontSize: 11, color: theme.textLight, fontWeight: "600", marginTop: 1 },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusChipText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  detailRows: { marginTop: 8 },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  detailLabel: { fontSize: 12, color: theme.textLight, fontWeight: "600" },
  detailValue: { fontSize: 12, fontWeight: "700", color: theme.text, maxWidth: "62%", textAlign: "right" },

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

  // Requests
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  requestIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  requestLabel: { flex: 1, fontSize: 13, fontWeight: "700", color: theme.text },

  // Notice
  noticeText: { fontSize: 12, color: theme.textLight, lineHeight: 18, marginTop: 8, marginBottom: 10 },
  primaryBtn: {
    backgroundColor: accent.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  ghostBtn: {
    backgroundColor: theme.chipBg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  ghostBtnText: { color: theme.danger, fontWeight: "800", fontSize: 13 },

  // Call
  callBtn: {
    marginTop: 12,
    backgroundColor: accent.accent,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
  },
  callText: { color: "#fff", fontWeight: "800", fontSize: 13 },

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

  // Profile sheet
  profileTop: { alignItems: "center", marginBottom: 12 },
  profileAvatar: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: accent.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  profileAvatarText: { color: "#fff", fontWeight: "800", fontSize: 22 },
  profileName: { fontSize: 18, fontWeight: "800", color: theme.text },
  profilePhone: { fontSize: 13, color: theme.textLight, marginTop: 2 },
  signoutBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: theme.dangerSoft,
  },
  signoutText: { color: theme.danger, fontWeight: "800", fontSize: 13 },
  closeBtn: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: theme.chipBg,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: { color: theme.textLight, fontWeight: "800", fontSize: 13 },
});
