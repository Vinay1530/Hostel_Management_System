import { api, rupeesFromPaise } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { theme } from "@/lib/theme";

type MyOverview = {
  profile: {
    full_name: string;
    phone: string;
    room_number: string | null;
    bed_label: string | null;
    property_name: string | null;
    rent_paise: number | null;
  };
  invoices: {
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
  }[];
};

export default function TenantHome() {
  const { logout, ready, token } = useAuth();
  const [data, setData] = useState<MyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!mounted && token) {
      setMounted(true);
      api
        .get<MyOverview>("/my/overview")
        .then(setData)
        .catch((e: any) => setError(e?.message ?? "Failed to load your details"));
    }
  }, [mounted, token]);

  if (!ready) return <Splash />;
  if (!token) return <Redirect href="/login" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>My Stay</Text>
        <Pressable onPress={logout}>
          <Text style={styles.logout}>Logout</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
      {!data && !error && <Text style={{ color: theme.textLight }}>Loading…</Text>}

      {data && (
        <>
          <View style={styles.card}>
            <Text style={styles.name}>{data.profile.full_name}</Text>
            <Text style={styles.meta}>
              {data.profile.property_name
                ? `${data.profile.property_name} · Room ${data.profile.room_number}/${data.profile.bed_label}`
                : "No active bed assigned yet"}
            </Text>
            {data.profile.rent_paise != null && (
              <Text style={styles.meta}>Rent: {rupeesFromPaise(data.profile.rent_paise)} / month</Text>
            )}
          </View>

          <Text style={styles.h2}>My rent</Text>
          {data.invoices.length === 0 && (
            <Text style={styles.meta}>No bills yet — your manager will generate rent bills.</Text>
          )}
          {data.invoices.map((inv) => (
            <View key={inv.invoice_id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{inv.period_month}</Text>
                <Text style={styles.meta}>
                  Due {inv.due_date} · Balance {rupeesFromPaise(inv.balance_paise)} of {rupeesFromPaise(inv.amount_paise)}
                </Text>
              </View>
              <Text style={[styles.status, statusColor(inv.status)]}>{inv.status.toUpperCase()}</Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function statusColor(status: string): { color: string; fontWeight: "700" } {
  const colors: Record<string, string> = { pending: "#f59e0b", partial: "#3b82f6", paid: "#16a34a" };
  return { color: colors[status] ?? "#94a3b8", fontWeight: "700" };
}

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator size="large" color={theme.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  h1: { fontSize: 24, fontWeight: "800", color: theme.text },
  h2: { fontSize: 16, fontWeight: "700", color: theme.text, marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: "row" },
  name: { fontSize: 16, fontWeight: "700", color: theme.text },
  meta: { fontSize: 12, color: theme.textLight, marginTop: 2 },
  logout: { color: theme.accent, fontWeight: "700" },
  status: { fontSize: 11 },
  error: { color: theme.danger, marginBottom: 8 },
});
