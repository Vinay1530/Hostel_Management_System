import { ConfirmDialog, Option, Select, Sheet } from "@/components/ui";
import { api, rupeesFromPaise } from "@/lib/api";
import { usePg } from "@/lib/pg";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
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

type Tenant = {
  id: string;
  full_name: string;
  phone: string;
  id_number: string | null;
  created_at: string;
  stays: {
    id: string;
    bed_id: string;
    start_date: string | null;
    end_date: string | null;
    agreed_rent_paise: number;
    active: boolean;
  }[];
};

type BedSpot = { property: string; room: string; bed: string; status: string; tenantName: string | null };

type Grid = {
  properties: {
    id: string;
    name: string;
    floors: { rooms: { number: string; beds: { id: string; label: string; status: string; tenant_name: string | null }[] }[] }[];
  }[];
};

export default function Tenants() {
  const { propertyId, property, properties } = usePg();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [bedSpots, setBedSpots] = useState<Record<string, BedSpot>>({});
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Tenant | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const q = propertyId ? `?property_id=${propertyId}` : "";
      const [t, g] = await Promise.all([
        api.get<Tenant[]>(`/tenants${q}`),
        api.get<Grid>("/occupancy-grid"),
      ]);
      setTenants(t);
      const map: Record<string, BedSpot> = {};
      for (const p of g.properties)
        for (const f of p.floors)
          for (const r of f.rooms)
            for (const b of r.beds)
              map[b.id] = { property: p.name, room: r.number, bed: b.label, status: b.status, tenantName: b.tenant_name };
      setBedSpots(map);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load tenants");
    }
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function removeTenant() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.delete(`/tenants/${toDelete.id}`);
      setToDelete(null);
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
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={theme.accent} />}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Tenants</Text>
          <Text style={styles.sub}>{property ? property.name : "All PGs"}</Text>
        </View>
        <TouchableOpacity style={styles.iconPill} onPress={() => setImportOpen(true)}>
          <Ionicons name="cloud-upload-outline" size={16} color={theme.accentText} />
          <Text style={styles.iconPillText}>CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setAddOpen(true)}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {tenants && tenants.length === 0 && (
        <View style={styles.emptyCard}>
          <Ionicons name="people-outline" size={26} color={theme.textLight} />
          <Text style={styles.emptyTitle}>No tenants yet</Text>
          <Text style={styles.emptySub}>Add a tenant and pick their PG → floor → room → bed.</Text>
        </View>
      )}

      {tenants?.map((t) => {
        const active = t.stays?.find((s) => s.active);
        const spot = active ? bedSpots[active.bed_id] : undefined;
        return (
          <View key={t.id} style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{t.full_name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tenantName}>{t.full_name}</Text>
              <Text style={styles.tenantMeta}>{t.phone}</Text>
              {active ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                  <Ionicons name="location-outline" size={12} color={theme.accentText} />
                  <Text style={styles.assignment} numberOfLines={1}>
                    {spot ? `${spot.property} · Room ${spot.room} · Bed ${spot.bed}` : "Assigned"} · {rupeesFromPaise(active.agreed_rent_paise)}/mo
                  </Text>
                </View>
              ) : (
                <Text style={styles.warnText}>No bed assigned</Text>
              )}
            </View>
            <TouchableOpacity style={styles.trashBtn} onPress={() => setToDelete(t)}>
              <Ionicons name="trash-outline" size={16} color={theme.danger} />
            </TouchableOpacity>
          </View>
        );
      })}

      <AddTenantModal
        visible={addOpen}
        properties={properties.map((p) => ({ value: p.id, label: p.name, sublabel: p.address ?? undefined }))}
        defaultPropertyId={propertyId ?? properties[0]?.id ?? null}
        onClose={() => setAddOpen(false)}
        onDone={async () => {
          setAddOpen(false);
          await load();
        }}
      />
      <ImportModal visible={importOpen} onClose={() => setImportOpen(false)} onDone={load} />
      <ConfirmDialog
        visible={!!toDelete}
        title="Delete tenant"
        message={`${toDelete?.full_name ?? ""} will be removed with their stay history. This cannot be undone.`}
        confirmLabel="Delete tenant"
        busy={busy}
        onCancel={() => setToDelete(null)}
        onConfirm={removeTenant}
      />
    </ScrollView>
  );
}

