import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, Easing, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { agent } from "@/theme/swipeTheme";

type Msg = { from: "me" | "agent"; text: string };
type Step = { key: string; label: string; detail: string; state: "done" | "active" | "todo" | "blocked" };

// Two pages side by side: 0 = the checklist, 1 = the chat with the Muse agent. Sending a message slides
// the checklist off and the chat in; swiping moves between them. DIR flips which way the checklist
// exits: 1 = off to the left (chat enters from the right, swipe left on the checklist to go to the chat),
// -1 = off to the right (chat enters from the left, swipe right on the checklist).
const DIR: 1 | -1 = 1;
const TOWARD = -DIR; // sign of a horizontal drag that moves from the checklist toward the chat
const SUGGESTIONS = ["What's holding things up?", "Why this date?", "Change the venue"];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export default function Planning() {
  const { eventId, from } = useLocalSearchParams<{ eventId: string; from?: string }>();
  const checklist = useQuery(api.checklist.forEvent, { eventId });
  const approve = useMutation(api.events.approve);
  const chat = useAction(api.hostChat.reply);

  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const page = useRef(new Animated.Value(0)).current; // 0 = checklist, 1 = chat
  const pageRef = useRef<0 | 1>(0);
  const [pageIdx, setPageIdx] = useState<0 | 1>(0);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  // RN 0.88's ScrollView ref type doesn't fit the usual useRef<ScrollView> pattern; only scrollToEnd is called.
  const scroller = useRef<any>(null);

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
  }, [messages.length, thinking]);

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || thinking) return;
    setDraft("");
    const history = messages;
    setMessages((m) => [...m, { from: "me", text }]);
    goTo(1); // the checklist slides away and the chat starts
    setThinking(true);
    try {
      const r = await chat({ eventId, message: text, history });
      setMessages((m) => [...m, { from: "agent", text: r.reply }]);
    } catch {
      setMessages((m) => [...m, { from: "agent", text: "I couldn't reach Muse just now. Try again in a moment." }]);
    } finally {
      setThinking(false);
    }
  };

  const review = async () => {
    if (checklist && checklist.status === "draft") await approve({ eventId });
    if (from === "manage") router.back();
    else router.replace(`/events/${eventId}/manage`);
  };

  const checklistX = page.interpolate({ inputRange: [0, 1], outputRange: [0, TOWARD * width] });
  const chatX = page.interpolate({ inputRange: [0, 1], outputRange: [-TOWARD * width, 0] });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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

      <View
        style={styles.pager}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
          setWidth(e.nativeEvent.layout.width);
        }}
        {...responder.panHandlers}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: checklistX }] }]} pointerEvents={pageIdx === 0 ? "auto" : "none"}>
          {checklist === undefined ? (
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

              <View style={{ marginTop: 28 }}>
                {checklist.needsYou && (
                  <View style={styles.needs}>
                    <Text style={styles.needsTitle}>{checklist.needsYou.title}</Text>
                    <Text style={styles.needsBody}>{checklist.needsYou.body}</Text>
                  </View>
                )}
                <Pressable onPress={review} style={{ alignSelf: "center", marginTop: 22 }} hitSlop={10}>
                  <Text style={styles.link}>Review & edit before sending →</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: chatX }] }]} pointerEvents={pageIdx === 1 ? "auto" : "none"}>
          <ScrollView ref={scroller} contentContainerStyle={styles.chatContent} keyboardShouldPersistTaps="handled">
            {messages.length === 0 ? (
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
          </ScrollView>
        </Animated.View>
      </View>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder={pageIdx === 0 ? "Ask your agent anything…" : "Message your agent…"}
          placeholderTextColor={agent.dim}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => send()}
          returnKeyType="send"
        />
        <Pressable style={[styles.sendBtn, (!draft.trim() || thinking) && { opacity: 0.4 }]} onPress={() => send()} disabled={!draft.trim() || thinking} accessibilityLabel="Send">
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      </View>
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
  pager: { flex: 1, overflow: "hidden" },
  status: { color: agent.muted, padding: 24 },
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
  link: { color: agent.link, fontSize: 16, fontWeight: "700" },
  chatContent: { flexGrow: 1, padding: 20, paddingTop: 12, gap: 14, justifyContent: "flex-end" },
  chatIntro: { color: agent.muted, fontSize: 16, lineHeight: 22 },
  suggestion: { borderWidth: 1, borderColor: agent.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: agent.card },
  suggestionText: { color: agent.text, fontSize: 14 },
  rowMe: { alignItems: "flex-end" },
  rowAgent: { alignItems: "flex-start", gap: 4 },
  from: { color: agent.link, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginLeft: 4 },
  bubble: { maxWidth: "86%", borderRadius: 18, paddingHorizontal: 15, paddingVertical: 11 },
  bubbleMe: { backgroundColor: agent.bubbleMe, borderBottomRightRadius: 6 },
  bubbleAgent: { backgroundColor: agent.card, borderBottomLeftRadius: 6 },
  bubbleText: { color: agent.text, fontSize: 15, lineHeight: 21 },
  composer: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 26, borderTopWidth: 1, borderTopColor: agent.line },
  input: { flex: 1, backgroundColor: agent.card, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, color: agent.text, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: agent.blue, alignItems: "center", justifyContent: "center" },
});
