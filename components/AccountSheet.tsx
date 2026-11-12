import React, { useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { facebookLoginAvailable, LoginCancelled, signInWithFacebook, signOutOfFacebook } from "@/lib/facebookLogin";
import { Avatar } from "./ui";
import { colors, radius, spacing } from "@/theme/tokens";

// Opened from the Menu screen's profile row: real Facebook login/logout, plus (underneath, since
// there's no real multi-account auth in this hackathon build) switching between seeded demo
// personas. See claude.md's "Backlog" section for what the old per-event Muse settings screen
// covered — that's deferred, not wired into this sheet.
export function AccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { viewerId, setViewerId, isLoggedIn, onFacebookLogin, logout } = useViewer();
  const personas = useQuery(api.personas.listAll, {});
  const profile = useQuery(api.users.profileForPersona, isLoggedIn ? { personaId: viewerId } : "skip");
  const login = useAction(api.fbAuth.loginWithFacebook);
  const me = personas?.find((p) => p.id === viewerId);

  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liveLoginAvailable = facebookLoginAvailable();
  const filtered = (personas ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const onFacebook = async () => {
    setBusy(true);
    setError(null);
    try {
      const t = await signInWithFacebook();
      const res = t.kind === "limited" ? await login({ idToken: t.idToken, nonce: t.nonce }) : await login({ accessToken: t.accessToken });
      onFacebookLogin(res.personaId);
    } catch (e: unknown) {
      if (!(e instanceof LoginCancelled)) {
        const data = e instanceof ConvexError ? (e.data as { message?: string }) : null;
        setError(data?.message ?? (e instanceof Error ? e.message : "Login with Facebook failed. Try again."));
      }
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    await signOutOfFacebook();
    logout();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.meRow}>
          {isLoggedIn && profile?.pictureUrl ? (
            <Image source={{ uri: profile.pictureUrl }} style={styles.mePhoto} />
          ) : me ? (
            <Avatar initials={me.initials} color={me.color} size={48} />
          ) : null}
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={styles.meName}>{(isLoggedIn ? profile?.name : me?.name) ?? "Guest"}</Text>
            <Text style={styles.meSub}>{isLoggedIn ? "Signed in with Facebook" : "Demo persona"}</Text>
          </View>
        </View>

        {isLoggedIn ? (
          <Pressable style={styles.secondaryBtn} onPress={onLogout}>
            <Text style={styles.secondaryBtnText}>Log out</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.primaryBtn, busy && { opacity: 0.7 }]} onPress={onFacebook} disabled={busy || !liveLoginAvailable}>
            {busy ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {liveLoginAvailable ? "Continue with Facebook" : "Continue with Facebook (needs a dev build)"}
              </Text>
            )}
          </Pressable>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Switch demo user</Text>
        <TextInput placeholder="Search" value={search} onChangeText={setSearch} style={styles.search} placeholderTextColor={colors.textMuted} />
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          style={{ maxHeight: 320 }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => { setViewerId(item.id); onClose(); }}>
              <Avatar initials={item.initials} color={item.color} size={36} />
              <View style={{ marginLeft: spacing.md }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowSub}>{item.job}</Text>
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: "80%" },
  meRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  mePhoto: { width: 48, height: 48, borderRadius: 24 },
  meName: { fontWeight: "700", fontSize: 17, color: colors.text },
  meSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  primaryBtnText: { color: "white", fontWeight: "700" },
  secondaryBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  secondaryBtnText: { color: colors.danger, fontWeight: "700" },
  error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  sectionTitle: { fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
  rowName: { fontWeight: "600", color: colors.text },
  rowSub: { color: colors.textMuted, fontSize: 12 },
});
