import { api } from "@/lib/api";
import { usePg } from "@/lib/pg";
import { theme } from "@/lib/theme";
import type { BedStatus } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const bedColors: Record<BedStatus, { bg: string; fg: string }> = {
  occupied: { bg: theme.success, fg: "#fff" },
  vacant: { bg: theme.chipBg, fg: theme.textLight },
  maintenance: { bg: theme.warn, fg: "#fff" },
};

export default function Dashboard() {
  const router = useRouter();
  const { propertyId, property, properties, ready: pgReady } = usePg();
  const [grid, setGrid] = useState<GridResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<GridResponse>("/occupancy-grid");
      setGrid(data);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load grid");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !pgReady)
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );

  const propertiesToShow = grid
    ? grid.properties.filter((p) => (propertyId ? p.id === propertyId : true))
    : [];

  const totals = computeTotals(propertiesToShow);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.accent} />}
    >
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>{property ? property.name : "All PGs"}</Text>
          <Text style={styles.sub}>{property ? "Occupancy for this PG" : `Across ${propertiesToShow.length} PG${propertiesToShow.length === 1 ? "" : "s"}`}</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.heroCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroLabel}>Occupancy</Text>
          <Text style={styles.heroValue}>{totals.occupancy_pct}%</Text>
          <Text style={styles.heroSub}>
            {totals.occupied} of {totals.beds} beds filled
          </Text>
        </View>
        <View style={styles.heroIcon}>
          <Ionicons name="bed-outline" size={30} color="#fff" />
        </View>
      </View>

      <View style={styles.totalsRow}>
        <Stat label="Beds" value={String(totals.beds)} icon="albums-outline" />
        <Stat label="Occupied" value={String(totals.occupied)} icon="person-outline" tone="success" />
        <Stat label="Vacant" value={String(totals.vacant)} icon="checkmark-circle-outline" tone="info" />
        <Stat label="Repair" value={String(totals.maintenance)} icon="construct-outline" tone="warn" />
      </View>

      {propertiesToShow.length === 0 && (
        <View style={styles.emptyCard}>
          <Ionicons name="business-outline" size={28} color={theme.textLight} />
          <Text style={styles.emptyTitle}>No PG selected or created</Text>
          <Text style={styles.emptySub}>Create a PG from Setup to start adding rooms and tenants.</Text>
          <Pressable style={styles.emptyBtn} onPress={() => router.push("/(tabs)/setup")}>
            <Text style={styles.emptyBtnText}>Go to Setup</Text>
          </Pressable>
        </View>
      )}

      {propertiesToShow.map((prop) => {
        const propTotals = computeTotals([prop]);
        return (
          <View key={prop.id} style={styles.propertyCard}>
            <Pressable style={styles.propHeader} onPress={() => router.push(`/property/${prop.id}`)}>
              <View style={styles.propIcon}>
                <Ionicons name="business-outline" size={18} color={theme.accentText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.propertyName}>{prop.name}</Text>
                <Text style={styles.propSub}>
                  {propTotals.occupied}/{propTotals.beds} beds · {propTotals.occupancy_pct}% full
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
            </Pressable>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${propTotals.occupancy_pct}%` }]} />
            </View>

            {prop.floors.map((floor) => (
              <View key={floor.id} style={{ marginTop: 12 }}>
                <Text style={styles.floorName}>{floor.name} floor</Text>
                {floor.rooms.map((room) => (
                  <View key={room.id} style={styles.roomRow}>
                    <Text style={styles.roomNo}>{room.number}</Text>
                    <View style={styles.bedRow}>
                      {room.beds.map((bed) => {
                        const c = bedColors[bed.status];
                        return (
                          <View key={bed.id} style={[styles.bed, { backgroundColor: c.bg }]}>
                            <Text style={[styles.bedLabel, { color: c.fg }]}>{bed.label}</Text>
                            {bed.tenant_name && (
                              <Text style={[styles.tenantName, { color: c.fg }]} numberOfLines={1}>
                                {bed.tenant_name.split(" ")[0]}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
                {floor.rooms.length === 0 && <Text style={styles.propSub}>No rooms yet</Text>}
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone?: "success" | "info" | "warn";
}) {
  const bg = tone === "success" ? theme.successSoft : tone === "info" ? theme.infoSoft : tone === "warn" ? theme.warnSoft : theme.cardSoft;
  const fg = tone === "success" ? theme.success : tone === "info" ? theme.accentText : tone === "warn" ? theme.warn : theme.textLight;
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={16} color={fg} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function computeTotals(props: GridResponse["properties"]) {
  let beds = 0,
    occupied = 0,
    vacant = 0,
    maintenance = 0;
  for (const p of props)
    for (const f of p.floors)
      for (const r of f.rooms)
        for (const b of r.beds) {
          beds += 1;
          if (b.status === "occupied") occupied += 1;
          else if (b.status === "vacant") vacant += 1;
          else if (b.status === "maintenance") maintenance += 1;
        }
  return {
    beds,
    occupied,
    vacant,
    maintenance,
    occupancy_pct: beds ? Math.round((occupied / beds) * 100) : 0,
  };
}

export type GridResponse = {
  properties: {
    id: string;
    property_id: string;
    name: string;
    address: string | null;
    floors: {
      id: string;
      name: string;
      rooms: {
        id: string;
        number: string;
        sharing_type: number;
        beds: {
          id: string;
          label: string;
          rent_paise: number;
          deposit_paise: number;
          status: BedStatus;
          tenant_name: string | null;
          tenant_id: string | null;
          stay_id: string | null;
        }[];
      }[];
    }[];
  }[];
  totals: {
    beds: number;
    occupied: number;
    vacant: number;
    maintenance: number;
    occupancy_pct: number;
  };
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingTop: 4, paddingBottom: 40 },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  h1: { fontSize: 26, fontWeight: "800", color: theme.text, letterSpacing: -0.3 },
  sub: { fontSize: 12, color: theme.textLight, marginTop: 2 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: theme.border },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.success },
  liveText: { fontSize: 11, fontWeight: "700", color: theme.textLight },
  heroCard: {
    backgroundColor: theme.accent,
    borderRadius: 22,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  heroLabel: { fontSize: 12, fontWeight: "700", color: "#e4f4ff", textTransform: "uppercase", letterSpacing: 0.5 },
  heroValue: { fontSize: 34, fontWeight: "800", color: "#fff", marginTop: 2 },
  heroSub: { fontSize: 12, color: "#dcf0ff", marginTop: 2 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: "#ffffff2e", alignItems: "center", justifyContent: "center" },
  totalsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 10, alignItems: "flex-start" },
  statIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  statValue: { fontSize: 18, fontWeight: "800", color: theme.text },
  statLabel: { fontSize: 10, fontWeight: "600", color: theme.textLight },
  propertyCard: { backgroundColor: "#fff", borderRadius: 20, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.border },
  propHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  propIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" },
  propertyName: { fontSize: 16, fontWeight: "800", color: theme.text },
  propSub: { fontSize: 11, color: theme.textLight, marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: theme.chipBg, marginTop: 12, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: theme.accent },
  floorName: { fontSize: 11, color: theme.textLight, marginBottom: 8, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  roomRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  roomNo: { width: 44, fontWeight: "800", color: theme.accentText, fontSize: 12 },
  bedRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  bed: { borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, minHeight: 44, justifyContent: "center", alignItems: "center", flex: 1, minWidth: 70 },
  bedLabel: { fontWeight: "800", fontSize: 12 },
  tenantName: { fontSize: 9, marginTop: 1 },
  error: { color: theme.danger, marginBottom: 8 },
  emptyCard: { backgroundColor: "#fff", borderRadius: 20, padding: 24, alignItems: "center", gap: 6, borderWidth: 1, borderColor: theme.border },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: theme.text, marginTop: 6 },
  emptySub: { fontSize: 12, color: theme.textLight, textAlign: "center", lineHeight: 18 },
  emptyBtn: { marginTop: 10, backgroundColor: theme.accent, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  emptyBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});
