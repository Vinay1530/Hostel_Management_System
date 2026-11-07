import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "@/lib/notifications";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppText,
  AppBadge,
  EmptyState,
} from "@/components/ui-components";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  complaint_id?: string | null;
  request_id?: string | null;
  tenant_id?: string | null;
  created_at: string;
  read_at: string | null;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Per-user dismissal cache key derived from the auth token, since useAuth
// does not expose a user id.
function dismissalKey(token: string | null): string {
  const t = (token ?? "anon").replace(/[^a-zA-Z0-9_-]/g, "");
  return `pgms_dismissed_${t.slice(0, 24) || "anon"}`;
}

function iconFor(title: string, hasComplaint: boolean, hasRequest: boolean): string {
  const t = title.toLowerCase();
  if (hasComplaint || t.includes("complaint")) return "construct-outline";
  if (hasRequest || t.includes("request") || t.includes("move") || t.includes("booking"))
    return "swap-horizontal-outline";
  if (t.includes("rent") || t.includes("payment") || t.includes("due")) return "cash-outline";
  if (t.includes("notice") || t.includes("announcement")) return "megaphone-outline";
  if (t.includes("message") || t.includes("chat")) return "chatbubble-outline";
  return "notifications-outline";
}

export default function NotificationsScreen() {
  const { items: rawItems, markRead, refresh } = useNotifications();
  const { role, token } = useAuth();
  const router = useRouter();
  const accent = role === "tenant" ? roleAccents.tenant : roleAccents.manager;

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [markingAll, setMarkingAll] = useState(false);
  const tenantsRef = useRef<Array<{ id: string; full_name: string }> | null>(null);

  const dKey = dismissalKey(token);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(dKey);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (!cancelled && Array.isArray(parsed)) setDismissed(new Set(parsed as string[]));
      } catch {
        // corrupt/missing cache just means nothing is hidden
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dKey]);

  const addDismissed = useCallback(
    (id: string) => {
      setDismissed((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev).add(id);
        AsyncStorage.setItem(dKey, JSON.stringify([...next])).catch(() => {});
        return next;
      });
    },
    [dKey]
  );

  const items: NotificationItem[] = useMemo(
    () => (rawItems as NotificationItem[]).filter((n) => !dismissed.has(n.id)),
    [rawItems, dismissed]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  async function confirmMove(requestId: string) {
    setBusy(true);
    try {
      await api.post(`/my/change-requests/${requestId}/confirm-move`, {});
      await refresh();
      Alert.alert("Move confirmed", "Your manager has been notified to update the records.");
    } catch (e: any) {
      Alert.alert("Failed", e?.detail ?? e?.message ?? "Failed to confirm move");
    } finally {
      setBusy(false);
      setConfirmingId(null);
    }
  }

  async function markAllRead() {
    const unread = items.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    setMarkingAll(true);
    try {
      for (const n of unread) await markRead(n.id);
      await refresh();
    } finally {
      setMarkingAll(false);
    }
  }

  function onItemPress(n: NotificationItem) {
    markRead(n.id);
    if (n.complaint_id) {
      addDismissed(n.id);
      router.push({ pathname: "/complaints/[id]", params: { id: n.complaint_id } });
      return;
    }
    if (n.request_id) {
      if (role === "tenant") {
        router.push("/change-request");
      } else {
        addDismissed(n.id);
        router.push("/requests");
      }
      return;
    }
    if (n.tenant_id) {
      addDismissed(n.id);
      router.push(`/tenant-profile/${n.tenant_id}`);
      return;
    }
    void navigateToTenant(n);
  }

  async function navigateToTenant(n: NotificationItem) {
    const isNotice = String(n.title ?? "").toLowerCase().includes("notice");
    if (!isNotice) return;
    try {
      if (!tenantsRef.current) {
        tenantsRef.current = await api.get<Array<{ id: string; full_name: string }>>("/tenants");
      }
      const name = String(n.body ?? "").split(" (Room")[0].trim().toLowerCase();
      const match = tenantsRef.current.find(
        (t) => t.full_name.trim().toLowerCase() === name
      );
      if (match) {
        addDismissed(n.id);
        router.push(`/tenant-profile/${match.id}`);
        return;
      }
    } catch {
      // fall through to the list screen
    }
    router.push("/(tabs)/tenants");
  }

  const unreadItems = useMemo(() => items.filter((n) => !n.read_at), [items]);
  const earlierItems = useMemo(() => items.filter((n) => !!n.read_at), [items]);

  const renderRow = (n: NotificationItem) => {
    const unread = !n.read_at;
    const icon = iconFor(n.title, !!n.complaint_id, !!n.request_id);
    const isTenantApprovedRequest =
      role === "tenant" &&
      n.request_id &&
      n.title.toLowerCase().includes("approved");
    return (
      <TouchableOpacity
        key={n.id}
        style={[styles.row, unread && { backgroundColor: accent.accentSoft, borderColor: `${accent.accent}33` }]}
        onPress={() => onItemPress(n)}
        activeOpacity={0.9}
      >
        <View
          style={[
            styles.rowIcon,
            { backgroundColor: unread ? "#fff" : design.colors.surfaceVariant },
          ]}
        >
          <Ionicons
            name={icon as any}
            size={18}
            color={unread ? accent.accent : design.colors.textSecondary}
          />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.titleRow}>
            <AppText
              variant="body"
              color={design.colors.textPrimary}
              style={{ fontWeight: unread ? "800" : "600", flex: 1 }}
              numberOfLines={2}
            >
              {n.title}
            </AppText>
            <AppText variant="caption" color={design.colors.textMuted}>
              {timeAgo(n.created_at)}
            </AppText>
          </View>

          <AppText
            variant="caption"
            color={design.colors.textSecondary}
            style={{ lineHeight: 17, marginTop: 2 }}
            numberOfLines={3}
          >
            {n.body}
          </AppText>

          <View style={styles.rowFooter}>
            {unread ? (
              <View style={styles.newPill}>
                <View style={[styles.unreadDot, { backgroundColor: accent.accent }]} />
                <Text style={[styles.newText, { color: accent.accent }]}>NEW</Text>
              </View>
            ) : (
              <AppText variant="caption" color={design.colors.textMuted}>
                Read
              </AppText>
            )}

            {n.complaint_id && (
              <View style={styles.openLink}>
                <AppText variant="caption" color={accent.accent} style={{ fontWeight: "800" }}>
                  Open complaint
                </AppText>
                <Ionicons name="arrow-forward" size={12} color={accent.accent} />
              </View>
            )}

            {n.request_id && role !== "tenant" && (
              <View style={styles.openLink}>
                <AppText variant="caption" color={accent.accent} style={{ fontWeight: "800" }}>
                  View request
                </AppText>
                <Ionicons name="arrow-forward" size={12} color={accent.accent} />
              </View>
            )}

            {isTenantApprovedRequest && (
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: accent.accent }]}
                onPress={() => {
                  setConfirmingId(n.request_id!);
                  confirmMove(n.request_id!);
                }}
                disabled={busy}
              >
                <Ionicons name="checkmark-circle" size={13} color="#fff" />
                <Text style={styles.confirmText}>
                  {busy && confirmingId === n.request_id ? "Confirming…" : "Confirm move"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: accent.accent }]}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>YOUR INBOX</Text>
            <AppText variant="h2" color="#fff">
              Notifications
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.72)">
              {unreadItems.length > 0
                ? `${unreadItems.length} unread update${unreadItems.length === 1 ? "" : "s"}`
                : "You're all caught up"}
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={onRefresh}
            accessibilityLabel="Refresh notifications"
          >
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent.accent} />
        }
      >
        {items.length === 0 && (
          <EmptyState
            icon="notifications-off-outline"
            title="All caught up"
            subtitle="Complaint updates, requests and announcements will show up here."
          />
        )}

        {unreadItems.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                NEW
              </AppText>
              <TouchableOpacity onPress={markAllRead} disabled={markingAll} hitSlop={6}>
                <AppText variant="caption" color={accent.accent} style={{ fontWeight: "800" }}>
                  {markingAll ? "Marking…" : "Mark all read"}
                </AppText>
              </TouchableOpacity>
            </View>
            <View style={{ gap: 8 }}>{unreadItems.map(renderRow)}</View>
          </>
        )}

        {earlierItems.length > 0 && (
          <>
            <View style={[styles.sectionRow, { marginTop: unreadItems.length > 0 ? 16 : 0 }]}>
              <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                EARLIER
              </AppText>
              <AppText variant="caption" color={design.colors.textMuted}>
                {earlierItems.length} update{earlierItems.length === 1 ? "" : "s"}
              </AppText>
            </View>
            <View style={{ gap: 8 }}>{earlierItems.map(renderRow)}</View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  hero: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  heroGlow: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -70,
    right: -30,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.72)",
    marginBottom: 2,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 60, flexGrow: 1 },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    ...getShadow("sm"),
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    ...getShadow("sm"),
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rowFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 7,
    flexWrap: "wrap",
  },
  newPill: { flexDirection: "row", alignItems: "center", gap: 4 },
  unreadDot: { width: 6, height: 6, borderRadius: 3 },
  newText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  openLink: { flexDirection: "row", alignItems: "center", gap: 3 },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  confirmText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
