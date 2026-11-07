import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/notifications";
import { usePg } from "@/lib/pg";
import { design, getShadow } from "@/lib/design";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Sheet } from "@/components/ui";
import {
  AppBadge,
  AppText,
  EmptyState,
  Skeleton,
} from "@/components/ui-components";
import { parseFacilities } from "@/lib/theme";

type DuesSummary = {
  pending: number;
  partial: number;
  outstanding_paise: number;
};

type FilterOption = { value: string; label: string };

/** Status color for a room: green when fully occupied, amber partial, slate empty. */
function roomStatusColor(occupied: number, total: number): string {
  if (total === 0) return design.colors.textMuted;
  if (occupied >= total) return design.colors.success;
  if (occupied > 0) return design.colors.warning;
  return design.colors.textMuted;
}

function roomStatusLabel(occupied: number, total: number): string {
  if (total === 0) return "Empty";
  if (occupied >= total) return "Full";
  if (occupied > 0) return `${occupied}/${total} Occupied`;
  return "Vacant";
}

function propTotals(prop: any) {
  let beds = 0;
  let occupied = 0;
  let rooms = 0;
  for (const f of prop.floors ?? []) {
    rooms += (f.rooms ?? []).length;
    for (const r of f.rooms ?? [])
      for (const b of r.beds ?? []) {
        beds += 1;
        if (b.status === "occupied") occupied += 1;
      }
  }
  return {
    beds,
    occupied,
    rooms,
    occupancy_pct: beds ? Math.round((occupied / beds) * 100) : 0,
  };
}

function roomHitsQuery(floorObj: any, room: any, q: string, propName: string): boolean {
  return (
    propName.includes(q) ||
    String(floorObj.name ?? "").toLowerCase().includes(q) ||
    String(room.number ?? "").toLowerCase().includes(q) ||
    (room.beds ?? []).some(
      (b: any) =>
        (b.tenant_name ?? "").toLowerCase().includes(q) ||
        String(b.label ?? "").toLowerCase().includes(q)
    )
  );
}

function findMatches(q: string, allProperties: any[]): { prop: any; floor: any; room: any }[] {
  const results: { prop: any; floor: any; room: any }[] = [];
  if (!q) return results;
  for (const prop of allProperties) {
    const propName = String(prop.name ?? "").toLowerCase();
    for (const floor of prop.floors ?? [])
      for (const room of floor.rooms ?? [])
        if (roomHitsQuery(floor, room, q, propName)) results.push({ prop, floor, room });
  }
  return results;
}

