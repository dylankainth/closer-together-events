import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { colors, radius, spacing } from "@/theme/tokens";

const EXAMPLES = [
  "Founder dinner, ~20 people, Shoreditch",
  "Maya's birthday, boxing crew, Friday",
  "Game night, 8 friends, my place",
  "Climbing social, Saturday afternoon",
  "Housewarming, close friends only",
];
const ROTATE_EVERY_MS = 2600;
const FADE_MS = 280;
const SLIDE_PX = 8;

function AnimatedPlaceholder({ visible }: { visible: boolean }) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % EXAMPLES.length);
        translateY.setValue(SLIDE_PX);
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
        ]).start();
      });
    }, ROTATE_EVERY_MS);
    return () => clearInterval(id);
  }, [visible, opacity, translateY]);

  if (!visible) return null;
  return (
    <Animated.Text style={[styles.placeholderText, { opacity, transform: [{ translateY }] }]} numberOfLines={1} pointerEvents="none">
      {EXAMPLES[index]}
    </Animated.Text>
  );
}

interface Card {
  field: string;
  question: string;
  note?: string;
  options?: string[];
  defaultOption?: string;
  inputType: "chips" | "text";
  answer?: string; // set once the host has answered (or accepted the default) — renders flat
}

// One screen, not a wizard across pages: the host's free-text answer to "what are we making
// happen?" is the opening message; every follow-up Muse asks becomes a card stacked below it,
// each pre-filled with Muse's own best guess so the host can accept, tap a different chip, type
// their own answer, or bail out entirely via "skip the rest".
export default function NewEventChat() {
  const { viewerId } = useViewer();
  const startQuestionSession = useAction(api.questionSession.startQuestionSession);
  const submitAnswer = useAction(api.questionSession.submitAnswer);
  const skipRest = useAction(api.questionSession.skipRest);
  const finishQuestionSession = useMutation(api.questionSessionData.finishQuestionSession);
  const planEvent = useAction(api.planAction.planEvent);

  const [opening, setOpening] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [cards, opening]);

  const current = cards.length > 0 && cards[cards.length - 1].answer === undefined ? cards[cards.length - 1] : null;

  const pushQuestionCard = (q: { field?: string; question?: string; note?: string; options?: string[]; defaultOption?: string; inputType?: "chips" | "text" }) => {
    if (!q.question) return;
    setCards((c) => [...c, { field: q.field ?? "other", question: q.question!, note: q.note, options: q.options, defaultOption: q.defaultOption, inputType: q.inputType ?? "text" }]);
  };

  const finishUp = async (sid: string) => {
    const mapped = await finishQuestionSession({ sessionId: sid });
    if (!mapped) return;
    const { eventId } = await planEvent({
      hostId: viewerId,
      answers: { purpose: mapped.purpose, vibe: mapped.vibe, budget: mapped.budget as 1 | 2 | 3 },
      audienceRaw: mapped.audienceRaw,
    });
    router.replace(`/new-event/planning?eventId=${eventId}`);
  };

  const sendOpening = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setOpening(text);
    setLoading(true);
    try {
      const result = await startQuestionSession({ hostId: viewerId, initialDescription: text });
      setSessionId(result.sessionId);
      if (result.question) pushQuestionCard(result);
      else {
        setDone(true);
        await finishUp(result.sessionId);
      }
    } finally {
      setLoading(false);
    }
  };

  const answerCurrent = async (answer: string) => {
    if (!sessionId || !current || !answer.trim()) return;
    const field = current.field;
    setCards((c) => c.map((card, i) => (i === c.length - 1 ? { ...card, answer: answer.trim() } : card)));
    setDraft("");
    setLoading(true);
    try {
      const result = await submitAnswer({ sessionId, field, answer: answer.trim() });
      if (result.complete) {
        setDone(true);
        await finishUp(sessionId);
        return;
      }
      pushQuestionCard(result);
    } finally {
      setLoading(false);
    }
  };

  const onSkipRest = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      if (current) {
        const fallback = current.defaultOption ?? current.options?.[0];
        setCards((c) => c.map((card, i) => (i === c.length - 1 ? { ...card, answer: fallback ? `${fallback} (Muse's pick)` : "Skipped — Muse decided" } : card)));
        await skipRest({ sessionId, field: current.field, defaultAnswer: fallback });
      } else {
        await skipRest({ sessionId });
      }
      setDone(true);
      await finishUp(sessionId);
    } finally {
      setLoading(false);
    }
  };

  if (!opening) {
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.introWrap}>
          <Text style={styles.prompt}>What are we making happen?</Text>
          <View style={styles.composerRow}>
            <View style={styles.inputStack}>
              <AnimatedPlaceholder visible={!draft} />
              <TextInput style={styles.input} value={draft} onChangeText={setDraft} onSubmitEditing={sendOpening} returnKeyType="send" autoFocus />
            </View>
            <Pressable style={[styles.go, !draft.trim() && { opacity: 0.4 }]} disabled={!draft.trim()} onPress={sendOpening}>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.bubble, styles.bubbleHost]}>
          <Text style={[styles.bubbleText, styles.bubbleTextHost]}>{opening}</Text>
        </View>
        <View style={[styles.bubble, styles.bubbleMuse]}>
          <Text style={styles.bubbleText}>Love it. A few quick ones so I get it right. Tap an answer, or let me decide.</Text>
        </View>

        {cards.map((card, i) => {
          const isActive = card.answer === undefined;
          return (
            <View key={i} style={[styles.card, isActive && styles.cardActive]}>
              <Text style={styles.cardTitle}>{card.question}</Text>
              {card.note && <Text style={styles.cardNote}>{card.note}</Text>}
              {!isActive ? (
                <Text style={styles.cardAnswer}>{card.answer}</Text>
              ) : card.inputType === "chips" && card.options?.length ? (
                <View style={styles.chipRow}>
                  {card.options.map((o) => (
                    <Pressable
                      key={o}
                      style={[styles.chip, o === card.defaultOption && styles.chipDefault]}
                      onPress={() => answerCurrent(o)}
                      disabled={loading}
                    >
                      <Text style={[styles.chipText, o === card.defaultOption && styles.chipTextDefault]}>{o}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}

        {loading && (
          <View style={styles.typingRow}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        )}
      </ScrollView>

      {!done && (
        <>
          <View style={styles.composerRow}>
            <TextInput
              style={[styles.input, styles.inputBare]}
              placeholder="Or type your own answer..."
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => answerCurrent(draft)}
              returnKeyType="send"
              editable={!loading}
            />
            <Pressable style={[styles.go, (!draft.trim() || loading) && { opacity: 0.4 }]} disabled={!draft.trim() || loading} onPress={() => answerCurrent(draft)}>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </Pressable>
          </View>
          <Pressable style={styles.skipRow} onPress={onSkipRest} disabled={loading}>
            <Text style={styles.skipText}>Skip the rest, use my judgement →</Text>
          </Pressable>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  introWrap: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.lg },
  prompt: { fontSize: 42, fontWeight: "800", color: colors.text, lineHeight: 48, marginBottom: spacing.lg },
  scrollContent: { padding: spacing.lg, gap: spacing.sm },

  bubble: { maxWidth: "85%", borderRadius: radius.lg, padding: spacing.md },
  bubbleMuse: { alignSelf: "flex-start", backgroundColor: "white", borderWidth: 1, borderColor: colors.border },
  bubbleHost: { alignSelf: "flex-end", backgroundColor: colors.text },
  bubbleText: { color: colors.text, fontSize: 15 },
  bubbleTextHost: { color: "white" },

  card: { backgroundColor: "white", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, opacity: 0.75 },
  cardActive: { borderColor: colors.text, borderWidth: 1.5, opacity: 1 },
  cardTitle: { fontWeight: "700", fontSize: 15, color: colors.text },
  cardNote: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  cardAnswer: { color: colors.museAccentDark, fontWeight: "600", marginTop: spacing.xs },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: "white" },
  chipDefault: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextDefault: { color: "white" },

  typingRow: { paddingVertical: spacing.xs },

  composerRow: {
    flexDirection: "row", alignItems: "center", margin: spacing.lg, marginTop: 0, backgroundColor: "white",
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.text, paddingLeft: spacing.lg,
    paddingRight: 6, paddingVertical: 6,
  },
  inputStack: { flex: 1 },
  input: { fontSize: 15, color: colors.text, paddingVertical: spacing.sm },
  inputBare: { flex: 1 },
  placeholderText: { position: "absolute", top: 0, left: 0, right: 0, fontSize: 15, color: colors.textMuted, paddingVertical: spacing.sm },
  go: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },

  skipRow: { alignItems: "center", paddingBottom: spacing.lg },
  skipText: { color: colors.accent, fontWeight: "600", fontSize: 13 },
});
