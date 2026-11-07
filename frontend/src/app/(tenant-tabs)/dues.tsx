import { api, rupeesFromPaise } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
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
  AppBadge,
  EmptyState,
  Skeleton,
} from "@/components/ui-components";

type Row = {
  invoice_id: string;
  period_month: string;
  amount_paise: number;
  paid_paise: number;
  balance_paise: number;
  due_date: string;
  status: string;
  property_name: string;
  room_number: string;
  bed_label: string;
};

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function prettyDate(value: string): string {
  const date = new Date(value);
  if (isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function isOverdue(row: Row): boolean {
  if (row.status === "paid" || row.status === "void") return false;
  const due = new Date(row.due_date);
  if (isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function statusMeta(row: Row): { label: string; variant: "success" | "warning" | "danger" | "neutral" } {
  if (row.status === "paid") return { label: "Paid", variant: "success" };
  if (row.status === "void") return { label: "Void", variant: "neutral" };
  if (isOverdue(row)) return { label: "Overdue", variant: "danger" };
  if (row.status === "partial") return { label: "Partly paid", variant: "warning" };
  return { label: "Pending", variant: "warning" };
}

export default function TenantDues() {
  const { token } = useAuth();
  const router = useRouter();
  const accent = roleAccents.tenant;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "paid">("all");

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setLoading(true);
      const data = await api.get<{ invoices: Row[] }>("/my/overview");
      setRows(data.invoices ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load your dues");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const list = rows ?? [];
  const totalDue = list
    .filter((r) => r.status !== "void" && r.balance_paise > 0)
    .reduce((sum, r) => sum + r.balance_paise, 0);
  const totalPaid = list.reduce((sum, r) => sum + r.paid_paise, 0);
  const totalBilled = list.reduce((sum, r) => sum + r.amount_paise, 0);

  const filtered = useMemo(() => {
    if (filter === "open")
      return list.filter((r) => r.status !== "void" && r.balance_paise > 0);
    if (filter === "paid") return list.filter((r) => r.status === "paid");
    return list;
  }, [list, filter]);

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: accent.accent }]}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>MY LEDGER</Text>
            <AppText variant="h2" color="#fff">
              Rent Dues
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.74)">
              Rent, balance and payment status
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => router.push("/(tenant-tabs)/history")}
            accessibilityLabel="Payment history"
          >
            <Ionicons name="receipt-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroAmountCard}>
          <Text style={styles.heroAmountLabel}>TOTAL OUTSTANDING</Text>
          <Text style={styles.heroAmountValue} numberOfLines={1} adjustsFontSizeToFit>
            {rupeesFromPaise(totalDue)}
          </Text>
          <View style={styles.heroAmountMeta}>
            <Ionicons
              name={totalDue === 0 ? "checkmark-circle" : "alert-circle"}
              size={13}
              color="rgba(255,255,255,0.85)"
            />
            <Text style={styles.heroAmountSub}>
              {totalDue === 0
                ? "All dues cleared — you're up to date"
                : `${list.filter((r) => r.balance_paise > 0 && r.status !== "void").length} invoice${
                    list.filter((r) => r.balance_paise > 0 && r.status !== "void").length === 1
                      ? ""
                      : "s"
                  } awaiting payment`}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.historyCta}
          onPress={() => router.push("/(tenant-tabs)/history")}
          activeOpacity={0.9}
        >
          <Ionicons name="time-outline" size={17} color={accent.accent} />
          <Text style={[styles.historyCtaText, { color: accent.accent }]}>
            Payment history
          </Text>
          <Ionicons name="arrow-forward" size={14} color={accent.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={accent.accent} />
        }
      >
        {loading && !rows && (
          <View style={{ gap: 10 }}>
            <View style={styles.statsRow}>
              <Skeleton height={80} radius={16} style={{ flex: 1 }} />
              <Skeleton height={80} radius={16} style={{ flex: 1 }} />
            </View>
            <Skeleton height={104} radius={16} />
            <Skeleton height={104} radius={16} />
          </View>
        )}

        {!loading || rows ? (
          <>
            <View style={styles.statsRow}>
              <MiniStat
                label="Billed"
                value={rupeesFromPaise(totalBilled)}
                icon="document-text-outline"
                tint={design.colors.info}
                bg={design.colors.infoLight}
              />
              <MiniStat
                label="Paid"
                value={rupeesFromPaise(totalPaid)}
                icon="checkmark-done-outline"
                tint={design.colors.success}
                bg={design.colors.successLight}
              />
            </View>

            <View style={styles.filterRow}>
              {(
                [
                  ["all", "All"],
                  ["open", "Outstanding"],
                  ["paid", "Paid"],
                ] as ["all" | "open" | "paid", string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.chip,
                    filter === value && { backgroundColor: accent.accent, borderColor: accent.accent },
                  ]}
                  onPress={() => setFilter(value)}
                  activeOpacity={0.85}
                >
                  <AppText
                    variant="caption"
                    color={filter === value ? "#fff" : design.colors.textSecondary}
                    style={{ fontWeight: "700" }}
                  >
                    {label}
                  </AppText>
                </TouchableOpacity>
              ))}
            </View>

            {rows && filtered.length === 0 && (
              <EmptyState
                icon="receipt-outline"
                title={list.length === 0 ? "No invoices yet" : "Nothing here"}
                subtitle={
                  list.length === 0
                    ? "Your manager generates rent bills monthly. They'll appear here."
                    : filter === "open"
                      ? "You have no outstanding invoices."
                      : "No paid invoices in your history yet."
                }
              />
            )}

            <View style={{ gap: 10 }}>
              {filtered.map((row) => {
                const meta = statusMeta(row);
                const progress =
                  row.amount_paise > 0
                    ? Math.min(100, Math.round((row.paid_paise / row.amount_paise) * 100))
                    : 0;
                return (
                  <View key={row.invoice_id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={[styles.monthIcon, { backgroundColor: accent.accentSoft }]}>
                        <Ionicons name="calendar-outline" size={18} color={accent.accent} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <AppText
                          variant="body"
                          color={design.colors.textPrimary}
                          style={{ fontWeight: "800" }}
                          numberOfLines={1}
                        >
                          {monthLabel(row.period_month)}
                        </AppText>
                        <AppText variant="caption" color={design.colors.textSecondary} numberOfLines={1}>
                          {row.property_name} · Room {row.room_number} · Bed {row.bed_label}
                        </AppText>
                      </View>
                      <AppBadge variant={meta.variant}>{meta.label}</AppBadge>
                    </View>

                    <View style={styles.amountRow}>
                      <View>
                        <AppText variant="caption" color={design.colors.textMuted}>
                          BILL AMOUNT
                        </AppText>
                        <AppText variant="h4" color={design.colors.textPrimary}>
                          {rupeesFromPaise(row.amount_paise)}
                        </AppText>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <AppText variant="caption" color={design.colors.textMuted}>
                          {row.balance_paise > 0 ? "BALANCE" : "PAID"}
                        </AppText>
                        <AppText
                          variant="h4"
                          color={
                            row.balance_paise > 0 ? design.colors.danger : design.colors.success
                          }
                        >
                          {rupeesFromPaise(
                            row.balance_paise > 0 ? row.balance_paise : row.paid_paise
                          )}
                        </AppText>
                      </View>
                    </View>

                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${progress}%`,
                            backgroundColor:
                              row.balance_paise > 0
                                ? isOverdue(row)
                                  ? design.colors.danger
                                  : accent.accent
                                : design.colors.success,
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.cardFooter}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Ionicons name="calendar-outline" size={12} color={design.colors.textMuted} />
                        <AppText variant="caption" color={design.colors.textMuted}>
                          Due {prettyDate(row.due_date)}
                        </AppText>
                      </View>
                      {row.balance_paise > 0 && row.status !== "void" ? (
                        <TouchableOpacity
                          style={[styles.payBtn, { backgroundColor: accent.accentSoft }]}
                          onPress={() => router.push("/transactions")}
                        >
                          <Ionicons name="wallet-outline" size={13} color={accent.accent} />
                          <AppText
                            variant="caption"
                            color={accent.accent}
                            style={{ fontWeight: "800" }}
                          >
                            Pay / view
                          </AppText>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.receiptBtn}
                          onPress={() => router.push("/(tenant-tabs)/history")}
                        >
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={13}
                            color={design.colors.success}
                          />
                          <AppText
                            variant="caption"
                            color={design.colors.success}
                            style={{ fontWeight: "800" }}
                          >
                            View receipt
                          </AppText>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </View>
  );
}

function MiniStat({
  label,
  value,
  icon,
  tint,
  bg,
}: {
  label: string;
  value: string;
  icon: string;
  tint: string;
  bg: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={15} color={tint} />
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
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAmountCard: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.13)",
    borderRadius: 14,
    padding: 14,
  },
  heroAmountLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.7)",
  },
  heroAmountValue: {
    fontSize: 30,
    fontWeight: "800",
    color: "#fff",
    marginTop: 3,
    letterSpacing: -0.5,
  },
  heroAmountMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  heroAmountSub: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.76)",
  },
  historyCta: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    ...getShadow("sm"),
  },
  historyCtaText: { fontWeight: "800", fontSize: 13 },

  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 14, paddingBottom: 110 },

  statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
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

  filterRow: { flexDirection: "row", gap: 7, marginBottom: 13 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 13,
    gap: 10,
    ...getShadow("sm"),
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  monthIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: design.colors.surfaceVariant,
    overflow: "hidden",
  },
  progressFill: { height: 5, borderRadius: 3 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  receiptBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
