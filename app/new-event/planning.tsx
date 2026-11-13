import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, Easing, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { agent } from "@/theme/swipeTheme";
import { Mascot, type MascotHandle } from "@/components/Mascot";

type Msg = { from: "me" | "agent"; text: string; note?: string };
type Step = { key: string; label: string; detail: string; state: "done" | "active" | "todo" | "blocked" };
type PendingQuestion = { field?: string; options?: string[]; defaultOption?: string; inputType?: "chips" | "text" };

// Two pages side by side: 0 = the checklist, 1 = the chat with the Muse agent. Sending a message slides
// the checklist off and the chat in; swiping moves between them. DIR flips which way the checklist
// exits: 1 = off to the left (chat enters from the right, swipe left on the checklist to go to the chat),
// -1 = off to the right (chat enters from the left, swipe right on the checklist).
const DIR: 1 | -1 = 1;
const TOWARD = -DIR; // sign of a horizontal drag that moves from the checklist toward the chat
const SUGGESTIONS = ["What's holding things up?", "Why this date?", "Change the venue"];
const EXAMPLES = [
  "Founder dinner, ~20 people, Shoreditch",
  "Maya's birthday, boxing crew, Friday",
  "Game night, 8 friends, my place",
  "Climbing social, Saturday afternoon",
  "Housewarming, close friends only",
];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// One continuous chat thread, start to finish: "what are we making happen" is the opening message,
// Muse's clarifying questions and your plain-text/chip answers follow as ordinary chat bubbles, and
// once the plan is created the same thread keeps going as the normal host<->Muse chat — all on page
// 1 of this pager. Page 0 is the live checklist, reachable by swiping, so you can watch Muse work
// while the conversation above keeps running.
export default function Planning() {
  const { eventId: paramEventId, from } = useLocalSearchParams<{ eventId?: string; from?: string }>();
  const { viewerId } = useViewer();

  const [eventId, setEventId] = useState<string | undefined>(paramEventId);
  const [onboardingComplete, setOnboardingComplete] = useState(!!paramEventId);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);

  const checklist = useQuery(api.checklist.forEvent, eventId ? { eventId } : "skip");
  const approve = useMutation(api.events.approve);
  const approveDraft = useMutation(api.events.approveDraft);
  const rejectDraft = useMutation(api.events.rejectDraft);
  const chat = useAction(api.hostChat.reply);
  const startQuestionSession = useAction(api.questionSession.startQuestionSession);
  const submitAnswer = useAction(api.questionSession.submitAnswer);
  const skipRest = useAction(api.questionSession.skipRest);
  const finishQuestionSession = useMutation(api.questionSessionData.finishQuestionSession);
  const planEvent = useAction(api.planAction.planEvent);

  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const startPage: 0 | 1 = paramEventId ? 0 : 1; // existing event -> checklist first; fresh one -> straight into chat
  const page = useRef(new Animated.Value(startPage)).current; // 0 = checklist, 1 = chat
  const pageRef = useRef<0 | 1>(startPage);
  const [pageIdx, setPageIdx] = useState<0 | 1>(startPage);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  // RN 0.88's ScrollView ref type doesn't fit the usual useRef<ScrollView> pattern; only scrollToEnd is called.
  const scroller = useRef<any>(null);
  const mascot = useRef<MascotHandle>(null);
  // The mascot's eyes follow wherever the screen is touched.
  const lookAtTouch = (e: { nativeEvent: { pageX: number; pageY: number } }) => mascot.current?.lookAtPage(e.nativeEvent.pageX, e.nativeEvent.pageY);

  useEffect(() => {
    if (draft || onboardingComplete) return;
    const id = setInterval(() => setExampleIdx((i) => (i + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(id);
  }, [draft, onboardingComplete]);

  const goTo = useCallback(
    (p: 0 | 1) => {
      pageRef.current = p;
      setPageIdx(p);
      Animated.timing(page, { toValue: p, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    },
    [page],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only claim clearly horizontal drags, so the lists inside each page still scroll vertically.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderGrant: () => page.stopAnimation(),
        onPanResponderMove: (_, g) => {
          const w = widthRef.current || 1;
          page.setValue(pageRef.current === 0 ? clamp((g.dx * TOWARD) / w, 0, 1) : 1 - clamp((-g.dx * TOWARD) / w, 0, 1));
        },
        onPanResponderRelease: (_, g) => {
          const start = pageRef.current;
          const moved = start === 0 ? g.dx * TOWARD : -g.dx * TOWARD; // positive = moving away from the start page
          const commit = moved > (widthRef.current || 1) * 0.25 || (Math.abs(g.vx) > 0.5 && moved > 20);
          goTo(commit ? (start === 0 ? 1 : 0) : start);
        },
        onPanResponderTerminate: () => goTo(pageRef.current),
      }),
    [page, goTo],
  );

  useEffect(() => {
    scroller.current?.scrollToEnd({ animated: true });
  }, [messages.length, thinking, pendingQuestion]);

  const completeOnboarding = async (sid: string) => {
    const mapped = await finishQuestionSession({ sessionId: sid });
    if (!mapped) return;
    const result = await planEvent({
      hostId: viewerId,
      answers: { purpose: mapped.purpose, vibe: mapped.vibe, budget: mapped.budget as 1 | 2 | 3 },
      audienceRaw: mapped.audienceRaw,
    });
    setEventId(result.eventId);
    setOnboardingComplete(true);
    setMessages((m) => [...m, { from: "agent", text: "Got it — I'm putting the plan together now. Swipe over to watch." }]);
  };

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || thinking) return;
    setDraft("");
    setMessages((m) => [...m, { from: "me", text }]);
    goTo(1);
    setThinking(true);
    try {
      if (!onboardingComplete) {
        if (!sessionId) {
          const result = await startQuestionSession({ hostId: viewerId, initialDescription: text });
          setSessionId(result.sessionId);
          if (result.question) {
            setPendingQuestion({ field: result.field, options: result.options, defaultOption: result.defaultOption, inputType: result.inputType });
            setMessages((m) => [...m, { from: "agent", text: result.question, note: result.note }]);
          } else {
            await completeOnboarding(result.sessionId);
          }
        } else if (pendingQuestion) {
          const field = pendingQuestion.field ?? "other";
          setPendingQuestion(null);
          const result = await submitAnswer({ sessionId, field, answer: text });
          if (result.complete) {
            await completeOnboarding(sessionId);
          } else if (result.question) {
            const { field: nextField, options, defaultOption, inputType, question, note } = result;
            setPendingQuestion({ field: nextField, options, defaultOption, inputType });
            setMessages((m) => [...m, { from: "agent", text: question, note }]);
          }
        }
      } else {
        const history = messages;
        const r = await chat({ eventId: eventId!, message: text, history });
        setMessages((m) => [...m, { from: "agent", text: r.reply }]);
      }
    } catch {
      setMessages((m) => [...m, { from: "agent", text: "I couldn't reach Muse just now. Try again in a moment." }]);
    } finally {
      setThinking(false);
    }
  };

  const onSkipRest = async () => {
    if (!sessionId || thinking) return;
    setThinking(true);
    setMessages((m) => [...m, { from: "me", text: "Skip the rest, use your judgement" }]);
    try {
      if (pendingQuestion) {
        const fallback = pendingQuestion.defaultOption ?? pendingQuestion.options?.[0];
        await skipRest({ sessionId, field: pendingQuestion.field, defaultAnswer: fallback });
      } else {
        await skipRest({ sessionId });
      }
      setPendingQuestion(null);
      await completeOnboarding(sessionId);
    } finally {
      setThinking(false);
    }
  };

  const review = async () => {
    if (checklist && checklist.status === "draft") await approve({ eventId: eventId! });
    if (from === "manage") router.back();
    else router.replace(`/events/${eventId}/manage`);
  };

  const checklistX = page.interpolate({ inputRange: [0, 1], outputRange: [0, TOWARD * width] });
  const chatX = page.interpolate({ inputRange: [0, 1], outputRange: [-TOWARD * width, 0] });
  const showOpeningPrompt = messages.length === 0 && !sessionId && !onboardingComplete;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      onTouchStart={lookAtTouch}
      onTouchMove={lookAtTouch}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/events"))} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={agent.text} />
        </Pressable>
        <View style={styles.dots}>
          <Animated.View style={[styles.dot, { opacity: page.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) }]} />
          <Animated.View style={[styles.dot, { opacity: page.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }]} />
        </View>
        <View style={styles.back} />
      </View>

      {/* The mascot sits above everything else, in its own fixed-height slot so nothing can overlap it. */}
      <View style={styles.mascotWrap} pointerEvents="none">
        <Mascot ref={mascot} size={120} thinking={thinking} />
      </View>

      <View
        style={styles.pager}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        {...responder.panHandlers}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: checklistX }] }]} pointerEvents={pageIdx === 0 ? "auto" : "none"}>
          {!eventId ? (
            <View style={styles.waitingWrap}>
              <Text style={styles.waitingTitle}>Nothing to show yet</Text>
              <Text style={styles.waitingBody}>Tell Muse what's happening on the chat page — your plan will build here as soon as it has enough to go on.</Text>
            </View>
          ) : checklist === undefined ? (
            <Text style={styles.status}>Loading…</Text>
          ) : checklist === null ? (
            <Text style={styles.status}>Event not found.</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.checkContent}>
              <View>
                {checklist.summary ? <Text style={styles.kicker}>{checklist.summary}</Text> : null}
                <Text style={styles.title}>Your agent is on it</Text>
                <Text style={styles.sub}>{checklist.doneCount} of {checklist.total} done · you can close the app</Text>
                <View style={{ marginTop: 26, gap: 18 }}>
                  {checklist.items.map((s) => <StepRow key={s.key} s={s} />)}
                </View>
              </View>

              <View style={{ marginTop: 28, gap: 14 }}>
                {checklist.pendingDrafts.map((d) => (
                  <View key={d.id} style={styles.needs}>
                    <Text style={styles.needsTitle}>{d.item}, from you in chat</Text>
                    <Text style={styles.needsBody}>{d.draft}</Text>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                      <Pressable style={styles.draftApprove} onPress={() => approveDraft({ eventId: eventId!, draftId: d.id })}>
                        <Text style={styles.draftApproveText}>Approve</Text>
                      </Pressable>
                      <Pressable style={styles.draftReject} onPress={() => rejectDraft({ eventId: eventId!, draftId: d.id })}>
                        <Text style={styles.draftRejectText}>Not now</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                {checklist.needsYou && (
                  <View style={styles.needs}>
                    <Text style={styles.needsTitle}>{checklist.needsYou.title}</Text>
                    <Text style={styles.needsBody}>{checklist.needsYou.body}</Text>
                  </View>
                )}
                <Pressable onPress={review} style={{ alignSelf: "center", marginTop: 8 }} hitSlop={10}>
                  <Text style={styles.link}>Review & edit before sending →</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: chatX }] }]} pointerEvents={pageIdx === 1 ? "auto" : "none"}>
          <ScrollView ref={scroller} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled">
            {showOpeningPrompt ? (
              <View style={styles.openingWrap}>
                <Text style={styles.openingPrompt}>What are we making happen?</Text>
                <Text style={styles.openingExample}>{EXAMPLES[exampleIdx]}</Text>
              </View>
            ) : messages.length === 0 ? (
              <View style={{ gap: 12 }}>
                <Text style={styles.chatIntro}>Ask your agent to change something, unblock a step, or explain a choice.</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {SUGGESTIONS.map((s) => (
                    <Pressable key={s} style={styles.suggestion} onPress={() => send(s)}>
                      <Text style={styles.suggestionText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              messages.map((m, i) => (
                <View key={i} style={m.from === "me" ? styles.rowMe : styles.rowAgent}>
                  {m.from === "agent" && <Text style={styles.from}>MUSE</Text>}
                  <View style={[styles.bubble, m.from === "me" ? styles.bubbleMe : styles.bubbleAgent]}>
                    <Text style={styles.bubbleText}>{m.text}</Text>
                    {m.note && <Text style={styles.bubbleNote}>{m.note}</Text>}
                  </View>
                </View>
              ))
            )}
            {thinking && (
              <View style={styles.rowAgent}>
                <Text style={styles.from}>MUSE</Text>
                <View style={[styles.bubble, styles.bubbleAgent]}><Text style={[styles.bubbleText, { color: agent.muted }]}>Thinking…</Text></View>
              </View>
            )}
            {!thinking && pendingQuestion?.inputType === "chips" && pendingQuestion.options?.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginLeft: 4 }}>
                {pendingQuestion.options.map((o) => (
                  <Pressable key={o} style={[styles.suggestion, o === pendingQuestion.defaultOption && styles.suggestionDefault]} onPress={() => send(o)}>
                    <Text style={[styles.suggestionText, o === pendingQuestion.defaultOption && styles.suggestionTextDefault]}>{o}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder={showOpeningPrompt ? "Tell Muse what's happening…" : pageIdx === 0 ? "Ask your agent anything…" : "Message your agent…"}
          placeholderTextColor={agent.dim}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => send()}
          returnKeyType="send"
          editable={!thinking}
        />
        <Pressable style={[styles.sendBtn, (!draft.trim() || thinking) && { opacity: 0.4 }]} onPress={() => send()} disabled={!draft.trim() || thinking} accessibilityLabel="Send">
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
      {sessionId && !onboardingComplete && (
        <Pressable style={styles.skipRow} onPress={onSkipRest} disabled={thinking}>
          <Text style={styles.skipText}>Skip the rest, use my judgement →</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

function StepRow({ s }: { s: Step }) {
  const todo = s.state === "todo";
  return (
    <View style={styles.step}>
      <View
        style={[
          styles.circle,
          s.state === "done" && styles.circleDone,
          s.state === "active" && styles.circleActive,
          s.state === "blocked" && styles.circleBlocked,
          todo && styles.circleTodo,
        ]}
      >
        {s.state === "done" && <Ionicons name="checkmark" size={16} color="#fff" />}
        {s.state === "blocked" && <Text style={styles.bang}>!</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.stepLabel, todo && { color: agent.dim }]}>{s.label}</Text>
        {!todo && <Text style={[styles.stepDetail, s.state === "blocked" && { color: agent.warn }]}>{s.detail}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: agent.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 52, paddingHorizontal: 14, paddingBottom: 6 },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: agent.text },
  mascotWrap: { height: 100, alignItems: "center", justifyContent: "flex-start", zIndex: 0 },
  pager: { flex: 1, overflow: "hidden", zIndex: 1 },
  status: { color: agent.muted, padding: 24 },
  waitingWrap: { flex: 1, justifyContent: "center", padding: 32, gap: 10 },
  waitingTitle: { color: agent.text, fontSize: 22, fontWeight: "800" },
  waitingBody: { color: agent.muted, fontSize: 15, lineHeight: 21 },
  checkContent: { flexGrow: 1, justifyContent: "space-between", padding: 24, paddingTop: 12, paddingBottom: 12 },
  kicker: { color: agent.muted, fontSize: 14 },
  title: { color: agent.text, fontSize: 38, lineHeight: 42, fontWeight: "800", letterSpacing: -0.5, marginTop: 6 },
  sub: { color: agent.muted, fontSize: 15, marginTop: 8 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  circle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 1 },
  circleDone: { backgroundColor: agent.blue },
  circleActive: { borderWidth: 2.5, borderColor: agent.ring },
  circleBlocked: { backgroundColor: agent.warn },
  circleTodo: { borderWidth: 2.5, borderColor: agent.todo },
  bang: { color: "#1B1B1F", fontWeight: "900", fontSize: 16 },
  stepLabel: { color: agent.text, fontSize: 17, fontWeight: "700", lineHeight: 22 },
  stepDetail: { color: agent.muted, fontSize: 14, lineHeight: 19, marginTop: 2 },
  needs: { backgroundColor: agent.card, borderRadius: 18, padding: 18 },
  needsTitle: { color: agent.text, fontWeight: "700", fontSize: 15 },
  needsBody: { color: agent.muted, fontSize: 15, lineHeight: 21, marginTop: 4 },
  draftApprove: { flex: 1, backgroundColor: agent.blue, borderRadius: 12, paddingVertical: 10, alignItems: "center" },
  draftApproveText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  draftReject: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: agent.line },
  draftRejectText: { color: agent.muted, fontWeight: "600", fontSize: 14 },
  link: { color: agent.link, fontSize: 16, fontWeight: "700" },
  chatContent: { flexGrow: 1, padding: 20, paddingTop: 12, gap: 14, justifyContent: "flex-end" },
  openingWrap: { flexGrow: 1, justifyContent: "center", gap: 10 },
  openingPrompt: { color: agent.text, fontSize: 36, lineHeight: 40, fontWeight: "800", letterSpacing: -0.5 },
  openingExample: { color: agent.dim, fontSize: 16 },
  chatIntro: { color: agent.muted, fontSize: 16, lineHeight: 22 },
  suggestion: { borderWidth: 1, borderColor: agent.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: agent.card },
  suggestionDefault: { backgroundColor: agent.blue, borderColor: agent.blue },
  suggestionText: { color: agent.text, fontSize: 14 },
  suggestionTextDefault: { color: "#fff", fontWeight: "600" },
  rowMe: { alignItems: "flex-end" },
  rowAgent: { alignItems: "flex-start", gap: 4 },
  from: { color: agent.link, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginLeft: 4 },
  bubble: { maxWidth: "86%", borderRadius: 18, paddingHorizontal: 15, paddingVertical: 11 },
  bubbleMe: { backgroundColor: agent.bubbleMe, borderBottomRightRadius: 6 },
  bubbleAgent: { backgroundColor: agent.card, borderBottomLeftRadius: 6 },
  bubbleText: { color: agent.text, fontSize: 15, lineHeight: 21 },
  bubbleNote: { color: agent.muted, fontSize: 12, marginTop: 4 },
  composer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderTopColor: agent.line },
  input: { flex: 1, backgroundColor: agent.card, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, color: agent.text, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: agent.blue, alignItems: "center", justifyContent: "center" },
  skipRow: { alignItems: "center", paddingBottom: 22 },
  skipText: { color: agent.link, fontWeight: "600", fontSize: 13 },
});
