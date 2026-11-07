import { api, rupeesFromPaise } from "@/lib/api";
import { design, getShadow } from "@/lib/design";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AppText,
  EmptyState,
  Skeleton,
} from "@/components/ui-components";

type OccupancyRate = {
  property_id: string;
  property_name: string;
  total_beds: number;
  occupied_beds: number;
  occupancy_rate: number;
};

type IncomeExpenses = {
  billed_paise: number;
  collected_paise: number;
  outstanding_paise: number;
  invoice_count: number;
};

type TenantRow = {
  id: string;
  full_name: string;
  stays: { active: boolean; start_date: string | null }[];
};

type DueRow = {
  period_month: string;
  balance_paise: number;
  status: string;
};

function monthsSince(iso: string | null): number | null {
  if (!iso) return null;
  const start = new Date(iso);
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  const days = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 0) return 0;
  return days / 30.44;
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString("en-IN", { month: "short" });
}

export default function Analytics() {
  const router = useRouter();
  const [occupancy, setOccupancy] = useState<OccupancyRate[] | null>(null);
  const [income, setIncome] = useState<IncomeExpenses | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [dues, setDues] = useState<DueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const [occRes, incRes, tenantRes, duesRes] = await Promise.allSettled([
        api.get<OccupancyRate[]>("/analytics/occupancy-rate"),
        api.get<IncomeExpenses>("/analytics/income-expenses"),
        api.get<TenantRow[]>("/tenants"),
        api.get<{ rows: DueRow[] }>("/dues"),
      ]);
      if (occRes.status === "fulfilled") setOccupancy(occRes.value);
      if (incRes.status === "fulfilled") setIncome(incRes.value);
      if (tenantRes.status === "fulfilled") setTenants(tenantRes.value);
      if (duesRes.status === "fulfilled") setDues(duesRes.value.rows ?? []);
      if (occRes.status === "rejected" && incRes.status === "rejected")
        setError("Failed to load analytics");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const totalBeds = occupancy?.reduce((sum, o) => sum + o.total_beds, 0) ?? 0;
  const totalOccupied = occupancy?.reduce((sum, o) => sum + o.occupied_beds, 0) ?? 0;
  const avgOccupancy = totalBeds > 0 ? Math.round((totalOccupied / totalBeds) * 100) : 0;

  const collectionRate =
    income && income.billed_paise > 0
      ? Math.round((income.collected_paise / income.billed_paise) * 100)
      : 0;

  const avgStayMonths = useMemo(() => {
    const values = tenants
      .map((t) => {
        const active = t.stays?.find((s) => s.active);
        return active ? monthsSince(active.start_date) : null;
      })
      .filter((v): v is number => v != null);
    if (values.length === 0) return null;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }, [tenants]);

  const pendingTrend = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of dues) {
      if (row.status === "paid" || row.status === "void") continue;
      if (row.balance_paise <= 0) continue;
      map.set(row.period_month, (map.get(row.period_month) ?? 0) + row.balance_paise);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6);
  }, [dues]);

  const maxPending = Math.max(1, ...pendingTrend.map(([, v]) => v));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={design.colors.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={design.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <AppText variant="h2" color={design.colors.textPrimary}>
            Analytics
          </AppText>
          <AppText variant="bodySmall" color={design.colors.textSecondary}>
            Occupancy, revenue and collection health
          </AppText>
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.push("/transactions")}>
          <Ionicons name="wallet-outline" size={19} color={design.colors.primary} />
        </TouchableOpacity>
      </View>

      {loading && !occupancy && !income && (
        <View style={{ gap: 12 }}>
          <Skeleton height={150} radius={20} />
          <View style={styles.kpiRow}>
            <Skeleton height={100} radius={16} style={{ flex: 1 }} />
            <Skeleton height={100} radius={16} style={{ flex: 1 }} />
          </View>
          <Skeleton height={130} radius={16} />
          <Skeleton height={180} radius={16} />
        </View>
      )}

      {!loading || occupancy || income ? (
        <>
          {/* Occupancy hero */}
          <View style={styles.heroCard}>
            <View style={styles.heroGlowA} />
            <View style={styles.heroGlowB} />
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroLabel}>OCCUPANCY RATE</Text>
                <Text style={styles.heroValue}>
                  {avgOccupancy}
                  <Text style={styles.heroPct}>%</Text>
                </Text>
                <Text style={styles.heroSub}>
                  {totalOccupied} of {totalBeds} beds filled
                </Text>
              </View>
              <View style={styles.heroIcon}>
                <Ionicons name="pie-chart" size={26} color="#fff" />
              </View>
            </View>
            <View style={styles.heroTrack}>
              <View style={[styles.heroFill, { width: `${avgOccupancy}%` }]} />
            </View>
            <View style={styles.heroFooter}>
              <View style={styles.heroFooterItem}>
                <Ionicons name="bed" size={13} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroFooterText}>{totalOccupied} occupied</Text>
              </View>
              <View style={styles.heroFooterItem}>
                <Ionicons name="bed-outline" size={13} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroFooterText}>{totalBeds - totalOccupied} vacant</Text>
              </View>
              <View style={styles.heroFooterItem}>
                <Ionicons name="business-outline" size={13} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroFooterText}>{occupancy?.length ?? 0} buildings</Text>
              </View>
            </View>
          </View>

          {/* KPI row */}
          <View style={styles.kpiRow}>
            <KpiTile
              label="Collected"
              value={rupeesFromPaise(income?.collected_paise ?? 0)}
              icon="cash"
              tint={design.colors.success}
              tintBg={design.colors.successLight}
              sub={`${collectionRate}% of billed`}
            />
            <KpiTile
              label="Outstanding"
              value={rupeesFromPaise(income?.outstanding_paise ?? 0)}
              icon="alert-circle"
              tint={design.colors.danger}
              tintBg={design.colors.dangerLight}
              sub={`${income?.invoice_count ?? 0} invoices`}
            />
          </View>

          <View style={styles.kpiRow}>
            <KpiTile
              label="Avg. stay"
              value={
                avgStayMonths == null
                  ? "—"
                  : avgStayMonths >= 12
                    ? `${(avgStayMonths / 12).toFixed(1)} yrs`
                    : `${avgStayMonths.toFixed(1)} mo`
              }
              icon="hourglass"
              tint={design.colors.primary}
              tintBg={design.colors.primaryLight}
              sub={`${tenants.filter((t) => t.stays?.some((s) => s.active)).length} active tenants`}
            />
            <KpiTile
              label="Pending dues"
              value={rupeesFromPaise(income?.outstanding_paise ?? 0)}
              icon="trending-down"
              tint="#B45309"
              tintBg={design.colors.warningLight}
              sub={`${dues.filter((d) => d.status !== "paid" && d.status !== "void" && d.balance_paise > 0).length} open invoices`}
            />
          </View>

          {/* Collection health */}
          <View style={styles.sectionRow}>
            <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
              COLLECTION HEALTH
            </AppText>
            <AppText variant="caption" color={design.colors.textMuted}>
              {collectionRate}% collected
            </AppText>
          </View>
          <View style={styles.card}>
            <View style={styles.collectionRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color={design.colors.textMuted}>
                  Billed
                </AppText>
                <AppText variant="h4" color={design.colors.textPrimary}>
                  {rupeesFromPaise(income?.billed_paise ?? 0)}
                </AppText>
              </View>
              <View style={styles.collectionDivider} />
              <View style={{ flex: 1 }}>
                <AppText variant="caption" color={design.colors.textMuted}>
                  Collected
                </AppText>
                <AppText variant="h4" color={design.colors.success}>
                  {rupeesFromPaise(income?.collected_paise ?? 0)}
                </AppText>
              </View>
            </View>
            <View style={styles.collectionTrack}>
              <View
                style={[
                  styles.collectionFill,
                  {
                    width: `${Math.min(100, collectionRate)}%`,
                    backgroundColor:
                      collectionRate >= 80
                        ? design.colors.success
                        : collectionRate >= 50
                          ? design.colors.warning
                          : design.colors.danger,
                  },
                ]}
              />
            </View>
            <View style={styles.collectionLegend}>
              <LegendDot color={design.colors.success} label="Collected" />
              <LegendDot color={design.colors.surfaceVariant} label="Outstanding" />
            </View>
          </View>

          {/* Occupancy by property */}
          <View style={styles.sectionRow}>
            <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
              OCCUPANCY BY PROPERTY
            </AppText>
            <AppText variant="caption" color={design.colors.textMuted}>
              {occupancy?.length ?? 0} buildings
            </AppText>
          </View>
          {occupancy && occupancy.length === 0 && (
            <EmptyState
              icon="business-outline"
              title="No buildings to analyse"
              subtitle="Add buildings, floors and beds in Setup to see occupancy trends."
              actionLabel="Open Setup"
              onAction={() => router.push("/(tabs)/setup")}
            />
          )}
          <View style={{ gap: 8 }}>
            {(occupancy ?? []).map((o) => (
              <View key={o.property_id} style={styles.propertyCard}>
                <View style={styles.propertyTop}>
                  <View style={styles.propertyIcon}>
                    <Ionicons name="business" size={16} color={design.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="body" color={design.colors.textPrimary} style={{ fontWeight: "800" }} numberOfLines={1}>
                      {o.property_name}
                    </AppText>
                    <AppText variant="caption" color={design.colors.textSecondary}>
                      {o.occupied_beds}/{o.total_beds} beds occupied
                    </AppText>
                  </View>
                  <AppText variant="h4" color={design.colors.primary}>
                    {Math.round(o.occupancy_rate)}%
                  </AppText>
                </View>
                <View style={styles.propertyTrack}>
                  <View
                    style={[
                      styles.propertyFill,
                      {
                        width: `${Math.min(100, Math.round(o.occupancy_rate))}%`,
                        backgroundColor:
                          o.occupancy_rate >= 80
                            ? design.colors.success
                            : o.occupancy_rate >= 40
                              ? design.colors.warning
                              : design.colors.danger,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Pending dues trend */}
          <View style={styles.sectionRow}>
            <AppText variant="label" color={design.colors.textSecondary} style={styles.sectionLabel}>
              PENDING DUES TREND
            </AppText>
            <AppText variant="caption" color={design.colors.textMuted}>
              last {pendingTrend.length || 0} months
            </AppText>
          </View>
          <View style={styles.card}>
            {pendingTrend.length === 0 ? (
              <View style={styles.trendEmpty}>
                <Ionicons name="checkmark-circle" size={22} color={design.colors.success} />
                <AppText variant="bodySmall" color={design.colors.textSecondary}>
                  No pending dues across invoiced months.
                </AppText>
              </View>
            ) : (
              <View style={styles.trendChart}>
                {pendingTrend.map(([month, value]) => {
                  const height = Math.max(8, Math.round((value / maxPending) * 92));
                  return (
                    <View key={month} style={styles.trendCol}>
                      <AppText variant="caption" color={design.colors.textMuted} style={{ fontSize: 9 }} numberOfLines={1}>
                        {value > 0 ? `₹${Math.round(value / 100 / 1000)}k` : "0"}
                      </AppText>
                      <View style={styles.trendBarTrack}>
                        <View
                          style={[
                            styles.trendBar,
                            {
                              height,
                              backgroundColor:
                                value > 0 ? design.colors.danger : design.colors.success,
                            },
                          ]}
                        />
                      </View>
                      <AppText variant="caption" color={design.colors.textSecondary} style={{ fontSize: 10, fontWeight: "700" }}>
                        {monthLabel(month)}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </>
      ) : null}

      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

function KpiTile({
  label,
  value,
  icon,
  tint,
  tintBg,
  sub,
}: {
  label: string;
  value: string | number;
  icon: string;
  tint: string;
  tintBg: string;
  sub: string;
}) {
  return (
    <View style={styles.kpiTile}>
      <View style={[styles.kpiIcon, { backgroundColor: tintBg }]}>
        <Ionicons name={icon as any} size={16} color={tint} />
      </View>
      <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
        {label}
      </AppText>
      <AppText
        variant="h4"
        color={design.colors.textPrimary}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </AppText>
      <AppText variant="caption" color={design.colors.textMuted} numberOfLines={1}>
        {sub}
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
  content: { padding: 16, paddingTop: 10, paddingBottom: 60 },

  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: design.colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...getShadow("sm"),
  },

  heroCard: {
    backgroundColor: design.colors.primary,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    overflow: "hidden",
    ...getShadow("md"),
  },
  heroGlowA: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.09)",
    top: -70,
    right: -30,
  },
  heroGlowB: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: -40,
    left: -20,
  },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heroLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: "rgba(255,255,255,0.72)" },
  heroValue: { fontSize: 44, fontWeight: "800", color: "#fff", letterSpacing: -1.2, marginTop: 2 },
  heroPct: { fontSize: 22, fontWeight: "800", color: "rgba(255,255,255,0.8)" },
  heroSub: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.72)", marginTop: 1 },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
    marginTop: 16,
  },
  heroFill: { height: 7, borderRadius: 4, backgroundColor: "#fff" },
  heroFooter: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  heroFooterItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  heroFooterText: { color: "rgba(255,255,255,0.78)", fontSize: 10, fontWeight: "700" },

  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  kpiTile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 12,
    ...getShadow("sm"),
  },
  kpiIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
    marginTop: 16,
  },
  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    padding: 14,
    ...getShadow("sm"),
  },
  collectionRow: { flexDirection: "row", gap: 12 },
  collectionDivider: { width: 1, backgroundColor: design.colors.border },
  collectionTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: design.colors.surfaceVariant,
    overflow: "hidden",
    marginTop: 12,
  },
  collectionFill: { height: 8, borderRadius: 4 },
  collectionLegend: { flexDirection: "row", gap: 14, marginTop: 9 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendSwatch: { width: 9, height: 9, borderRadius: 3 },

  propertyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: design.colors.border,
    padding: 12,
    ...getShadow("sm"),
  },
  propertyTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  propertyIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: design.colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  propertyTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: design.colors.surfaceVariant,
    overflow: "hidden",
    marginTop: 9,
  },
  propertyFill: { height: 5, borderRadius: 3 },

  trendChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 6,
  },
  trendCol: { flex: 1, alignItems: "center", gap: 4 },
  trendBarTrack: {
    height: 96,
    width: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  trendBar: { width: "62%", borderRadius: 5, minHeight: 8 },
  trendEmpty: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },

  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
