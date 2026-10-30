import { api, WS_HOST } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePg } from "@/lib/pg";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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

export default function ChatScreen() {
  const { token, role } = useAuth();
  const { propertyId } = usePg();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const isTenant = role === "tenant";
  const selected = conversations.find((item) => item.id === selectedId) ?? null;

  const loadConversations = useCallback(async () => {
    try {
      setError(null);
      const query = propertyId ? `?property_id=${encodeURIComponent(propertyId)}` : "";
      const result = await api.get<{ conversations: Conversation[]; contacts: Contact[] }>(`/conversations${query}`);
      setConversations(result.conversations);
      setContacts(result.contacts);
      setSelectedId((current) => current && result.conversations.some((item) => item.id === current)
        ? current
        : result.conversations[0]?.id ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Could not load conversations");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useFocusEffect(useCallback(() => { loadConversations(); }, [loadConversations]));

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
        ? { ...item, last_message: data.body, last_message_at: data.created_at }
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

  const selectableContacts = useMemo(
    () => contacts.filter((contact) => contact.role === "tenant"),
    [contacts]
  );

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return selectableContacts.filter((contact) =>
      `${contact.name} ${contact.room_number ?? ""} ${contact.property_name}`.toLowerCase().includes(query)
    );
  }, [search, selectableContacts]);

  async function openContact(contact: Contact) {
    setPickerOpen(false);
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

  function chooseConversation(conversation: Conversation) {
    setPickerOpen(false);
    setSelectedId(conversation.id);
  }

  const ownerContact = contacts.find((contact) => contact.role === "owner") ?? contacts.find((contact) => contact.role === "manager");
  const announcements = conversations.filter((item) => item.type === "announcement");
  const groups = conversations.filter((item) => item.type === "group");
  const directLabel = selected?.type === "direct" && isTenant
    && contacts.some((contact) => contact.user_id === selected.other_user_id && contact.role !== "tenant")
    ? "Owner"
    : selected?.title ?? "Choose a conversation";

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.top}>
        <Text style={styles.pageTitle}>Chat</Text>
        <Pressable style={styles.selector} onPress={() => setPickerOpen(true)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.selectorTitle} numberOfLines={1}>{directLabel}</Text>
            <Text style={styles.selectorSub} numberOfLines={1}>{selected?.property_name ?? "Select a conversation"}</Text>
          </View>
          {selected?.unread_count ? <Text style={styles.unreadBadge}>{selected.unread_count}</Text> : null}
          <Ionicons name="chevron-down" size={18} color={theme.textLight} />
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {loading && conversations.length === 0 ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.accent} />
      ) : (
        <FlatList
          ref={listRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageContent}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            return (
              <View style={styles.messageRow}>
                <View style={styles.messageBubble}>
                  <Text style={styles.sender}>{item.sender_name}</Text>
                  <Text style={styles.messageText}>{item.body}</Text>
                  <Text style={styles.time}>{new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{selected ? "No messages yet. Start the conversation." : "Choose a conversation to view messages."}</Text>}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {selected && !(isTenant && selected.type === "announcement") && (
        <View style={styles.composer}>
          <TextInput
            style={styles.messageInput}
            placeholder="Write a message"
            value={draft}
            onChangeText={setDraft}
            maxLength={2000}
            multiline
          />
          <Pressable style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]} onPress={send} disabled={!draft.trim() || sending}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={17} color="#fff" />}
          </Pressable>
        </View>
      )}
      {selected && isTenant && selected.type === "announcement" && (
        <View style={styles.readOnly}><Ionicons name="lock-closed-outline" size={14} color={theme.textLight} /><Text style={styles.readOnlyText}>Announcements are read-only</Text></View>
      )}

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Choose conversation</Text>
              <Pressable onPress={() => setPickerOpen(false)}><Ionicons name="close" size={22} color={theme.textLight} /></Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {announcements.map((conversation) => (
                <ConversationOption
                  key={conversation.id}
                  conversation={conversation}
                  selected={selectedId === conversation.id}
                  onPress={() => chooseConversation(conversation)}
                  pinned
                />
              ))}
              {groups.map((conversation) => (
                <ConversationOption
                  key={conversation.id}
                  conversation={conversation}
                  selected={selectedId === conversation.id}
                  onPress={() => chooseConversation(conversation)}
                />
              ))}
              {isTenant && ownerContact && (
                <ContactOption
                  label="Owner"
                  detail={ownerContact.property_name}
                  unread={conversations.find((item) => item.type === "direct" && item.other_user_id === ownerContact.user_id && item.property_id === ownerContact.property_id)?.unread_count ?? 0}
                  onPress={() => openContact(ownerContact)}
                />
              )}
              {selectableContacts.length > 10 && (
                <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search people or room" />
              )}
              {filteredContacts.map((contact) => {
                const direct = conversations.find((item) =>
                  item.type === "direct" && item.other_user_id === contact.user_id && item.property_id === contact.property_id
                );
                const label = contact.role === "tenant"
                  ? `${contact.name} · Room ${contact.room_number ?? "—"}`
                  : contact.name;
                return (
                  <ContactOption
                    key={`${contact.property_id}-${contact.user_id}`}
                    label={label}
                    detail={contact.property_name}
                    unread={direct?.unread_count ?? 0}
                    onPress={() => openContact(contact)}
                  />
                );
              })}
              {filteredContacts.length === 0 && <Text style={styles.noContacts}>No people found.</Text>}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function ConversationOption({
  conversation,
  selected,
  onPress,
  pinned,
}: {
  conversation: Conversation;
  selected: boolean;
  onPress: () => void;
  pinned?: boolean;
}) {
  return (
    <Pressable style={[styles.option, selected && styles.optionSelected]} onPress={onPress}>
      <Ionicons name={pinned ? "pin" : conversation.type === "group" ? "people-outline" : "megaphone-outline"} size={18} color={theme.accentText} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{conversation.title}</Text>
        <Text style={styles.optionSub}>{conversation.property_name}</Text>
      </View>
      {conversation.unread_count > 0 && <Text style={styles.unreadBadge}>{conversation.unread_count}</Text>}
    </Pressable>
  );
}

function ContactOption({ label, detail, unread, onPress }: { label: string; detail: string; unread: number; onPress: () => void }) {
  return (
    <Pressable style={styles.option} onPress={onPress}>
      <Ionicons name="person-circle-outline" size={21} color={theme.textLight} />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{label}</Text>
        <Text style={styles.optionSub}>{detail}</Text>
      </View>
      {unread > 0 && <Text style={styles.unreadBadge}>{unread}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  top: { padding: 14, paddingBottom: 8 },
  pageTitle: { color: theme.text, fontSize: 23, fontWeight: "800", marginBottom: 8 },
  selector: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 13, padding: 11, borderWidth: 1, borderColor: theme.border },
  selectorTitle: { color: theme.text, fontWeight: "800", fontSize: 14 },
  selectorSub: { color: theme.textLight, fontSize: 11, marginTop: 2 },
  unreadBadge: { backgroundColor: theme.accent, color: "#fff", borderRadius: 999, overflow: "hidden", paddingHorizontal: 7, paddingVertical: 2, fontSize: 10, fontWeight: "800" },
  messageList: { flex: 1 },
  messageContent: { paddingHorizontal: 14, paddingVertical: 8, flexGrow: 1, justifyContent: "flex-end" },
  messageRow: { alignItems: "flex-start", marginVertical: 4 },
  messageBubble: { maxWidth: "86%", backgroundColor: "#fff", padding: 10, borderRadius: 13, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.border },
  sender: { color: theme.accentText, fontSize: 11, fontWeight: "800", marginBottom: 3 },
  messageText: { color: theme.text, fontSize: 14, lineHeight: 20 },
  time: { color: theme.textLight, fontSize: 9, alignSelf: "flex-end", marginTop: 4 },
  empty: { color: theme.textLight, textAlign: "center", padding: 24 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, backgroundColor: "#fff", borderTopWidth: 1, borderColor: theme.border },
  messageInput: { flex: 1, maxHeight: 110, backgroundColor: theme.bg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, color: theme.text },
  sendButton: { width: 42, height: 42, borderRadius: 13, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" },
  sendDisabled: { opacity: 0.5 },
  readOnly: { flexDirection: "row", justifyContent: "center", gap: 6, alignItems: "center", padding: 12, backgroundColor: "#fff", borderTopWidth: 1, borderColor: theme.border },
  readOnlyText: { color: theme.textLight, fontSize: 12 },
  error: { color: theme.danger, paddingHorizontal: 14, fontSize: 12 },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000055" },
  sheet: { maxHeight: "82%", backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 9 },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: theme.text },
  option: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: theme.border },
  optionSelected: { backgroundColor: theme.accentSoft },
  optionTitle: { color: theme.text, fontSize: 14, fontWeight: "700" },
  optionSub: { color: theme.textLight, fontSize: 11, marginTop: 2 },
  search: { backgroundColor: theme.bg, borderRadius: 10, padding: 10, marginVertical: 8, color: theme.text },
  noContacts: { padding: 16, color: theme.textLight, textAlign: "center" },
});
