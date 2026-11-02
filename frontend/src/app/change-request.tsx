import { LocationPicker, selectionLabel, emptySel, type LocationSel } from "@/components/LocationPicker";
import { ConfirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fetchPublicPg, type PublicBuilding } from "@/lib/public";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useState } from "react";

export default function ChangeRequestScreen() {
  const router = useRouter();
  const { orgId } = useAuth();
  const [buildings, setBuildings] = useState<PublicBuilding[]>([]);
  const [sel, setSel] = useState<LocationSel>(emptySel);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    fetchPublicPg(orgId)
      .then((d) => setBuildings(d.buildings))
      .catch(() => setBuildings([]));
  }, [orgId]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/my/change-requests", {
        building_id: sel.building,
        floor_id: sel.floor,
        room_id: sel.room,
        bed_id: sel.bed,
        note: note.trim() || null,
      });
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to send your request");
    } finally {
      setBusy(false);
      setConfirmSend(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.accentText} />
        </Pressable>
        <Text style={styles.h1}>Request a change</Text>
      </View>

      {done ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
          <Text style={styles.emptyTitle}>Request sent</Text>
          <Text style={styles.emptyText}>
            Your manager has been notified and will respond soon.{"\n"}
            You can see updates from the bell icon on your home screen.
          </Text>
          <Pressable style={styles.btn} onPress={() => router.back()}>
            <Text style={styles.btnText}>Back to my stay</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
          <Text style={styles.lead}>
            Pick where you'd like to move. Leave everything as “All” to just say you want a change — your
            manager will suggest options.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Where would you prefer?</Text>
            <LocationPicker buildings={buildings} value={sel} onChange={setSel} withBed />
            <Text style={styles.chosen}>Chosen: {selectionLabel(sel, buildings)}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Anything else? (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. need a ground floor room for my knee"
              placeholderTextColor={theme.textLight}
              value={note}
              onChangeText={setNote}
              multiline
            />
          </View>

          <Pressable
            style={styles.btn}
            disabled={!orgId}
            onPress={() => setConfirmSend(true)}
          >
            <Text style={styles.btnText}>{busy ? "Sending…" : "Send request to manager"}</Text>
          </Pressable>
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={confirmSend}
        title="Send this request?"
        message={`Your manager will be notified: move to ${selectionLabel(sel, buildings)}.`}
        confirmLabel="Send"
        busy={busy}
        onCancel={() => setConfirmSend(false)}
        onConfirm={send}
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
  lead: { fontSize: 13, color: theme.textLight, lineHeight: 19 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border, gap: 10 },
  label: { fontSize: 14, fontWeight: "800", color: theme.text },
  chosen: { fontSize: 12, fontWeight: "700", color: theme.accentText },
  input: {
    backgroundColor: theme.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    fontSize: 14,
    color: theme.text,
    minHeight: 80,
    textAlignVertical: "top",
  },
  btn: { backgroundColor: theme.accent, borderRadius: 14, padding: 14, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
  error: { color: theme.danger, fontSize: 13 },
  empty: { alignItems: "center", padding: 32, gap: 10, flex: 1, justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: theme.text },
  emptyText: { fontSize: 13, color: theme.textLight, textAlign: "center", lineHeight: 19 },
});
