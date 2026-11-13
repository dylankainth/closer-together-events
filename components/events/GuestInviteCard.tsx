import React, { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { swipe } from "@/theme/swipeTheme";

export function GuestInviteCard({ eventId, personaId }: { eventId: string; personaId: string }) {
  const offer = useQuery(api.plusOnes.offer, { eventId, personaId });
  const invite = useMutation(api.plusOnes.invite);
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  if (!offer) return null;

  const send = async () => {
    if (lock.current || offer.state !== "available") return;
    lock.current = true;
    setSaving(true);
    setError(false);
    try {
      await invite({ eventId, personaId, friendId: offer.person.personaId });
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const sent = offer.state === "sent";
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{sent ? `${offer.person.name} is invited` : "Bring a friend"}</Text>
      <Text style={styles.body}>{sent
        ? "Their Muse will help them decide. They'll choose their own answer."
        : `Your host allows one friend. Invite ${offer.person.name}? They'll get their own Muse recommendation.`}</Text>
      {!sent && <Pressable onPress={() => void send()} disabled={saving} style={[styles.button, saving && { opacity: 0.6 }]}
        accessibilityRole="button" accessibilityState={{ disabled: saving, busy: saving }}>
        {saving ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Invite {offer.person.name.split(" ")[0]}</Text>}
      </Pressable>}
      {error && !sent && <Text style={styles.error} accessibilityRole="alert">Couldn't send the invitation. Check your connection and try again; the guest list may have changed.</Text>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { marginTop: 24, padding: 18, borderRadius: 18, backgroundColor: swipe.lavender, gap: 10 },
  title: { fontSize: 17, fontWeight: "600", color: swipe.ink },
  body: { fontSize: 14, lineHeight: 21, color: swipe.ink },
  button: { alignSelf: "flex-start", backgroundColor: swipe.blue, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  buttonText: { color: "white", fontWeight: "600" },
  error: { color: "#E41E3F", fontSize: 13, lineHeight: 19 },
});
