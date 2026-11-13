import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { agent } from "@/theme/swipeTheme";
import { Mascot, type MascotHandle } from "@/components/Mascot";

type Msg = { from: "me" | "agent"; text: string; note?: string };
type TraceLine = { kind: "tool" | "result" | "think"; text: string };
type Step = { key: string; label: string; activeLabel: string; detail: string; explain: string; trace: TraceLine[]; state: "done" | "active" | "todo" | "blocked" };
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

// Agent-working engine: a tick-driven typewriter that plays through each step's trace lines
// (tool call -> result -> reasoning), one character at a time, before settling the step and
// moving to the next — modeled directly on the "Host 3b" design reference.
const TICK_MS = 30;
const WAIT_AFTER_THINK = 14; // ticks to hold after an italic reasoning line finishes typing
const WAIT_AFTER_OTHER = 9; // ticks to hold after a tool-call or result line finishes typing
const WAIT_BETWEEN_STEPS = 16; // ticks to hold on a freshly-settled step before the next one starts
const charsPerTick = (kind: TraceLine["kind"]) => (kind === "result" ? 99 : kind === "tool" ? 3 : 2);

type Engine = { s: number; l: number; c: number; wait: number; t: number };
const ENGINE_START: Engine = { s: 0, l: 0, c: 0, wait: 12, t: 0 };

