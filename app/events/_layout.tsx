import { Stack } from "expo-router";
import { colors } from "@/theme/tokens";

export default function EventsLayout() {
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }}>
      <Stack.Screen name="index" options={{ title: "Events", headerShown: false }} />
      <Stack.Screen name="recommended" options={{ headerShown: false }} />
      <Stack.Screen name="feed" options={{ headerShown: false, animation: "slide_from_bottom" }} />
      <Stack.Screen name="[eventId]/index" options={{ headerShown: false }} />
      <Stack.Screen name="[eventId]/flyer" options={{ title: "" }} />
      <Stack.Screen name="[eventId]/manage" options={{ headerShown: false }} />
      <Stack.Screen name="[eventId]/transcript" options={{ title: "Transcript" }} />
      <Stack.Screen name="[eventId]/swarm" options={{ headerShown: false }} />
      <Stack.Screen name="[eventId]/room" options={{ headerShown: false }} />
      <Stack.Screen name="[eventId]/story" options={{ presentation: "transparentModal", headerShown: false, animation: "slide_from_bottom" }} />
    </Stack>
  );
}
