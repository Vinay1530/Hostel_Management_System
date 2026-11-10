import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { design } from "@/lib/design";
import { roleAccents } from "@/lib/theme";
import { useAuth } from "@/lib/auth";

export default function TenantTabLayout() {
  const { ready, token } = useAuth();
  const accent = roleAccents.tenant;

  // Signing out clears the token: never leave tenant tabs mounted without it.
  if (!ready) return null;
  if (!token) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent.accent,
        tabBarInactiveTintColor: design.colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopWidth: 1,
          borderTopColor: design.colors.border,
          height: 68,
          paddingTop: 6,
          paddingBottom: 4,
        } as any,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "My Stay",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <Ionicons name={focused ? "bed" : "bed-outline"} size={24} color={focused ? accent.accent : design.colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="dues"
        options={{
          title: "Dues",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <Ionicons name={focused ? "cash" : "cash-outline"} size={24} color={focused ? accent.accent : design.colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "Chat",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={24} color={focused ? accent.accent : design.colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={24} color={focused ? accent.accent : design.colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen name="history" options={{ href: null }} />
    </Tabs>
  );
}
