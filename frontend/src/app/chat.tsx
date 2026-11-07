import { api, WS_HOST } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AppText, Skeleton } from "@/components/ui-components";

type ConversationType = "announcement" | "group" | "direct";
type Conversation = {
  id: string;
  property_id: string;
  property_name: string;
  type: ConversationType;
  title: string;
  other_user_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};
type Contact = {
  user_id: string;
  name: string;
  role: "owner" | "manager" | "tenant";
  room_number: string | null;
  property_id: string;
  property_name: string;
};
type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

type ListRow =
  | { kind: "conversation"; conversation: Conversation }
  | { kind: "contact"; contact: Contact };
type ListSection = { id: string; label: string; rows: ListRow[] };

function formatLastMessageTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function timeOnly(value: string): string {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(value: string): string {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((today - day) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function conversationIcon(type: ConversationType) {
  if (type === "announcement") return "megaphone-outline";
  if (type === "group") return "people-outline";
  return "person-outline";
}

export default function ChatPage() {
  return <ChatScreen />;
}

// Chat client implementation lives in ChatScreen (imported by tenant tabs too).
export function ChatScreen() {
  const { token, role } = useAuth();
  const router = useRouter();
  const accent = role === "tenant" ? roleAccents.tenant : roleAccents.manager;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const isTenant = role === "tenant";
  const params = useLocalSearchParams<{
    tenantUserId?: string | string[];
    propertyId?: string | string[];
  }>();
  const paramUserId = Array.isArray(params.tenantUserId) ? params.tenantUserId[0] : params.tenantUserId;
  const paramPropertyId = Array.isArray(params.propertyId) ? params.propertyId[0] : params.propertyId;
  const openedParamRef = useRef<string | null>(null);
  const selected = conversations.find((item) => item.id === selectedId) ?? null;

  const loadConversations = useCallback(async () => {
    try {
      setError(null);
      // Always load ALL conversations for the org; building info comes from
      // each conversation's property_name, not a query filter.
      const result = await api.get<{ conversations: Conversation[]; contacts: Contact[] }>("/conversations");
      setConversations(result.conversations);
      setContacts(result.contacts);
      // Default to the list view; only keep an open thread if it still exists.
      setSelectedId((current) =>
        current && result.conversations.some((item) => item.id === current) ? current : null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadConversations(); }, [loadConversations]));

  // Deep link from tenant profile: open (or create) a direct chat with the
  // given tenant user, then clear the params.
  useEffect(() => {
    if (!paramUserId || loading || contacts.length === 0) return;
    if (openedParamRef.current === paramUserId) return;
    openedParamRef.current = paramUserId;
    const contact =
      contacts.find((c) => c.user_id === paramUserId
        && (!paramPropertyId || c.property_id === paramPropertyId))
      ?? contacts.find((c) => c.user_id === paramUserId);
    const clearParams = () => router.setParams({ tenantUserId: undefined, propertyId: undefined });
    if (contact) {
      openContact(contact).finally(clearParams);
    } else {
      setError("That person isn't in your contacts yet");
      clearParams();
    }
  }, [paramUserId, paramPropertyId, contacts, loading]);

  const loadMessages = useCallback(async (scroll = false) => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    try {
      const page = await api.get<{ messages: Message[]; next_cursor: string | null }>(
        `/conversations/${selectedId}/messages`
      );
      setMessages(page.messages);
      setConversations((current) => current.map((item) =>
        item.id === selectedId ? { ...item, unread_count: 0 } : item
      ));
      if (scroll) setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 60);
    } catch (e: any) {
      setError(e?.message ?? "Could not load messages");
    }
  }, [selectedId]);

  useEffect(() => {
    setMessages([]);
    if (selectedId) loadMessages(true);
  }, [loadMessages, selectedId]);

  useEffect(() => {
    if (!selectedId || !token) return;
    const url = `${WS_HOST}/ws/chat?conversation_id=${encodeURIComponent(selectedId)}`;
    const socket = new WebSocket(url, ["bearer", token]);
    socketRef.current = socket;
    socket.onopen = () => setError(null);
    socket.onmessage = (event) => {
      const data = JSON.parse(String(event.data)) as Message | { error: string };
      if ("error" in data) {
        setError(data.error);
        return;
      }
      setMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data]);
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "read" }));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      setConversations((current) => current.map((item) => item.id === selectedId
        ? { ...item, last_message: data.body, last_message_at: data.created_at, unread_count: 0 }
        : item
      ));
    };
    socket.onerror = () => {
      setError("Live chat disconnected; checking for new messages periodically.");
    };
    const poller = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) loadMessages();
    }, 5000);
    return () => {
      clearInterval(poller);
      socket.close();
      socketRef.current = null;
    };
  }, [loadMessages, selectedId, token]);

  async function openContact(contact: Contact) {
    const existing = conversations.find((item) =>
      item.type === "direct"
      && item.other_user_id === contact.user_id
      && item.property_id === contact.property_id
    );
    if (existing) {
      setSelectedId(existing.id);
      return;
    }
    try {
      setError(null);
      const created = await api.post<Conversation>("/conversations/direct", {
        other_user_id: contact.user_id,
        property_id: contact.property_id,
      });
      setConversations((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedId(created.id);
    } catch (e: any) {
      setError(e?.message ?? "Could not open direct chat");
    }
  }

  async function send() {
    const body = draft.trim();
    if (!selected || !body || sending) return;
    setSending(true);
    setError(null);
    try {
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ body }));
        setDraft("");
      } else {
        const message = await api.post<Message>(`/conversations/${selected.id}/messages`, { body });
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        setDraft("");
      }
    } catch (e: any) {
      setError(e?.message ?? "Message could not be sent");
    } finally {
      setSending(false);
    }
  }

  // Group conversations and contact shortcuts into sections for the list view.
  const sections = useMemo<ListSection[]>(() => {
    const directFor = (contact: Contact) =>
      conversations.find((item) =>
        item.type === "direct"
        && item.other_user_id === contact.user_id
        && item.property_id === contact.property_id
      );

    const sectionList: ListSection[] = [];

    const announcementRows: ListRow[] = conversations
      .filter((item) => item.type === "announcement")
      .map((conversation) => ({ kind: "conversation", conversation }));
    if (announcementRows.length > 0) {
      sectionList.push({ id: "announcements", label: "Announcements", rows: announcementRows });
    }

    const groupLabel = isTenant ? "My building chat" : "Building chats";
    const groupRows: ListRow[] = conversations
      .filter((item) => item.type === "group")
      .map((conversation) => ({ kind: "conversation", conversation }));
    if (groupRows.length > 0) {
      sectionList.push({ id: "groups", label: groupLabel, rows: groupRows });
    }

    if (isTenant) {
      // Direct chats with staff (and a shortcut to open one with the owner).
      const directRows: ListRow[] = conversations
        .filter((item) =>
          item.type === "direct"
          && contacts.some((contact) =>
            contact.user_id === item.other_user_id && contact.role !== "tenant"))
        .map((conversation) => ({ kind: "conversation", conversation }));
      const ownerContact = contacts.find((contact) => contact.role === "owner")
        ?? contacts.find((contact) => contact.role === "manager");
      if (ownerContact && !directRows.some(
          (row) => row.kind === "conversation"
            && row.conversation.other_user_id === ownerContact.user_id
            && row.conversation.property_id === ownerContact.property_id)) {
        directRows.push({ kind: "contact", contact: ownerContact });
      }
      if (directRows.length > 0) {
        sectionList.push({ id: "direct", label: "Administration", rows: directRows });
      }
    } else {
      const directRows: ListRow[] = conversations
        .filter((item) => item.type === "direct")
        .map((conversation) => ({ kind: "conversation", conversation }));
      // Tenants without an existing direct conversation get a contact shortcut.
      const tenantContacts = contacts.filter((contact) =>
        contact.role === "tenant"
        && !directRows.some(
          (row) => row.kind === "conversation"
            && row.conversation.other_user_id === contact.user_id
            && row.conversation.property_id === contact.property_id));
      for (const contact of tenantContacts) directRows.push({ kind: "contact", contact });
      if (directRows.length > 0) {
        sectionList.push({ id: "direct", label: "Direct messages", rows: directRows });
      }
    }

    return sectionList;
  }, [conversations, contacts, isTenant]);

  const hasAnyRow = sections.some((section) => section.rows.length > 0);
  const unreadTotal = conversations.reduce((sum, item) => sum + item.unread_count, 0);

  if (!selectedId) {
    return (
      <View style={styles.container}>
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: accent.accent }]}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>{isTenant ? "STAY CONNECTED" : "TEAM INBOX"}</Text>
              <AppText variant="h2" color="#fff">
                Chat
              </AppText>
              <AppText variant="caption" color="rgba(255,255,255,0.74)">
                {unreadTotal > 0
                  ? `${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"}`
                  : isTenant
                    ? "Reach your PG manager and building group"
                    : "Talk to tenants and your team"}
              </AppText>
            </View>
            <TouchableOpacity
              style={styles.headerAction}
              onPress={() => {
                setLoading(true);
                loadConversations();
              }}
              accessibilityLabel="Refresh conversations"
            >
              <Ionicons name="refresh" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{conversations.length}</Text>
              <Text style={styles.heroStatLabel}>CONVERSATIONS</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{unreadTotal}</Text>
              <Text style={styles.heroStatLabel}>UNREAD</Text>
            </View>
          </View>
        </View>

        <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {loading && conversations.length === 0 ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={132} radius={16} />
              <Skeleton height={132} radius={16} />
              <Skeleton height={132} radius={16} />
            </View>
          ) : !hasAnyRow ? (
            <View style={styles.emptyCard}>
              <View style={[styles.emptyIcon, { backgroundColor: accent.accentSoft }]}>
                <Ionicons name="chatbubbles-outline" size={28} color={accent.accent} />
              </View>
              <AppText variant="h4" color={design.colors.textPrimary}>
                No conversations yet
              </AppText>
              <AppText
                variant="bodySmall"
                color={design.colors.textSecondary}
                style={{ textAlign: "center", lineHeight: 20 }}
              >
                {isTenant
                  ? "Your manager may start a chat with you, or you can message the administration."
                  : "Direct chats and building groups will appear here once tenants join."}
              </AppText>
            </View>
          ) : (
            sections.map((section) => (
              <View key={section.id} style={styles.section}>
                <View style={styles.sectionHead}>
                  <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                    {section.label.toUpperCase()}
                  </AppText>
                  <AppText variant="caption" color={design.colors.textMuted}>
                    {section.rows.length}
                  </AppText>
                </View>
                <View style={styles.sectionCard}>
                  {section.rows.map((row, index) => (
                    <ListRowItem
                      key={row.kind === "conversation"
                        ? row.conversation.id
                        : `${row.contact.property_id}-${row.contact.user_id}`}
                      row={row}
                      first={index === 0}
                      accent={accent}
                      onPress={() => row.kind === "conversation"
                        ? setSelectedId(row.conversation.id)
                        : openContact(row.contact)}
                    />
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  const isReadOnlyAnnouncement = isTenant && selected?.type === "announcement";
  const threadIcon = selected ? conversationIcon(selected.type) : "chatbubble-outline";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.threadHeader, { backgroundColor: accent.accent }]}>
        <View style={styles.threadGlow} />
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setSelectedId(null)}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.threadAvatar}>
          <Ionicons name={threadIcon as any} size={19} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.threadTitle} numberOfLines={1}>
            {selected?.title ?? "Chat"}
          </Text>
          <Text style={styles.threadSubtitle} numberOfLines={1}>
            {selected?.property_name ?? "Conversation"}
            {selected?.type === "announcement" ? " · read only" : ""}
          </Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        ref={listRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const previous = index > 0 ? messages[index - 1] : null;
          const showDay =
            !previous || dayLabel(previous.created_at) !== dayLabel(item.created_at);
          return (
            <View>
              {showDay ? (
                <View style={styles.dayDivider}>
                  <View style={styles.dayLine} />
                  <Text style={styles.dayText}>{dayLabel(item.created_at)}</Text>
                  <View style={styles.dayLine} />
                </View>
              ) : null}
              <View style={styles.messageRow}>
                <View style={styles.messageBubble}>
                  <Text style={[styles.sender, { color: accent.accent }]}>{item.sender_name}</Text>
                  <Text style={styles.messageText}>{item.body}</Text>
                  <Text style={styles.time}>{timeOnly(item.created_at)}</Text>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.threadEmpty}>
            <View style={[styles.emptyIcon, { backgroundColor: accent.accentSoft }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={25} color={accent.accent} />
            </View>
            <AppText variant="bodySmall" color={design.colors.textMuted}>
              No messages yet. Say hello!
            </AppText>
          </View>
        }
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      {selected && !isReadOnlyAnnouncement && (
        <View style={styles.composer}>
          <TextInput
            style={styles.messageInput}
            placeholder="Write a message…"
            placeholderTextColor={design.colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            maxLength={2000}
            multiline
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: accent.accent },
              (!draft.trim() || sending) && styles.sendDisabled,
            ]}
            onPress={send}
            disabled={!draft.trim() || sending}
            accessibilityLabel="Send message"
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="send" size={17} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}
      {selected && isReadOnlyAnnouncement && (
        <View style={styles.readOnly}>
          <Ionicons name="lock-closed-outline" size={14} color={design.colors.textMuted} />
          <Text style={styles.readOnlyText}>Announcements are read-only</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function ListRowItem({
  row,
  first,
  accent,
  onPress,
}: {
  row: ListRow;
  first: boolean;
  accent: { accent: string; accentSoft: string; accentText: string };
  onPress: () => void;
}) {
  const isConversation = row.kind === "conversation";
  const icon = isConversation
    ? conversationIcon(row.conversation.type)
    : "person-outline";
  const title = isConversation
    ? row.conversation.title
    : row.contact.role === "tenant"
      ? `${row.contact.name} · Room ${row.contact.room_number ?? "—"}`
      : row.contact.role === "owner"
        ? `Owner · ${row.contact.name}`
        : row.contact.name;
  const building = isConversation
    ? row.conversation.property_name
    : row.contact.property_name;
  const preview = isConversation ? row.conversation.last_message : null;
  const time = formatLastMessageTime(isConversation ? row.conversation.last_message_at : null);
  const unread = isConversation ? row.conversation.unread_count : 0;
  const typeLabel = isConversation
    ? row.conversation.type === "announcement"
      ? "Announcement"
      : row.conversation.type === "group"
        ? "Group"
        : "Direct"
    : row.contact.role === "tenant"
      ? "Tenant"
      : row.contact.role === "owner"
        ? "Owner"
        : "Manager";

  return (
    <TouchableOpacity
      style={[styles.row, !first && styles.rowDivider]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: accent.accentSoft }]}>
        <Ionicons name={icon as any} size={19} color={accent.accent} />
        {unread > 0 && <View style={styles.smallDot} />}
      </View>
      <View style={styles.rowMain}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          {time ? <Text style={styles.rowTime}>{time}</Text> : null}
        </View>
        <View style={styles.rowSubLine}>
          {building ? (
            <>
              <Ionicons name="business-outline" size={10} color={design.colors.textMuted} />
              <Text style={styles.rowBuilding} numberOfLines={1}>
                {building}
              </Text>
              <Text style={styles.dot}>·</Text>
            </>
          ) : null}
          <Text style={styles.rowType}>{typeLabel}</Text>
        </View>
        <View style={styles.rowBottomLine}>
          <Text style={styles.rowPreview} numberOfLines={1}>
            {preview ?? (isConversation ? "No messages yet" : "Tap to start a conversation")}
          </Text>
          {unread > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: accent.accent }]}>
              <Text style={styles.unreadText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </View>
      </View>
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

  // List view
  listScroll: { flex: 1 },
  listContent: { padding: 16, paddingTop: 14, paddingBottom: 110, gap: 12 },
  section: { gap: 7 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    overflow: "hidden",
    ...getShadow("sm"),
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 13,
    minHeight: 68,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: design.colors.border },
  rowIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  smallDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: design.colors.danger,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { flex: 1, color: design.colors.textPrimary, fontSize: 14, fontWeight: "800" },
  rowTime: { color: design.colors.textMuted, fontSize: 10, fontWeight: "700" },
  rowSubLine: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  rowBuilding: { color: design.colors.textSecondary, fontSize: 11, fontWeight: "600", maxWidth: "60%" },
  dot: { color: design.colors.textMuted, fontSize: 10 },
  rowType: { color: design.colors.textMuted, fontSize: 10, fontWeight: "600" },
  rowBottomLine: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  rowPreview: { flex: 1, color: design.colors.textSecondary, fontSize: 12 },
  unreadBadge: {
    borderRadius: 999,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: "center",
  },
  unreadText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  emptyCard: {
    alignItems: "center",
    gap: 7,
    padding: 26,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    marginTop: 10,
    ...getShadow("sm"),
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },

  // Thread view
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 13,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: "hidden",
  },
  threadGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -60,
    right: -20,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  threadAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  threadTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  threadSubtitle: { color: "rgba(255,255,255,0.72)", fontSize: 11, marginTop: 1, fontWeight: "600" },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#86EFAC" },
  liveText: { color: "#fff", fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },

  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, flexGrow: 1, justifyContent: "flex-end" },
  dayDivider: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 10 },
  dayLine: { flex: 1, height: 1, backgroundColor: design.colors.border },
  dayText: { fontSize: 10, fontWeight: "700", color: design.colors.textMuted },
  messageRow: { alignItems: "flex-start", marginVertical: 3 },
  messageBubble: {
    maxWidth: "86%",
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 14,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: design.colors.border,
    ...getShadow("sm"),
  },
  sender: { fontSize: 10, fontWeight: "800", marginBottom: 2 },
  messageText: { color: design.colors.textPrimary, fontSize: 14, lineHeight: 20 },
  time: { color: design.colors.textMuted, fontSize: 9, alignSelf: "flex-end", marginTop: 3 },
  threadEmpty: { alignItems: "center", gap: 8, paddingVertical: 30 },
  error: {
    color: design.colors.danger,
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontSize: 12,
    textAlign: "center",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: design.colors.border,
  },
  messageInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    backgroundColor: design.colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: design.colors.textPrimary,
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.45 },
  readOnly: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    alignItems: "center",
    padding: 13,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: design.colors.border,
  },
  readOnlyText: { color: design.colors.textMuted, fontSize: 12, fontWeight: "600" },
});
