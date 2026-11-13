import React, { useMemo, useRef, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { Avatar, Skeleton } from "@/components/ui";
import { useViewer } from "@/hooks/useViewer";
import { discover, swipe } from "@/theme/swipeTheme";

type ShortlistItem = {
  personaId: string;
  name: string;
  initials: string;
  color: string;
  reason: string;
  available: boolean;
  hop: 1 | 2;
  via?: string;
  selected: boolean;
};
type Section = { key: string; title: string; data: ShortlistItem[] };

/**
 * The host's fixed picks screen (claude.md §9.3 Screen 5). Pins live separately from `selected`
 * (see schema.ts's pinnedGuestIds comment) because rank_guests rewrites `shortlist` wholesale on
 * every re-rank — storing the host's choice anywhere on the item itself would get clobbered.
 */
export default function PickGuests() {
  const { viewerId } = useViewer();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const event = useQuery(api.events.getByEventId, { eventId });
  const setPinnedGuests = useMutation(api.events.setPinnedGuests);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState<Set<string> | null>(null);

  // Local set seeds from the server once per load, then owns the UI — toggling must feel instant
  // and can't wait on a round trip for every tap.
  const serverPinned = event?.pinnedGuestIds;
  const effectivePinned = pinned ?? new Set(serverPinned ?? []);

  if (event === undefined) {
    return <View style={{ padding: 20, paddingTop: 70, gap: 14 }}><Skeleton height={60} /><Skeleton height={80} /><Skeleton height={80} /></View>;
  }
  if (!event) return <Text style={styles.notice}>Event not found.</Text>;
  if (viewerId !== event.hostId) return <Text style={styles.notice}>This is the host's screen.</Text>;

  const shortlist = (event.shortlist ?? []) as ShortlistItem[];
  if (shortlist.length === 0) {
    return <Text style={styles.notice}>Muse is still building the plan for this event. Check back once the shortlist is ready.</Text>;
  }

  const limit = event.settings?.quota ?? 15;
  const count = effectivePinned.size;

  const toggle = (personaId: string) => {
    const next = new Set(effectivePinned);
    if (next.has(personaId)) next.delete(personaId);
    else next.add(personaId);
    setPinned(next);
  };

  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await setPinnedGuests({ eventId, personaIds: Array.from(effectivePinned) });
      router.back();
    } catch (e) {
      // Fall through silently rather than stranding the host on this screen — the toggle state
      // is still correct locally, so a retry just means tapping save again.
      console.warn(e instanceof ConvexError ? e.data : e);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace(`/events/${eventId}/manage`))} style={styles.backRow} hitSlop={8}>
          <Ionicons name="chevron-back" size={16} color={discover.muted} />
          <Text style={styles.crumb}>Manage</Text>
        </Pressable>
        <Text style={styles.title}>Pick your guests</Text>
        <View style={styles.countRow}>
          <Text style={styles.countText}>{count} of {limit} picked</Text>
          <Text style={styles.countSub}>
            {/* "the last N" only reads right once some are picked — at zero Muse is choosing the
                whole guest list, and saying "the last 12" there is just wrong. */}
            {count === 0
              ? `Muse is choosing all ${limit}. Pick anyone you definitely want and it fills the rest.`
              : count < limit
                ? `Muse will fill the last ${limit - count} from the shortlist.`
                : "All your picks will be invited, even past the target."}
          </Text>
        </View>
      </View>

      <GuestSections shortlist={shortlist} pinned={effectivePinned} onToggle={toggle} />

      <View style={styles.saveBar}>
        <Pressable
          onPress={() => void save()}
          disabled={busy}
          style={[styles.saveBtn, busy && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Save guest picks"
        >
          <Text style={styles.saveBtnText}>{busy ? "Saving…" : "Save picks"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function GuestSections({ shortlist, pinned, onToggle }: { shortlist: ShortlistItem[]; pinned: Set<string>; onToggle: (id: string) => void }) {
  const sections = useMemo<Section[]>(() => {
    const yours: ShortlistItem[] = [];
    const muse: ShortlistItem[] = [];
    const rest: ShortlistItem[] = [];
    for (const item of shortlist) {
      if (pinned.has(item.personaId)) yours.push(item);
      else if (item.selected) muse.push(item);
      else rest.push(item);
    }
    return [
      { key: "yours", title: "Your picks", data: yours },
      { key: "muse", title: "Muse suggests", data: muse },
      { key: "rest", title: "Everyone else", data: rest },
    ].filter((s) => s.data.length > 0);
  }, [shortlist, pinned]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.personaId}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionCount}>{section.data.length}</Text>
        </View>
      )}
      renderItem={({ item }) => <GuestRow item={item} pinned={pinned.has(item.personaId)} onToggle={onToggle} showReason={pinned.has(item.personaId) === false} />}
      contentContainerStyle={{ paddingBottom: 100 }}
      stickySectionHeadersEnabled
    />
  );
}

function GuestRow({ item, pinned, onToggle, showReason }: { item: ShortlistItem; pinned: boolean; onToggle: (id: string) => void; showReason: boolean }) {
  return (
    <Pressable
      onPress={() => onToggle(item.personaId)}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${pinned ? "picked" : "not picked"}. ${item.reason}`}
    >
      <Avatar initials={item.initials} color={item.color} size={44} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        {showReason && !!item.reason && <Text style={styles.rowReason} numberOfLines={2}>{item.reason}</Text>}
        {(!item.available || item.hop === 2) && (
          <View style={styles.chipRow}>
            {!item.available && <View style={styles.chip}><Text style={styles.chipText}>Busy then</Text></View>}
            {item.hop === 2 && <View style={styles.chip}><Text style={styles.chipText}>via {item.via ?? "a mutual friend"}</Text></View>}
          </View>
        )}
      </View>
      <View style={[styles.toggle, pinned && styles.toggleOn]}>
        {pinned && <Ionicons name="checkmark" size={16} color="#fff" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: discover.bg },
  notice: { padding: 20, paddingTop: 70, color: discover.muted, fontSize: 15 },
  header: { paddingTop: 52, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: discover.bg, borderBottomWidth: 1, borderBottomColor: discover.line },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  crumb: { color: discover.muted, fontSize: 14 },
  title: { color: discover.text, fontSize: 24, fontWeight: "700", marginTop: 8 },
  countRow: { marginTop: 10, gap: 2 },
  countText: { color: discover.text, fontSize: 15, fontWeight: "600" },
  countSub: { color: discover.muted, fontSize: 13 },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", backgroundColor: discover.bg, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  sectionTitle: { color: discover.text, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  sectionCount: { color: discover.muted, fontSize: 13, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: discover.card, borderBottomWidth: 1, borderBottomColor: discover.line },
  rowBody: { flex: 1, gap: 2 },
  rowName: { color: discover.text, fontSize: 16, fontWeight: "600" },
  rowReason: { color: discover.muted, fontSize: 13, lineHeight: 17 },
  chipRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  chip: { backgroundColor: discover.pill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { color: discover.muted, fontSize: 11, fontWeight: "600" },
  toggle: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: discover.line, alignItems: "center", justifyContent: "center" },
  toggleOn: { backgroundColor: swipe.blue, borderColor: swipe.blue },
  saveBar: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: discover.bg, borderTopWidth: 1, borderTopColor: discover.line },
  saveBtn: { backgroundColor: discover.text, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
