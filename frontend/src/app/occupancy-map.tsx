import { api } from "@/lib/api";
import { design, getShadow } from "@/lib/design";
import { usePg } from "@/lib/pg";
import { ActionSheet, Select, Sheet } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
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
  AppInput,
  EmptyState,
  Skeleton,
} from "@/components/ui-components";

type OccupancyMapEntry = {
  id: string;
  property_id: string;
  bed_id: string;
  floor_number: number;
  room_number: string;
  bed_label: string;
  is_occupied: boolean;
  tenant_id: string | null;
};

type GridBed = { id: string; status: string };
type GridRoom = { id: string; beds: GridBed[] };
type GridFloor = { id: string; rooms: GridRoom[] };
type GridProperty = { id: string; floors: GridFloor[] };
type BedState = "occupied" | "available" | "maintenance";

type TenantLite = { id: string; full_name: string };
type StatusFilter = "all" | "occupied" | "available" | "maintenance";

export default function OccupancyMap() {
  const { propertyId, properties, setPropertyId } = usePg();
  const router = useRouter();

  const [maps, setMaps] = useState<OccupancyMapEntry[] | null>(null);
  const [tenants, setTenants] = useState<TenantLite[]>([]);
  const [bedStatuses, setBedStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [floorFilter, setFloorFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // assignment / vacate
  const [selected, setSelected] = useState<OccupancyMapEntry | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [vacateOpen, setVacateOpen] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    if (!propertyId) {
      setMaps([]);
      return;
    }
    try {
      setLoading(true);
      const [mapRes, tenantRes, gridRes] = await Promise.allSettled([
        api.get<OccupancyMapEntry[]>(`/occupancy-maps/${propertyId}`),
        api.get<TenantLite[]>("/tenants"),
        api.get<{ properties: GridProperty[] }>("/occupancy-grid"),
      ]);

      if (mapRes.status === "fulfilled") {
        setMaps(mapRes.value);
      } else {
        const reason: any = mapRes.reason;
        if (reason?.status !== 404) setError(reason?.message ?? "Failed to load occupancy map");
        else setMaps([]);
      }

      if (tenantRes.status === "fulfilled") setTenants(tenantRes.value);

      if (gridRes.status === "fulfilled") {
        const statusMap: Record<string, string> = {};
        for (const property of gridRes.value.properties ?? []) {
          if (property.id !== propertyId) continue;
          for (const floor of property.floors ?? [])
            for (const room of floor.rooms ?? [])
              for (const bed of room.beds ?? []) statusMap[bed.id] = bed.status;
        }
        setBedStatuses(statusMap);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load occupancy map");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const tenantName = (id: string | null) => {
    if (!id) return null;
    const tenant = tenants.find((t) => t.id === id);
    return tenant?.full_name ?? null;
  };

  const stateOf = (entry: OccupancyMapEntry): BedState => {
    if (bedStatuses[entry.bed_id] === "maintenance") return "maintenance";
    return entry.is_occupied ? "occupied" : "available";
  };

  const selectedTenants = tenants.filter(
    (t) => !maps?.some((m) => m.is_occupied && m.tenant_id === t.id)
  );

  async function seedMap() {
    if (!propertyId) return;
    setBusy(true);
    try {
      await api.post(`/occupancy-maps/${propertyId}/seed`);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Could not build map from beds");
    } finally {
      setBusy(false);
    }
  }

  async function assignTenant() {
    if (!selected || !tenantId) {
      setFormError("Pick a tenant first");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
      setFormError("Start date must be YYYY-MM-DD");
      return;
    }
    const rentNum = Number(rent.replace(/\D/g, "")) || 0;
    setFormError(null);
    setBusy(true);
    try {
      await api.post(`/occupancy-maps/${selected.id}/assign`, {
        tenant_id: tenantId,
        start_date: startDate.trim(),
        agreed_rent_paise: rentNum * 100,
        deposit_paise: (Number(deposit.replace(/\D/g, "")) || 0) * 100,
      });
      setAssignOpen(false);
      setSelected(null);
      setTenantId(null);
      setRent("");
      setDeposit("");
      await load();
    } catch (e: any) {
      setFormError(e?.message ?? "Failed to assign tenant");
    } finally {
      setBusy(false);
    }
  }

  async function vacateBed() {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/occupancy-maps/${selected.id}/vacate`);
      setVacateOpen(false);
      setSelected(null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to vacate bed");
    } finally {
      setBusy(false);
    }
  }

  const floorOptions = Array.from(
    new Set((maps ?? []).map((entry) => entry.floor_number))
  ).sort((a, b) => a - b);

  const visibleMaps = (maps ?? []).filter((entry) => {
    if (floorFilter !== "__all__" && String(entry.floor_number) !== floorFilter) return false;
    const state = stateOf(entry);
    if (statusFilter === "occupied" && state !== "occupied") return false;
    if (statusFilter === "available" && state !== "available") return false;
    if (statusFilter === "maintenance" && state !== "maintenance") return false;
    return true;
  });

  const byFloor = visibleMaps.reduce<Record<number, OccupancyMapEntry[]>>((acc, entry) => {
    (acc[entry.floor_number] ??= []).push(entry);
    return acc;
  }, {});
  const floors = Object.keys(byFloor).map(Number).sort((a, b) => a - b);

  const occupiedCount = maps?.filter((m) => stateOf(m) === "occupied").length ?? 0;
  const availableCount = maps?.filter((m) => stateOf(m) === "available").length ?? 0;
  const maintenanceCount = maps?.filter((m) => stateOf(m) === "maintenance").length ?? 0;
  const totalBeds = maps?.length ?? 0;

  if (loading && maps === null) {
    return (
      <View style={styles.container}>
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={26} width={180} />
          <Skeleton height={46} radius={12} />
          <View style={styles.roomGrid}>
            <Skeleton height={150} radius={16} style={{ width: "48.3%" }} />
            <Skeleton height={150} radius={16} style={{ width: "48.3%" }} />
            <Skeleton height={150} radius={16} style={{ width: "48.3%" }} />
            <Skeleton height={150} radius={16} style={{ width: "48.3%" }} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={load}
          tintColor={design.colors.primary}
          colors={[design.colors.primary]}
        />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="h2" color={design.colors.textPrimary}>
            Occupancy Map
          </AppText>
          <AppText variant="bodySmall" color={design.colors.textSecondary}>
            {maps && maps.length > 0
              ? `${occupiedCount}/${totalBeds} beds occupied${
                  maintenanceCount > 0 ? ` · ${maintenanceCount} in maintenance` : ""
                } · tap a bed to manage`
              : "Visual floor-by-floor bed grid"}
          </AppText>
        </View>
        {maps && maps.length > 0 && (
          <View style={styles.ratioChip}>
            <AppText variant="caption" color={design.colors.primary} style={{ fontWeight: "800" }}>
              {totalBeds ? Math.round((occupiedCount / totalBeds) * 100) : 0}%
            </AppText>
          </View>
        )}
      </View>

      {maps && maps.length > 0 && (
        <View style={styles.statusStrip}>
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: design.colors.success }]} />
            <AppText variant="caption" color={design.colors.textSecondary}>
              Available
            </AppText>
            <AppText variant="body" color={design.colors.textPrimary} style={styles.statusValue}>
              {availableCount}
            </AppText>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: design.colors.primary }]} />
            <AppText variant="caption" color={design.colors.textSecondary}>
              Occupied
            </AppText>
            <AppText variant="body" color={design.colors.textPrimary} style={styles.statusValue}>
              {occupiedCount}
            </AppText>
          </View>
          <View style={styles.statusDivider} />
          <View style={styles.statusItem}>
            <View style={[styles.statusDot, { backgroundColor: design.colors.danger }]} />
            <AppText variant="caption" color={design.colors.textSecondary}>
              Maintenance
            </AppText>
            <AppText variant="body" color={design.colors.textPrimary} style={styles.statusValue}>
              {maintenanceCount}
            </AppText>
          </View>
        </View>
      )}

      {/* Filters */}
      <View style={styles.filtersRow}>
        <View style={{ flex: 1.25 }}>
          <AppText variant="label" color={design.colors.textMuted} style={styles.filterLabel}>
            BUILDING
          </AppText>
          <Select
            value={propertyId}
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            onChange={(v) => {
              setPropertyId(v);
              setFloorFilter("__all__");
              setStatusFilter("all");
            }}
            placeholder="Select building"
            title="Select building"
            compact
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={design.colors.textMuted} style={styles.filterLabel}>
            FLOOR
          </AppText>
          <Select
            value={floorFilter}
            options={[
              { value: "__all__", label: "All floors" },
              ...floorOptions.map((n) => ({ value: String(n), label: `Floor ${n}` })),
            ]}
            onChange={setFloorFilter}
            title="Filter by floor"
            compact
          />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="label" color={design.colors.textMuted} style={styles.filterLabel}>
            STATUS
          </AppText>
          <Select
            value={statusFilter}
            options={[
              { value: "all", label: "All" },
              { value: "available", label: "Available" },
              { value: "occupied", label: "Occupied" },
              { value: "maintenance", label: "Maintenance" },
            ]}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            title="Filter by status"
            compact
          />
        </View>
      </View>

      {!propertyId && (
        <EmptyState
          icon="business-outline"
          title="Select a building"
          subtitle="Pick one of your buildings above to see its floor-by-floor occupancy map."
        />
      )}

      {propertyId && maps && maps.length === 0 && (
        <EmptyState
          icon="map-outline"
          title="No occupancy map yet"
          subtitle="Build a visual grid from the beds you already created in Setup."
          actionLabel={busy ? "Building…" : "Build map from beds"}
          onAction={seedMap}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {propertyId && maps && maps.length > 0 && floors.length === 0 && (
        <EmptyState
          icon="filter-outline"
          title="No beds match"
          subtitle="Try clearing the floor or status filter."
        />
      )}

      {floors.map((floorNum) => {
        const entries = byFloor[floorNum];
        const roomNumbers = Array.from(new Set(entries.map((e) => e.room_number))).sort((a, b) =>
          a.localeCompare(b)
        );
        const floorOccupied = entries.filter((e) => stateOf(e) === "occupied").length;
        const floorMaintenance = entries.filter((e) => stateOf(e) === "maintenance").length;

        return (
          <View key={floorNum} style={styles.floorSection}>
            <View style={styles.floorHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.floorDot} />
                <AppText variant="h4" color={design.colors.textPrimary}>
                  Floor {floorNum}
                </AppText>
              </View>
              <AppText variant="caption" color={design.colors.textSecondary} style={{ fontWeight: "700" }}>
                {floorOccupied}/{entries.length} occupied
                {floorMaintenance > 0 ? ` · ${floorMaintenance} maint.` : ""}
              </AppText>
            </View>

            <View style={styles.roomGrid}>
              {roomNumbers.map((roomNumber) => {
                const roomEntries = (maps ?? []).filter(
                  (e) => e.floor_number === floorNum && e.room_number === roomNumber
                );
                const roomOccupied = roomEntries.filter((e) => stateOf(e) === "occupied").length;
                const roomMaintenance = roomEntries.filter((e) => stateOf(e) === "maintenance").length;
                const full = roomEntries.length > 0 && roomOccupied >= roomEntries.length;
                const partial = roomOccupied > 0 && !full;
                const ratioBg = full
                  ? design.colors.successLight
                  : partial
                    ? design.colors.warningLight
                    : design.colors.surfaceVariant;
                const ratioColor = full
                  ? design.colors.success
                  : partial
                    ? "#92400e"
                    : design.colors.textSecondary;

                return (
                  <View key={`${floorNum}-${roomNumber}`} style={styles.roomCard}>
                    <View style={styles.roomHeader}>
                      <View style={{ flex: 1 }}>
                        <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "800" }} numberOfLines={1}>
                          Room {roomNumber}
                        </AppText>
                        <AppText variant="caption" color={design.colors.textMuted}>
                          {roomEntries.length}-Seater
                          {roomMaintenance > 0 ? ` · ${roomMaintenance} maint.` : ""}
                        </AppText>
                      </View>
                      <View style={[styles.ratioBadge, { backgroundColor: ratioBg }]}>
                        <AppText variant="caption" color={ratioColor} style={{ fontWeight: "800" }}>
                          {roomOccupied}/{roomEntries.length}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.bedGrid}>
                      {entries
                        .filter((e) => e.room_number === roomNumber)
                        .sort((a, b) => a.bed_label.localeCompare(b.bed_label))
                        .map((entry) => {
                          const name = tenantName(entry.tenant_id);
                          const state = stateOf(entry);
                          const tileStyle =
                            state === "occupied"
                              ? styles.bedTileOccupied
                              : state === "maintenance"
                                ? styles.bedTileMaintenance
                                : styles.bedTileAvailable;
                          return (
                            <TouchableOpacity
                              key={entry.id}
                              style={[styles.bedTile, tileStyle]}
                              activeOpacity={0.8}
                              onPress={() => {
                                if (state === "maintenance") {
                                  Alert.alert(
                                    "Bed under maintenance",
                                    `Bed ${entry.bed_label} · Room ${entry.room_number} is marked for maintenance. Clear its status in Setup before assigning a tenant.`,
                                    [{ text: "OK" }]
                                  );
                                  return;
                                }
                                setFormError(null);
                                setSelected(entry);
                                if (state === "occupied") setVacateOpen(true);
                                else {
                                  setAssignOpen(true);
                                  setStartDate(new Date().toISOString().slice(0, 10));
                                }
                              }}
                            >
                              <Ionicons
                                name={
                                  state === "occupied"
                                    ? "bed"
                                    : state === "maintenance"
                                      ? "construct"
                                      : "bed-outline"
                                }
                                size={15}
                                color="#fff"
                              />
                              <Text style={[styles.bedTileLabel, styles.bedTileLabelLight]}>
                                {entry.bed_label}
                              </Text>
                              {name && (
                                <Text style={styles.bedTenant} numberOfLines={1}>
                                  {name.split(" ")[0]}
                                </Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      {/* Legend */}
      {propertyId && maps && maps.length > 0 && (
        <View style={styles.legendCard}>
          <AppText variant="label" color={design.colors.textMuted} style={styles.legendTitle}>
            BED STATUS
          </AppText>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: "#15803D" }]} />
              <AppText variant="caption" color={design.colors.textSecondary}>Available</AppText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: design.colors.primary }]} />
              <AppText variant="caption" color={design.colors.textSecondary}>Occupied</AppText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: "#DC2626" }]} />
              <AppText variant="caption" color={design.colors.textSecondary}>Maintenance</AppText>
            </View>
          </View>
          <AppText variant="caption" color={design.colors.textMuted} style={{ marginTop: 6 }}>
            Tap an available bed to assign a tenant · tap an occupied bed to vacate.
          </AppText>
        </View>
      )}

      {/* Assign sheet */}
      <Sheet
        visible={assignOpen}
        onClose={() => {
          setAssignOpen(false);
          setSelected(null);
        }}
      >
        <AppText variant="h3" color={design.colors.textPrimary} style={{ marginBottom: 2 }}>
          Assign a tenant
        </AppText>
        <AppText variant="bodySmall" color={design.colors.textSecondary} style={{ marginBottom: 14 }}>
          Bed {selected?.bed_label} · Room {selected?.room_number}
        </AppText>

        <AppText variant="label" color={design.colors.textSecondary} style={{ marginBottom: 6 }}>
          TENANT
        </AppText>
        <View style={{ marginBottom: 10 }}>
          <Select
            value={tenantId}
            options={selectedTenants.map((t) => ({ value: t.id, label: t.full_name }))}
            onChange={setTenantId}
            placeholder={selectedTenants.length ? "Pick a tenant…" : "No free tenants"}
            title={selectedTenants.length ? "Tenants without a stay" : "No free tenants"}
          />
        </View>

        <AppInput
          label="Start date (YYYY-MM-DD)"
          value={startDate}
          onChangeText={setStartDate}
        />
        <AppInput
          label="Agreed rent (Rs./month)"
          placeholder="e.g. 6500"
          keyboardType="numeric"
          value={rent}
          onChangeText={setRent}
        />
        <AppInput
          label="Security deposit (Rs., optional)"
          placeholder="e.g. 12000"
          keyboardType="numeric"
          value={deposit}
          onChangeText={setDeposit}
        />
        {formError && <Text style={styles.formError}>{formError}</Text>}
        <AppButton
          variant="primary"
          fullWidth
          loading={busy}
          onPress={assignTenant}
          style={{ marginTop: 8 }}
        >
          Assign Tenant
        </AppButton>
      </Sheet>

      {/* Vacate action sheet */}
      <ActionSheet
        visible={vacateOpen}
        title={`Bed ${selected?.bed_label} · Room ${selected?.room_number}`}
        message={
          selected
            ? `Occupied by ${tenantName(selected.tenant_id) ?? "a tenant"}. Settle the deposit before ending the stay.`
            : undefined
        }
        actions={[
          {
            label: busy ? "Vacating…" : "Vacate bed (deposit settled)",
            icon: "log-out-outline",
            destructive: true,
            onPress: vacateBed,
          },
          {
            label: "Open Security Deposits",
            icon: "shield-checkmark-outline",
            onPress: () => router.push("/security-deposits"),
          },
        ]}
        onCancel={() => setVacateOpen(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },
  content: { padding: 16, paddingTop: 8, paddingBottom: 100 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  ratioChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: design.colors.primaryLight,
  },
  filtersRow: { flexDirection: "row", gap: 8, marginBottom: 18 },

  statusStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.colors.border,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 14,
    ...getShadow("sm"),
  },
  statusItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusValue: { fontWeight: "800", fontSize: 13 },
  statusDivider: { width: 1, height: 18, backgroundColor: design.colors.border },

  filterLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 0.7, marginBottom: 5 },

  floorSection: { marginBottom: 22 },
  floorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  floorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: design.colors.primary,
  },
  roomGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  roomCard: {
    width: "48.3%",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    padding: 11,
    ...getShadow("sm"),
  },
  roomHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 9 },
  ratioBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
  },
  bedGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  bedTile: {
    minWidth: 42,
    height: 48,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    gap: 1,
  },
  bedTileOccupied: { backgroundColor: design.colors.primary },
  bedTileAvailable: { backgroundColor: "#15803D" },
  bedTileMaintenance: { backgroundColor: "#DC2626" },
  bedTileLabel: { fontSize: 10, fontWeight: "800" },
  bedTileLabelLight: { color: "#fff" },
  bedTenant: { fontSize: 8, fontWeight: "700", color: "rgba(255,255,255,0.9)", maxWidth: 40 },

  legendCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.colors.border,
    padding: 12,
    marginTop: 2,
    ...getShadow("sm"),
  },
  legendTitle: { fontSize: 9, fontWeight: "800", letterSpacing: 0.7, marginBottom: 7 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 4 },

  formError: { color: design.colors.danger, marginTop: 8, textAlign: "center", fontSize: 12 },
  error: { color: design.colors.danger, marginTop: 12, textAlign: "center", fontSize: 13 },
});