function shortRupees(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(1)}Cr`;
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}k`;
  return `₹${Math.round(rupees)}`;
}

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Dashboard() {
  const { propertyId, property, properties, ready: pgReady, setPropertyId } = usePg();
  const { orgs } = useAuth();
  const router = useRouter();
  const { unread, refresh: refreshNotifications } = useNotifications();

  const [grid, setGrid] = useState<any>(null);
  const [dues, setDues] = useState<DuesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [floorId, setFloorId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean> | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  const orgName = orgs?.[0]?.name ?? "My PG";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const q = propertyId ? `?property_id=${propertyId}` : "";
      const [gridRes, duesRes] = await Promise.allSettled([
        api.get<any>("/occupancy-grid"),
        api.get<any>(`/dues${q}`),
      ]);
      if (gridRes.status === "fulfilled") setGrid(gridRes.value);
      else setError(gridRes.reason?.message ?? "Failed to load dashboard");
      if (duesRes.status === "fulfilled") setDues(duesRes.value?.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
      refreshNotifications();
    }, [load, refreshNotifications])
  );

  useEffect(() => {
    setFloorId(null);
    setRoomId(null);
  }, [propertyId]);

  const allProperties: any[] = grid?.properties ?? [];
  const propertiesToShow = propertyId
    ? allProperties.filter((p) => p.id === propertyId)
    : allProperties;
  const selectedBuilding = propertyId
    ? allProperties.find((p) => p.id === propertyId)
    : null;

  const totals = { beds: 0, occupied: 0, vacant: 0, maintenance: 0, occupancy_pct: 0 };
  for (const p of propertiesToShow)
    for (const f of p.floors ?? [])
      for (const r of f.rooms ?? [])
        for (const b of r.beds ?? []) {
          totals.beds += 1;
          if (b.status === "occupied") totals.occupied += 1;
          else if (b.status === "vacant") totals.vacant += 1;
          else if (b.status === "maintenance") totals.maintenance += 1;
        }
  totals.occupancy_pct = totals.beds
    ? Math.round((totals.occupied / totals.beds) * 100)
    : 0;

  const pendingCount = dues ? dues.pending + dues.partial : 0;
  const pendingAmount = dues?.outstanding_paise ?? 0;

  // ---------- search ----------
  const q = searchQuery.trim().toLowerCase();
  const searchActive = q.length > 0;
  const searchResults = findMatches(q, allProperties);

  // ---------- filters ----------
  const floorMatch = (f: any) => !floorId || String(f.id ?? f.name) === floorId;
  const roomMatch = (r: any) => !roomId || String(r.id ?? r.number) === roomId;
  const filteredFloors = selectedBuilding
    ? (selectedBuilding.floors ?? []).filter(floorMatch)
    : [];

  const defaultExpanded = allProperties.length <= 3;
  const isExpanded = (propId: string) =>
    expandedOverrides?.[propId] ?? defaultExpanded;
  const toggleExpanded = (propId: string) => {
    const base = expandedOverrides ?? {};
    const current = base[propId] ?? defaultExpanded;
    setExpandedOverrides({ ...base, [propId]: !current });
  };

  function openOccupancy(propId?: string) {
    if (propId && propId !== propertyId) setPropertyId(propId);
    router.push("/occupancy-map");
  }

  const tools: { label: string; subtitle: string; icon: string; route: any }[] = [
    { label: "Occupancy Map", subtitle: "Visual floor-by-floor bed grid", icon: "map-outline", route: "/occupancy-map" },
    { label: "Payment Reminders", subtitle: "Send and track rent reminders", icon: "notifications-outline", route: "/payment-reminders" },
    { label: "Security Deposits", subtitle: "Collect, hold and refund deposits", icon: "shield-checkmark-outline", route: "/security-deposits" },
    { label: "Tenant Profiles", subtitle: "Custom fields and KYC details", icon: "id-card-outline", route: "/custom-tenant-profiles" },
    { label: "Invoice Templates", subtitle: "Brand your monthly invoices", icon: "document-text-outline", route: "/invoice-templates" },
    { label: "Analytics", subtitle: "Revenue and occupancy trends", icon: "analytics-outline", route: "/analytics" },
    { label: "Requests", subtitle: "Guest bookings and change requests", icon: "swap-horizontal-outline", route: "/requests" },
    { label: "Feedback", subtitle: "See what tenants are saying", icon: "star-outline", route: "/feedback" },
  ];

  if (loading && !grid) {
    return (
      <View style={styles.container}>
        <View style={styles.hero}>
          <HeroHeader orgName={orgName} today={today} unread={unread} onBell={() => router.push("/notifications")} onAvatar={() => router.push("/(tabs)/profile")} />
          <Skeleton height={46} radius={12} style={{ marginTop: 16, backgroundColor: "rgba(255,255,255,0.16)" }} />
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          <View style={styles.statsRow}>
            <Skeleton height={112} radius={16} style={{ flex: 1 }} />
            <Skeleton height={112} radius={16} style={{ flex: 1 }} />
            <Skeleton height={112} radius={16} style={{ flex: 1 }} />
          </View>
          <Skeleton height={18} width={140} style={{ marginTop: 8 }} />
          <Skeleton height={64} radius={16} />
          <Skeleton height={64} radius={16} />
          <Skeleton height={190} radius={16} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Sticky branded header + search */}
      <View style={styles.hero}>
        <View style={styles.heroGlowA} />
        <View style={styles.heroGlowB} />
        <HeroHeader orgName={orgName} today={today} unread={unread} onBell={() => router.push("/notifications")} onAvatar={() => router.push("/(tabs)/profile")} />
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={design.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search rooms, tenants, bookings…"
            placeholderTextColor={design.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={design.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
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
        {/* Compact filters */}
        {!searchActive && (
          <View style={styles.filtersRow}>
            <FilterPill
              label="Building"
              value={propertyId ?? "__all__"}
              options={[
                { value: "__all__", label: "All buildings" },
                ...(properties ?? []).map((p) => ({ value: p.id, label: p.name })),
              ]}
              onChange={(v) => setPropertyId(v === "__all__" ? null : v)}
            />
            {selectedBuilding && (
              <FilterPill
                label="Floor"
                value={floorId ?? "__all__"}
                options={[
                  { value: "__all__", label: "All floors" },
                  ...(selectedBuilding.floors ?? []).map((f: any) => ({
                    value: String(f.id ?? f.name),
                    label: String(f.name ?? f.id),
                  })),
                ]}
                onChange={(v) => {
                  setFloorId(v === "__all__" ? null : v);
                  setRoomId(null);
                }}
              />
            )}
            {selectedBuilding && (
              <FilterPill
                label="Room"
                value={roomId ?? "__all__"}
                options={[
                  { value: "__all__", label: "All rooms" },
                  ...filteredFloors
                    .flatMap((f: any) => f.rooms ?? [])
                    .map((r: any) => ({
                      value: String(r.id ?? r.number),
                      label: `Room ${r.number ?? r.id}`,
                    })),
                ]}
                onChange={(v) => setRoomId(v === "__all__" ? null : v)}
              />
            )}
          </View>
        )}

        {!searchActive && (
          <>
            {/* KPI cards */}
            <View style={styles.statsRow}>
              <KpiCard
                tone="indigo"
                icon="people"
                label="Total Occupancy"
                value={`${totals.occupancy_pct}%`}
                sub={`${totals.occupied}/${totals.beds} Active`}
              />
              <KpiCard
                tone="slate"
                icon="key"
                label="Vacant Beds"
                value={totals.vacant}
                sub={totals.maintenance > 0 ? `${totals.maintenance} in maintenance` : "Ready to fill"}
              />
              <KpiCard
                tone="dark"
                icon="cash"
                label="Pending Rents"
                value={pendingCount}
                sub={pendingAmount > 0 ? `${shortRupees(pendingAmount)} Unpaid` : "All collected"}
              />
            </View>

            {/* Rooms & tenants */}
            <View style={styles.sectionRow}>
              <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                ROOMS & TENANTS
              </AppText>
              <TouchableOpacity onPress={() => openOccupancy(propertyId ?? undefined)} hitSlop={8}>
                <AppText variant="caption" color={design.colors.primary} style={{ fontWeight: "700" }}>
                  Open map
                </AppText>
              </TouchableOpacity>
            </View>

            {propertiesToShow.length === 0 ? (
              <EmptyState
                icon="business-outline"
                title="No buildings yet"
                subtitle="Add your first building in Setup to start mapping rooms and beds."
                actionLabel="Open Setup"
                onAction={() => router.push("/(tabs)/setup")}
              />
            ) : (
              propertiesToShow.map((prop: any) => {
                const pt = propTotals(prop);
                const expanded =
                  !!propertyId || !!(floorId || roomId) || isExpanded(prop.id);
                const floors = (prop.floors ?? []).filter(floorMatch);
                const hasRooms = floors.some(
                  (f: any) => (f.rooms ?? []).filter(roomMatch).length > 0
                );

                return (
                  <View key={prop.id} style={styles.buildingCard}>
                    <TouchableOpacity
                      activeOpacity={propertyId ? 1 : 0.85}
                      onPress={() => !propertyId && toggleExpanded(prop.id)}
                      style={styles.buildingHeader}
                    >
                      <View style={{ flex: 1 }}>
                        <AppText variant="h4" color={design.colors.textPrimary}>
                          {prop.name}
                        </AppText>
                        <AppText variant="caption" color={design.colors.textSecondary}>
                          {pt.rooms} rooms · {pt.occupied}/{pt.beds} beds filled
                        </AppText>
                      </View>
                      <View style={styles.ratioChip}>
                        <AppText variant="caption" color={design.colors.primary} style={{ fontWeight: "800" }}>
                          {pt.occupancy_pct}%
                        </AppText>
                      </View>
                      {!propertyId && (
                        <Ionicons
                          name={expanded ? "chevron-up" : "chevron-down"}
                          size={18}
                          color={design.colors.textMuted}
                        />
                      )}
                    </TouchableOpacity>

                    {/* Thin occupancy bar */}
                    <View style={styles.buildingBarTrack}>
                      <View
                        style={[
                          styles.buildingBarFill,
                          { width: `${pt.occupancy_pct}%` },
                        ]}
                      />
                    </View>

                    {expanded && (
                      <View style={styles.buildingBody}>
                        {floors.map((floor: any) => {
                          const rooms = (floor.rooms ?? []).filter(roomMatch);
                          if (rooms.length === 0) return null;
                          const floorBeds = rooms.reduce(
                            (n: number, r: any) => n + (r.beds ?? []).length,
                            0
                          );
                          const floorOccupied = rooms.reduce(
                            (n: number, r: any) =>
                              n + (r.beds ?? []).filter((b: any) => b.status === "occupied").length,
                            0
                          );
                          return (
                            <View key={floor.id ?? floor.name} style={styles.floorBlock}>
                              <View style={styles.floorRow}>
                                <AppText
                                  variant="label"
                                  color={design.colors.textMuted}
                                  style={styles.floorLabel}
                                >
                                  {String(floor.name ?? "").toUpperCase()}
                                </AppText>
                                <AppText variant="caption" color={design.colors.textMuted}>
                                  {floorOccupied}/{floorBeds} beds
                                </AppText>
                              </View>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.roomScroll}
                              >
                                {rooms.map((room: any) => (
                                  <RoomCard
                                    key={room.id ?? room.number}
                                    room={room}
                                    onPress={() => openOccupancy(prop.id)}
                                  />
                                ))}
                              </ScrollView>
                            </View>
                          );
                        })}
                        {!hasRooms && (
                          <AppText variant="bodySmall" color={design.colors.textMuted}>
                            No rooms match the selected filters.
                          </AppText>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}

            {/* Quick actions */}
            <View style={styles.sectionRow}>
              <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                QUICK ACTIONS
              </AppText>
              <TouchableOpacity onPress={() => setToolsOpen(true)} hitSlop={8}>
                <AppText variant="caption" color={design.colors.primary} style={{ fontWeight: "700" }}>
                  All tools
                </AppText>
              </TouchableOpacity>
            </View>
            <View style={styles.quickRow}>
              <QuickAction
                icon="person-add"
                label="Add Tenant"
                onPress={() => router.push("/(tabs)/tenants")}
              />
              <QuickAction
                icon="cash"
                label="Collect Rent"
                onPress={() => router.push("/(tabs)/dues")}
              />
              <QuickAction
                icon="map"
                label="Occupancy"
                onPress={() => openOccupancy(propertyId ?? undefined)}
              />
              <QuickAction
                icon="apps"
                label="All Tools"
                onPress={() => setToolsOpen(true)}
              />
            </View>
          </>
        )}

        {/* Search results */}
        {searchActive && (
          <>
            <View style={styles.sectionRow}>
              <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
                SEARCH RESULTS
              </AppText>
              <AppText variant="caption" color={design.colors.textMuted}>
                {searchResults.length} room{searchResults.length === 1 ? "" : "s"}
              </AppText>
            </View>
            {searchResults.length === 0 ? (
              <EmptyState
                icon="search-outline"
                title="No matches"
                subtitle={`Nothing found for “${searchQuery.trim()}”. Try a building, floor, room number or tenant name.`}
              />
            ) : (
              <View style={styles.searchGrid}>
                {searchResults.map(({ prop, floor, room }) => (
                  <RoomCard
                    key={`${prop.id}-${floor.id ?? floor.name}-${room.id ?? room.number}`}
                    room={room}
                    context={`${prop.name} · ${floor.name}`}
                    style={styles.searchCard}
                    onPress={() => openOccupancy(prop.id)}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {/* Advanced tools launcher */}
      <Sheet visible={toolsOpen} onClose={() => setToolsOpen(false)}>
        <AppText variant="h3" color={design.colors.textPrimary}>
          All tools
        </AppText>
        <AppText variant="bodySmall" color={design.colors.textSecondary} style={{ marginBottom: 12 }}>
          Everything else, one tap away.
        </AppText>
        {tools.map((tool) => (
          <TouchableOpacity
            key={tool.label}
            style={styles.toolRow}
            activeOpacity={0.85}
            onPress={() => {
              setToolsOpen(false);
              router.push(tool.route);
            }}
          >
            <View style={styles.toolIcon}>
              <Ionicons name={tool.icon as any} size={20} color={design.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
                {tool.label}
              </AppText>
              <AppText variant="caption" color={design.colors.textSecondary}>
                {tool.subtitle}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={design.colors.textMuted} />
          </TouchableOpacity>
        ))}
      </Sheet>
    </View>
  );
}

// ---------- sub-components ----------

function HeroHeader({
  orgName,
  today,
  unread,
  onBell,
  onAvatar,
}: {
  orgName: string;
  today: string;
  unread: number;
  onBell: () => void;
  onAvatar: () => void;
}) {
  return (
    <View style={styles.heroTop}>
      <View style={{ flex: 1 }}>
        <View style={styles.brandRow}>
          <Ionicons name="bed" size={13} color="rgba(255,255,255,0.9)" />
          <Text style={styles.brandLabel}>PG MANAGER</Text>
        </View>
        <AppText variant="h2" color="#fff" numberOfLines={1}>
          {orgName}
        </AppText>
        <AppText variant="caption" color="rgba(255,255,255,0.72)">
          {today}
        </AppText>
      </View>
      <TouchableOpacity style={styles.heroIconBtn} onPress={onBell} activeOpacity={0.85}>
        <Ionicons name="notifications-outline" size={21} color="#fff" />
        {unread > 0 && (
          <View style={styles.notifBadge}>
            <Text style={styles.notifBadgeText}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.heroAvatar} onPress={onAvatar} activeOpacity={0.85}>
        <Text style={styles.heroAvatarText}>{initials(orgName) || "PG"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function KpiCard({
  tone,
  icon,
  label,
  value,
  sub,
}: {
  tone: "indigo" | "slate" | "dark";
  icon: string;
  label: string;
  value: string | number;
  sub: string;
}) {
  const bg =
    tone === "indigo"
      ? design.colors.primary
      : tone === "slate"
        ? design.colors.slate
        : design.colors.slateDark;
  return (
    <View style={[styles.kpiCard, { backgroundColor: bg }]}>
      <View style={styles.kpiIcon}>
        <Ionicons name={icon as any} size={15} color="#fff" />
      </View>
      <Text style={styles.kpiLabel} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.kpiSub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

function RoomCard({
  room,
  context,
  style,
  onPress,
}: {
  room: any;
  context?: string;
  style?: any;
  onPress?: () => void;
}) {
  const beds = room.beds ?? [];
  const occupied = beds.filter((b: any) => b.status === "occupied").length;
  const color = roomStatusColor(occupied, beds.length);
  const pct = beds.length ? Math.round((occupied / beds.length) * 100) : 0;
  const facilities = parseFacilities(room.facilities);
  const hasAc = facilities.includes("ac");
  const tenants = beds
    .filter((b: any) => b.status === "occupied" && b.tenant_name)
    .map((b: any) => b.tenant_name)
    .join(" • ");
  const statusLabel = roomStatusLabel(occupied, beds.length);
  const statusVariant =
    beds.length > 0 && occupied >= beds.length
      ? "success"
      : occupied > 0
        ? "warning"
        : "neutral";

  return (
    <TouchableOpacity
      style={[styles.roomCard, style]}
      activeOpacity={0.88}
      onPress={onPress}
    >
      {context && (
        <AppText variant="caption" color={design.colors.textMuted} numberOfLines={1} style={{ marginBottom: 2 }}>
          {context}
        </AppText>
      )}
      <View style={styles.roomTop}>
        <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "800" }} numberOfLines={1}>
          Room {room.number ?? room.id}
        </AppText>
        <Ionicons name="bed-outline" size={15} color={design.colors.textMuted} />
      </View>
      <AppText variant="caption" color={design.colors.textSecondary} style={{ marginTop: 0 }}>
        {beds.length}-Seater
      </AppText>
      <View style={styles.roomTags}>
        <AppBadge variant={statusVariant}>{statusLabel}</AppBadge>
        {hasAc ? <AppBadge variant="neutral">AC</AppBadge> : null}
        {!hasAc && facilities.length > 0 ? <AppBadge variant="neutral">Non-AC</AppBadge> : null}
      </View>
      <View style={styles.roomProgressTrack}>
        <View style={[styles.roomProgressFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <AppText
        variant="caption"
        color={tenants ? design.colors.textSecondary : design.colors.textMuted}
        numberOfLines={2}
        style={{ minHeight: 22, fontSize: 10, lineHeight: 13 }}
      >
        {tenants || "(Vacant)"}
      </AppText>
    </TouchableOpacity>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quickItem} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.quickCircle}>
        <Ionicons name={icon as any} size={21} color={design.colors.primary} />
      </View>
      <AppText variant="caption" color={design.colors.textSecondary} style={styles.quickLabel} numberOfLines={1}>
        {label}
      </AppText>
    </TouchableOpacity>
  );
}

function FilterPill({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={styles.filterPill} onPress={() => setOpen(true)} activeOpacity={0.85}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={design.colors.textMuted} style={{ fontSize: 10, fontWeight: "700" }}>
            {label.toUpperCase()}
          </AppText>
          <AppText variant="caption" color={design.colors.textPrimary} numberOfLines={1} style={{ fontWeight: "700" }}>
            {current?.label ?? "Select"}
          </AppText>
        </View>
        <Ionicons name="chevron-down" size={14} color={design.colors.textMuted} />
      </TouchableOpacity>

      <Sheet visible={open} onClose={() => setOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={{ marginBottom: 10 }}>
          {label}
        </AppText>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.filterOption, active && styles.filterOptionActive]}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <AppText variant="body" color={design.colors.textPrimary} style={{ flex: 1, fontWeight: active ? "700" : "500" }} numberOfLines={1}>
                {option.label}
              </AppText>
              {active && <Ionicons name="checkmark-circle" size={20} color={design.colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 110 },

  // Hero
  hero: {
    backgroundColor: design.colors.primary,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: "hidden",
  },
  heroGlowA: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -60,
    right: -40,
  },
  heroGlowB: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: -30,
    left: -20,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
  brandLabel: { color: "rgba(255,255,255,0.82)", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  heroIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarText: { color: design.colors.primary, fontSize: 14, fontWeight: "800" },
  notifBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: design.colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: design.colors.primary,
  },
  notifBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800", lineHeight: 11 },
  searchBar: {
    marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...getShadow("sm"),
  },
  searchInput: { flex: 1, color: design.colors.textPrimary, fontSize: 14, paddingVertical: 10 },

  // Filters
  filtersRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  filterPill: {
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: design.colors.surface,
    borderWidth: 1,
    borderColor: design.colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    ...getShadow("sm"),
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  filterOptionActive: { backgroundColor: design.colors.primaryLight },

  // KPI cards
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 22 },
  kpiCard: {
    flex: 1,
    minHeight: 112,
    borderRadius: 16,
    padding: 12,
    ...getShadow("md"),
  },
  kpiIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  kpiLabel: { color: "rgba(255,255,255,0.72)", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  kpiValue: { color: "#fff", fontSize: 24, fontWeight: "800", letterSpacing: -0.4, marginTop: 2 },
  kpiSub: { color: "rgba(255,255,255,0.68)", fontSize: 10, fontWeight: "600", marginTop: 2 },

  // Section headers
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },

  // Building + rooms
  buildingCard: {
    backgroundColor: design.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    padding: 14,
    marginBottom: 12,
    ...getShadow("sm"),
  },
  buildingHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  ratioChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: design.colors.primaryLight,
  },
  buildingBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: design.colors.surfaceVariant,
    overflow: "hidden",
    marginTop: 12,
  },
  buildingBarFill: { height: 4, borderRadius: 2, backgroundColor: design.colors.primary },
  buildingBody: { marginTop: 12, gap: 12 },
  floorBlock: { gap: 7 },
  floorRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2 },
  floorLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  roomScroll: { gap: 8, paddingRight: 4 },
  roomCard: {
    width: 148,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: design.colors.surface,
    padding: 10,
    gap: 2,
  },
  roomTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 },
  roomTags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2, marginBottom: 2 },
  roomProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: design.colors.surfaceVariant,
    overflow: "hidden",
    marginTop: 1,
    marginBottom: 2,
  },
  roomProgressFill: { height: 4, borderRadius: 2 },
  searchGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  searchCard: { width: "48.3%" },

  // Quick actions
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 8,
  },
  quickItem: { flex: 1, alignItems: "center", gap: 7, paddingVertical: 4 },
  quickCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { textAlign: "center", fontSize: 11, fontWeight: "600" },

  // Tools sheet
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },

  error: { color: design.colors.danger, marginTop: 16, textAlign: "center", fontSize: 13 },
});
