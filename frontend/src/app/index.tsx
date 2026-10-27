import { useAuth } from "@/lib/auth";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { theme } from "@/lib/theme";

export default function Index() {
  const { ready, token, role } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }
  if (!token) return <Redirect href="/login" />;
  if (role === "tenant") return <Redirect href="/tenant" />;
  return <Redirect href="/(tabs)/dashboard" />;
}
