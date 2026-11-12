import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { colors, radius, spacing } from "@/theme/tokens";

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
      <TextInput
        style={styles.input}
        placeholder="e.g. Maya's birthday, boxing crew, Friday night"
        placeholderTextColor={colors.textMuted}
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
      />
      <Pressable style={[styles.go, !text.trim() && { opacity: 0.5 }]} disabled={!text.trim() || loading} onPress={onGo}>
        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.goText}>Go</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, paddingTop: spacing.xxl },
  prompt: { fontSize: 24, fontWeight: "700", color: colors.text, marginBottom: spacing.lg },
  input: {
    minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md,
    fontSize: 16, backgroundColor: colors.card, color: colors.text, textAlignVertical: "top",
  },
  go: { marginTop: spacing.lg, backgroundColor: colors.museAccent, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  goText: { color: "white", fontWeight: "700", fontSize: 16 },
});
