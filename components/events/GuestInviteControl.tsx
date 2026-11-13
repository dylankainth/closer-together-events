import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { discover, swipe } from "@/theme/swipeTheme";

export function GuestInviteControl({ eventId, enabled, limit }: { eventId: string; enabled: boolean; limit: number }) {
  const configure = useMutation(api.plusOnes.configure);
  const [allow, setAllow] = useState(enabled);
  const [count, setCount] = useState(String(limit));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => { setAllow(enabled); setCount(String(limit)); }, [enabled, limit]);
  const save = async () => {
    if (lock.current) return;
    const value = Number(count);
    if (allow && (!Number.isInteger(value) || value < 1 || value > 500)) {
      setMessage("Enter a whole number from 1 to 500.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await configure({ eventId, enabled: allow, limit: allow ? value : limit });
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof ConvexError && typeof e.data === "string" ? e.data : "Couldn't save permissions. Try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>Let guests bring a friend</Text>
        <Switch value={allow} onValueChange={(v) => { setAllow(v); setMessage(""); }} disabled={busy} accessibilityLabel="Let guests bring a friend" />
      </View>
      <Text style={styles.body}>Each original guest who says yes can invite one eligible friend. Those friends can't invite more people.</Text>
      {allow && <>
        <Text style={styles.label}>Total invite limit</Text>
        <TextInput value={count} onChangeText={(v) => { setCount(v); setMessage(""); }} editable={!busy} keyboardType="number-pad"
          accessibilityLabel="Total invite limit" style={styles.input} />
        <Text style={styles.body}>Includes everyone already invited and must fit the event's capacity. Raise it to leave room for friends.</Text>
      </>}
      <Pressable onPress={() => void save()} disabled={busy} style={[styles.button, busy && { opacity: 0.6 }]} accessibilityRole="button">
        <Text style={styles.buttonText}>{busy ? "Saving…" : "Save guest permissions"}</Text>
      </Pressable>
      {!!message && <Text style={styles.body} accessibilityLiveRegion="polite">{message}</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { margin: 20, marginBottom: 0, padding: 18, gap: 10, borderRadius: 16, borderWidth: 1, borderColor: discover.pill },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, fontSize: 16, fontWeight: "700", color: discover.text },
  body: { color: discover.muted, fontSize: 13, lineHeight: 19 },
  label: { color: discover.text, fontSize: 13, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: discover.pill, borderRadius: 10, padding: 12, color: discover.text },
  button: { alignSelf: "flex-start", backgroundColor: swipe.blue, borderRadius: 10, padding: 12 },
  buttonText: { color: "white", fontWeight: "700", fontSize: 13 },
});
