import { Stack } from "expo-router";
import { colors } from "@/theme/tokens";

export default function NewEventLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }}>
      {/* Both the opening "what are we making happen" prompt and the checklist live on this one
          full-bleed dark screen with its own back button — see planning.tsx. */}
      <Stack.Screen name="planning" options={{ headerShown: false, contentStyle: { backgroundColor: "#141418" } }} />
    </Stack>
  );
}
