import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { Pill, Skeleton } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/tokens";

const STATUS_TONE: Record<string, "green" | "amber" | "red"> = { sent: "green", rewritten: "amber", blocked: "red" };

// This is the client subscription that replaces the old NDJSON stream: useQuery re-renders
// automatically as convex/huddle.ts's runHuddle action inserts each message, live, with zero
// polling/refresh code.
export default function Transcript() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { viewerId } = useViewer();
  const event = useQuery(api.events.getByEventId, { eventId });
  const isHost = event?.hostId === viewerId;
  const messages = useQuery(api.huddleData.messagesForEvent, isHost ? { eventId } : { eventId, forPersona: viewerId });

  const receipt = React.useMemo(() => {
    if (!messages) return null;
    const mine = messages.filter((m) => m.forPersona === viewerId && m.kind === "reply");
    const blocked = mine.filter((m) => m.status !== "sent");
    const shared: string[] = [];
    if (mine.some((m) => m.status !== "blocked")) {
      shared.push("whether you're free then (from your calendar)");
      const interestMsg = mine.find((m) => m.reply?.reason_tag === "shared_interest");
      if (interestMsg?.reply) shared.push(`one-line reason: "${interestMsg.reply.why}"`);
    }
    return { shared, blocked: blocked.length, blockedWhy: Array.from(new Set(blocked.flatMap((m) => m.checks))) };
  }, [messages, viewerId]);

  if (messages === undefined) {
    return <View style={{ padding: spacing.lg, gap: spacing.md }}><Skeleton height={20} /><Skeleton height={20} /><Skeleton height={20} /></View>;
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={messages}
        keyExtractor={(m) => `${m.seq}`}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={<Text style={styles.empty}>Waiting for the huddle to start…</Text>}
        renderItem={({ item }) => (
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{item.text}</Text>
            <View style={styles.bubbleFooter}>
              <Pill label={item.status} tone={STATUS_TONE[item.status]} />
              {item.checks.length > 0 && <Text style={styles.checks}>{item.checks.join(", ")}</Text>}
            </View>
          </View>
        )}
      />
      {receipt && (
        <View style={styles.receipt}>
          <Text style={styles.receiptTitle}>Receipt — what was shared on your behalf</Text>
          {receipt.shared.map((s) => <Text key={s} style={styles.receiptLine}>• {s}</Text>)}
          <Text style={styles.receiptLine}>Blocked: {receipt.blocked}{receipt.blockedWhy.length ? ` (${receipt.blockedWhy.join(", ")})` : ""}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  empty: { color: colors.textMuted, textAlign: "center", marginTop: spacing.xl },
  bubble: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  bubbleText: { color: colors.text },
  bubbleFooter: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  checks: { color: colors.textMuted, fontSize: 12 },
  receipt: { borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.lg, backgroundColor: colors.card },
  receiptTitle: { fontWeight: "600", color: colors.text, marginBottom: spacing.xs },
  receiptLine: { color: colors.text, fontSize: 13 },
});
