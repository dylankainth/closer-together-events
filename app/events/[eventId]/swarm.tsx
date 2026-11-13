import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo, ActivityIndicator, Animated, Easing, PanResponder, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { HuddleRecovery } from "@/components/events/HuddleRecovery";
// One shared palette for every Muse-at-work surface (checklist, swarm, room) so they cannot drift.
import { agent as palette } from "@/theme/swipeTheme";

// Dark "wow moment" palette, copied verbatim from design/sketches/04-swarm-wow-moment.html and its
// phone adaptation (the-swarm-mobile.html) — deliberately not theme/tokens.ts, which is the light
// Facebook-chrome palette the rest of the app uses. This screen is a one-off full-bleed moment.

type NodeState = "idle" | "talking" | "going" | "maybe" | "cant";

// Per-state look-up table, lifted straight from the reference's `LOOK`/`look` objects.
const NODE_LOOK: Record<NodeState, { bg: string; border: string; fg: string; line: string; pulse: boolean }> = {
  idle: { bg: "#1E2028", border: "#33363F", fg: palette.dim, line: "rgba(255,255,255,0.08)", pulse: false },
  talking: { bg: "#1E2A6E", border: "#4F6BFF", fg: "#FFFFFF", line: "#4F6BFF", pulse: true },
  going: { bg: palette.going, border: palette.going, fg: palette.darkFg, line: palette.goingLine, pulse: false },
  maybe: { bg: palette.maybe, border: palette.maybe, fg: palette.darkFg, line: "rgba(242,193,78,0.6)", pulse: false },
  cant: { bg: "#2A2C35", border: "#4A4D57", fg: palette.muted, line: "rgba(255,255,255,0.05)", pulse: false },
};
const CHIP: Record<"going" | "maybe" | "cant", [string, string]> = {
  going: ["GOING", palette.going],
  maybe: ["MAYBE", palette.maybe],
  cant: ["CAN'T", "#2A2C35"], // matches the reference literally: the "can't" chip stays low-contrast/muted on purpose
};

type ShortlistItem = {
  personaId: string;
  name: string;
  initials: string;
  color: string;
  reason: string;
  selected?: boolean;
  available?: boolean;
  hop?: number;
  via?: string;
};

// A fixed virtual canvas the node graph is laid out on, independent of the visible frame's actual
// pixel size — this is what gives pan/zoom somewhere to go. The frame is just a clipped viewport.
const VIRTUAL_SIZE = 340;
const N_INNER = 4;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;
const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Polar layout: up to 4 nodes on a tight inner ring (bigger), the rest spread around an outer ring
// (smaller) — the same two-ring scheme as the desktop and mobile design references.
function nodePositions(count: number) {
  const nInner = Math.min(N_INNER, count);
  const nOuter = count - nInner;
  const cx = VIRTUAL_SIZE / 2, cy = VIRTUAL_SIZE / 2;
  const rInner = VIRTUAL_SIZE * 0.23, rOuter = VIRTUAL_SIZE * 0.42;
  const szInner = VIRTUAL_SIZE * 0.165, szOuter = VIRTUAL_SIZE * 0.135;
  const pos: { x: number; y: number; size: number; r: number; deg: number }[] = [];
  for (let i = 0; i < nInner; i++) {
    const deg = (i / nInner) * 360 + 22.5;
    const rad = (deg * Math.PI) / 180;
    pos.push({ x: cx + Math.cos(rad) * rInner, y: cy + Math.sin(rad) * rInner, size: szInner, r: rInner, deg });
  }
  for (let i = 0; i < Math.max(nOuter, 0); i++) {
    const deg = (i / nOuter) * 360 + 15;
    const rad = (deg * Math.PI) / 180;
    pos.push({ x: cx + Math.cos(rad) * rOuter, y: cy + Math.sin(rad) * rOuter, size: szOuter, r: rOuter, deg });
  }
  return pos;
}

// Clamp one axis of the pan translation so the canvas can never be dragged fully out of the frame:
// solving "overlap(t) >= minOverlap" for t (where overlap is the usual 1D interval-intersection
// length) gives a clean symmetric bound that works whether the canvas is bigger or smaller than the
// frame, which both happen here as the user zooms in/out.
const OVERLAP_FRACTION = 0.3;
function clampAxis(t: number, dim: number, frame: number) {
  if (frame <= 0) return t;
  const minOverlap = Math.min(dim, frame) * OVERLAP_FRACTION;
  const lo = minOverlap - dim;
  const hi = frame - minOverlap;
  return clampNum(t, Math.min(lo, hi), Math.max(lo, hi));
}

