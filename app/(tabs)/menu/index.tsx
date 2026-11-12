import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { Avatar } from "@/components/ui";
import { colors, radius, spacing } from "@/theme/tokens";

// Clone of the real Facebook app's Menu screen (reference: d73aec4f-34d7-459d-8e39-e3478dc7e06c.jpg).
// This is the app's landing screen; tapping "Events" is the only functional row, opening
// Muse Events' own Events home (everything else here is chrome, matching the real app's layout).
export default function Menu() {
  const { viewerId } = useViewer();
  const personas = useQuery(api.personas.listAll, {});
  const me = personas?.find((p) => p.id === viewerId);
  const [upgradesOpen, setUpgradesOpen] = useState(true);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Menu</Text>
        <View style={styles.headerIcons}>
          <Ionicons name="search" size={24} color={colors.text} />
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </View>
      </View>

      <View style={styles.profileCard}>
        <Pressable style={styles.profileRow} onPress={() => router.push("/settings")}>
          {me ? (
            <Avatar initials={me.initials} color={me.color} size={56} />
          ) : (
            <Ionicons name="person-circle-outline" size={56} color={colors.textMuted} />
          )}
          <Text style={styles.profileName}>{me?.name ?? "Guest"}</Text>
          <View style={styles.chevronBadge}>
            <Ionicons name="chevron-down" size={18} color={colors.text} />
            <View style={styles.notifDot}><Text style={styles.notifDotText}>1</Text></View>
          </View>
        </Pressable>
        <View style={styles.cardDivider} />
        <Pressable style={styles.profileRow}>
          <View style={styles.createPageIcon}>
            <Ionicons name="add" size={20} color="white" />
          </View>
          <Text style={styles.createPageText}>Create Facebook Page</Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        <MenuRow icon="ribbon-outline" label="Events" onPress={() => router.push("/events")} />
        <MenuRow icon="storefront-outline" label="Marketplace" />
        <MenuRow icon="sparkles-outline" label="Meta AI" />
        <MenuRow icon="heart-outline" label="Dating" />
        <MenuRow icon="person-circle-outline" label="Groups" />
      </View>

      <Pressable style={styles.seeMore}><Text style={styles.seeMoreText}>See more</Text></Pressable>

      <View style={styles.divider} />

      <CollapsibleRow icon="help-circle-outline" label="Help and support" />
      <CollapsibleRow icon="settings-outline" label="Settings and privacy" />
      <CollapsibleRow
        icon="diamond-outline"
        label="Upgrades"
        open={upgradesOpen}
        onToggle={() => setUpgradesOpen((v) => !v)}
      />

      {upgradesOpen && (
        <View style={styles.promoRow}>
          <View style={[styles.promoCard, { backgroundColor: "#3B2A6B" }]}>
            <View style={styles.promoBadge}><Ionicons name="rocket-outline" size={14} color="white" /></View>
          </View>
          <View style={[styles.promoCard, { backgroundColor: "#CFE8FB" }]}>
            <View style={styles.promoBadgeTopLeft}><Ionicons name="refresh" size={12} color={colors.text} /><Text style={styles.promoBadgeText}>23</Text></View>
            <View style={styles.promoBadgeBottomRight}><Ionicons name="time-outline" size={12} color={colors.text} /><Text style={styles.promoBadgeText}>48h</Text></View>
            <View style={styles.promoBadge}><Ionicons name="diamond" size={14} color={colors.museAccent} /></View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function MenuRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuRowIcon}><Ionicons name={icon} size={22} color={colors.text} /></View>
      <Text style={styles.menuRowLabel}>{label}</Text>
    </Pressable>
  );
}

function CollapsibleRow({
  icon, label, open, onToggle,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; open?: boolean; onToggle?: () => void }) {
  return (
    <Pressable style={styles.collapsibleRow} onPress={onToggle}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={styles.collapsibleLabel}>{label}</Text>
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "white" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md },
  headerTitle: { fontSize: 30, fontWeight: "800", color: colors.text },
  headerIcons: { flexDirection: "row", gap: spacing.lg },

  profileCard: { marginHorizontal: spacing.lg, backgroundColor: colors.background, borderRadius: radius.lg, overflow: "hidden" },
  profileRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.md + 4, gap: spacing.md },
  profileName: { flex: 1, fontSize: 19, fontWeight: "700", color: colors.text },
  chevronBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  notifDot: { position: "absolute", top: -2, right: -2, backgroundColor: colors.danger, borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  notifDotText: { color: "white", fontSize: 11, fontWeight: "700" },
  cardDivider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.md + 56 + spacing.md },
  createPageIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.textMuted, alignItems: "center", justifyContent: "center" },
  createPageText: { color: colors.textMuted, fontSize: 16 },

  list: { marginTop: spacing.lg },
  menuRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, gap: spacing.md },
  menuRowIcon: { width: 28, alignItems: "center" },
  menuRowLabel: { fontSize: 17, color: colors.text },

  seeMore: { marginHorizontal: spacing.lg, marginTop: spacing.sm, backgroundColor: colors.background, borderRadius: radius.pill, paddingVertical: spacing.sm, alignItems: "center" },
  seeMoreText: { color: colors.text, fontWeight: "600" },

  divider: { height: 1, backgroundColor: colors.border, marginTop: spacing.lg },

  collapsibleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  collapsibleLabel: { flex: 1, fontSize: 17, fontWeight: "700", color: colors.text },

  promoRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  promoCard: { flex: 1, height: 140, borderRadius: radius.lg, overflow: "hidden" },
  promoBadge: { position: "absolute", bottom: spacing.sm, left: spacing.sm, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  promoBadgeTopLeft: { position: "absolute", top: spacing.sm, left: spacing.sm, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  promoBadgeBottomRight: { position: "absolute", bottom: spacing.sm, right: spacing.sm, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  promoBadgeText: { fontSize: 11, fontWeight: "700", color: colors.text },
});