function AddTenantModal({
  visible,
  properties,
  defaultPropertyId,
  onClose,
  onDone,
}: {
  visible: boolean;
  properties: Option[];
  defaultPropertyId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [pgId, setPgId] = useState<string | null>(defaultPropertyId);
  const [floors, setFloors] = useState<Option[]>([]);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Option[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [beds, setBeds] = useState<Option[]>([]);
  const [bedId, setBedId] = useState<string | null>(null);
  const [bedInfo, setBedInfo] = useState<{ rent_paise: number; deposit_paise: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setFullName("");
      setPhone("");
      setPgId(defaultPropertyId);
      setFloorId(null);
      setRoomId(null);
      setBedId(null);
      setBedInfo(null);
      setError(null);
    }
  }, [visible, defaultPropertyId]);

  useEffect(() => {
    setFloors([]);
    setFloorId(null);
    setRooms([]);
    setRoomId(null);
    setBeds([]);
    setBedId(null);
    setBedInfo(null);
    if (!pgId) return;
    api
      .get<{ id: string; name: string }[]>(`/properties/${pgId}/floors`)
      .then((f) => setFloors(f.map((x) => ({ value: x.id, label: x.name }))))
      .catch(() => undefined);
  }, [pgId]);

  useEffect(() => {
    setRooms([]);
    setRoomId(null);
    setBeds([]);
    setBedId(null);
    setBedInfo(null);
    if (!floorId) return;
    api
      .get<{ id: string; number: string; sharing_type: number }[]>(`/floors/${floorId}/rooms`)
      .then((rs) => setRooms(rs.map((r) => ({ value: r.id, label: `Room ${r.number}`, sublabel: `${r.sharing_type} sharing` }))))
      .catch(() => undefined);
  }, [floorId]);

  useEffect(() => {
    setBeds([]);
    setBedId(null);
    setBedInfo(null);
    if (!roomId) return;
    api
      .get<{ id: string; label: string; rent_paise: number; deposit_paise: number; status: string }[]>(`/rooms/${roomId}/beds`)
      .then((bs) => {
        const vacant = bs.filter((b) => b.status === "vacant");
        setBeds(
          vacant.map((b) => ({
            value: b.id,
            label: `Bed ${b.label}`,
            sublabel: `${rupeesFromPaise(b.rent_paise)}/mo`,
          }))
        );
      })
      .catch(() => undefined);
  }, [roomId]);

  useEffect(() => {
    if (!bedId || !roomId) return setBedInfo(null);
    api
      .get<{ id: string; label: string; rent_paise: number; deposit_paise: number }[]>(`/rooms/${roomId}/beds`)
      .then((bs) => {
        const b = bs.find((x) => x.id === bedId);
        setBedInfo(b ? { rent_paise: b.rent_paise, deposit_paise: b.deposit_paise } : null);
      })
      .catch(() => undefined);
  }, [bedId, roomId]);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const tenant = await api.post<{ id: string }>("/tenants", {
        full_name: fullName.trim(),
        phone,
      });
      if (bedId) {
        await api.post("/stays", {
          tenant_id: tenant.id,
          bed_id: bedId,
          start_date: new Date().toISOString().slice(0, 10),
          agreed_rent_paise: bedInfo?.rent_paise ?? 0,
          deposit_paise: bedInfo?.deposit_paise ?? 0,
        });
      }
      onDone();
    } catch (e: any) {
      setError(e?.message ?? "Could not add tenant");
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 8 }}>
        <Text style={styles.modalTitle}>Add tenant</Text>
        <Text style={styles.fieldLabel}>Full name</Text>
        <TextInput style={styles.input} placeholder="e.g. Ravi Kumar" value={fullName} onChangeText={setFullName} />
        <Text style={styles.fieldLabel}>Phone (10 digits)</Text>
        <TextInput
          style={styles.input}
          placeholder="Mobile number"
          keyboardType="phone-pad"
          maxLength={10}
          value={phone}
          onChangeText={(v) => setPhone(v.replace(/\D/g, ""))}
        />

        <Text style={styles.sectionLabel}>Assign to a bed (optional)</Text>
        <Text style={styles.fieldLabel}>PG</Text>
        <Select value={pgId} options={properties} onChange={setPgId} placeholder="Select PG" title="Choose PG" />
        <Text style={styles.fieldLabel}>Floor</Text>
        <Select value={floorId} options={floors} onChange={setFloorId} placeholder="Select floor" title="Choose floor" />
        <Text style={styles.fieldLabel}>Room</Text>
        <Select value={roomId} options={rooms} onChange={setRoomId} placeholder="Select room" title="Choose room" />
        <Text style={styles.fieldLabel}>Bed (vacant only)</Text>
        <Select value={bedId} options={beds} onChange={setBedId} placeholder={beds.length ? "Select bed" : "Pick a room first"} title="Choose bed" />
        {bedInfo && (
          <Text style={styles.bedHint}>
            Rent {rupeesFromPaise(bedInfo.rent_paise)}/mo · Deposit {rupeesFromPaise(bedInfo.deposit_paise)}
          </Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
          <TouchableOpacity style={[styles.primaryBtn, { flex: 1, justifyContent: "center", paddingVertical: 14 }]} onPress={save} disabled={busy || !fullName.trim() || phone.length < 10}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save tenant</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Sheet>
  );
}

