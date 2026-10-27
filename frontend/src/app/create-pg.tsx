import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePg } from "@/lib/pg";
import { FACILITY_OPTIONS, parseFacilities, theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

function floorLabel(i: number): string {
  return ["Ground", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"][i] ?? `F${i}`;
}

export default function CreatePG() {
  const router = useRouter();
  const { ready, token, role } = useAuth();
  const { refreshProperties } = usePg();
  const [step, setStep] = useState(1);

  // step 1 — building details
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [facilities, setFacilities] = useState<Set<string>>(new Set(["wifi", "mess"]));

  // step 2 — layout numbers
  const [floorsN, setFloorsN] = useState("2");
  const [roomsN, setRoomsN] = useState("5");
  const [bedsN, setBedsN] = useState("3");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      if (role && role === "tenant") router.replace("/tenant");
    }
  }, [role, router, ready, token]);

  const toggleFacility = (key: string) => {
    setFacilities((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  async function submit() {
    if (busy || submitted.current) return; // one tap: no double-submit even if NDP network is slow
    setBusy(true);
    submitted.current = true;
    try {
      const nf = clamp(floorsN, 1, 10);
      const nr = clamp(roomsN, 1, 50);
      const nb = clamp(bedsN, 1, 8);
      const layout = await api.post<{ property_id: string; totals: Record<string, number> }>(
        "/properties/layout",
        {
          name: name.trim(),
          address: address.trim() || null,
          facilities: [...facilities].join(","),
          no_of_floors: nf,
          rooms_per_floor: nr,
          beds_per_room: nb,
          rent_paise: Math.round(parseFloat(rent || "0") * 100),
          deposit_paise: Math.round(parseFloat(deposit || "0") * 100),
        }
      );
      // navigate straight away — Alert button callbacks never fire on web
      await refreshProperties();
      router.replace(`/property/${layout.property_id}`);
    } catch (e: any) {
      submitted.current = false; // allow retry after a failure
      Alert.alert("Error", e?.message ?? "Could not create PG");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.h1}>Create your PG</Text>
      </View>

      {/* step dots */}
      <View style={styles.dotsRow}>
        <View style={[styles.dot, step >= 1 && styles.dotOn]} />
        <View style={[styles.dot, step >= 2 && styles.dotOn]} />
        <Text style={styles.stepLabel}>{step === 1 ? "Building & facilities" : "Layout & beds"}</Text>
      </View>

      {step === 1 && (
        <>
          <View style={styles.card}>
            <Text style={styles.label}>PG name</Text>
            <TextInput style={styles.input} placeholder="e.g. Sunshine Residency" value={name} onChangeText={setName} />
            <Text style={styles.label}>Address (optional)</Text>
            <TextInput style={styles.input} placeholder="Area, city" value={address} onChangeText={setAddress} />

            <Text style={styles.label}>Facilities</Text>
            <View style={styles.chipsRow}>
              {FACILITY_OPTIONS.map((f) => (
                <FacilityChip key={f.key} icon={f.icon} label={f.label} selected={facilities.has(f.key)} onPress={() => toggleFacility(f.key)} />
              ))}
            </View>
            <Text style={styles.noteText}>These PG-level facilities are auto-attached to every room. You can change them per-room later.</Text>
          </View>

          <Pressable style={[styles.cta, !name.trim() && styles.ctaDisabled]} disabled={!name.trim()} onPress={() => setStep(2)}>
            <Text style={styles.ctaText}>Continue to layout</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </>
      )}

      {step === 2 && (
        <>
          <View style={styles.card}>
            <View style={styles.numRow}>
              <NumField label="Floors" value={floorsN} onChange={setFloorsN} />
              <NumField label="Rooms / floor" value={roomsN} onChange={setRoomsN} />
              <NumField label="Beds / room" value={bedsN} onChange={setBedsN} />
            </View>

            {/* auto room number preview */}
            <Text style={styles.label}>Auto room numbers</Text>
            <View style={{ gap: 6 }}>
              {Array.from({ length: clamp(floorsN, 1, 4) }).map((_, i) => (
                <View key={i} style={styles.previewRow}>
                  <Text style={styles.previewFloor}>{floorLabel(i)} floor</Text>
                  <Text style={styles.previewRooms}>
                    {(i * 100 + 1).toString().padStart(3, "0")} – {(i * 100 + clamp(roomsN, 1, 50)).toString().padStart(3, "0")}
                  </Text>
                </View>
              ))}
              {clamp(floorsN, 1, 10) > 4 && <Text style={styles.previewMore}>+{clamp(floorsN, 1, 10) - 4} more floor(s)…</Text>}
            </View>

            <View style={styles.numRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Rent / bed (₹)</Text>
                <TextInput style={styles.input} placeholder="e.g. 7000" keyboardType="decimal-pad" value={rent} onChangeText={(v) => setRent(v.replace(/[^\d.]/g, ""))} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Deposit / bed (₹)</Text>
                <TextInput style={styles.input} placeholder="e.g. 15000" keyboardType="decimal-pad" value={deposit} onChangeText={(v) => setDeposit(v.replace(/[^\d.]/g, ""))} />
              </View>
            </View>
            <Text style={styles.note}>
              This creates the whole layout instantly. You can edit each room later — add/remove beds, set its facilities, change rents.
            </Text>
          </View>

          <Pressable style={[styles.cta]} disabled={busy} onPress={submit}>
            {busy ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text style={styles.ctaText}>Create PG layout</Text>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.backLink} onPress={() => setStep(1)}>
            <Text style={styles.backLinkText}>Back to building details</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function FacilityChip({ icon, label, selected, onPress }: { icon: string; label: string; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Ionicons name={icon as any} size={15} color={selected ? theme.accentText : theme.textLight} />
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} keyboardType="number-pad" maxLength={2} value={value} onChangeText={(v) => onChange(v.replace(/\D/g, ""))} />
    </View>
  );
}

function clamp(v: string, lo: number, hi: number): number {
  const n = parseInt(v || "0", 10);
  return Math.min(hi, Math.max(lo, isNaN(n) ? lo : n));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 60 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  backBtn: { backgroundColor: theme.card, borderRadius: 999, padding: 6, borderWidth: 1, borderColor: theme.border },
  h1: { fontSize: 26, fontWeight: "800", color: theme.text, letterSpacing: -0.3 },
  dotsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.border },
  dotOn: { backgroundColor: theme.accent, width: 22 },
  stepLabel: { fontSize: 12, color: theme.textLight, marginLeft: 6 },
  card: { backgroundColor: theme.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.border, gap: 4 },
  label: { fontSize: 12, fontWeight: "700", color: theme.textLight, marginTop: 8 },
  input: { borderWidth: 1, borderColor: theme.chipBorder, borderRadius: 12, padding: 12, fontSize: 15, backgroundColor: "#fff", color: theme.text },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, borderWidth: 1, borderColor: theme.chipBorder, backgroundColor: theme.chipBg, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: "600", color: theme.textLight },
  chipTextOn: { color: theme.accentText },
  numRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  previewRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: theme.accentSoft, borderRadius: 10, padding: 10 },
  previewFloor: { fontSize: 13, fontWeight: "700", color: theme.accentText },
  previewRooms: { fontSize: 13, color: theme.text, fontVariant: ["tabular-nums"] as any },
  previewMore: { fontSize: 12, color: theme.textLight, paddingLeft: 4 },
  note: { fontSize: 12, color: theme.textLight, marginTop: 10, lineHeight: 18 },
  noteText: { fontSize: 11, color: theme.textLight, marginTop: 8, lineHeight: 16 },
  cta: { backgroundColor: theme.accent, borderRadius: 999, padding: 16, alignItems: "center", justifyContent: "center", marginTop: 14 },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  backLink: { alignItems: "center", marginTop: 12, padding: 8 },
  backLinkText: { color: theme.accentText, fontWeight: "700" },
});
