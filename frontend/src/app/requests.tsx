import { api } from "@/lib/api";
import { design, getShadow } from "@/lib/design";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AppText,
  AppBadge,
  AppAvatar,
  EmptyState,
  Skeleton,
} from "@/components/ui-components";

type RequestKind = "change" | "booking" | "phone_change";
type RequestStatus = "open" | "approved" | "rejected" | "moved" | "completed";

type RequestRow = {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  tenant_id: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  requested_phone: string | null;
  building_name: string | null;
  floor_name: string | null;
  room_number: string | null;
  bed_label: string | null;
  note: string | null;
  created_at: string;
  decided_at: string | null;
};

const STATUS_META: Record<
  string,
  { label: string; variant: "warning" | "success" | "danger" | "info" | "neutral" | "primary" }
> = {
  open: { label: "Awaiting review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  moved: { label: "Tenant moved", variant: "info" },
  completed: { label: "Completed", variant: "primary" },
  rejected: { label: "Rejected", variant: "danger" },
};

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function prettyDate(value: string): string {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function destination(row: RequestRow): string {
  const parts = [
    row.building_name,
    row.floor_name,
    row.room_number ? `Room ${row.room_number}` : null,
    row.bed_label ? `Bed ${row.bed_label}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Anywhere in the PG";
}

function kindLabel(kind: RequestKind): string {
  if (kind === "booking") return "BOOKING";
  if (kind === "phone_change") return "PHONE";
  return "CHANGE";
}

function kindIcon(kind: RequestKind): string {
  if (kind === "booking") return "person-add-outline";
  if (kind === "phone_change") return "call-outline";
  return "swap-horizontal-outline";
}

export default function RequestsScreen() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "pending" | "resolved">("all");
  const [kind, setKind] = useState<"all" | RequestKind>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      setRows(await api.get<RequestRow[]>("/requests"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    let list = rows ?? [];
    if (kind !== "all") list = list.filter((r) => r.kind === kind);
    if (tab === "pending") list = list.filter((r) => ["open", "approved", "moved"].includes(r.status));
    if (tab === "resolved") list = list.filter((r) => ["completed", "rejected"].includes(r.status));
    return list;
  }, [rows, kind, tab]);

  const pendingCount = (rows ?? []).filter((r) =>
    ["open", "approved", "moved"].includes(r.status)
  ).length;
  const openCount = (rows ?? []).filter((r) => r.status === "open").length;
  const completedCount = (rows ?? []).filter((r) => r.status === "completed").length;

  async function decide(row: RequestRow, approve: boolean) {
    const isPhone = row.kind === "phone_change";
    Alert.alert(
      approve ? (isPhone ? "Approve number change?" : "Approve request?") : "Reject request?",
      approve
        ? isPhone
          ? "The tenant's login mobile number will be updated immediately."
          : "The tenant will be notified and can then confirm the move."
        : "The tenant will be notified that this request was declined.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: approve ? (isPhone ? "Approve & update" : "Approve") : "Reject",
          style: approve ? "default" : "destructive",
          onPress: async () => {
            setBusyId(row.id);
            try {
              await api.patch(`/requests/${row.id}`, {
                status: approve ? "approved" : "rejected",
              });
              await load();
              if (approve && isPhone) {
                Alert.alert("Number updated", "The tenant can now sign in with the new mobile number.");
              }
            } catch (e: any) {
              Alert.alert("Failed", e?.detail ?? e?.message ?? "Could not update request");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  async function applyMove(row: RequestRow) {
    Alert.alert(
      "Complete the move?",
      "The active stay will be transferred to the requested bed and rent will update to that bed's rate.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply move",
          onPress: async () => {
            setBusyId(row.id);
            try {
              await api.post(`/requests/${row.id}/apply-move`, {});
              await load();
              Alert.alert("Move completed", "Occupancy and rent have been updated.");
            } catch (e: any) {
              Alert.alert("Failed", e?.detail ?? e?.message ?? "Could not apply move");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>RESIDENT REQUESTS</Text>
            <AppText variant="h2" color="#fff">
              Requests
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.72)">
              Room changes and guest bookings in one queue
            </AppText>
          </View>
          <TouchableOpacity style={styles.headerAction} onPress={load} accessibilityLabel="Refresh requests">
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{openCount}</Text>
            <Text style={styles.heroStatLabel}>NEW</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{pendingCount}</Text>
            <Text style={styles.heroStatLabel}>IN PROGRESS</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{completedCount}</Text>
            <Text style={styles.heroStatLabel}>COMPLETED</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={design.colors.primary} />
        }
      >
        {/* Tabs */}
        <View style={styles.tabBar}>
          {(
            [
              ["all", "All"],
              ["pending", "Pending"],
              ["resolved", "Resolved"],
            ] as ["all" | "pending" | "resolved", string][]
          ).map(([value, label]) => {
            const active = tab === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(value)}
                activeOpacity={0.85}
              >
                <AppText
                  variant="caption"
                  color={active ? "#fff" : design.colors.textSecondary}
                  style={{ fontWeight: "800" }}
                >
                  {label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Kind chips */}
        <View style={styles.kindRow}>
          {(
            [
              ["all", "All types"],
              ["change", "Change"],
              ["booking", "Booking"],
              ["phone_change", "Phone"],
            ] as ["all" | RequestKind, string][]
          ).map(([value, label]) => (
            <TouchableOpacity
              key={value}
              style={[styles.kindChip, kind === value && styles.kindChipActive]}
              onPress={() => setKind(value)}
            >
              <AppText
                variant="caption"
                color={kind === value ? design.colors.primary : design.colors.textSecondary}
                style={{ fontWeight: "700" }}
              >
                {label}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>

        {loading && !rows && (
          <View style={{ gap: 10 }}>
            <Skeleton height={140} radius={16} />
            <Skeleton height={140} radius={16} />
            <Skeleton height={140} radius={16} />
          </View>
        )}

        {rows && filtered.length === 0 && (
          <EmptyState
            icon="hand-left-outline"
            title={rows.length === 0 ? "No requests yet" : "Nothing in this view"}
            subtitle={
              rows.length === 0
                ? "Guest bookings and tenant room-change requests will appear here."
                : "Try another tab or request type."
            }
          />
        )}

        <View style={{ gap: 10 }}>
          {filtered.map((row) => {
            const person =
              row.kind === "booking"
                ? row.guest_name || "Guest"
                : row.tenant_name || "Tenant";
            const meta = STATUS_META[row.status] ?? {
              label: row.status,
              variant: "neutral" as const,
            };
            const canDecide = row.status === "open";
            const canApply =
              row.kind !== "phone_change" &&
              (row.status === "approved" || row.status === "moved");
            const isBusy = busyId === row.id;
            return (
              <View key={row.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <AppAvatar initials={initials(person) || "G"} size={44} variant="primary" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <AppText
                        variant="body"
                        color={design.colors.textPrimary}
                        style={{ fontWeight: "800", flexShrink: 1 }}
                        numberOfLines={1}
                      >
                        {person}
                      </AppText>
                      <View style={styles.kindPill}>
                        <Ionicons
                          name={kindIcon(row.kind) as any}
                          size={10}
                          color={design.colors.textSecondary}
                        />
                        <Text style={styles.kindPillText}>{kindLabel(row.kind)}</Text>
                      </View>
                    </View>
                    <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                      {row.kind === "booking" && row.guest_phone
                        ? `Guest · ${row.guest_phone}`
                        : row.kind === "phone_change"
                          ? `Mobile number change · ${prettyDate(row.created_at)}`
                          : `Requested ${prettyDate(row.created_at)}`}
                    </AppText>
                  </View>
                  <AppBadge variant={meta.variant}>{meta.label}</AppBadge>
                </View>

                <View style={styles.destinationRow}>
                  <Ionicons
                    name={row.kind === "phone_change" ? "call-outline" : "location-outline"}
                    size={15}
                    color={design.colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText variant="caption" color={design.colors.textMuted}>
                      {row.kind === "phone_change" ? "MOBILE NUMBER" : "REQUESTED SPACE"}
                    </AppText>
                    <AppText
                      variant="bodySmall"
                      color={design.colors.textPrimary}
                      style={{ fontWeight: "700" }}
                      numberOfLines={2}
                    >
                      {row.kind === "phone_change"
                        ? `${row.tenant_phone ?? "Current"} → ${row.requested_phone ?? "—"}`
                        : destination(row)}
                    </AppText>
                  </View>
                </View>

                {row.note ? (
                  <View style={styles.noteRow}>
                    <Ionicons name="chatbox-ellipses-outline" size={13} color={design.colors.textMuted} />
                    <AppText
                      variant="caption"
                      color={design.colors.textSecondary}
                      style={{ flex: 1, lineHeight: 17 }}
                      numberOfLines={3}
                    >
                      {row.note}
                    </AppText>
                  </View>
                ) : null}

                {canDecide && (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => decide(row, false)}
                      disabled={isBusy}
                    >
                      <Ionicons name="close" size={16} color={design.colors.danger} />
                      <AppText variant="caption" color={design.colors.danger} style={{ fontWeight: "800" }}>
                        Reject
                      </AppText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => decide(row, true)}
                      disabled={isBusy}
                    >
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <AppText variant="caption" color="#fff" style={{ fontWeight: "800" }}>
                        {isBusy
                          ? "Updating…"
                          : row.kind === "phone_change"
                            ? "Approve & update"
                            : "Approve"}
                      </AppText>
                    </TouchableOpacity>
                  </View>
                )}

                {canApply && (
                  <TouchableOpacity
                    style={styles.applyBtn}
                    onPress={() => applyMove(row)}
                    disabled={isBusy}
                  >
                    <Ionicons name="bed-outline" size={16} color={design.colors.primary} />
                    <AppText variant="caption" color={design.colors.primary} style={{ fontWeight: "800" }}>
                      {isBusy ? "Updating…" : "Apply move & update occupancy"}
                    </AppText>
                    <Ionicons name="arrow-forward" size={13} color={design.colors.primary} />
                  </TouchableOpacity>
                )}

                {!canDecide && !canApply && (
                  <View style={styles.closedRow}>
                    <Ionicons
                      name={row.status === "completed" ? "checkmark-circle" : "close-circle"}
                      size={14}
                      color={
                        row.status === "completed"
                          ? design.colors.success
                          : design.colors.textMuted
                      }
                    />
                    <AppText variant="caption" color={design.colors.textMuted}>
                      {row.status === "completed"
                        ? row.kind === "phone_change"
                          ? "Mobile number updated"
                          : "Move completed and records updated"
                        : row.kind === "phone_change"
                          ? "Phone change request declined"
                          : "Request closed without a move"}
                    </AppText>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  hero: {
    backgroundColor: design.colors.primary,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
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
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "rgba(255,255,255,0.72)",
    marginBottom: 3,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatValue: { color: "#fff", fontSize: 18, fontWeight: "800" },
  heroStatLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 1,
  },
  heroStatDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.18)" },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 100 },

  tabBar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    padding: 4,
    gap: 4,
    marginBottom: 10,
    ...getShadow("sm"),
  },
  tab: {
    flex: 1,
    minHeight: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: { backgroundColor: design.colors.primary },

  kindRow: { flexDirection: "row", gap: 7, marginBottom: 14 },
  kindChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  kindChipActive: {
    backgroundColor: design.colors.primaryLight,
    borderColor: design.colors.primary,
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 13,
    gap: 10,
    ...getShadow("sm"),
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  kindPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: design.colors.surfaceVariant,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  kindPillText: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: design.colors.textSecondary,
  },
  destinationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: design.colors.background,
    borderWidth: 1,
    borderColor: design.colors.border,
  },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  actions: { flexDirection: "row", gap: 8 },
  rejectBtn: {
    flex: 1,
    minHeight: 41,
    borderRadius: 11,
    backgroundColor: design.colors.dangerLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  approveBtn: {
    flex: 1.3,
    minHeight: 41,
    borderRadius: 11,
    backgroundColor: design.colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  applyBtn: {
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: design.colors.primaryLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  closedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
