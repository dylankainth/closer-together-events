import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// One-off maintenance: make the existing demo events look lived-in by seeding some people as already going.
// Internal-only: it needs admin access (scripts/seed-going.mjs).
//
// Per event (status "sent" only, never the host): aim for 4-7 people going (deterministic from the event id, and
// never above the event's capacity). Invited guests are flipped to "going" first; if that is not enough, friends of
// the host are added to the guest list as going. The demo viewers (`keepFree`) are never touched, so their own
// invitations stay open to answer in the swipe stack. Safe to re-run: an event that already has enough going is
// left alone, and nobody is ever moved out of going.

const PAGE = 3; // events are big documents, so read them a few at a time

export const eventIdsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("events").paginate({ numItems: PAGE, cursor: args.cursor });
    return { ids: page.page.filter((e) => e.status === "sent").map((e) => e.eventId), done: page.isDone, cursor: page.continueCursor };
  },
});

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

export const seedOne = internalMutation({
  args: { eventId: v.string(), keepFree: v.array(v.string()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) return { eventId: args.eventId, skipped: "not found" as const };
    const free = new Set(args.keepFree);
    const target = Math.min(4 + (hash(args.eventId) % 4), e.capacity ?? 99);

    const guests = await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).collect();
    let going = guests.filter((g) => g.status === "going").length;
    const flipped: string[] = [];
    const added: string[] = [];

    for (const g of guests) {
      if (going >= target) break;
      if (g.status !== "invited" || !g.personaId || g.personaId === e.hostId || free.has(g.personaId)) continue;
      if (!args.dryRun) await ctx.db.patch(g._id, { status: "going" });
      flipped.push(g.personaId);
      going++;
    }

    if (going < target) {
      const host = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", e.hostId)).unique();
      const onList = new Set(guests.map((g) => g.personaId));
      for (const fid of host?.friends ?? []) {
        if (going >= target) break;
        if (fid === e.hostId || free.has(fid) || onList.has(fid)) continue;
        const p = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", fid)).unique();
        if (!p || !p.hasMuse) continue;
        if (!args.dryRun) await ctx.db.insert("guests", { eventId: args.eventId, personaId: fid, name: p.name, kind: "muse", status: "going" });
        added.push(fid);
        going++;
      }
    }
    return { eventId: args.eventId, target, goingNow: going, flipped, added };
  },
});

export const run = internalAction({
  args: { keepFree: v.array(v.string()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{
    dryRun: boolean; events: number;
    results: ({ eventId: string; skipped: string } | { eventId: string; target: number; goingNow: number; flipped: string[]; added: string[] })[];
  }> => {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: { ids: string[]; done: boolean; cursor: string } = await ctx.runQuery(internal.seedGoing.eventIdsPage, { cursor });
      ids.push(...page.ids);
      if (page.done) break;
      cursor = page.cursor;
    }
    const results = [];
    for (const eventId of ids) {
      try {
        results.push(await ctx.runMutation(internal.seedGoing.seedOne, { eventId, keepFree: args.keepFree, dryRun: args.dryRun }));
      } catch (err) {
        results.push({ eventId, skipped: String((err as Error)?.message ?? err).split("\n")[0].slice(0, 160) });
      }
    }
    return { dryRun: !!args.dryRun, events: ids.length, results };
  },
});
