import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { colors, radius, spacing } from "@/theme/tokens";

const VIBES = ["Chill", "Lively", "Fancy"] as const;
const BUDGETS = [1, 2, 3] as const;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function Questions() {
  const params = useLocalSearchParams<{ purpose?: string; vibe?: string; budget?: string; audience?: string }>();
  const { viewerId } = useViewer();
  const planEvent = useAction(api.planAction.planEvent);

  const [purpose, setPurpose] = useState(params.purpose ?? "Other");
  const [vibe, setVibe] = useState((params.vibe as typeof VIBES[number]) ?? "Lively");
  const [budget, setBudget] = useState(Number(params.budget ?? 2) as 1 | 2 | 3);
  const [audience, setAudience] = useState(params.audience ?? "");
  const [cake, setCake] = useState<"yes" | "no" | "unsure">("unsure");
  const [loading, setLoading] = useState(false);

  const onDone = async () => {
    setLoading(true);
    try {
      const { eventId } = await planEvent({
        hostId: viewerId,
        answers: { purpose: purpose || "Other", vibe, budget },
        audienceRaw: audience || "my friends",
      });
      router.replace({ pathname: "/new-event/planning", params: { eventId } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.header}>{purpose === "Other" ? "Your event." : `${purpose}.`}</Text>
      <Text style={styles.sub}>Love it! A few quick questions.</Text>

      <Text style={styles.label}>What's the vibe?</Text>
      <View style={styles.row}>
        {VIBES.map((v) => <Chip key={v} label={v} selected={vibe === v} onPress={() => setVibe(v)} />)}
      </View>

      <Text style={styles.label}>Who gets in</Text>
      <TextInput
        style={styles.input}
        placeholder="the people I go boxing with"
        placeholderTextColor={colors.textMuted}
        value={audience}
        onChangeText={setAudience}
      />

      <Text style={styles.label}>Do you want cake?</Text>
      <View style={styles.row}>
        <Chip label="Yes" selected={cake === "yes"} onPress={() => setCake("yes")} />
        <Chip label="No" selected={cake === "no"} onPress={() => setCake("no")} />
        <Chip label="Not sure" selected={cake === "unsure"} onPress={() => setCake("unsure")} />
      </View>

      <Text style={styles.label}>Budget etc</Text>
      <View style={styles.row}>
        {BUDGETS.map((b) => <Chip key={b} label={"$".repeat(b)} selected={budget === b} onPress={() => setBudget(b)} />)}
      </View>

      <Pressable style={[styles.done, loading && { opacity: 0.6 }]} disabled={loading} onPress={onDone}>
        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.doneText}>Done</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { fontSize: 22, fontWeight: "700", color: colors.text },
  sub: { color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg },
  label: { fontWeight: "600", color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipSelected: { backgroundColor: colors.museAccent, borderColor: colors.museAccent },
  chipText: { color: colors.text },
  chipTextSelected: { color: "white", fontWeight: "600" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: colors.card, color: colors.text },
  done: { marginTop: spacing.xl, backgroundColor: colors.museAccent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  doneText: { color: "white", fontWeight: "700", fontSize: 16 },
});
