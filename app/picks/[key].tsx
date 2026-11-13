import React, { useState } from "react";
import { EventBanner } from "@/components/events/EventBanner";
import { shortPlace } from "@/components/events/place";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { Avatar } from "@/components/ui";
import { discover, swipe } from "@/theme/swipeTheme";

const ABOUT_MAX = 150; // characters shown before "See more"

/** A Muse pick of a real nearby event, laid out like a Luma event page. No links out:
 * picks read as Facebook events (docs/superpowers/specs/2026-11-13-event-discovery-design.md). */
export default function PickPage() {
  const { key: rawKey } = useLocalSearchParams<{ key: string }>();
  const key = decodeURIComponent(rawKey ?? "");
  const { viewerId } = useViewer();
  const insets = useSafeAreaInsets();
  const ev = useQuery(api.picks.detail, { personaId: viewerId, key });
  const respond = useMutation(api.picks.respond);
  const [scrolled, setScrolled] = useState(false); // the title moves into the top bar once the big one scrolls away
  const [more, setMore] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/events/recommended"));
  const topBar = (title?: string, shareMessage?: string) => (
    <View style={[styles.topBar, { paddingTop: insets.top + 8 }, scrolled && styles.topBarSolid]} pointerEvents="box-none">
      <Stack.Screen options={{ headerShown: false }} />
      <Pressable onPress={goBack} style={styles.circle} hitSlop={8} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={22} color={swipe.ink} />
      </Pressable>
      <Text style={[styles.topTitle, !scrolled && { opacity: 0 }]} numberOfLines={1}>{title ?? ""}</Text>
      {shareMessage ? (
        <Pressable onPress={() => void Share.share({ message: shareMessage }).catch(() => undefined)} style={styles.circle} hitSlop={8} accessibilityLabel="Share">
          <Ionicons name="share-social-outline" size={20} color={swipe.ink} />
        </Pressable>
      ) : <View style={{ width: 40 }} />}
    </View>
  );

  if (ev === undefined) {
    return <View style={styles.screen}>{topBar()}<View style={[styles.banner, styles.skeleton]} /><View style={[styles.skelLine, { width: "70%" }]} /><View style={[styles.skelLine, { width: "45%" }]} /></View>;
  }
  if (ev === null) {
    return <View style={styles.screen}>{topBar()}<Text style={styles.loading}>This event is no longer available.</Text></View>;
  }

  const [datePart, timePart] = (ev.whenLabel ?? "").split(" · ");
  const [weekday, day, month] = (datePart ?? "").split(" ");
  const dateText = weekday ? `${weekday}, ${day} ${month}` : "Date to be confirmed";
  const going = ev.myStatus === "going";
  const nah = ev.myStatus === "cant";
  const answer = (action: "going" | "cant") => respond({ personaId: viewerId, key, action }).catch(() => undefined);
  const place = shortPlace(ev.placeLabel);
  const about = ev.description ?? "";
  const long = about.length > ABOUT_MAX;
  const shownAbout = long && !more ? `${about.slice(0, ABOUT_MAX).trimEnd()}…` : about;
  const friends = ev.friendsGoing ?? [];
  const goingText = friends.length === 0 ? `${ev.goingCount} people, none you know yet` : `${friends.map((f) => f.name).join(", ")}${ev.goingCount > friends.length ? `, and ${ev.goingCount - friends.length} more` : ""}`;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 64 }]}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const past = e.nativeEvent.contentOffset.y > 300;
          if (past !== scrolled) setScrolled(past);
        }}
      >
        <View style={styles.banner}>
          <EventBanner eventId={key} posterUrl={ev.poster?.url} style={StyleSheet.absoluteFill} />
        </View>

        <Text style={styles.title}>{ev.title}</Text>

        {/* Date and time side by side */}
        <View style={styles.whenRow}>
          <View style={styles.whenCard}>
            <Ionicons name="calendar-outline" size={20} color={swipe.ink} />
            <Text style={styles.whenText}>{dateText}</Text>
          </View>
          {timePart ? (
            <View style={styles.whenCard}>
              <Ionicons name="time-outline" size={20} color={swipe.ink} />
              <Text style={styles.whenText}>{timePart}</Text>
            </View>
          ) : null}
        </View>

        {/* Two action cards */}
        <View style={styles.tileRow}>
          <Pressable style={[styles.actionTile, styles.actionTileOn]} onPress={() => answer("going")} accessibilityRole="button">
            <Ionicons name={going ? "checkmark-circle" : "ticket"} size={22} color="#fff" />
            <Text style={styles.actionTileTextOn}>{going ? "You're going" : "I'll go"}</Text>
          </Pressable>
          <Pressable style={[styles.actionTile, nah && styles.actionTileSel]} onPress={() => answer("cant")} accessibilityRole="button">
            <Ionicons name="close-circle-outline" size={22} color={swipe.ink} />
            <Text style={styles.actionTileText}>{nah ? "Not going" : "Nah"}</Text>
          </Pressable>
        </View>

        <View style={styles.why}>
          <View style={styles.whyHead}>
            <Ionicons name="sparkles-outline" size={16} color={swipe.lavenderText} />
            <Text style={styles.whyTitle}>Why you'd like this</Text>
            <View style={styles.goPill}><Text style={styles.goPillText}>{ev.verdict === "worth" ? "Go" : "Maybe"}</Text></View>
          </View>
          <Text style={styles.from}>From your Muse</Text>
          <Text style={styles.whyText}>{ev.reasons[0]}</Text>
        </View>

        {place ? (
          <>
            <View style={styles.sectionHead}><Text style={styles.sectionLabel}>Location</Text></View>
            <Text style={styles.locTitle}>{place}</Text>
          </>
        ) : null}

        <View style={styles.sectionHead}><Text style={styles.sectionLabel}>Hosts</Text></View>
        <View style={styles.hostRow}>
          <Avatar initials={ev.host.initials} color={ev.host.color} size={40} />
          <Text style={styles.hostName}>{ev.host.name}</Text>
        </View>

        {ev.goingCount > 0 && (
          <>
            <View style={styles.sectionHead}><Text style={styles.sectionLabel}>{ev.goingCount} going{friends.length > 0 ? ` · ${friends.length} friend${friends.length === 1 ? "" : "s"}` : ""}</Text></View>
            {ev.goingList && ev.goingList.length > 0 ? (
              // Each person going, with a one-liner from your Muse on why they matter to you.
              <View style={{ gap: 14, marginTop: 14 }}>
                {ev.goingList.map((g) => (
                  <View key={g.id} style={styles.goingRow}>
                    <Avatar initials={g.initials} color={g.color} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.goingWho}>{g.name}{g.friend ? "  ·  friend" : ""}</Text>
                      <Text style={styles.goingWhy}>{g.note}</Text>
                    </View>
                  </View>
                ))}
                {ev.goingCount > ev.goingList.length && <Text style={styles.goingNames}>and {ev.goingCount - ev.goingList.length} more</Text>}
              </View>
            ) : (
              <>
                <View style={styles.faces}>
                  {friends.map((f, i) => (
                    <View key={f.id} style={[styles.face, i > 0 && { marginLeft: -10 }]}>
                      <Avatar initials={f.initials} color={f.color} size={38} />
                    </View>
                  ))}
                </View>
                <Text style={styles.goingNames}>{goingText}</Text>
              </>
            )}
          </>
        )}

        {about ? (
          <>
            <View style={styles.sectionHead}><Text style={styles.sectionLabel}>About event</Text></View>
            <Text style={styles.about}>{shownAbout}</Text>
            {long && (
              <Pressable onPress={() => setMore((m) => !m)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.seeMore}>{more ? "See less" : "See more"}</Text>
              </Pressable>
            )}
          </>
        ) : null}
      </ScrollView>
      {topBar(ev.title, `${ev.title}${ev.whenLabel ? ` · ${ev.whenLabel}` : ""}`)}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: swipe.cream },
  content: { paddingHorizontal: 16, paddingBottom: 60 },
  loading: { padding: 32, paddingTop: 100, color: discover.textDim },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
  topBarSolid: { backgroundColor: swipe.cream },
  circle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: discover.line },
  topTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: swipe.ink },
  banner: { aspectRatio: 1, borderRadius: 24, overflow: "hidden", backgroundColor: swipe.blueDeep, alignItems: "center", justifyContent: "center" },
  skeleton: { margin: 16, marginTop: 100, backgroundColor: discover.pill },
  skelLine: { height: 18, borderRadius: 9, backgroundColor: discover.pill, marginHorizontal: 16, marginTop: 12 },
  title: { fontSize: 24, lineHeight: 35, fontWeight: "700", color: swipe.ink, marginTop: 18 },
  whenRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  whenCard: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: discover.line, paddingHorizontal: 14, paddingVertical: 12 },
  whenText: { flex: 1, fontSize: 15, fontWeight: "600", color: swipe.ink },
  tileRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  actionTile: { flex: 1, height: 74, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: discover.line, alignItems: "center", justifyContent: "center", gap: 6 },
  actionTileOn: { backgroundColor: swipe.ink, borderColor: swipe.ink },
  actionTileSel: { borderColor: swipe.ink, borderWidth: 2 },
  actionTileText: { color: swipe.ink, fontWeight: "600", fontSize: 14 },
  actionTileTextOn: { color: "#fff", fontWeight: "600", fontSize: 14 },
  why: { backgroundColor: swipe.lavender, borderRadius: 20, padding: 16, marginTop: 16, borderWidth: 1, borderColor: swipe.lavenderLine },
  whyHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  whyTitle: { flex: 1, fontWeight: "700", fontSize: 16, color: swipe.lavenderText },
  goPill: { backgroundColor: swipe.lavenderText, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  goPillText: { color: "#fff", fontWeight: "600", fontSize: 11 },
  from: { color: swipe.lavenderText, fontSize: 11, fontWeight: "600", marginTop: 8 },
  whyText: { color: swipe.ink, fontSize: 15, lineHeight: 20, marginTop: 10 },
  sectionHead: { marginTop: 28, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#C9C5BB" },
  sectionLabel: { fontSize: 16, color: discover.muted, fontWeight: "600" },
  locTitle: { fontSize: 19, fontWeight: "600", color: swipe.ink, marginTop: 14 },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  hostName: { flex: 1, fontSize: 18, fontWeight: "600", color: swipe.ink },
  faces: { flexDirection: "row", marginTop: 14 },
  face: { borderRadius: 22, borderWidth: 2, borderColor: swipe.cream },
  goingRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  goingWho: { fontSize: 16, fontWeight: "600", color: swipe.ink },
  goingWhy: { fontSize: 14, lineHeight: 20, color: discover.textDim, marginTop: 2 },
  goingNames: { color: discover.muted, fontSize: 15, lineHeight: 21, marginTop: 10 },
  about: { color: swipe.ink, fontSize: 17, lineHeight: 26, marginTop: 14 },
  seeMore: { color: swipe.blue, fontWeight: "600", fontSize: 16, marginTop: 8 },
});
