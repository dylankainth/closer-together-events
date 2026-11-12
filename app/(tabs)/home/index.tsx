import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/tokens";

// Chrome-only placeholder: real Facebook Home isn't part of this product (Muse Events replaces
// the Events entry point inside Facebook, reached via the Menu screen's "Events" row).
export default function HomePlaceholder() {
  return (
    <View style={styles.screen}>
      <Text style={styles.text}>Facebook Home (not part of this demo)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", padding: 24 },
  text: { color: colors.textMuted, textAlign: "center" },
});
