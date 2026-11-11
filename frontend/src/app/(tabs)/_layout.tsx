import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { design } from "@/lib/design";
import { useAuth } from "@/lib/auth";

export default function TabLayout() {
  const { ready, token } = useAuth();

  // Signing out clears the token: never leave staff tabs mounted without it.
  if (!ready) return null;
  if (!token) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: design.colors.primary,
        tabBarInactiveTintColor: design.colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopWidth: 1,
          borderTopColor: design.colors.border,
          height: 72,
          paddingTop: 6,
          paddingBottom: 4,
        } as any,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={26} color={focused ? design.colors.primary : design.colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="tenants"
        options={{
          title: "Tenants",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={26} color={focused ? design.colors.primary : design.colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="dues"
        options={{
          title: "Dues",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <Ionicons name={focused ? "cash" : "cash-outline"} size={26} color={focused ? design.colors.primary : design.colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="setup"
        options={{
          title: "Setup",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={26} color={focused ? design.colors.primary : design.colors.textMuted} />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <Ionicons name={focused ? "person" : "person-outline"} size={26} color={focused ? design.colors.primary : design.colors.textMuted} />
          ),
        }}
      />
    </Tabs>
  );
}