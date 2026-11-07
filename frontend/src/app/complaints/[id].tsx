import { API_HOST, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AppText,
  AppBadge,
  AppAvatar,
  Skeleton,
} from "@/components/ui-components";

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

const STATUS_META: Record<
  Status,
  { label: string; variant: "warning" | "info" | "success" | "neutral" }
> = {
  open: { label: "Open", variant: "warning" },
  in_progress: { label: "In progress", variant: "info" },
  resolved: { label: "Resolved", variant: "success" },
  closed: { label: "Closed", variant: "neutral" },
};

const STEPS: { status: Status; label: string; icon: string }[] = [
  { status: "open", label: "Reported", icon: "document-text-outline" },
  { status: "in_progress", label: "In progress", icon: "construct-outline" },
  { status: "resolved", label: "Resolved", icon: "checkmark-circle-outline" },
  { status: "closed", label: "Closed", icon: "lock-closed-outline" },
];

const NEXT: Partial<Record<Status, { status: Status; label: string }>> = {
  open: { status: "in_progress", label: "Start Working" },
  in_progress: { status: "resolved", label: "Mark Resolved" },
  resolved: { status: "closed", label: "Close Complaint" },
};

const CATEGORY_ICONS: Record<string, string> = {
  water: "water-outline",
  electricity: "flash-outline",
  wifi: "wifi-outline",
  food: "restaurant-outline",
  cleaning: "sparkles-outline",
  maintenance: "construct-outline",
  other: "help-circle-outline",
};

