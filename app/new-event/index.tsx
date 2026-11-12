import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, radius, spacing } from "@/theme/tokens";

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
      <View style={styles.header}>
        <Text style={styles.brand}>Muse Events</Text>
        <View style={styles.poweredBy}>
          <Text style={styles.poweredByText}>Powered by Muse</Text>
        </View>
      </View>

      <Text style={styles.prompt}>What are we making happen?</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Founder dinner, ~20 people, Shoreditch"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          onSubmitEditing={onGo}
          returnKeyType="go"
          autoFocus
        />
        <Pressable style={[styles.go, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim() || loading} onPress={onGo}>
          {loading ? <ActivityIndicator color="white" size="small" /> : <Ionicons name="arrow-forward" size={20} color="white" />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: spacing.lg, paddingTop: spacing.xxl },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { fontSize: 17, fontWeight: "700", color: colors.text },
  poweredBy: { backgroundColor: colors.museTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  poweredByText: { color: colors.museAccentDark, fontSize: 13, fontWeight: "600" },

  prompt: { fontSize: 32, fontWeight: "800", color: colors.text, lineHeight: 38, marginTop: spacing.xxl * 3 },

  inputRow: {
    flexDirection: "row", alignItems: "center", marginTop: spacing.lg, backgroundColor: "white",
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.text, paddingLeft: spacing.lg,
    paddingRight: 6, paddingVertical: 6,
  },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: spacing.sm },
  go: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});
