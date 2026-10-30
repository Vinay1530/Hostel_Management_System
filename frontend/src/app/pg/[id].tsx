import { api, rupeesFromPaise } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";

type Property = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  locality: string | null;
  gate_timing: string | null;
  food_rules: string | null;
  visitor_rules: string | null;
  facilities: string | null;
  owner_name: string | null;
  contact_phone: string | null;
  total_rooms: number;
  total_beds: number;
  occupied_beds: number;
  vacant_beds: number;
};

type RoomSummary = {
  id: string;
  number: string;
  floor: string;
  sharing_type: number;
  total_beds: number;
  occupied_beds: number;
  status: "vacant" | "partially_filled" | "full";
};

type RoomDetail = {
  id: string;
  property_id: string;
  number: string;
  floor: string;
  sharing_type: number;
  facilities: string | null;
  beds: {
    id: string;
    label: string;
    rent_paise: number;
    deposit_paise: number;
    status: string;
    tenant: { tenant_id: string; tenant_name: string; move_in_date: string } | null;
  }[];
};

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function PgDetails() {
  const { id, roomId: routeRoomId } = useLocalSearchParams<{ id: string; roomId?: string }>();
  const roomId = Array.isArray(routeRoomId) ? routeRoomId[0] : routeRoomId;
  const router = useRouter();
  const { role } = useAuth();
  const [property, setProperty] = useState<Property | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [roomCache, setRoomCache] = useState<Record<string, RoomDetail>>({});
  const [roomLoading, setRoomLoading] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [propertyData, roomData] = await Promise.all([
        api.get<Property>(`/properties/${id}`),
        api.get<RoomSummary[]>(`/properties/${id}/rooms`),
      ]);
      setProperty(propertyData);
      setRooms(roomData);
      if (roomId && roomData.some((room) => room.id === roomId)) {
        setExpanded(roomId);
        const detail = await api.get<RoomDetail>(`/rooms/${roomId}`);
        setRoomCache((current) => ({ ...current, [roomId]: detail }));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load PG details");
    } finally {
      setBusy(false);
    }
  }, [id, roomId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleRoom(room: RoomSummary) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expanded === room.id) {
      setExpanded(null);
      return;
    }
    setExpanded(room.id);
    if (roomCache[room.id]) return;
    setRoomLoading(room.id);
    try {
      const detail = await api.get<RoomDetail>(`/rooms/${room.id}`);
      setRoomCache((current) => ({ ...current, [room.id]: detail }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load room details");
    } finally {
      setRoomLoading(null);
    }
  }

  if (busy && !property) {
    return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;
  }

  const grouped = rooms.reduce<Record<string, RoomSummary[]>>((groups, room) => {
    (groups[room.floor] ??= []).push(room);
    return groups;
  }, {});

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{property?.name ?? "PG details"}</Text>
          <Text style={styles.subtitle}>{[property?.locality, property?.city].filter(Boolean).join(", ")}</Text>
        </View>
        {(role === "owner" || role === "manager") && (
          <Pressable style={styles.manageButton} onPress={() => router.push(`/property/${id}`)}>
            <Text style={styles.manageText}>Manage</Text>
          </Pressable>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {property && (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Property</Text>
            <Info label="Full address" value={property.address} />
            <Info label="Locality" value={property.locality} />
            <Info label="City" value={property.city} />
            <Info label="Owner / manager" value={property.owner_name} />
            <Info label="Contact" value={property.contact_phone} />
            <View style={styles.stats}>
              <Stat label="Rooms" value={property.total_rooms} />
              <Stat label="Beds" value={property.total_beds} />
              <Stat label="Occupied" value={property.occupied_beds} />
              <Stat label="Vacant" value={property.vacant_beds} />
            </View>
            <Text style={styles.sectionTitle}>Facilities</Text>
            <Text style={styles.body}>{property.facilities?.split(",").filter(Boolean).join(" · ") || "Not specified"}</Text>
            <Text style={styles.sectionTitle}>Rules</Text>
            <Info label="Gate timing" value={property.gate_timing} />
            <Info label="Food" value={property.food_rules} />
            <Info label="Visitors" value={property.visitor_rules} />
          </View>

          <Text style={styles.roomsHeading}>Rooms</Text>
          {Object.entries(grouped).map(([floor, floorRooms]) => (
            <View key={floor}>
              <Text style={styles.floorHeading}>{floor} floor</Text>
              {floorRooms.map((room) => {
                const detail = roomCache[room.id];
                const isExpanded = expanded === room.id;
                return (
                  <View key={room.id} style={styles.roomCard}>
                    <Pressable style={styles.roomHeader} onPress={() => toggleRoom(room)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.roomTitle}>Room {room.number} · {room.sharing_type}-sharing</Text>
                        <Text style={styles.roomSubtitle}>{room.occupied_beds}/{room.total_beds} occupied</Text>
                      </View>
                      <StatusBadge status={room.status} />
                      <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={theme.textLight} />
                    </Pressable>
                    {isExpanded && (
                      <View style={styles.expanded}>
                        {roomLoading === room.id && <ActivityIndicator color={theme.accent} />}
                        {detail && (
                          <>
                            <Info label="Floor" value={detail.floor} />
                            <Info label="Amenities" value={detail.facilities?.split(",").filter(Boolean).join(" · ") || "None"} />
                            {detail.beds.map((bed) => {
                              const tenant = bed.tenant;
                              return (
                                <View key={bed.id} style={styles.bedRow}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.bedTitle}>Bed {bed.label}</Text>
                                    {tenant ? (
                                      <Pressable onPress={() => router.push({ pathname: "/tenant-profile/[id]", params: { id: tenant.tenant_id } })}>
                                        <Text style={styles.tenantLink}>{tenant.tenant_name}</Text>
                                        <Text style={styles.roomSubtitle}>Moved in {tenant.move_in_date}</Text>
                                      </Pressable>
                                    ) : (
                                      <Text style={styles.roomSubtitle}>{bed.status === "maintenance" ? "Maintenance" : "Vacant"}</Text>
                                    )}
                                  </View>
                                  <View style={{ alignItems: "flex-end" }}>
                                    <Text style={styles.bedPrice}>{rupeesFromPaise(bed.rent_paise)}/bed</Text>
                                    <Text style={styles.roomSubtitle}>Deposit {rupeesFromPaise(bed.deposit_paise)}</Text>
                                  </View>
                                </View>
                              );
                            })}
                          </>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
          {rooms.length === 0 && <Text style={styles.body}>No rooms have been added yet.</Text>}
        </>
      )}
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.body}>{value}</Text></View>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function StatusBadge({ status }: { status: RoomSummary["status"] }) {
  const color = status === "full" ? theme.success : status === "vacant" ? theme.textLight : theme.warn;
  const label = status === "partially_filled" ? "Partial" : status === "full" ? "Full" : "Vacant";
  return <View style={[styles.badge, { backgroundColor: `${color}20` }]}><Text style={[styles.badgeText, { color }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingTop: 16, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  title: { color: theme.text, fontSize: 22, fontWeight: "800" },
  subtitle: { color: theme.textLight, fontSize: 12, marginTop: 3 },
  manageButton: { backgroundColor: theme.accent, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999 },
  manageText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  error: { color: theme.danger, paddingBottom: 10 },
  card: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 15, marginBottom: 20 },
  sectionTitle: { color: theme.textLight, fontSize: 11, fontWeight: "800", textTransform: "uppercase", marginTop: 12, marginBottom: 5 },
  infoRow: { marginVertical: 4 },
  infoLabel: { color: theme.textLight, fontSize: 11, marginBottom: 2 },
  body: { color: theme.text, fontSize: 13 },
  stats: { flexDirection: "row", justifyContent: "space-between", marginVertical: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border },
  stat: { alignItems: "center" },
  statValue: { color: theme.text, fontWeight: "800", fontSize: 17 },
  statLabel: { color: theme.textLight, fontSize: 10, marginTop: 2 },
  roomsHeading: { color: theme.text, fontSize: 18, fontWeight: "800", marginBottom: 8 },
  floorHeading: { color: theme.textLight, fontSize: 12, fontWeight: "800", marginTop: 12, marginBottom: 7 },
  roomCard: { backgroundColor: "#fff", borderWidth: 1, borderColor: theme.border, borderRadius: 15, marginBottom: 8, overflow: "hidden" },
  roomHeader: { minHeight: 65, flexDirection: "row", alignItems: "center", gap: 9, padding: 12 },
  roomTitle: { color: theme.text, fontSize: 14, fontWeight: "800" },
  roomSubtitle: { color: theme.textLight, fontSize: 11, marginTop: 3 },
  badge: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800" },
  expanded: { paddingHorizontal: 13, paddingBottom: 10, borderTopWidth: 1, borderColor: theme.border },
  bedRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderTopWidth: 1, borderColor: theme.border },
  bedTitle: { color: theme.text, fontWeight: "800", fontSize: 12 },
  tenantLink: { color: theme.accentText, fontWeight: "700", fontSize: 12, marginTop: 3 },
  bedPrice: { color: theme.text, fontSize: 11, fontWeight: "700" },
});
