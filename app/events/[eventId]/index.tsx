import React, { useRef, useState } from "react";
import { EventBanner } from "@/components/events/EventBanner";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/convex/_generated/api";
import { useViewer } from "@/hooks/useViewer";
import { Avatar } from "@/components/ui";
import { discover, parseSlot, priceLabel, swipe } from "@/theme/swipeTheme";

const KIND_LABEL = { people: "People", goal: "Goal", fit: "Fit", plan: "Plan" } as const;
type RsvpResponse = { action: "going" | "goIf" | "cant"; friendId?: string };

/** Guest event page: what it is, why Muse picked it for you, who's going, and how to answer. */
export default function EventPage() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const { viewerId } = useViewer();

  // An in-flight response belongs to one event and viewer. Navigation or a persona switch
  // remounts the content rather than carrying its saving/error state to another invitation.
  return <GuestEventPage key={`${eventId}:${viewerId}`} eventId={eventId} viewerId={viewerId} />;
}

function GuestEventPage({ eventId, viewerId }: { eventId: string; viewerId: string }) {
  const insets = useSafeAreaInsets();
  const ev = useQuery(api.feed.detail, { eventId, personaId: viewerId });
  const respond = useMutation(api.feed.respond);
  const inFlight = useRef(false);
  const [saving, setSaving] = useState<RsvpResponse["action"] | null>(null);
  const [failedResponse, setFailedResponse] = useState<RsvpResponse | null>(null);
  const [saved, setSaved] = useState(false);
  // The title moves into the top bar once the big one has scrolled away.
  const [scrolled, setScrolled] = useState(false);

  async function saveResponse(response: RsvpResponse) {
    // State updates render later; the ref also rejects rapid taps in the same frame.
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(response.action);
    setFailedResponse(null);
    setSaved(false);
    try {
      await respond({ eventId, personaId: viewerId, ...response });
      setSaved(true);
    } catch {
      setFailedResponse(response);
    } finally {
      inFlight.current = false;
      setSaving(null);
    }
  }

  if (ev === undefined) return <View style={styles.screen}><Text style={styles.loading}>Loading…</Text></View>;
  if (ev === null) return <View style={styles.screen}><Text style={styles.loading}>This event doesn't exist.</Text></View>;

  const slot = parseSlot(ev.slotLabel);
  const canAnswer = ev.relation === "invited" || ev.relation === "responded";
  const going = ev.myStatus === "going";
  const spotsText = ev.spotsLeft === null ? null : `${ev.spotsLeft} spot${ev.spotsLeft === 1 ? "" : "s"} left`;
  const priceLine = priceLabel(ev.priceTier);
  const busy = saving !== null;
  const firstName = (n: string) => n.split(" ")[0];
  const dateLine = slot ? `${slot.weekday}, ${slot.day} ${slot.month} · ${slot.time}` : "Date to be confirmed";
  const goingNames = ev.attendees.slice(0, 4).map((a) => a.name);
  const goingMore = ev.totalGoing - goingNames.length;

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
          <EventBanner eventId={ev.eventId} posterUrl={ev.poster?.url} style={StyleSheet.absoluteFill} />
        </View>

        <Text style={styles.title}>{ev.title}</Text>
        <Text style={styles.date}>{dateLine}</Text>

        {/* Action tiles: a row of big buttons right under the title */}
        <View style={styles.tileRow}>
          {canAnswer && (
            <>
              <Pressable
                style={[styles.actionTile, styles.actionTileOn, busy && styles.btnDisabled]}
                onPress={() => void saveResponse({ action: "going" })}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy: saving === "going" }}
              >
                {saving === "going" ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={going ? "checkmark-circle" : "ticket"} size={22} color="#fff" />}
                <Text style={styles.actionTileTextOn}>{saving === "going" ? "Saving…" : going ? "You're going" : "I'll go"}</Text>
              </Pressable>
              {ev.goIfOffer ? (
                <Pressable
                  style={[styles.actionTile, ev.goIfFriend && styles.actionTileSel, busy && styles.btnDisabled]}
                  onPress={() => void saveResponse({ action: "goIf", friendId: ev.goIfOffer!.id })}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy, busy: saving === "goIf" }}
                >
                  {saving === "goIf" ? <ActivityIndicator size="small" color={swipe.ink} /> : <Ionicons name="people-outline" size={22} color={swipe.ink} />}
                  <Text style={styles.actionTileText} numberOfLines={1}>
                    {saving === "goIf" ? "Saving…" : `${ev.goIfFriend ? "Going if" : "Go if"} ${firstName(ev.goIfOffer.name)}`}
                  </Text>
                </Pressable>
              ) : null}
              {!going && ev.myStatus !== "cant" && (
                <Pressable
                  style={[styles.actionTile, busy && styles.btnDisabled]}
                  onPress={() => void saveResponse({ action: "cant" })}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy, busy: saving === "cant" }}
                >
                  {saving === "cant" ? <ActivityIndicator size="small" color={swipe.ink} /> : <Ionicons name="close-circle-outline" size={22} color={swipe.ink} />}
                  <Text style={styles.actionTileText}>{saving === "cant" ? "Saving…" : "Not for me"}</Text>
                </Pressable>
              )}
            </>
          )}
          {ev.relation === "hosting" && (
            <Pressable style={[styles.actionTile, styles.actionTileOn]} onPress={() => router.push(`/events/${eventId}/manage`)}>
              <Ionicons name="options-outline" size={22} color="#fff" />
              <Text style={styles.actionTileTextOn}>Manage</Text>
            </Pressable>
          )}
        </View>
        {canAnswer &&
          (failedResponse ? (
            <View style={styles.saveError}>
              <Text style={styles.saveErrorText} accessibilityRole="alert">We couldn't save your answer. Please try again.</Text>
              <Pressable onPress={() => void saveResponse(failedResponse)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.retry}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.saveStatus} accessibilityLiveRegion="polite">
              {saving !== null ? "Saving your answer…" : saved ? "Answer saved." : spotsText ?? ""}
            </Text>
          ))}

        {ev.chips.length > 0 && (
          <View style={styles.why}>
            <View style={styles.whyHead}>
              <Ionicons name="sparkles-outline" size={16} color={swipe.lavenderText} />
              <Text style={styles.whyTitle}>Why you'd like this</Text>
              {ev.verdict && ev.matchPct !== null && (
                <View style={styles.goPill}><Text style={styles.goPillText}>{ev.verdict === "worth" ? "Go" : ev.verdict.charAt(0).toUpperCase() + ev.verdict.slice(1)} · {ev.matchPct}%</Text></View>
              )}
            </View>
            <Text style={styles.from}>From your Muse</Text>
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

        {/* Location */}
        <View style={styles.sectionHead}><Text style={styles.sectionLabel}>Location</Text></View>
        <View style={styles.locRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.locTitle}>{ev.venue?.name || "Venue to be confirmed"}</Text>
            {ev.venue?.area ? <Text style={styles.locSub}>{ev.venue.area}</Text> : null}
          </View>
          {priceLine ? <Text style={styles.locSub}>{priceLine}</Text> : null}
        </View>

        {/* Hosts */}
        {ev.host && (
          <>
            <View style={styles.sectionHead}><Text style={styles.sectionLabel}>Hosts</Text></View>
            <View style={styles.hostRow}>
              <Avatar initials={ev.host.initials} color={ev.host.color} size={40} />
              <Text style={styles.hostName}>{ev.host.name}</Text>
            </View>
          </>
        )}

        {/* Going */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>{ev.capacity ? `${ev.totalGoing} of ${ev.capacity} going` : `${ev.totalGoing} going`}</Text>
        </View>
        {ev.attendees.length === 0 ? (
          <Text style={[styles.locSub, { marginTop: 14 }]}>No one has said yes yet. Be the first.</Text>
        ) : (
          <>
            <View style={styles.faces}>
              {ev.attendees.slice(0, 7).map((a, i) => (
                <View key={`${a.personaId ?? a.name}-${i}`} style={[styles.face, i > 0 && { marginLeft: -10 }]}>
                  <Avatar initials={a.initials} color={a.color} size={38} />
                </View>
              ))}
            </View>
            <Text style={styles.goingNames}>{goingNames.join(", ")}{goingMore > 0 ? `, and ${goingMore} more` : ""}</Text>
          </>
        )}

        {ev.plusOne && canAnswer && (
          <View style={styles.agentCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.agentTitle}>Your agent can also bring 1 person</Text>
              <Text style={styles.agentSub}>Suggested: {firstName(ev.plusOne.name)}. {ev.plusOne.why}</Text>
            </View>
            {/* No guest-side invite backend yet: shown so the idea is visible, but disabled. */}
            <View style={[styles.soon, { opacity: 0.45 }]}><Text style={styles.soonText}>Soon</Text></View>
          </View>
        )}

        {/* About */}
        {ev.about ? (
          <>
            <View style={styles.sectionHead}><Text style={styles.sectionLabel}>About event</Text></View>
            <Text style={styles.about}>{ev.about}</Text>
          </>
        ) : null}
      </ScrollView>

      {/* Floating top bar: back and share, with the title fading in once the big one scrolls away */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }, scrolled && styles.topBarSolid]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} style={styles.circle} hitSlop={8} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={swipe.ink} />
        </Pressable>
        <Text style={[styles.topTitle, !scrolled && { opacity: 0 }]} numberOfLines={1}>{ev.title}</Text>
        <Pressable
          onPress={() => void Share.share({ message: `${ev.title}${slot ? ` · ${dateLine}` : ""}` }).catch(() => undefined)}
          style={styles.circle}
          hitSlop={8}
          accessibilityLabel="Share"
        >
          <Ionicons name="share-social-outline" size={20} color={swipe.ink} />
        </Pressable>
      </View>
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
  topTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: swipe.ink },
  banner: { aspectRatio: 1, borderRadius: 24, overflow: "hidden", backgroundColor: swipe.blueDeep, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 30, lineHeight: 35, fontWeight: "800", color: swipe.ink, marginTop: 18 },
  date: { fontSize: 17, color: discover.textDim, marginTop: 6 },
  tileRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  actionTile: { flex: 1, height: 74, borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: discover.line, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 6 },
  actionTileOn: { backgroundColor: swipe.ink, borderColor: swipe.ink },
  actionTileSel: { borderColor: swipe.ink, borderWidth: 2 },
  actionTileText: { color: swipe.ink, fontWeight: "700", fontSize: 14 },
  actionTileTextOn: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.55 },
  saveStatus: { minHeight: 18, marginTop: 10, textAlign: "center", color: discover.muted, fontSize: 12 },
  saveError: { marginTop: 12, gap: 8, alignItems: "center" },
  saveErrorText: { color: "#B3261E", fontSize: 13, textAlign: "center" },
  retry: { color: swipe.ink, fontWeight: "700", textDecorationLine: "underline", paddingVertical: 4 },
  why: { backgroundColor: swipe.lavender, borderRadius: 20, padding: 16, marginTop: 16, borderWidth: 1, borderColor: swipe.lavenderLine },
  whyHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  whyTitle: { flex: 1, fontWeight: "800", fontSize: 16, color: swipe.lavenderText },
  goPill: { backgroundColor: swipe.lavenderText, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  goPillText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  from: { color: swipe.lavenderText, fontSize: 11, fontWeight: "600", marginTop: 8 },
  whyRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 12 },
  tag: { backgroundColor: "#fff", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 1 },
  tagText: { fontSize: 11, fontWeight: "700", color: swipe.lavenderText },
  whyText: { flex: 1, color: swipe.ink, fontSize: 15, lineHeight: 20 },
  tradeoff: { color: discover.textDim, fontSize: 13, marginTop: 14 },
  seeHow: { color: swipe.lavenderText, fontWeight: "700", marginTop: 12 },
  sectionHead: { marginTop: 28, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#C9C5BB" },
  sectionLabel: { fontSize: 16, color: discover.muted, fontWeight: "600" },
  locRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginTop: 14 },
  locTitle: { fontSize: 19, fontWeight: "700", color: swipe.ink },
  locSub: { color: discover.muted, fontSize: 15, marginTop: 3 },
  hostRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  hostName: { flex: 1, fontSize: 18, fontWeight: "600", color: swipe.ink },
  faces: { flexDirection: "row", marginTop: 14 },
  face: { borderRadius: 22, borderWidth: 2, borderColor: swipe.cream },
  goingNames: { color: discover.muted, fontSize: 15, lineHeight: 21, marginTop: 10 },
  agentCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 16, padding: 14, marginTop: 24, borderWidth: 1, borderColor: discover.pill },
  agentTitle: { fontWeight: "700", fontSize: 15, color: swipe.ink },
  agentSub: { color: discover.muted, fontSize: 13, marginTop: 2 },
  soon: { backgroundColor: "#fff", borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: "#D9D5CC" },
  soonText: { color: swipe.ink, fontWeight: "700", fontSize: 14 },
  about: { color: swipe.ink, fontSize: 17, lineHeight: 26, marginTop: 14 },
});
