import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { theme } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  property_name: string;
  room_number: string;
  move_in_date: string;
};

export default function TenantProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { role } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Profile>(`/search/tenants/${id}`)
      .then(setProfile)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load tenant"));
  }, [id]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={22} color={theme.text} /><Text style={styles.backText}>Back</Text></Pressable>
      {!profile && !error && <ActivityIndicator color={theme.accent} />}
      {error && <Text style={styles.error}>{error}</Text>}
      {profile && (
        <View style={styles.card}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{profile.full_name.slice(0, 1).toUpperCase()}</Text></View>
          <Text style={styles.title}>{profile.full_name}</Text>
          {role !== "tenant" && profile.phone && <Info label="Phone" value={profile.phone} />}
          <Info label="PG" value={profile.property_name} />
          <Info label="Room" value={profile.room_number} />
          <Info label="Move-in date" value={profile.move_in_date} />
        </View>
      )}
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <View style={styles.info}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingTop: 20 },
  back: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 18 },
  backText: { color: theme.text, fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: theme.border, padding: 18, alignItems: "flex-start" },
  avatar: { width: 52, height: 52, borderRadius: 17, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  avatarText: { color: theme.accentText, fontWeight: "800", fontSize: 22 },
  title: { color: theme.text, fontSize: 22, fontWeight: "800", marginBottom: 14 },
  info: { marginTop: 12 },
  label: { color: theme.textLight, fontSize: 11 },
  value: { color: theme.text, fontSize: 14, fontWeight: "700", marginTop: 3 },
  error: { color: theme.danger },
});
