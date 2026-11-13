import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { ConditionalState } from "@/convex/conditionalRsvp";
import { swipe } from "@/theme/swipeTheme";

export function ConditionalRsvpNotice({ state, friendName, busy, onConfirm, compact = false, showConfirm = true }: {
  state: ConditionalState; friendName?: string; busy: boolean; onConfirm: () => void; compact?: boolean; showConfirm?: boolean;
}) {
  const name = friendName ?? "Your friend";
  const title = state === "ready" ? `${name} is going` : state === "waiting" ? `Waiting on ${name}` : state === "declined" ? `${name} isn't going` : "Your friend's invitation changed";
  return <View style={styles.card}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.body}>{compact ? "Your answer is still Maybe. Confirm going if you'd like to join." : state === "ready"
      ? "You said you'd go if they did. You're still marked Maybe—confirm when you're ready."
      : state === "waiting" ? "You said you'd go if they did. Your answer stays Maybe until you confirm."
      : "Your answer is still Maybe. You can choose to go yourself or change your answer."}</Text>
    {state === "ready" && showConfirm && <Pressable onPress={onConfirm} disabled={busy} style={[styles.button, busy && { opacity: 0.6 }]}
      accessibilityRole="button" accessibilityState={{ disabled: busy, busy }}>
      {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Confirm going</Text>}
    </Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  card: { marginTop: 12, padding: 16, borderRadius: 16, backgroundColor: swipe.lavender, gap: 8 },
  title: { color: swipe.ink, fontWeight: "600", fontSize: 17 }, body: { color: swipe.ink, fontSize: 14, lineHeight: 21 },
  button: { backgroundColor: swipe.blue, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, alignSelf: "flex-start" },
  buttonText: { color: "white", fontWeight: "600" },
});
