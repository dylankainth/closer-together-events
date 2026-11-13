import { Stack } from "expo-router";
import { colors } from "@/theme/tokens";

export default function NewEventLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* The checklist is a full-bleed dark screen with its own back button. */}
      <Stack.Screen name="planning" options={{ headerShown: false, contentStyle: { backgroundColor: "#141418" } }} />
    </Stack>
  );
}
