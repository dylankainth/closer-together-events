import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Pill, Skeleton } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/tokens";

// Simplification (noted in design/sketches/01-muse-events-flow.md): planEvent runs to completion
// before navigating here (see new-event/questions.tsx), so the checklist below renders already-
// filled rather than ticking off live. The approval chat is a client-side mock reading the
// event's `drafts` field, not a full bidirectional agent conversation — a stretch goal, not core.
export default function Planning() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const event = useQuery(api.events.getByEventId, { eventId });
  const approve = useMutation(api.events.approve);
  const [messages, setMessages] = useState<{ from: "agent" | "me"; text: string }[]>([]);
  const [draft, setDraft] = useState("");

  if (event === undefined) {
    return (
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton height={20} /><Skeleton height={20} /><Skeleton height={20} />
      </View>
    );
  }
  if (!event) return <Text style={{ padding: spacing.lg }}>Event not found.</Text>;

  const checklist = [
    { label: "Picked the date", done: !!event.slotId },
    { label: `Shortlisted ${event.venueOptions?.length ?? 0} venues`, done: !!event.venueId },
    { label: "Made the poster", done: !!event.poster },
    { label: "Ordering the cake", done: !!event.drafts?.length },
  ];
  const cakeDraft = event.drafts?.find((d: any) => d.item === "cake");

  const onApprove = async () => {
    await approve({ eventId });
    router.replace(`/events/${eventId}/flyer`);
  };

  const send = () => {
    if (!draft.trim()) return;
    const mine = draft.trim();
    setMessages((m) => [...m, { from: "me", text: mine }]);
    setDraft("");
    setTimeout(() => setMessages((m) => [...m, { from: "agent", text: "Got it — noted. Anything else before I lock this in?" }]), 400);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
      <Text style={styles.header}>Your agent is on it</Text>
      <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
        {checklist.map((c) => (
          <View key={c.label} style={styles.checkRow}>
            <Ionicons
              name={c.done ? "checkmark-circle" : "time-outline"}
              size={18}
              color={c.done ? colors.museAccent : colors.textMuted}
            />
            <Text style={styles.checkLabel}>{c.label}</Text>
          </View>
        ))}
      </View>

      {cakeDraft && (
        <View style={styles.chatBubble}>
          <Pill label="Agent" tone="purple" />
          <Text style={styles.chatText}>{cakeDraft.draft} {cakeDraft.simulatedReply}</Text>
        </View>
      )}
      {messages.map((m, i) => (
        <View key={i} style={[styles.chatBubble, m.from === "me" && styles.chatBubbleMine]}>
          <Text style={styles.chatText}>{m.text}</Text>
        </View>
      ))}

      <View style={styles.composer}>
        <TextInput style={styles.composerInput} placeholder="Message your agent..." value={draft} onChangeText={setDraft} onSubmitEditing={send} />
        <Pressable onPress={send}><Text style={{ color: colors.museAccent, fontWeight: "700" }}>Send</Text></Pressable>
      </View>

      <Pressable style={styles.approve} onPress={onApprove}>
        <Text style={styles.approveText}>Looks good — approve</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { fontSize: 22, fontWeight: "700", color: colors.text },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkLabel: { color: colors.text, fontSize: 15 },
  chatBubble: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start", maxWidth: "90%" },
  chatBubbleMine: { alignSelf: "flex-end", backgroundColor: colors.museTint, borderColor: colors.museAccent },
  chatText: { color: colors.text, marginTop: 4 },
  composer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  composerInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.card, color: colors.text },
  approve: { marginTop: spacing.xl, backgroundColor: colors.museAccent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  approveText: { color: "white", fontWeight: "700", fontSize: 16 },
});
