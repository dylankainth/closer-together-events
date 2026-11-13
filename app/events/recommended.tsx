import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { ViewerSwitcher } from "@/components/ViewerSwitcher";
import { SwipeCard } from "@/components/events/SwipeCard";
import { swipe } from "@/theme/swipeTheme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const COMMIT = 90; // px a drag must travel before it counts as a swipe

/**
 * "Your week, by your agent": a stack of recommended events, best match first.
 *   swipe left / right  -> browse to the next / previous recommendation (never answers it)
 *   swipe up            -> leave the stack and open the general feed
 *   tap the card        -> open the event page with the full reasoning
 *   x / I'm going / clock buttons -> the only things that answer (ballot B10: the guest always taps it)
 */
export default function Recommended() {
  const { viewerId } = useViewer();
  const data = useQuery(api.feed.forViewer, { personaId: viewerId });
  const respond = useMutation(api.feed.respond);

  const list = data?.recommended ?? [];
  const n = list.length;
  const [cursor, setCursor] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;

  // Cards that get answered drop out of `list`, so the cursor already points at the next one.
  const idx = n === 0 ? 0 : ((cursor % n) + n) % n;
  const current = list[idx];

  // The responder is built once, so it reads live state through this ref.
  const live = useRef({ n, idx });
  live.current = { n, idx };

  const reset = useCallback(() => pan.setValue({ x: 0, y: 0 }), [pan]);
  useEffect(reset, [viewerId, reset]);

  const flyAway = useCallback(
    (toX: number, toY: number, then: () => void) => {
      Animated.timing(pan, { toValue: { x: toX, y: toY }, duration: 180, useNativeDriver: false }).start(() => {
        then();
        reset();
      });
    },
    [pan, reset],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          const { n: count } = live.current;
          const vertical = Math.abs(g.dy) > Math.abs(g.dx);
          if (vertical && g.dy < -COMMIT) {
            flyAway(0, -SCREEN_H, () => router.push("/events/feed"));
          } else if (!vertical && g.dx < -COMMIT && count > 1) {
            flyAway(-SCREEN_W, 0, () => setCursor((c) => c + 1));
          } else if (!vertical && g.dx > COMMIT && count > 1) {
            flyAway(SCREEN_W, 0, () => setCursor((c) => c - 1));
          } else {
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 7 }).start();
          }
        },
      }),
    [pan, flyAway],
  );

  const answer = (action: "going" | "cant" | "snooze") => {
    if (!current) return;
    respond({ eventId: current.eventId, personaId: viewerId, action });
  };

  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: ["-8deg", "0deg", "8deg"] });
  const open = () => current && router.push(`/events/${current.eventId}`);

  return (
    <View style={styles.screen}>
      <View style={styles.segments}>
        {Array.from({ length: Math.min(Math.max(n, 1), 8) }).map((_, i) => (
          <View key={i} style={[styles.segment, n > 0 && i <= Math.min(idx, 7) && styles.segmentOn]} />
        ))}
      </View>

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={swipe.ink} />
        </Pressable>
        <View style={styles.badge}>
          <Ionicons name="star" size={13} color="#fff" />
        </View>
        <Text style={styles.heading}>Your agent's picks</Text>
        {n > 0 && <Text style={styles.count}>{idx + 1}/{n}</Text>}
        <ViewerSwitcher />
      </View>

      <View style={styles.stage}>
        {data === undefined ? (
          <View style={[styles.empty, { opacity: 0.6 }]}><Text style={styles.emptyTitle}>Loading…</Text></View>
        ) : !current ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptyBody}>No new recommendations right now. Anything you snoozed will come back.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.push("/events/feed")}>
              <Text style={styles.emptyBtnText}>See all events</Text>
            </Pressable>
          </View>
        ) : (
          <Animated.View
            {...responder.panHandlers}
            style={[styles.front, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] }]}
          >
            <SwipeCard ev={current} onOpen={open} />
          </Animated.View>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.round} onPress={() => answer("cant")} disabled={!current} accessibilityLabel="Not for me">
          <Ionicons name="close" size={26} color={swipe.ink} />
        </Pressable>
        <Pressable style={styles.going} onPress={() => answer("going")} disabled={!current}>
          <Text style={styles.goingText}>I'm going</Text>
        </Pressable>
        <Pressable style={styles.round} onPress={() => answer("snooze")} disabled={!current} accessibilityLabel="Remind me later">
          <Ionicons name="time-outline" size={26} color={swipe.ink} />
        </Pressable>
      </View>

      <Pressable style={styles.hint} onPress={() => router.push("/events/feed")}>
        <Ionicons name="chevron-up" size={16} color="#8A8A94" />
        <Text style={styles.hintText}>Swipe up for all events</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF", paddingTop: 52, paddingBottom: 18 },
  segments: { flexDirection: "row", gap: 6, paddingHorizontal: 20 },
  segment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "#E4E4EA" },
  segmentOn: { backgroundColor: swipe.ink },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 18 },
  badge: { width: 28, height: 28, borderRadius: 14, backgroundColor: swipe.blue, alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, color: swipe.ink, fontWeight: "700", fontSize: 15 },
  count: { color: "#6B6B76", fontWeight: "600", fontSize: 13 },
  stage: { flex: 1, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  front: { flex: 1 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18, paddingVertical: 6 },
  round: { width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: "#D5D5DC", alignItems: "center", justifyContent: "center" },
  going: { backgroundColor: swipe.ink, borderRadius: 999, paddingHorizontal: 40, height: 60, alignItems: "center", justifyContent: "center" },
  goingText: { color: "#fff", fontWeight: "800", fontSize: 19 },
  hint: { flexDirection: "row", alignSelf: "center", alignItems: "center", gap: 4, paddingTop: 10 },
  hintText: { color: "#8A8A94", fontSize: 12, fontWeight: "600" },
  empty: { flex: 1, backgroundColor: "#F6F6F8", borderRadius: 28, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: swipe.ink },
  emptyBody: { textAlign: "center", color: "#55555F", fontSize: 15 },
  emptyBtn: { marginTop: 8, backgroundColor: swipe.ink, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 14 },
  emptyBtnText: { color: "#fff", fontWeight: "800" },
});
