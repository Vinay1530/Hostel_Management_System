import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePg } from "@/lib/pg";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
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
  created_at: string;
  updated_at: string;
  comments: { id: string }[];
};

type Notice = {
  id: string;
  title: string;
  body: string;
  complaint_id: string | null;
  created_at: string;
  read_at: string | null;
};

const STATUS_META: Record<
  ComplaintStatus,
  { label: string; variant: "warning" | "info" | "success" | "neutral" }
> = {
  open: { label: "Open", variant: "warning" },
  in_progress: { label: "In progress", variant: "info" },
  resolved: { label: "Resolved", variant: "success" },
  closed: { label: "Closed", variant: "neutral" },
};

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  water: { label: "Water", icon: "water-outline" },
  electricity: { label: "Electricity", icon: "flash-outline" },
  wifi: { label: "WiFi", icon: "wifi-outline" },
  food: { label: "Food", icon: "restaurant-outline" },
  cleaning: { label: "Cleaning", icon: "sparkles-outline" },
  maintenance: { label: "Maintenance", icon: "construct-outline" },
  other: { label: "Other", icon: "help-circle-outline" },
};

const CATEGORY_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "water", label: "Water" },
  { value: "electricity", label: "Power" },
  { value: "wifi", label: "WiFi" },
  { value: "food", label: "Food" },
  { value: "cleaning", label: "Cleaning" },
  { value: "maintenance", label: "Repairs" },
  { value: "other", label: "Other" },
];

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function timeAgo(iso: string): string {
  const date = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  if (isNaN(date.getTime())) return iso.slice(0, 10);
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function priorityVariant(priority: string): "danger" | "warning" | "neutral" {
  if (priority === "high") return "danger";
  if (priority === "medium") return "warning";
  return "neutral";
}

export default function ComplaintsScreen() {
  const { role } = useAuth();
  const { propertyId } = usePg();
  const router = useRouter();
  const isTenant = role === "tenant";
  const accent = isTenant ? roleAccents.tenant : roleAccents.manager;

  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "pending" | "resolved">("all");
  const [category, setCategory] = useState("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const params = new URLSearchParams();
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
      setError(e?.detail ?? e?.message ?? "Could not load complaints");
    } finally {
      setLoading(false);
    }
  }, [isTenant, propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function markRead(notice: Notice) {
    if (notice.read_at) return;
    try {
      const updated = await api.patch<Notice>(`/my/notifications/${notice.id}/read`);
      setNotices((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch {
      // Not critical - the user can still open the complaint.
    }
  }

  const openCount = (complaints ?? []).filter((c) => c.status === "open").length;
  const progressCount = (complaints ?? []).filter((c) => c.status === "in_progress").length;
  const resolvedCount = (complaints ?? []).filter((c) =>
    ["resolved", "closed"].includes(c.status)
  ).length;

  const filtered = useMemo(() => {
    let list = complaints ?? [];
    if (category !== "all") list = list.filter((c) => c.category === category);
    if (tab === "pending")
      list = list.filter((c) => ["open", "in_progress"].includes(c.status));
    if (tab === "resolved") list = list.filter((c) => ["resolved", "closed"].includes(c.status));
    return list;
  }, [complaints, category, tab]);

  const unreadNotices = notices.filter((n) => !n.read_at);

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: accent.accent }]}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>
              {isTenant ? "HELP & REPAIRS" : "MAINTENANCE DESK"}
            </Text>
            <AppText variant="h2" color="#fff">
              {isTenant ? "My Complaints" : "Complaints"}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.72)">
              {isTenant
                ? "Report issues and follow every update"
                : "Review and resolve tenant reports"}
            </AppText>
          </View>
          {isTenant ? (
            <TouchableOpacity
              style={styles.headerAction}
              onPress={() => router.push("/complaints/new")}
              accessibilityLabel="New complaint"
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.headerAction}
              onPress={() => router.push("/chat")}
              accessibilityLabel="Open chat"
            >
              <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{openCount}</Text>
            <Text style={styles.heroStatLabel}>OPEN</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{progressCount}</Text>
            <Text style={styles.heroStatLabel}>IN PROGRESS</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{resolvedCount}</Text>
            <Text style={styles.heroStatLabel}>RESOLVED</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={accent.accent} />
        }
      >
        {/* Tenant update notices */}
        {isTenant && unreadNotices.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                UPDATES FOR YOU
              </AppText>
              <AppText variant="caption" color={design.colors.textMuted}>
                {unreadNotices.length} new
              </AppText>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.noticeRow}
            >
              {unreadNotices.map((notice) => (
                <TouchableOpacity
                  key={notice.id}
                  style={styles.noticeCard}
                  onPress={() => {
                    markRead(notice);
                    if (notice.complaint_id)
                      router.push({
                        pathname: "/complaints/[id]",
                        params: { id: notice.complaint_id },
                      });
                  }}
                  activeOpacity={0.9}
                >
                  <View style={[styles.noticeIcon, { backgroundColor: accent.accentSoft }]}>
                    <Ionicons name="notifications" size={15} color={accent.accent} />
                  </View>
                  <AppText
                    variant="bodySmall"
                    color={design.colors.textPrimary}
                    style={{ fontWeight: "800" }}
                    numberOfLines={1}
                  >
                    {notice.title}
                  </AppText>
                  <AppText
                    variant="caption"
                    color={design.colors.textSecondary}
                    numberOfLines={2}
                    style={{ lineHeight: 16 }}
                  >
                    {notice.body}
                  </AppText>
                  <AppText variant="caption" color={design.colors.textMuted} style={{ marginTop: 4 }}>
                    {timeAgo(notice.created_at)}
                  </AppText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

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
                style={[styles.tab, active && { backgroundColor: accent.accent }]}
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

        {/* Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          {CATEGORY_FILTERS.map((option) => {
            const active = category === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
                onPress={() => setCategory(option.value)}
              >
                <AppText
                  variant="caption"
                  color={active ? accent.accent : design.colors.textSecondary}
                  style={{ fontWeight: "700" }}
                >
                  {option.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading && !complaints && (
          <View style={{ gap: 10 }}>
            <Skeleton height={116} radius={16} />
            <Skeleton height={116} radius={16} />
            <Skeleton height={116} radius={16} />
          </View>
        )}

        {complaints && filtered.length === 0 && (
          <EmptyState
            icon="construct-outline"
            title={complaints.length === 0 ? "No complaints" : "Nothing in this view"}
            subtitle={
              complaints.length === 0
                ? isTenant
                  ? "Everything looks good. Report a problem if something needs fixing."
                  : "Tenant reports will show up here as soon as they are submitted."
                : "Try another category or status tab."
            }
            actionLabel={isTenant && complaints.length === 0 ? "Report a Problem" : undefined}
            onAction={
              isTenant && complaints.length === 0
                ? () => router.push("/complaints/new")
                : undefined
            }
          />
        )}

        <View style={{ gap: 9 }}>
          {filtered.map((complaint) => {
            const meta = STATUS_META[complaint.status];
            const cat = CATEGORY_META[complaint.category] ?? CATEGORY_META.other;
            return (
              <TouchableOpacity
                key={complaint.id}
                style={styles.card}
                activeOpacity={0.9}
                onPress={() =>
                  router.push({ pathname: "/complaints/[id]", params: { id: complaint.id } })
                }
              >
                <View style={styles.cardTop}>
                  <View style={[styles.categoryIcon, { backgroundColor: accent.accentSoft }]}>
                    <Ionicons name={cat.icon as any} size={19} color={accent.accent} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText
                      variant="body"
                      color={design.colors.textPrimary}
                      style={{ fontWeight: "800" }}
                      numberOfLines={1}
                    >
                      {complaint.title}
                    </AppText>
                    <View style={styles.metaLine}>
                      <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                        {cat.label} · {complaint.priority} priority
                      </AppText>
                      <AppBadge variant={priorityVariant(complaint.priority)}>
                        {complaint.priority.toUpperCase()}
                      </AppBadge>
                    </View>
                  </View>
                  <AppBadge variant={meta.variant}>{meta.label}</AppBadge>
                </View>

                <AppText
                  variant="caption"
                  color={design.colors.textSecondary}
                  numberOfLines={2}
                  style={{ lineHeight: 18 }}
                >
                  {complaint.description}
                </AppText>

                <View style={styles.footerRow}>
                  <View style={styles.personChip}>
                    <AppAvatar
                      initials={initials(isTenant ? complaint.property_name : complaint.tenant_name)}
                      size={22}
                      variant="neutral"
                    />
                    <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                      {isTenant ? complaint.property_name : complaint.tenant_name}
                    </AppText>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    {(complaint.comments?.length ?? 0) > 0 && (
                      <>
                        <Ionicons name="chatbubble-outline" size={11} color={design.colors.textMuted} />
                        <AppText variant="caption" color={design.colors.textMuted}>
                          {complaint.comments.length}
                        </AppText>
                        <Text style={styles.dot}>·</Text>
                      </>
                    )}
                    <AppText variant="caption" color={design.colors.textMuted}>
                      {timeAgo(complaint.updated_at)}
                    </AppText>
                    <Ionicons name="chevron-forward" size={13} color={design.colors.textMuted} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {isTenant && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: accent.accent }]}
          onPress={() => router.push("/complaints/new")}
          activeOpacity={0.9}
          accessibilityLabel="Report a problem"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  hero: {
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
  content: { padding: 16, paddingTop: 14, paddingBottom: 110 },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  noticeRow: { gap: 9, paddingBottom: 16 },
  noticeCard: {
    width: 210,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 11,
    gap: 4,
    ...getShadow("sm"),
  },
  noticeIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },

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

  categoryRow: { gap: 6, paddingBottom: 14 },
  categoryChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryChipActive: {
    backgroundColor: design.colors.primaryLight,
    borderColor: design.colors.primary,
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 13,
    gap: 9,
    ...getShadow("sm"),
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
    flexWrap: "wrap",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },
  personChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flex: 1,
    minWidth: 0,
  },
  dot: { color: design.colors.textMuted, fontSize: 11 },

  fab: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    ...getShadow("lg"),
  },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
