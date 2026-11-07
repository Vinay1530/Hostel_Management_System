import { api } from "@/lib/api";
import { usePg } from "@/lib/pg";
import { design, getShadow } from "@/lib/design";
import { Sheet } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AppButton,
  AppText,
  AppBadge,
  EmptyState,
  AppInput,
  Skeleton,
} from "@/components/ui-components";

type Bed = {
  id: string;
  label: string;
  status: "vacant" | "occupied" | "maintenance";
  tenant_name?: string | null;
};
type Room = { id: string; number: string; sharing_type: number; facilities: string | null; beds: Bed[] };
type Floor = { id: string; name: string; rooms: Room[] };
type Property = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  locality: string | null;
  floors: Floor[];
};

function bedColor(status: Bed["status"]): string {
  if (status === "occupied") return design.colors.primary;
  if (status === "maintenance") return design.colors.danger;
  return design.colors.success;
}

function buildingTotals(property: Property) {
  let beds = 0;
  let occupied = 0;
  let rooms = 0;
  let floors = property.floors?.length ?? 0;
  for (const floor of property.floors ?? []) {
    rooms += floor.rooms?.length ?? 0;
    for (const room of floor.rooms ?? [])
      for (const bed of room.beds ?? []) {
        beds += 1;
        if (bed.status === "occupied") occupied += 1;
      }
  }
  return { beds, occupied, rooms, floors, pct: beds ? Math.round((occupied / beds) * 100) : 0 };
}

