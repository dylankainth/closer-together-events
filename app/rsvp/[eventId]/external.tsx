import React, { useRef, useState } from "react";
import { EventBanner } from "@/components/events/EventBanner";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/tokens";

type RsvpStatus = "going" | "maybe" | "cant";
const RESPONSES: { status: RsvpStatus; label: string; confirmation: string }[] = [
  { status: "going", label: "Yes", confirmation: "You're going!" },
  { status: "maybe", label: "Maybe", confirmation: "Your answer is saved as maybe." },
  { status: "cant", label: "No", confirmation: "You've declined the invitation." },
];

export default function ExternalRsvp() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  return <Invite key={eventId} eventId={eventId} />;
}

function Invite({ eventId }: { eventId: string }) {
  const event = useQuery(api.events.getByEventId, { eventId });
  const slots = useQuery(api.slots.listPublic, {});
  const venues = useQuery(api.venues.listPublic, {});
  const host = useQuery(api.personas.getByPersonaId, event ? { personaId: event.hostId } : "skip");
  const rsvpExternal = useMutation(api.events.rsvpExternal);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState<RsvpStatus | null>(null);
  const [saving, setSaving] = useState<RsvpStatus | null>(null);
  const [failedResponse, setFailedResponse] = useState<RsvpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  if (event === undefined) return <View style={{ padding: spacing.lg }}><Skeleton height={300} /></View>;
  if (!event) return <Text style={{ padding: spacing.lg }}>Event not found.</Text>;
  if (event.status !== "sent") return <Text style={{ padding: spacing.lg }}>This invite isn't open yet.</Text>;

  const slot = slots?.find((s) => s.slotId === event.slotId);
  const venue = venues?.find((v) => v.venueId === event.venueId);
  const details = [slot?.label ?? "Date to be confirmed", venue ? [venue.name, venue.area].filter(Boolean).join(", ") : "Venue to be confirmed"];

  const onSubmit = async (status: RsvpStatus) => {
    if (inFlight.current) return;
    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 80) {
      setError("Enter your name (up to 80 characters).");
      setFailedResponse(null);
      return;
    }
    inFlight.current = true;
    setSaving(status);
    setError(null);
    setFailedResponse(null);
    try {
      await rsvpExternal({ eventId, name: trimmedName, status });
      setSubmitted(status);
    } catch {
      setError("We couldn't save your answer. Please try again.");
      setFailedResponse(status);
    } finally {
      inFlight.current = false;
      setSaving(null);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + insets.bottom }]} keyboardShouldPersistTaps="handled">
      <Text style={styles.header}>{host ? `${host.name} invited you` : "You're invited"}</Text>
      <Text style={styles.title}>{event.title}</Text>
      <EventBanner eventId={event.eventId} posterUrl={event.poster?.url} style={styles.poster} />
      {details.map((line, i) => <Text key={i} style={styles.sub}>{line}</Text>)}

      {!submitted ? (
        <>
          <Text style={styles.label}>Your name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            accessibilityLabel="Your name"
            value={name}
            onChangeText={(value) => { setName(value); setError(null); setFailedResponse(null); }}
            maxLength={80}
            editable={saving === null}
            autoCapitalize="words"
          />
          <Text style={styles.label}>Can you make it?</Text>
          <View style={styles.responses}>
            {RESPONSES.map((response) => (
              <Pressable
                key={response.status}
                style={[styles.response, response.status === "going" && styles.responsePrimary, saving !== null && styles.disabled]}
                onPress={() => void onSubmit(response.status)}
                disabled={saving !== null}
                accessibilityRole="button"
                accessibilityState={{ disabled: saving !== null, busy: saving === response.status }}
              >
                {saving === response.status && <ActivityIndicator size="small" color={response.status === "going" ? "white" : colors.text} />}
                <Text style={[styles.responseText, response.status === "going" && styles.responseTextPrimary]}>{saving === response.status ? "Saving…" : response.label}</Text>
              </Pressable>
            ))}
          </View>
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          {failedResponse ? (
            <Pressable onPress={() => void onSubmit(failedResponse)} accessibilityRole="button" style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <View style={styles.afterCard}>
          <Text style={styles.confirmation} accessibilityLiveRegion="polite">{RESPONSES.find((r) => r.status === submitted)?.confirmation}</Text>
          <Text style={styles.afterTitle}>Get your own Muse</Text>
          <Text style={styles.afterBody}>Muse finds events worth going to, with a reason.</Text>
          <Pressable style={styles.cta} onPress={() => router.push("/setup")} accessibilityRole="button">
            <Text style={styles.ctaText}>Continue with Facebook</Text>
          </Pressable>
          <Pressable style={styles.retry} onPress={() => setSubmitted(null)} accessibilityRole="button">
            <Text style={styles.retryText}>Change my answer</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl },
  header: { fontSize: 22, fontWeight: "600", color: colors.text },
  title: { marginTop: spacing.sm, fontSize: 18, fontWeight: "600", color: colors.text },
  poster: { width: "100%", height: 200, borderRadius: radius.lg, marginTop: spacing.md },
  sub: { color: colors.textMuted, marginTop: spacing.sm },
  label: { marginTop: spacing.lg, marginBottom: spacing.sm, fontWeight: "600", color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.text },
  responses: { flexDirection: "row", gap: spacing.sm },
  response: { flex: 1, flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.md },
  responsePrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  responseText: { color: colors.text, fontWeight: "600" },
  responseTextPrimary: { color: "white" },
  disabled: { opacity: 0.55 },
  error: { marginTop: spacing.md, color: "#E41E3F" },
  retry: { paddingVertical: spacing.md, alignItems: "center" },
  retryText: { color: colors.accent, fontWeight: "600", textDecorationLine: "underline" },
  cta: { marginTop: spacing.lg, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  ctaText: { color: "white", fontWeight: "600", fontSize: 16 },
  afterCard: { marginTop: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  afterTitle: { fontWeight: "600", color: colors.text, fontSize: 16 },
  confirmation: { color: colors.text, fontSize: 18, fontWeight: "600", marginBottom: spacing.lg },
  afterBody: { color: colors.textMuted, marginTop: spacing.xs },
});
