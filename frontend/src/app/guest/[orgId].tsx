import { LocationPicker, selectionLabel, emptySel, type LocationSel } from "@/components/LocationPicker";
import { ConfirmDialog, Sheet } from "@/components/ui";
import { api, rupeesFromPaise } from "@/lib/api";
import { fetchPublicPg, type PublicPgDetail } from "@/lib/public";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useState } from "react";

export default function GuestPg() {
  const router = useRouter();
  const { orgId } = useLocalSearchParams<{ orgId: string }>();
  const [pg, setPg] = useState<PublicPgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sel, setSel] = useState<LocationSel>(emptySel);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    fetchPublicPg(orgId)
      .then(setPg)
      .catch((e: any) => setError(e?.message ?? "Failed to load this PG"));
  }, [orgId]);

  if (!orgId) return <Redirect href="/guest" />;

  interface GuestBookingIn {
    org_id: string;
    guest_name: string;
    guest_phone: string;
    building_id?: string | null;
    floor_id?: string | null;
    room_id?: string | null;
    bed_id?: string | null;
    note?: string | null;
  }

  async function submit() {
    if (!pg) return;
    if (!guestName.trim() || !/^\d{10,15}$/.test(guestPhone.trim())) {
      setFormError("Please enter your name and a valid phone number.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const body: GuestBookingIn = {
        org_id: orgId as string,
        guest_name: guestName.trim(),
        guest_phone: guestPhone.trim(),
        building_id: sel.building,
        floor_id: sel.floor,
        room_id: sel.room,
        bed_id: sel.bed,
        note: note.trim() || null,
      };
      await api.post("/public/booking-requests", body);
      setSheetOpen(false);
      setDone(true);
    } catch (e: any) {
      setFormError(e?.message ?? "Failed to send request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.accentText} />
        </Pressable>
        <Text style={styles.h1}>{pg?.name ?? "…"}</Text>
        {pg?.contact_phone && (
          <Pressable style={styles.callBtn} onPress={() => Linking.openURL(`tel:${pg.contact_phone}`)}>
            <Ionicons name="call" size={15} color="#fff" />
          </Pressable>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {pg && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
          <Pressable style={styles.cta} onPress={() => { setSheetOpen(true); setDone(false); }}>
            <Ionicons name="bed" size={18} color="#fff" />
            <Text style={styles.ctaText}>Request a bed</Text>
          </Pressable>

          {pg.buildings.length === 0 && (
            <Text style={styles.meta}>This PG hasn't published buildings yet.</Text>
          )}

          {pg.buildings.map((b) => (
            <View key={b.id} style={styles.card}>
              <Text style={styles.buildingName}>{b.name}</Text>
              <Text style={styles.meta}>
                {b.beds_count > 0 ? `${b.vacant_count} of ${b.beds_count} beds vacant` : "No beds yet"}
                {b.rent_min_paise != null &&
                  ` · from ${rupeesFromPaise(b.rent_min_paise)}`}
                {b.city ? ` · ${b.locality ? `${b.locality}, ` : ""}${b.city}` : ""}
              </Text>
              {b.floors.map((f) => (
                <View key={f.id} style={styles.floorBlock}>
                  <View style={styles.floorRow}>
                    <Ionicons name="layers-outline" size={15} color={theme.accentText} />
                    <Text style={styles.floorName}>{f.name}</Text>
                    <Text style={styles.meta}>{f.vacant_count}/{f.total_beds} vacant</Text>
                  </View>
                  {f.rooms.map((r) => (
                    <Text key={r.id} style={[styles.meta, { marginLeft: 24 }]}>
                      Room {r.number} · {r.vacant_count > 0 ? r.vacant_beds.map((vb) => vb.label).join(" ") : "no vacant beds"}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={styles.sheetTitle}>Request a bed</Text>
        <Text style={styles.sheetSub}>
          You'll get a call from the manager. Not an automated booking.
        </Text>
        <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={theme.textLight} value={guestName} onChangeText={setGuestName} />
        <TextInput style={styles.input} placeholder="Phone number (10 digits)" placeholderTextColor={theme.textLight} value={guestPhone} onChangeText={setGuestPhone} keyboardType="phone-pad" />
        <Text style={styles.prefLabel}>Preference (optional)</Text>
        <LocationPicker buildings={pg?.buildings ?? []} value={sel} onChange={setSel} withBed />
        <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: "top" }]} placeholder={`Anything else? e.g. "${selectionLabel(sel, pg?.buildings ?? [])} works for me"`} placeholderTextColor={theme.textLight} value={note} onChangeText={setNote} multiline />
        {formError && <Text style={styles.error}>{formError}</Text>}
        <Pressable style={styles.cta} onPress={submit} disabled={busy}>
          <Text style={styles.ctaText}>{busy ? "Sending…" : "Send request"}</Text>
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={() => setSheetOpen(false)}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </Sheet>

      <ConfirmDialog
        visible={done}
        title="Request sent!"
        message="The manager has been notified and will call you back. Check with them for confirmation."
        confirmLabel="OK"
        onCancel={() => {
          setDone(false);
          setSel(emptySel);
          setGuestName("");
          setGuestPhone("");
          setNote("");
        }}
        onConfirm={() => {
          setDone(false);
          setSel(emptySel);
          setGuestName("");
          setGuestPhone("");
          setNote("");
        }}
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
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  cta: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border, gap: 6 },
  buildingName: { fontSize: 15, fontWeight: "800", color: theme.text },
  floorBlock: { marginLeft: 8, marginTop: 4, gap: 2 },
  floorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  floorName: { fontSize: 13, fontWeight: "800", color: theme.text },
  meta: { fontSize: 12, color: theme.textLight },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: theme.text, textTransform: "none", letterSpacing: 0 },
  sheetSub: { fontSize: 12, color: theme.textLight, marginBottom: 4 },
  input: {
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: theme.text,
  },
  prefLabel: { fontSize: 11, fontWeight: "800", color: theme.textLight, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4 },
  error: { color: theme.danger, fontSize: 12 },
  cancelBtn: { alignItems: "center", padding: 12, marginTop: 4, borderRadius: 14, backgroundColor: theme.chipBg },
  cancelText: { fontSize: 14, fontWeight: "800", color: theme.textLight },
});
