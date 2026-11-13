import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/tokens";

export default function WatchPlaceholder() {
  return (
    <View style={styles.screen}>
      <Text style={styles.text}>Facebook Watch (not part of this demo)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 },
  text: { color: colors.textMuted, textAlign: "center" },
});