export default function Setup() {
  const { properties: pgProperties, refreshProperties } = usePg();
  const router = useRouter();

  const [grid, setGrid] = useState<Property[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", city: "", locality: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const res = await api.get<{ properties: Property[] }>("/occupancy-grid");
      setGrid(res.properties ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load property layout");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const buildings = grid ?? pgProperties.map((p) => ({
    id: p.id,
    name: p.name,
    address: p.address ?? null,
    city: null,
    locality: null,
    floors: [],
  }));

  const totals = buildings.reduce(
    (acc, b) => {
      const t = buildingTotals(b as Property);
      return {
        buildings: acc.buildings + 1,
        rooms: acc.rooms + t.rooms,
        beds: acc.beds + t.beds,
        occupied: acc.occupied + t.occupied,
      };
    },
    { buildings: 0, rooms: 0, beds: 0, occupied: 0 }
  );
  const occupancyPct = totals.beds ? Math.round((totals.occupied / totals.beds) * 100) : 0;

  async function addBuilding() {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("Building name is required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/properties", {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        locality: form.locality.trim() || undefined,
      });
      setAddOpen(false);
      setForm({ name: "", address: "", city: "", locality: "" });
      await Promise.allSettled([load(), refreshProperties()]);
    } catch (e: any) {
      setFormError(e?.detail ?? e?.message ?? "Failed to add building");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>PROPERTY SETUP</Text>
            <AppText variant="h2" color="#fff">
              Layout & Rooms
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.72)">
              Building → floor → room → bed
            </AppText>
          </View>
          <TouchableOpacity style={styles.heroIconBtn} onPress={() => setAddOpen(true)}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={design.colors.primary} />
        }
      >
        {loading && !grid && (
          <View style={{ gap: 12 }}>
            <View style={styles.statsRow}>
              <Skeleton height={82} radius={16} style={{ flex: 1 }} />
              <Skeleton height={82} radius={16} style={{ flex: 1 }} />
              <Skeleton height={82} radius={16} style={{ flex: 1 }} />
            </View>
            <Skeleton height={110} radius={16} />
            <Skeleton height={110} radius={16} />
          </View>
        )}

        {!loading || grid ? (
          <>
            {/* Summary */}
            <View style={styles.statsRow}>
              <SummaryTile label="Buildings" value={totals.buildings} icon="business" />
              <SummaryTile label="Rooms" value={totals.rooms} icon="grid" />
              <SummaryTile
                label="Occupancy"
                value={`${occupancyPct}%`}
                icon="pie-chart"
                tint={design.colors.primary}
              />
            </View>

            <View style={styles.sectionRow}>
              <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                YOUR BUILDINGS
              </AppText>
              <View style={styles.legendRow}>
                <LegendDot color={design.colors.success} label="Free" />
                <LegendDot color={design.colors.primary} label="Occupied" />
                <LegendDot color={design.colors.danger} label="Fix" />
              </View>
            </View>

            {buildings.length === 0 && !loading && (
              <EmptyState
                icon="business-outline"
                title="No buildings yet"
                subtitle="Create your first building, then add floors, rooms and beds."
                actionLabel="Add Building"
                onAction={() => setAddOpen(true)}
              />
            )}

            <View style={{ gap: 10 }}>
              {buildings.map((building) => {
                const t = buildingTotals(building as Property);
                const isOpen = expanded[building.id] ?? true;
                const address = [building.locality, building.city].filter(Boolean).join(", ");
                return (
                  <View key={building.id} style={styles.buildingCard}>
                    <TouchableOpacity
                      style={styles.buildingHeader}
                      activeOpacity={0.85}
                      onPress={() =>
                        setExpanded((prev) => ({ ...prev, [building.id]: !isOpen }))
                      }
                    >
                      <View style={styles.buildingIcon}>
                        <Ionicons name="business" size={19} color={design.colors.primary} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.buildingNameRow}>
                          <AppText
                            variant="h4"
                            color={design.colors.textPrimary}
                            numberOfLines={1}
                            style={{ flex: 1 }}
                          >
                            {building.name}
                          </AppText>
                          <AppBadge variant={t.beds > 0 && t.occupied >= t.beds ? "success" : "primary"}>
                            {t.occupied}/{t.beds} beds
                          </AppBadge>
                        </View>
                        <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                          {address || "Address not added"} · {t.floors} floors · {t.rooms} rooms
                        </AppText>
                      </View>
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={design.colors.textMuted}
                      />
                    </TouchableOpacity>

                    <View style={styles.occupancyTrack}>
                      <View style={[styles.occupancyFill, { width: `${t.pct}%` }]} />
                    </View>

                    {isOpen && (
                      <View style={styles.buildingBody}>
                        {t.floors === 0 && (
                          <View style={styles.emptyFloor}>
                            <AppText variant="caption" color={design.colors.textMuted}>
                              No floors yet — open the editor to add floors, rooms and beds.
                            </AppText>
                          </View>
                        )}

                        {building.floors?.map((floor) => {
                          const floorRooms = floor.rooms ?? [];
                          const floorBeds = floorRooms.reduce((n, r) => n + (r.beds?.length ?? 0), 0);
                          const floorOccupied = floorRooms.reduce(
                            (n, r) => n + (r.beds ?? []).filter((b) => b.status === "occupied").length,
                            0
                          );
                          return (
                            <View key={floor.id} style={styles.floorBlock}>
                              <View style={styles.floorRow}>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                  <View style={styles.floorDot} />
                                  <AppText variant="label" color={design.colors.textSecondary} style={styles.floorLabel}>
                                    {String(floor.name).toUpperCase()}
                                  </AppText>
                                </View>
                                <AppText variant="caption" color={design.colors.textMuted}>
                                  {floorOccupied}/{floorBeds} occupied
                                </AppText>
                              </View>

                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.roomRow}
                              >
                                {floorRooms.map((room) => {
                                  const beds = room.beds ?? [];
                                  return (
                                    <TouchableOpacity
                                      key={room.id}
                                      style={styles.roomTile}
                                      activeOpacity={0.88}
                                      onPress={() => router.push(`/property/${building.id}`)}
                                    >
                                      <View style={styles.roomTileTop}>
                                        <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "800" }}>
                                          {room.number}
                                        </AppText>
                                        <AppText variant="caption" color={design.colors.textMuted}>
                                          {beds.length}-bed
                                        </AppText>
                                      </View>
                                      <View style={styles.bedDots}>
                                        {beds.map((bed) => (
                                          <View
                                            key={bed.id}
                                            style={[styles.bedDot, { backgroundColor: bedColor(bed.status) }]}
                                          />
                                        ))}
                                        {beds.length === 0 && (
                                          <AppText variant="caption" color={design.colors.textMuted}>
                                            no beds
                                          </AppText>
                                        )}
                                      </View>
                                    </TouchableOpacity>
                                  );
                                })}
                                {floorRooms.length === 0 && (
                                  <AppText variant="caption" color={design.colors.textMuted}>
                                    No rooms — tap Edit layout to add one.
                                  </AppText>
                                )}
                              </ScrollView>
                            </View>
                          );
                        })}

                        <TouchableOpacity
                          style={styles.editLayoutBtn}
                          onPress={() => router.push(`/property/${building.id}`)}
                          activeOpacity={0.9}
                        >
                          <Ionicons name="construct-outline" size={15} color={design.colors.primary} />
                          <AppText variant="caption" color={design.colors.primary} style={{ fontWeight: "800" }}>
                            Edit layout, floors & beds
                          </AppText>
                          <Ionicons name="arrow-forward" size={13} color={design.colors.primary} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {buildings.length > 0 && (
              <TouchableOpacity style={styles.addBuildingCta} onPress={() => setAddOpen(true)}>
                <Ionicons name="add-circle-outline" size={19} color={design.colors.primary} />
                <AppText variant="body" color={design.colors.primary} style={{ fontWeight: "800" }}>
                  Add another building
                </AppText>
              </TouchableOpacity>
            )}
          </>
        ) : null}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)}>
        <AppText variant="h3" color={design.colors.textPrimary}>
          Add Building
        </AppText>
        <AppText variant="caption" color={design.colors.textSecondary} style={{ marginBottom: 10 }}>
          You can add floors, rooms and beds right after.
        </AppText>
        <AppInput
          label="Building name"
          placeholder="e.g. Sunrise PG — Block A"
          value={form.name}
          onChangeText={(v) => setForm({ ...form, name: v })}
        />
        <AppInput
          label="Address"
          placeholder="Street address"
          value={form.address}
          onChangeText={(v) => setForm({ ...form, address: v })}
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <AppInput
              label="Locality"
              placeholder="e.g. Koramangala"
              value={form.locality}
              onChangeText={(v) => setForm({ ...form, locality: v })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppInput
              label="City"
              placeholder="e.g. Bengaluru"
              value={form.city}
              onChangeText={(v) => setForm({ ...form, city: v })}
            />
          </View>
        </View>
        {formError && <Text style={styles.formError}>{formError}</Text>}
        <AppButton variant="primary" fullWidth loading={saving} onPress={addBuilding} style={{ marginTop: 8 }}>
          Create Building
        </AppButton>
      </Sheet>
    </View>
  );
}

