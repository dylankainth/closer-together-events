import React, { useMemo, useState } from "react";
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { ViewerSwitcher } from "@/components/ViewerSwitcher";
import { Avatar } from "@/components/ui";
import type { EventView } from "@/components/events/SwipeCard";
import { discover } from "@/theme/swipeTheme";

type Tab = "discover" | "going" | "hosting";
type IconName = React.ComponentProps<typeof Ionicons>["name"];

const CATEGORY_ICONS: Record<string, IconName> = {
  bowling: "radio-button-on-outline",
  games: "game-controller-outline",
  gaming: "game-controller-outline",
  climbing: "trending-up-outline",
  fitness: "barbell-outline",
  boxing: "fitness-outline",
  design: "color-palette-outline",
  music: "musical-notes-outline",
  outdoors: "leaf-outline",
  food: "restaurant-outline",
  birthday: "gift-outline",
  housewarming: "home-outline",
};

const ROWS_PER_PAGE = 3;
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Categories an event belongs to: its venue's tags plus its purpose (unless it's the generic "Other"). */
function categoriesOf(ev: EventView): string[] {
  const out = new Set<string>((ev.tags ?? []).map((t) => t.toLowerCase()));
  if (ev.purpose && ev.purpose !== "Other") out.add(ev.purpose.toLowerCase());
  return [...out];
}

/** Right-hand badge on a row, in place of the reference's LIVE marker: where *you* stand with it. */
function badgeOf(ev: EventView): string | null {
  if (ev.relation === "hosting") return "HOSTING";
  if (ev.myStatus === "going") return "GOING";
  if (ev.myStatus === "maybe") return "MAYBE";
  if (ev.myStatus === "cant") return "CAN'T GO";
  if (ev.relation === "invited") return "INVITED";
  return null;
}

/**
 * Discover feed, shown when you swipe up from the recommended stack.
 * Sections follow the reference: Popular events (pages of rows), Browse by category, and hosts.
 */
