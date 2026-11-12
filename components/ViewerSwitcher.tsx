import React, { useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { Avatar } from "./ui";
import { colors, radius, spacing } from "@/theme/tokens";

export function ViewerSwitcher() {
  const { viewerId, setViewerId } = useViewer();
  const personas = useQuery(api.personas.listAll, {});
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const me = personas?.find((p) => p.id === viewerId);
  const filtered = (personas ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.trigger}>
        {me ? <Avatar initials={me.initials} color={me.color} size={32} /> : <View style={{ width: 32, height: 32 }} />}
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Switch demo user</Text>
          <TextInput placeholder="Search" value={search} onChangeText={setSearch} style={styles.search} />
          <FlatList
            data={filtered}
            keyExtractor={(p) => p.id}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => { setViewerId(item.id); setOpen(false); }}>
                <Avatar initials={item.initials} color={item.color} size={36} />
                <View style={{ marginLeft: spacing.md }}>
                  <Text style={{ fontWeight: "600", color: colors.text }}>{item.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.job}</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { marginLeft: "auto" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: "70%" },
  title: { fontWeight: "700", fontSize: 16, marginBottom: spacing.md, color: colors.text },
  search: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm },
});