function prettyDateTime(value: string): string {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function priorityVariant(priority: string): "danger" | "warning" | "neutral" {
  if (priority === "high") return "danger";
  if (priority === "medium") return "warning";
  return "neutral";
}

export default function ComplaintDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { role, token } = useAuth();
  const router = useRouter();
  const isStaff = role === "owner" || role === "manager";
  const accent = isStaff ? roleAccents.manager : roleAccents.tenant;

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activity = complaint
    ? [
        ...complaint.status_history.map((item) => ({
          id: `status-${item.id}`,
          kind: "status" as const,
          body: `Status changed to ${STATUS_META[item.status]?.label ?? item.status}`,
          author: "System",
          created_at: item.created_at,
        })),
        ...complaint.comments.map((item) => ({
          id: `comment-${item.id}`,
          kind: "comment" as const,
          body: item.body,
          author: item.author_name ?? "User",
          created_at: item.created_at,
        })),
      ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    : [];

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      setComplaint(await api.get<Complaint>(`/complaints/${id}`));
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? "Could not load complaint");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function advanceStatus() {
    if (!complaint) return;
    const next = NEXT[complaint.status];
    if (!next) return;
    setBusy(true);
    try {
      setComplaint(await api.patch<Complaint>(`/complaints/${complaint.id}/status`, { status: next.status }));
    } catch (e: any) {
      Alert.alert("Could not update status", e?.detail ?? e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendComment() {
    if (!complaint || !comment.trim()) return;
    setBusy(true);
    try {
      setComplaint(
        await api.post<Complaint>(`/complaints/${complaint.id}/comments`, {
          body: comment.trim(),
        })
      );
      setComment("");
    } catch (e: any) {
      Alert.alert("Could not add comment", e?.detail ?? e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const statusMeta = complaint ? STATUS_META[complaint.status] : null;
  const stepIndex = complaint
    ? STEPS.findIndex((step) => step.status === complaint.status)
    : 0;

  return (
    <View style={styles.container}>
      {complaint ? (
        <View style={[styles.hero, { backgroundColor: accent.accent }]}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.heroCategory}>
              <Ionicons
                name={(CATEGORY_ICONS[complaint.category] ?? "help-circle-outline") as any}
                size={12}
                color="rgba(255,255,255,0.85)"
              />
              <Text style={styles.heroCategoryText}>
                {complaint.category.toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            {statusMeta ? <AppBadge variant={statusMeta.variant}>{statusMeta.label}</AppBadge> : null}
          </View>

          <AppText variant="h3" color="#fff" style={{ marginTop: 10 }}>
            {complaint.title}
          </AppText>
          <AppText variant="caption" color="rgba(255,255,255,0.74)" style={{ marginTop: 4 }}>
            {isStaff ? `${complaint.tenant_name} · ` : ""}
            {complaint.property_name} · reported {prettyDateTime(complaint.created_at)}
          </AppText>

          <View style={styles.heroFooter}>
            <View style={styles.heroPill}>
              <Ionicons name="flag-outline" size={11} color="#fff" />
              <Text style={styles.heroPillText}>{complaint.priority.toUpperCase()} PRIORITY</Text>
            </View>
            <View style={styles.heroPill}>
              <Ionicons name="chatbubble-outline" size={11} color="#fff" />
              <Text style={styles.heroPillText}>{complaint.comments.length} REPLIES</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.simpleHeader, { backgroundColor: accent.accent }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <AppText variant="h4" color="#fff" style={{ flex: 1 }}>
            Complaint
          </AppText>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={accent.accent} />
        }
      >
        {!complaint && loading && (
          <View style={{ gap: 10 }}>
            <Skeleton height={120} radius={16} />
            <Skeleton height={120} radius={16} />
            <Skeleton height={90} radius={16} />
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {complaint && (
          <>
            {/* Description */}
            <View style={styles.card}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionIcon, { backgroundColor: accent.accentSoft }]}>
                  <Ionicons name="document-text-outline" size={16} color={accent.accent} />
                </View>
                <AppText variant="h4" color={design.colors.textPrimary}>
                  Details
                </AppText>
                <View style={{ flex: 1 }} />
                <AppBadge variant={priorityVariant(complaint.priority)}>
                  {complaint.priority}
                </AppBadge>
              </View>
              <AppText
                variant="body"
                color={design.colors.textSecondary}
                style={{ lineHeight: 22, marginTop: 10 }}
              >
                {complaint.description}
              </AppText>
            </View>

            {/* Status timeline */}
            <View style={styles.card}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionIcon, { backgroundColor: accent.accentSoft }]}>
                  <Ionicons name="git-branch-outline" size={16} color={accent.accent} />
                </View>
                <AppText variant="h4" color={design.colors.textPrimary}>
                  Progress
                </AppText>
              </View>

              <View style={styles.stepper}>
                {STEPS.map((step, index) => {
                  const done = index <= stepIndex;
                  const current = index === stepIndex;
                  return (
                    <View key={step.status} style={styles.step}>
                      <View style={styles.stepRow}>
                        <View
                          style={[
                            styles.stepDot,
                            done && { backgroundColor: accent.accent, borderColor: accent.accent },
                            current && styles.stepDotCurrent,
                          ]}
                        >
                          <Ionicons
                            name={step.icon as any}
                            size={12}
                            color={done ? "#fff" : design.colors.textMuted}
                          />
                        </View>
                        {index < STEPS.length - 1 && (
                          <View
                            style={[
                              styles.stepLine,
                              index < stepIndex && { backgroundColor: accent.accent },
                            ]}
                          />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.stepLabel,
                          done && { color: design.colors.textPrimary },
                          current && { fontWeight: "800" },
                        ]}
                        numberOfLines={1}
                      >
                        {step.label}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {complaint.status_history.length > 0 && (
                <View style={styles.historyList}>
                  {complaint.status_history
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    )
                    .slice(0, 4)
                    .map((item) => (
                      <View key={item.id} style={styles.historyRow}>
                        <View style={[styles.historyDot, { backgroundColor: accent.accent }]} />
                        <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
                          {STATUS_META[item.status]?.label ?? item.status}
                        </AppText>
                        <AppText variant="caption" color={design.colors.textMuted}>
                          {prettyDateTime(item.created_at)}
                        </AppText>
                      </View>
                    ))}
                </View>
              )}
            </View>

            {/* Photos */}
            {complaint.attachments.length > 0 && (
              <View style={styles.card}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIcon, { backgroundColor: accent.accentSoft }]}>
                    <Ionicons name="images-outline" size={16} color={accent.accent} />
                  </View>
                  <AppText variant="h4" color={design.colors.textPrimary}>
                    Photos
                  </AppText>
                  <View style={{ flex: 1 }} />
                  <AppText variant="caption" color={design.colors.textMuted}>
                    {complaint.attachments.length}
                  </AppText>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photoRow}
                >
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
                </ScrollView>
              </View>
            )}

            {/* Activity */}
            <View style={styles.sectionRow}>
              <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                ACTIVITY
              </AppText>
              <AppText variant="caption" color={design.colors.textMuted}>
                {activity.length} update{activity.length === 1 ? "" : "s"}
              </AppText>
            </View>

            <View style={styles.card}>
              {activity.length === 0 && (
                <AppText variant="bodySmall" color={design.colors.textMuted} style={{ paddingVertical: 8 }}>
                  No replies yet. Add the first update below.
                </AppText>
              )}
              {activity.map((item, index) => (
                <View key={item.id} style={styles.activityRow}>
                  <View style={styles.activityRail}>
                    <View
                      style={[
                        styles.activityIcon,
                        {
                          backgroundColor:
                            item.kind === "status" ? accent.accentSoft : design.colors.surfaceVariant,
                        },
                      ]}
                    >
                      <Ionicons
                        name={item.kind === "status" ? "swap-horizontal" : "chatbubble-outline"}
                        size={12}
                        color={item.kind === "status" ? accent.accent : design.colors.textSecondary}
                      />
                    </View>
                    {index < activity.length - 1 && <View style={styles.activityLine} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 14 }}>
                    <View style={styles.activityHead}>
                      <AppText variant="caption" color={design.colors.textPrimary} style={{ fontWeight: "800", flex: 1 }}>
                        {item.author}
                      </AppText>
                      <AppText variant="caption" color={design.colors.textMuted}>
                        {prettyDateTime(item.created_at)}
                      </AppText>
                    </View>
                    <AppText
                      variant="bodySmall"
                      color={
                        item.kind === "status"
                          ? design.colors.textMuted
                          : design.colors.textSecondary
                      }
                      style={{ lineHeight: 19, marginTop: 2, fontStyle: item.kind === "status" ? "italic" : "normal" }}
                    >
                      {item.body}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>

            {/* Staff action */}
            {isStaff && NEXT[complaint.status] && (
              <TouchableOpacity
                style={[styles.advanceBtn, { backgroundColor: accent.accent }]}
                onPress={advanceStatus}
                disabled={busy}
                activeOpacity={0.9}
              >
                <Ionicons
                  name={
                    NEXT[complaint.status]!.status === "in_progress"
                      ? "construct-outline"
                      : NEXT[complaint.status]!.status === "resolved"
                        ? "checkmark-circle-outline"
                        : "lock-closed-outline"
                  }
                  size={18}
                  color="#fff"
                />
                <AppText variant="button" color="#fff">
                  {busy ? "Updating…" : NEXT[complaint.status]!.label}
                </AppText>
              </TouchableOpacity>
            )}

            {/* Comment composer */}
            {complaint.status !== "closed" && (
              <View style={styles.composer}>
                <AppAvatar
                  initials={isStaff ? "M" : initials(complaint.tenant_name) || "T"}
                  size={32}
                  variant="primary"
                />
                <TextInput
                  style={styles.composerInput}
                  placeholder={isStaff ? "Reply to the tenant…" : "Add a comment…"}
                  placeholderTextColor={design.colors.textMuted}
                  multiline
                  maxLength={2000}
                  value={comment}
                  onChangeText={setComment}
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    {
                      backgroundColor: comment.trim() ? accent.accent : design.colors.surfaceVariant,
                    },
                  ]}
                  onPress={sendComment}
                  disabled={busy || !comment.trim()}
                  accessibilityLabel="Send comment"
                >
                  <Ionicons
                    name="send"
                    size={16}
                    color={comment.trim() ? "#fff" : design.colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            )}
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
  heroTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroCategory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  heroCategoryText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  heroFooter: { flexDirection: "row", gap: 7, marginTop: 10 },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  heroPillText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },

  simpleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 90, gap: 10 },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 14,
    ...getShadow("sm"),
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },

  stepper: { flexDirection: "row", marginTop: 16, marginBottom: 4 },
  step: { flex: 1, alignItems: "center" },
  stepRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  stepDotCurrent: { borderWidth: 3, borderColor: "rgba(255,255,255,0.4)" },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: design.colors.border,
    marginHorizontal: -2,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: "600",
    color: design.colors.textMuted,
    marginTop: 5,
    textAlign: "center",
  },
  historyList: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
    gap: 7,
  },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  historyDot: { width: 6, height: 6, borderRadius: 3 },

  photoRow: { gap: 8, paddingTop: 12 },
  photo: {
    width: 104,
    height: 104,
    borderRadius: 12,
    backgroundColor: design.colors.surfaceVariant,
  },

  activityRow: { flexDirection: "row", gap: 10 },
  activityRail: { alignItems: "center", width: 28 },
  activityIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  activityLine: { flex: 1, width: 1.5, backgroundColor: design.colors.border, marginTop: 4 },
  activityHead: { flexDirection: "row", alignItems: "center", gap: 6 },

  advanceBtn: {
    minHeight: 50,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...getShadow("md"),
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    ...getShadow("sm"),
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: design.colors.background,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: design.colors.textPrimary,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { color: design.colors.danger, textAlign: "center", marginTop: 10 },
});
