import { api, rupeesFromPaise } from "@/lib/api";
import { usePg } from "@/lib/pg";
import { design, getShadow } from "@/lib/design";
import { Sheet } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
  AppBadge,
  EmptyState,
  AppAvatar,
  AppInput,
  Skeleton,
} from "@/components/ui-components";

type DueRow = {
  invoice_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string;
  property_name: string;
  room_number: string;
  bed_label: string;
  period_month: string;
  amount_paise: number;
  paid_paise: number;
  balance_paise: number;
  due_date: string;
  status: string;
};

type DuesSummary = {
  total_invoices: number;
  pending: number;
  partial: number;
  paid: number;
  billed_paise: number;
  collected_paise: number;
  outstanding_paise: number;
};

type TenantDueStatus = "paid" | "overdue" | "partial" | "pending";

type TenantDueGroup = {
  tenant_id: string;
  tenant_name: string;
  tenant_phone: string;
  property_name: string;
  room_number: string;
  bed_label: string;
  latest_period: string;
  invoices: DueRow[];
  open_invoices: DueRow[];
  months: string[];
  billed_paise: number;
  paid_paise: number;
  balance_paise: number;
  status: TenantDueStatus;
};

type StatusFilter = "all" | "overdue" | "pending" | "partial" | "paid";

