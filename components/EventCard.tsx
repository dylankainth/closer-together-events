import React from "react";
import { EventBanner } from "./events/EventBanner";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AvatarStack, Pill } from "./ui";
import { colors, radius, spacing } from "@/theme/tokens";

export interface EventCardData {
  eventId: string;
  title: string;
  poster?: { url: string } | null;
  hostName: string;
  slotLabel?: string;
  venueArea?: string;
  goingPeople: { initials: string; color: string }[];
  goingCount: number;
  nudgeReason?: string;
}

export function EventCard({ event }: { event: EventCardData }) {
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/events/${event.eventId}/flyer`)}>
      <EventBanner eventId={event.eventId} posterUrl={event.poster?.url} style={styles.poster} />
      <View style={{ padding: spacing.md }}>
        <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        <Text style={styles.sub}>
          {event.hostName} · {event.slotLabel ?? "Date TBD"}{event.venueArea ? ` · ${event.venueArea}` : ""}
        </Text>
        {event.nudgeReason ? (
          <View style={{ marginTop: spacing.sm }}>
            <Pill label="Why you" tone="purple" />
            <Text style={styles.nudge} numberOfLines={2}>{event.nudgeReason}</Text>
          </View>
        ) : null}
        <View style={styles.footer}>
          <AvatarStack people={event.goingPeople} />
          <Text style={styles.sub}>{event.goingCount} going</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 260, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginRight: spacing.md },
  poster: { width: "100%", height: 120 },
  title: { fontWeight: "700", fontSize: 16, color: colors.text },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  nudge: { color: colors.text, fontSize: 13, marginTop: 4 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
});