function ImportModal({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const [preview, setPreview] = useState<null | { valid_rows: any[]; errors: { row: number; error: string }[] }>(null);
  const [result, setResult] = useState<null | { tenants_created: number; stays_created: number; errors: any[] }>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);

  async function pick() {
    const DP = await import("expo-document-picker");
    const res = await DP.getDocumentAsync({ copyToCacheDirectory: true });
    if (!res.canceled && res.assets[0]) {
      setFile({ uri: res.assets[0].uri, name: res.assets[0].name ?? "tenants.csv" });
      setPreview(null);
      setResult(null);
    }
  }

  async function runDry(mode: "preview" | "execute") {
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.upload(mode === "preview" ? "/tenants/import/preview" : "/tenants/import", file);
      if (mode === "preview") setPreview(res as never);
      else {
        setResult(res as never);
        onDone();
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.modalTitle}>Import tenants</Text>
      <Text style={styles.modalHelp}>
        Columns: full_name, phone, property_name, floor_name, room_number, bed_label, start_date, agreed_rent_paise, deposit_paise
      </Text>
      <TouchableOpacity style={styles.cancelBtn} onPress={pick}>
        <Text style={styles.cancelBtnText}>{file ? `Selected: ${file.name}` : "Pick CSV file"}</Text>
      </TouchableOpacity>
      {!preview && !result && (
        <TouchableOpacity style={[styles.primaryBtn, { justifyContent: "center", opacity: !file || busy ? 0.5 : 1 }]} disabled={!file || busy} onPress={() => runDry("preview")}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Validate (dry run)</Text>}
        </TouchableOpacity>
      )}
      {preview && !result && (
        <ScrollView style={{ maxHeight: 180 }}>
          <Text style={{ fontWeight: "700", color: theme.text }}>Valid rows: {preview.valid_rows.length}</Text>
          {preview.errors.map((e, i) => (
            <Text key={i} style={{ color: theme.danger, fontSize: 12 }}>
              Row {e.row}: {e.error}
            </Text>
          ))}
        </ScrollView>
      )}
      {result && (
        <ScrollView style={{ maxHeight: 180 }}>
          <Text style={{ color: theme.success, fontWeight: "700" }}>
            Imported tenants: {result.tenants_created}, stays: {result.stays_created}
          </Text>
          {result.errors.map((e: any, i: number) => (
            <Text key={i} style={{ color: theme.danger, fontSize: 12 }}>
              {e.row ? `Row ${e.row}: ` : ""}
              {e.error}
            </Text>
          ))}
        </ScrollView>
      )}
      {preview && !result && (
        <TouchableOpacity style={[styles.primaryBtn, { justifyContent: "center" }]} onPress={() => runDry("execute")}>
          <Text style={styles.primaryBtnText}>Import valid rows</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.cancelBtn, { marginTop: 4 }]}
        onPress={() => {
          setFile(null);
          setPreview(null);
          setResult(null);
          onClose();
        }}
      >
        <Text style={styles.cancelBtnText}>Close</Text>
      </TouchableOpacity>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  h1: { fontSize: 26, fontWeight: "800", color: theme.text, letterSpacing: -0.3 },
  sub: { fontSize: 12, color: theme.textLight, marginTop: 2 },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  iconPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12 },
  iconPillText: { fontSize: 12, fontWeight: "700", color: theme.accentText },
  card: { backgroundColor: "#fff", borderRadius: 18, padding: 12, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: theme.border },
  avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "800", color: theme.accentText },
  tenantName: { fontSize: 15, fontWeight: "800", color: theme.text },
  tenantMeta: { fontSize: 12, color: theme.textLight, marginTop: 1 },
  assignment: { fontSize: 11, color: theme.accentText, flex: 1 },
  warnText: { fontSize: 11, color: theme.warn, fontWeight: "700", marginTop: 3 },
  trashBtn: { padding: 8, borderRadius: 10, backgroundColor: "#fef2f2" },
  emptyCard: { backgroundColor: "#fff", borderRadius: 20, padding: 24, alignItems: "center", gap: 4, borderWidth: 1, borderColor: theme.border, marginTop: 6 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: theme.text, marginTop: 6 },
  emptySub: { fontSize: 12, color: theme.textLight, textAlign: "center" },
  error: { color: theme.danger, marginBottom: 8, fontSize: 12 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text },
  modalHelp: { fontSize: 11, color: theme.textLight, marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: theme.textLight, marginTop: 4 },
  sectionLabel: { fontSize: 13, fontWeight: "800", color: theme.text, marginTop: 10 },
  input: { borderWidth: 1, borderColor: theme.border, backgroundColor: theme.cardSoft, borderRadius: 14, padding: 12, fontSize: 15, color: theme.text },
  bedHint: { fontSize: 11, color: theme.accentText, fontWeight: "700" },
  cancelBtn: { backgroundColor: theme.chipBg, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  cancelBtnText: { color: theme.text, fontWeight: "700", fontSize: 13 },
});
