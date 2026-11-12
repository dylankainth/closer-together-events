import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Read layer for the recommended-events swipe stack, the guest event page and the general feed.
//
// Why this file exists: the screens should depend on ONE stable per-viewer shape (EventView /
// EventDetail below) and not on how the `events`/`guests` tables are laid out. Event creation is
// being reworked, so everything that is derived (spots left, mutuals, "via", match %, reason
// chips) is computed here from the tables as they are today, and only here.

const REMIND_LATER_MS = 60 * 60 * 1000; // "remind me later" snoozes a recommendation for an hour

type Relation = "hosting" | "invited" | "responded" | "discover";

const first = (name: string) => name.split(" ")[0];

async function loadWorld(ctx: any) {
  const [events, guests, personas, venues, slots] = await Promise.all([
    ctx.db.query("events").collect(),
    ctx.db.query("guests").collect(),
    ctx.db.query("personas").collect(),
    ctx.db.query("venues").collect(),
    ctx.db.query("slots").collect(),
  ]);
  return {
    events: events as any[],
    guests: guests as any[],
    personas: new Map<string, any>(personas.map((p: any) => [p.personaId, p])),
    venues: new Map<string, any>(venues.map((x: any) => [x.venueId, x])),
    slots: new Map<string, any>(slots.map((s: any) => [s.slotId, s])),
  };
}

type World = Awaited<ReturnType<typeof loadWorld>>;

function person(w: World, id: string | undefined) {
  const p = id ? w.personas.get(id) : undefined;
  return p ? { id: p.personaId as string, name: p.name as string, initials: p.initials as string, color: p.color as string } : null;
}

/**
 * Match % shown on the card. It is a transparent heuristic over real fields, NOT a model output:
 * the guest's nudge verdict (from the huddle), whether they are free in that slot, and how many
 * of their friends are going. Replace with a Muse-produced score if the huddle ever returns one.
 */
function matchPct(verdict: string | undefined, free: boolean | null, friendsGoing: number) {
  const base = verdict === "worth" ? 72 : verdict === "maybe" ? 52 : verdict === "skip" ? 28 : 45;
  const freeBonus = free === null ? 0 : free ? 10 : -15;
  return Math.max(5, Math.min(99, base + freeBonus + Math.min(friendsGoing, 4) * 4));
}

function buildView(w: World, e: any, viewerId: string) {
  const viewer = w.personas.get(viewerId);
  const evGuests = w.guests.filter((g) => g.eventId === e.eventId);
  const mine = evGuests.find((g) => g.personaId === viewerId);
  const going = evGuests.filter((g) => g.status === "going");
  const host = person(w, e.hostId);
  const venue = e.venueId ? w.venues.get(e.venueId) : undefined;
  const slot = e.slotId ? w.slots.get(e.slotId) : undefined;
  const capacity: number | null = venue?.capacity ?? null;

  const friendsGoing = going
    .filter((g) => g.personaId && g.personaId !== viewerId && viewer?.friends?.includes(g.personaId))
    .map((g) => person(w, g.personaId))
    .filter(Boolean) as { id: string; name: string; initials: string; color: string }[];

  const free: boolean | null = viewer && e.slotId ? (viewer.availability ?? []).includes(e.slotId) : null;
  const hosting = e.hostId === viewerId;
  const snoozed = !!mine?.snoozedUntil && mine.snoozedUntil > Date.now();

  let relation: Relation = "discover";
  if (hosting) relation = "hosting";
  else if (mine) relation = mine.status === "invited" ? "invited" : "responded";

  return {
    eventId: e.eventId as string,
    title: e.title as string,
    status: e.status as string,
    poster: e.poster?.url ? { url: e.poster.url as string } : null,
    host,
    slotLabel: (slot?.label as string | undefined) ?? null,
    venue: venue ? { name: venue.name as string, area: venue.area as string } : null,
    priceTier: (e.answers?.budget ?? null) as 1 | 2 | 3 | null,
    vibe: (e.answers?.vibe ?? null) as string | null,
    goingCount: going.length,
    capacity,
    spotsLeft: capacity === null ? null : Math.max(0, capacity - going.length),
    relation,
    myStatus: (mine?.status ?? null) as string | null,
    snoozed,
    goIfFriend: (mine?.goIfFriend ?? null) as string | null,
    verdict: (mine?.nudge?.verdict ?? null) as "worth" | "maybe" | "skip" | null,
    reasons: (mine?.nudge?.reasons ?? []) as string[],
    matchPct: mine ? matchPct(mine.nudge?.verdict, free, friendsGoing.length) : null,
    friendsGoing: friendsGoing.slice(0, 3),
    createdAt: e.createdAt as number,
  };
}

