import { PgProvider } from "@/lib/pg";
import { AuthProvider } from "@/lib/auth";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { design } from "@/lib/design";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: design.colors.background }}>
        <AuthProvider>
          <PgProvider>
            <StatusBar style="auto" backgroundColor={design.colors.background} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </PgProvider>
        </AuthProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}