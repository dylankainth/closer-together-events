import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/**
 * The platform mascot: a quiet cream character whose eyes look around and blink.
 *
 * Ported from the "quiet character" SVG demo. It is drawn with plain Views (not react-native-svg) so
 * it adds no native dependency. Every number below is the SVG's own coordinate, with the viewBox
 * origin (20, 28) subtracted, and the whole drawing is scaled to `size`.
 *
 * Eye behaviour, as in the demo plus what a phone needs (there is no mouse):
 *  - follows a point: the screen calls `lookAtPage(x, y)` on touches, and the eyes slide toward it
 *  - wanders on its own when nobody has touched the screen for a while
 *  - blinks every 2.5-6 s (the eyes squash to 10% height for ~120 ms)
 *  - `thinking` makes it glance up and away while Muse is working
 */
export type MascotHandle = { lookAtPage: (pageX: number, pageY: number) => void };

const VB_W = 160;
const VB_H = 130;
const MAX = 5; // how far the eyes can travel, in drawing units (the demo's value)
const IDLE_MS = 2500; // how long without a touch before the eyes start wandering

export const Mascot = forwardRef<MascotHandle, { size?: number; thinking?: boolean }>(function Mascot({ size = 120, thinking = false }, ref) {
  const scale = size / VB_W;
  const gaze = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const blink = useRef(new Animated.Value(1)).current;
  // RN 0.88's View ref type doesn't fit useRef<View>; only measureInWindow is called on it.
  const box = useRef<any>(null);
  const center = useRef<{ x: number; y: number } | null>(null);
  const lastTouch = useRef(0);
  const lastMeasure = useRef(0);
  const thinkingRef = useRef(thinking);
  thinkingRef.current = thinking;

  const lookTo = (x: number, y: number, ms = 120) =>
    Animated.timing(gaze, { toValue: { x, y }, duration: ms, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();

  const measure = () => {
    box.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
      if (w) center.current = { x: x + w / 2, y: y + h * 0.5 };
    });
  };

  useImperativeHandle(ref, () => ({
    lookAtPage: (pageX, pageY) => {
      lastTouch.current = Date.now();
      if (Date.now() - lastMeasure.current > 400) {
        lastMeasure.current = Date.now();
        measure();
      }
      const c = center.current;
      if (!c) return;
      // The demo's maths: aim along the direction to the point, further the further away it is (up to 300px),
      // with vertical travel damped to 60% so the eyes never look cross-eyed up or down.
      const dx = pageX - c.x;
      const dy = pageY - c.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / 300);
      lookTo((dx / d) * MAX * k, (dy / d) * MAX * 0.6 * k);
    },
  }));

  // Wander when idle; glance up and away while thinking.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const step = () => {
      if (thinkingRef.current) lookTo(-MAX * 0.7, -MAX * 0.6, 260);
      else if (Date.now() - lastTouch.current > IDLE_MS) lookTo((Math.random() * 2 - 1) * MAX, (Math.random() * 2 - 1) * MAX * 0.6, 220);
      t = setTimeout(step, 1400 + Math.random() * 2200);
    };
    t = setTimeout(step, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Occasional blink.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const doBlink = () => {
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.1, duration: 55, useNativeDriver: false }),
        Animated.timing(blink, { toValue: 1, duration: 70, useNativeDriver: false }),
      ]).start();
      t = setTimeout(doBlink, 2500 + Math.random() * 3500);
    };
    t = setTimeout(doBlink, 1500);
    return () => clearTimeout(t);
  }, [blink]);

  return (
    <View ref={box} onLayout={measure} pointerEvents="none" style={{ width: size, height: (size * VB_H) / VB_W }}>
      <View style={{ width: VB_W, height: VB_H, transform: [{ scale }], transformOrigin: "0px 0px" }}>
        <View style={styles.body} />
        <View style={styles.face} />
        <View style={[styles.blush, { left: 48 }]} />
        <View style={[styles.blush, { left: 98 }]} />
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: gaze.x }, { translateY: gaze.y }] }]}>
          <Animated.View style={[styles.eye, { left: 60.5, transform: [{ scaleY: blink }] }]} />
          <Animated.View style={[styles.eye, { left: 88.5, transform: [{ scaleY: blink }] }]} />
        </Animated.View>
        <View style={styles.mouth} />
      </View>
    </View>
  );
});

const INK = "#2B2622";
const styles = StyleSheet.create({
  // path "M38 186 V100 a62 62 0 0 1 124 0 ...": a dome 124 wide whose top sits at y=38, clipped by the viewBox at y=158
  body: { position: "absolute", left: 18, top: 10, width: 124, height: 120, borderTopLeftRadius: 62, borderTopRightRadius: 62, backgroundColor: "#EADFCC" },
  // rect x62 y64 w76 h62 rx30
  face: { position: "absolute", left: 42, top: 36, width: 76, height: 62, borderRadius: 30, backgroundColor: "#F7EEDD" },
  // ellipses at cy106, rx7 ry4
  blush: { position: "absolute", top: 74, width: 14, height: 8, borderRadius: 7, backgroundColor: "#F2B8AC", opacity: 0.55 },
  // circles r5.5 at cy93
  eye: { position: "absolute", top: 59.5, width: 11, height: 11, borderRadius: 5.5, backgroundColor: INK },
  // path "M96 106 q4 3.5 8 0": a small smile
  mouth: { position: "absolute", left: 76, top: 78, width: 8, height: 2.6, borderBottomWidth: 1.8, borderBottomLeftRadius: 4, borderBottomRightRadius: 4, borderColor: INK },
});
