import React from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { ViewerSwitcher } from "@/components/ViewerSwitcher";
import { EventCard } from "@/components/EventCard";
import { MuseBadge, Skeleton } from "@/components/ui";
import { colors, spacing } from "@/theme/tokens";

function toCard(e: any, personas: any[]) {
  const host = personas.find((p) => p.id === e.hostId);
  return {
    eventId: e.eventId,
    title: e.title,
    poster: e.poster,
    hostName: host?.name ?? e.hostId,
    slotLabel: e.slotId,
    venueArea: undefined,
    goingPeople: [],
    goingCount: 0,
  };
}

export default function EventsHome() {
  const { viewerId } = useViewer();
  const personas = useQuery(api.personas.listAll, {});
  const me = personas?.find((p) => p.id === viewerId);
  const invited = useQuery(api.events.listInvitedFor, { personaId: viewerId });
  const yours = useQuery(api.events.listForHost, { hostId: viewerId });
  const discover = useQuery(api.events.listDiscoverable, { excludePersonaId: viewerId });

  const loading = !personas || invited === undefined || yours === undefined || discover === undefined;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hi {me?.name.split(" ")[0] ?? "there"}</Text>
        <MuseBadge live={false} />
        <ViewerSwitcher />
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={140} />
          <Skeleton height={140} />
        </View>
      ) : (
        <>
          <Section title="Your current invited events" data={[...(yours ?? []), ...(invited ?? [])]} personas={personas!} empty="No invites yet." />
          <Section title="Other events" data={discover ?? []} personas={personas!} empty="Nothing else nearby yet." />
        </>
      )}

      <Pressable style={styles.fab} onPress={() => router.push("/new-event")}>
        <Text style={styles.fabText}>+</Text>
        <Text style={styles.fabLabel}>Make an event</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title, data, personas, empty }: { title: string; data: any[]; personas: any[]; empty: string }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {data.length === 0 ? (
        <Text style={styles.emptyText}>{empty}</Text>
      ) : (
        <FlatList
          horizontal
          data={data}
          keyExtractor={(e) => e.eventId}
          contentContainerStyle={{ paddingHorizontal: spacing.lg }}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => <EventCard event={toCard(item, personas)} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.xxl },
  greeting: { fontSize: 22, fontWeight: "700", color: colors.text },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginLeft: spacing.lg, marginBottom: spacing.sm },
  emptyText: { color: colors.textMuted, marginLeft: spacing.lg },
  fab: {
    position: "absolute", right: spacing.lg, bottom: spacing.xl, backgroundColor: colors.museAccent,
    borderRadius: 28, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row",
    alignItems: "center", gap: spacing.sm, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  fabText: { color: "white", fontSize: 20, fontWeight: "700" },
  fabLabel: { color: "white", fontWeight: "600" },
});
