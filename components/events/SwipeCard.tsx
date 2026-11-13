import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { AvatarStack } from "@/components/ui";
import { discover, parseSlot, priceLabel, swipe } from "@/theme/swipeTheme";

export type EventView = FunctionReturnType<typeof api.feed.forViewer>["recommended"][number];

const VERDICT_WORD: Record<string, string> = { worth: "Go.", maybe: "Maybe.", skip: "Skip." };
const VERDICT_COLOR: Record<string, string> = { worth: swipe.blue, maybe: "#A8700A", skip: discover.muted };
const BANNERS = ["#374B7C", "#B0694B", "#4A7B5A", "#C4BDD6"]; // placeholder colours until an event has a poster
const TAG_LABEL = { people: "PEOPLE", goal: "GOAL", fit: "FIT", plan: "PLAN" } as const;

const bannerColor = (id: string) => BANNERS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % BANNERS.length];
const first = (name: string) => name.split(" ")[0];

/**
 * One recommendation in the "Your agent's picks" stack. Presentational: the swipe gestures and the
 * progress header live in the screen. Every line below the banner is written by the viewer's Muse
 * (the screen header says so), so there's no per-line label.
 */
export function SwipeCard({ ev, onOpen }: { ev: EventView; onOpen: () => void }) {
  const verdict = ev.verdict ?? "worth";
  const tone = VERDICT_COLOR[verdict];
  const slot = parseSlot(ev.slotLabel);
  const meta = [slot ? `${slot.weekday} ${slot.day} · ${slot.time}` : ev.slotLabel, priceLabel(ev.priceTier)].filter(Boolean).join(" · ");
  // `chips` only exists once the updated convex/feed.ts is deployed; until then the card shows no rows.
  const chips = ev.chips ?? [];
  const headline = ev.reasons[0] ?? chips[0]?.text ?? `${ev.host?.name ?? "Someone"} is hosting.`;
  const rows = chips.filter((c) => c.text !== headline).slice(0, 3);
  const goingText =
    ev.friendsGoing.length > 0
      ? ev.friendsGoing.map((f) => `${first(f.name)}'s in`).join(" · ")
      : "No friends you know are going yet";

  return (
    <Pressable style={styles.card} onPress={onOpen}>
      <View style={[styles.banner, { backgroundColor: bannerColor(ev.eventId) }]}>
        {ev.poster ? <Image source={{ uri: ev.poster.url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>

      <View style={styles.verdictRow}>
        <Text style={[styles.verdict, { color: tone }]}>{ev.verdict ? VERDICT_WORD[verdict] : "New."}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <Text style={styles.title} numberOfLines={1}>{ev.title}</Text>
      <Text style={styles.headline}>{headline}</Text>

      <View style={styles.rows}>
        {rows.map((c, i) => (
          <View key={i} style={styles.row}>
            <Text style={[styles.tag, { color: tone }]}>{TAG_LABEL[c.kind]}</Text>
            <Text style={styles.rowText}>{c.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.pill}>
        {ev.friendsGoing.length > 0 && <AvatarStack people={ev.friendsGoing} max={3} />}
        <Text style={styles.pillText} numberOfLines={1}>{goingText}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  banner: { aspectRatio: 1.75, borderRadius: 22, overflow: "hidden" },
  verdictRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 12 },
  verdict: { fontSize: 44, lineHeight: 48, fontWeight: "800", letterSpacing: -1 },
  meta: { color: discover.muted, fontSize: 12, paddingBottom: 8 },
  title: { color: discover.textDim, fontSize: 14, fontWeight: "700", marginTop: 2 },
  headline: { color: swipe.ink, fontSize: 22, lineHeight: 28, fontWeight: "800", marginTop: 8 },
  rows: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#ECECF0" },
  row: { flexDirection: "row", gap: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#ECECF0" },
  tag: { width: 58, fontSize: 10, fontWeight: "800", letterSpacing: 1, paddingTop: 3 },
  rowText: { flex: 1, color: swipe.ink, fontSize: 15, lineHeight: 20 },
  pill: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#F1F1F4", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 },
  pillText: { flex: 1, color: discover.textDim, fontSize: 14 },
});
