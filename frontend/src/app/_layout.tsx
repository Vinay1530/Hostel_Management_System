import { PgProvider } from "@/lib/pg";
import { AuthProvider } from "@/lib/auth";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <AuthProvider>
      <PgProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="tenant" />
          <Stack.Screen name="create-pg" />
          <Stack.Screen name="property/[id]" />
          <Stack.Screen name="pg/[id]" />
          <Stack.Screen name="search" />
          <Stack.Screen name="tenant-profile/[id]" />
          <Stack.Screen name="complaints" />
          <Stack.Screen name="complaints/new" />
          <Stack.Screen name="complaints/[id]" />
          <Stack.Screen name="chat" />
        </Stack>
      </PgProvider>
    </AuthProvider>
  );
}
