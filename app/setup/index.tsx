import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { colors, radius, spacing } from "@/theme/tokens";

// Static stub: real Facebook OAuth needs a custom Expo dev build (confirmed by teammate
// research), out of scope for v1. This reuses the old app's "demo mode" copy/flow.
export default function Setup() {
  return (
    <View style={styles.screen}>
      <Text style={styles.header}>Get your own Muse</Text>
      <Text style={styles.body}>
        Muse finds events worth going to, with a reason. Login with Facebook is used for your name
        and photo only — no real connection is wired up in this demo build.
      </Text>
      <View style={styles.list}>
        <Text style={styles.item}>• Plans logistics for events you host</Text>
        <Text style={styles.item}>• Tells you why an event is worth it, honestly</Text>
        <Text style={styles.item}>• Never shares your private details without checking</Text>
      </View>
      <Pressable style={styles.cta} onPress={() => router.push("/events")}>
        <Text style={styles.ctaText}>Continue with Facebook (demo)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, paddingTop: spacing.xxl },
  header: { fontSize: 24, fontWeight: "700", color: colors.text },
  body: { color: colors.textMuted, marginTop: spacing.md, lineHeight: 20 },
  list: { marginTop: spacing.lg, gap: spacing.xs },
  item: { color: colors.text },
  cta: { marginTop: spacing.xl, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  ctaText: { color: "white", fontWeight: "700", fontSize: 16 },
});
