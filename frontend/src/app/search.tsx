import { SearchBar } from "@/components/SearchBar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { theme } from "@/lib/theme";
import { useDebounce } from "@/hooks/useDebounce";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Results = {
  pgs: { id: string; name: string; locality: string | null; city: string | null; occupied_beds: number; total_beds: number }[];
  rooms: { id: string; property_id: string; number: string; property_name: string; floor: string; sharing_type: number }[];
  tenants: { id: string; full_name: string; phone: string | null; property_id: string; property_name: string; room_number: string }[];
};

const emptyResults: Results = { pgs: [], rooms: [], tenants: [] };

export default function SearchScreen() {
  const router = useRouter();
  const { role } = useAuth();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query.trim(), 300);
  const [results, setResults] = useState<Results>(emptyResults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (debouncedQuery.length < 2) {
      setResults(emptyResults);
      setLoading(false);
      setError(null);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    api
      .get<Results>(`/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((data) => {
        if (active) setResults(data);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Search failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  const hasResults = results.pgs.length + results.rooms.length + results.tenants.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>Search</Text>
      </View>
      <SearchBar value={query} onChangeText={setQuery} autoFocus />
      {loading && <ActivityIndicator style={styles.loading} color={theme.accent} />}
      {error && <Text style={styles.error}>{error}</Text>}
      {query.trim().length < 2 && <Text style={styles.hint}>Enter at least 2 characters.</Text>}
      {!loading && !error && debouncedQuery.length >= 2 && !hasResults && (
        <Text style={styles.empty}>No results</Text>
      )}

      {results.pgs.length > 0 && (
        <Section title="PGs">
          {results.pgs.map((pg) => (
            <ResultRow
              key={pg.id}
              icon="business-outline"
              title={pg.name}
              subtitle={`${[pg.locality, pg.city].filter(Boolean).join(", ") || "Location not set"} · ${pg.occupied_beds}/${pg.total_beds} occupied beds`}
              onPress={() => router.push({ pathname: "/pg/[id]", params: { id: pg.id } })}
            />
          ))}
        </Section>
      )}
      {results.rooms.length > 0 && (
        <Section title="Rooms">
          {results.rooms.map((room) => (
            <ResultRow
              key={room.id}
              icon="bed-outline"
              title={`Room ${room.number}`}
              subtitle={`${room.property_name} · ${room.floor} floor · ${room.sharing_type}-sharing`}
              onPress={() => router.push({ pathname: "/pg/[id]", params: { id: room.property_id, roomId: room.id } })}
            />
          ))}
        </Section>
      )}
      {results.tenants.length > 0 && (
        <Section title="Tenants">
          {results.tenants.map((tenant) => (
            <ResultRow
              key={tenant.id}
              icon="person-outline"
              title={tenant.full_name}
              subtitle={`${tenant.property_name} · Room ${tenant.room_number}${role === "tenant" ? "" : tenant.phone ? ` · ${tenant.phone}` : ""}`}
              onPress={() => router.push({ pathname: "/tenant-profile/[id]", params: { id: tenant.id } })}
            />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ResultRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.icon}><Ionicons name={icon} size={19} color={theme.accentText} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingTop: 16, paddingBottom: 40 },
  heading: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  title: { color: theme.text, fontSize: 24, fontWeight: "800" },
  loading: { marginVertical: 20 },
  error: { color: theme.danger, paddingVertical: 12 },
  hint: { color: theme.textLight, paddingVertical: 8 },
  empty: { color: theme.textLight, textAlign: "center", paddingVertical: 28 },
  section: { marginTop: 10, marginBottom: 8 },
  sectionTitle: { color: theme.textLight, fontSize: 12, fontWeight: "800", textTransform: "uppercase", marginBottom: 7 },
  row: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: theme.border, padding: 12, marginBottom: 7 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: theme.accentSoft },
  rowTitle: { color: theme.text, fontWeight: "800", fontSize: 14 },
  subtitle: { color: theme.textLight, fontSize: 11, marginTop: 3 },
});
