import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePg } from "@/lib/pg";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type ComplaintStatus = "open" | "in_progress" | "resolved" | "closed";
type ComplaintCategory =
  | "water"
  | "electricity"
  | "wifi"
  | "food"
  | "cleaning"
  | "maintenance"
  | "other";

type Complaint = {
  id: string;
  property_id: string;
  property_name: string;
  tenant_name: string;
  category: ComplaintCategory;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: ComplaintStatus;
  updated_at: string;
};

type Notice = {
  id: string;
  title: string;
  body: string;
  complaint_id: string | null;
  created_at: string;
  read_at: string | null;
};

const statuses: (ComplaintStatus | "")[] = ["", "open", "in_progress", "resolved", "closed"];
const categories: (ComplaintCategory | "")[] = [
  "",
  "water",
  "electricity",
  "wifi",
  "food",
  "cleaning",
  "maintenance",
  "other",
];

export default function ComplaintsScreen() {
  const { role } = useAuth();
  const { propertyId } = usePg();
  const router = useRouter();
  const isTenant = role === "tenant";
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | "">("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (!isTenant && propertyId) params.set("property_id", propertyId);
      const query = params.toString();
      const jobs: Promise<any>[] = [
        api.get<Complaint[]>(`/complaints${query ? `?${query}` : ""}`),
      ];
      if (isTenant) jobs.push(api.get<Notice[]>("/my/notifications"));
      const [rows, notifications] = await Promise.all(jobs);
      setComplaints(rows);
      if (notifications) setNotices(notifications);
    } catch (e: any) {
      setError(e?.message ?? "Could not load complaints");
    }
  }, [categoryFilter, isTenant, propertyId, statusFilter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function markRead(notice: Notice) {
    if (notice.read_at) return;
    try {
      const updated = await api.patch<Notice>(`/my/notifications/${notice.id}/read`);
      setNotices((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (e: any) {
      setError(e?.message ?? "Could not mark notification as read");
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={complaints === null && !error} onRefresh={load} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{isTenant ? "My complaints" : "Complaints"}</Text>
          <Text style={styles.subtitle}>{isTenant ? "Report and track maintenance issues" : "Review and respond to tenant reports"}</Text>
        </View>
        {isTenant && (
          <Pressable style={styles.iconButton} onPress={() => router.push("/complaints/new")}>
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        )}
        <Pressable style={styles.iconButton} onPress={() => router.push("/chat")}>
          <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
        </Pressable>
      </View>

      {isTenant && notices.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Updates</Text>
          {notices.map((notice) => (
            <Pressable
              key={notice.id}
              style={[styles.notice, !notice.read_at && styles.unreadNotice]}
              onPress={() => {
                markRead(notice);
                if (notice.complaint_id) router.push({ pathname: "/complaints/[id]", params: { id: notice.complaint_id } });
              }}
            >
              <Text style={styles.cardTitle}>{notice.title}</Text>
              <Text style={styles.meta}>{notice.body}</Text>
              {!notice.read_at && <Text style={styles.unreadLabel}>NEW</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {!isTenant && (
        <View style={styles.filterBlock}>
          <Text style={styles.filterLabel}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {statuses.map((status) => (
              <Pressable
                key={status || "all-statuses"}
                style={[styles.filterChip, statusFilter === status && styles.filterChipOn]}
                onPress={() => setStatusFilter(status)}
              >
                <Text style={[styles.filterText, statusFilter === status && styles.filterTextOn]}>{status ? statusLabel(status) : "All"}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.filterLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {categories.map((category) => (
              <Pressable
                key={category || "all-categories"}
                style={[styles.filterChip, categoryFilter === category && styles.filterChipOn]}
                onPress={() => setCategoryFilter(category)}
              >
                <Text style={[styles.filterText, categoryFilter === category && styles.filterTextOn]}>{category || "All"}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {complaints === null && !error && <ActivityIndicator color={theme.accent} />}
      {complaints?.map((complaint) => (
        <Pressable
          key={complaint.id}
          style={styles.card}
          onPress={() => router.push({ pathname: "/complaints/[id]", params: { id: complaint.id } })}
        >
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{complaint.title}</Text>
            <Text style={[styles.status, statusColor(complaint.status)]}>{statusLabel(complaint.status).toUpperCase()}</Text>
          </View>
          <Text style={styles.meta}>
            {isTenant ? complaint.property_name : `${complaint.tenant_name} · ${complaint.property_name}`}
          </Text>
          <Text style={styles.meta}>{complaint.category} · {complaint.priority} priority</Text>
          <Text style={styles.description} numberOfLines={2}>{complaint.description}</Text>
          <Text style={styles.date}>Updated {new Date(complaint.updated_at).toLocaleString()}</Text>
        </Pressable>
      ))}
      {complaints?.length === 0 && <Text style={styles.empty}>No complaints found.</Text>}
      {isTenant && (
        <Pressable style={styles.primaryButton} onPress={() => router.push("/complaints/new")}>
          <Text style={styles.primaryText}>Report a problem</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function statusLabel(status: ComplaintStatus): string {
  return status.replace("_", " ");
}

function statusColor(status: ComplaintStatus): { color: string } {
  return { color: status === "closed" || status === "resolved" ? theme.success : status === "in_progress" ? theme.accent : theme.warn };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  title: { color: theme.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: theme.textLight, fontSize: 12, marginTop: 2 },
  iconButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" },
  section: { marginBottom: 12 },
  sectionTitle: { color: theme.text, fontWeight: "800", marginBottom: 6 },
  notice: { backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 7, borderWidth: 1, borderColor: theme.border },
  unreadNotice: { borderColor: theme.accent },
  unreadLabel: { color: theme.accent, fontSize: 10, fontWeight: "800", marginTop: 5 },
  filterBlock: { marginBottom: 12, gap: 5 },
  filterLabel: { color: theme.text, fontSize: 12, fontWeight: "700" },
  filterRow: { gap: 6, paddingBottom: 5 },
  filterChip: { borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#fff" },
  filterChipOn: { backgroundColor: theme.accent, borderColor: theme.accent },
  filterText: { color: theme.text, fontSize: 11, textTransform: "capitalize" },
  filterTextOn: { color: "#fff", fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: theme.border },
  cardTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  cardTitle: { color: theme.text, fontSize: 15, fontWeight: "800", flex: 1 },
  status: { fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  meta: { color: theme.textLight, fontSize: 12, marginTop: 3 },
  description: { color: theme.text, fontSize: 13, marginTop: 8 },
  date: { color: theme.textLight, fontSize: 10, marginTop: 7 },
  error: { color: theme.danger, marginBottom: 10 },
  empty: { color: theme.textLight, textAlign: "center", paddingVertical: 20 },
  primaryButton: { marginTop: 6, borderRadius: 12, padding: 14, alignItems: "center", backgroundColor: theme.accent },
  primaryText: { color: "#fff", fontWeight: "800" },
});
