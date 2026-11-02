import { ConfirmDialog, Sheet } from "@/components/ui";
import { api, rupeesFromPaise } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";
import { fetchPublicPg, type PublicPgDetail } from "@/lib/public";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";

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
  invoices: { invoice_id: string; period_month: string; balance_paise: number; status: string }[];
};

function d(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
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
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      setData(await api.get<MyOverview>("/my/overview"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load your details");
    }
  }

  useEffect(() => {
    if (token) load();
    if (orgId) {
      fetchPublicPg(orgId).then(setPg).catch(() => setPg(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, orgId]);

  if (!ready) return <Splash />;
  if (!token) return <Redirect href="/login" />;

  const p = data?.profile;
  const onNotice = !!p?.notice_start_date;

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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.h1}>My Stay</Text>
          {p && <Text style={styles.phone}>{p.phone}</Text>}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.iconBtn} onPress={() => router.push("/notifications")}>
            <Ionicons name="notifications-outline" size={18} color={theme.text} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={[styles.iconBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]} onPress={() => setProfileOpen(true)}>
            <Ionicons name="person" size={18} color={theme.accentText} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => setConfirmSignout(true)}>
            <Ionicons name="log-out-outline" size={18} color={theme.danger} />
          </Pressable>
        </View>
      </View>

      {error && <Text style={styles.error}>{String(error)}</Text>}
      {!data && !error && <Text style={{ color: theme.textLight }}>Loading…</Text>}

      {p && (
        <>
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {p.full_name
                  .split(/[ .]+/)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? "")
                  .join("")}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.full_name}</Text>
              <Text style={styles.meta}>
                {p.property_name
                  ? `${p.property_name} · Room ${p.room_number} · Bed ${p.bed_label}`
                  : "No active bed assigned yet — contact your manager"}
              </Text>
            </View>
          </View>

          {(p.rent_paise != null || p.deposit_paise != null) && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Rent</Text>
              {p.rent_paise != null && (
                <Text style={styles.line}>Agreed rent: {rupeesFromPaise(p.rent_paise)} / month</Text>
              )}
              {p.deposit_paise != null && (
                <Text style={styles.line}>Security deposit: {rupeesFromPaise(p.deposit_paise)}</Text>
              )}
              {p.move_in_date && (
                <>
                  <Text style={styles.line}>Moved in: {d(p.move_in_date)}</Text>
                  <Text style={[styles.meta, { color: theme.accentText, fontWeight: "700" }]}>
                    Stay duration: {formatTenure(p.move_in_date)}
                  </Text>
                </>
              )}
              {pg?.contact_phone && (
                <Pressable
                  style={styles.callBtn}
                  onPress={() => Linking.openURL(`tel:${pg.contact_phone}`)}
                >
                  <Ionicons name="call" size={14} color="#fff" />
                  <Text style={styles.callText}>Call manager · {pg.contact_phone}</Text>
                </Pressable>
              )}
            </View>
          )}

          {p.notice_period_days != null && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Notice period</Text>
              {onNotice ? (
                <>
                  <Text style={styles.line}>
                    Notice active: {d(p.notice_start_date)} → {d(p.notice_end_date)}
                  </Text>
                  <Text style={styles.meta}>
                    Talk to your manager about leaving on this date.
                  </Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable style={styles.miniBtnGhost} onPress={() => setCancelConfirm(true)}>
                      <Text style={[styles.miniBtnText, { color: theme.danger }]}>Cancel notice</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.meta}>
                    Planning to leave? Start your notice — your manager is informed automatically. Period is{" "}
                    {p.notice_period_days} day(s) by default.
                  </Text>
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable style={styles.miniBtn} onPress={() => setNoticeConfirm(true)} disabled={busy}>
                      <Text style={styles.miniBtnTextDark}>Start notice</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>What I need</Text>
            <Pressable style={styles.tile} onPress={() => router.push("/transactions")}>
              <Ionicons name="receipt-outline" size={18} color={theme.accentText} />
              <Text style={styles.tileText}>My bills & payments</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
            </Pressable>
            <Pressable style={styles.tile} onPress={() => router.push("/change-request")}>
              <Ionicons name="swap-horizontal-outline" size={18} color={theme.accentText} />
              <Text style={styles.tileText}>Bed / room change request</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
            </Pressable>
            <Pressable style={styles.tile} onPress={() => router.push("/complaints/new")}>
              <Ionicons name="alert-circle-outline" size={18} color={theme.accentText} />
              <Text style={styles.tileText}>Report a problem</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
            </Pressable>
            <Pressable style={styles.tile} onPress={() => router.push("/complaints")}>
              <Ionicons name="list-outline" size={18} color={theme.accentText} />
              <Text style={styles.tileText}>My complaints</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
            </Pressable>
            <Pressable style={styles.tile} onPress={() => router.push("/chat")}>
              <Ionicons name="chatbubbles-outline" size={18} color={theme.accentText} />
              <Text style={styles.tileText}>Chat</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textLight} />
            </Pressable>
          </View>

          {data && data.invoices.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Dues snapshot</Text>
              {data.invoices
                .filter((inv) => inv.balance_paise > 0 && inv.status !== "void")
                .map((inv) => (
                  <Text key={inv.invoice_id} style={styles.line}>
                    {inv.period_month}: {rupeesFromPaise(inv.balance_paise)} outstanding ({inv.status})
                  </Text>
                ))}
              {data.invoices.every((inv) => inv.balance_paise === 0 || inv.status === "void") && (
                <Text style={styles.line}>No outstanding dues 🎉</Text>
              )}
            </View>
          )}
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

      <Sheet visible={profileOpen} onClose={() => setProfileOpen(false)}>
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <View style={[styles.avatar, { width: 68, height: 68, borderRadius: 24, marginBottom: 8 }]}>
            <Text style={[styles.avatarText, { fontSize: 24 }]}>
              {p?.full_name
                .split(/[ .]+/)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? "")
                .join("")}
            </Text>
          </View>
          <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text }}>{p?.full_name}</Text>
          <Text style={{ fontSize: 13, color: theme.textLight }}>{p?.phone}</Text>
        </View>

        <View style={{ gap: 8, marginVertical: 8 }}>
          <View style={styles.profileRow}>
            <Text style={styles.profileLabel}>Stay location</Text>
            <Text style={styles.profileVal}>
              {p?.property_name ? `${p.property_name} · Room ${p.room_number} · Bed ${p.bed_label}` : "None"}
            </Text>
          </View>
          {p?.email && (
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Email</Text>
              <Text style={styles.profileVal}>{p.email}</Text>
            </View>
          )}
          {p?.id_number && (
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Govt ID / KYC</Text>
              <Text style={styles.profileVal}>{p.id_number}</Text>
            </View>
          )}
          {p?.emergency_contact_name && (
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Emergency contact</Text>
              <Text style={styles.profileVal}>
                {p.emergency_contact_name} {p.emergency_contact_phone ? `(${p.emergency_contact_phone})` : ""}
              </Text>
            </View>
          )}
          {p?.move_in_date && (
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Moved in</Text>
              <Text style={styles.profileVal}>{d(p.move_in_date)}</Text>
            </View>
          )}
          {p?.move_in_date && (
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Tenure</Text>
              <Text style={[styles.profileVal, { color: theme.accentText, fontWeight: "800" }]}>
                {formatTenure(p.move_in_date)}
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={[styles.miniBtn, { backgroundColor: theme.chipBg, marginTop: 12 }]}
          onPress={() => setProfileOpen(false)}
        >
          <Text style={[styles.miniBtnTextDark, { color: theme.text }]}>Close</Text>
        </Pressable>
      </Sheet>

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
    </ScrollView>
  );
}

