import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { Pill } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/tokens";

// Simplification: dismissed with a close button rather than a full swipe-down gesture responder.
export default function Story() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { viewerId } = useViewer();
  const event = useQuery(api.events.getByEventId, { eventId });
  const guests = useQuery(api.guests.listForEvent, { eventId });
  const personas = useQuery(api.personas.listAll, {});
  const updateRsvp = useMutation(api.events.updateRsvp);

  const host = personas?.find((p) => p.id === event?.hostId);
  const myGuest = guests?.find((g) => g.personaId === viewerId);

  const respond = async (status: "going" | "maybe" | "skip" | "cant") => {
    await updateRsvp({ eventId, personaId: viewerId, status });
    router.back();
  };

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Pressable style={styles.close} onPress={() => router.back()}>
          <Ionicons name="close" size={18} color="white" />
        </Pressable>
        {event?.poster?.url ? (
          <Image source={{ uri: event.poster.url }} style={styles.photo} resizeMode="cover" />
        ) : (
          <View style={[styles.photo, { backgroundColor: colors.museTint }]} />
        )}
        <View style={styles.body}>
          <Text style={styles.title}>{event?.title ?? "Event"}</Text>
          <Text style={styles.sub}>{event?.slotId} · {event?.venueId}</Text>
          <Text style={styles.sub}>Hosted by {host?.name ?? "—"}</Text>

          {myGuest?.nudge && (
            <View style={styles.reasoning}>
              <Pill label="Agent reasoning" tone="purple" />
              <Text style={styles.reasoningText}>{myGuest.nudge.text}</Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable style={styles.remind} onPress={() => router.back()}><Text style={styles.actionText}>Remind me later</Text></Pressable>
            <Pressable style={styles.no} onPress={() => respond("cant")}><Text style={styles.actionText}>No</Text></Pressable>
            <Pressable style={styles.yes} onPress={() => respond("going")}><Text style={[styles.actionText, { color: "white" }]}>Yes</Text></Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: spacing.lg },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, overflow: "hidden" },
  close: { position: "absolute", top: spacing.md, right: spacing.md, zIndex: 1, backgroundColor: "rgba(0,0,0,0.4)", borderRadius: radius.pill, width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  photo: { width: "100%", height: 220 },
  body: { padding: spacing.lg },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  sub: { color: colors.textMuted, marginTop: 2 },
  reasoning: { marginTop: spacing.md, backgroundColor: colors.museTint, borderRadius: radius.md, padding: spacing.md },
  reasoningText: { color: colors.text, marginTop: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  remind: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  no: { flex: 1, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  yes: { flex: 1, backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  actionText: { fontWeight: "700", color: colors.text },
});
