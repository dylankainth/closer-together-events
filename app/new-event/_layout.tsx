import { Stack } from "expo-router";
import { colors } from "@/theme/tokens";

export default function NewEventLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }}>
      <Stack.Screen name="index" options={{ title: "New event" }} />
      <Stack.Screen name="questions" options={{ title: "A few quick questions" }} />
      <Stack.Screen name="planning" options={{ title: "Your agent is on it", headerBackVisible: false }} />
    </Stack>
  );
}
