import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Avatar, Card, Pill, Skeleton } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/tokens";

// Layout reference per the sketch: "(copy Luma page)" -- details box, chat-with-muse box, guest
// list box, hosts box.
export default function Manage() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const event = useQuery(api.events.getByEventId, { eventId });
  const guests = useQuery(api.guests.listForEvent, { eventId });
  const personas = useQuery(api.personas.listAll, {});
  const sendEvent = useMutation(api.events.sendEvent);
  const askAboutEvent = useAction(api.askAction.askAboutEvent);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);

  if (event === undefined || guests === undefined || personas === undefined) {
    return <View style={{ padding: spacing.lg, gap: spacing.md }}><Skeleton height={100} /><Skeleton height={100} /></View>;
  }
  if (!event) return <Text style={{ padding: spacing.lg }}>Event not found.</Text>;

  const host = personas.find((p) => p.id === event.hostId);
  const byId = new Map(personas.map((p) => [p.id, p]));

  const onAsk = async () => {
    if (!question.trim()) return;
    setAsking(true);
    try {
      const r = await askAboutEvent({ eventId, question: question.trim() });
      setAnswer(r.answer);
    } finally {
      setAsking(false);
    }
  };

  const onSend = async () => {
    setSending(true);
    try {
      const candidateIds = (event.shortlist ?? []).filter((s: any) => s.selected).map((s: any) => s.personaId);
      await sendEvent({ eventId, candidateIds });
      router.push(`/events/${eventId}/transcript`);
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <Card>
        <Text style={styles.sectionTitle}>Event details</Text>
        <Text style={styles.detail}>{event.title}</Text>
        <Text style={styles.detailSub}>{event.slotId} · {event.venueId}</Text>
        <Pill label={event.status} tone={event.status === "sent" ? "green" : "amber"} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Chat with muse</Text>
        <View style={styles.chatRow}>
          <TextInput style={styles.chatInput} placeholder="Ask about this event..." value={question} onChangeText={setQuestion} onSubmitEditing={onAsk} />
          <Pressable onPress={onAsk} disabled={asking}><Text style={{ color: colors.museAccent, fontWeight: "700" }}>{asking ? "…" : "Ask"}</Text></Pressable>
        </View>
        {answer && <Text style={styles.answer}>{answer}</Text>}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Guest list ({guests.length})</Text>
        {guests.map((g) => (
          <View key={g.personaId ?? g.name} style={styles.guestRow}>
            <Avatar initials={byId.get(g.personaId ?? "")?.initials ?? g.name[0]} color={byId.get(g.personaId ?? "")?.color ?? colors.textMuted} size={32} />
            <Text style={styles.guestName}>{g.name}</Text>
            <Pill label={g.status} tone={g.status === "going" ? "green" : g.status === "skip" || g.status === "cant" ? "red" : "gray"} />
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Host</Text>
        {host && (
          <View style={styles.guestRow}>
            <Avatar initials={host.initials} color={host.color} size={32} />
            <Text style={styles.guestName}>{host.name}</Text>
          </View>
        )}
      </Card>

      {event.status !== "sent" ? (
        <Pressable style={styles.sendBtn} onPress={onSend} disabled={sending}>
          <Text style={styles.sendBtnText}>{sending ? "Sending…" : "Send"}</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.sendBtn} onPress={() => router.push(`/events/${eventId}/transcript`)}>
          <Text style={styles.sendBtnText}>View live transcript</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  sectionTitle: { fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  detail: { fontSize: 16, fontWeight: "600", color: colors.text },
  detailSub: { color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  chatRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chatInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, color: colors.text },
  answer: { marginTop: spacing.sm, color: colors.text },
  guestRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  guestName: { flex: 1, color: colors.text },
  sendBtn: { backgroundColor: colors.museAccent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  sendBtnText: { color: "white", fontWeight: "700", fontSize: 16 },
});
