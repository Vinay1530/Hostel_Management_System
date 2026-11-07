import { api, rupeesFromPaise } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { design, getShadow } from "@/lib/design";
import { facilityIcon, facilityLabel, parseFacilities, roleAccents } from "@/lib/theme";
import { AppBadge, AppText, EmptyState } from "@/components/ui-components";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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

const accent = roleAccents.manager;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function roomStatusMeta(status: RoomSummary["status"]): {
  variant: "success" | "warning" | "neutral";
  label: string;
} {
  if (status === "full") return { variant: "success", label: "Full" };
  if (status === "partially_filled") return { variant: "warning", label: "Partial" };
  return { variant: "neutral", label: "Vacant" };
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
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={accent.accent} />
      </View>
    );
  }

  const grouped = rooms.reduce<Record<string, RoomSummary[]>>((groups, room) => {
    (groups[room.floor] ??= []).push(room);
    return groups;
  }, {});

  const facilityKeys = parseFacilities(property?.facilities);

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.eyebrow}>PG DETAILS</Text>
            <AppText variant="h2" color="#fff" numberOfLines={1}>
              {property?.name ?? "PG details"}
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.74)" numberOfLines={1}>
              {[property?.locality, property?.city].filter(Boolean).join(", ") ||
                "Location not set"}
            </AppText>
          </View>
          {(role === "owner" || role === "manager") && (
            <TouchableOpacity
              style={styles.manageBtn}
              onPress={() => router.push(`/property/${id}`)}
              accessibilityLabel="Manage property"
            >
              <Ionicons name="create-outline" size={16} color={accent.accentDark} />
              <Text style={styles.manageText}>Manage</Text>
            </TouchableOpacity>
          )}
        </View>

        {property && (
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{property.total_rooms}</Text>
              <Text style={styles.heroStatLabel}>ROOMS</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{property.total_beds}</Text>
              <Text style={styles.heroStatLabel}>BEDS</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{property.occupied_beds}</Text>
              <Text style={styles.heroStatLabel}>OCCUPIED</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{property.vacant_beds}</Text>
              <Text style={styles.heroStatLabel}>VACANT</Text>
            </View>
          </View>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {error && <Text style={styles.error}>{error}</Text>}
        {!property && !error && (
          <EmptyState
            icon="business-outline"
            title="PG not found"
            subtitle="This property may have been removed."
            actionLabel="Retry"
            onAction={load}
          />
        )}

        {property && (
          <>
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}>
                  <Ionicons name="business-outline" size={17} color={accent.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h4" color={design.colors.textPrimary}>
                    Building
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary}>
                    Address and contact
                  </AppText>
                </View>
              </View>
              <View style={styles.detailList}>
                <Info label="Full address" value={property.address} />
                <Info label="Locality" value={property.locality} />
                <Info label="City" value={property.city} />
                <Info label="Owner / manager" value={property.owner_name} />
                <Info label="Contact" value={property.contact_phone} last />
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardIcon}>
                  <Ionicons name="sparkles-outline" size={17} color={accent.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h4" color={design.colors.textPrimary}>
                    Facilities & rules
                  </AppText>
                  <AppText variant="caption" color={design.colors.textSecondary}>
                    What residents can expect
                  </AppText>
                </View>
              </View>

              <View style={styles.chipWrap}>
                {facilityKeys.length > 0 ? (
                  facilityKeys.map((key) => (
                    <View key={key} style={styles.facilityChip}>
                      <Ionicons
                        name={facilityIcon(key) as any}
                        size={13}
                        color={accent.accent}
                      />
                      <Text style={styles.facilityText}>{facilityLabel(key)}</Text>
                    </View>
                  ))
                ) : (
                  <AppText variant="caption" color={design.colors.textMuted}>
                    No facilities listed yet.
                  </AppText>
                )}
              </View>

              <View style={styles.detailList}>
                <Info label="Gate timing" value={property.gate_timing} />
                <Info label="Food rules" value={property.food_rules} />
                <Info label="Visitor rules" value={property.visitor_rules} last />
              </View>
            </View>

            <View style={styles.roomsHead}>
              <AppText variant="h4" color={design.colors.textPrimary}>
                Rooms
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                {rooms.length} total · tap to expand
              </AppText>
            </View>

            {rooms.length === 0 && (
              <View style={styles.inlineEmpty}>
                <Ionicons name="bed-outline" size={16} color={design.colors.textMuted} />
                <AppText variant="bodySmall" color={design.colors.textSecondary} style={{ flex: 1 }}>
                  No rooms have been added yet.
                </AppText>
              </View>
            )}

            {Object.entries(grouped).map(([floor, floorRooms]) => (
              <View key={floor} style={{ gap: 7 }}>
                <View style={styles.floorHead}>
                  <View style={styles.floorDot} />
                  <AppText variant="label" color={design.colors.textSecondary}>
                    {floor.toUpperCase()} FLOOR
                  </AppText>
                </View>
                {floorRooms.map((room) => {
                  const detail = roomCache[room.id];
                  const isExpanded = expanded === room.id;
                  const meta = roomStatusMeta(room.status);
                  return (
                    <View key={room.id} style={styles.roomCard}>
                      <TouchableOpacity
                        style={styles.roomHeader}
                        onPress={() => toggleRoom(room)}
                        activeOpacity={0.85}
                      >
                        <View style={styles.roomIcon}>
                          <Text style={styles.roomIconText}>{room.number}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <AppText
                            variant="bodySmall"
                            color={design.colors.textPrimary}
                            style={{ fontWeight: "800" }}
                            numberOfLines={1}
                          >
                            Room {room.number} · {room.sharing_type}-sharing
                          </AppText>
                          <AppText variant="caption" color={design.colors.textMuted}>
                            {room.occupied_beds}/{room.total_beds} occupied
                          </AppText>
                        </View>
                        <AppBadge variant={meta.variant}>{meta.label}</AppBadge>
                        <Ionicons
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={17}
                          color={design.colors.textMuted}
                        />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.expanded}>
                          {roomLoading === room.id && (
                            <ActivityIndicator color={accent.accent} style={{ marginVertical: 8 }} />
                          )}
                          {detail && (
                            <>
                              <View style={styles.amenityRow}>
                                <Ionicons
                                  name="sparkles-outline"
                                  size={13}
                                  color={design.colors.textMuted}
                                />
                                <AppText
                                  variant="caption"
                                  color={design.colors.textSecondary}
                                  style={{ flex: 1 }}
                                >
                                  {parseFacilities(detail.facilities)
                                    .map((key) => facilityLabel(key))
                                    .join(" · ") || "No room-specific amenities"}
                                </AppText>
                              </View>

                              {detail.beds.map((bed, index) => {
                                const tenant = bed.tenant;
                                return (
                                  <View
                                    key={bed.id}
                                    style={[
                                      styles.bedRow,
                                      index > 0 && { borderTopWidth: 1, borderTopColor: design.colors.border },
                                    ]}
                                  >
                                    <View
                                      style={[
                                        styles.bedDot,
                                        {
                                          backgroundColor:
                                            bed.status === "maintenance"
                                              ? "#DC2626"
                                              : tenant
                                                ? accent.accent
                                                : "#15803D",
                                        },
                                      ]}
                                    />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                      <AppText
                                        variant="bodySmall"
                                        color={design.colors.textPrimary}
                                        style={{ fontWeight: "800" }}
                                      >
                                        Bed {bed.label}
                                      </AppText>
                                      {tenant ? (
                                        <TouchableOpacity
                                          onPress={() =>
                                            router.push({
                                              pathname: "/tenant-profile/[id]",
                                              params: { id: tenant.tenant_id },
                                            })
                                          }
                                          hitSlop={4}
                                        >
                                          <Text style={styles.tenantLink}>{tenant.tenant_name}</Text>
                                          <AppText variant="caption" color={design.colors.textMuted}>
                                            Moved in {tenant.move_in_date}
                                          </AppText>
                                        </TouchableOpacity>
                                      ) : (
                                        <AppText variant="caption" color={design.colors.textMuted}>
                                          {bed.status === "maintenance" ? "Maintenance" : "Available"}
                                        </AppText>
                                      )}
                                    </View>
                                    <View style={{ alignItems: "flex-end" }}>
                                      <AppText
                                        variant="bodySmall"
                                        color={design.colors.textPrimary}
                                        style={{ fontWeight: "800" }}
                                      >
                                        {rupeesFromPaise(bed.rent_paise)}/bed
                                      </AppText>
                                      <AppText variant="caption" color={design.colors.textMuted}>
                                        Deposit {rupeesFromPaise(bed.deposit_paise)}
                                      </AppText>
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
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Info({
  label,
  value,
  last,
}: {
  label: string;
  value: string | null;
  last?: boolean;
}) {
  if (!value) return null;
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <AppText variant="caption" color={design.colors.textSecondary}>
        {label}
      </AppText>
      <AppText
        variant="bodySmall"
        color={design.colors.textPrimary}
        style={{ fontWeight: "700", maxWidth: "62%", textAlign: "right" }}
        numberOfLines={3}
      >
        {value}
      </AppText>
    </View>
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
    backgroundColor: accent.accent,
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
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 38,
    paddingHorizontal: 11,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  manageText: { color: accent.accentDark, fontSize: 12, fontWeight: "800" },

  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatValue: { color: "#fff", fontSize: 17, fontWeight: "800" },
  heroStatLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginTop: 1,
  },
  heroStatDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.18)" },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 50, gap: 12 },
  error: { color: design.colors.danger, fontSize: 12 },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 14,
    ...getShadow("sm"),
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  cardIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  detailList: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: design.colors.border,
  },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  facilityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: accent.accentSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  facilityText: { color: accent.accentDark, fontSize: 10, fontWeight: "800" },

  roomsHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  floorHead: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  floorDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: accent.accent },

  roomCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.colors.border,
    overflow: "hidden",
    ...getShadow("sm"),
  },
  roomHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 11,
  },
  roomIcon: {
    width: 44,
    height: 40,
    borderRadius: 10,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  roomIconText: { color: accent.accentDark, fontSize: 13, fontWeight: "800" },
  expanded: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
    backgroundColor: "#FCFDFF",
  },
  amenityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: design.colors.border,
  },
  bedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  bedDot: { width: 7, height: 7, borderRadius: 4 },
  tenantLink: {
    color: accent.accent,
    fontWeight: "800",
    fontSize: 12,
    marginTop: 2,
  },

  inlineEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: design.colors.border,
  },
});
