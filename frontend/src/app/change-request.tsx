import { LocationPicker, selectionLabel, emptySel, type LocationSel } from "@/components/LocationPicker";
import { ConfirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fetchPublicPg, type PublicBuilding } from "@/lib/public";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AppButton,
  AppText,
} from "@/components/ui-components";

export default function ChangeRequestScreen() {
  const router = useRouter();
  const { orgId } = useAuth();
  const accent = roleAccents.tenant;

  const [buildings, setBuildings] = useState<PublicBuilding[]>([]);
  const [sel, setSel] = useState<LocationSel>(emptySel);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadBuildings() {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await fetchPublicPg(orgId);
      setBuildings(data.buildings ?? []);
    } catch {
      setBuildings([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBuildings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError(e?.detail ?? e?.message ?? "Failed to send your request");
    } finally {
      setBusy(false);
      setConfirmSend(false);
    }
  }

  const target = selectionLabel(sel, buildings);

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: accent.accent }]}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>ROOM CHANGE</Text>
            <AppText variant="h2" color="#fff">
              {done ? "Request Sent" : "Request a Change"}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.74)">
              {done
                ? "Your manager has your request"
                : "Tell your manager where you'd like to move"}
            </AppText>
          </View>
        </View>
      </View>

      {done ? (
        <ScrollView contentContainerStyle={styles.doneContent}>
          <View style={styles.doneCard}>
            <View style={[styles.doneIcon, { backgroundColor: "#ECFDF5" }]}>
              <Ionicons name="checkmark-circle" size={44} color="#059669" />
            </View>
            <AppText variant="h3" color={design.colors.textPrimary} style={{ textAlign: "center" }}>
              Request sent
            </AppText>
            <AppText
              variant="bodySmall"
              color={design.colors.textSecondary}
              style={{ textAlign: "center", lineHeight: 20 }}
            >
              Your manager has been notified and will respond soon. Updates appear under
              notifications from the bell icon.
            </AppText>

            <View style={styles.summaryCard}>
              <SummaryRow icon="location-outline" label="Preferred spot" value={target} />
              {note.trim() ? <SummaryRow icon="chatbox-outline" label="Your note" value={note.trim()} last /> : null}
            </View>

            <AppButton
              variant="primary"
              fullWidth
              icon="notifications-outline"
              onPress={() => router.push("/notifications")}
              style={{ backgroundColor: accent.accent }}
            >
              View Updates
            </AppButton>
            <AppButton variant="ghost" fullWidth onPress={() => router.back()}>
              Back to My Stay
            </AppButton>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadBuildings}
              tintColor={accent.accent}
            />
          }
        >
          <View style={styles.introCard}>
            <View style={[styles.introIcon, { backgroundColor: accent.accentSoft }]}>
              <Ionicons name="bulb-outline" size={17} color={accent.accent} />
            </View>
            <AppText variant="caption" color={design.colors.textSecondary} style={{ flex: 1, lineHeight: 18 }}>
              Pick where you'd like to move. Leave every level on{" "}
              <Text style={{ fontWeight: "800" }}>All</Text> to just say you want a change — your
              manager will suggest options.
            </AppText>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={[styles.cardIcon, { backgroundColor: accent.accentSoft }]}>
                <Ionicons name="location-outline" size={17} color={accent.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="h4" color={design.colors.textPrimary}>
                  Where would you prefer?
                </AppText>
                <AppText variant="caption" color={design.colors.textSecondary}>
                  Choose only the levels that matter
                </AppText>
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              <LocationPicker buildings={buildings} value={sel} onChange={setSel} withBed />
            </View>

            <View style={[styles.chosenCard, { backgroundColor: accent.accentSoft }]}>
              <Ionicons name="navigate-outline" size={14} color={accent.accent} />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color={accent.accent} style={{ fontWeight: "800" }}>
                  SELECTED
                </AppText>
                <AppText
                  variant="bodySmall"
                  color={design.colors.textPrimary}
                  style={{ fontWeight: "700" }}
                  numberOfLines={2}
                >
                  {target}
                </AppText>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={[styles.cardIcon, { backgroundColor: accent.accentSoft }]}>
                <Ionicons name="chatbox-ellipses-outline" size={16} color={accent.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="h4" color={design.colors.textPrimary}>
                  Anything else?
                </AppText>
                <AppText variant="caption" color={design.colors.textSecondary}>
                  Optional · e.g. ground floor, quieter room
                </AppText>
              </View>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Tell your manager what matters most…"
              placeholderTextColor={design.colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={1000}
            />
          </View>

          {sel.bed ? (
            <View style={styles.warnCard}>
              <Ionicons name="information-circle-outline" size={15} color="#B45309" />
              <AppText variant="caption" color="#92400E" style={{ flex: 1 }}>
                You picked a specific bed. Your manager will confirm whether it is still free before
                approving the move.
              </AppText>
            </View>
          ) : null}

          {error && <Text style={styles.error}>{error}</Text>}

          <AppButton
            variant="primary"
            fullWidth
            size="lg"
            icon="send"
            iconPosition="right"
            disabled={!orgId || busy}
            loading={busy}
            onPress={() => setConfirmSend(true)}
            style={{ backgroundColor: accent.accent }}
          >
            Send Request to Manager
          </AppButton>

          <View style={styles.footNote}>
            <Ionicons name="lock-closed-outline" size={12} color={design.colors.textMuted} />
            <AppText variant="caption" color={design.colors.textMuted} style={{ flex: 1 }}>
              Your current room stays active until the manager approves and completes the move.
            </AppText>
          </View>
        </ScrollView>
      )}

      <ConfirmDialog
        visible={confirmSend}
        title="Send this request?"
        message={`Your manager will be notified: move to ${target}.`}
        confirmLabel="Send"
        busy={busy}
        onCancel={() => setConfirmSend(false)}
        onConfirm={send}
      />
    </View>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  last,
}: {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.summaryRow, last && { borderBottomWidth: 0 }]}>
      <Ionicons name={icon as any} size={14} color={design.colors.textMuted} />
      <AppText variant="caption" color={design.colors.textSecondary} style={{ width: 92 }}>
        {label}
      </AppText>
      <AppText
        variant="bodySmall"
        color={design.colors.textPrimary}
        style={{ flex: 1, fontWeight: "700", textAlign: "right" }}
        numberOfLines={2}
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  hero: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
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
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.72)",
    marginBottom: 2,
  },

  content: { padding: 16, paddingTop: 14, paddingBottom: 50, gap: 10 },

  introCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: design.colors.border,
    ...getShadow("sm"),
  },
  introIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 14,
    ...getShadow("sm"),
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  chosenCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 11,
    marginTop: 12,
  },

  input: {
    backgroundColor: design.colors.background,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: design.colors.border,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 14,
    lineHeight: 20,
    color: design.colors.textPrimary,
    minHeight: 92,
    textAlignVertical: "top",
    marginTop: 11,
  },

  warnCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  error: { color: design.colors.danger, fontSize: 12, textAlign: "center" },
  footNote: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 },

  doneContent: { padding: 16, paddingTop: 24, paddingBottom: 60 },
  doneCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 20,
    alignItems: "center",
    gap: 10,
    ...getShadow("sm"),
  },
  doneIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  summaryCard: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: design.colors.background,
    paddingHorizontal: 12,
    marginVertical: 4,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: design.colors.border,
  },
});
