import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, View } from "react-native";

const { width: W, height: H } = Dimensions.get("window");
const COLORS = ["#3447E4", "#FFC83D", "#FF5C8A", "#2BD9A0", "#8E9BFF", "#FF8A3D"];

/**
 * A burst of confetti plus a colour wash over the whole screen. Mount it to play it once; `onDone` fires at the end.
 * Pure Animated (native driver), no extra dependency.
 */
export function Confetti({ onDone, wash = "#2BD9A0" }: { onDone?: () => void; wash?: string }) {
  const t = useRef(new Animated.Value(0)).current;
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }).map((_, i) => ({
        color: COLORS[i % COLORS.length],
        dx: (Math.random() - 0.5) * W * 1.1,
        up: H * (0.18 + Math.random() * 0.22),
        fall: H * (0.55 + Math.random() * 0.3),
        spin: (Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540),
        size: 8 + Math.random() * 8,
        round: Math.random() < 0.3,
      })),
    [],
  );

  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true }).start(() => onDone?.());
  }, [t, onDone]);

  const washOpacity = t.interpolate({ inputRange: [0, 0.12, 0.5, 1], outputRange: [0, 0.55, 0.3, 0] });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: wash, opacity: washOpacity }]} />
      {pieces.map((p, i) => {
        const x = t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
        const y = t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, -p.up, p.fall] });
        const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.spin}deg`] });
        const opacity = t.interpolate({ inputRange: [0, 0.05, 0.8, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: W / 2 - p.size / 2,
              top: H * 0.62,
              width: p.size,
              height: p.round ? p.size : p.size * 1.6,
              borderRadius: p.round ? p.size / 2 : 2,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateX: x }, { translateY: y }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