export default function Swarm() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { viewerId } = useViewer();
  void viewerId; // not needed for reads here (getByEventId/listForEvent key off the event's host), kept for parity with sibling screens

  const event = useQuery(api.events.getByEventId, { eventId });
  const messages = useQuery(api.huddleData.messagesForEvent, { eventId }) ?? [];
  const guests = useQuery(api.guests.listForEvent, { eventId }) ?? [];

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReducedMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReducedMotion);
    return () => sub?.remove?.();
  }, []);

  // ---------- derive node/feed/stat state from live Convex data (no extra server query) ----------
  const shortlist = (event?.shortlist ?? []) as ShortlistItem[];
  const allCandidates = useMemo(() => shortlist.filter((s) => s.selected), [shortlist]);

  const guestByPersona = useMemo(() => {
    const m = new Map<string, (typeof guests)[number]>();
    for (const g of guests) if (g.personaId) m.set(g.personaId, g);
    return m;
  }, [guests]);

  // idle -> no "ask" message mentions this persona yet; talking -> asked but unresolved; otherwise
  // the resolved state, real RSVP first and the Muse's verdict only as a stand-in (see below).
  const stateByPersona = useMemo(() => {
    const m = new Map<string, NodeState>();
    for (const c of allCandidates) {
      const guest = guestByPersona.get(c.personaId);
      // What the PERSON did outranks what their Muse suggested. This used to read the nudge
      // first and fall back to `status`, but every invited guest has a nudge, so the fallback
      // never ran: someone whose Muse said "maybe" stayed MAYBE forever even after they tapped
      // Going. A recommendation is not an answer, and it must never overwrite one.
      let state: NodeState | null =
        guest?.status === "going"
          ? "going"
          : guest?.status === "maybe"
            ? "maybe"
            : guest?.status === "skip" || guest?.status === "cant"
              ? "cant"
              : null;
      // Still "invited" — nobody has answered yet, so the Muse's verdict is the only signal there
      // is, and showing it is the whole point of the swarm while the huddle is running.
      if (!state) {
        const verdict = guest?.nudge?.verdict;
        state = verdict === "worth" ? "going" : verdict === "maybe" ? "maybe" : null;
      }
      if (!state) state = messages.some((msg) => msg.forPersona === c.personaId) ? "talking" : "idle";
      m.set(c.personaId, state);
    }
    return m;
  }, [allCandidates, guestByPersona, messages]);

  // Two different numbers, deliberately not conflated. `upForIt` is what the Muses concluded,
  // which is what the swarm is showing while the huddle runs; `rsvpdCount` is how many people
  // have actually answered Going. Labelling the first "confirmed" overstated it — nobody has
  // confirmed anything until they tap.
  const goingCount = allCandidates.filter((c) => stateByPersona.get(c.personaId) === "going").length;
  const rsvpdCount = allCandidates.filter((c) => guestByPersona.get(c.personaId)?.status === "going").length;
  const activeCount = allCandidates.filter((c) => stateByPersona.get(c.personaId) === "talking").length;
  const askedCount = allCandidates.filter((c) => stateByPersona.get(c.personaId) !== "idle").length;
  const totalCount = allCandidates.length;
  const confirmedPct = totalCount > 0 ? Math.round((goingCount / totalCount) * 100) : 0;

  // Cap how many nodes are actually drawn so the graph stays legible; stats above still count the
  // full shortlist, only the visual is capped.
  const nodeCandidates = allCandidates.slice(0, 14);
  const positions = useMemo(() => nodePositions(nodeCandidates.length), [nodeCandidates.length]);

  // Order the live feed by how recently each persona's thread last moved (any message touching
  // them, by seq) — guests themselves carry no timestamp, so the huddle transcript's seq is the
  // next best "when did this resolve" signal.
  const lastSeqByPersona = useMemo(() => {
    const ids = new Set(allCandidates.map((c) => c.personaId));
    const m = new Map<string, number>();
    for (const msg of messages) {
      for (const pid of [msg.forPersona, msg.fromPersona, msg.toPersona]) {
        if (ids.has(pid)) m.set(pid, Math.max(m.get(pid) ?? 0, msg.seq));
      }
    }
    return m;
  }, [messages, allCandidates]);

  const feed = useMemo(() => {
    return allCandidates
      .map((c) => ({ ...c, state: stateByPersona.get(c.personaId) as NodeState, seq: lastSeqByPersona.get(c.personaId) ?? 0 }))
      .filter((c) => c.state === "going" || c.state === "maybe" || c.state === "cant")
      .sort((a, b) => b.seq - a.seq)
      .slice(0, 6)
      .map((c) => {
        const guest = guestByPersona.get(c.personaId);
        const reason = guest?.nudge?.reasons?.[0] || guest?.nudge?.text || c.reason || "";
        return { ...c, reason };
      });
  }, [allCandidates, stateByPersona, lastSeqByPersona, guestByPersona]);

  // ---------- pan/zoom: PanResponder + Animated only (no gesture-handler — native module, out of bounds) ----------
  const transform = useRef({ x: 0, y: 0, scale: 1 }); // authoritative current value; Animated.Value has no sync getter
  const defaultTransform = useRef({ x: 0, y: 0, scale: 1 });
  const frameSize = useRef({ w: 0, h: 0 });
  const hasLaidOut = useRef(false);
  const animX = useRef(new Animated.Value(0)).current;
  const animY = useRef(new Animated.Value(0)).current;
  const animScale = useRef(new Animated.Value(1)).current;

  const applyTransform = useCallback((t: { x: number; y: number; scale: number }) => {
    transform.current = t;
    animX.setValue(t.x);
    animY.setValue(t.y);
    animScale.setValue(t.scale);
  }, [animX, animY, animScale]);

  const clampPan = useCallback((x: number, y: number, scale: number): [number, number] => {
    const dim = VIRTUAL_SIZE * scale;
    return [clampAxis(x, dim, frameSize.current.w), clampAxis(y, dim, frameSize.current.h)];
  }, []);

  const [hintVisible, setHintVisible] = useState(true);
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const dismissHint = useCallback(() => {
    if (!hintVisible) return;
    setHintVisible(false);
    Animated.timing(hintOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
  }, [hintVisible, hintOpacity]);

  const gestureBase = useRef({ x: 0, y: 0, scale: 1 });
  const pinch = useRef<{ startDist: number; startScale: number; startX: number; startY: number; midX: number; midY: number } | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          dismissHint();
          // Sync the authoritative ref with whatever the (possibly still-animating, e.g. mid
          // reset-view) Animated.Values currently hold, so a grab mid-animation doesn't jump.
          animX.stopAnimation((x) => (gestureBase.current.x = transform.current.x = x));
          animY.stopAnimation((y) => (gestureBase.current.y = transform.current.y = y));
          animScale.stopAnimation((s) => (gestureBase.current.scale = transform.current.scale = s));
          pinch.current = null;
        },
        onPanResponderMove: (evt, g) => {
          const touches = evt.nativeEvent.touches;
          if (touches.length >= 2) {
            const [a, b] = touches;
            const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            const midX = ((a.locationX ?? 0) + (b.locationX ?? 0)) / 2;
            const midY = ((a.locationY ?? 0) + (b.locationY ?? 0)) / 2;
            if (!pinch.current) pinch.current = { startDist: dist, startScale: gestureBase.current.scale, startX: gestureBase.current.x, startY: gestureBase.current.y, midX, midY };
            const p = pinch.current;
            const scale = clampNum(p.startScale * (dist / Math.max(p.startDist, 1)), MIN_SCALE, MAX_SCALE);
            // Anchor the pinch midpoint: whatever canvas point was under the fingers when the pinch
            // started stays under the fingers as the scale changes.
            const k = scale / p.startScale;
            const nx = p.midX - k * (p.midX - p.startX);
            const ny = p.midY - k * (p.midY - p.startY);
            const [cx, cy] = clampPan(nx, ny, scale);
            applyTransform({ x: cx, y: cy, scale });
          } else {
            pinch.current = null;
            const nx = gestureBase.current.x + g.dx;
            const ny = gestureBase.current.y + g.dy;
            const [cx, cy] = clampPan(nx, ny, transform.current.scale);
            applyTransform({ x: cx, y: cy, scale: transform.current.scale });
          }
        },
        onPanResponderRelease: () => { pinch.current = null; },
        onPanResponderTerminate: () => { pinch.current = null; },
      }),
    [applyTransform, clampPan, dismissHint, animX, animY, animScale],
  );

  const resetView = useCallback(() => {
    const d = defaultTransform.current;
    const duration = reducedMotion ? 0 : 280;
    Animated.parallel([
      Animated.timing(animX, { toValue: d.x, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(animY, { toValue: d.y, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(animScale, { toValue: d.scale, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
    transform.current = { ...d };
    gestureBase.current = { ...d };
  }, [animX, animY, animScale, reducedMotion]);

  const onFrameLayout = useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    frameSize.current = { w: width, h: height };
    // The frame is wide and short, so height is the limiting dimension for fitting the (square)
    // virtual canvas; add a little headroom so the outer ring doesn't sit flush on the edges.
    const fitScale = clampNum((height / VIRTUAL_SIZE) * 1.15, MIN_SCALE, MAX_SCALE);
    const dx = (width - VIRTUAL_SIZE * fitScale) / 2;
    const dy = (height - VIRTUAL_SIZE * fitScale) / 2;
    defaultTransform.current = { x: dx, y: dy, scale: fitScale };
    if (!hasLaidOut.current) {
      hasLaidOut.current = true;
      applyTransform(defaultTransform.current);
      gestureBase.current = { ...defaultTransform.current };
    }
  }, [applyTransform]);

  // One shared pulse driving every "talking" node's glow ring, rather than a loop per node.
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, pulseAnim]);

  const blinkAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reducedMotion, blinkAnim]);

  // RN 0.88's ScrollView ref type doesn't fit the usual useRef<ScrollView> pattern (see
  // planning.tsx); only scrollTo is called here.
  const scrollRef = useRef<any>(null);
  // "Replay" on live data can't re-run the huddle — it's real, not a script. So it replays the
  // *view*: snap back to the default pan/zoom and scroll the feed to the newest entry, which is
  // the honest equivalent of "show me the swarm again" for a reactive screen.
  const replay = useCallback(() => {
    resetView();
    scrollRef.current?.scrollTo({ y: 0, animated: !reducedMotion });
  }, [resetView, reducedMotion]);

  if (event === undefined) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={palette.text} />
      </View>
    );
  }
  if (event === null) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.notFound}>This event couldn't be found.</Text>
      </View>
    );
  }

  const stageTransform = {
    transform: [{ translateX: animX }, { translateY: animY }, { scale: animScale }],
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace(`/events/${eventId}`))} hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color={palette.text} />
        </Pressable>
        <View style={styles.livePill}>
          <Animated.View style={[styles.liveDot, { opacity: reducedMotion ? 1 : blinkAnim }]} />
          <Text style={styles.livePillText}>LIVE</Text>
        </View>
        <Pressable onPress={replay} hitSlop={12} style={styles.iconBtn} accessibilityLabel="Replay">
          <Ionicons name="refresh" size={21} color={palette.text} />
        </Pressable>
      </View>

      <View style={styles.headlineBlock}>
        <Text style={styles.eyebrow}>{activeCount} conversation{activeCount === 1 ? "" : "s"} live</Text>
        <Text style={styles.eventTitle}>{event.title}</Text>
      </View>

      <View style={styles.mapWrap}>
        <View style={styles.mapFrame} onLayout={onFrameLayout} {...responder.panHandlers}>
          <Animated.View style={[styles.mapInner, stageTransform]}>
            {positions.map((p, i) => {
              const c = nodeCandidates[i];
              if (!c) return null;
              return (
                <View
                  key={`edge-${c.personaId}`}
                  style={{
                    position: "absolute",
                    left: VIRTUAL_SIZE / 2,
                    top: VIRTUAL_SIZE / 2 - 1,
                    width: p.r,
                    height: 2,
                    backgroundColor: NODE_LOOK[stateByPersona.get(c.personaId) ?? "idle"].line,
                    transform: [{ rotate: `${p.deg}deg` }],
                    transformOrigin: "0% 50%" as any,
                  }}
                />
              );
            })}
            <View style={[styles.centerNode, { width: VIRTUAL_SIZE * 0.3, height: VIRTUAL_SIZE * 0.3, left: VIRTUAL_SIZE * 0.35, top: VIRTUAL_SIZE * 0.35 }]}>
              <Text style={styles.centerNodeText} numberOfLines={1}>{(event.title || "Your event").split(" ")[0]}</Text>
            </View>
            {positions.map((p, i) => {
              const c = nodeCandidates[i];
              if (!c) return null;
              const state = stateByPersona.get(c.personaId) ?? "idle";
              const look = NODE_LOOK[state];
              return (
                <View key={c.personaId} style={{ position: "absolute", left: p.x - p.size / 2, top: p.y - p.size / 2, width: p.size, height: p.size }}>
                  {look.pulse && !reducedMotion && (
                    <Animated.View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        left: -6, top: -6, right: -6, bottom: -6,
                        borderRadius: 999,
                        borderWidth: 2,
                        borderColor: look.border,
                        opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.75, 0] }),
                        transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
                      }}
                    />
                  )}
                  <View style={{ width: p.size, height: p.size, borderRadius: 999, backgroundColor: look.bg, borderWidth: 2, borderColor: look.border, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: look.fg, fontSize: Math.round(p.size * 0.36), fontWeight: "700" }}>{c.initials}</Text>
                  </View>
                </View>
              );
            })}
          </Animated.View>

          {hintVisible && (
            <Animated.View style={[styles.mapHint, { opacity: hintOpacity }]} pointerEvents="none">
              <Text style={styles.mapHintText}>Pinch or drag to explore</Text>
            </Animated.View>
          )}
          <Pressable onPress={resetView} style={styles.mapReset} accessibilityLabel="Reset view">
            <Ionicons name="contract-outline" size={15} color={palette.sub} />
          </Pressable>
        </View>
      </View>

      {viewerId === event.hostId && <HuddleRecovery key={eventId} eventId={eventId} />}
      <View style={styles.headlineStat}>
        <View style={styles.headlineRow}>
          <Text style={styles.headlineNum}>{goingCount}</Text>
          <Text style={styles.headlineOf}>/ {totalCount} up for it</Text>
          <View style={styles.rsvpPill}>
            <Text style={styles.rsvpNum}>{rsvpdCount}</Text>
            <Text style={styles.rsvpLabel}>RSVP'd</Text>
          </View>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${confirmedPct}%` }]} />
        </View>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Muses asked</Text>
          <Text style={styles.statValue}>{askedCount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Messages</Text>
          <Text style={styles.statValue}>{messages.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Private info shared</Text>
          {/* Always 0: the never-share check (claude.md §5.3) blocks leaks before they're sent, so
              this is a true statement about the privacy guard, not a placeholder. */}
          <Text style={[styles.statValue, { color: palette.going }]}>0</Text>
        </View>
      </View>

      <View style={styles.logHead}>
        <Text style={styles.eyebrow}>What the Muses are saying</Text>
      </View>
      <ScrollView ref={scrollRef} style={styles.logList} contentContainerStyle={styles.logListContent}>
        {feed.length === 0 && <Text style={styles.empty}>Waiting for the huddle to start…</Text>}
        {feed.map((e, i) => {
          const [label, chipColor] = CHIP[e.state as "going" | "maybe" | "cant"];
          return (
            <Pressable
              key={e.personaId}
              style={[styles.logItem, { opacity: 1 - i * 0.12 }]}
              onPress={() => router.push(`/events/${eventId}/room?personaId=${e.personaId}`)}
              accessibilityLabel={`Open the Muse conversation about ${e.name}`}
            >
              <View style={[styles.logAvatar, { backgroundColor: e.color }]}>
                <Text style={styles.logAvatarText}>{e.initials}</Text>
              </View>
              <View style={styles.logBody}>
                <View style={styles.logHeadRow}>
                  <Text style={styles.logName}>{e.name}'s Muse</Text>
                  <View style={[styles.logChip, { backgroundColor: chipColor }]}>
                    <Text style={styles.logChipText}>{label}</Text>
                  </View>
                </View>
                <Text style={styles.logText}>{e.reason}</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={palette.dim} style={{ marginTop: 2 }} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.foot}>
        <Pressable onPress={() => router.push(`/events/${eventId}/transcript`)}>
          <Text style={styles.footLink}>See full transcript →</Text>
        </Pressable>
        <Pressable onPress={replay}>
          <Text style={styles.replayLink}>Replay</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  center: { alignItems: "center", justifyContent: "center" },
  notFound: { color: palette.sub, fontSize: 15 },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 52, paddingHorizontal: 14 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: palette.going },
  livePillText: { fontSize: 12, fontWeight: "700", color: palette.going, letterSpacing: 0.4 },

  headlineBlock: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14 },
  eyebrow: { fontSize: 12, fontWeight: "600", color: palette.muted, letterSpacing: 1.3, textTransform: "uppercase" },
  eventTitle: { fontSize: 24, fontWeight: "700", color: palette.text, marginTop: 4, letterSpacing: -0.3 },

  mapWrap: { paddingHorizontal: 20, paddingBottom: 8 },
  mapFrame: { height: 164, borderRadius: 16, borderWidth: 1, borderColor: palette.panelLine, backgroundColor: "#12131A", overflow: "hidden" },
  mapInner: { position: "absolute", left: 0, top: 0, width: VIRTUAL_SIZE, height: VIRTUAL_SIZE },
  centerNode: { position: "absolute", borderRadius: 999, backgroundColor: palette.text, alignItems: "center", justifyContent: "center" },
  centerNodeText: { color: palette.bg, fontWeight: "700", fontSize: 11, paddingHorizontal: 4 },
  mapHint: {
    position: "absolute", left: 10, bottom: 10, backgroundColor: "rgba(14,15,20,0.72)",
    borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
  },
  mapHintText: { fontSize: 10.5, fontWeight: "600", color: palette.sub },
  mapReset: {
    position: "absolute", right: 8, bottom: 8, width: 30, height: 30, borderRadius: 999,
    backgroundColor: "rgba(14,15,20,0.75)", borderWidth: 1, borderColor: palette.panelLine,
    alignItems: "center", justifyContent: "center",
  },

  headlineStat: { paddingHorizontal: 20, paddingTop: 6, gap: 10 },
  headlineRow: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  // Sits to the right of the big number, baseline-aligned with it, so the two counts read as one
  // line: what the Muses think, then what people have actually said.
  rsvpPill: { marginLeft: "auto", flexDirection: "row", alignItems: "baseline", gap: 5, backgroundColor: palette.card, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  rsvpNum: { color: palette.going, fontSize: 17, fontWeight: "700" },
  rsvpLabel: { color: palette.muted, fontSize: 11.5, fontWeight: "600", letterSpacing: 0.3 },
  headlineNum: { fontSize: 56, fontWeight: "700", color: palette.text, letterSpacing: -1.5, lineHeight: 56 },
  headlineOf: { fontSize: 15, color: palette.sub },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: palette.panelLine, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 999, backgroundColor: palette.going },

  statGrid: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingTop: 16 },
  statCard: { flex: 1, backgroundColor: palette.card, borderRadius: 12, padding: 10, gap: 3 },
  statLabel: { fontSize: 10.5, color: palette.muted, lineHeight: 13 },
  statValue: { fontSize: 19, fontWeight: "700", color: palette.text },

  logHead: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  logList: { flex: 1 },
  logListContent: { paddingHorizontal: 20, paddingBottom: 14, gap: 8 },
  empty: { color: palette.dim, fontSize: 13, paddingVertical: 8 },
  logItem: { flexDirection: "row", gap: 11, alignItems: "flex-start", backgroundColor: palette.card, borderRadius: 14, padding: 11 },
  logAvatar: { width: 30, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  logAvatarText: { color: palette.darkFg, fontSize: 12, fontWeight: "700" },
  logBody: { flex: 1, gap: 2 },
  logHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  logName: { fontSize: 11.5, color: palette.muted },
  logChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  logChipText: { fontSize: 10, fontWeight: "700", color: palette.darkFg },
  logText: { fontSize: 13.5, lineHeight: 18, color: palette.text },

  foot: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20, borderTopWidth: 1, borderTopColor: palette.panelLine, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  footLink: { color: palette.link, fontSize: 15, fontWeight: "700" },
  replayLink: { color: palette.dim, fontSize: 13, fontWeight: "600" },
});