// One continuous chat thread, start to finish: "what are we making happen" is the opening message,
// Muse's clarifying questions and your plain-text/chip answers follow as ordinary chat bubbles, and
// once the plan is created the same thread keeps going as the normal host<->Muse chat — all on page
// 1 of this pager. Page 0 is the live checklist, reachable by swiping, so you can watch Muse work
// while the conversation above keeps running.
export default function Planning() {
  const { eventId: paramEventId, from } = useLocalSearchParams<{ eventId?: string; from?: string }>();
  const { viewerId } = useViewer();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());

  useEffect(() => {
    const shown = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hidden = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const [eventId, setEventId] = useState<string | undefined>(paramEventId);
  const [onboardingComplete, setOnboardingComplete] = useState(!!paramEventId);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [exampleIdx, setExampleIdx] = useState(0);

  const checklist = useQuery(api.checklist.forEvent, eventId ? { eventId } : "skip");
  const approve = useMutation(api.events.approve);
  const approveDraft = useMutation(api.events.approveDraft);
  const rejectDraft = useMutation(api.events.rejectDraft);
  const approveTask = useMutation(api.events.approveTask);
  const rejectTask = useMutation(api.events.rejectTask);
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
  const [explainStep, setExplainStep] = useState<Step | null>(null);
  // RN 0.88's ScrollView ref type doesn't fit the usual useRef<ScrollView> pattern; only scrollToEnd is called.
  const scroller = useRef<any>(null);
  const mascot = useRef<MascotHandle>(null);
  // The mascot's eyes follow wherever the screen is touched.
  const lookAtTouch = (e: { nativeEvent: { pageX: number; pageY: number } }) => mascot.current?.lookAtPage(e.nativeEvent.pageX, e.nativeEvent.pageY);

  // The first time the checklist page comes into view, it plays through each step one at a time —
  // a live "agent at work" trace: a step goes active, its tool-call/result/reasoning lines type
  // themselves out underneath, then it settles into its tick as the next step starts. A frozen
  // snapshot of checklist.items is taken when the run starts, so later live query updates (e.g. a
  // poster edit from chat) don't restart or glitch an already-running or finished playback.
  const [engine, setEngine] = useState<Engine>(ENGINE_START);
  const [planSnapshot, setPlanSnapshot] = useState<Step[] | null>(null);
  const engineTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Snapshot the plan once, the first time the checklist has data — freezes what the playback
  // animates through independent of later live updates to checklist.items.
  useEffect(() => {
    if (!checklist || planSnapshot) return;
    setPlanSnapshot(checklist.items);
  }, [checklist, planSnapshot]);

  const replay = useCallback(() => setEngine(ENGINE_START), []);

  useEffect(() => {
    if (!planSnapshot) return;
    engineTimer.current = setInterval(() => {
      setEngine((st) => {
        const total = planSnapshot.length;
        // Stop one step short of the end: the last step ("send invites") never auto-completes —
        // nothing is actually sent until the host does it for real — so it stays pending/waiting.
        if (st.s >= total - 1) return st;
        const t = st.t + 1;
        if (st.wait > 0) return { ...st, wait: st.wait - 1, t };
        const lines = planSnapshot[st.s].trace;
        if (lines.length === 0) return { ...st, s: st.s + 1, l: 0, c: 0, wait: WAIT_BETWEEN_STEPS, t }; // "send" has no trace
        const line = lines[st.l];
        const speed = charsPerTick(line.kind);
        if (st.c < line.text.length) return { ...st, c: Math.min(st.c + speed, line.text.length), t };
        const nextL = st.l + 1;
        if (nextL < lines.length) return { ...st, l: nextL, c: 0, wait: line.kind === "think" ? WAIT_AFTER_THINK : WAIT_AFTER_OTHER, t };
        return { ...st, s: st.s + 1, l: 0, c: 0, wait: WAIT_BETWEEN_STEPS, t };
      });
    }, TICK_MS);
    return () => {
      if (engineTimer.current) clearInterval(engineTimer.current);
    };
  }, [planSnapshot]); // one interval for the whole playback; replay() just resets `engine`, same interval keeps ticking it

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

  // Derives what each step row looks like right now from the engine's raw tick state — mirrors
  // the reference's renderVals(): which step is active, how far its current line has typed, and
  // which steps are still dimmed and waiting their turn.
  const playback = useMemo(() => {
    if (!planSnapshot) return null;
    const total = planSnapshot.length;
    const { s, l, c, t } = engine;
    const allDone = s >= total - 1;
    const steps = planSnapshot.map((step, i) => {
      const isDone = i < s;
      const isActive = i === s && !allDone;
      const isPending = !isDone && !isActive;
      const waiting = i === total - 1 && allDone; // "send" step, once everything else has settled
      const lines = isActive
        ? step.trace.slice(0, l + 1).map((ln, j) => {
            const full = j < l;
            return { ...ln, text: full ? ln.text : ln.text.slice(0, c), cursor: j === l };
          })
        : [];
      return { step, isDone, isActive, isPending, waiting, lines };
    });
    return { steps, allDone, doneCount: Math.min(s, total - 1), total, elapsed: (t * (TICK_MS / 1000)).toFixed(1) };
  }, [planSnapshot, engine]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
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
                <View style={styles.headRow}>
                  <Pressable style={styles.replayBtn} onPress={replay} hitSlop={8}>
                    <Text style={styles.replayText}>Replay</Text>
                  </Pressable>
                </View>
                <Text style={styles.eventName}>{checklist.title}</Text>
                <Text style={styles.title}>I'm on it</Text>
                <Text style={styles.sub}>
                  {playback ? playback.doneCount : checklist.doneCount} of {playback ? playback.total : checklist.total} done
                  {playback ? ` · ${playback.elapsed}s` : ""} · you can close the app
                </Text>
                <View style={{ marginTop: 26, gap: 18 }}>
                  {playback
                    ? playback.steps.map((row) => <StepRow key={row.step.key} row={row} onPress={() => setExplainStep(row.step)} />)
                    : checklist.items.map((s) => <StepRow key={s.key} row={{ step: s, isDone: s.state === "done", isActive: false, isPending: s.state !== "done", waiting: false, lines: [] }} onPress={() => setExplainStep(s)} />)}
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
                {checklist.pendingTasks.map((t) => (
                  <View key={t.id} style={styles.needs}>
                    <Text style={styles.needsTitle}>{t.title}</Text>
                    <Text style={styles.needsBody}>{t.body}</Text>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                      <Pressable style={styles.draftApprove} onPress={() => approveTask({ eventId: eventId!, taskId: t.id })}>
                        <Text style={styles.draftApproveText}>Go ahead</Text>
                      </Pressable>
                      <Pressable style={styles.draftReject} onPress={() => rejectTask({ eventId: eventId!, taskId: t.id })}>
                        <Text style={styles.draftRejectText}>Not now</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                {checklist.needsYou && (
                  <View style={styles.needs}>
                    <Text style={styles.needsTitle}>{checklist.needsYou.title}</Text>
                    <Text style={styles.needsBody}>{checklist.needsYou.body}</Text>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                      <Pressable style={styles.draftApprove} onPress={() => send(`Find another vendor for ${checklist.needsYou!.item}`)}>
                        <Text style={styles.draftApproveText}>Find another</Text>
                      </Pressable>
                      <Pressable style={styles.draftReject} onPress={() => rejectDraft({ eventId: eventId!, draftId: checklist.needsYou!.draftId })}>
                        <Text style={styles.draftRejectText}>Dismiss</Text>
                      </Pressable>
                    </View>
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

      {/* The composer and optional skip link share one inset. KeyboardAvoidingView already
          clears the open keyboard, so only reserve the navigation area while it is closed. */}
      <View style={{ paddingBottom: keyboardVisible ? 0 : insets.bottom }}>
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
      </View>

      <Modal visible={!!explainStep} transparent animationType="fade" onRequestClose={() => setExplainStep(null)}>
        <Pressable style={styles.explainBackdrop} onPress={() => setExplainStep(null)}>
          <Pressable style={styles.explainCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.explainTitle}>{explainStep?.label}</Text>
            <Text style={styles.explainBody}>{explainStep?.explain}</Text>
            <Pressable style={styles.explainClose} onPress={() => setExplainStep(null)}>
              <Text style={styles.explainCloseText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

type PlaybackLine = TraceLine & { cursor: boolean };
type PlaybackRow = { step: Step; isDone: boolean; isActive: boolean; isPending: boolean; waiting: boolean; lines: PlaybackLine[] };

function Spinner() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Animated.View style={[styles.spinnerRing, { transform: [{ rotate }] }]} />;
}

function Cursor() {
  const op = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(op, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [op]);
  return <Animated.Text style={[styles.cursor, { opacity: op }]}>▍</Animated.Text>;
}

function StepRow({ row, onPress }: { row: PlaybackRow; onPress: () => void }) {
  const { step, isDone, isActive, isPending, waiting, lines } = row;
  const blocked = isDone && step.state === "blocked";
  const dimmed = isPending && !waiting;
  return (
    <View style={[styles.step, dimmed && { opacity: 0.45 }]}>
      <Pressable style={styles.stepPress} onPress={onPress} hitSlop={6} disabled={isActive}>
        <View style={styles.circleSlot}>
          {isActive ? (
            <Spinner />
          ) : blocked ? (
            <View style={[styles.circle, styles.circleBlocked]}><Text style={styles.bang}>!</Text></View>
          ) : isDone ? (
            <View style={[styles.circle, styles.circleDone]}><Ionicons name="checkmark" size={14} color="#fff" /></View>
          ) : (
            <View style={[styles.circle, styles.circleTodo, waiting && styles.circleWaiting]} />
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.stepLabel, isPending && !waiting && { color: agent.dim }]}>{isActive ? `${step.activeLabel}…` : step.label}</Text>
          {(isDone || (isPending && waiting)) && (
            <Text style={[styles.stepDetail, blocked && { color: agent.warn }]}>{isDone && !blocked ? `└ ${step.detail}` : step.detail}</Text>
          )}
          {isActive && (
            <View style={styles.traceBlock}>
              {lines.map((ln, i) => (
                <View key={i}>
                  {ln.kind === "think" ? (
                    <Text style={styles.traceThink}>
                      {ln.text}
                      {ln.cursor && <Cursor />}
                    </Text>
                  ) : (
                    <View style={ln.kind === "tool" ? styles.traceToolRow : undefined}>
                      {ln.kind === "tool" && <View style={styles.traceDot} />}
                      <Text style={ln.kind === "tool" ? styles.traceTool : styles.traceResult}>
                        {ln.kind === "result" ? "└ " : ""}
                        {ln.text}
                        {ln.cursor && <Cursor />}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
          {waiting && isPending && (
            <View style={styles.waitingPill}>
              <Text style={styles.waitingPillText}>WAITING FOR YOU</Text>
            </View>
          )}
        </View>
      </Pressable>
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
  // The event's name, centred and big, under the mascot; "I'm on it" sits under it. Replay (top
  // right of this block) floats above both so re-watching the trace doesn't disturb the layout.
  headRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "flex-end" },
  replayBtn: { height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: agent.line, alignItems: "center", justifyContent: "center" },
  replayText: { color: agent.muted, fontSize: 12, fontWeight: "600" },
  eventName: { color: agent.text, fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.5, textAlign: "center" },
  title: { color: agent.text, fontSize: 20, lineHeight: 26, fontWeight: "700", textAlign: "center", marginTop: 6 },
  sub: { color: agent.muted, fontSize: 14, textAlign: "center", marginTop: 6 },
  step: {},
  stepPress: { flexDirection: "row", alignItems: "flex-start", gap: 14 },
  circleSlot: { width: 26, height: 26, alignItems: "center", justifyContent: "center", marginTop: 1 },
  circle: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  circleDone: { backgroundColor: agent.blue },
  circleBlocked: { backgroundColor: agent.warn },
  circleTodo: { borderWidth: 2, borderColor: agent.todo },
  circleWaiting: { borderColor: agent.ring },
  spinnerRing: { width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: agent.line, borderTopColor: agent.ring },
  bang: { color: "#1B1B1F", fontWeight: "900", fontSize: 16 },
  stepLabel: { color: agent.text, fontSize: 16, fontWeight: "700", lineHeight: 21 },
  stepDetail: { color: agent.muted, fontSize: 14, lineHeight: 19, marginTop: 2 },
  traceBlock: { marginTop: 6, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: agent.line, gap: 7 },
  traceToolRow: { flexDirection: "row", gap: 7, alignItems: "flex-start" },
  traceDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: agent.ring, marginTop: 6, flexShrink: 0 },
  traceTool: { fontFamily: "SpaceMono", fontSize: 12, color: agent.link, lineHeight: 17, flexShrink: 1 },
  traceResult: { fontFamily: "SpaceMono", fontSize: 12, color: agent.muted, lineHeight: 17 },
  traceThink: { fontSize: 13, fontStyle: "italic", color: agent.think, lineHeight: 18 },
  cursor: { color: agent.link },
  waitingPill: { alignSelf: "flex-start", marginTop: 4, backgroundColor: agent.ring, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  waitingPillText: { fontSize: 11, fontWeight: "700", color: agent.bg },
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
  explainBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  explainCard: { backgroundColor: agent.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 14 },
  explainTitle: { color: agent.text, fontSize: 20, fontWeight: "800" },
  explainBody: { color: agent.muted, fontSize: 15, lineHeight: 22 },
  explainClose: { alignSelf: "flex-start", marginTop: 4 },
  explainCloseText: { color: agent.link, fontWeight: "700", fontSize: 15 },
});
