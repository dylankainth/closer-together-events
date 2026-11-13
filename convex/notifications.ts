// `query` comes straight from the `convex/server` package rather than the generated
// `./_generated/server` re-export: that generated file only resolves under Convex's own bundler
// (moduleResolution "bundler"), not under the plain Node ESM loader the test runner uses, so a
// test importing this module for buildNotifications alone would fail before reaching it. Convex's
// generated `query` is just `queryGeneric` under the hood (see _generated/server.js), so this is
// the same function, not a workaround with different behaviour.
import { queryGeneric as query } from "convex/server";
import { v } from "convex/values";
import { requireActor } from "./authz";
import { canOfferInvite, eligibleFriend, type InviteEvent, type InviteGuest, type InvitePerson } from "./plusOnePolicy";

// In-app notifications centre. There is no notifications table (claude.md's "no new tables and
// no new writes" constraint) — every row here is derived, live, from data that already exists:
// guests (invites, nudges), events (hosting, allowGuestInvites), and huddleMessages (replies).
// Nothing is marked "read" anywhere; `read` is always false because there is nowhere to persist it.

export type NotificationKind = "invite" | "nudge" | "plusOne" | "huddle";

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  eventId: string;
  ts: number;
  read: boolean;
};

const first = (name: string) => name.split(" ")[0];

/**
 * Pure shaping step, importable without Convex: sorts newest-first and drops exact-id duplicates
 * (defensive — callers should not produce them, but a sort-only contract is easy to break later).
 */
export function buildNotifications(rows: NotificationRow[]): NotificationRow[] {
  const seen = new Set<string>();
  const deduped = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  return deduped.sort((a, b) => b.ts - a.ts);
}

/** Minimal persona shape plusOnePolicy's pure functions need, read straight off the personas table. */
function toInvitePerson(p: any): InvitePerson {
  return {
    personaId: p.personaId,
    name: p.name,
    initials: p.initials,
    friends: p.friends,
    hasMuse: p.hasMuse,
    availability: p.availability,
    settings: { talkToMuses: p.settings?.talkToMuses ?? false, nudgesOn: p.settings?.nudgesOn ?? false },
  };
}

export const forViewer = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    await requireActor(ctx, args.personaId, "read", "notifications.forViewer");
    const viewerId = args.personaId;

    const [allGuests, allEvents, allPersonas] = await Promise.all([
      ctx.db.query("guests").collect(),
      ctx.db.query("events").collect(),
      ctx.db.query("personas").collect(),
    ]);
    const eventsById = new Map(allEvents.map((e: any) => [e.eventId as string, e]));
    const personasById = new Map(allPersonas.map((p: any) => [p.personaId as string, p]));

    const rows: NotificationRow[] = [];

    // --- My own guest rows: new invites, and any nudge my Muse already produced for one. ---
    const myRows = allGuests.filter((g: any) => g.personaId === viewerId);
    for (const g of myRows) {
      const event = eventsById.get(g.eventId as string);
      if (!event) continue;
      const hostName = personasById.get(event.hostId as string)?.name ?? "Someone";

      if (g.status === "invited") {
        rows.push({
          id: `invite-${g.eventId}`,
          kind: "invite",
          title: `${first(hostName)} invited you to ${event.title}`,
          body: "Tap to see who's going and reply.",
          eventId: g.eventId as string,
          ts: event.createdAt as number,
          read: false,
        });
      }

      if (g.nudge) {
        rows.push({
          id: `nudge-${g.eventId}`,
          kind: "nudge",
          title: `Your Muse thinks ${event.title} is worth it — here's why`,
          body: g.nudge.reasons[0] ?? g.nudge.text,
          eventId: g.eventId as string,
          // event.createdAt is the best timestamp available without a per-row huddle lookup per
          // nudge (see claude.md §5.4 cost notes — one more query per row isn't worth it here).
          ts: event.createdAt as number,
          read: false,
        });
      }
    }

    // --- Plus-one offer: an event I'm going to that lets me bring a friend, with one available. ---
    const myGoing = myRows.filter((g: any) => g.status === "going");
    for (const g of myGoing) {
      const event = eventsById.get(g.eventId as string);
      if (!event || !event.allowGuestInvites) continue;
      const eventGuests = allGuests.filter((x: any) => x.eventId === g.eventId) as InviteGuest[];
      const inviteEvent: InviteEvent = event as InviteEvent;
      if (!canOfferInvite(inviteEvent, eventGuests, viewerId, event.capacity)) continue;
      const viewer = personasById.get(viewerId);
      const host = personasById.get(event.hostId as string);
      if (!viewer || !host) continue;
      const friend = allPersonas.find((p: any) =>
        eligibleFriend(inviteEvent, eventGuests, toInvitePerson(viewer), toInvitePerson(host), toInvitePerson(p)),
      );
      if (!friend) continue;
      rows.push({
        id: `plusOne-${g.eventId}`,
        kind: "plusOne",
        title: `Bring a friend to ${event.title}`,
        body: `You can invite ${friend.name} to join you.`,
        eventId: g.eventId as string,
        ts: event.createdAt as number,
        read: false,
      });
    }

    // --- Host-only: my friends' Muses have finished answering for an event I'm hosting. ---
    const hostedEvents = allEvents.filter((e: any) => e.hostId === viewerId);
    for (const event of hostedEvents) {
      const messages = await ctx.db
        .query("huddleMessages")
        .withIndex("by_eventId_seq", (q) => q.eq("eventId", event.eventId as string))
        .collect();
      const replies = messages.filter((m: any) => m.kind === "reply" && m.status !== "blocked");
      if (replies.length === 0) continue;
      const answered = new Set(replies.map((m: any) => m.forPersona as string));
      const latestTs = replies.reduce((max: number, m: any) => Math.max(max, m.ts as number), event.createdAt as number);
      // Lead with the OUTCOME, not the activity. A host with several events otherwise gets a
      // column of identical "13 of your friends' Muses have answered" rows that carry no
      // information and read like the screen is broken — which is exactly how it looked on device.
      const upForIt = allGuests.filter(
        (g: any) => g.eventId === event.eventId && (g.status === "going" || g.nudge?.verdict === "worth"),
      ).length;
      rows.push({
        id: `huddle-${event.eventId}`,
        kind: "huddle",
        title: upForIt > 0 ? `${upForIt} up for ${event.title}` : `Your Muses have answered on ${event.title}`,
        body: `${answered.size} of your friends' Muses have weighed in. See how it's going.`,
        eventId: event.eventId as string,
        ts: latestTs,
        read: false,
      });
    }

    return buildNotifications(rows);
  },
});