/**
 * Everything the Events surfaces need for one viewer, in two lists:
 *  - recommended: events I'm invited to and haven't answered (and haven't snoozed), best match first.
 *    This is the swipe stack.
 *  - feed: everything else I can see, newest first (events I host, ones I've answered, discoverable).
 */
export const forViewer = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    const w = await loadWorld(ctx);
    const visible = w.events.filter((e) => e.status === "sent" || e.hostId === args.personaId);
    const views = visible.map((e) => buildView(w, e, args.personaId));

    const recommended = views
      .filter((x) => x.relation === "invited" && !x.snoozed && x.verdict !== "skip")
      .sort((a, b) => (b.matchPct ?? 0) - (a.matchPct ?? 0));
    const recIds = new Set(recommended.map((x) => x.eventId));
    const feed = views.filter((x) => !recIds.has(x.eventId)).sort((a, b) => b.createdAt - a.createdAt);
    return { recommended, feed };
  },
});

const TAG_TO_KIND: Record<string, "people" | "goal" | "fit"> = {
  close_friend: "people",
  new_people: "people",
  shared_interest: "goal",
  free_time: "fit",
  busy: "fit",
  no_fit: "fit",
};

/** Full event page for one viewer: the view above plus reasoning, attendees and agent suggestions. */
export const detail = query({
  args: { eventId: v.string(), personaId: v.string() },
  handler: async (ctx, args) => {
    const w = await loadWorld(ctx);
    const e = w.events.find((x) => x.eventId === args.eventId);
    if (!e) return null;
    const viewer = w.personas.get(args.personaId);
    const view = buildView(w, e, args.personaId);
    const evGuests = w.guests.filter((g) => g.eventId === e.eventId);

    // Why-you chips: the viewer's own Muse replies from the huddle, grouped by what they're about.
    const msgs = await ctx.db
      .query("huddleMessages")
      .withIndex("by_event_forPersona", (q: any) => q.eq("eventId", e.eventId).eq("forPersona", args.personaId))
      .collect();
    const replies = msgs.flatMap((m) =>
      m.kind === "reply" && m.reply && m.status !== "blocked" ? [{ fromPersona: m.fromPersona, reply: m.reply }] : [],
    );
    const chips: { kind: "people" | "goal" | "fit"; text: string }[] = [];
    const seen = new Set<string>();
    for (const m of replies) {
      const kind = TAG_TO_KIND[m.reply.reason_tag] ?? "fit";
      const text = String(m.reply.why ?? "").trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      chips.push({ kind, text });
    }
    // Fall back to the nudge's own reasons so the card is never empty before/without a huddle.
    if (chips.length === 0) view.reasons.forEach((text, i) => chips.push({ kind: (["people", "goal", "fit"] as const)[i % 3], text }));

    const tradeoff = replies.find((m) => m.reply.reason_tag === "busy" || m.reply.reason_tag === "no_fit")?.reply.why ?? null;

    // Who's going, with how the viewer knows them: friend / N mutuals / via X.
    const attendees = evGuests
      .filter((g) => g.status === "going")
      .map((g) => {
        const p = g.personaId ? w.personas.get(g.personaId) : undefined;
        let tag = "";
        if (p && viewer && p.personaId !== viewer.personaId) {
          if (viewer.friends.includes(p.personaId)) tag = "Friend";
          else {
            const mutual = (p.friends as string[]).filter((f) => viewer.friends.includes(f)).length;
            if (mutual > 0) tag = `${mutual} mutual${mutual === 1 ? "" : "s"}`;
            else if (p.via) tag = `via ${first(w.personas.get(p.via)?.name ?? p.via)}`;
          }
        }
        return {
          personaId: (g.personaId ?? null) as string | null,
          name: g.name as string,
          initials: (p?.initials ?? String(g.name).slice(0, 1).toUpperCase()) as string,
          color: (p?.color ?? "#9AA0A6") as string,
          tag,
        };
      })
      .sort((a, b) => Number(b.tag === "Friend") - Number(a.tag === "Friend"));

    // "Bring a friend": one of my friends with a Muse who isn't on the list and is free that slot.
    const onList = new Set(evGuests.map((g) => g.personaId).filter(Boolean));
    const plusOne = viewer
      ? [...w.personas.values()].find(
          (p) =>
            viewer.friends.includes(p.personaId) &&
            p.hasMuse &&
            !onList.has(p.personaId) &&
            p.personaId !== e.hostId &&
            (!e.slotId || (p.availability ?? []).includes(e.slotId)),
        )
      : undefined;

    const guestsGoIf = evGuests.find((g) => g.personaId === args.personaId)?.goIfFriend;
    const goIfFriend = guestsGoIf ? person(w, guestsGoIf) : null;
    // Offer "Go if <friend> goes" for the first friend who's going, else any invited friend.
    const candidate = view.friendsGoing[0] ?? null;
    const conditionalOffer =
      candidate ??
      (viewer
        ? person(w, evGuests.find((g) => g.personaId && g.personaId !== args.personaId && viewer.friends.includes(g.personaId))?.personaId)
        : null);

    const about = [
      e.answers?.purpose && e.answers.purpose !== "Other" ? `${e.answers.purpose}.` : null,
      e.answers?.vibe ? `A ${String(e.answers.vibe).toLowerCase()} one.` : null,
      e.audienceRaw && e.audienceRaw !== "my friends" ? `For: ${e.audienceRaw}.` : null,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      ...view,
      about,
      chips,
      tradeoff: tradeoff as string | null,
      twinsCount: new Set(replies.map((m) => m.fromPersona)).size,
      attendees,
      totalGoing: attendees.length,
      goIfOffer: conditionalOffer,
      goIfFriendPerson: goIfFriend,
      plusOne: plusOne ? { personaId: plusOne.personaId as string, name: plusOne.name as string, why: `Free ${view.slotLabel ?? "then"}.` } : null,
    };
  },
});

/**
 * One mutation for every swipe-card / detail-page action, so the UI has a single entry point.
 * Swiping alone never calls this: only an explicit button tap does (ballot B10).
 */
export const respond = mutation({
  args: {
    eventId: v.string(),
    personaId: v.string(),
    action: v.union(v.literal("going"), v.literal("maybe"), v.literal("skip"), v.literal("cant"), v.literal("snooze"), v.literal("goIf")),
    friendId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const g = await ctx.db
      .query("guests")
      .withIndex("by_event_persona", (q: any) => q.eq("eventId", args.eventId).eq("personaId", args.personaId))
      .unique();
    if (!g) throw new Error("You're not on this event's guest list");

    if (args.action === "snooze") {
      await ctx.db.patch(g._id, { snoozedUntil: Date.now() + REMIND_LATER_MS });
    } else if (args.action === "goIf") {
      if (!args.friendId) throw new Error("goIf needs friendId");
      await ctx.db.patch(g._id, { status: "maybe", goIfFriend: args.friendId, snoozedUntil: undefined });
    } else {
      await ctx.db.patch(g._id, { status: args.action, goIfFriend: undefined, snoozedUntil: undefined });
    }
  },
});
