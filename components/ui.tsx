import React from "react";
import { StyleSheet, Switch as RNSwitch, Text, View } from "react-native";
import { colors, radius, spacing } from "@/theme/tokens";

export function Avatar({ initials, color, size = 40 }: { initials: string; color: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={{ color: "white", fontWeight: "700", fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export function AvatarStack({ people, max = 5 }: { people: { initials: string; color: string }[]; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View style={{ flexDirection: "row" }}>
      {shown.map((p, i) => (
        <View key={i} style={{ marginLeft: i === 0 ? 0 : -10 }}>
          <Avatar initials={p.initials} color={p.color} size={28} />
        </View>
      ))}
      {extra > 0 && (
        <View style={[styles.avatar, { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.border, marginLeft: -10 }]}>
          <Text style={{ fontSize: 11, color: colors.text, fontWeight: "700" }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

export function MuseBadge({ live }: { live: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: live ? colors.museTint : "#FDE9D9" }]}>
      <Text style={{ color: live ? colors.museAccentDark : colors.warning, fontSize: 12, fontWeight: "700" }}>
        {live ? "Muse live" : "Muse offline demo"}
      </Text>
    </View>
  );
}

const TONES: Record<string, [string, string]> = {
  gray: [colors.border, colors.textMuted],
  green: ["#DCFCE7", colors.success],
  amber: ["#FEF3C7", colors.warning],
  red: ["#FDE2E2", colors.danger],
  purple: [colors.museTint, colors.museAccentDark],
};

export function Pill({ label, tone = "gray" }: { label: string; tone?: keyof typeof TONES }) {
  const [bg, fg] = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function Switch({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.border, true: colors.museAccent }}
      thumbColor="white"
    />
  );
}

export function Skeleton({ width = "100%", height = 16 }: { width?: number | string; height?: number }) {
  return <View style={{ width: width as any, height, borderRadius: radius.sm, backgroundColor: colors.border }} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StickyActionBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.stickyBar}>{children}</View>;
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
  },
});
