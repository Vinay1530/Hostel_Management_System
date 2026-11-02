import { Ionicons } from "@expo/vector-icons";
import { api, rupeesFromPaise } from "@/lib/api";
import { theme } from "@/lib/theme";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";

type Txn = {
  invoice_id: string;
  period_month: string;
  amount_paise: number;
  due_date: string;
  status: string;
  payments: { payment_id?: string; id?: string; amount_paise: number; mode: string; paid_at: string; reference: string | null }[];
};

const STATUS_COLORS: Record<string, string> = { paid: "#16a34a", partial: "#3b82f6", pending: "#f59e0b", void: "#94a3b8" };

function date(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export default function TransactionsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Txn[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Txn[]>("/my/transactions")
      .then(setRows)
      .catch((e: any) => setError(e?.message ?? "Failed to load"));
  }, []);

  const totalPaid = rows.reduce(
    (sum, r) => sum + r.payments.reduce((s, p) => s + p.amount_paise, 0),
    0
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.accentText} />
        </Pressable>
        <Text style={styles.h1}>Transactions</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
        {error && <Text style={styles.error}>{error}</Text>}
        {rows.length > 0 && (
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Total paid till date</Text>
            <Text style={styles.summaryValue}>{rupeesFromPaise(totalPaid)}</Text>
          </View>
        )}
        {rows.length === 0 && !error && (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={36} color={theme.textLight} />
            <Text style={styles.emptyText}>No bills yet — your manager generates rent bills monthly.</Text>
          </View>
        )}
        {rows.map((r) => {
          const paid = r.payments.reduce((s, p) => s + p.amount_paise, 0);
          return (
            <View key={r.invoice_id} style={styles.card}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.month}>{r.period_month}</Text>
                <View style={[styles.statusPill, { backgroundColor: `${STATUS_COLORS[r.status] ?? "#94a3b8"}22` }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[r.status] ?? "#94a3b8" }]}>
                    {(r.status || "").toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.line}>
                Rent {rupeesFromPaise(r.amount_paise)} · {paid >= r.amount_paise ? "Fully paid" : `Balance ${rupeesFromPaise(r.amount_paise - paid)}`}
                {" · due "}
                {date(r.due_date)}
              </Text>
              {r.payments.length > 0 && (
                <View style={styles.payments}>
                  {r.payments.map((p, idx) => (
                    <View key={p.payment_id || p.id || `pay-${idx}`} style={styles.paymentRow}>
                      <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                      <Text style={styles.paymentText}>
                        {rupeesFromPaise(p.amount_paise)} · {p.mode.replace("_", " ")} · {date(p.paid_at)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  h1: { fontSize: 18, fontWeight: "800", color: theme.text, flex: 1 },
  summary: { backgroundColor: theme.accent, borderRadius: 16, padding: 16 },
  summaryLabel: { fontSize: 12, color: "#ffffffcc", fontWeight: "700" },
  summaryValue: { fontSize: 24, fontWeight: "800", color: "#fff", marginTop: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 4,
  },
  month: { fontSize: 15, fontWeight: "800", color: theme.text },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  line: { fontSize: 12, color: theme.textLight },
  payments: { marginTop: 6, gap: 4, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  paymentText: { fontSize: 12, fontWeight: "600", color: theme.text },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13, color: theme.textLight, textAlign: "center" },
  error: { color: theme.danger, fontSize: 13 },
});