export default function Feed() {
  const { viewerId } = useViewer();
  const { width } = useWindowDimensions();
  const data = useQuery(api.feed.forViewer, { personaId: viewerId });
  const [tab, setTab] = useState<Tab>("discover");
  const [category, setCategory] = useState<string | null>(null);
  const [viewAll, setViewAll] = useState(false);

  const picks = data?.recommended.length ?? 0;
  const all = useMemo(() => [...(data?.recommended ?? []), ...(data?.feed ?? [])], [data]);

  const popular = useMemo(() => {
    const pool = category ? all.filter((e) => categoriesOf(e).includes(category)) : all;
    return [...pool].sort((a, b) => b.goingCount + b.friendsGoing.length * 2 - (a.goingCount + a.friendsGoing.length * 2));
  }, [all, category]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    all.forEach((e) => categoriesOf(e).forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const hosts = useMemo(() => {
    const byHost = new Map<string, { host: NonNullable<EventView["host"]>; job: string | null; area: string | null; count: number }>();
    all.forEach((e) => {
      if (!e.host) return;
      const cur = byHost.get(e.host.id);
      if (cur) cur.count += 1;
      else byHost.set(e.host.id, { host: e.host, job: e.hostJob ?? null, area: e.venue?.area ?? null, count: 1 });
    });
    return [...byHost.values()].sort((a, b) => b.count - a.count);
  }, [all]);

  const pages = useMemo(() => {
    const out: EventView[][] = [];
    for (let i = 0; i < popular.length; i += ROWS_PER_PAGE) out.push(popular.slice(i, i + ROWS_PER_PAGE));
    return out;
  }, [popular]);

  const pageW = Math.min(width - 56, 460);
  const open = (ev: EventView) => router.push(`/events/${ev.eventId}`);
  const backToPicks = () => (router.canGoBack() ? router.back() : router.replace("/events/recommended"));

  const tabEvents = tab === "going" ? all.filter((e) => e.myStatus === "going") : tab === "hosting" ? all.filter((e) => e.relation === "hosting") : [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={backToPicks} hitSlop={8} accessibilityLabel="Your picks" style={styles.navIcon}>
          <Ionicons name="sparkles" size={24} color={discover.muted} />
          {picks > 0 && <View style={styles.dot} />}
        </Pressable>
        <Pressable onPress={() => setTab("going")} hitSlop={8} accessibilityLabel="Going" style={styles.navIcon}>
          <Ionicons name="ticket-outline" size={24} color={tab === "going" ? discover.text : discover.muted} />
        </Pressable>
        <Pressable onPress={() => setTab("hosting")} hitSlop={8} accessibilityLabel="Hosting" style={styles.navIcon}>
          <Ionicons name="calendar-outline" size={24} color={tab === "hosting" ? discover.text : discover.muted} />
        </Pressable>
        <Pressable onPress={() => setTab("discover")} hitSlop={8} accessibilityLabel="Discover" style={styles.navIcon}>
          <Ionicons name={tab === "discover" ? "compass" : "compass-outline"} size={24} color={tab === "discover" ? discover.text : discover.muted} />
        </Pressable>
        <Pressable style={styles.create} onPress={() => router.push("/new-event")}>
          <Text style={styles.createText}>Create Event</Text>
        </Pressable>
        <ViewerSwitcher />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        {data === undefined ? (
          <View style={{ padding: 20, gap: 16 }}>
            {[0, 1, 2].map((i) => <View key={i} style={styles.skeleton} />)}
          </View>
        ) : tab !== "discover" ? (
          <View style={styles.section}>
            <Text style={styles.h1}>{tab === "going" ? "You're going" : "You're hosting"}</Text>
            {tabEvents.length === 0 ? (
              <Text style={styles.empty}>{tab === "going" ? "No plans yet. Say yes to something from your picks." : "You haven't hosted anything yet."}</Text>
            ) : (
              tabEvents.map((e) => <Row key={e.eventId} ev={e} onPress={() => open(e)} />)
            )}
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.h1}>Popular Events</Text>
                  <Text style={styles.h1Sub}>{category ? `${titleCase(category)}` : "From your circle"}</Text>
                </View>
                {category ? (
                  <Pressable style={styles.viewAll} onPress={() => setCategory(null)}>
                    <Text style={styles.viewAllText}>Clear</Text>
                    <Ionicons name="close" size={16} color={discover.text} />
                  </Pressable>
                ) : popular.length > ROWS_PER_PAGE ? (
                  <Pressable style={styles.viewAll} onPress={() => setViewAll((v) => !v)}>
                    <Text style={styles.viewAllText}>{viewAll ? "Show less" : "View All"}</Text>
                    <Ionicons name={viewAll ? "chevron-up" : "arrow-forward"} size={16} color={discover.text} />
                  </Pressable>
                ) : null}
              </View>

              {popular.length === 0 ? (
                <Text style={styles.empty}>Nothing here yet.</Text>
              ) : viewAll ? (
                <View style={{ paddingHorizontal: 20 }}>
                  {popular.map((e) => <Row key={e.eventId} ev={e} onPress={() => open(e)} />)}
                </View>
              ) : (
                <FlatList
                  horizontal
                  data={pages}
                  keyExtractor={(_, i) => `page-${i}`}
                  showsHorizontalScrollIndicator={false}
                  snapToInterval={pageW + 14}
                  decelerationRate="fast"
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
                  renderItem={({ item }) => (
                    <View style={{ width: pageW }}>
                      {item.map((e) => <Row key={e.eventId} ev={e} onPress={() => open(e)} />)}
                    </View>
                  )}
                />
              )}
            </View>

            {categories.length > 0 && (
              <View style={[styles.section, styles.divided]}>
                <Text style={[styles.h2, { paddingHorizontal: 20 }]}>Browse by Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                  <View style={{ gap: 10 }}>
                    {[0, 1].map((r) => (
                      <View key={r} style={{ flexDirection: "row", gap: 10 }}>
                        {categories.filter((_, i) => i % 2 === r).map(([name, count]) => {
                          const idx = categories.findIndex(([n]) => n === name);
                          const color = discover.categoryColors[idx % discover.categoryColors.length];
                          const active = category === name;
                          return (
                            <Pressable key={name} style={[styles.chip, active && { borderColor: color }]} onPress={() => { setCategory(active ? null : name); setViewAll(false); }}>
                              <Ionicons name={CATEGORY_ICONS[name] ?? "pricetag-outline"} size={26} color={color} />
                              <View>
                                <Text style={styles.chipName}>{titleCase(name)}</Text>
                                <Text style={styles.chipCount}>{count} Event{count === 1 ? "" : "s"}</Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {hosts.length > 0 && (
              <View style={[styles.section, styles.divided]}>
                <Text style={[styles.h2, { paddingHorizontal: 20 }]}>Hosts in your circle</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
                  {hosts.map(({ host, job, area, count }) => (
                    <View key={host.id} style={styles.hostCard}>
                      <Avatar initials={host.initials} color={host.color} size={48} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.hostName} numberOfLines={1}>{host.name}</Text>
                        <Text style={styles.hostMeta} numberOfLines={1}>
                          {area ? `${area} · ` : ""}{count} event{count === 1 ? "" : "s"}
                        </Text>
                        {job ? <Text style={styles.hostMeta} numberOfLines={1}>{job}</Text> : null}
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ ev, onPress }: { ev: EventView; onPress: () => void }) {
  const badge = badgeOf(ev);
  const sub = ev.venue?.name ?? (ev.host ? `Hosted by ${ev.host.name}` : "");
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.thumb}>
        {ev.poster ? (
          <Image source={{ uri: ev.poster.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Text style={styles.thumbText}>{ev.title.trim().slice(0, 1).toUpperCase()}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={styles.time} numberOfLines={1}>{ev.slotLabel ?? "Date to be confirmed"}</Text>
          {badge && <Text style={styles.badge}>{badge}</Text>}
        </View>
        <Text style={styles.title} numberOfLines={2}>{ev.title}</Text>
        {sub ? <Text style={styles.sub} numberOfLines={1}>{sub}</Text> : null}
        {ev.friendsGoing.length > 0 && (
          <Text style={styles.friends} numberOfLines={1}>
            {ev.friendsGoing[0].name.split(" ")[0]}{ev.friendsGoing.length > 1 ? ` +${ev.friendsGoing.length - 1}` : ""} going
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: discover.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14, backgroundColor: discover.headerTint, borderBottomWidth: 1, borderBottomColor: discover.line },
  navIcon: { padding: 2 },
  dot: { position: "absolute", top: 0, right: 0, width: 9, height: 9, borderRadius: 5, backgroundColor: "#EF4444" },
  create: { marginLeft: "auto" },
  createText: { color: discover.text, fontWeight: "700", fontSize: 16 },
  section: { paddingTop: 22 },
  divided: { marginTop: 26, borderTopWidth: 1, borderTopColor: discover.line },
  sectionHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 16 },
  h1: { color: discover.text, fontSize: 26, fontWeight: "800", paddingHorizontal: 0 },
  h1Sub: { color: discover.muted, fontSize: 24, fontWeight: "600", marginTop: 2 },
  h2: { color: discover.text, fontSize: 22, fontWeight: "800", marginBottom: 14 },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: discover.pill, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  viewAllText: { color: discover.text, fontWeight: "700", fontSize: 15 },
  empty: { color: discover.muted, paddingHorizontal: 20, fontSize: 15 },
  skeleton: { height: 96, borderRadius: 14, backgroundColor: discover.card },
  row: { flexDirection: "row", gap: 16, alignItems: "flex-start", paddingVertical: 12 },
  thumb: { width: 96, height: 96, borderRadius: 14, overflow: "hidden", backgroundColor: discover.card, alignItems: "center", justifyContent: "center" },
  thumbText: { color: discover.muted, fontSize: 34, fontWeight: "800" },
  time: { color: discover.muted, fontSize: 15, flexShrink: 1 },
  badge: { color: discover.badge, fontWeight: "800", fontSize: 13, marginLeft: "auto" },
  title: { color: discover.text, fontSize: 18, fontWeight: "700", lineHeight: 23, marginTop: 4 },
  sub: { color: discover.muted, fontSize: 15, marginTop: 4 },
  friends: { color: discover.muted, fontSize: 13, marginTop: 3 },
  chip: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: discover.card, borderRadius: 14, borderWidth: 1, borderColor: discover.line, paddingHorizontal: 16, paddingVertical: 14, minWidth: 150 },
  chipName: { color: discover.text, fontSize: 17, fontWeight: "700" },
  chipCount: { color: discover.muted, fontSize: 14, marginTop: 2 },
  hostCard: { flexDirection: "row", alignItems: "center", gap: 14, width: 250, paddingVertical: 4 },
  hostName: { color: discover.text, fontSize: 17, fontWeight: "700" },
  hostMeta: { color: discover.muted, fontSize: 14, marginTop: 2 },
});
