import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { ViewerSwitcher } from "@/components/ViewerSwitcher";
import { Avatar, AvatarStack, Skeleton } from "@/components/ui";
import type { EventView } from "@/components/events/SwipeCard";
import { priceLabel, swipe } from "@/theme/swipeTheme";

const SECTIONS: { key: EventView["relation"][]; title: string; empty: string }[] = [
  { key: ["hosting"], title: "You're hosting", empty: "" },
  { key: ["responded"], title: "You've answered", empty: "" },
  { key: ["invited"], title: "Still waiting on you", empty: "" },
  { key: ["discover"], title: "More happening", empty: "Nothing else yet." },
];

const STATUS_LABEL: Record<string, string> = { going: "You're going", maybe: "Maybe", skip: "Passed", cant: "Can't make it" };

/** General feed: everything visible to the viewer that isn't in the recommended swipe stack. */
export default function Feed() {
  const { viewerId } = useViewer();
  const data = useQuery(api.feed.forViewer, { personaId: viewerId });
  const me = useQuery(api.personas.getByPersonaId, { personaId: viewerId });
  const waiting = data?.recommended.length ?? 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-down" size={26} color={swipe.ink} />
          </Pressable>
          <Text style={styles.heading}>Hi {me?.name.split(" ")[0] ?? "there"}</Text>
          <ViewerSwitcher />
        </View>

        {waiting > 0 && (
          <Pressable style={styles.banner} onPress={() => router.push("/events/recommended")}>
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Text style={styles.bannerText}>{waiting} pick{waiting === 1 ? "" : "s"} for you, by your agent</Text>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </Pressable>
        )}

        {data === undefined ? (
          <View style={{ gap: 12, marginTop: 20 }}>
            <Skeleton height={180} />
            <Skeleton height={180} />
          </View>
        ) : (
          SECTIONS.map((s) => {
            const items = data.feed.filter((e) => s.key.includes(e.relation));
            if (items.length === 0) return s.empty && s.key.includes("discover") && data.feed.length === 0 ? <Text key={s.title} style={styles.empty}>{s.empty}</Text> : null;
            return (
              <View key={s.title}>
                <Text style={styles.section}>{s.title}</Text>
                {items.map((e) => <FeedCard key={e.eventId} ev={e} />)}
              </View>
            );
          })
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push("/new-event")}>
        <Ionicons name="add" size={22} color="#fff" />
        <Text style={styles.fabText}>Make an event</Text>
      </Pressable>
    </View>
  );
}

function FeedCard({ ev }: { ev: EventView }) {
  const meta = [ev.slotLabel, ev.venue?.area, priceLabel(ev.priceTier)].filter(Boolean).join(" · ");
  const status = ev.relation === "responded" && ev.myStatus ? STATUS_LABEL[ev.myStatus] : ev.relation === "hosting" ? "Hosting" : null;
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/events/${ev.eventId}`)}>
      <View style={styles.cardBanner}>
        {ev.poster ? <Image source={{ uri: ev.poster.url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Ionicons name="image-outline" size={30} color="rgba(255,255,255,0.45)" />}
        {status && <View style={styles.status}><Text style={styles.statusText}>{status}</Text></View>}
      </View>
      <View style={{ padding: 14 }}>
        <Text style={styles.meta}>{meta}</Text>
        <Text style={styles.cardTitle}>{ev.title}</Text>
        <View style={styles.cardFoot}>
          {ev.friendsGoing.length > 0 ? <AvatarStack people={ev.friendsGoing} max={3} /> : ev.host ? <Avatar initials={ev.host.initials} color={ev.host.color} size={28} /> : null}
          <Text style={styles.footText} numberOfLines={1}>
            {ev.friendsGoing.length > 0 ? `${ev.friendsGoing[0].name.split(" ")[0]}${ev.friendsGoing.length > 1 ? ` +${ev.friendsGoing.length - 1}` : ""} going` : `Hosted by ${ev.host?.name ?? "someone"}`}
            {ev.spotsLeft !== null ? ` · ${ev.spotsLeft} left` : ""}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: swipe.cream },
  content: { padding: 16, paddingTop: 52, paddingBottom: 120 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  heading: { flex: 1, fontSize: 26, fontWeight: "800", color: swipe.ink },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: swipe.blue, borderRadius: 16, padding: 14, marginTop: 16 },
  bannerText: { flex: 1, color: "#fff", fontWeight: "700", fontSize: 15 },
  section: { fontSize: 12, fontWeight: "800", letterSpacing: 1, color: "#6B6B76", marginTop: 24, marginBottom: 10, textTransform: "uppercase" },
  empty: { color: "#6B6B76", marginTop: 24 },
  card: { backgroundColor: "#fff", borderRadius: 22, overflow: "hidden", marginBottom: 14, borderWidth: 1, borderColor: "#ECE8E0" },
  cardBanner: { aspectRatio: 2.1, backgroundColor: swipe.blueDeep, alignItems: "center", justifyContent: "center" },
  status: { position: "absolute", top: 10, left: 10, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontWeight: "800", fontSize: 12, color: swipe.ink },
  meta: { color: "#6B6B76", fontSize: 13 },
  cardTitle: { color: swipe.ink, fontWeight: "800", fontSize: 19, marginTop: 3 },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  footText: { flex: 1, color: "#6B6B76", fontSize: 13 },
  fab: { position: "absolute", right: 16, bottom: 24, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: swipe.ink, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 14 },
  fabText: { color: "#fff", fontWeight: "800" },
});
