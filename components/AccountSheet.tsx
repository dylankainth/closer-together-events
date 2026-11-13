import React, { useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { facebookLoginAvailable, LoginCancelled, signInWithFacebook, signOutOfFacebook } from "@/lib/facebookLogin";
import { Avatar, Switch } from "./ui";
import { colors, radius, spacing } from "@/theme/tokens";

// Opened from the Menu screen's profile row: real Facebook login/logout, plus (underneath, since
// there's no real multi-account auth in this hackathon build) switching between seeded demo
// personas. See claude.md's "Backlog" section for what the old per-event Muse settings screen
// covered — that's deferred, not wired into this sheet.
export function AccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { viewerId, setViewerId, isLoggedIn, sessionPersonaId, canActAsViewer, onFacebookLogin, logout, signingIn, loginError } = useViewer();
  const personas = useQuery(api.personas.listAll, {});
  // "Signed in" describes the persona on screen only when it's your own; an operator viewing Maya
  // is still signed in, but the sheet shows Maya.
  const viewingSelf = isLoggedIn && viewerId === sessionPersonaId;
  const profile = useQuery(api.users.profileForPersona, viewingSelf ? { personaId: viewerId } : "skip");
  const login = useAction(api.fbAuth.loginWithFacebook);
  const me = personas?.find((p) => p.id === viewerId);

  // Owner-only on the server (never-share list); only ask when this session can act as the viewer.
  const museProfile = useQuery(api.musePersonas.getByPersonaId, canActAsViewer ? { personaId: viewerId } : "skip");
  const syncMuse = useAction(api.museSync.syncMuseContext);
  const setApproved = useMutation(api.musePersonas.setApproved);
  const [syncing, setSyncing] = useState(false);

  // "Muse and events" section — the per-event Muse permissions, never-share list and event-safe
  // profile from claude.md §16/§5.3. getUserSettings is owner-only server-side and returns null for
  // anyone else, so skip it entirely when this session cannot act as the viewed persona.
  const userSettings = useQuery(api.settings.getUserSettings, canActAsViewer ? { personaId: viewerId } : "skip");
  const eventSafeProfile = useQuery(api.personas.eventSafeProfile, canActAsViewer ? { personaId: viewerId } : "skip");
  const updateUserSettings = useMutation(api.settings.updateUserSettings);
  const updateNeverShare = useMutation(api.settings.updateNeverShare);
  const approveProfile = useMutation(api.settings.approveProfile);
  const [newNeverShareTopic, setNewNeverShareTopic] = useState("");

  const addNeverShareTopic = () => {
    const topic = newNeverShareTopic.trim();
    if (!topic || !userSettings) return;
    if (userSettings.neverShare.some((t: string) => t.toLowerCase() === topic.toLowerCase())) {
      setNewNeverShareTopic("");
      return;
    }
    updateNeverShare({ personaId: viewerId, topics: [...userSettings.neverShare, topic] });
    setNewNeverShareTopic("");
  };

  const removeNeverShareTopic = (topic: string) => {
    if (!userSettings) return;
    updateNeverShare({ personaId: viewerId, topics: userSettings.neverShare.filter((t: string) => t !== topic) });
  };

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
      onFacebookLogin(res.personaId, { token: res.token, expiresAt: res.expiresAt, isOperator: res.isOperator });
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

  const onConnectMuse = async () => {
    setSyncing(true);
    try {
      await syncMuse({ personaId: viewerId });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.meRow}>
          {viewingSelf && profile?.pictureUrl ? (
            <Image source={{ uri: profile.pictureUrl }} style={styles.mePhoto} />
          ) : me ? (
            <Avatar initials={me.initials} color={me.color} size={48} />
          ) : null}
          <View style={{ marginLeft: spacing.md, flex: 1 }}>
            <Text style={styles.meName}>{(viewingSelf ? profile?.name : me?.name) ?? "Guest"}</Text>
            <Text style={styles.meSub}>
              {viewingSelf ? "Signed in with Facebook" : isLoggedIn ? "Demo persona (you're signed in)" : "Demo persona"}
            </Text>
          </View>
        </View>

        {isLoggedIn ? (
          <Pressable style={styles.secondaryBtn} onPress={onLogout}>
            <Text style={styles.secondaryBtnText}>Log out</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.primaryBtn, (busy || signingIn) && { opacity: 0.7 }]} onPress={onFacebook} disabled={busy || signingIn || !liveLoginAvailable}>
            {busy || signingIn ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {liveLoginAvailable ? "Continue with Facebook" : "Continue with Facebook (needs a dev build)"}
              </Text>
            )}
          </Pressable>
        )}
        {error || loginError ? <Text style={styles.error}>{error ?? loginError}</Text> : null}

        {canActAsViewer ? (
        <View style={styles.museBox}>
          <View style={styles.museHeaderRow}>
            <Text style={styles.sectionTitle}>Muse memory</Text>
            {museProfile?.profileApproved ? (
              <Text style={styles.museStatus}>Connected</Text>
            ) : museProfile ? (
              <Text style={styles.museStatusPending}>Not shared yet</Text>
            ) : null}
          </View>
          {museProfile ? (
            <>
              <Text style={styles.museLine}>
                Muse would share: interests: {museProfile.interests.join(", ") || "—"}; availability:{" "}
                {museProfile.availability.length || 0} slot{museProfile.availability.length === 1 ? "" : "s"}.
              </Text>
              <Text style={styles.museLine}>
                Never share: {museProfile.neverShare.length ? museProfile.neverShare.join(", ") : "nothing set"}.
              </Text>
              <View style={styles.museApproveRow}>
                <Text style={styles.rowName}>Share this with friends' Muses in huddles</Text>
                <Switch value={museProfile.profileApproved} onValueChange={(v) => setApproved({ personaId: viewerId, approved: v })} />
              </View>
              <Pressable onPress={onConnectMuse} disabled={syncing}>
                <Text style={styles.resyncText}>{syncing ? "Syncing…" : "Re-sync"}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.secondaryBtn} onPress={onConnectMuse} disabled={syncing}>
              {syncing ? <ActivityIndicator color={colors.text} /> : <Text style={styles.secondaryBtnTextNeutral}>Connect my Muse</Text>}
            </Pressable>
          )}
        </View>
        ) : null}

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Muse and events</Text>
        {!canActAsViewer ? (
          <Text style={styles.meSub}>
            Sign in as {me?.name ?? "this persona"} to see and control what their Muse shares for events.
          </Text>
        ) : userSettings === undefined ? (
          <ActivityIndicator color={colors.museAccent} />
        ) : userSettings === null ? (
          <Text style={styles.meSub}>Muse settings aren't available for this persona yet.</Text>
        ) : (
          <View style={styles.museBox}>
            <View style={styles.museApproveRow}>
              <Text style={styles.rowName}>Let your Muse talk to friends' Muses about events</Text>
              <Switch
                value={userSettings.settings.talkToMuses}
                onValueChange={(v) => updateUserSettings({ personaId: viewerId, settings: { talkToMuses: v } })}
              />
            </View>
            <View style={styles.museApproveRow}>
              <Text style={styles.rowName}>Nudge me about events worth going to</Text>
              <Switch
                value={userSettings.settings.nudgesOn}
                onValueChange={(v) => updateUserSettings({ personaId: viewerId, settings: { nudgesOn: v } })}
              />
            </View>

            <Text style={styles.subLabel}>Always ask before</Text>
            <View style={styles.lockedRow}>
              <Text style={styles.rowName}>RSVP for me</Text>
              <Text style={styles.lockedTag}>Always on</Text>
            </View>
            <View style={styles.lockedRow}>
              <Text style={styles.rowName}>Share my location</Text>
              <Text style={styles.lockedTag}>Always on</Text>
            </View>
            <Text style={styles.museLine}>Committing anything always asks you first. That can't be turned off.</Text>

            <Text style={styles.subLabel}>Never share</Text>
            <View style={styles.chipRow}>
              {userSettings.neverShare.length === 0 ? (
                <Text style={styles.museLine}>Nothing added yet.</Text>
              ) : (
                userSettings.neverShare.map((topic: string) => (
                  <Pressable key={topic} style={styles.chip} onPress={() => removeNeverShareTopic(topic)}>
                    <Text style={styles.chipText}>{topic} ✕</Text>
                  </Pressable>
                ))
              )}
            </View>
            <View style={styles.addTopicRow}>
              <TextInput
                placeholder="Add a topic Muse should never share"
                value={newNeverShareTopic}
                onChangeText={setNewNeverShareTopic}
                onSubmitEditing={addNeverShareTopic}
                style={[styles.search, { flex: 1, marginBottom: 0 }]}
                placeholderTextColor={colors.textMuted}
              />
              <Pressable style={styles.addTopicBtn} onPress={addNeverShareTopic}>
                <Text style={styles.addTopicBtnText}>Add</Text>
              </Pressable>
            </View>

            <Text style={styles.subLabel}>What Muse knows about you for events</Text>
            {eventSafeProfile === undefined ? (
              <ActivityIndicator color={colors.museAccent} />
            ) : eventSafeProfile === null ? (
              <Text style={styles.museLine}>No summary yet.</Text>
            ) : (
              <>
                <Text style={styles.museLine}>Interests: {eventSafeProfile.interests.join(", ") || "—"}</Text>
                <Text style={styles.museLine}>Social style: {eventSafeProfile.socialStyle || "—"}</Text>
                <Text style={styles.museLine}>
                  Availability: {eventSafeProfile.availability.length} slot{eventSafeProfile.availability.length === 1 ? "" : "s"}
                </Text>
                {userSettings.settings.profileApproved ? (
                  <Text style={styles.museStatus}>Approved — Muse can use this summary for events</Text>
                ) : (
                  <Pressable style={styles.secondaryBtn} onPress={() => approveProfile({ personaId: viewerId })}>
                    <Text style={styles.secondaryBtnTextNeutral}>Approve this summary</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        )}

        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Switch demo user</Text>
        <TextInput placeholder="Search" value={search} onChangeText={setSearch} style={styles.search} placeholderTextColor={colors.textMuted} />
        <View>
          {filtered.map((item) => (
            <Pressable key={item.id} style={styles.row} onPress={() => { setViewerId(item.id); onClose(); }}>
              <Avatar initials={item.initials} color={item.color} size={36} />
              <View style={{ marginLeft: spacing.md }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowSub}>{item.job}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
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
  secondaryBtnTextNeutral: { color: colors.text, fontWeight: "700" },
  error: { color: colors.danger, marginTop: spacing.sm, fontSize: 13 },
  museBox: { marginTop: spacing.md, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md },
  museHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  museStatus: { color: colors.success, fontWeight: "700", fontSize: 12 },
  museStatusPending: { color: colors.warning, fontWeight: "700", fontSize: 12 },
  museLine: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  museApproveRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  resyncText: { color: colors.museAccent, fontWeight: "600", fontSize: 13, marginTop: spacing.sm },
  subLabel: { fontWeight: "700", color: colors.text, fontSize: 13, marginTop: spacing.md, marginBottom: spacing.xs },
  lockedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  lockedTag: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 4, marginRight: spacing.xs, marginBottom: spacing.xs },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  addTopicRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, gap: spacing.sm },
  addTopicBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  addTopicBtnText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  sectionTitle: { fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
  rowName: { fontWeight: "600", color: colors.text },
  rowSub: { color: colors.textMuted, fontSize: 12 },
});
