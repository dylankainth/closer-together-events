import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/tokens";

function WatchIcon({ color, focused }: { color: string; focused: boolean }) {
  return (
    <View>
      <Ionicons name={focused ? "play-circle" : "play-circle-outline"} size={26} color={color} />
      <View style={{ position: "absolute", top: -4, right: -8, backgroundColor: colors.danger, borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
        <Text style={{ color: "white", fontSize: 10, fontWeight: "600" }}>2</Text>
      </View>
    </View>
  );
}

// expo-router picks the initial tab from this group's own layout settings, not a <Tabs> prop.
export const unstable_settings = { anchor: "menu" };

// Bottom bar clones the real Facebook app's 6 icons (reference: d73aec4f-...jpg). Only "menu" is
// a real screen for this product; the rest are chrome placeholders (home/watch/friends/profile/
// notifications aren't part of Muse Events' scope).
export default function TabLayout() {
  return (
    <Tabs
      backBehavior="initialRoute"
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.text,
        headerShown: false,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen name="home" options={{ tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={26} color={color as string} /> }} />
      <Tabs.Screen name="watch" options={{ tabBarIcon: (p) => <WatchIcon color={p.color as string} focused={p.focused} /> }} />
      <Tabs.Screen name="friends" options={{ tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "people" : "people-outline"} size={26} color={color as string} /> }} />
      <Tabs.Screen name="profile" options={{ tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={26} color={color as string} /> }} />
      <Tabs.Screen name="notifications" options={{ tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "notifications" : "notifications-outline"} size={26} color={color as string} /> }} />
      <Tabs.Screen name="menu" options={{ tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "menu" : "menu-outline"} size={26} color={color as string} /> }} />
    </Tabs>
  );
}
