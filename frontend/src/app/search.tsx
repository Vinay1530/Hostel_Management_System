import { SearchBar } from "@/components/SearchBar";
import { AppText, EmptyState, Skeleton } from "@/components/ui-components";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { design, getShadow } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { useDebounce } from "@/hooks/useDebounce";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Results = {
  pgs: {
    id: string;
    name: string;
    locality: string | null;
    city: string | null;
    occupied_beds: number;
    total_beds: number;
  }[];
  rooms: {
    id: string;
    property_id: string;
    number: string;
    property_name: string;
    floor: string;
    sharing_type: number;
  }[];
  tenants: {
    id: string;
    full_name: string;
    phone: string | null;
    property_id: string;
    property_name: string;
    room_number: string;
  }[];
};

const emptyResults: Results = { pgs: [], rooms: [], tenants: [] };
const accent = roleAccents.manager;

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

  const total =
    results.pgs.length + results.rooms.length + results.tenants.length;
  const hasResults = total > 0;

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>QUICK FIND</Text>
            <AppText variant="h2" color="#fff">
              Search
            </AppText>
            <AppText variant="caption" color="rgba(255,255,255,0.74)">
              PGs, rooms and tenants
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={query} onChangeText={setQuery} autoFocus />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {loading && (
          <View style={{ gap: 8 }}>
            <Skeleton height={64} radius={14} />
            <Skeleton height={64} radius={14} />
            <Skeleton height={64} radius={14} />
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        {!loading && query.trim().length < 2 && (
          <View style={styles.hintCard}>
            <Ionicons name="search-outline" size={16} color={accent.accent} />
            <AppText variant="bodySmall" color={design.colors.textSecondary} style={{ flex: 1 }}>
              Type at least 2 characters to find a PG, room number, tenant name or phone.
            </AppText>
          </View>
        )}

        {!loading && !error && debouncedQuery.length >= 2 && !hasResults && (
          <EmptyState
            icon="search-outline"
            title="No results"
            subtitle={`Nothing matched "${debouncedQuery}". Try a shorter name or a room number.`}
          />
        )}

        {results.pgs.length > 0 && (
          <Section title="PGs" count={results.pgs.length}>
            {results.pgs.map((pg) => (
              <ResultRow
                key={pg.id}
                icon="business-outline"
                title={pg.name}
                subtitle={`${[pg.locality, pg.city].filter(Boolean).join(", ") || "Location not set"} · ${pg.occupied_beds}/${pg.total_beds} occupied`}
                onPress={() => router.push({ pathname: "/pg/[id]", params: { id: pg.id } })}
              />
            ))}
          </Section>
        )}

        {results.rooms.length > 0 && (
          <Section title="Rooms" count={results.rooms.length}>
            {results.rooms.map((room) => (
              <ResultRow
                key={room.id}
                icon="bed-outline"
                title={`Room ${room.number}`}
                subtitle={`${room.property_name} · ${room.floor} floor · ${room.sharing_type}-sharing`}
                onPress={() =>
                  router.push({ pathname: "/pg/[id]", params: { id: room.property_id, roomId: room.id } })
                }
              />
            ))}
          </Section>
        )}

        {results.tenants.length > 0 && (
          <Section title="Tenants" count={results.tenants.length}>
            {results.tenants.map((tenant) => (
              <ResultRow
                key={tenant.id}
                icon="person-outline"
                title={tenant.full_name}
                subtitle={`${tenant.property_name} · Room ${tenant.room_number}${
                  role === "tenant" ? "" : tenant.phone ? ` · ${tenant.phone}` : ""
                }`}
                onPress={() =>
                  router.push({ pathname: "/tenant-profile/[id]", params: { id: tenant.id } })
                }
              />
            ))}
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="label" color={design.colors.textSecondary}>
          {title.toUpperCase()}
        </AppText>
        <AppText variant="caption" color={design.colors.textMuted}>
          {count}
        </AppText>
      </View>
      <View style={styles.sectionCard}>{children}</View>
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
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={19} color={accent.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText
          variant="body"
          color={design.colors.textPrimary}
          style={{ fontWeight: "800" }}
          numberOfLines={1}
        >
          {title}
        </AppText>
        <AppText
          variant="caption"
          color={design.colors.textSecondary}
          style={{ marginTop: 2 }}
          numberOfLines={1}
        >
          {subtitle}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={design.colors.textMuted} />
    </TouchableOpacity>
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
    backgroundColor: accent.accent,
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  searchWrap: { paddingHorizontal: 16, paddingTop: 14 },
  scroll: { flex: 1 },
  content: { padding: 16, paddingTop: 4, paddingBottom: 40, gap: 12 },

  hintCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 13,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: design.colors.border,
  },
  error: { color: design.colors.danger, fontSize: 12, textAlign: "center" },

  section: { gap: 6 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: design.colors.border,
    overflow: "hidden",
    ...getShadow("sm"),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: design.colors.border,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: accent.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
