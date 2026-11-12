import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";
import { ConvexProvider, ConvexReactClient } from "convex/react";

import { ViewerProvider } from "@/hooks/useViewer";
import { colors } from "@/theme/tokens";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = { anchor: "(tabs)" };

SplashScreen.preventAutoHideAsync();

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  const content = (
    <ViewerProvider>
      <Stack screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="new-event" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="rsvp/[eventId]/external" options={{ title: "RSVP" }} />
        {/* admin/leaktest: re-add this Screen entry once that route file exists (eval harness, not yet built) */}
      </Stack>
    </ViewerProvider>
  );

  // If EXPO_PUBLIC_CONVEX_URL isn't set yet (no deployment up), render without the Convex
  // provider so the app still boots — screens that need data should handle a missing client.
  if (!convex) return content;
  return <ConvexProvider client={convex}>{content}</ConvexProvider>;
}
