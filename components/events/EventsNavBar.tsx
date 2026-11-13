import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { AccountSheet } from "@/components/AccountSheet";
import { Avatar } from "@/components/ui";
import { discover, swipe } from "@/theme/swipeTheme";

/**
 * Bottom bar shared by the two main Events screens: your picks (the swipe stack), the general feed,
 * a plus to make an event, and your profile (opens the same account sheet as the Menu's profile row).
 * Picks and feed use `navigate`, so switching between them jumps to the screen that's already open
 * instead of stacking another copy.
 */
export function EventsNavBar({ active, picks = 0 }: { active: "picks" | "feed"; picks?: number }) {
  const { viewerId } = useViewer();
  const me = useQuery(api.personas.getByPersonaId, { personaId: viewerId });
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <>
      <View style={styles.bar}>
        <Pressable style={styles.item} onPress={() => router.navigate("/events/recommended")} accessibilityLabel="Your picks">
          <Ionicons name={active === "picks" ? "star" : "star-outline"} size={26} color={active === "picks" ? discover.text : discover.muted} />
          {picks > 0 && <View style={styles.dot} />}
        </Pressable>

        <Pressable style={styles.item} onPress={() => router.navigate("/events/feed")} accessibilityLabel="Feed">
          <Ionicons name={active === "feed" ? "compass" : "compass-outline"} size={27} color={active === "feed" ? discover.text : discover.muted} />
        </Pressable>

        <Pressable style={styles.item} onPress={() => router.push("/new-event/planning")} accessibilityLabel="Make an event">
          <View style={styles.plus}>
            <Ionicons name="add" size={26} color="#fff" />
          </View>
        </Pressable>

        <Pressable style={styles.item} onPress={() => setAccountOpen(true)} accessibilityLabel="Profile">
          {me ? <Avatar initials={me.initials} color={me.color} size={30} /> : <Ionicons name="person-circle-outline" size={30} color={discover.muted} />}
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
  plus: { width: 46, height: 46, borderRadius: 23, backgroundColor: swipe.ink, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 6, right: "30%", width: 9, height: 9, borderRadius: 5, backgroundColor: "#EF4444" },
});
