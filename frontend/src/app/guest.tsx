import { fetchPublicPgs, type PublicPgSummary } from "@/lib/public";
import { rupeesFromPaise } from "@/lib/api";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useState } from "react";

export default function GuestDirectory() {
  const router = useRouter();
  const [pgs, setPgs] = useState<PublicPgSummary[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await fetchPublicPgs()
          .then(setPgs)
          .catch((e: any) => setError(e?.message ?? "Failed to load PG list"));
      } catch (e: any) {
        setError(e?.message ?? "Failed to load PG list");
      }
    })();
  }, []);

  const filtered = pgs.filter((p) =>
    q.trim().length === 0
      ? true
      : `${p.name} ${p.city ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.accentText} />
        </Pressable>
        <Text style={styles.h1}>Browse PGs</Text>
      </View>

      <View style={{ padding: 16, paddingTop: 0 }}>
      <TextInput
        style={styles.search}
        placeholder="Search by name or city…"
        placeholderTextColor={theme.textLight}
        value={q}
        onChangeText={setQ}
      />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40, gap: 10 }}>
        {error && <Text style={styles.error}>{error}</Text>}
        {!error && filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="home-outline" size={36} color={theme.textLight} />
            <Text style={styles.emptyText}>
              {pgs.length === 0 ? "No PGs registered yet." : "No PGs match your search."}
            </Text>
          </View>
        )}
        {filtered.map((p) => (
          <Pressable key={p.id} style={styles.card} onPress={() => router.push({ pathname: "/guest/[orgId]", params: { orgId: p.id } })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.meta}>
                {p.buildings_count > 0
                  ? `${p.buildings_count} building${p.buildings_count > 1 ? "s" : ""} · ${p.vacant_count} of ${p.beds_count} beds vacant`
                  : "No beds listed yet"}
              </Text>
              {p.city && <Text style={styles.meta}>📍 {p.city}</Text>}
              {p.rent_min_paise != null && (
                <Text style={styles.rent}>
                  {p.rent_min_paise === (p.rent_max_paise ?? p.rent_min_paise)
                    ? `From ${rupeesFromPaise(p.rent_min_paise)}`
                    : `${rupeesFromPaise(p.rent_min_paise)} – ${rupeesFromPaise(p.rent_max_paise ?? p.rent_min_paise)}`}
                  {" / bed"}
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
          </Pressable>
        ))}
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
  search: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 12,
    fontSize: 14,
    color: theme.text,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
  },
  name: { fontSize: 16, fontWeight: "800", color: theme.text },
  meta: { fontSize: 12, color: theme.textLight, marginTop: 2 },
  rent: { fontSize: 13, fontWeight: "800", color: theme.accentText, marginTop: 4 },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13, color: theme.textLight },
  error: { color: theme.danger, fontSize: 13 },
});
