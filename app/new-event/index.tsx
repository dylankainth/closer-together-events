import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
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
    <Animated.Text
      style={[styles.placeholderText, { opacity, transform: [{ translateY }] }]}
      numberOfLines={1}
      pointerEvents="none"
    >
      {EXAMPLES[index]}
    </Animated.Text>
  );
}

// Clone of the team's "what are we making happen" reference mockup (Screenshot 2026-11-12
// 150239.png), with the header's placeholder brand name swapped for "Muse Events".
export default function WhatAreWeMakingHappen() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const extractDraft = useAction(api.extractAction.extractDraft);

  const onGo = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const draft = await extractDraft({ raw: text.trim() });
      router.push({ pathname: "/new-event/questions", params: { ...draft } });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.prompt}>What are we making happen?</Text>

      <View style={styles.inputRow}>
        <View style={styles.inputStack}>
          <AnimatedPlaceholder visible={!text} />
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            onSubmitEditing={onGo}
            returnKeyType="go"
            autoFocus
          />
        </View>
        <Pressable style={[styles.go, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim() || loading} onPress={onGo}>
          {loading ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="arrow-forward" size={20} color="white" />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: spacing.lg, paddingTop: spacing.xxl },

  prompt: { fontSize: 42, fontWeight: "800", color: colors.text, lineHeight: 48, marginTop: spacing.xxl * 4 },

  inputRow: {
    flexDirection: "row", alignItems: "center", marginTop: spacing.lg, backgroundColor: "white",
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.text, paddingLeft: spacing.lg,
    paddingRight: 6, paddingVertical: 6,
  },
  inputStack: { flex: 1 },
  input: { fontSize: 15, color: colors.text, paddingVertical: spacing.sm },
  placeholderText: { position: "absolute", top: 0, left: 0, right: 0, fontSize: 15, color: colors.textMuted, paddingVertical: spacing.sm },
  go: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});
