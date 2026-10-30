import { API_HOST, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type Status = "open" | "in_progress" | "resolved" | "closed";
type Complaint = {
  id: string;
  property_name: string;
  tenant_name: string;
  category: string;
  title: string;
  description: string;
  priority: string;
  status: Status;
  created_at: string;
  updated_at: string;
  attachments: { id: string; original_name: string; content_type: string }[];
  comments: { id: string; author_name: string | null; body: string; created_at: string }[];
  status_history: { id: string; status: Status; created_at: string }[];
};

const nextStatus: Partial<Record<Status, Status>> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "closed",
};

export default function ComplaintDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role, token } = useAuth();
  const router = useRouter();
  const isStaff = role === "owner" || role === "manager";
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = complaint
    ? [
        ...complaint.status_history.map((item) => ({
          id: item.id,
          body: `Status changed to ${item.status.replace("_", " ")}`,
          author: "Status",
          created_at: item.created_at,
        })),
        ...complaint.comments.map((item) => ({
          id: item.id,
          body: item.body,
          author: item.author_name ?? "User",
          created_at: item.created_at,
        })),
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : [];

  const load = useCallback(async () => {
    try {
      setError(null);
      setComplaint(await api.get<Complaint>(`/complaints/${id}`));
    } catch (e: any) {
      setError(e?.message ?? "Could not load complaint");
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function advanceStatus() {
    if (!complaint || !nextStatus[complaint.status]) return;
    setBusy(true);
    try {
      setComplaint(await api.patch<Complaint>(`/complaints/${complaint.id}/status`, { status: nextStatus[complaint.status] }));
    } catch (e: any) {
      Alert.alert("Could not update status", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendComment() {
    if (!complaint || !comment.trim()) return;
    setBusy(true);
    try {
      setComplaint(await api.post<Complaint>(`/complaints/${complaint.id}/comments`, { body: comment.trim() }));
      setComment("");
    } catch (e: any) {
      Alert.alert("Could not add comment", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={20} color={theme.accentText} />
        <Text style={styles.backText}>Complaints</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      {!complaint && !error && <ActivityIndicator color={theme.accent} />}
      {complaint && (
        <>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.title}>{complaint.title}</Text>
              <Text style={[styles.status, statusColor(complaint.status)]}>{complaint.status.replace("_", " ").toUpperCase()}</Text>
            </View>
            <Text style={styles.meta}>{isStaff ? `${complaint.tenant_name} · ` : ""}{complaint.property_name}</Text>
            <Text style={styles.meta}>{complaint.category} · {complaint.priority} priority</Text>
            <Text style={styles.description}>{complaint.description}</Text>
            <Text style={styles.meta}>Reported {new Date(complaint.created_at).toLocaleString()}</Text>
          </View>

          {complaint.attachments.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Photos</Text>
              <View style={styles.photos}>
                {complaint.attachments.map((attachment) => (
                  <Image
                    key={attachment.id}
                    style={styles.photo}
                    source={{
                      uri: `${API_HOST}/complaints/${complaint.id}/attachments/${attachment.id}`,
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                    }}
                    accessibilityLabel={attachment.original_name}
                  />
                ))}
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>History</Text>
            {history.map((item) => (
              <View key={item.id} style={styles.comment}>
                <Text style={styles.commentAuthor}>{item.author} · {new Date(item.created_at).toLocaleString()}</Text>
                <Text style={styles.commentBody}>{item.body}</Text>
              </View>
            ))}
          </View>

          {isStaff && nextStatus[complaint.status] && (
            <Pressable style={styles.primary} onPress={advanceStatus} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Mark {nextStatus[complaint.status]?.replace("_", " ")}</Text>}
            </Pressable>
          )}
          {complaint.status !== "closed" && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{isStaff ? "Reply to tenant" : "Add a comment"}</Text>
              <TextInput
                style={styles.input}
                placeholder="Write a comment"
                multiline
                maxLength={2000}
                value={comment}
                onChangeText={setComment}
              />
              <Pressable style={styles.primary} onPress={sendComment} disabled={busy || !comment.trim()}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send comment</Text>}
              </Pressable>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function statusColor(status: Status) {
  return { color: status === "closed" || status === "resolved" ? theme.success : status === "in_progress" ? theme.accent : theme.warn };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 36 },
  back: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backText: { color: theme.accentText, fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  title: { color: theme.text, fontSize: 20, fontWeight: "800", flex: 1 },
  status: { fontSize: 10, fontWeight: "800" },
  meta: { color: theme.textLight, fontSize: 12, marginTop: 4 },
  description: { color: theme.text, fontSize: 14, lineHeight: 21, marginVertical: 12 },
  sectionTitle: { color: theme.text, fontSize: 15, fontWeight: "800", marginBottom: 8 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { width: 96, height: 96, borderRadius: 9, backgroundColor: theme.bgDeep },
  history: { color: theme.textLight, fontSize: 12 },
  comment: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 9, marginTop: 9 },
  commentAuthor: { color: theme.textLight, fontSize: 11 },
  commentBody: { color: theme.text, fontSize: 13, marginTop: 4 },
  input: { minHeight: 80, textAlignVertical: "top", borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 10, color: theme.text, marginBottom: 9 },
  primary: { backgroundColor: theme.accent, borderRadius: 11, padding: 12, alignItems: "center", marginBottom: 10 },
  primaryText: { color: "#fff", fontWeight: "800", textTransform: "capitalize" },
  error: { color: theme.danger, marginVertical: 12 },
});
