import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";

// The agent room: one person's Muse deliberating with their friends' Muses about a single event.
// Reached by tapping a row in the swarm's "What the Muses are saying" feed. Same dark one-off
// palette as swarm.tsx (deliberately not theme/tokens.ts, which is the light Facebook chrome).
const palette = {
  bg: "#0E0F14",
  panelLine: "#23252D",
  text: "#F2F1EC",
  muted: "#8A8D96",
  dim: "#6E717A",
  card: "#23252D",
  going: "#5BD69A",
  maybe: "#F2C14E",
  link: "#AFC0FF",
  darkFg: "#0E0F14",
  // Deeper than the swarm's #4F6BFF "talking" blue: this is a filled chat bubble carrying body
  // text, so it needs enough weight to hold white text at 15px without vibrating against the ground.
  bubbleMe: "#2F4BE8",
};

const VERDICT: Record<string, { label: string; tint: string }> = {
  worth: { label: "VERDICT: GO", tint: palette.bubbleMe },
  maybe: { label: "VERDICT: MAYBE", tint: palette.maybe },
  skip: { label: "VERDICT: SKIP", tint: "#4A4D57" },
};

// huddle.ts/huddleChat.ts prefix every line with who is speaking ("Muse (Sam): …", or
// "Muse (Maya) → Muse (Sam): …") because the flat transcript screen has no other attribution.
// Here the avatar and the name label already say it, so the prefix is noise — strip it.
function stripSpeaker(text: string): string {
  return text.replace(/^Muse \([^)]*\)(\s*→\s*Muse \([^)]*\))?:\s*/u, "").replace(/^"|"$/gu, "");
}

