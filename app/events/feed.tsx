import React, { useCallback, useMemo, useRef, useState } from "react";
import { EventBanner } from "@/components/events/EventBanner";
import { Animated, FlatList, Image, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { EventsNavBar } from "@/components/events/EventsNavBar";
import type { EventView } from "@/components/events/SwipeCard";
import { Avatar } from "@/components/ui";
import { discover, swipe } from "@/theme/swipeTheme";

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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * When an event starts, in ms, or null if we can't tell. Discovered events carry their real start time (the
 * card stores it in createdAt); demo events only have a label like "Sat 21 Nov, 7pm", which is read here.
 */
function startMs(ev: EventView): number | null {
  if (ev.relation === "pick") return typeof ev.createdAt === "number" ? ev.createdAt : null;
  const m = /(\d{1,2})\s+([A-Za-z]{3}),?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(ev.slotLabel ?? "");
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  const hour = (Number(m[3]) % 12) + (m[5].toLowerCase() === "pm" ? 12 : 0);
  const now = new Date();
  let when = new Date(now.getFullYear(), month, Number(m[1]), hour, Number(m[4] ?? 0));
  // A label with no year: if that date is long past, it means next year's.
  if (when.getTime() < now.getTime() - 180 * 24 * 60 * 60 * 1000) when = new Date(now.getFullYear() + 1, month, Number(m[1]), hour, Number(m[4] ?? 0));
  return when.getTime();
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

  // "This week": what starts in the next 7 days, soonest first, up to 10 rows. If nothing starts that soon it
  // shows the next events coming up instead, and is titled "Coming up" so it never claims more than it is.
  const week = useMemo(() => {
    const now = Date.now();
    const dated = all
      .map((e) => ({ e, t: startMs(e) }))
      .filter((x): x is { e: EventView; t: number } => x.t !== null && x.t >= now - 3 * 60 * 60 * 1000)
      .sort((a, b) => a.t - b.t);
    const within = dated.filter((x) => x.t <= now + 7 * 24 * 60 * 60 * 1000);
    return { rows: (within.length > 0 ? within : dated).slice(0, 10).map((x) => x.e), title: within.length > 0 ? "This week" : "Coming up" };
  }, [all]);

  const pages = useMemo(() => {
    const out: EventView[][] = [];
    for (let i = 0; i < popular.length; i += ROWS_PER_PAGE) out.push(popular.slice(i, i + ROWS_PER_PAGE));
    return out;
  }, [popular]);

  const pageW = Math.min(width - 56, 460);
  const open = (ev: EventView) => {
    if (ev.relation === "pick") {
      router.push({ pathname: "/picks/[key]", params: { key: encodeURIComponent(ev.eventId.slice("pick:".length)) } });
      return;
    }
    router.push(`/events/${ev.eventId}`);
  };

  // Pull the feed down while it's scrolled to the top to go back to the recommended-events stack (the
  // reverse of the swipe up that opened it). At the top, a downward drag can't scroll anything, so it
  // is safe to claim; anywhere else the feed scrolls as normal.
  const scrollY = useRef(0);
  const ty = useRef(new Animated.Value(0)).current;
  // After sliding away to go back to the picks, the feed stays off-screen; put it back only when it is
  // shown again (resetting straight away made it snap back into view while the screen change played).
  useFocusEffect(useCallback(() => { ty.setValue(0); }, [ty]));
  const pullDown = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => scrollY.current <= 0 && g.dy > 12 && g.dy > Math.abs(g.dx) * 1.5,
        onPanResponderMove: (_, g) => ty.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 110 || g.vy > 0.9) {
            Animated.timing(ty, { toValue: height, duration: 200, useNativeDriver: false }).start(() => {
              goToPicks();
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
                  {hosting.map((e, i) => <Row key={e.eventId} ev={e} last={i === hosting.length - 1} onPress={() => open(e)} />)}
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
                  {popular.map((e, i) => <Row key={e.eventId} ev={e} last={i === popular.length - 1} onPress={() => open(e)} />)}
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
                      {item.map((e, i) => <Row key={e.eventId} ev={e} last={i === item.length - 1} onPress={() => open(e)} />)}
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

            {/* A plain vertical list: it scrolls down with the page, row by row, not sideways. */}
            {week.rows.length > 0 && (
              <View style={[styles.section, styles.divided]}>
                <Text style={[styles.h2, { paddingHorizontal: 20 }]}>{week.title}</Text>
                <View style={{ paddingHorizontal: 20 }}>
                  {week.rows.map((e, i) => <Row key={e.eventId} ev={e} last={i === week.rows.length - 1} onPress={() => open(e)} />)}
                </View>
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

const PILLS = {
  going: { label: "Going", bg: "#DCFCE7", fg: "#1F7A3A" },
  maybe: { label: "Maybe", bg: "#FEF3C7", fg: "#8A5A00" },
  invited: { label: "Invited", bg: swipe.lavender, fg: swipe.lavenderText },
} as const;

/** Where the viewer stands with an event, shown as a small pill on its picture (nothing for events they haven't engaged with). */
function pillFor(ev: EventView) {
  if (ev.myStatus === "going") return PILLS.going;
  if (ev.myStatus === "maybe") return PILLS.maybe;
  if (ev.relation === "invited") return PILLS.invited;
  return null;
}

/**
 * One event in a list: the picture with a status pill on its edge, then who's running it, the title, and a
 * line with when (clock) and where (pin) that wraps onto a second line when it's long.
 */
function Row({ ev, onPress, last = false }: { ev: EventView; onPress: () => void; last?: boolean }) {
  const when = ev.whenLabel ?? ev.slotLabel ?? "Date to be confirmed";
  const place = ev.placeLabel ?? ev.venue?.name ?? null;
  const pill = pillFor(ev);
  return (
    <Pressable style={[styles.row, !last && styles.rowDivider]} onPress={onPress}>
      <View style={styles.thumbWrap}>
        <View style={styles.thumb}>
          <EventBanner eventId={ev.eventId} posterUrl={ev.poster?.url} style={StyleSheet.absoluteFill} />
        </View>
        {pill && (
          <View style={[styles.pill, { backgroundColor: pill.bg }]}>
            <Text style={[styles.pillText, { color: pill.fg }]}>{pill.label}</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        {ev.host ? (
          <View style={styles.org}>
            <Avatar initials={ev.host.initials} color={ev.host.color} size={18} />
            <Text style={styles.orgText} numberOfLines={1}>{ev.host.name}</Text>
          </View>
        ) : null}
        <Text style={styles.title} numberOfLines={2}>{ev.title}</Text>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={discover.muted} />
            <Text style={styles.metaText}>{when}</Text>
          </View>
          {place ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={16} color={discover.muted} />
              <Text style={[styles.metaText, { flexShrink: 1 }]} numberOfLines={1}>{place}</Text>
            </View>
          ) : null}
        </View>
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
  row: { flexDirection: "row", gap: 14, alignItems: "flex-start", paddingTop: 14, paddingBottom: 18 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: discover.line },
  thumbWrap: { width: 92 },
  thumb: { width: 92, height: 92, borderRadius: 14, overflow: "hidden", backgroundColor: discover.card },
  // sits on the picture's bottom edge, half over it, like the reference
  pill: { position: "absolute", bottom: -9, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 3, borderRadius: 999, borderWidth: 2, borderColor: discover.bg },
  pillText: { fontSize: 12, fontWeight: "800" },
  org: { flexDirection: "row", alignItems: "center", gap: 7 },
  orgText: { color: discover.muted, fontSize: 14, flexShrink: 1 },
  title: { color: discover.text, fontSize: 19, fontWeight: "800", lineHeight: 24, marginTop: 4 },
  meta: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 4, marginTop: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  metaText: { color: discover.textDim, fontSize: 14 },
  chip: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: discover.card, borderRadius: 16, borderWidth: 1, borderColor: discover.line, paddingHorizontal: 18, paddingVertical: 16 },
  chipName: { color: discover.text, fontSize: 18, fontWeight: "700" },
  chipCount: { color: discover.muted, fontSize: 15, marginTop: 2 },
});
