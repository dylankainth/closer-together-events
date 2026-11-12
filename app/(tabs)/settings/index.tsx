import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { Card, Skeleton, Switch } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/tokens";

export default function Settings() {
  const { viewerId } = useViewer();
  const data = useQuery(api.settings.getUserSettings, { personaId: viewerId });
  const updateUserSettings = useMutation(api.settings.updateUserSettings);
  const updateNeverShare = useMutation(api.settings.updateNeverShare);
  const approveProfile = useMutation(api.settings.approveProfile);
  const profile = useQuery(api.personas.eventSafeProfile, { personaId: viewerId });

  const [newTopic, setNewTopic] = useState("");

  if (data === undefined) return <View style={{ padding: spacing.lg }}><Skeleton height={200} /></View>;
  if (!data) return <Text style={{ padding: spacing.lg }}>No settings found.</Text>;

  const addTopic = async () => {
    if (!newTopic.trim()) return;
    await updateNeverShare({ personaId: viewerId, topics: [...data.neverShare, newTopic.trim()] });
    setNewTopic("");
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.lg }}>
      <Text style={styles.header}>Muse and events</Text>

      <Card>
        <Row label="Let Muse talk to friends' Muses about events" value={data.settings.talkToMuses} onChange={(v) => updateUserSettings({ personaId: viewerId, settings: { talkToMuses: v } })} />
        <Row label="Nudges on" value={data.settings.nudgesOn} onChange={(v) => updateUserSettings({ personaId: viewerId, settings: { nudgesOn: v } })} />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Always ask before</Text>
        <Row label="RSVP for me" value={true} locked />
        <Row label="Share my location" value={true} locked />
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Never share</Text>
        {data.neverShare.map((t: string) => <Text key={t} style={styles.topic}>• {t}</Text>)}
        <View style={styles.addRow}>
          <TextInput style={styles.input} placeholder="add topic" value={newTopic} onChangeText={setNewTopic} onSubmitEditing={addTopic} />
          <Pressable onPress={addTopic}><Text style={{ color: colors.museAccent, fontWeight: "700" }}>Add</Text></Pressable>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>What Muse knows about you for events</Text>
        {profile && (
          <>
            <Text style={styles.topic}>Interests: {profile.interests.join(", ")}</Text>
            <Text style={styles.topic}>Style: {profile.socialStyle}</Text>
          </>
        )}
        {!data.settings.profileApproved && (
          <Pressable style={styles.approveBtn} onPress={() => approveProfile({ personaId: viewerId })}>
            <Text style={styles.approveText}>Approve this summary</Text>
          </Pressable>
        )}
      </Card>
    </ScrollView>
  );
}

function Row({ label, value, onChange, locked }: { label: string; value: boolean; onChange?: (v: boolean) => void; locked?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={locked ? () => {} : onChange ?? (() => {})} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { fontSize: 22, fontWeight: "700", color: colors.text },
  sectionTitle: { fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  rowLabel: { flex: 1, color: colors.text, marginRight: spacing.sm },
  topic: { color: colors.text, marginTop: spacing.xs },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, color: colors.text },
  approveBtn: { marginTop: spacing.md, backgroundColor: colors.museAccent, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: "center" },
  approveText: { color: "white", fontWeight: "700" },
});
