import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Avatar, Skeleton } from "@/components/ui";
import { Mascot } from "@/components/Mascot";
import { GuestInviteControl } from "@/components/events/GuestInviteControl";
import { SpreadControl } from "@/components/events/SpreadControl";
import { HuddleRecovery } from "@/components/events/HuddleRecovery";
import { useViewer } from "@/hooks/useViewer";
import { discover, swipe } from "@/theme/swipeTheme";

type Tab = "overview" | "guests" | "details";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "guests", label: "Guests" },
  { key: "details", label: "Details" },
];
const VIBES = ["Chill", "Lively", "Fancy"];
const FILTERS = ["All", "Going", "Maybe", "Invited", "Not going"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_TEXT: Record<string, { title: string; body: string }> = {
  draft: { title: "Still a draft", body: "Nothing has gone out. Review the details, then send when you're ready." },
  approved: { title: "Ready to send", body: "You've approved the plan. Send it and your friends' Muses will start deciding." },
  sent: { title: "Invites are out", body: "Friends' Muses are working out who it's worth it for." },
};

/**
 * Host's manage page: overview, guest list and a manual edit form. Layout follows Luma's manage screen,
 * in the app's light palette. The Muse button leads back to the planning checklist.
 */
export default function Manage() {
  const { viewerId, canActAsViewer } = useViewer();
  // A real account (fb_) needs a real session before it can change anything. A demo persona
  // picked from the switcher has no session and never will — it IS the demo, and everything else
  // on this screen already treats it that way: it can plan the event, send the invites and retry
  // a huddle. Holding the two permission cards to a stricter rule than the Send button didn't
  // protect anything, it just made them look broken. The server stays the authority either way.
  const canEditHostSettings = canActAsViewer || !viewerId.startsWith("fb_");
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const event = useQuery(api.events.getByEventId, { eventId });
  const guests = useQuery(api.guests.listForEvent, { eventId });
  const personas = useQuery(api.personas.listAll, {});
  const slots = useQuery(api.slots.listPublic, {});
  const venues = useQuery(api.venues.listPublic, {});
  const sendEvent = useMutation(api.events.sendEvent);
  const checklist = useQuery(api.checklist.forEvent, { eventId });
  const [tab, setTab] = useState<Tab>("overview");
  const [sending, setSending] = useState(false);

  if (event === undefined || guests === undefined || personas === undefined || slots === undefined || venues === undefined) {
    return <View style={{ padding: 20, paddingTop: 70, gap: 14 }}><Skeleton height={60} /><Skeleton height={120} /><Skeleton height={120} /></View>;
  }
  if (!event) return <Text style={{ padding: 20, paddingTop: 70, color: discover.muted }}>Event not found.</Text>;

  const slot = slots.find((s) => s.slotId === event.slotId);
  const venue = venues.find((x) => x.venueId === event.venueId);
  const byId = new Map(personas.map((p) => [p.id, p]));
  const capacity = event.capacity ?? venue?.capacity ?? null;
  const going = guests.filter((g) => g.status === "going").length;

  // The Muse bar: "needs attention" while Muse is waiting on the host (a vendor draft to approve, a task that needs
  // an answer) or the invite hasn't gone out yet; "all set" once nothing is waiting.
  const waiting = (checklist?.pendingDrafts?.length ?? 0) + (checklist?.pendingTasks?.length ?? 0) + (checklist?.needsYou ? 1 : 0);
  const status =
    checklist === undefined || checklist === null
      ? { ok: false, title: "Muse", sub: "See what your agent is doing" }
      : waiting > 0
        ? { ok: false, title: "Something needs your attention", sub: waiting === 1 ? "Muse is waiting on 1 thing from you" : `Muse is waiting on ${waiting} things from you` }
        : event.status !== "sent"
          ? { ok: false, title: "Something needs your attention", sub: "Review the plan and send your invites" }
          : { ok: true, title: "You're all set!", sub: "Muse has everything under control" };

  const onSend = async () => {
    setSending(true);
    try {
      const candidateIds = (event.shortlist ?? []).filter((s: any) => s.selected).map((s: any) => s.personaId);
      await sendEvent({ eventId, candidateIds });
      router.push(`/events/${eventId}/swarm`);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/events"))} style={{ flexDirection: "row", alignItems: "center", gap: 2 }} hitSlop={8}>
            <Ionicons name="chevron-back" size={16} color={discover.muted} />
            <Text style={styles.crumb}>Events</Text>
          </Pressable>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
            <Pressable style={styles.iconBtn} onPress={() => router.push(`/events/${eventId}`)} accessibilityLabel="Open event page">
              <Ionicons name="arrow-up-outline" size={18} color={discover.text} style={{ transform: [{ rotate: "45deg" }] }} />
            </Pressable>
          </View>
          {/* Muse says it: the mascot beside a speech bubble, like the recommended-events card. Tap to open the checklist. */}
          <Pressable style={styles.sayRow} onPress={() => router.push(`/new-event/planning?eventId=${eventId}&from=manage`)} accessibilityLabel="Open Muse checklist">
            <View style={{ width: 60, height: 66, justifyContent: "flex-end" }}><Mascot size={60} /></View>
            <View style={[styles.bubble, status.ok && styles.bubbleOk]}>
              <Text style={[styles.bubbleTitle, status.ok && { color: "#14532D" }]}>{status.title}</Text>
              <Text style={[styles.bubbleSub, status.ok && { color: "#2F6B45" }]}>{status.sub}</Text>
            </View>
          </Pressable>
          <View style={styles.tabs}>
            {TABS.map((t) => (
              <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && styles.tabOn]}>
                <Text style={[styles.tabText, tab === t.key && { color: discover.text }]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {tab === "overview" && (
          <>
          {viewerId === event.hostId && <HuddleRecovery key={eventId} eventId={eventId} />}
          <Overview event={event} guests={guests} slotLabel={slot?.label} venue={venue} going={going} sending={sending} onSend={onSend} onEdit={() => setTab("details")} onTranscript={() => router.push(`/events/${eventId}/swarm`)} />
          </>
        )}
        {tab === "guests" && (
          <>
            {/* Both host permissions show for the host whether or not there's a real session;
                without one they render inert (canEdit) rather than vanishing. Hiding them
                withheld nothing — allowSpread and allowGuestInvites are already on the event
                this screen is reading — while making the grants invisible, which is the exact
                problem the spread control was added to fix. Writing still needs a session, and
                the server refuses regardless. */}
            {viewerId === event.hostId && <>
              <GuestInviteControl key={eventId} eventId={eventId} canEdit={canEditHostSettings} hostName={byId.get(event.hostId)?.name}
                enabled={event.allowGuestInvites ?? false} limit={event.settings?.quota || Math.max(12, guests.length)} />
              {/* The other way the event reaches someone the host didn't pick. Both grants live
                  here together so the host can see and change what they agreed to at plan time. */}
              <SpreadControl key={`spread-${eventId}`} eventId={eventId} canEdit={canEditHostSettings}
                hostName={byId.get(event.hostId)?.name} enabled={event.allowSpread ?? false} />
              {/* Only before sending: the pinned shortlist drives who actually gets invited, and once
                  sendEvent has gone out, re-picking it here wouldn't reach or un-invite anyone —
                  this button would just lie about what it does. */}
              {event.status !== "sent" && (
                <Tile icon="people-outline" label="Edit who's invited" onPress={() => router.push(`/events/${eventId}/pick-guests`)} />
              )}
            </>}
            <Guests guests={guests} byId={byId} going={going} capacity={capacity} eventId={eventId} />
          </>
        )}
        {tab === "details" && <Details event={event} slots={slots} venues={venues} />}
      </ScrollView>
    </View>
  );
}

function Overview({ event, guests, slotLabel, venue, going, sending, onSend, onEdit, onTranscript }: any) {
  const status = STATUS_TEXT[event.status] ?? STATUS_TEXT.draft;
  const fb = { fun: 0, meh: 0, skip: 0 } as Record<string, number>;
  guests.forEach((g: any) => { if (g.feedback) fb[g.feedback] += 1; });
  const fbTotal = fb.fun + fb.meh + fb.skip;
  const sent = event.status === "sent";

  return (
    <View style={styles.body}>
      <View style={styles.statusRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h2}>{status.title}</Text>
          <Text style={styles.muted}>{status.body}</Text>
        </View>
      </View>
      <Pressable style={[styles.primary, sent && styles.primaryLight]} onPress={sent ? onTranscript : onSend} disabled={sending}>
        <Text style={[styles.primaryText, sent && styles.primaryLightText]}>{sent ? "View invites" : sending ? "Sending…" : "Send invites"}</Text>
      </Pressable>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardLabel}>EVENT RECAP</Text>
          <Pressable onPress={onEdit} hitSlop={10} accessibilityLabel="Edit details"><Ionicons name="pencil-outline" size={16} color={discover.muted} /></Pressable>
        </View>
        <RecapRow icon="calendar-outline" text={slotLabel ?? "Date to be confirmed"} />
        <RecapRow icon="location-outline" text={venue ? `${venue.name}, ${venue.area}` : "Venue to be confirmed"} />
        <RecapRow icon="person-outline" text={`${going} going · ${guests.length} invited`} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>FEEDBACK</Text>
        {fbTotal === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubble-ellipses-outline" size={34} color={discover.muted} />
            <Text style={styles.emptyTitle}>No feedback yet</Text>
            <Text style={styles.muted}>Guests can say how it went once the event is over.</Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 24, marginTop: 14 }}>
            {(["fun", "meh", "skip"] as const).map((k) => (
              <View key={k}><Text style={styles.stat}>{fb[k]}</Text><Text style={styles.muted}>{k}</Text></View>
            ))}
          </View>
        )}
      </View>

      <Text style={[styles.h2, { marginTop: 8 }]}>Invites</Text>
      <View style={styles.card}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Ionicons name="mail-outline" size={30} color={discover.muted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.emptyTitle}>{guests.length ? `${guests.length} guests invited` : "No invites sent"}</Text>
            <Text style={styles.muted}>{guests.length ? "Each one has a personal reason why Muse picked them." : "Send the event to start inviting."}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function RecapRow({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }) {
  return (
    <View style={styles.recapRow}>
      <Ionicons name={icon} size={18} color={discover.muted} />
      <Text style={styles.recapText}>{text}</Text>
    </View>
  );
}

function Guests({ guests, byId, going, capacity, eventId }: any) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const maybe = guests.filter((g: any) => g.status === "maybe").length;
  const invited = guests.filter((g: any) => g.status === "invited").length;
  const declined = guests.filter((g: any) => g.status === "cant" || g.status === "skip").length;
  const denom = Math.max(capacity ?? 0, guests.length, 1);

  const shown = useMemo(
    () =>
      guests.filter((g: any) => {
        if (q && !g.name.toLowerCase().includes(q.toLowerCase())) return false;
        if (filter === "Going") return g.status === "going";
        if (filter === "Maybe") return g.status === "maybe";
        if (filter === "Invited") return g.status === "invited";
        if (filter === "Not going") return g.status === "cant" || g.status === "skip";
        return true;
      }),
    [guests, q, filter],
  );

  return (
    <View style={styles.body}>
      <Text style={styles.h2}>At a glance</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={styles.big}><Text style={{ color: "#2F9E44" }}>{going}</Text> <Text style={styles.bigSub}>Going</Text></Text>
        {capacity ? <Text style={styles.muted}>cap <Text style={styles.capNum}>{capacity}</Text></Text> : null}
      </View>
      <View style={styles.bar}>
        <View style={{ flex: going, backgroundColor: "#2F9E44" }} />
        <View style={{ flex: maybe, backgroundColor: "#F0A202" }} />
        <View style={{ flex: invited, backgroundColor: "#B7B2A8" }} />
        <View style={{ flex: Math.max(denom - going - maybe - invited, 0), backgroundColor: discover.pill }} />
      </View>
      <Text style={styles.muted}>{maybe} maybe · {invited} waiting to answer · {declined} not going</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 16 }}>
        <Tile icon="document-text-outline" label="Event page" onPress={() => router.push(`/events/${eventId}`)} />
        <Tile icon="chatbubbles-outline" label="Live transcript" onPress={() => router.push(`/events/${eventId}/transcript`)} />
        <Tile icon="sparkles-outline" label="Muse" onPress={() => router.push(`/new-event/planning?eventId=${eventId}&from=manage`)} />
      </ScrollView>

      <Text style={styles.h2}>Guest list</Text>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={discover.muted} />
        <TextInput style={styles.searchInput} placeholder="Search" placeholderTextColor={discover.muted} value={q} onChangeText={setQ} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipOn]}>
            <Text style={[styles.chipText, filter === f && { color: "#fff" }]}>{f}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.listCard}>
        {shown.length === 0 ? (
          <Text style={[styles.muted, { padding: 16 }]}>No guests match.</Text>
        ) : (
          shown.map((g: any, i: number) => {
            const p = byId.get(g.personaId ?? "");
            return (
              <View key={`${g.personaId ?? g.name}-${i}`} style={[styles.guestRow, i > 0 && styles.guestDivider]}>
                <Avatar initials={p?.initials ?? g.name[0]} color={p?.color ?? "#9AA0A6"} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.guestName}>{g.name}</Text>
                  {p?.job ? <Text style={styles.muted} numberOfLines={1}>{p.job}</Text> : null}
                </View>
                <StatusPill status={g.status} />
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string, string]> = {
    going: ["Going", "#DCFCE7", "#1F7A3A"],
    maybe: ["Maybe", "#FEF3C7", "#8A5A00"],
    invited: ["Invited", discover.pill, discover.muted],
    cant: ["Not going", "#FDE2E2", "#B4233F"],
    skip: ["Not going", "#FDE2E2", "#B4233F"],
  };
  const [label, bg, fg] = map[status] ?? map.invited;
  return <View style={[styles.pill, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{label}</Text></View>;
}

function Tile({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <View style={styles.tileIcon}><Ionicons name={icon} size={20} color={swipe.blue} /></View>
      <Text style={styles.tileText}>{label}</Text>
    </Pressable>
  );
}

function Details({ event, slots, venues }: any) {
  const update = useMutation(api.manage.updateDetails);
  const initial = useMemo(
    () => ({
      title: event.title as string,
      slotId: (event.slotId ?? "") as string,
      venueId: (event.venueId ?? "") as string,
      vibe: (event.answers?.vibe ?? "") as string,
      capacity: event.capacity != null ? String(event.capacity) : "",
      description: (event.description ?? "") as string,
    }),
    [event.title, event.slotId, event.venueId, event.answers?.vibe, event.capacity, event.description],
  );
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  // Pick up changes made elsewhere (e.g. after a save) unless the host is mid-edit.
  useEffect(() => setForm(initial), [initial]);

  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).filter((k) => form[k] !== initial[k]);
  const set = (k: keyof typeof initial, v: string) => { setNote(null); setForm((f) => ({ ...f, [k]: v })); };

  const save = async () => {
    const patch: Record<string, unknown> = {};
    dirty.forEach((k) => {
      if (k === "capacity") patch.capacity = Number(form.capacity);
      else patch[k] = form[k];
    });
    if ("capacity" in patch && (form.capacity.trim() === "" || Number.isNaN(patch.capacity))) {
      setNote({ ok: false, text: "Capacity needs to be a whole number." });
      return;
    }
    setSaving(true);
    try {
      await update({ eventId: event.eventId, patch: patch as any });
      setNote({ ok: true, text: "Saved." });
    } catch (e: any) {
      const msg = String(e?.message ?? "").split("\n")[0].replace(/^.*Uncaught Error:\s*/, "");
      setNote({ ok: false, text: msg || "Couldn't save. Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.body}>
      <Text style={styles.h2}>Event details</Text>
      <Text style={[styles.muted, { marginBottom: 14 }]}>Edit anything by hand. Your guests see changes straight away.</Text>

      <Text style={styles.fieldLabel}>Title</Text>
      <TextInput style={styles.field} value={form.title} onChangeText={(v) => set("title", v)} placeholder="Event title" placeholderTextColor={discover.muted} />

      <Text style={styles.fieldLabel}>Date</Text>
      <Text style={styles.dateText}>{slots.find((x: any) => x.slotId === form.slotId)?.label ?? "Date to be confirmed"}</Text>

      <Text style={styles.fieldLabel}>Venue</Text>
      <View style={{ gap: 8 }}>
        {venues.map((x: any) => (
          <Pressable key={x.venueId} onPress={() => set("venueId", x.venueId)} style={[styles.venue, form.venueId === x.venueId && styles.venueOn]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.venueName}>{x.name}</Text>
              <Text style={styles.muted}>{x.area} · fits {x.capacity} · {x.note}</Text>
            </View>
            {form.venueId === x.venueId && <Ionicons name="checkmark-circle" size={20} color={discover.text} />}
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Vibe</Text>
      <View style={styles.wrap}>
        {[...new Set([...VIBES, form.vibe].filter(Boolean))].map((vb) => (
          <Pressable key={vb} onPress={() => set("vibe", vb)} style={[styles.chip, form.vibe === vb && styles.chipOn]}>
            <Text style={[styles.chipText, form.vibe === vb && { color: "#fff" }]}>{vb}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Capacity</Text>
      <TextInput style={styles.field} value={form.capacity} onChangeText={(v) => set("capacity", v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="Defaults to the venue's capacity" placeholderTextColor={discover.muted} />

      <Text style={styles.fieldLabel}>Description</Text>
      <TextInput style={[styles.field, { minHeight: 110, textAlignVertical: "top" }]} multiline value={form.description} onChangeText={(v) => set("description", v)} placeholder="What should guests know?" placeholderTextColor={discover.muted} />

      {note && <Text style={{ color: note.ok ? "#1F7A3A" : "#B4233F", marginTop: 12 }}>{note.text}</Text>}
      <Pressable style={[styles.primary, (dirty.length === 0 || saving) && { opacity: 0.4 }]} onPress={save} disabled={dirty.length === 0 || saving}>
        <Text style={styles.primaryText}>{saving ? "Saving…" : dirty.length ? `Save ${dirty.length} change${dirty.length === 1 ? "" : "s"}` : "No changes"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: discover.bg },
  header: { paddingTop: 52, paddingHorizontal: 20, backgroundColor: discover.bg, borderBottomWidth: 1, borderBottomColor: discover.line },
  crumb: { color: discover.muted, fontSize: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 },
  title: { flex: 1, color: discover.text, fontSize: 28, lineHeight: 33, fontWeight: "800" },
  iconBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: discover.pill, alignItems: "center", justifyContent: "center" },
  sayRow: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginTop: 14 },
  bubble: { flex: 1, backgroundColor: swipe.lavender, borderRadius: 22, borderBottomLeftRadius: 6, paddingHorizontal: 16, paddingVertical: 14 },
  bubbleOk: { backgroundColor: "#DCFCE7" },
  bubbleTitle: { color: swipe.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  bubbleSub: { color: swipe.lavenderText, fontSize: 14, marginTop: 2 },
  tabs: { flexDirection: "row", gap: 6, marginTop: 14 },
  tab: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: discover.text },
  tabText: { color: discover.muted, fontWeight: "700", fontSize: 15 },
  body: { padding: 20, gap: 14 },
  statusRow: { flexDirection: "row", alignItems: "center" },
  h2: { color: discover.text, fontSize: 20, fontWeight: "800" },
  muted: { color: discover.muted, fontSize: 14, lineHeight: 19 },
  primary: { backgroundColor: discover.text, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4 },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  primaryLight: { backgroundColor: discover.card, borderWidth: 1, borderColor: discover.line },
  primaryLightText: { color: discover.text, fontWeight: "600" },
  card: { backgroundColor: discover.card, borderRadius: 18, borderWidth: 1, borderColor: discover.line, padding: 16 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardLabel: { color: discover.muted, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  recapRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  recapText: { color: discover.text, fontSize: 16 },
  empty: { alignItems: "center", gap: 6, paddingVertical: 14 },
  emptyTitle: { color: discover.text, fontSize: 16, fontWeight: "700" },
  stat: { color: discover.text, fontSize: 28, fontWeight: "800" },
  big: { fontSize: 40, fontWeight: "800" },
  bigSub: { color: discover.text, fontSize: 22, fontWeight: "600" },
  capNum: { color: discover.text, fontSize: 24, fontWeight: "700" },
  bar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: discover.pill, marginVertical: 8 },
  tile: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: discover.card, borderRadius: 14, borderWidth: 1, borderColor: discover.line, paddingHorizontal: 14, paddingVertical: 12 },
  tileIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: "#E6E9FF", alignItems: "center", justifyContent: "center" },
  tileText: { color: discover.text, fontWeight: "700", fontSize: 15 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: discover.card, borderRadius: 14, borderWidth: 1, borderColor: discover.line, paddingHorizontal: 14 },
  searchInput: { flex: 1, paddingVertical: 12, color: discover.text, fontSize: 16 },
  chip: { backgroundColor: discover.card, borderWidth: 1, borderColor: discover.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { backgroundColor: discover.text, borderColor: discover.text },
  dateText: { color: discover.text, fontWeight: "700", fontSize: 17 },
  chipText: { color: discover.text, fontWeight: "600", fontSize: 14 },
  listCard: { backgroundColor: discover.card, borderRadius: 18, borderWidth: 1, borderColor: discover.line, overflow: "hidden" },
  guestRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  guestDivider: { borderTopWidth: 1, borderTopColor: discover.line },
  guestName: { color: discover.text, fontSize: 16, fontWeight: "700" },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  fieldLabel: { color: discover.muted, fontWeight: "800", fontSize: 12, letterSpacing: 1, marginTop: 14, marginBottom: 8, textTransform: "uppercase" },
  field: { backgroundColor: discover.card, borderWidth: 1, borderColor: discover.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, color: discover.text, fontSize: 16 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  venue: { flexDirection: "row", alignItems: "center", backgroundColor: discover.card, borderWidth: 1, borderColor: discover.line, borderRadius: 14, padding: 14 },
  venueOn: { borderColor: discover.text, borderWidth: 2 },
  venueName: { color: discover.text, fontWeight: "700", fontSize: 16 },
});
