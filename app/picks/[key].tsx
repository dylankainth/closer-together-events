import React from "react";
import { EventBanner } from "@/components/events/EventBanner";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { Avatar } from "@/components/ui";
import { discover, swipe } from "@/theme/swipeTheme";

/** A Muse pick of a real nearby event, shown as a Facebook-style event page. No links out:
 * picks read as Facebook events (docs/superpowers/specs/2026-11-13-event-discovery-design.md). */
export default function PickPage() {
  const { key: rawKey } = useLocalSearchParams<{ key: string }>();
  const key = decodeURIComponent(rawKey ?? "");
  const { viewerId } = useViewer();
  const insets = useSafeAreaInsets();
  const ev = useQuery(api.picks.detail, { personaId: viewerId, key });
  const respond = useMutation(api.picks.respond);

  // The page draws its own back button, like the other event pages; no native header.
  const back = (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/events/recommended"))} style={[styles.back, { top: insets.top + 12 }]} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color={swipe.ink} />
      </Pressable>
    </>
  );
  if (ev === undefined) {
    return <View style={styles.screen}>{back}<View style={[styles.banner, styles.skeleton]} /><View style={[styles.skelLine, { width: "70%" }]} /><View style={[styles.skelLine, { width: "45%" }]} /></View>;
  }
  if (ev === null) {
    return <View style={styles.screen}>{back}<Text style={styles.loading}>This event is no longer available.</Text></View>;
  }

  const [datePart, timePart] = (ev.whenLabel ?? "").split(" · ");
  const [weekday, day, month] = (datePart ?? "").split(" ");
  const going = ev.myStatus === "going";
  const answer = (action: "going" | "maybe" | "cant") => respond({ personaId: viewerId, key, action });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {back}
      <View style={styles.banner}>
        <EventBanner eventId={key} posterUrl={ev.poster?.url} style={StyleSheet.absoluteFill} />
      </View>

      <Text style={styles.title}>{ev.title}</Text>
      <View style={styles.hostRow}>
        <Avatar initials={ev.host.initials} color={ev.host.color} size={22} />
        <Text style={styles.hostText}>Hosted by {ev.host.name}</Text>
      </View>

      <View style={styles.infoRow}>
        <View style={styles.tile}>
          <Text style={styles.tileTop}>{(month ?? "").toUpperCase()}</Text>
          <Text style={styles.tileBig}>{day}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>{weekday ? `${weekday}, ${day} ${month}` : "Date to be confirmed"}</Text>
          {timePart ? <Text style={styles.infoSub}>{timePart}</Text> : null}
        </View>
      </View>
      <View style={styles.infoRow}>
        <View style={styles.tile}><Ionicons name="location-outline" size={22} color={swipe.ink} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>{ev.placeLabel ?? "Location to be confirmed"}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{ev.myStatus ? "Your answer" : "Are you going?"}</Text>
        <View style={styles.btnRow}>
          <Pressable style={[styles.btnDark, { flex: 1 }]} onPress={() => answer("going")}>
            {going && <Ionicons name="checkmark" size={16} color="#fff" style={{ marginRight: 6 }} />}
            <Text style={styles.btnDarkText}>{going ? "You're going" : "Going"}</Text>
          </Pressable>
          <Pressable style={[styles.btnLight, { flex: 1 }, ev.myStatus === "maybe" ? styles.btnLightOn : null]} onPress={() => answer("maybe")}>
            <Text style={styles.btnLightText}>Maybe</Text>
          </Pressable>
        </View>
        {!going && ev.myStatus !== "cant" && (
          <Pressable onPress={() => answer("cant")} style={{ alignSelf: "center", marginTop: 12 }}>
            <Text style={styles.skip}>Not for me</Text>
          </Pressable>
        )}
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

      {ev.description ? (
        <>
          <Text style={styles.sectionBig}>About</Text>
          <Text style={styles.about}>{ev.description}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: swipe.cream },
  content: { padding: 16, paddingTop: 56, paddingBottom: 60 },
  loading: { padding: 32, paddingTop: 100, color: discover.textDim },
  back: { position: "absolute", top: 16, left: 8, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.85)", alignItems: "center", justifyContent: "center" },
  banner: { aspectRatio: 1, borderRadius: 28, overflow: "hidden", backgroundColor: swipe.blueDeep, alignItems: "center", justifyContent: "center" },
  skeleton: { margin: 16, marginTop: 100, backgroundColor: discover.pill },
  skelLine: { height: 18, borderRadius: 9, backgroundColor: discover.pill, marginHorizontal: 16, marginTop: 12 },
  title: { fontSize: 34, lineHeight: 38, fontWeight: "800", color: swipe.ink, marginTop: 20 },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  hostText: { color: discover.textDim, fontSize: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
  tile: { width: 48, height: 48, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: discover.line, alignItems: "center", justifyContent: "center" },
  tileTop: { fontSize: 9, fontWeight: "800", color: discover.muted },
  tileBig: { fontSize: 18, fontWeight: "800", color: swipe.ink, marginTop: -2 },
  infoTitle: { fontWeight: "700", fontSize: 16, color: swipe.ink },
  infoSub: { color: discover.muted, fontSize: 13, marginTop: 2 },
  panel: { backgroundColor: "#fff", borderRadius: 20, padding: 16, marginTop: 20, borderWidth: 1, borderColor: discover.pill },
  panelTitle: { fontWeight: "800", fontSize: 16, color: swipe.ink },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  btnDark: { flexDirection: "row", backgroundColor: swipe.ink, borderRadius: 14, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  btnDarkText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  btnLight: { flexDirection: "row", backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#D9D5CC" },
  btnLightOn: { borderColor: swipe.ink },
  btnLightText: { color: swipe.ink, fontWeight: "700", fontSize: 15 },
  skip: { color: discover.muted, fontSize: 14, textDecorationLine: "underline" },
  why: { backgroundColor: swipe.lavender, borderRadius: 20, padding: 16, marginTop: 16, borderWidth: 1, borderColor: swipe.lavenderLine },
  whyHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  whyTitle: { flex: 1, fontWeight: "800", fontSize: 16, color: swipe.lavenderText },
  goPill: { backgroundColor: swipe.lavenderText, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  goPillText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  from: { color: swipe.lavenderText, fontSize: 11, fontWeight: "600", marginTop: 8 },
  whyText: { color: swipe.ink, fontSize: 15, lineHeight: 20, marginTop: 10 },
  sectionBig: { fontSize: 20, fontWeight: "800", color: swipe.ink, marginTop: 24 },
  about: { color: swipe.ink, fontSize: 15, lineHeight: 22, marginTop: 8 },
});
