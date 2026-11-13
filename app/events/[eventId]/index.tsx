import React from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { Avatar } from "@/components/ui";
import { parseSlot, priceLabel, swipe } from "@/theme/swipeTheme";

const KIND_LABEL = { people: "PEOPLE", goal: "GOAL", fit: "FIT" } as const;

/** Guest event page: what it is, why Muse picked it for you, who's going, and how to answer. */
export default function EventPage() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { viewerId } = useViewer();
  const ev = useQuery(api.feed.detail, { eventId, personaId: viewerId });
  const respond = useMutation(api.feed.respond);

  if (ev === undefined) return <View style={styles.screen}><Text style={styles.loading}>Loading…</Text></View>;
  if (ev === null) return <View style={styles.screen}><Text style={styles.loading}>This event doesn't exist.</Text></View>;

  const slot = parseSlot(ev.slotLabel);
  const answered = ev.myStatus && ev.myStatus !== "invited";
  const canAnswer = ev.relation === "invited" || ev.relation === "responded";
  const going = ev.myStatus === "going";
  const spotsText = ev.spotsLeft === null ? null : `${ev.spotsLeft} spot${ev.spotsLeft === 1 ? "" : "s"} left`;
  const venueLine = [ev.venue?.name, ev.venue?.area].filter(Boolean).join(", ");
  const priceLine = priceLabel(ev.priceTier);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color={swipe.ink} />
      </Pressable>

      <View style={styles.banner}>
        {ev.poster ? (
          <Image source={{ uri: ev.poster.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={44} color="rgba(255,255,255,0.45)" />
        )}
      </View>

      <Text style={styles.title}>{ev.title}</Text>
      {ev.host && (
        <View style={styles.hostRow}>
          <Avatar initials={ev.host.initials} color={ev.host.color} size={22} />
          <Text style={styles.hostText}>Hosted by {ev.host.name}</Text>
        </View>
      )}

      <View style={styles.infoRow}>
        <View style={styles.tile}>
          {slot ? (
            <>
              <Text style={styles.tileTop}>{slot.month}</Text>
              <Text style={styles.tileBig}>{slot.day}</Text>
            </>
          ) : (
            <Ionicons name="calendar-outline" size={22} color={swipe.ink} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>{slot ? `${slot.weekday}, ${slot.day} ${slot.month}` : "Date to be confirmed"}</Text>
          {slot && <Text style={styles.infoSub}>{slot.time}</Text>}
        </View>
      </View>
      <View style={styles.infoRow}>
        <View style={styles.tile}><Ionicons name="location-outline" size={22} color={swipe.ink} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>{venueLine || "Venue to be confirmed"}</Text>
          {priceLine && <Text style={styles.infoSub}>Price {priceLine}</Text>}
        </View>
      </View>

      {canAnswer && (
        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>{answered ? "Your answer" : "You're invited"}</Text>
            {spotsText && <Text style={styles.panelMeta}>{spotsText}</Text>}
          </View>
          <View style={styles.btnRow}>
            <Pressable
              style={[styles.btnDark, { flex: 1 }]}
              onPress={() => respond({ eventId, personaId: viewerId, action: "going" })}
            >
              <Text style={styles.btnDarkText}>{going ? "You're going ✓" : "Going"}</Text>
            </Pressable>
            {ev.goIfOffer ? (
              <Pressable
                style={[styles.btnLight, { flex: 1.4 }, ev.goIfFriend ? styles.btnLightOn : null]}
                onPress={() => respond({ eventId, personaId: viewerId, action: "goIf", friendId: ev.goIfOffer!.id })}
              >
                <Text style={styles.btnLightText} numberOfLines={1}>
                  {ev.goIfFriend ? `Going if ${ev.goIfOffer.name.split(" ")[0]} goes ✓` : `Go if ${ev.goIfOffer.name.split(" ")[0]} goes`}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {!going && ev.myStatus !== "cant" && (
            <Pressable onPress={() => respond({ eventId, personaId: viewerId, action: "cant" })} style={{ alignSelf: "center", marginTop: 12 }}>
              <Text style={styles.skip}>Not for me</Text>
            </Pressable>
          )}
        </View>
      )}

      {ev.chips.length > 0 && (
        <View style={styles.why}>
          <View style={styles.whyHead}>
            <Ionicons name="sparkles-outline" size={16} color={swipe.lavenderText} />
            <Text style={styles.whyTitle}>Why you'd like this</Text>
            {ev.verdict && ev.matchPct !== null && (
              <View style={styles.goPill}><Text style={styles.goPillText}>{ev.verdict === "worth" ? "GO" : ev.verdict.toUpperCase()} · {ev.matchPct}%</Text></View>
            )}
          </View>
          <Text style={styles.from}>✦ FROM YOUR MUSE</Text>
          {ev.chips.map((c, i) => (
            <View key={i} style={styles.whyRow}>
              <View style={styles.tag}><Text style={styles.tagText}>{KIND_LABEL[c.kind]}</Text></View>
              <Text style={styles.whyText}>{c.text}</Text>
            </View>
          ))}
          {ev.tradeoff && <Text style={styles.tradeoff}>Trade-off: {ev.tradeoff}</Text>}
          {ev.twinsCount > 0 && (
            <Pressable onPress={() => router.push(`/events/${eventId}/transcript`)}>
              <Text style={styles.seeHow}>See how {ev.twinsCount} Muse{ev.twinsCount === 1 ? "" : "s"} reached this →</Text>
            </Pressable>
          )}
        </View>
      )}

      {ev.plusOne && canAnswer && (
        <>
          <Text style={styles.section}>YOUR AGENT CAN ALSO</Text>
          <View style={styles.agentCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.agentTitle}>Bring 1 person</Text>
              <Text style={styles.agentSub}>Suggested: {ev.plusOne.name.split(" ")[0]}. {ev.plusOne.why}</Text>
            </View>
            {/* No guest-side invite backend yet: shown so the idea is visible, but disabled. */}
            <View style={[styles.btnLight, { opacity: 0.45 }]}><Text style={styles.btnLightText}>Soon</Text></View>
          </View>
        </>
      )}

      <View style={styles.goingHead}>
        <Text style={styles.sectionBig}>Who's going</Text>
        <Text style={styles.panelMeta}>{ev.capacity ? `${ev.totalGoing} of ${ev.capacity}` : `${ev.totalGoing}`}</Text>
      </View>
      {ev.attendees.length === 0 ? (
        <Text style={styles.infoSub}>No one has said yes yet. Be the first.</Text>
      ) : (
        ev.attendees.slice(0, 6).map((a, i) => (
          <View key={`${a.personaId ?? a.name}-${i}`} style={styles.attendee}>
            <Avatar initials={a.initials} color={a.color} size={32} />
            <Text style={styles.attendeeName}>{a.name}</Text>
            {a.tag ? <View style={[styles.relTag, a.tag === "Friend" && styles.relTagFriend]}><Text style={[styles.relTagText, a.tag === "Friend" && { color: swipe.lavenderText }]}>{a.tag}</Text></View> : null}
          </View>
        ))
      )}
      {ev.attendees.length > 6 && <Text style={styles.infoSub}>+{ev.attendees.length - 6} others</Text>}

      {ev.about ? (
        <>
          <Text style={styles.sectionBig}>About</Text>
          <Text style={styles.about}>{ev.about}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: swipe.cream },
  content: { padding: 16, paddingTop: 56, paddingBottom: 60 },
  loading: { padding: 32, paddingTop: 100, color: "#55555F" },
  back: { position: "absolute", top: 16, left: 4, zIndex: 2, width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  banner: { aspectRatio: 1, borderRadius: 28, overflow: "hidden", backgroundColor: swipe.blueDeep, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 34, lineHeight: 38, fontWeight: "800", color: swipe.ink, marginTop: 20 },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  hostText: { color: "#55555F", fontSize: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
  tile: { width: 48, height: 48, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E1DA", alignItems: "center", justifyContent: "center" },
  tileTop: { fontSize: 9, fontWeight: "800", color: "#8A8A94" },
  tileBig: { fontSize: 18, fontWeight: "800", color: swipe.ink, marginTop: -2 },
  infoTitle: { fontWeight: "700", fontSize: 16, color: swipe.ink },
  infoSub: { color: "#6B6B76", fontSize: 13, marginTop: 2 },
  panel: { backgroundColor: "#fff", borderRadius: 20, padding: 16, marginTop: 20, borderWidth: 1, borderColor: "#ECE8E0" },
  panelHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { fontWeight: "800", fontSize: 16, color: swipe.ink },
  panelMeta: { color: "#6B6B76", fontSize: 13 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  btnDark: { backgroundColor: swipe.ink, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  btnDarkText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  btnLight: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center", borderWidth: 1, borderColor: "#D9D5CC" },
  btnLightOn: { borderColor: swipe.ink },
  btnLightText: { color: swipe.ink, fontWeight: "700", fontSize: 15 },
  skip: { color: "#6B6B76", fontSize: 14, textDecorationLine: "underline" },
  why: { backgroundColor: swipe.lavender, borderRadius: 20, padding: 16, marginTop: 16, borderWidth: 1, borderColor: swipe.lavenderLine },
  whyHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  whyTitle: { flex: 1, fontWeight: "800", fontSize: 16, color: swipe.lavenderText },
  goPill: { backgroundColor: swipe.lavenderText, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  goPillText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  from: { color: swipe.lavenderText, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 8 },
  whyRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 12 },
  tag: { backgroundColor: "#fff", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 1 },
  tagText: { fontSize: 10, fontWeight: "800", color: swipe.lavenderText },
  whyText: { flex: 1, color: swipe.ink, fontSize: 15, lineHeight: 20 },
  tradeoff: { color: "#55555F", fontSize: 13, marginTop: 14 },
  seeHow: { color: swipe.lavenderText, fontWeight: "800", marginTop: 12 },
  section: { fontSize: 12, fontWeight: "800", letterSpacing: 1, color: "#6B6B76", marginTop: 24 },
  sectionBig: { fontSize: 20, fontWeight: "800", color: swipe.ink, marginTop: 24 },
  agentCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 16, padding: 14, marginTop: 10, borderWidth: 1, borderColor: "#ECE8E0" },
  agentTitle: { fontWeight: "700", fontSize: 15, color: swipe.ink },
  agentSub: { color: "#6B6B76", fontSize: 13, marginTop: 2 },
  goingHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  attendee: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  attendeeName: { flex: 1, fontWeight: "700", fontSize: 15, color: swipe.ink },
  relTag: { backgroundColor: "#ECE8E0", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  relTagFriend: { backgroundColor: swipe.lavender },
  relTagText: { fontSize: 12, fontWeight: "700", color: "#55555F" },
  about: { color: "#33333D", fontSize: 15, lineHeight: 22, marginTop: 8 },
});
