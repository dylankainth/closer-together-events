import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { agent as palette } from "@/theme/swipeTheme";

/** Host-only. The interval reveals a stalled lease even when the server has stopped writing. */
export function HuddleRecovery({ eventId }: { eventId: string }) {
  const state = useQuery(api.huddleRecovery.forEvent, { eventId });
  const retry = useMutation(api.huddleRecovery.retry);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);
  if (!state || (!state.runs.length && !state.legacy)) return null;
  const send = async (run?: (typeof state.runs)[number]) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      const result = await retry({ eventId, ...(run ? { runId: run.runId, attempt: run.attempt } : {}) });
      setMessage(result.started ? "Restarting conversations…" : "The conversation has already moved on. No restart needed.");
    } catch {
      setMessage("Couldn't restart. Please try again.");
    } finally { lock.current = false; setBusy(false); }
  };
  return <View style={styles.box}>
    {state.runs.map((run) => {
      const stalled = (run.status === "running" || run.status === "queued") && now >= run.leaseUntil;
      const recoverable = stalled || run.status === "failed";
      return <View key={run.runId} style={styles.row}>
        <Text style={styles.text}>{run.count} Muse conversation{run.count === 1 ? "" : "s"}: {recoverable ? "interrupted" : run.status === "completed" ? "complete" : "in progress"}</Text>
        {recoverable && <Pressable onPress={() => void send(run)} disabled={busy} accessibilityRole="button" style={styles.button}>
          <Text style={styles.link}>{busy ? "Restarting…" : "Retry conversations"}</Text>
        </Pressable>}
      </View>;
    })}
    {state.legacy && now >= state.legacy.retryAt && <View style={styles.row}>
      <Text style={styles.text}>{state.legacy.count} earlier Muse conversation{state.legacy.count === 1 ? "" : "s"} haven't finished.</Text>
      <Pressable onPress={() => void send()} disabled={busy} accessibilityRole="button" style={styles.button}>
        <Text style={styles.link}>{busy ? "Restarting…" : "Retry conversations"}</Text>
      </Pressable>
    </View>}
    {!!message && <Text style={styles.text} accessibilityLiveRegion="polite">{message}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  box: { marginHorizontal: 20, marginVertical: 12, padding: 14, borderRadius: 12, backgroundColor: palette.panel, gap: 10 },
  row: { gap: 8 }, text: { color: palette.sub, fontSize: 13, lineHeight: 19 },
  button: { alignSelf: "flex-start", paddingVertical: 6 }, link: { color: palette.going, fontWeight: "700", fontSize: 14 },
});
