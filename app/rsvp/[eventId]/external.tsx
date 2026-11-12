import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/tokens";

export default function ExternalRsvp() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const event = useQuery(api.events.getByEventId, { eventId });
  const rsvpExternal = useMutation(api.events.rsvpExternal);
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (event === undefined) return <View style={{ padding: spacing.lg }}><Skeleton height={300} /></View>;
  if (!event) return <Text style={{ padding: spacing.lg }}>Event not found.</Text>;

  const onSubmit = async () => {
    if (!name.trim()) return;
    await rsvpExternal({ eventId, name: name.trim() });
    setSubmitted(true);
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.header}>{event.title.split("'s ")[0]} invited you</Text>
      {event.poster?.url && <Image source={{ uri: event.poster.url }} style={styles.poster} resizeMode="cover" />}
      <Text style={styles.sub}>{event.slotId} · {event.venueId}</Text>

      {!submitted ? (
        <>
          <TextInput style={styles.input} placeholder="Your name" value={name} onChangeText={setName} />
          <Pressable style={styles.cta} onPress={onSubmit}>
            <Text style={styles.ctaText}>Going</Text>
          </Pressable>
        </>
      ) : (
        <View style={styles.afterCard}>
          <Text style={styles.afterTitle}>Get your own Muse</Text>
          <Text style={styles.afterBody}>Muse finds events worth going to, with a reason.</Text>
          <Pressable style={styles.cta} onPress={() => router.push("/(tabs)/setup")}>
            <Text style={styles.ctaText}>Continue with Facebook</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.xl },
  header: { fontSize: 22, fontWeight: "700", color: colors.text },
  poster: { width: "100%", height: 200, borderRadius: radius.lg, marginTop: spacing.md },
  sub: { color: colors.textMuted, marginTop: spacing.sm },
  input: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.text },
  cta: { marginTop: spacing.lg, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  ctaText: { color: "white", fontWeight: "700", fontSize: 16 },
  afterCard: { marginTop: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  afterTitle: { fontWeight: "700", color: colors.text, fontSize: 16 },
  afterBody: { color: colors.textMuted, marginTop: spacing.xs },
});
