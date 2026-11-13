import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { SwipeCard } from "@/components/events/SwipeCard";
import { swipe } from "@/theme/swipeTheme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const COMMIT = 90; // px a drag must travel before it counts as a swipe
const PICK_PREFIX = "pick:"; // eventId prefix of Muse picks (convex/discoveryCore.ts toPickView)

/**
 * "Your week, by your agent": a stack of recommended events, best match first.
 *   swipe right         -> next recommendation; on the last one it opens the general feed (never answers it)
 *   swipe left          -> previous recommendation; on the first one it does nothing
 *   swipe up            -> leave the stack and open the general feed
 *   tap the card        -> open the event page with the full reasoning
 *   x / I'm going / clock buttons -> the only things that answer (ballot B10: the guest always taps it)
 */
export default function Recommended() {
  const { viewerId } = useViewer();
  // Keep the buttons and the hint clear of the phone's own navigation buttons / gesture bar.
  const insets = useSafeAreaInsets();
  const data = useQuery(api.feed.forViewer, { personaId: viewerId });
  const respond = useMutation(api.feed.respond);
  const respondToPick = useMutation(api.picks.respond);

  const list = data?.recommended ?? [];
  const n = list.length;
  const [cursor, setCursor] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;

  // Not a loop: the cursor stops at the first and last card. Cards that get answered drop out of `list`,
  // so the cursor already points at the next one (and is clamped if the last card was answered).
  const idx = n === 0 ? 0 : Math.min(Math.max(cursor, 0), n - 1);
  const current = list[idx];

  // The responder is built once, so it reads live state through this ref.
  const live = useRef({ n, idx });
  live.current = { n, idx };

  // Everything except the bottom bar fades out when a swipe takes you to the feed, so the picks screen
  // isn't left showing underneath while the feed slides in.
  const fade = useRef(new Animated.Value(1)).current;

  const reset = useCallback(() => pan.setValue({ x: 0, y: 0 }), [pan]);
  useEffect(reset, [viewerId, reset]);

  // Coming back to this screen (from the feed, for example): put the card and the rest of the UI back.
  useFocusEffect(
    useCallback(() => {
      reset();
      fade.setValue(1);
    }, [reset, fade]),
  );

  const flyAway = useCallback(
    (toX: number, toY: number, then: () => void, leaving = false) => {
      if (leaving) Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      Animated.timing(pan, { toValue: { x: toX, y: toY }, duration: 180, useNativeDriver: false }).start(() => {
        then();
        // Leaving the screen: keep the card gone (it's put back on focus). Staying: snap back for the next card.
        if (!leaving) reset();
      });
    },
    [pan, reset, fade],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          const { n: count, idx: at } = live.current;
          const vertical = Math.abs(g.dy) > Math.abs(g.dx);
          if (count === 0) {
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 7 }).start();
          } else if (vertical && g.dy < -COMMIT) {
            flyAway(0, -SCREEN_H, () => router.navigate("/events/feed"), true);
          } else if (!vertical && g.dx > COMMIT) {
            // Right = next. Past the last card there is nothing left, so carry on to the general feed.
            if (at < count - 1) flyAway(SCREEN_W, 0, () => setCursor(at + 1));
            else flyAway(SCREEN_W, 0, () => router.navigate("/events/feed"), true);
          } else if (!vertical && g.dx < -COMMIT && at > 0) {
            // Left = previous. On the first card this falls through and just springs back.
            flyAway(-SCREEN_W, 0, () => setCursor(at - 1));
          } else {
            Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 7 }).start();
          }
        },
      }),
    [pan, flyAway],
  );

  const answer = (action: "going" | "cant" | "snooze") => {
    if (!current) return;
    // Muse picks of real nearby events live in their own table (convex/picks.ts).
    if (current.relation === "pick") {
      respondToPick({ personaId: viewerId, key: current.eventId.slice(PICK_PREFIX.length), action });
      return;
    }
    respond({ eventId: current.eventId, personaId: viewerId, action });
  };

  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: ["-8deg", "0deg", "8deg"] });
  const open = () => {
    if (!current || current.relation === "pick") return; // pick event page arrives with app/picks/[key].tsx
    router.push(`/events/${current.eventId}`);
  };

  return (
    <View style={[styles.screen, { paddingBottom: Math.max(insets.bottom, 10) + 8 }]}>
      <Animated.View style={{ flex: 1, opacity: fade }}>
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
      </View>

      <View style={styles.stage}>
        {data === undefined ? (
          <View style={[styles.empty, { opacity: 0.6 }]}><Text style={styles.emptyTitle}>Loading…</Text></View>
        ) : !current ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>You're all caught up</Text>
            <Text style={styles.emptyBody}>No new recommendations right now. Anything you snoozed will come back.</Text>
            <Pressable style={styles.emptyBtn} onPress={() => router.navigate("/events/feed")}>
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

      <Pressable style={styles.hint} onPress={() => router.navigate("/events/feed")}>
        <Ionicons name="chevron-up" size={16} color="#8A8A94" />
        <Text style={styles.hintText}>Swipe up for all events</Text>
      </Pressable>
      </Animated.View>
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
  hint: { flexDirection: "row", alignSelf: "center", alignItems: "center", gap: 4, paddingTop: 10, paddingBottom: 10 },
  hintText: { color: "#8A8A94", fontSize: 12, fontWeight: "600" },
  empty: { flex: 1, backgroundColor: "#F6F6F8", borderRadius: 28, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: swipe.ink },
  emptyBody: { textAlign: "center", color: "#55555F", fontSize: 15 },
  emptyBtn: { marginTop: 8, backgroundColor: swipe.ink, borderRadius: 999, paddingHorizontal: 26, paddingVertical: 14 },
  emptyBtnText: { color: "#fff", fontWeight: "800" },
});