export default function Room() {
  const { eventId, personaId } = useLocalSearchParams<{ eventId: string; personaId: string }>();
  const { viewerId } = useViewer();

  const event = useQuery(api.events.getByEventId, { eventId });
  const personas = useQuery(api.personas.listAll, {}) ?? [];
  const guests = useQuery(api.guests.listForEvent, { eventId }) ?? [];
  const slots = useQuery(api.slots.listPublic, {}) ?? [];
  const updateRsvp = useMutation(api.events.updateRsvp);
  const [saving, setSaving] = useState(false);

  const isHost = !!event && event.hostId === viewerId;
  // messagesForEvent only accepts `forPersona` for someone you may read as, so the host fetches the
  // whole transcript and filters locally; anyone else can only ever ask for their own thread.
  const messages =
    useQuery(api.huddleData.messagesForEvent, isHost ? { eventId } : { eventId, forPersona: viewerId }) ?? [];

  const byId = useMemo(() => new Map(personas.map((p: any) => [p.id, p])), [personas]);
  const person: any = byId.get(personaId);
  const guest = guests.find((g) => g.personaId === personaId);
  const slotLabel = slots.find((s: any) => s.slotId === event?.slotId)?.label ?? "";
  const firstName = (person?.name ?? guest?.name ?? "they").split(" ")[0];

  // This room is one person's deliberation: every message routed to them, in huddle order.
  const thread = useMemo(
    () => messages.filter((m) => m.forPersona === personaId).slice().sort((a, b) => a.seq - b.seq),
    [messages, personaId],
  );
  const talkingCount = useMemo(
    () => new Set(thread.filter((m) => m.fromPersona !== personaId).map((m) => m.fromPersona)).size,
    [thread, personaId],
  );

  const nudge = guest?.nudge;
  const verdict = nudge ? VERDICT[nudge.verdict] ?? VERDICT.maybe : null;
  // Only the person themselves can RSVP (events.updateRsvp enforces this server-side too) — the
  // host watching this room sees the verdict read-only rather than buttons they can't press.
  const canAct = viewerId === personaId;

  const onRsvp = async (status: "going" | "cant") => {
    if (saving) return;
    setSaving(true);
    try {
      await updateRsvp({ eventId, personaId, status });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace(`/events/${eventId}/swarm`))} hitSlop={12} style={styles.backRow}>
          <Ionicons name="arrow-back" size={16} color={palette.link} />
          <Text style={styles.backText}>Swarm</Text>
        </Pressable>
        {talkingCount > 0 && (
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{talkingCount} Muse{talkingCount === 1 ? "" : "s"} talking</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.eyebrow}>{[slotLabel, event?.title].filter(Boolean).join(" · ")}</Text>
        <Text style={styles.headline}>Should {firstName} go?</Text>

        <View style={{ gap: 14, marginTop: 20 }}>
          {thread.length === 0 && <Text style={styles.empty}>No conversation yet — the Muses haven't started on this one.</Text>}

          {thread.map((m) => {
            const mine = m.fromPersona === personaId;
            const speaker: any = byId.get(m.fromPersona);
            const text = stripSpeaker(m.text);
            // What actually crossed the wire, straight from the guard's own verdict on this
            // message — not a generic reassurance. A rewritten/blocked line is the privacy layer
            // visibly doing its job, so it's shown rather than hidden.
            const kept = m.status !== "sent" ? m.checks.join(", ") : null;
            const shared = m.status === "sent" && m.reply ? "availability, interests" : null;

            return (
              <View key={m.seq} style={{ gap: 6 }}>
                {!mine && <Text style={styles.speakerLabel}>{(speaker?.name ?? "Their").split(" ")[0]}'s Muse</Text>}
                <View style={[styles.bubbleRow, mine && { flexDirection: "row-reverse" }]}>
                  <View style={[styles.avatar, { backgroundColor: speaker?.color ?? palette.bubbleMe }]}>
                    <Text style={styles.avatarText}>{speaker?.initials ?? "M"}</Text>
                  </View>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={[styles.bubbleText, mine && { color: "#FFFFFF" }]}>{text}</Text>
                  </View>
                </View>
                {(shared || kept) && (
                  <View style={styles.chipRow}>
                    {shared && (
                      <View style={[styles.chip, { borderColor: palette.going }]}>
                        <Text style={[styles.chipText, { color: palette.going }]}>Shared: {shared}</Text>
                      </View>
                    )}
                    {kept && (
                      <View style={[styles.chip, { borderColor: "#4A4D57" }]}>
                        <Text style={[styles.chipText, { color: palette.muted }]}>Kept private: {kept}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {thread.length > 0 && !nudge && (
            <View style={styles.typingRow}>
              <View style={styles.typingDots}>
                {[0, 1, 2].map((i) => <View key={i} style={styles.typingDot} />)}
              </View>
              <Text style={styles.typingText}>{firstName}'s Muse is deciding…</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {verdict && nudge && (
        <View style={styles.verdictCard}>
          <View style={styles.verdictHead}>
            <View style={[styles.verdictPill, { backgroundColor: verdict.tint }]}>
              <Text style={styles.verdictPillText}>{verdict.label}</Text>
            </View>
            <Text style={styles.verdictMeta}>{canAct ? "your call" : "updating live"}</Text>
          </View>
          <Text style={styles.verdictBody}>{nudge.reasons?.join(" ") || nudge.text}</Text>
          {canAct ? (
            <View style={styles.verdictActions}>
              <Pressable style={[styles.btnPrimary, saving && { opacity: 0.5 }]} onPress={() => onRsvp("going")} disabled={saving}>
                <Text style={styles.btnPrimaryText}>I'm in</Text>
              </Pressable>
              <Pressable style={[styles.btnGhost, saving && { opacity: 0.5 }]} onPress={() => onRsvp("cant")} disabled={saving}>
                <Text style={styles.btnGhostText}>Not this time</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.verdictNote}>{firstName} decides this one — their Muse only suggests.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 52, paddingHorizontal: 20, paddingBottom: 10 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  backText: { color: palette.link, fontSize: 15, fontWeight: "700" },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.going },
  liveText: { color: palette.going, fontSize: 13, fontWeight: "600" },
  body: { paddingHorizontal: 20, paddingBottom: 28 },
  eyebrow: { color: palette.link, fontSize: 13, fontWeight: "600" },
  headline: { color: palette.text, fontSize: 26, lineHeight: 31, fontWeight: "800", letterSpacing: -0.3, marginTop: 6 },
  empty: { color: palette.muted, fontSize: 15, lineHeight: 21 },
  speakerLabel: { color: palette.muted, fontSize: 12.5, marginLeft: 44 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  avatarText: { color: palette.darkFg, fontSize: 12.5, fontWeight: "700" },
  bubble: { flex: 1, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 12 },
  bubbleMine: { backgroundColor: palette.bubbleMe, borderBottomRightRadius: 6 },
  bubbleTheirs: { backgroundColor: palette.card, borderBottomLeftRadius: 6 },
  bubbleText: { color: palette.text, fontSize: 15, lineHeight: 21 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginLeft: 44 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 11.5, fontWeight: "600" },
  typingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginLeft: 44 },
  typingDots: { flexDirection: "row", gap: 4 },
  typingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.dim },
  typingText: { color: palette.muted, fontSize: 13.5 },
  verdictCard: { backgroundColor: palette.text, margin: 16, borderRadius: 20, padding: 18, gap: 10 },
  verdictHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  verdictPill: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  verdictPillText: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "800", letterSpacing: 0.3 },
  verdictMeta: { color: "#6E717A", fontSize: 13 },
  verdictBody: { color: palette.darkFg, fontSize: 16, lineHeight: 22, fontWeight: "600" },
  verdictActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  btnPrimary: { flex: 1, backgroundColor: "#15161C", borderRadius: 13, paddingVertical: 14, alignItems: "center" },
  btnPrimaryText: { color: palette.text, fontSize: 15, fontWeight: "700" },
  btnGhost: { flex: 1, borderWidth: 1, borderColor: "#C9C7C0", borderRadius: 13, paddingVertical: 14, alignItems: "center" },
  btnGhostText: { color: palette.darkFg, fontSize: 15, fontWeight: "700" },
  verdictNote: { color: "#6E717A", fontSize: 13.5, lineHeight: 19 },
});
