import { ConfirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useCallback, useEffect, useState } from "react";

type ReqRow = {
  id: string;
  kind: "change" | "booking";
  status: "open" | "approved" | "rejected" | "moved" | "completed";
  tenant_name: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  building_name: string | null;
  floor_name: string | null;
  room_number: string | null;
  bed_label: string | null;
  note: string | null;
  created_at: string;
};

const KINDS = ["all", "change", "booking"] as const;
const STATUSES = ["all", "open", "approved", "moved", "completed", "rejected"] as const;
const LABELS: Record<string, string> = {
  all: "All", change: "Change", booking: "Booking", open: "Open", approved: "Approved", moved: "Tenant Moved", completed: "Completed", rejected: "Rejected",
};
const STATUS_COLORS: Record<string, string> = { open: "#f59e0b", approved: "#16a34a", moved: "#8b5cf6", completed: "#0284c7", rejected: "#ef4444" };

function where(r: ReqRow): string {
  const parts = [
    r.building_name,
    r.floor_name,
    r.room_number ? `Room ${r.room_number}` : null,
    r.bed_label ? `Bed ${r.bed_label}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Anywhere in the PG";
}

export default function RequestsScreen() {
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<{ id: string; approve: boolean } | null>(null);
  const [updateAction, setUpdateAction] = useState<{ id: string; tenant_name: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { orgId } = useAuth();

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (kind !== "all") params.set("kind", kind);
    if (status !== "all") params.set("request_status", status);
    try {
      setRows(await api.get<ReqRow[]>(`/requests?${params.toString()}`));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [kind, status]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function decide() {
    if (!action) return;
    setBusy(true);
    try {
      await api.patch(`/requests/${action.id}`, { status: action.approve ? "approved" : "rejected" });
      await refresh();
    } finally {
      setBusy(false);
      setAction(null);
    }
  }

  async function applyMove() {
    if (!updateAction) return;
    setBusy(true);
    try {
      await api.post(`/requests/${updateAction.id}/apply-move`, {});
      await refresh();
    } finally {
      setBusy(false);
      setUpdateAction(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.accentText} />
        </Pressable>
        <Text style={styles.h1}>Requests</Text>
        <Pressable onPress={refresh}>
          <Ionicons name="refresh" size={20} color={theme.accentText} />
        </Pressable>
      </View>

      <View style={styles.filtersRow}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.filterLabel}>Type</Text>
          <View style={styles.chips}>
            {KINDS.map((k) => (
              <Pressable
                key={k}
                style={[styles.chip, kind === k && styles.chipActive]}
                onPress={() => setKind(k)}
              >
                <Text style={[styles.chipText, kind === k && styles.chipTextActive]}>{LABELS[k]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.filterLabel}>Status</Text>
          <View style={styles.chips}>
            {STATUSES.map((s) => (
              <Pressable
                key={s}
                style={[styles.chip, status === s && styles.chipActive]}
                onPress={() => setStatus(s)}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{LABELS[s]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {loading && <Text style={styles.meta}>Loading…</Text>}
        {!loading && rows.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="hand-left-outline" size={36} color={theme.textLight} />
            <Text style={styles.emptyText}>No requests match these filters.</Text>
          </View>
        )}
        {rows.map((r) => {
          const person = r.kind === "booking" ? r.guest_name || "Guest" : r.tenant_name || "Tenant";
          return (
            <View key={r.id} style={styles.card}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.cardTitle}>{person}</Text>
                <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[r.status]}22` }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[r.status] }]}>{r.status.toUpperCase()}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: theme.chipBg }]}>
                  <Text style={[styles.statusText, { color: theme.textLight }]}>{LABELS[r.kind]}</Text>
                </View>
              </View>
              <Text style={styles.where}>{where(r)}</Text>
              {r.kind === "booking" && r.guest_phone && (
                <Text style={styles.meta}>Phone: {r.guest_phone}</Text>
              )}
              {r.note && <Text style={styles.note}>“{r.note}”</Text>}
              {r.status === "open" && (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <Pressable style={[styles.btn, { backgroundColor: "#16a34a" }]} onPress={() => setAction({ id: r.id, approve: true })}>
                    <Text style={styles.btnText}>Approve</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, { backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border }]} onPress={() => setAction({ id: r.id, approve: false })}>
                    <Text style={[styles.btnText, { color: theme.danger }]}>Reject</Text>
                  </Pressable>
                </View>
              )}
              {r.status === "moved" && (
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <Pressable
                    style={[styles.btn, { backgroundColor: theme.accent }]}
                    onPress={() => setUpdateAction({ id: r.id, tenant_name: r.tenant_name })}
                  >
                    <Text style={styles.btnText}>Update Dashboard & Records</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <ConfirmDialog
        visible={!!action}
        title={action?.approve ? "Approve request?" : "Reject request?"}
        message={
          action?.approve
            ? "The tenant/guest will be notified in-app. Coordinate the actual move with them."
            : "The tenant/guest will be notified in-app."
        }
        confirmLabel={action?.approve ? "Approve" : "Reject"}
        busy={busy}
        onCancel={() => setAction(null)}
        onConfirm={decide}
      />

      <ConfirmDialog
        visible={!!updateAction}
        title="Update Records & Layout?"
        message={`This will move ${updateAction?.tenant_name || "the tenant"} to the new room/bed in the database, update their rent, and refresh the occupancy grid.`}
        confirmLabel="Update Now"
        busy={busy}
        onCancel={() => setUpdateAction(null)}
        onConfirm={applyMove}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  h1: { fontSize: 18, fontWeight: "800", color: theme.text, flex: 1 },
  filtersRow: { flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  filterLabel: { fontSize: 11, fontWeight: "800", color: theme.textLight, textTransform: "uppercase", letterSpacing: 0.4 },
  chips: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: "700", color: theme.textLight },
  chipTextActive: { color: "#fff" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: "800", color: theme.text, flexShrink: 1 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  where: { fontSize: 13, fontWeight: "600", color: theme.accentText },
  meta: { fontSize: 12, color: theme.textLight },
  note: { fontSize: 12, color: theme.textLight, fontStyle: "italic", marginTop: 2 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13, color: theme.textLight },
});
