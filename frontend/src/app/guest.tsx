import { fetchPublicPgs, type PublicPgSummary } from "@/lib/public";
import { rupeesFromPaise } from "@/lib/api";
import { getShadow } from "@/lib/design";
import { roleAccents, theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useEffect, useState } from "react";

const accent = roleAccents.guest;

export default function GuestDirectory() {
  const router = useRouter();
  const [pgs, setPgs] = useState<PublicPgSummary[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicPgs()
      .then(setPgs)
      .catch((e: any) => setError(e?.message ?? "Failed to load PG list"));
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
          <Ionicons name="chevron-back" size={22} color={accent.accentText} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>GUEST PORTAL</Text>
          <Text style={styles.h1}>Browse PGs</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          style={styles.search}
          placeholder="Search by name or city…"
          placeholderTextColor={theme.textMuted}
          value={q}
          onChangeText={setQ}
        />
        {q.length > 0 && (
          <Pressable onPress={() => setQ("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {error && <Text style={styles.error}>{error}</Text>}
        {!error && filtered.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="business-outline" size={28} color={accent.accent} />
            </View>
            <Text style={styles.emptyTitle}>
              {pgs.length === 0 ? "No PGs registered yet" : "No matches"}
            </Text>
            <Text style={styles.emptyText}>
              {pgs.length === 0
                ? "Check back soon — new PGs are added regularly."
                : "Try a different name or city."}
            </Text>
          </View>
        )}
        {filtered.map((p) => (
          <Pressable
            key={p.id}
            style={styles.card}
            onPress={() =>
              router.push({ pathname: "/guest/[orgId]", params: { orgId: p.id } })
            }
          >
            <View style={styles.iconTile}>
              <Ionicons name="business" size={22} color={accent.accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
              {p.city ? (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={11} color={theme.textLight} />
                  <Text style={styles.meta} numberOfLines={1}>{p.city}</Text>
                </View>
              ) : null}
              <Text style={styles.meta} numberOfLines={1}>
                {p.buildings_count > 0
                  ? `${p.buildings_count} building${p.buildings_count > 1 ? "s" : ""} · ${p.vacant_count}/${p.beds_count} beds vacant`
                  : "No beds listed yet"}
              </Text>
              {p.rent_min_paise != null && (
                <Text style={styles.rent}>
                  {p.rent_min_paise === (p.rent_max_paise ?? p.rent_min_paise)
                    ? `${rupeesFromPaise(p.rent_min_paise)} / bed`
                    : `${rupeesFromPaise(p.rent_min_paise)} – ${rupeesFromPaise(p.rent_max_paise ?? p.rent_min_paise)} / bed`}
                </Text>
              )}
            </View>
            <View style={styles.chevron}>
              <Ionicons name="arrow-forward" size={16} color={accent.accent} />
            </View>
          </Pressable>
        ))}
        <View style={{ height: 24 }} />
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
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
    ...getShadow("sm"),
  },
  eyebrow: { fontSize: 9, fontWeight: "800", letterSpacing: 1, color: accent.accent, marginBottom: 1 },
  h1: { fontSize: 21, fontWeight: "800", color: theme.text },
  searchWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    ...getShadow("sm"),
  },
  search: { flex: 1, color: theme.text, fontSize: 14, paddingVertical: 10 },
  list: { paddingHorizontal: 16, gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.border,
    ...getShadow("sm"),
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 16, fontWeight: "800", color: theme.text },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  meta: { fontSize: 11, color: theme.textLight, marginTop: 1 },
  rent: { fontSize: 12, fontWeight: "800", color: accent.accentText, marginTop: 3 },
  chevron: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: theme.text },
  emptyText: { fontSize: 12, color: theme.textLight, textAlign: "center", maxWidth: 240 },
  error: { color: theme.danger, fontSize: 13, paddingVertical: 8 },
});
