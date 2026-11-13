import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { colors, radius, spacing } from "@/theme/tokens";

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function Questions() {
  const { viewerId } = useViewer();
  const startQuestionSession = useAction(api.questionSession.startQuestionSession);
  const submitAnswer = useAction(api.questionSession.submitAnswer);
  const finishQuestionSession = useMutation(api.questionSessionData.finishQuestionSession);
  const planEvent = useAction(api.planAction.planEvent);

  const [stage, setStage] = useState<"asking" | "error">("asking");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [field, setField] = useState("other");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [inputType, setInputType] = useState<"chips" | "text">("text");
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [textValue, setTextValue] = useState("");
  const [questionCount, setQuestionCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const resetAnswer = () => {
    setSelectedChip(null);
    setTextValue("");
  };

  const start = useCallback(async () => {
    setLoading(true);
    try {
      const result = await startQuestionSession({ hostId: viewerId });
      setSessionId(result.sessionId);
      setField(result.field ?? "other");
      setQuestion(result.question);
      setOptions(result.options ?? []);
      setInputType(result.inputType);
      setQuestionCount(1);
      resetAnswer();
    } catch {
      setStage("error");
    } finally {
      setLoading(false);
    }
  }, [viewerId, startQuestionSession]);

  useEffect(() => {
    if (viewerId) start();
  }, [viewerId, start]);

  const canAnswer =
    inputType === "chips" ? selectedChip !== null : textValue.trim().length > 0;

  const handleNext = async () => {
    const answer = inputType === "chips" ? selectedChip : textValue.trim();
    if (!answer) return;

    setLoading(true);
    try {
      const result = await submitAnswer({
        sessionId: sessionId!,
        field,
        answer,
      });

      if (result.complete) {
        const mapped = await finishQuestionSession({ sessionId: sessionId! });
        if (!mapped) {
          setStage("error");
          return;
        }
        const { eventId } = await planEvent({
          hostId: viewerId,
          answers: {
            purpose: mapped.purpose,
            vibe: mapped.vibe,
            budget: mapped.budget as 1 | 2 | 3,
          },
          audienceRaw: mapped.audienceRaw,
        });
        router.replace({ pathname: "/new-event/planning", params: { eventId } });
        return;
      }

      setField(result.field ?? "other");
      setQuestion(result.question ?? "");
      setOptions(result.options ?? []);
      setInputType(result.inputType ?? "text");
      setQuestionCount((c) => c + 1);
      resetAnswer();
    } catch {
      setStage("error");
    } finally {
      setLoading(false);
    }
  };

  if (!sessionId) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" color={colors.museAccent} />
      </View>
    );
  }

  if (stage === "error") {
    return (
      <View style={styles.screen}>
        <Text style={styles.errorText}>Something went wrong. Try again.</Text>
        <Pressable onPress={start} style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.header}>Question {questionCount}</Text>
      <Text style={styles.question}>{question}</Text>

      {inputType === "chips" && options.length > 0 && (
        <View style={styles.row}>
          {options.map((o) => (
            <Chip
              key={o}
              label={o}
              selected={selectedChip === o}
              onPress={() => setSelectedChip(o)}
            />
          ))}
        </View>
      )}

      {inputType === "text" && (
        <TextInput
          style={styles.input}
          placeholder="Type your answer…"
          value={textValue}
          onChangeText={setTextValue}
        />
      )}

      <Pressable
        style={[styles.next, !canAnswer && styles.nextDisabled]}
        disabled={!canAnswer || loading}
        onPress={handleNext}
      >
        {loading ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Text style={styles.nextText}>Next</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { fontSize: 18, fontWeight: "600", color: colors.textMuted, marginBottom: spacing.sm },
  question: { fontSize: 22, fontWeight: "700", color: colors.text, marginBottom: spacing.xl },
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", marginBottom: spacing.xl },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    color: colors.text,
    marginBottom: spacing.xl,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.museAccent, borderColor: colors.museAccent },
  chipText: { color: colors.text },
  chipTextSelected: { color: "white", fontWeight: "600" },
  next: {
    marginTop: spacing.xl,
    backgroundColor: colors.museAccent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  nextDisabled: { backgroundColor: colors.textMuted },
  nextText: { color: "white", fontWeight: "700", fontSize: 16 },
  errorText: { color: colors.text, marginBottom: spacing.lg },
  retryText: { color: colors.museAccent, fontWeight: "700" },
  retry: { marginTop: spacing.md },
});
