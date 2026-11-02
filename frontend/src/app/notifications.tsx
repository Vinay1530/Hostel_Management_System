import { Ionicons } from "@expo/vector-icons";
import { useNotifications } from "@/lib/notifications";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { theme } from "@/lib/theme";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useState } from "react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso.endsWith("Z") ? iso : `${iso}Z`).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsScreen() {
  const { items, markRead, refresh } = useNotifications();
  const { role } = useAuth();
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmMove(requestId: string) {
    setBusy(true);
    try {
      await api.post(`/my/change-requests/${requestId}/confirm-move`, {});
      await refresh();
      alert("Move confirmed! Your manager has been notified to update the records.");
    } catch (e: any) {
      alert(e?.message ?? "Failed to confirm move");
    } finally {
      setBusy(false);
      setConfirmingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.accentText} />
        </Pressable>
        <Text style={styles.h1}>Notifications</Text>
        <Pressable onPress={refresh}>
          <Ionicons name="refresh" size={20} color={theme.accentText} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 8 }}>
        {items.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={36} color={theme.textLight} />
            <Text style={styles.emptyText}>Nothing yet — activity shows up here.</Text>
          </View>
        )}
        {items.map((n) => (
          <Pressable
            key={n.id}
            style={[styles.row, !n.read_at && styles.rowUnread]}
            onPress={() => markRead(n.id)}
          >
            <View
              style={[
                styles.dot,
                n.request_id ? { backgroundColor: theme.accent } : { backgroundColor: "#f59e0b" },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{n.title}</Text>
              <Text style={styles.body}>{n.body}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 4, alignItems: "center" }}>
                <Text style={styles.time}>{timeAgo(n.created_at)}</Text>
                {!n.read_at && <Text style={styles.newTag}>NEW</Text>}
                {n.request_id && (
                  role === "tenant" ? (
                    n.title.toLowerCase().includes("approved") ? (
                      <Pressable
                        style={styles.confirmMoveBtn}
                        onPress={() => confirmMove(n.request_id!)}
                        disabled={busy}
                      >
                        <Text style={styles.confirmMoveText}>
                          {busy && confirmingId === n.request_id ? "Confirming…" : "I have moved — Confirm now"}
                        </Text>
                      </Pressable>
                    ) : null
                  ) : (
                    <Text style={styles.link} onPress={() => router.push("/requests")}>
                      View request
                    </Text>
                  )
                )}
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
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
  row: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.border,
  },
  rowUnread: { borderColor: theme.accent, backgroundColor: theme.accentSoft },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  title: { fontSize: 14, fontWeight: "800", color: theme.text },
  body: { fontSize: 13, color: theme.text, marginTop: 2, lineHeight: 18 },
  time: { fontSize: 11, color: theme.textLight },
  newTag: { fontSize: 10, fontWeight: "800", color: theme.danger },
  link: { fontSize: 11, fontWeight: "800", color: theme.accentText },
  confirmMoveBtn: {
    backgroundColor: theme.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  confirmMoveText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13, color: theme.textLight },
});
