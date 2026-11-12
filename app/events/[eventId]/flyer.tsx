import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/tokens";

export default function Flyer() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const event = useQuery(api.events.getByEventId, { eventId });

  if (event === undefined) return <View style={{ padding: spacing.lg }}><Skeleton height={400} /></View>;
  if (!event) return <Text style={{ padding: spacing.lg }}>Event not found.</Text>;

  return (
    <ScrollView style={styles.screen}>
      {event.poster?.url ? (
        <Image source={{ uri: event.poster.url }} style={styles.poster} resizeMode="cover" />
      ) : (
        <View style={[styles.poster, { backgroundColor: colors.museTint }]} />
      )}
      <View style={{ padding: spacing.lg }}>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.sub}>{event.slotId} {event.venueId ? `· ${event.venueId}` : ""}</Text>
        <Text style={styles.desc}>
          {event.answers?.vibe} vibe, hosted with Muse. {event.settings?.reasons?.guestCount}
        </Text>
        <Pressable style={styles.manage} onPress={() => router.push(`/events/${eventId}/manage`)}>
          <Text style={styles.manageText}>Manage</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  poster: { width: "100%", height: 320 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  sub: { color: colors.textMuted, marginTop: 4 },
  desc: { color: colors.text, marginTop: spacing.md, lineHeight: 20 },
  manage: { marginTop: spacing.xl, backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  manageText: { color: "white", fontWeight: "700", fontSize: 16 },
});
