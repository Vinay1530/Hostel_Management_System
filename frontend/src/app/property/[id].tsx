import { ActionSheet, ConfirmDialog } from "@/components/ui";
import { api, rupeesFromPaise } from "@/lib/api";
import { FACILITY_OPTIONS, facilityLabel, theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const FLOOR_NAMES = ["Ground", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

type Bed = {
  id: string;
  label: string;
  rent_paise: number;
  deposit_paise: number;
  status: "vacant" | "occupied" | "maintenance";
  tenant_name: string | null;
};

type Floor = { id: string; name: string; rooms: { id: string; number: string; facilities: string | null; sharing_type: number; beds: Bed[] }[] };

export default function PropertyEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [grid, setGrid] = useState<{ name: string; floors: Floor[] } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editRoom, setEditRoom] = useState<{ id: string; number: string; facilities: string | null; beds: Bed[] } | null>(null);
  const [floorDialog, setFloorDialog] = useState<{ mode: "add" | "rename"; floorId?: string; initial: string } | null>(null);
  const [addRoomFor, setAddRoomFor] = useState<Floor | null>(null);
  const [floorSheet, setFloorSheet] = useState<Floor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { title: string; message: string; label: string; action: () => Promise<void> }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const g = await api.get<{
        properties: { id: string; name: string; floors: Floor[] }[];
        totals: Record<string, number>;
      }>("/occupancy-grid");
      const p = g.properties.find((x) => x.id === id);
      if (!p) {
        setError("Property not found");
        setGrid(null);
        return;
      }
      setGrid({ name: p.name, floors: p.floors });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      load();
    }
  }, [load]);

  async function openRoom(room: { id: string; number: string; facilities: string | null }) {
    try {
      const beds = await api.get<Bed[]>(`/rooms/${room.id}/beds`);
      setEditRoom({ id: room.id, number: room.number, facilities: room.facilities, beds });
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to load beds");
    }
  }

  function deleteRoom(roomId: string, number: string) {
    setConfirmDelete({
      title: `Delete room ${number}?`,
      message: "The room and its beds will be deleted. Occupied beds block deletion — vacate them first.",
      label: "Delete room",
      action: async () => {
        await api.delete(`/rooms/${roomId}`);
        await load();
      },
    });
  }

  async function runConfirm() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await confirmDelete.action();
      setConfirmDelete(null);
    } catch (e: any) {
      Alert.alert("Can't delete", e?.message ?? "Failed");
    } finally {
      setDeleting(false);
    }
  }

  if (busy && !grid) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{grid?.name ?? "Building"}</Text>
          <Text style={styles.sub}>Tap a room to edit beds, facilities & rent</Text>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {grid?.floors.map((floor) => (
        <View key={floor.id} style={styles.floorCard}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={styles.floorName}>{floor.name} floor</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <TouchableOpacity style={styles.miniBtn} onPress={() => setAddRoomFor(floor)}>
                <Ionicons name="add" size={14} color={theme.accentText} />
                <Text style={styles.miniBtnText}>Room</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.miniBtn, { backgroundColor: theme.warnSoft }]} onPress={() => setFloorSheet(floor)}>
                <Ionicons name="ellipsis-vertical" size={14} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            {floor.rooms.map((room) => {
              const occupied = room.beds.filter((b) => b.status === "occupied").length;
              return (
                <View key={room.id} style={styles.roomRow}>
                  <TouchableOpacity style={styles.roomBadge} onPress={() => openRoom(room)}>
                    <Text style={styles.roomNo}>{room.number}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ flex: 1 }} onPress={() => openRoom(room)}>
                    <View style={styles.bedsRow}>
                      {room.beds.map((b) => {
                        return (
                          <View
                            key={b.id}
                            style={[
                              styles.bedPill,
                              b.status === "occupied" && styles.bedPillOn,
                              b.status === "maintenance" && styles.bedPillWarn,
                            ]}
                          >
                            <Text style={[styles.bedPillText, b.status === "occupied" && { color: "#fff" }]}>{b.label}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <Text style={styles.roomFacilities} numberOfLines={1}>
                      {occupied}/{room.beds.length} filled ·{" "}
                      {room.facilities
                        ? room.facilities
                            .split(",")
                            .map((f) => f.trim())
                            .filter(Boolean)
                            .map((f) => facilityLabel(f))
                            .join(", ")
                        : "no facilities yet"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.trashBtn} onPress={() => deleteRoom(room.id, room.number)}>
                    <Ionicons name="trash-outline" size={16} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              );
            })}
            {floor.rooms.length === 0 && <Text style={styles.roomFacilities}>No rooms on this floor yet — add one above</Text>}
          </View>
        </View>
      ))}

      <Pressable
        style={styles.cta}
        onPress={() =>
          setFloorDialog({ mode: "add", initial: FLOOR_NAMES[grid?.floors.length ?? 0] ?? `F${grid?.floors.length ?? 0}` })
        }
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.ctaText}>Add floor</Text>
      </Pressable>

      <RoomEditor
        data={editRoom}
        onChangeBeds={(beds) => setEditRoom((prev) => (prev ? { ...prev, beds } : prev))}
        onChanged={async () => {
          setEditRoom(null);
          await load();
        }}
        onSilentReload={load}
        onClose={() => setEditRoom(null)}
      />

      <FloorDialog
        dialog={floorDialog}
        propertyId={id}
        onClose={() => setFloorDialog(null)}
        onDone={async () => {
          setFloorDialog(null);
          await load();
        }}
      />

      <AddRoomModal
        floorIndex={addRoomFor ? grid?.floors.findIndex((f) => f.id === addRoomFor.id) ?? 0 : 0}
        floor={addRoomFor}
        onClose={() => setAddRoomFor(null)}
        onDone={async () => {
          setAddRoomFor(null);
          await load();
        }}
      />

      <ActionSheet
        visible={!!floorSheet}
        title={`${floorSheet?.name ?? ""} floor`}
        actions={[
          {
            label: "Rename floor",
            icon: "create-outline",
            onPress: () =>
              floorSheet && setFloorDialog({ mode: "rename", floorId: floorSheet.id, initial: floorSheet.name }),
          },
          {
            label: "Delete floor",
            icon: "trash-outline",
            destructive: true,
            onPress: () =>
              floorSheet &&
              setConfirmDelete({
                title: `Delete ${floorSheet.name} floor?`,
                message: "All rooms and beds on this floor will be removed. Floors with active tenants can't be deleted.",
                label: "Delete floor",
                action: async () => {
                  await api.delete(`/floors/${floorSheet.id}`);
                  await load();
                },
              }),
          },
        ]}
        onCancel={() => setFloorSheet(null)}
      />

      <ConfirmDialog
        visible={!!confirmDelete}
        title={confirmDelete?.title ?? ""}
        message={confirmDelete?.message ?? ""}
        confirmLabel={confirmDelete?.label}
        busy={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={runConfirm}
      />
    </ScrollView>
  );
}