function Splash() {
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  h1: { fontSize: 22, fontWeight: "800", color: theme.text },
  phone: { fontSize: 12, color: theme.textLight, fontWeight: "600" },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  avatarText: { color: theme.accentText, fontWeight: "800", fontSize: 16 },
  name: { fontSize: 17, fontWeight: "800", color: theme.text },
  sectionTitle: { fontSize: 12, fontWeight: "800", color: theme.textLight, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  meta: { fontSize: 12, color: theme.textLight, marginTop: 2, lineHeight: 17 },
  line: { fontSize: 13, color: theme.text, fontWeight: "600", marginTop: 2 },
  callBtn: {
    marginTop: 8,
    backgroundColor: theme.accent,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  callText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  tileText: { flex: 1, fontSize: 14, fontWeight: "600", color: theme.text },
  miniBtn: { backgroundColor: theme.accent, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18, alignItems: "center", flex: 1 },
  miniBtnGhost: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18, alignItems: "center", flex: 1, backgroundColor: theme.chipBg },
  miniBtnText: { color: theme.danger, fontWeight: "800", fontSize: 13 },
  miniBtnTextDark: { color: "#fff", fontWeight: "800", fontSize: 13 },
  error: { color: theme.danger, fontSize: 13, marginBottom: 8 },
  profileRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  profileLabel: { fontSize: 13, color: theme.textLight },
  profileVal: { fontSize: 13, fontWeight: "700", color: theme.text, maxWidth: "60%", textAlign: "right" },
});
