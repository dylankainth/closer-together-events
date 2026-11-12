import { Tabs } from "expo-router";
import { Text } from "react-native";
import { colors } from "@/theme/tokens";

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.accent, headerShown: false }}>
      <Tabs.Screen name="events" options={{ title: "Events", tabBarIcon: () => <TabIcon emoji="📅" /> }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: () => <TabIcon emoji="⚙️" /> }} />
      <Tabs.Screen name="setup" options={{ title: "Set up Muse", tabBarIcon: () => <TabIcon emoji="✨" /> }} />
    </Tabs>
  );
}