function FloorDialog({
  dialog,
  propertyId,
  onClose,
  onDone,
}: {
  dialog: { mode: "add" | "rename"; floorId?: string; initial: string } | null;
  propertyId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(dialog?.initial ?? "");
  }, [dialog]);

  if (!dialog) return null;

  async function save() {
    setBusy(true);
    try {
      const n = name.trim();
      if (dialog!.mode === "rename") {
        await api.patch(`/floors/${dialog!.floorId}`, { name: n });
      } else {
        await api.post(`/properties/${propertyId}/floors`, { name: n });
      }
      onDone();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlayCenter}>
        <View style={styles.dialogCard}>
          <Text style={styles.modalTitle}>{dialog.mode === "rename" ? "Rename floor" : "Add floor"}</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Floor name (e.g. Ground)" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable style={[styles.cta, { flex: 1, opacity: busy || !name.trim() ? 0.4 : 1 }]} disabled={busy || !name.trim()} onPress={save}>
              <Text style={styles.ctaText}>{dialog.mode === "rename" ? "Rename" : "Add floor"}</Text>
            </Pressable>
            <Pressable style={[styles.cta, { flex: 1, backgroundColor: theme.chipBg }]} onPress={onClose}>
              <Text style={[styles.ctaText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AddRoomModal({
  floorIndex,
  floor,
  onClose,
  onDone,
}: {
  floorIndex: number;
  floor: Floor | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const nextNumber = () => {
    const prefix = floorIndex * 100;
    const used = (floor?.rooms ?? []).map((r) => parseInt(r.number, 10)).filter((n) => !isNaN(n) && n >= prefix);
    const next = used.length ? Math.max(...used) + 1 : prefix + 1;
    return String(next).padStart(3, "0");
  };
  const [number, setNumber] = useState(nextNumber());
  const [beds, setBeds] = useState(3);
  const [rent, setRent] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (floor) {
      setNumber(nextNumber());
      setBeds(3);
      setRent("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor]);

  if (!floor) return null;

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const room = await api.post<{ id: string }>(`/floors/${floor!.id}/rooms`, {
        number: number.trim(),
        sharing_type: beds,
      });
      if (beds > 0) {
        await api.patch(`/rooms/${room.id}`, {
          beds_count: beds,
          bed_rent_paise: rent !== "" ? Math.round(parseFloat(rent) * 100) : undefined,
        });
      }
      Alert.alert("Added", `Room ${number} created on ${floor!.name} floor with ${beds} bed(s)`);
      onDone();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to add room");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlayCenter}>
        <View style={styles.dialogCard}>
          <Text style={styles.modalTitle}>Add room · {floor.name} floor</Text>
          <Text style={styles.label}>Room number</Text>
          <TextInput style={styles.input} keyboardType="numbers-and-punctuation" maxLength={4} value={number} onChangeText={(v) => setNumber(v.replace(/[^\d]/g, ""))} />
          <Text style={styles.label}>Beds</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable style={[styles.stepperBtn, beds <= 1 && { opacity: 0.4 }]} disabled={beds <= 1} onPress={() => setBeds((n) => Math.max(1, n - 1))}>
              <Ionicons name="remove" size={18} color={theme.text} />
            </Pressable>
            <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text, minWidth: 24, textAlign: "center" }}>{beds}</Text>
            <Pressable style={styles.stepperBtn} onPress={() => setBeds((n) => Math.min(16, n + 1))}>
              <Ionicons name="add" size={18} color={theme.text} />
            </Pressable>
          </View>
          <Text style={styles.label}>Rent per bed (₹) — optional, can set later</Text>
          <TextInput style={styles.input} keyboardType="decimal-pad" value={rent} onChangeText={(v) => setRent(v.replace(/[^\d.]/g, ""))} placeholder="e.g. 7000" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable style={[styles.cta, { flex: 1, opacity: busy || number.length === 0 ? 0.4 : 1 }]} disabled={busy || number.length === 0} onPress={save}>
              <Text style={styles.ctaText}>Add room</Text>
            </Pressable>
            <Pressable style={[styles.cta, { flex: 1, backgroundColor: theme.chipBg }]} onPress={onClose}>
              <Text style={[styles.ctaText, { color: theme.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RoomEditor({
  data,
  onChangeBeds,
  onChanged,
  onSilentReload,
  onClose,
}: {
  data: { id: string; number: string; facilities: string | null; beds: Bed[] } | null;
  onChangeBeds: (beds: Bed[]) => void;
  onChanged: () => void;
  onSilentReload: () => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rent, setRent] = useState("");
  const [bedsCount, setBedsCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [bedSheet, setBedSheet] = useState<Bed | null>(null);

  useEffect(() => {
    if (data) {
      setSelected(new Set((data.facilities ?? "").split(",").map((f) => f.trim()).filter(Boolean)));
      setRent(data.beds[0]?.rent_paise ? String(data.beds[0].rent_paise / 100) : "");
      setBedsCount(data.beds.length);
    }
  }, [data]);

  if (!data) return null;
  const { beds } = data;
  const occupiedCount = beds.filter((b) => b.status === "occupied").length;
  const vacantCount = beds.length - occupiedCount;

  async function refreshBeds() {
    const fresh = await api.get<Bed[]>(`/rooms/${data!.id}/beds`);
    onChangeBeds(fresh);
    onSilentReload();
  }

  async function patchStatus(status: "vacant" | "maintenance") {
    if (!bedSheet) return;
    try {
      await api.patch(`/beds/${bedSheet.id}`, {
        label: bedSheet.label,
        rent_paise: bedSheet.rent_paise,
        deposit_paise: bedSheet.deposit_paise,
        status,
      });
      await refreshBeds();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed");
    }
  }

  async function removeBed() {
    if (!bedSheet) return;
    try {
      await api.delete(`/beds/${bedSheet.id}`);
      await refreshBeds();
    } catch (e: any) {
      Alert.alert("Can't delete", e?.message ?? "Failed");
    }
  }

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        facilities: [...selected].join(","),
        beds_count: bedsCount,
      };
      if (rent !== "") payload.bed_rent_paise = Math.round(parseFloat(rent) * 100);
      await api.patch(`/rooms/${data!.id}`, payload);
      Alert.alert("Saved", "Room updated");
      onChanged();
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save room");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.modalTitle}>Room {data.number}</Text>
            <Pressable onPress={onClose}>
              <Ionicons name="close" size={22} color={theme.textLight} />
            </Pressable>
          </View>

          <Text style={styles.label}>Beds — tap a vacant bed for maintenance / delete</Text>
          <View style={styles.bedsRow}>
            {beds.map((b) => (
              <TouchableOpacity
                key={b.id}
                style={[styles.bedPill, b.status === "occupied" ? styles.bedPillOn : b.status === "maintenance" ? styles.bedPillWarn : {}]}
                onPress={() => setBedSheet(b)}
              >
                <Text style={[styles.bedPillText, b.status === "occupied" && { color: "#fff" }]}>
                  {b.label}
                  {b.tenant_name ? ` · ${b.tenant_name.split(" ")[0]}` : b.status === "maintenance" ? " · M" : ""}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.label}>Beds per room</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable
                style={[styles.stepperBtn, (bedsCount <= 1 || occupiedCount >= bedsCount) && { opacity: 0.4 }]}
                disabled={bedsCount <= 1 || occupiedCount >= bedsCount}
                onPress={() => setBedsCount((n) => Math.max(1, n - 1))}
              >
                <Ionicons name="remove" size={18} color={theme.text} />
              </Pressable>
              <Text style={{ fontSize: 18, fontWeight: "800", color: theme.text, minWidth: 24, textAlign: "center" }}>{bedsCount}</Text>
              <Pressable style={styles.stepperBtn} onPress={() => setBedsCount((n) => Math.min(16, n + 1))}>
                <Ionicons name="add" size={18} color={theme.text} />
              </Pressable>
            </View>
          </View>
          <Text style={styles.note}>
            {beds.length} beds now ({occupiedCount} occupied). Removal only takes vacant beds ({vacantCount} removable). Labels are auto-assigned A, B, C…
          </Text>

          <Text style={styles.label}>Room facilities</Text>
          <Text style={styles.note}>This room's own list — editing it here stops auto-following the PG's facility list.</Text>
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
                <Ionicons name={f.icon as any} size={15} color={selected.has(f.key) ? theme.accentText : theme.textLight} />
                <Text style={[styles.chipText, selected.has(f.key) && styles.chipTextOn]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Rent per bed (₹) — applies to every bed in the room</Text>
          <TextInput style={styles.input} keyboardType="decimal-pad" value={rent} onChangeText={(v) => setRent(v.replace(/[^\d.]/g, ""))} placeholder="e.g. 7500" />
          <Text style={styles.note}>Current: {beds[0] ? rupeesFromPaise(beds[0].rent_paise) : "-"} / bed</Text>

          <Pressable style={styles.cta} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Save room</Text>}
          </Pressable>
        </View>
      </View>

      <ActionSheet
        visible={!!bedSheet}
        title={`Bed ${bedSheet?.label ?? ""}`}
        message={
          bedSheet?.status === "occupied"
            ? "Occupied by a tenant — end their stay before changing this bed."
            : bedSheet?.status === "maintenance"
            ? "Currently in maintenance."
            : "Vacant bed."
        }
        actions={
          bedSheet && bedSheet.status !== "occupied"
            ? [
                bedSheet.status === "maintenance"
                  ? { label: "Clear maintenance", icon: "checkmark-circle-outline", onPress: () => patchStatus("vacant") }
                  : { label: "Mark maintenance", icon: "construct-outline", onPress: () => patchStatus("maintenance") },
                { label: "Delete bed", icon: "trash-outline", destructive: true, onPress: removeBed },
              ]
            : []
        }
        onCancel={() => setBedSheet(null)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingBottom: 60 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  iconBtn: { backgroundColor: theme.card, borderRadius: 12, padding: 6, borderWidth: 1, borderColor: theme.border },
  h1: { fontSize: 22, fontWeight: "800", color: theme.text },
  sub: { fontSize: 12, color: theme.textLight, marginTop: 2 },
  floorCard: { backgroundColor: theme.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: theme.border, marginBottom: 12 },
  floorName: { fontSize: 12, fontWeight: "800", color: theme.textLight, textTransform: "uppercase", letterSpacing: 0.5 },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, backgroundColor: theme.accentSoft, paddingHorizontal: 10, paddingVertical: 6 },
  miniBtnText: { fontSize: 12, fontWeight: "700", color: theme.accentText },
  roomRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.bg, borderRadius: 12, padding: 12 },
  roomBadge: { backgroundColor: theme.accentSoft, borderRadius: 10, width: 54, height: 42, alignItems: "center", justifyContent: "center" },
  roomNo: { fontWeight: "800", color: theme.accentText },
  roomFacilities: { fontSize: 11, color: theme.textLight, marginTop: 4 },
  trashBtn: { padding: 8, borderRadius: 10, backgroundColor: "#fef2f2" },
  bedsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  bedPill: {
    borderRadius: 8,
    minWidth: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.chipBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  bedPillOn: { backgroundColor: theme.success, borderColor: theme.success },
  bedPillWarn: { backgroundColor: theme.warnSoft, borderColor: theme.warnSoft },
  bedPillText: { fontSize: 11, fontWeight: "700", color: theme.text },
  stepperBtn: { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: 10, width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1, backgroundColor: "#00000044", justifyContent: "flex-end" },
  overlayCenter: { flex: 1, backgroundColor: "#00000055", alignItems: "center", justifyContent: "center", padding: 24 },
  dialogCard: { backgroundColor: "#fff", borderRadius: 20, padding: 20, width: "100%", gap: 12 },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10, maxHeight: "92%" },
  modalTitle: { fontSize: 20, fontWeight: "800", color: theme.text },
  label: { fontSize: 12, fontWeight: "700", color: theme.textLight },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, borderWidth: 1, borderColor: theme.chipBorder, backgroundColor: theme.chipBg, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
  chipText: { fontSize: 12, fontWeight: "600", color: theme.textLight },
  chipTextOn: { color: theme.accentText },
  input: { borderWidth: 1, borderColor: theme.chipBorder, borderRadius: 12, padding: 12, fontSize: 15, backgroundColor: "#fff" },
  note: { fontSize: 11, color: theme.textLight, lineHeight: 16 },
  cta: { backgroundColor: theme.accent, borderRadius: 14, padding: 16, alignItems: "center", marginTop: 6 },
  ctaText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  error: { color: theme.danger, marginBottom: 8 },
});
