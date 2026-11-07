import { api, rupeesFromPaise } from "@/lib/api";
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
import { AppText, AppBadge, EmptyState, Skeleton } from "@/components/ui-components";

type Txn = {
  invoice_id: string;
  period_month: string;
  amount_paise: number;
  paid_paise: number;
  balance_paise: number;
  payments: {
    payment_id: string;
    amount_paise: number;
    mode: string;
    paid_at: string;
  }[];
};

const MODE_META: Record<string, { label: string; icon: string }> = {
  cash: { label: "Cash", icon: "cash-outline" },
  upi_manual: { label: "UPI", icon: "phone-portrait-outline" },
  card: { label: "Card", icon: "card-outline" },
  bank_transfer: { label: "Bank transfer", icon: "business-outline" },
};

function modeMeta(mode: string) {
  return MODE_META[mode] ?? { label: mode.replace(/_/g, " "), icon: "wallet-outline" };
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function prettyDate(value: string): string {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  if (isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TenantHistory() {
  const router = useRouter();
  const accent = roleAccents.tenant;

  const [rows, setRows] = useState<Txn[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoading(true);
      setRows(await api.get<Txn[]>("/my/transactions"));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load payment history");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const totals = useMemo(() => {
    const list = rows ?? [];
    let paid = 0;
    let billed = 0;
    let payments = 0;
    for (const row of list) {
      billed += row.amount_paise;
      payments += row.payments.length;
      paid += row.payments.reduce((sum, p) => sum + p.amount_paise, 0);
    }
    return { paid, billed, payments, invoices: list.length };
  }, [rows]);

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: accent.accent }]}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>PAYMENT LEDGER</Text>
            <AppText variant="h2" color="#fff">
              Payment History
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.74)">
              Every rent payment, in one timeline
            </AppText>
          </View>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={load}
            accessibilityLabel="Refresh payment history"
          >
            <Ionicons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>
              {rupeesFromPaise(totals.paid)}
            </Text>
            <Text style={styles.heroStatLabel}>TOTAL PAID</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{totals.payments}</Text>
            <Text style={styles.heroStatLabel}>PAYMENTS</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{totals.invoices}</Text>
            <Text style={styles.heroStatLabel}>INVOICES</Text>
          </View>
        </View>
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
            <Skeleton height={120} radius={16} />
            <Skeleton height={150} radius={16} />
            <Skeleton height={150} radius={16} />
          </View>
        )}

        {rows && rows.length === 0 && (
          <EmptyState
            icon="receipt-outline"
            title="No payments yet"
            subtitle="Once your manager records a rent payment, it will appear here with the mode and date."
            actionLabel="Back to dues"
            onAction={() => router.back()}
          />
        )}

        {rows && rows.length > 0 && (
          <View style={{ gap: 12 }}>
            {rows.map((row) => {
              const paidInvoices = row.payments.reduce((sum, p) => sum + p.amount_paise, 0);
              const fullyPaid = row.balance_paise <= 0 && row.amount_paise > 0;
              return (
                <View key={row.invoice_id} style={styles.card}>
                  <View style={styles.cardHead}>
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
                        {row.payments.length} payment{row.payments.length === 1 ? "" : "s"} ·{" "}
                        {rupeesFromPaise(paidInvoices)} of {rupeesFromPaise(row.amount_paise)}
                      </AppText>
                    </View>
                    <AppBadge variant={fullyPaid ? "success" : row.balance_paise > 0 ? "warning" : "neutral"}>
                      {fullyPaid ? "Paid" : row.balance_paise > 0 ? "Balance" : "Closed"}
                    </AppBadge>
                  </View>

                  <View style={styles.amountRow}>
                    <View>
                      <AppText variant="caption" color={design.colors.textMuted}>
                        BILLED
                      </AppText>
                      <AppText variant="bodySmall" color={design.colors.textPrimary} style={{ fontWeight: "800" }}>
                        {rupeesFromPaise(row.amount_paise)}
                      </AppText>
                    </View>
                    <View style={{ alignItems: "center" }}>
                      <AppText variant="caption" color={design.colors.textMuted}>
                        PAID
                      </AppText>
                      <AppText variant="bodySmall" color={design.colors.success} style={{ fontWeight: "800" }}>
                        {rupeesFromPaise(paidInvoices)}
                      </AppText>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <AppText variant="caption" color={design.colors.textMuted}>
                        BALANCE
                      </AppText>
                      <AppText
                        variant="bodySmall"
                        color={row.balance_paise > 0 ? design.colors.danger : design.colors.textMuted}
                        style={{ fontWeight: "800" }}
                      >
                        {rupeesFromPaise(row.balance_paise)}
                      </AppText>
                    </View>
                  </View>

                  {row.payments.length > 0 ? (
                    <View style={styles.timeline}>
                      {row.payments.map((payment, index) => {
                        const meta = modeMeta(payment.mode);
                        const last = index === row.payments.length - 1;
                        return (
                          <View key={payment.payment_id} style={styles.timelineRow}>
                            <View style={styles.timelineRail}>
                              <View style={[styles.timelineDot, { backgroundColor: accent.accent }]}>
                                <Ionicons name={meta.icon as any} size={11} color="#fff" />
                              </View>
                              {!last && <View style={styles.timelineLine} />}
                            </View>
                            <View style={[styles.timelineBody, !last && { paddingBottom: 14 }]}>
                              <View style={styles.timelineTop}>
                                <AppText variant="bodySmall" color={design.colors.textPrimary} style={{ fontWeight: "700" }}>
                                  {meta.label}
                                </AppText>
                                <AppText variant="bodySmall" color={design.colors.textPrimary} style={{ fontWeight: "800" }}>
                                  {rupeesFromPaise(payment.amount_paise)}
                                </AppText>
                              </View>
                              <AppText variant="caption" color={design.colors.textMuted}>
                                {prettyDate(payment.paid_at)}
                              </AppText>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.noPayments}>
                      <Ionicons name="hourglass-outline" size={13} color={design.colors.textMuted} />
                      <AppText variant="caption" color={design.colors.textMuted}>
                        No payments recorded for this invoice yet.
                      </AppText>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
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
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
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
  content: { padding: 16, paddingTop: 14, paddingBottom: 110 },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    backgroundColor: "#fff",
    padding: 13,
    gap: 10,
    ...getShadow("sm"),
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  timeline: { paddingTop: 2 },
  timelineRow: { flexDirection: "row", gap: 10 },
  timelineRail: { alignItems: "center", width: 24 },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineLine: { flex: 1, width: 1.5, backgroundColor: design.colors.border, marginTop: 3 },
  timelineBody: { flex: 1 },
  timelineTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  noPayments: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: design.colors.border,
  },
  error: { color: design.colors.danger, marginTop: 16, textAlign: "center" },
});
