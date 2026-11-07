import { ActionSheet, ConfirmDialog } from "@/components/ui";
import { AppButton, AppInput, AppText, EmptyState } from "@/components/ui-components";
import { api, rupeesFromPaise } from "@/lib/api";
import { design, getShadow } from "@/lib/design";
import { FACILITY_OPTIONS, facilityLabel } from "@/lib/theme";
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

type Floor = {
  id: string;
  name: string;
  rooms: {
    id: string;
    number: string;
    facilities: string | null;
    sharing_type: number;
    beds: Bed[];
  }[];
};

function facilitiesLabel(value: string | null): string {
  if (!value) return "No facilities yet";
  return value
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => facilityLabel(f))
    .join(", ");
}

export default function PropertyEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [grid, setGrid] = useState<{ name: string; floors: Floor[] } | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editRoom, setEditRoom] = useState<{
    id: string;
    number: string;
    facilities: string | null;
    beds: Bed[];
  } | null>(null);
  const [floorDialog, setFloorDialog] = useState<{
    mode: "add" | "rename";
    floorId?: string;
    initial: string;
  } | null>(null);
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
      setBusy(true);
      const g = await api.get<{
        properties: { id: string; name: string; floors: Floor[] }[];
        totals: Record<string, number>;
      }>("/occupancy-grid");
      const p = g.properties.find((x) => x.id === id);
      if (!p) {
        setError("Building not found");
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
      message:
        "The room and its beds will be deleted. Occupied beds block deletion — vacate them first.",
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

  const floors = grid?.floors ?? [];
  const allRooms = floors.flatMap((floor) => floor.rooms);
  const totalBeds = allRooms.reduce((sum, room) => sum + room.beds.length, 0);
  const occupiedBeds = allRooms.reduce(
    (sum, room) => sum + room.beds.filter((bed) => bed.status === "occupied").length,
    0
  );
  const maintenanceBeds = allRooms.reduce(
    (sum, room) => sum + room.beds.filter((bed) => bed.status === "maintenance").length,
    0
  );

  if (busy && !grid) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={design.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.eyebrow}>PROPERTY EDITOR</Text>
            <AppText variant="h2" color="#fff" numberOfLines={1}>
              {grid?.name ?? "Building"}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.74)">
              Floors, rooms, beds & rent
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={load}
            accessibilityLabel="Refresh property"
          >
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{floors.length}</Text>
            <Text style={styles.heroStatLabel}>FLOORS</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{allRooms.length}</Text>
            <Text style={styles.heroStatLabel}>ROOMS</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{occupiedBeds}/{totalBeds}</Text>
            <Text style={styles.heroStatLabel}>BEDS FILLED</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={busy}
            onRefresh={load}
            tintColor={design.colors.primary}
            colors={[design.colors.primary]}
          />
        }
      >
        {error && <Text style={styles.error}>{error}</Text>}

        {!error && floors.length === 0 && (
          <EmptyState
            icon="layers-outline"
            title="No floors yet"
            subtitle="Add your first floor, then create rooms and beds inside it."
            actionLabel="Add floor"
            onAction={() =>
              setFloorDialog({ mode: "add", initial: FLOOR_NAMES[0] })
            }
          />
        )}

        {floors.map((floor) => {
          const floorBeds = floor.rooms.reduce((sum, room) => sum + room.beds.length, 0);
          const floorOccupied = floor.rooms.reduce(
            (sum, room) => sum + room.beds.filter((bed) => bed.status === "occupied").length,
            0
          );
          return (
            <View key={floor.id} style={styles.floorCard}>
              <View style={styles.floorHeader}>
                <View style={styles.floorTitleRow}>
                  <View style={styles.floorIcon}>
                    <Ionicons name="layers-outline" size={17} color={design.colors.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <AppText variant="h4" color={design.colors.textPrimary} numberOfLines={1}>
                      {floor.name} floor
                    </AppText>
                    <AppText variant="caption" color={design.colors.textSecondary}>
                      {floor.rooms.length} room{floor.rooms.length === 1 ? "" : "s"} ·{" "}
                      {floorOccupied}/{floorBeds} beds filled
                    </AppText>
                  </View>
                </View>
                <View style={styles.floorActions}>
                  <TouchableOpacity
                    style={styles.addRoomBtn}
                    onPress={() => setAddRoomFor(floor)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="add" size={15} color={design.colors.primary} />
                    <Text style={styles.addRoomText}>Room</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.moreBtn}
                    onPress={() => setFloorSheet(floor)}
                    accessibilityLabel={`More options for ${floor.name} floor`}
                  >
                    <Ionicons name="ellipsis-horizontal" size={17} color={design.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ gap: 8 }}>
                {floor.rooms.map((room) => {
                  const occupied = room.beds.filter((bed) => bed.status === "occupied").length;
                  return (
                    <View key={room.id} style={styles.roomRow}>
                      <TouchableOpacity
                        style={styles.roomBadge}
                        onPress={() => openRoom(room)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.roomNo}>{room.number}</Text>
                        <Text style={styles.roomSharing}>{room.beds.length}-bed</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, minWidth: 0 }}
                        onPress={() => openRoom(room)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.bedsRow}>
                          {room.beds.map((bed) => (
                            <View
                              key={bed.id}
                              style={[
                                styles.bedPill,
                                bed.status === "occupied" && styles.bedPillOn,
                                bed.status === "maintenance" && styles.bedPillWarn,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.bedPillText,
                                  bed.status === "occupied" && styles.bedPillTextOn,
                                  bed.status === "maintenance" && styles.bedPillTextDanger,
                                ]}
                              >
                                {bed.label}
                              </Text>
                            </View>
                          ))}
                          {room.beds.length === 0 && (
                            <Text style={styles.roomFacilities}>No beds yet</Text>
                          )}
                        </View>
                        <AppText
                          variant="caption"
                          color={design.colors.textMuted}
                          numberOfLines={1}
                          style={{ marginTop: 4 }}
                        >
                          {occupied}/{room.beds.length} filled · {facilitiesLabel(room.facilities)}
                        </AppText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.trashBtn}
                        onPress={() => deleteRoom(room.id, room.number)}
                        accessibilityLabel={`Delete room ${room.number}`}
                      >
                        <Ionicons name="trash-outline" size={16} color={design.colors.danger} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {floor.rooms.length === 0 && (
                  <View style={styles.emptyFloor}>
                    <Ionicons name="bed-outline" size={15} color={design.colors.textMuted} />
                    <AppText variant="caption" color={design.colors.textMuted} style={{ flex: 1 }}>
                      No rooms on this floor yet — tap Room above to add one.
                    </AppText>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {!error && floors.length > 0 && (
          <>
            <AppButton
              variant="primary"
              fullWidth
              icon="add"
              onPress={() =>
                setFloorDialog({
                  mode: "add",
                  initial:
                    FLOOR_NAMES[floors.length] ?? `F${floors.length}`,
                })
              }
              style={{ marginTop: 2 }}
            >
              Add floor
            </AppButton>
            {maintenanceBeds > 0 && (
              <View style={styles.maintenanceNote}>
                <Ionicons name="construct-outline" size={14} color="#B45309" />
                <AppText variant="caption" color="#92400E" style={{ flex: 1 }}>
                  {maintenanceBeds} bed{maintenanceBeds === 1 ? "" : "s"} under maintenance. Tap the
                  room to clear or manage bed status.
                </AppText>
              </View>
            )}
          </>
        )}
      </ScrollView>

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
              floorSheet &&
              setFloorDialog({ mode: "rename", floorId: floorSheet.id, initial: floorSheet.name }),
          },
          {
            label: "Delete floor",
            icon: "trash-outline",
            destructive: true,
            onPress: () =>
              floorSheet &&
              setConfirmDelete({
                title: `Delete ${floorSheet.name} floor?`,
                message:
                  "All rooms and beds on this floor will be removed. Floors with active tenants can't be deleted.",
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
    </View>
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
          <View style={styles.dialogHead}>
            <View style={styles.dialogIcon}>
              <Ionicons name="layers-outline" size={19} color={design.colors.primary} />
            </View>
            <AppText variant="h3" color={design.colors.textPrimary}>
              {dialog.mode === "rename" ? "Rename floor" : "Add floor"}
            </AppText>
          </View>
          <AppInput
            label="Floor name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ground, 1st"
            autoFocus
            maxLength={30}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <AppButton
              variant="ghost"
              onPress={onClose}
              style={{ flex: 1 }}
              fullWidth
            >
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onPress={save}
              loading={busy}
              disabled={busy || !name.trim()}
              style={{ flex: 1.4 }}
              fullWidth
            >
              {dialog.mode === "rename" ? "Rename" : "Add floor"}
            </AppButton>
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
    const used = (floor?.rooms ?? [])
      .map((r) => parseInt(r.number, 10))
      .filter((n) => !isNaN(n) && n >= prefix);
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
          <View style={styles.dialogHead}>
            <View style={styles.dialogIcon}>
              <Ionicons name="bed-outline" size={19} color={design.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h3" color={design.colors.textPrimary}>
                Add room
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                {floor.name} floor
              </AppText>
            </View>
          </View>

          <AppInput
            label="Room number"
            keyboardType="numbers-and-punctuation"
            maxLength={4}
            value={number}
            onChangeText={(v) => setNumber(v.replace(/[^\d]/g, ""))}
          />

          <View style={styles.stepperRow}>
            <AppText variant="label" color={design.colors.textSecondary}>
              BEDS
            </AppText>
            <View style={styles.stepperGroup}>
              <Pressable
                style={[styles.stepperBtn, beds <= 1 && { opacity: 0.4 }]}
                disabled={beds <= 1}
                onPress={() => setBeds((n) => Math.max(1, n - 1))}
              >
                <Ionicons name="remove" size={18} color={design.colors.textPrimary} />
              </Pressable>
              <Text style={styles.stepperValue}>{beds}</Text>
              <Pressable style={styles.stepperBtn} onPress={() => setBeds((n) => Math.min(16, n + 1))}>
                <Ionicons name="add" size={18} color={design.colors.textPrimary} />
              </Pressable>
            </View>
          </View>

          <AppInput
            label="Rent per bed (₹) — optional"
            keyboardType="decimal-pad"
            value={rent}
            onChangeText={(v) => setRent(v.replace(/[^\d.]/g, ""))}
            placeholder="e.g. 7000"
          />

          <View style={{ flexDirection: "row", gap: 8 }}>
            <AppButton variant="ghost" onPress={onClose} style={{ flex: 1 }} fullWidth>
              Cancel
            </AppButton>
            <AppButton
              variant="primary"
              onPress={save}
              loading={busy}
              disabled={busy || number.length === 0}
              style={{ flex: 1.3 }}
              fullWidth
            >
              Add room
            </AppButton>
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
      setSelected(
        new Set(
          (data.facilities ?? "")
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean)
        )
      );
      setRent(data.beds[0]?.rent_paise ? String(data.beds[0].rent_paise / 100) : "");
      setBedsCount(data.beds.length);
    }
  }, [data]);

  if (!data) return null;
  const { beds } = data;
  const occupiedCount = beds.filter((b) => b.status === "occupied").length;
  const maintenanceCount = beds.filter((b) => b.status === "maintenance").length;
  const vacantCount = beds.length - occupiedCount - maintenanceCount;

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
      setBedSheet(null);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed");
    }
  }

  async function removeBed() {
    if (!bedSheet) return;
    try {
      await api.delete(`/beds/${bedSheet.id}`);
      await refreshBeds();
      setBedSheet(null);
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
          <View style={styles.modalHead}>
            <View style={styles.dialogIcon}>
              <Ionicons name="bed" size={19} color={design.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h3" color={design.colors.textPrimary}>
                Room {data.number}
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                {beds.length} bed{beds.length === 1 ? "" : "s"} · {occupiedCount} occupied
                {maintenanceCount > 0 ? ` · ${maintenanceCount} maintenance` : ""}
              </AppText>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close room editor"
            >
              <Ionicons name="close" size={20} color={design.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ maxHeight: "82%" }}
            contentContainerStyle={{ gap: 10, paddingBottom: 6 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.bedStatusRow}>
              <View style={styles.bedStatusItem}>
                <View style={[styles.bedStatusDot, { backgroundColor: "#15803D" }]} />
                <AppText variant="caption" color={design.colors.textSecondary}>
                  {vacantCount} available
                </AppText>
              </View>
              <View style={styles.bedStatusItem}>
                <View style={[styles.bedStatusDot, { backgroundColor: design.colors.primary }]} />
                <AppText variant="caption" color={design.colors.textSecondary}>
                  {occupiedCount} occupied
                </AppText>
              </View>
              <View style={styles.bedStatusItem}>
                <View style={[styles.bedStatusDot, { backgroundColor: "#DC2626" }]} />
                <AppText variant="caption" color={design.colors.textSecondary}>
                  {maintenanceCount} maintenance
                </AppText>
              </View>
            </View>

            <AppText variant="label" color={design.colors.textSecondary}>
              BEDS — TAP A BED TO MANAGE
            </AppText>
            <View style={styles.bedsRow}>
              {beds.map((b) => (
                <TouchableOpacity
                  key={b.id}
                  style={[
                    styles.editorBedPill,
                    b.status === "occupied" && styles.editorBedOn,
                    b.status === "maintenance" && styles.editorBedWarn,
                  ]}
                  onPress={() => setBedSheet(b)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.editorBedText,
                      b.status === "occupied" && styles.editorBedTextOn,
                      b.status === "maintenance" && styles.editorBedTextDanger,
                    ]}
                  >
                    {b.label}
                    {b.tenant_name
                      ? ` · ${b.tenant_name.split(" ")[0]}`
                      : b.status === "maintenance"
                        ? " · M"
                        : ""}
                  </Text>
                </TouchableOpacity>
              ))}
              {beds.length === 0 && (
                <AppText variant="caption" color={design.colors.textMuted}>
                  No beds in this room yet.
                </AppText>
              )}
            </View>

            <View style={styles.stepperRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="label" color={design.colors.textSecondary}>
                  BEDS PER ROOM
                </AppText>
                <AppText variant="caption" color={design.colors.textMuted}>
                  {beds.length} now · removal only takes vacant beds
                </AppText>
              </View>
              <View style={styles.stepperGroup}>
                <Pressable
                  style={[
                    styles.stepperBtn,
                    (bedsCount <= 1 || occupiedCount >= bedsCount) && { opacity: 0.4 },
                  ]}
                  disabled={bedsCount <= 1 || occupiedCount >= bedsCount}
                  onPress={() => setBedsCount((n) => Math.max(1, n - 1))}
                >
                  <Ionicons name="remove" size={18} color={design.colors.textPrimary} />
                </Pressable>
                <Text style={styles.stepperValue}>{bedsCount}</Text>
                <Pressable
                  style={styles.stepperBtn}
                  onPress={() => setBedsCount((n) => Math.min(16, n + 1))}
                >
                  <Ionicons name="add" size={18} color={design.colors.textPrimary} />
                </Pressable>
              </View>
            </View>

            <AppText variant="label" color={design.colors.textSecondary} style={{ marginTop: 2 }}>
              ROOM FACILITIES
            </AppText>
            <AppText variant="caption" color={design.colors.textMuted}>
              This room's own list — editing it here stops auto-following the PG's facility list.
            </AppText>
            <View style={styles.chipWrap}>
              {FACILITY_OPTIONS.map((f) => {
                const active = selected.has(f.key);
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.chip, active && styles.chipOn]}
                    onPress={() =>
                      setSelected((prev) => {
                        const n = new Set(prev);
                        if (n.has(f.key)) n.delete(f.key);
                        else n.add(f.key);
                        return n;
                      })
                    }
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name={f.icon as any}
                      size={15}
                      color={active ? design.colors.primary : design.colors.textMuted}
                    />
                    <Text style={[styles.chipText, active && styles.chipTextOn]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <AppInput
              label="Rent per bed (₹) — applies to every bed in the room"
              keyboardType="decimal-pad"
              value={rent}
              onChangeText={(v) => setRent(v.replace(/[^\d.]/g, ""))}
              placeholder="e.g. 7500"
            />
            <AppText variant="caption" color={design.colors.textMuted}>
              Current: {beds[0] ? rupeesFromPaise(beds[0].rent_paise) : "—"} / bed
            </AppText>

            <AppButton variant="primary" fullWidth loading={busy} onPress={save}>
              Save room
            </AppButton>
          </ScrollView>
        </View>
      </View>

      <ActionSheet
        visible={!!bedSheet}
        title={`Bed ${bedSheet?.label ?? ""}`}
        message={
          bedSheet?.status === "occupied"
            ? "Occupied by a tenant — end their stay before changing this bed."
            : bedSheet?.status === "maintenance"
              ? "Currently in maintenance. Clear it to make the bed available."
              : "Available bed."
        }
        actions={
          bedSheet && bedSheet.status !== "occupied"
            ? [
                bedSheet.status === "maintenance"
                  ? {
                      label: "Clear maintenance",
                      icon: "checkmark-circle-outline",
                      onPress: () => patchStatus("vacant"),
                    }
                  : {
                      label: "Mark maintenance",
                      icon: "construct-outline",
                      onPress: () => patchStatus("maintenance"),
                    },
                {
                  label: "Delete bed",
                  icon: "trash-outline",
                  destructive: true,
                  onPress: removeBed,
                },
              ]
            : []
        }
        onCancel={() => setBedSheet(null)}
      />
    </Modal>
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
    backgroundColor: design.colors.primary,
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
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
  heroStatValue: { color: "#fff", fontSize: 17, fontWeight: "800" },
  heroStatLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 1,
  },
  heroStatDivider: { width: 1, height: 30, backgroundColor: "rgba(255,255,255,0.18)" },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 60, gap: 12 },

  floorCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: design.colors.border,
    gap: 10,
    ...getShadow("sm"),
  },
  floorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  floorTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9, minWidth: 0 },
  floorIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  floorActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  addRoomBtn: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 10,
    backgroundColor: design.colors.primaryLight,
    paddingHorizontal: 10,
  },
  addRoomText: { fontSize: 12, fontWeight: "800", color: design.colors.primary },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: design.colors.surfaceVariant,
  },

  roomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: design.colors.background,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: design.colors.border,
    padding: 10,
  },
  roomBadge: {
    width: 52,
    minHeight: 46,
    borderRadius: 11,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  roomNo: { fontWeight: "800", color: design.colors.primaryDark, fontSize: 14 },
  roomSharing: { fontSize: 8, fontWeight: "700", color: design.colors.primary, marginTop: 1 },
  roomFacilities: { fontSize: 11, color: design.colors.textMuted },
  bedsRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  bedPill: {
    borderRadius: 7,
    minWidth: 28,
    minHeight: 24,
    paddingHorizontal: 7,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    alignItems: "center",
    justifyContent: "center",
  },
  bedPillOn: { backgroundColor: design.colors.primary, borderColor: design.colors.primary },
  bedPillWarn: { backgroundColor: "#FFF1F2", borderColor: "#FECDD3" },
  bedPillText: { fontSize: 10, fontWeight: "800", color: "#047857" },
  bedPillTextOn: { color: "#fff" },
  bedPillTextDanger: { color: "#BE123C" },
  trashBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: design.colors.dangerLight,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyFloor: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  maintenanceNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    padding: 11,
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  error: { color: design.colors.danger, marginBottom: 4, fontSize: 13 },

  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 2,
  },
  stepperGroup: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepperBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: design.colors.border,
    borderRadius: 11,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    fontSize: 18,
    fontWeight: "800",
    color: design.colors.textPrimary,
    minWidth: 26,
    textAlign: "center",
  },

  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  overlayCenter: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  dialogCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    width: "100%",
    gap: 12,
    ...getShadow("lg"),
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    gap: 10,
    maxHeight: "92%",
  },
  dialogHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  dialogIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  modalHead: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 2 },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: design.colors.surfaceVariant,
    alignItems: "center",
    justifyContent: "center",
  },

  bedStatusRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  bedStatusItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  bedStatusDot: { width: 7, height: 7, borderRadius: 4 },
  editorBedPill: {
    borderRadius: 9,
    minHeight: 34,
    paddingHorizontal: 10,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    alignItems: "center",
    justifyContent: "center",
  },
  editorBedOn: { backgroundColor: design.colors.primary, borderColor: design.colors.primary },
  editorBedWarn: { backgroundColor: "#FFF1F2", borderColor: "#FECDD3" },
  editorBedText: { fontSize: 11, fontWeight: "800", color: "#047857" },
  editorBedTextOn: { color: "#fff" },
  editorBedTextDanger: { color: "#BE123C" },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: design.colors.background,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipOn: { backgroundColor: design.colors.primaryLight, borderColor: design.colors.primary },
  chipText: { fontSize: 12, fontWeight: "600", color: design.colors.textSecondary },
  chipTextOn: { color: design.colors.primary },
});
