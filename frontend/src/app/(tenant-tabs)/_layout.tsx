import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { design } from "@/lib/design";
import { roleAccents } from "@/lib/theme";

export default function TenantTabLayout() {
  const accent = roleAccents.tenant;

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