function initials(name: string): string {
  return name
    .split(/[ .]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

function prettyDate(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function isOverdue(row: DueRow): boolean {
  if (row.status === "paid" || row.status === "void") return false;
  const due = new Date(row.due_date);
  if (isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function monthsLabel(months: string[]): string {
  if (months.length === 0) return "—";
  const sorted = [...months].sort();
  if (sorted.length === 1) return monthLabel(sorted[0]);
  return `${monthLabel(sorted[0])} – ${monthLabel(sorted[sorted.length - 1])}`;
}

function groupStatusMeta(group: TenantDueGroup): {
  label: string;
  variant: "success" | "warning" | "danger" | "info" | "neutral";
} {
  if (group.status === "paid") return { label: "Paid", variant: "success" };
  if (group.status === "overdue") return { label: "Overdue", variant: "danger" };
  if (group.status === "partial") return { label: "Partial", variant: "info" };
  return { label: "Pending", variant: "warning" };
}

export default function Dues() {
  const { propertyId } = usePg();
  const router = useRouter();

  const [summary, setSummary] = useState<DuesSummary | null>(null);
  const [rows, setRows] = useState<DueRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [monthFilter, setMonthFilter] = useState("__all__");
  const [monthOpen, setMonthOpen] = useState(false);

  const [genOpen, setGenOpen] = useState(false);
  const [genMonth, setGenMonth] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  );
  const [generating, setGenerating] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      const q = propertyId ? `?property_id=${propertyId}` : "";
      const data = await api.get<any>(`/dues${q}`);
      setSummary(data.summary);
      setRows(data.rows);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load dues");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const months = useMemo(() => {
    const set = new Set<string>();
    (rows ?? []).forEach((r) => set.add(r.period_month));
    return Array.from(set).sort().reverse();
  }, [rows]);

  const scopedRows = useMemo(
    () =>
      (rows ?? []).filter(
        (row) => monthFilter === "__all__" || row.period_month === monthFilter
      ),
    [rows, monthFilter]
  );

  const groups = useMemo<TenantDueGroup[]>(() => {
    const map = new Map<string, TenantDueGroup>();
    for (const row of scopedRows) {
      let group = map.get(row.tenant_id);
      if (!group) {
        group = {
          tenant_id: row.tenant_id,
          tenant_name: row.tenant_name,
          tenant_phone: row.tenant_phone,
          property_name: row.property_name,
          room_number: row.room_number,
          bed_label: row.bed_label,
          latest_period: row.period_month,
          invoices: [],
          open_invoices: [],
          months: [],
          billed_paise: 0,
          paid_paise: 0,
          balance_paise: 0,
          status: "pending",
        };
        map.set(row.tenant_id, group);
      }

      group.invoices.push(row);
      group.billed_paise += row.amount_paise;
      group.paid_paise += row.paid_paise;
      group.balance_paise += row.balance_paise;
      if (row.status !== "paid" && row.status !== "void" && row.balance_paise > 0) {
        group.open_invoices.push(row);
      }
      if (!group.months.includes(row.period_month)) group.months.push(row.period_month);
      if (row.period_month >= group.latest_period) {
        group.latest_period = row.period_month;
        group.property_name = row.property_name;
        group.room_number = row.room_number;
        group.bed_label = row.bed_label;
      }
    }

    const list = Array.from(map.values());
    for (const group of list) {
      group.months.sort();
      if (group.balance_paise <= 0) group.status = "paid";
      else if (group.open_invoices.some(isOverdue)) group.status = "overdue";
      else if (group.paid_paise > 0) group.status = "partial";
      else group.status = "pending";
    }
    return list.sort(
      (a, b) =>
        b.balance_paise - a.balance_paise ||
        a.tenant_name.localeCompare(b.tenant_name)
    );
  }, [scopedRows]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return groups;
    return groups.filter((group) => {
      if (statusFilter === "overdue") return group.open_invoices.some(isOverdue);
      if (statusFilter === "pending") return group.status === "pending";
      if (statusFilter === "partial") return group.status === "partial";
      return group.status === "paid";
    });
  }, [groups, statusFilter]);

  const overdueCount = useMemo(() => {
    const tenantIds = new Set<string>();
    (rows ?? []).forEach((row) => {
      if (isOverdue(row)) tenantIds.add(row.tenant_id);
    });
    return tenantIds.size;
  }, [rows]);

  async function generateBills() {
    const month = genMonth.trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      Alert.alert("Invalid month", "Use the format YYYY-MM");
      return;
    }
    setGenerating(true);
    try {
      const res: any = await api.post("/invoices/generate", {
        month,
        property_id: propertyId ?? undefined,
      });
      const created = Array.isArray(res) ? res.length : res?.created ?? 0;
      Alert.alert(
        "Generation complete",
        created > 0
          ? `${created} new invoice${created === 1 ? "" : "s"} created for ${month}. Existing invoices were skipped.`
          : `No new invoices needed — all active stays are already billed for ${month}.`
      );
      setGenOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert("Failed", e?.message ?? "Could not generate invoices");
    } finally {
      setGenerating(false);
    }
  }

  async function sendReminder(group: TenantDueGroup) {
    const targets = group.open_invoices;
    if (targets.length === 0) return;
    setRemindingId(group.tenant_id);
    let sent = 0;
    try {
      for (const row of targets) {
        await api.post("/payment-reminders", {
          invoice_id: row.invoice_id,
          reminder_type: "initial",
          reminder_date: new Date().toISOString(),
          channel: "whatsapp",
        });
        sent += 1;
      }
      Alert.alert(
        "Reminder queued",
        targets.length === 1
          ? `A WhatsApp reminder was queued for ${group.tenant_name}.`
          : `${sent} WhatsApp reminders were queued for ${group.tenant_name} across ${targets.length} open invoices.`
      );
    } catch (e: any) {
      const message =
        typeof e?.detail === "string"
          ? e.detail
          : e?.message ?? "Could not create reminder";
      Alert.alert(
        "Reminder failed",
        sent > 0
          ? `${sent} of ${targets.length} reminders were queued. ${message}`
          : message
      );
    } finally {
      setRemindingId(null);
    }
  }

  const summaryCards = [
    {
      label: "Billed",
      value: rupeesFromPaise(summary?.billed_paise ?? 0),
      icon: "document-text-outline",
      bg: design.colors.primaryLight,
      color: design.colors.primary,
      sub: `${summary?.total_invoices ?? 0} invoices`,
    },
    {
      label: "Collected",
      value: rupeesFromPaise(summary?.collected_paise ?? 0),
      icon: "checkmark-done-outline",
      bg: design.colors.successLight,
      color: design.colors.success,
      sub: `${summary?.paid ?? 0} paid`,
    },
    {
      label: "Outstanding",
      value: rupeesFromPaise(summary?.outstanding_paise ?? 0),
      icon: "alert-circle-outline",
      bg: design.colors.dangerLight,
      color: design.colors.danger,
      sub: `${(summary?.pending ?? 0) + (summary?.partial ?? 0)} open`,
    },
    {
      label: "Overdue",
      value: overdueCount,
      icon: "time-outline",
      bg: design.colors.warningLight,
      color: "#B45309",
      sub: "needs follow-up",
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>BILLING & COLLECTIONS</Text>
            <AppText variant="h2" color="#fff">
              Rent Dues
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.72)">
              Track payments and outstanding balances
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.heroIconBtn}
            onPress={() => router.push("/transactions")}
            accessibilityLabel="Record payment"
          >
            <Ionicons name="wallet-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.generateBtn} onPress={() => setGenOpen(true)} activeOpacity={0.9}>
          <Ionicons name="receipt" size={17} color={design.colors.primary} />
          <Text style={styles.generateText}>Generate Bills</Text>
          <Ionicons name="arrow-forward" size={15} color={design.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={design.colors.primary} />
        }
      >
        {loading && !rows && (
          <View style={{ gap: 12 }}>
            <View style={styles.statsGrid}>
              <Skeleton height={104} radius={16} style={{ width: "48.3%" }} />
              <Skeleton height={104} radius={16} style={{ width: "48.3%" }} />
              <Skeleton height={104} radius={16} style={{ width: "48.3%" }} />
              <Skeleton height={104} radius={16} style={{ width: "48.3%" }} />
            </View>
            <Skeleton height={44} radius={12} />
            <Skeleton height={92} radius={16} />
            <Skeleton height={92} radius={16} />
            <Skeleton height={92} radius={16} />
          </View>
        )}

        {!loading || rows ? (
          <>
            {/* Four compact stats */}
            <View style={styles.statsGrid}>
              {summaryCards.map((card) => (
                <View key={card.label} style={styles.statCard}>
                  <View style={[styles.statIcon, { backgroundColor: card.bg }]}>
                    <Ionicons name={card.icon as any} size={16} color={card.color} />
                  </View>
                  <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                    {card.label}
                  </AppText>
                  <AppText
                    variant="h4"
                    color={design.colors.textPrimary}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {card.value}
                  </AppText>
                  <AppText variant="caption" color={design.colors.textMuted} numberOfLines={1}>
                    {card.sub}
                  </AppText>
                </View>
              ))}
            </View>

            {/* Status filters + month */}
            <View style={styles.filterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
                {(
                  [
                    ["all", "All"],
                    ["overdue", "Overdue"],
                    ["pending", "Pending"],
                    ["partial", "Partial"],
                    ["paid", "Paid"],
                  ] as [StatusFilter, string][]
                ).map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, statusFilter === value && styles.chipActive]}
                    onPress={() => setStatusFilter(value)}
                    activeOpacity={0.85}
                  >
                    <AppText
                      variant="caption"
                      color={statusFilter === value ? "#fff" : design.colors.textSecondary}
                      style={{ fontWeight: "700" }}
                    >
                      {label}
                    </AppText>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity style={styles.monthBtn} onPress={() => setMonthOpen(true)}>
                <Ionicons name="calendar-outline" size={14} color={design.colors.textSecondary} />
                <AppText variant="caption" color={design.colors.textSecondary} style={{ fontWeight: "700" }}>
                  {monthFilter === "__all__" ? "All months" : monthLabel(monthFilter)}
                </AppText>
                <Ionicons name="chevron-down" size={13} color={design.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Tenant dues cards */}
            {rows && filtered.length === 0 && (
              <EmptyState
                icon="checkmark-circle-outline"
                title={rows.length === 0 ? "No invoices yet" : "No dues match"}
                subtitle={
                  rows.length === 0
                    ? "Generate this month's bills to start collecting rent."
                    : "Try a different status or billing month."
                }
                actionLabel={rows.length === 0 ? "Generate Bills" : undefined}
                onAction={rows.length === 0 ? () => setGenOpen(true) : undefined}
              />
            )}

            <View style={{ gap: 10 }}>
              {filtered.map((group) => {
                const meta = groupStatusMeta(group);
                const openCount = group.open_invoices.length;
                const invoiceCount = group.invoices.length;
                const oldestDue = group.open_invoices.reduce<string | null>(
                  (oldest, row) => {
                    if (!oldest) return row.due_date;
                    return new Date(row.due_date) < new Date(oldest)
                      ? row.due_date
                      : oldest;
                  },
                  null
                );
                const sending = remindingId === group.tenant_id;
                return (
                  <TouchableOpacity
                    key={group.tenant_id}
                    style={styles.invoiceCard}
                    activeOpacity={0.9}
                    onPress={() => router.push(`/tenant-profile/${group.tenant_id}`)}
                  >
                    <View style={styles.invoiceTop}>
                      <AppAvatar
                        initials={initials(group.tenant_name) || "T"}
                        size={40}
                        variant="primary"
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText
                          variant="body"
                          color={design.colors.textPrimary}
                          style={{ fontWeight: "800" }}
                          numberOfLines={1}
                        >
                          {group.tenant_name}
                        </AppText>
                        <AppText
                          variant="caption"
                          color={design.colors.textSecondary}
                          numberOfLines={1}
                        >
                          Room {group.room_number} · Bed {group.bed_label} ·{" "}
                          {group.property_name}
                        </AppText>
                      </View>
                      <AppBadge variant={meta.variant}>{meta.label}</AppBadge>
                    </View>

                    <View style={styles.invoiceMid}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText
                          variant="caption"
                          color={design.colors.textMuted}
                          numberOfLines={1}
                        >
                          DUES · {invoiceCount} INVOICE
                          {invoiceCount === 1 ? "" : "S"} ·{" "}
                          {monthsLabel(group.months)}
                        </AppText>
                        <AppText
                          variant="caption"
                          color={design.colors.textSecondary}
                          style={{ marginTop: 2 }}
                          numberOfLines={1}
                        >
                          {openCount > 0 && oldestDue
                            ? `${openCount} open · oldest due ${prettyDate(oldestDue)}`
                            : "All invoices settled"}
                        </AppText>
                      </View>
                      <View style={{ alignItems: "flex-end", maxWidth: "52%" }}>
                        <AppText
                          variant="h4"
                          color={design.colors.textPrimary}
                          style={{ fontWeight: "800" }}
                        >
                          {rupeesFromPaise(group.balance_paise)}
                        </AppText>
                        <AppText
                          variant="caption"
                          color={design.colors.textMuted}
                          style={{ textAlign: "right" }}
                          numberOfLines={1}
                        >
                          {rupeesFromPaise(group.paid_paise)} of{" "}
                          {rupeesFromPaise(group.billed_paise)} paid
                        </AppText>
                      </View>
                    </View>

                    {openCount > 0 ? (
                      <View style={styles.invoiceActions}>
                        <TouchableOpacity
                          style={styles.reminderBtn}
                          onPress={() => sendReminder(group)}
                          disabled={sending}
                        >
                          <Ionicons
                            name={
                              sending
                                ? "hourglass-outline"
                                : "notifications-outline"
                            }
                            size={15}
                            color={design.colors.primary}
                          />
                          <AppText
                            variant="caption"
                            color={design.colors.primary}
                            style={{ fontWeight: "800" }}
                          >
                            {sending ? "Sending…" : "Send Reminder"}
                          </AppText>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.recordBtn}
                          onPress={() => router.push("/transactions")}
                        >
                          <Ionicons
                            name="add-circle-outline"
                            size={15}
                            color="#fff"
                          />
                          <AppText
                            variant="caption"
                            color="#fff"
                            style={{ fontWeight: "800" }}
                          >
                            Record Payment
                          </AppText>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.paidNote}>
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color={design.colors.success}
                        />
                        <AppText
                          variant="caption"
                          color={design.colors.success}
                          style={{ fontWeight: "700" }}
                        >
                          Fully settled ·{" "}
                          {rupeesFromPaise(group.paid_paise)} received
                        </AppText>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      {/* Month filter sheet */}
      <Sheet visible={monthOpen} onClose={() => setMonthOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={{ marginBottom: 10 }}>
          Billing month
        </AppText>
        <TouchableOpacity
          style={[styles.monthOption, monthFilter === "__all__" && styles.monthOptionActive]}
          onPress={() => {
            setMonthFilter("__all__");
            setMonthOpen(false);
          }}
        >
          <AppText variant="body" color={design.colors.textPrimary} style={{ flex: 1, fontWeight: "600" }}>
            All months
          </AppText>
          {monthFilter === "__all__" && (
            <Ionicons name="checkmark-circle" size={20} color={design.colors.primary} />
          )}
        </TouchableOpacity>
        {months.map((month) => (
          <TouchableOpacity
            key={month}
            style={[styles.monthOption, monthFilter === month && styles.monthOptionActive]}
            onPress={() => {
              setMonthFilter(month);
              setMonthOpen(false);
            }}
          >
            <AppText variant="body" color={design.colors.textPrimary} style={{ flex: 1, fontWeight: "600" }}>
              {monthLabel(month)}
            </AppText>
            {monthFilter === month && (
              <Ionicons name="checkmark-circle" size={20} color={design.colors.primary} />
            )}
          </TouchableOpacity>
        ))}
      </Sheet>

      {/* Generate bills sheet */}
      <Sheet visible={genOpen} onClose={() => setGenOpen(false)}>
        <AppText variant="h4" color={design.colors.textPrimary} style={styles.sheetTitle}>
          Generate Bills
        </AppText>
        <AppText variant="body" color={design.colors.textSecondary} style={styles.sheetHint}>
          Creates one invoice per active stay for the month. Mid-month move-ins are billed pro-rata.
          Safe to run again — already-billed stays are skipped.
        </AppText>
        <AppInput
          label="Billing month (YYYY-MM)"
          placeholder={genMonth}
          value={genMonth}
          onChangeText={setGenMonth}
          keyboardType="number-pad"
        />
        <AppButton
          variant="primary"
          fullWidth
          loading={generating}
          onPress={generateBills}
          style={{ marginTop: 8 }}
        >
          Generate Invoices
        </AppButton>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: design.colors.background },

  hero: {
    backgroundColor: design.colors.primary,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
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
    top: -60,
    right: -40,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, color: "rgba(255,255,255,0.72)", marginBottom: 3 },
  heroIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  generateBtn: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...getShadow("sm"),
  },
  generateText: { color: design.colors.primary, fontWeight: "800", fontSize: 14 },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 110 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: {
    width: "48.3%",
    minHeight: 104,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 12,
    ...getShadow("sm"),
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },

  filterRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  filterChips: { gap: 6, paddingRight: 4 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: design.colors.primary, borderColor: design.colors.primary },
  monthBtn: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  invoiceCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 13,
    gap: 10,
    ...getShadow("sm"),
  },
  invoiceTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  invoiceMid: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  invoiceActions: { flexDirection: "row", gap: 8 },
  reminderBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: design.colors.primaryLight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  recordBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: design.colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  paidNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },

  monthOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  monthOptionActive: { backgroundColor: design.colors.primaryLight },

  sheetTitle: { marginBottom: 8 },
  sheetHint: { marginBottom: 12, lineHeight: 20 },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
