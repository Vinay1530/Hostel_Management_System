import { theme } from "@/lib/theme";
import { SearchBar } from "@/components/SearchBar";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function InboxScreen() {
  const router = useRouter();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Communications</Text>
      <Text style={styles.subtitle}>Stay on top of tenant reports and messages.</Text>
      <SearchBar editable={false} onPress={() => router.push("/search")} />
      <Pressable style={styles.card} onPress={() => router.push("/complaints/index")}>
        <View style={styles.icon}><Ionicons name="construct-outline" size={22} color={theme.accentText} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Tenant complaints</Text>
          <Text style={styles.meta}>Review issues, update status, and reply.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
      </Pressable>
      <Pressable style={styles.card} onPress={() => router.push("/chat")}>
        <View style={styles.icon}><Ionicons name="chatbubbles-outline" size={22} color={theme.accentText} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Property chat</Text>
          <Text style={styles.meta}>Announcements, group chat, and direct messages.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textLight} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, paddingTop: 8 },
  title: { color: theme.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: theme.textLight, fontSize: 12, marginTop: 3, marginBottom: 14 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  icon: { width: 42, height: 42, borderRadius: 13, backgroundColor: theme.accentSoft, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: theme.text, fontWeight: "800", fontSize: 15 },
  meta: { color: theme.textLight, fontSize: 12, marginTop: 3 },
});
