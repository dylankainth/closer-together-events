import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { AvatarStack } from "@/components/ui";
import { priceLabel, swipe } from "@/theme/swipeTheme";

export type EventView = FunctionReturnType<typeof api.feed.forViewer>["recommended"][number];

const VERDICT: Record<string, string> = { worth: "Go.", maybe: "Maybe.", skip: "Skip." };

/** Front card of the "Your week, by your agent" stack. Presentational: gestures live in the screen. */
export function SwipeCard({ ev, onOpen }: { ev: EventView; onOpen: () => void }) {
  const meta = [ev.slotLabel, ev.venue?.area, priceLabel(ev.priceTier)].filter(Boolean).join(" · ");
  const headline = ev.reasons[0] ?? `${ev.host?.name ?? "Someone"} is hosting.`;
  const micro = ev.reasons.slice(1, 3).join(" · ");
  const going = ev.friendsGoing.length > 0 ? ev.friendsGoing : ev.host ? [ev.host] : [];

  return (
    <View style={styles.card}>
      <View style={styles.banner}>
        {ev.poster ? (
          <Image source={{ uri: ev.poster.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.45)" />
        )}
        {ev.verdict && (
          <View style={styles.verdict}>
            <View style={styles.dot} />
            <Text style={styles.verdictText}>{VERDICT[ev.verdict]}</Text>
          </View>
        )}
        {ev.matchPct !== null && (
          <View style={styles.match}>
            <Text style={styles.matchText}>{ev.matchPct}% match</Text>
          </View>
        )}
      </View>

      <Pressable style={styles.body} onPress={onOpen}>
        <Text style={styles.meta}>{meta}</Text>
        <Text style={styles.title}>{ev.title} →</Text>
        {/* Every Muse-written line is labelled as from Muse. */}
        <Text style={styles.from}>✦ MUSE</Text>
        <Text style={styles.headline}>{headline}</Text>
        <View style={styles.people}>
          <AvatarStack people={going} max={3} />
          {micro ? <Text style={styles.micro} numberOfLines={2}>{micro}</Text> : null}
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText} numberOfLines={1}>
            {ev.goingCount} going{ev.vibe ? ` · ${ev.vibe}` : ""}
          </Text>
          <Text style={styles.why}>Why? →</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 28, overflow: "hidden", flex: 1 },
  banner: { aspectRatio: 1.15, backgroundColor: swipe.blueDeep, alignItems: "center", justifyContent: "center" },
  verdict: { position: "absolute", top: 14, left: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: swipe.blue },
  verdictText: { fontWeight: "800", color: swipe.ink, fontSize: 15 },
  match: { position: "absolute", top: 14, right: 14, backgroundColor: swipe.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  matchText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  body: { padding: 18, flex: 1 },
  meta: { color: "#6B6B76", fontSize: 13 },
  title: { color: swipe.ink, fontWeight: "700", fontSize: 15, marginTop: 4 },
  from: { color: swipe.blue, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 12 },
  headline: { color: swipe.ink, fontWeight: "800", fontSize: 24, lineHeight: 29, marginTop: 4 },
  people: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  micro: { flex: 1, color: "#55555F", fontSize: 13, lineHeight: 17 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 12, borderTopWidth: 1, borderTopColor: "#ECECF0" },
  footerText: { color: "#6B6B76", fontSize: 13, flex: 1 },
  why: { color: swipe.blue, fontWeight: "800", fontSize: 14 },
});
