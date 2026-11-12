import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { facebookLoginAvailable, LoginCancelled, signInWithFacebook } from "@/lib/facebookLogin";
import { colors, radius, spacing } from "@/theme/tokens";

// Real Login with Facebook in a development build (name and photo only). In Expo Go, on web, or
// before the Facebook app id is configured, it falls back to the demo button.
export default function Setup() {
  const { setViewerId } = useViewer();
  const login = useAction(api.fbAuth.loginWithFacebook);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = facebookLoginAvailable();

  async function onFacebook() {
    setBusy(true);
    setError(null);
    try {
      const t = await signInWithFacebook();
      const res =
        t.kind === "limited"
          ? await login({ idToken: t.idToken, nonce: t.nonce })
          : await login({ accessToken: t.accessToken });
      setViewerId(res.personaId);
      router.push("/events");
    } catch (e: unknown) {
      if (!(e instanceof LoginCancelled)) {
        // Server reasons arrive as ConvexError data ({ code, message }); plain errors are local.
        const data = e instanceof ConvexError ? (e.data as { message?: string }) : null;
        setError(data?.message ?? (e instanceof Error ? e.message : "Login with Facebook failed. Try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.header}>Get your own Muse</Text>
      <Text style={styles.body}>
        Muse finds events worth going to, with a reason. Login with Facebook is used for your name
        and photo only.
      </Text>
      <View style={styles.list}>
        <Text style={styles.item}>• Plans logistics for events you host</Text>
        <Text style={styles.item}>• Tells you why an event is worth it, honestly</Text>
        <Text style={styles.item}>• Never shares your private details without checking</Text>
      </View>
      {live ? (
        <Pressable style={[styles.cta, busy && styles.ctaBusy]} onPress={onFacebook} disabled={busy}>
          {busy ? <ActivityIndicator color="white" /> : <Text style={styles.ctaText}>Continue with Facebook</Text>}
        </Pressable>
      ) : (
        <Pressable style={styles.cta} onPress={() => router.push("/events")}>
          <Text style={styles.ctaText}>Continue with Facebook (demo)</Text>
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, paddingTop: spacing.xxl },
  header: { fontSize: 24, fontWeight: "700", color: colors.text },
  body: { color: colors.textMuted, marginTop: spacing.md, lineHeight: 20 },
  list: { marginTop: spacing.lg, gap: spacing.xs },
  item: { color: colors.text },
  cta: { marginTop: spacing.xl, backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  ctaBusy: { opacity: 0.7 },
  ctaText: { color: "white", fontWeight: "700", fontSize: 16 },
  error: { marginTop: spacing.md, color: "#B3261E" },
});