function SummaryTile({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: string | number;
  icon: string;
  tint?: string;
}) {
  return (
    <View style={styles.summaryTile}>
      <View
        style={[
          styles.summaryIcon,
          { backgroundColor: tint ? tint : design.colors.primaryLight },
        ]}
      >
        <Ionicons name={icon as any} size={15} color={tint ? "#fff" : design.colors.primary} />
      </View>
      <AppText
        variant="h4"
        color={design.colors.textPrimary}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </AppText>
      <AppText variant="caption" color={design.colors.textMuted} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <AppText variant="caption" color={design.colors.textMuted}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },
  hero: {
    backgroundColor: design.colors.primary,
    paddingHorizontal: 16,
    paddingTop: 14,
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
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, color: "rgba(255,255,255,0.72)", marginBottom: 3 },
  heroIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 110 },

  statsRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  summaryTile: {
    flex: 1,
    minHeight: 84,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: design.colors.border,
    padding: 11,
    ...getShadow("sm"),
  },
  summaryIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  legendRow: { flexDirection: "row", gap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendSwatch: { width: 8, height: 8, borderRadius: 4 },

  buildingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    padding: 14,
    ...getShadow("sm"),
  },
  buildingHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  buildingIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  buildingNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  occupancyTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: design.colors.surfaceVariant,
    overflow: "hidden",
    marginTop: 12,
  },
  occupancyFill: { height: 4, borderRadius: 2, backgroundColor: design.colors.primary },
  buildingBody: { marginTop: 14, gap: 14 },
  emptyFloor: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: design.colors.surfaceVariant,
  },
  floorBlock: { gap: 8 },
  floorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  floorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: design.colors.primary },
  floorLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  roomRow: { gap: 8, paddingRight: 4 },
  roomTile: {
    minWidth: 104,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: design.colors.background,
    padding: 10,
    gap: 7,
  },
  roomTileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  bedDots: { flexDirection: "row", flexWrap: "wrap", gap: 4, minHeight: 10 },
  bedDot: { width: 10, height: 10, borderRadius: 3 },
  editLayoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 42,
    borderRadius: 11,
    backgroundColor: design.colors.primaryLight,
    marginTop: 2,
  },
  addBuildingCta: {
    marginTop: 14,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: design.colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(79,70,229,0.03)",
  },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center", fontSize: 13 },
  formError: { color: design.colors.danger, marginTop: 8, textAlign: "center", fontSize: 12 },
});
