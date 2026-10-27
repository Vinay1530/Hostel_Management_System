import { ConfirmDialog, Sheet } from "@/components/ui";
import { api } from "@/lib/api";
import { usePg, Pg } from "@/lib/pg";
import { FACILITY_OPTIONS, facilityIcon, facilityLabel, theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Property = Pg & {
  advance_or_arrears: "advance" | "arrears";
  due_day: number;
  pro_rate_first_month: boolean;
  notice_period_days: number;
  facilities: string | null;
};

function facilityChips(text: string | null) {
  return (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function Setup() {
  const router = useRouter();
  const { refreshProperties } = usePg();
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editProp, setEditProp] = useState<Property | null>(null);
  const [deleteProp, setDeleteProp] = useState<Property | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const props = await api.get<Property[]>("/properties");
      setProperties(props);
      await refreshProperties();
    } catch (e: any) {
      setError(e?.message ?? "Failed to load properties");
    }
  }, [refreshProperties]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function toggleBilling(p: Property) {
    const next = p.advance_or_arrears === "advance" ? "arrears" : "advance";
    setBusy(true);
    try {
      await api.patch(`/properties/${p.id}`, { advance_or_arrears: next });
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeProperty() {
    if (!deleteProp) return;
    setBusy(true);
    try {
      await api.delete(`/properties/${deleteProp.id}`);
      setDeleteProp(null);
      await load();
    } catch (e: any) {
      Alert.alert("Can't delete", e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={!!properties && busy} onRefresh={load} tintColor={theme.accent} />}
    >
      <Text style={styles.h1}>Your PGs</Text>
      <Text style={styles.sub}>Manage buildings, rooms, beds and billing</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {properties?.map((p) => (
        <View key={p.id} style={styles.card}>
          <TouchableOpacity style={styles.propHead} onPress={() => router.push(`/property/${p.id}`)}>
            <View style={styles.propIcon}>
              <Ionicons name="business" size={18} color={theme.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.propName}>{p.name}</Text>
              <Text style={styles.meta}>{p.address ?? "Tap to edit rooms & beds"}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setEditProp(p)}>
              <Ionicons name="create-outline" size={14} color={theme.accentText} />
              <Text style={styles.actionBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionDanger]} onPress={() => setDeleteProp(p)}>
              <Ionicons name="trash-outline" size={14} color={theme.danger} />
              <Text style={[styles.actionBtnText, { color: theme.danger }]}>Delete</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={styles.modeBtn} disabled={busy} onPress={() => toggleBilling(p)}>
              <Ionicons name={p.advance_or_arrears === "advance" ? "arrow-up-circle" : "arrow-down-circle"} size={14} color={theme.accentText} />
              <Text style={styles.modeBtnText}>{p.advance_or_arrears === "advance" ? "ADVANCE" : "ARREARS"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <Text style={styles.section}>Facilities</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {facilityChips(p.facilities).length === 0 && <Text style={styles.meta}>None set yet</Text>}
            {facilityChips(p.facilities).map((f) => (
              <View key={f} style={styles.fChip}>
                <Ionicons name={facilityIcon(f) as any} size={13} color={theme.accentText} />
                <Text style={styles.fChipText}>{facilityLabel(f)}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.meta, { marginTop: 10 }]}>
            Due day {p.due_day} · pro-rate {p.pro_rate_first_month ? "on" : "off"} · notice {p.notice_period_days}d
          </Text>
        </View>
      ))}

      <TouchableOpacity style={styles.cta} onPress={() => router.push("/create-pg")}>
        <Ionicons name="add-circle" size={20} color="#fff" />
        <Text style={styles.ctaText}>Create a new PG</Text>
      </TouchableOpacity>

      {properties?.length === 0 && (
        <Text style={[styles.meta, { textAlign: "center", marginTop: 10 }]}>
          No PGs yet — create your first one. Floors, rooms & beds are generated automatically.
        </Text>
      )}

      <PropertyEditorModal
        property={editProp}
        onClose={() => setEditProp(null)}
        onSaved={async () => {
          setEditProp(null);
          await load();
        }}
      />

      <ConfirmDialog
        visible={!!deleteProp}
        title="Delete PG"
        message={`"${deleteProp?.name ?? ""}" and all its floors, rooms & beds will be deleted. PGs with active tenants can't be deleted — vacate their beds first.`}
        confirmLabel="Delete PG"
        busy={busy}
        onCancel={() => setDeleteProp(null)}
        onConfirm={removeProperty}
      />
    </ScrollView>
  );
}

function PropertyEditorModal({
  property,
  onClose,
  onSaved,
}: {
  property: Property | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (property) {
      setName(property.name);
      setAddress(property.address ?? "");
      setSelected(new Set(facilityChips(property.facilities)));
    }
  }, [property]);

  if (!property) return null;

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/properties/${property!.id}`, {
        name: name.trim(),
        address: address.trim() || null,
        facilities: [...selected].join(","),
      });
      onSaved();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible onClose={onClose}>
      <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 10 }}>
        <Text style={styles.modalTitle}>Edit PG</Text>
        <Text style={styles.fieldLabel}>PG name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />
        <Text style={styles.fieldLabel}>Address</Text>
        <TextInput style={styles.input} placeholder="Area, city" value={address} onChangeText={setAddress} />
        <Text style={styles.fieldLabel}>Facilities — auto-attached to every room unless a room was customized</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {FACILITY_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, selected.has(f.key) && styles.chipOn]}
              onPress={() =>
                setSelected((prev) => {
                  const n = new Set(prev);
                  if (n.has(f.key)) n.delete(f.key);
                  else n.add(f.key);
                  return n;
                })
              }
            >
              <Ionicons name={f.icon as any} size={15} color={selected.has(f.key) ? "#fff" : theme.textLight} />
              <Text style={[styles.chipText, selected.has(f.key) && styles.chipTextOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
          <TouchableOpacity style={[styles.cta, { flex: 1, marginTop: 0 }]} onPress={save} disabled={busy || !name.trim()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Save PG</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 50 },
  h1: { fontSize: 26, fontWeight: "800", color: theme.text, letterSpacing: -0.3 },
  sub: { fontSize: 12, color: theme.textLight, marginTop: 2, marginBottom: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  propHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  propIcon: { backgroundColor: theme.accentSoft, borderRadius: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  propName: { fontSize: 16, fontWeight: "800", color: theme.text },
  section: { fontSize: 11, fontWeight: "800", color: theme.textLight, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  meta: { fontSize: 12, color: theme.textLight, marginTop: 2 },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 12 },
  fChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  fChipText: { fontSize: 11, fontWeight: "700", color: theme.accentText },
  modeBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.infoSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  modeBtnText: { fontSize: 11, fontWeight: "800", color: theme.accentText },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.chipBg, paddingVertical: 6, paddingHorizontal: 12 },
  actionDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: theme.accentText },
  cta: { backgroundColor: theme.accent, borderRadius: 999, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", padding: 15, marginTop: 6 },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  cancelBtn: { backgroundColor: theme.chipBg, borderRadius: 999, paddingVertical: 15, paddingHorizontal: 18, alignItems: "center" },
  cancelBtnText: { color: theme.text, fontWeight: "700", fontSize: 14 },
  error: { color: theme.danger, marginBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: theme.textLight },
  input: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.cardSoft, borderRadius: 14, padding: 12, fontSize: 15, color: theme.text },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, borderWidth: 1, borderColor: theme.chipBorder, backgroundColor: theme.chipBg, paddingVertical: 7, paddingHorizontal: 13 },
  chipOn: { backgroundColor: theme.accent, borderColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: "700", color: theme.textLight },
  chipTextOn: { color: "#fff" },
});
