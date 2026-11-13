import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { discover } from "@/theme/swipeTheme";

/**
 * The host's switch for acceptance-driven spread (convex/spread.ts).
 *
 * It was set once from the public/private answer during planning and was invisible afterwards —
 * the host had no way to see that a yes could surface their event to someone they never picked,
 * let alone stop it. Deliberately separate from "Let guests bring a friend": that is one friend
 * the guest chooses, this is automatic, and claude.md §5.3 is explicit that two different grants
 * should not share one control.
 *
 * Saves on toggle rather than behind a button: there is one value and no way to get it wrong, so
 * a Save step would only be a way to think you'd turned it off when you hadn't.
 */
export function SpreadControl({ eventId, enabled }: { eventId: string; enabled: boolean }) {
  const setSpread = useMutation(api.spread.setSpread);
  const [allow, setAllow] = useState(enabled);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => { setAllow(enabled); }, [enabled]);

  const toggle = async (next: boolean) => {
    if (lock.current) return;
    lock.current = true;
    setAllow(next); // optimistic: the switch should move under the thumb, not after a round trip
    setMessage("");
    try {
      await setSpread({ eventId, enabled: next });
      setMessage(next ? "On. A yes can now reach that guest's close friends." : "Off. No new invites will spread.");
    } catch (e) {
      setAllow(!next); // the server refused, so the switch must not keep claiming the new state
      setMessage(e instanceof ConvexError && typeof e.data === "string" ? e.data : "Couldn't save that. Try again.");
    } finally {
      lock.current = false;
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>Let a yes reach their friends</Text>
        <Switch value={allow} onValueChange={(v) => void toggle(v)} accessibilityLabel="Let a yes reach their friends" />
      </View>
      <Text style={styles.body}>
        When a guest says yes, close friends of theirs who aren't invited can be shown the event — at most three per
        yes, never past your capacity. Each one's own Muse decides whether to recommend it, and nobody is RSVP'd for.
        People invited this way can't spread it onward.
      </Text>
      <Text style={styles.body}>Turning this off stops future invites spreading. Anyone already invited keeps theirs.</Text>
      {!!message && <Text style={styles.body} accessibilityLiveRegion="polite">{message}</Text>}
    </View>
  );
}

// Matches GuestInviteControl exactly — these two sit together and must read as one pair of
// host permissions, not two unrelated cards.
const styles = StyleSheet.create({
  card: { margin: 20, marginBottom: 0, padding: 18, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: discover.pill },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: discover.text },
  body: { color: discover.muted, fontSize: 13, lineHeight: 19 },
});
