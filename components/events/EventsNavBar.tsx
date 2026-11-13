import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountSheet } from "@/components/AccountSheet";
import { discover } from "@/theme/swipeTheme";

const ICON = 27; // every icon is the same size, and every one is the outlined style

/**
 * Bottom bar for the feed: your picks (the swipe stack), the general feed, a plus to make an event, and
 * your profile (opens the same account sheet as the Menu's profile row). The icons are all outlined; the
 * current screen is shown with a darker colour, not a filled icon. Picks and feed use `navigate`, so
 * switching between them jumps to the screen that's already open instead of stacking another copy.
 */
export function EventsNavBar({ active, picks = 0 }: { active: "picks" | "feed"; picks?: number }) {
  const [accountOpen, setAccountOpen] = useState(false);
  // Leave room for the phone's own navigation buttons / gesture bar, which sit over the bottom of the screen.
  const insets = useSafeAreaInsets();
  const on =(screen: "picks" | "feed") => (active === screen ? discover.text : discover.muted);

  return (
    <>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
        <Pressable style={styles.item} onPress={() => router.navigate("/events/recommended")} accessibilityLabel="Your picks">
          <Ionicons name="star-outline" size={ICON} color={on("picks")} />
          {picks > 0 && <View style={styles.dot} />}
        </Pressable>

        <Pressable style={styles.item} onPress={() => router.navigate("/events/feed")} accessibilityLabel="Feed">
          <Ionicons name="compass-outline" size={ICON} color={on("feed")} />
        </Pressable>

        <Pressable style={styles.item} onPress={() => router.push("/new-event/planning")} accessibilityLabel="Make an event">
          {/* The plus glyph has a lot of empty space around its lines, so it needs a bigger box to look the same size. */}
          <Ionicons name="add-outline" size={ICON + 12} color={discover.muted} />
        </Pressable>

        <Pressable style={styles.item} onPress={() => setAccountOpen(true)} accessibilityLabel="Profile">
          <Ionicons name="person-outline" size={ICON} color={discover.muted} />
        </Pressable>
      </View>
      <AccountSheet visible={accountOpen} onClose={() => setAccountOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: discover.card,
    borderTopWidth: 1,
    borderTopColor: discover.line,
    paddingTop: 8,
    paddingBottom: 24,
  },
  item: { flex: 1, height: 46, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 6, right: "30%", width: 9, height: 9, borderRadius: 5, backgroundColor: "#EF4444" },
});
