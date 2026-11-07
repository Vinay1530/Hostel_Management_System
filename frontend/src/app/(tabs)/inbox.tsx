import { SearchBar } from "@/components/SearchBar";
import { AppText, AppBadge, Skeleton } from "@/components/ui-components";
import { api } from "@/lib/api";
import { design, getShadow } from "@/lib/design";
import { palette, roleAccents } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type RequestRow = { id: string; status: string };
type ComplaintRow = { id: string; status: string };
type Conversation = { id: string; unread_count: number };
type Notification = { id: string; read_at: string | null };

const accent = roleAccents.manager;

export default function InboxScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState({
    requests: 0,
    complaints: 0,
    unreadChats: 0,
    notifications: 0,
  });

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [requestsRes, complaintsRes, conversationsRes, notificationsRes] =
        await Promise.allSettled([
          api.get<RequestRow[]>("/requests"),
          api.get<ComplaintRow[]>("/complaints"),
          api.get<{ conversations: Conversation[] }>("/conversations"),
          api.get<Notification[]>("/staff/notifications"),
        ]);

      const requests =
        requestsRes.status === "fulfilled"
          ? requestsRes.value.filter((row) => row.status === "open").length
          : 0;
      const complaints =
        complaintsRes.status === "fulfilled"
          ? complaintsRes.value.filter(
              (row) => row.status === "open" || row.status === "in_progress"
            ).length
          : 0;
      const unreadChats =
        conversationsRes.status === "fulfilled"
          ? (conversationsRes.value.conversations ?? []).reduce(
              (sum, row) => sum + row.unread_count,
              0
            )
          : 0;
      const notifications =
        notificationsRes.status === "fulfilled"
          ? notificationsRes.value.filter((row) => !row.read_at).length
          : 0;

      setCounts({ requests, complaints, unreadChats, notifications });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>COMMUNICATIONS</Text>
            <AppText variant="h2" color="#fff">
              Inbox
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.74)">
              Requests, complaints and conversations
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => router.push("/notifications")}
            accessibilityLabel="Open notifications"
          >
            <Ionicons name="notifications-outline" size={20} color="#fff" />
            {counts.notifications > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {counts.notifications > 9 ? "9+" : counts.notifications}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{counts.requests}</Text>
            <Text style={styles.heroStatLabel}>OPEN REQUESTS</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{counts.complaints}</Text>
            <Text style={styles.heroStatLabel}>COMPLAINTS</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{counts.unreadChats}</Text>
            <Text style={styles.heroStatLabel}>UNREAD CHATS</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={accent.accent}
          />
        }
      >
        <SearchBar editable={false} onPress={() => router.push("/search")} />

        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={76} radius={16} />
            <Skeleton height={76} radius={16} />
            <Skeleton height={76} radius={16} />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <InboxCard
              icon="git-pull-request-outline"
              title="Tenant requests"
              subtitle="Bed / room changes and guest booking requests"
              count={counts.requests}
              countLabel="open"
              onPress={() => router.push("/requests" as any)}
            />
            <InboxCard
              icon="construct-outline"
              title="Tenant complaints"
              subtitle="Review issues, update status and reply"
              count={counts.complaints}
              countLabel="active"
              onPress={() => router.push("/complaints")}
            />
            <InboxCard
              icon="chatbubbles-outline"
              title="Property chat"
              subtitle="Announcements, group chat and direct messages"
              count={counts.unreadChats}
              countLabel="unread"
              onPress={() => router.push("/chat")}
            />
            <InboxCard
              icon="notifications-outline"
              title="Notifications"
              subtitle="Payments, notices and manager alerts"
              count={counts.notifications}
              countLabel="new"
              onPress={() => router.push("/notifications")}
            />
          </View>
        )}

        <View style={styles.tipCard}>
          <Ionicons name="bulb-outline" size={15} color={accent.accent} />
          <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1 }}>
            Open requests and complaints show up first for tenants — replying quickly keeps
            satisfaction high.
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

function InboxCard({
  icon,
  title,
  subtitle,
  count,
  countLabel,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  count: number;
  countLabel: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardIcon}>
        <Ionicons name={icon as any} size={21} color={accent.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.cardTitleRow}>
          <AppText
            variant="body"
            color={design.colors.textPrimary}
            style={{ fontWeight: "800", flex: 1 }}
            numberOfLines={1}
          >
            {title}
          </AppText>
          {count > 0 && (
            <AppBadge variant={countLabel === "unread" ? "primary" : "warning"}>
              {count} {countLabel}
            </AppBadge>
          )}
        </View>
        <AppText
          variant="caption"
          color={design.colors.textSecondary}
          style={{ marginTop: 3 }}
          numberOfLines={2}
        >
          {subtitle}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={17} color={design.colors.textMuted} />
    </TouchableOpacity>
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
    backgroundColor: accent.accent,
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
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: palette.rose,
    borderWidth: 1.5,
    borderColor: accent.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  bellBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
  content: { padding: 16, paddingTop: 14, paddingBottom: 26, gap: 12 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: design.colors.border,
    ...getShadow("sm"),
  },
  cardIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  tipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
  },
});
