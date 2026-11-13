import React from "react";
import { EventBanner } from "./EventBanner";
import { shortPlace } from "./place";
import { Mascot } from "@/components/Mascot";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { AvatarStack } from "@/components/ui";
import { discover, parseSlot, priceLabel, swipe } from "@/theme/swipeTheme";

export type EventView = FunctionReturnType<typeof api.feed.forViewer>["recommended"][number];

const VERDICT_WORD: Record<string, string> = { worth: "Go.", maybe: "Maybe.", skip: "Skip." };
const VERDICT_COLOR: Record<string, string> = { worth: swipe.blue, maybe: "#A8700A", skip: discover.muted };
const TAG_LABEL = { people: "PEOPLE", goal: "GOAL", fit: "FIT", plan: "PLAN" } as const;

const first = (name: string) => name.split(" ")[0];

/**
 * One recommendation in the "Muse's picks" stack. Presentational: the swipe gestures and the
 * progress header live in the screen. Every line below the banner is written by the viewer's Muse
 * (the screen header says so), so there's no per-line label.
 */
export function SwipeCard({ ev, onOpen }: { ev: EventView; onOpen: () => void }) {
  const verdict = ev.verdict ?? "worth";
  const tone = VERDICT_COLOR[verdict];
  const slot = parseSlot(ev.slotLabel);
  // Muse picks of real events carry their own date and place; invited events use the demo slot.
  const meta = ev.whenLabel
    ? [ev.whenLabel, shortPlace(ev.placeLabel)].filter(Boolean).join(" · ")
    : [slot ? `${slot.weekday} ${slot.day} · ${slot.time}` : ev.slotLabel, priceLabel(ev.priceTier)].filter(Boolean).join(" · ");
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
      <View style={styles.banner}>
        <EventBanner eventId={ev.eventId} posterUrl={ev.poster?.url} style={StyleSheet.absoluteFill} />
      </View>

      <View style={styles.verdictRow}>
        <Text style={[styles.verdict, { color: tone }]}>{ev.verdict ? VERDICT_WORD[verdict] : "New."}</Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      <Text style={styles.title} numberOfLines={1}>{ev.title}</Text>
      {/* Muse says it: the mascot beside a speech bubble holding the headline. */}
      <View style={styles.sayRow}>
        <Mascot size={60} />
        <View style={styles.bubble}>
          <Text style={styles.headline}>{headline}</Text>
        </View>
      </View>

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
  banner: { width: "85%", aspectRatio: 1, alignSelf: "center", borderRadius: 22, overflow: "hidden" },
  verdictRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 12 },
  verdict: { fontSize: 44, lineHeight: 48, fontWeight: "800", letterSpacing: -1 },
  meta: { color: discover.muted, fontSize: 12, paddingBottom: 8, flexShrink: 1, textAlign: "right", marginLeft: 12 },
  title: { color: discover.textDim, fontSize: 14, fontWeight: "700", marginTop: 2 },
  sayRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 12 },
  bubble: { flex: 1, backgroundColor: swipe.lavender, borderRadius: 22, borderBottomLeftRadius: 6, paddingHorizontal: 16, paddingVertical: 14 },
  headline: { color: swipe.ink, fontSize: 20, lineHeight: 26, fontWeight: "800" },
  rows: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#ECECF0" },
  row: { flexDirection: "row", gap: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#ECECF0" },
  tag: { width: 58, fontSize: 10, fontWeight: "800", letterSpacing: 1, paddingTop: 3 },
  rowText: { flex: 1, color: swipe.ink, fontSize: 15, lineHeight: 20 },
  pill: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#F1F1F4", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 },
  pillText: { flex: 1, color: discover.textDim, fontSize: 14 },
});
