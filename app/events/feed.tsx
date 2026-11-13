import React, { useMemo, useRef, useState } from "react";
import { Animated, FlatList, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { EventsNavBar } from "@/components/events/EventsNavBar";
import type { EventView } from "@/components/events/SwipeCard";
import { discover } from "@/theme/swipeTheme";

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

/**
 * Discover feed, shown when you swipe up from the recommended stack.
 * Sections follow the reference: Popular events (pages of rows) and Browse by category.
 */
export default function Feed() {
  const { viewerId } = useViewer();
  const { width, height } = useWindowDimensions();
  const data = useQuery(api.feed.forViewer, { personaId: viewerId });
  const [category, setCategory] = useState<string | null>(null);
  const [viewAll, setViewAll] = useState(false);

  const picks = data?.recommended.length ?? 0;
  const all = useMemo(() => [...(data?.recommended ?? []), ...(data?.feed ?? [])], [data]);

  const hosting = useMemo(() => all.filter((e) => e.relation === "hosting"), [all]);

  const popular = useMemo(() => {
    // Events you host have their own section above, so they don't repeat here.
    const others = all.filter((e) => e.relation !== "hosting");
    const pool = category ? others.filter((e) => categoriesOf(e).includes(category)) : others;
    return [...pool].sort((a, b) => b.goingCount + b.friendsGoing.length * 2 - (a.goingCount + a.friendsGoing.length * 2));
  }, [all, category]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    all.forEach((e) => categoriesOf(e).forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const pages = useMemo(() => {
    const out: EventView[][] = [];
    for (let i = 0; i < popular.length; i += ROWS_PER_PAGE) out.push(popular.slice(i, i + ROWS_PER_PAGE));
    return out;
  }, [popular]);

  const pageW = Math.min(width - 56, 460);
  const open = (ev: EventView) => {
    if (ev.relation === "pick") return; // pick event page arrives with app/picks/[key].tsx
    router.push(`/events/${ev.eventId}`);
  };

  // Pull the feed down while it's scrolled to the top to go back to the recommended-events stack (the
  // reverse of the swipe up that opened it). At the top, a downward drag can't scroll anything, so it
  // is safe to claim; anywhere else the feed scrolls as normal.
  const scrollY = useRef(0);
  const ty = useRef(new Animated.Value(0)).current;
  const pullDown = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => scrollY.current <= 0 && g.dy > 12 && g.dy > Math.abs(g.dx) * 1.5,
        onPanResponderMove: (_, g) => ty.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 110 || g.vy > 0.9) {
            Animated.timing(ty, { toValue: height, duration: 200, useNativeDriver: false }).start(() => {
              goToPicks();
              ty.setValue(0);
            });
          } else {
            Animated.spring(ty, { toValue: 0, useNativeDriver: false, friction: 8 }).start();
          }
        },
        onPanResponderTerminate: () => Animated.spring(ty, { toValue: 0, useNativeDriver: false, friction: 8 }).start(),
      }),
    [ty, height],
  );

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.screen, { transform: [{ translateY: ty }] }]} {...pullDown.panHandlers}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 56, paddingBottom: 40 }}
        scrollEventThrottle={16}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
      >
        {data === undefined ? (
          <View style={{ padding: 20, gap: 16 }}>
            {[0, 1, 2].map((i) => <View key={i} style={styles.skeleton} />)}
          </View>
        ) : (
          <>
            {hosting.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.h1}>Events I'm hosting</Text>
                </View>
                <View style={{ paddingHorizontal: 20 }}>
                  {hosting.map((e) => <Row key={e.eventId} ev={e} onPress={() => open(e)} />)}
                </View>
              </View>
            )}

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
                <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 14 }}>
                  <View style={{ gap: 12 }}>
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
          </>
        )}
      </ScrollView>
      </Animated.View>
      {/* Outside the pull-down wrapper so the bar stays put while the page slides away. */}
      <EventsNavBar active="feed" picks={picks} />
    </View>
  );
}

/** Back to the recommended-events stack: jump to it if it's already open underneath, else open it. */
function goToPicks() {
  router.navigate("/events/recommended");
}

function Row({ ev, onPress }: { ev: EventView; onPress: () => void }) {
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
        <Text style={styles.time} numberOfLines={1}>{ev.slotLabel ?? "Date to be confirmed"}</Text>
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
  root: { flex: 1, backgroundColor: discover.bg },
  screen: { flex: 1, backgroundColor: discover.bg },
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
  title: { color: discover.text, fontSize: 18, fontWeight: "700", lineHeight: 23, marginTop: 4 },
  sub: { color: discover.muted, fontSize: 15, marginTop: 4 },
  friends: { color: discover.muted, fontSize: 13, marginTop: 3 },
  chip: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: discover.card, borderRadius: 16, borderWidth: 1, borderColor: discover.line, paddingHorizontal: 18, paddingVertical: 16 },
  chipName: { color: discover.text, fontSize: 18, fontWeight: "700" },
  chipCount: { color: discover.muted, fontSize: 15, marginTop: 2 },
});
