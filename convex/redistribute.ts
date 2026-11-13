import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// One-off maintenance: spread the events one host has over several hosts, so the demo users each have events of
// their own. Internal-only: it can only be run with admin access (scripts/redistribute-hosts.mjs).
//
// For every event that moves:
//  - hostId changes to the new host;
//  - a title that starts with the old host's first name ("Maya's birthday night") is renamed to the new host's
//    ("Sam's birthday night"), so it doesn't read as someone else's event;
//  - the new host is removed from that event's guest list (a host isn't a guest of their own event).
// Guest lists, nudges, drafts and pictures are otherwise left as they are (a picture with the old name printed in
// it can't be edited).

const PAGE = 3; // events are big documents (a shortlist is embedded in each), so read them a few at a time

export const hostedPage = internalQuery({
  args: { hostId: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("events")
      .withIndex("by_hostId", (q) => q.eq("hostId", args.hostId))
      .paginate({ numItems: PAGE, cursor: args.cursor });
    return {
      events: page.page.map((e) => ({ eventId: e.eventId, title: e.title, createdAt: e.createdAt })),
      done: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

const first = (name: string) => name.split(" ")[0];

export const moveEvent = internalMutation({
  args: { eventId: v.string(), newHostId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    const newHost = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", args.newHostId)).unique();
    if (!newHost) throw new Error(`Unknown host ${args.newHostId}`);
    const oldHost = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", e.hostId)).unique();

    let title = e.title;
    if (oldHost) {
      const prefix = `${first(oldHost.name)}'s `;
      if (title.startsWith(prefix)) title = `${first(newHost.name)}'s ${title.slice(prefix.length)}`;
    }
    await ctx.db.patch(e._id, { hostId: args.newHostId, title });

    const asGuest = await ctx.db
      .query("guests")
      .withIndex("by_event_persona", (q) => q.eq("eventId", args.eventId).eq("personaId", args.newHostId))
      .collect();
    for (const g of asGuest) await ctx.db.delete(g._id);
    return { title, removedFromGuestList: asGuest.length };
  },
});

type Summary = {
  dryRun: boolean;
  total: number;
  unchanged: number;
  moved: { eventId: string; to: string; newTitle?: string }[];
  failed: { eventId: string; error: string }[];
};

/**
 * Takes every event hosted by `fromHostId`, oldest first, and deals them out to `toHostIds` in turn (so
 * ["maya","sam","priya","leo"] gives each about a quarter, and an event dealt to the host it already has stays put).
 * Each event moves in its own mutation, so one that can't be written is reported and the rest still go through.
 * `dryRun` reports the plan and writes nothing.
 */
export const redistribute = internalAction({
  args: { fromHostId: v.string(), toHostIds: v.array(v.string()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<Summary> => {
    if (args.toHostIds.length === 0) throw new Error("No hosts given");

    const events: { eventId: string; createdAt: number }[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: { events: { eventId: string; title: string; createdAt: number }[]; done: boolean; cursor: string } = await ctx.runQuery(
        internal.redistribute.hostedPage,
        { hostId: args.fromHostId, cursor },
      );
      events.push(...page.events);
      if (page.done) break;
      cursor = page.cursor;
    }
    events.sort((a, b) => a.createdAt - b.createdAt);

    const summary: Summary = { dryRun: !!args.dryRun, total: events.length, unchanged: 0, moved: [], failed: [] };
    for (let i = 0; i < events.length; i++) {
      const to = args.toHostIds[i % args.toHostIds.length];
      if (to === args.fromHostId) {
        summary.unchanged += 1;
        continue;
      }
      if (args.dryRun) {
        summary.moved.push({ eventId: events[i].eventId, to });
        continue;
      }
      try {
        const r: { title: string } = await ctx.runMutation(internal.redistribute.moveEvent, { eventId: events[i].eventId, newHostId: to });
        summary.moved.push({ eventId: events[i].eventId, to, newTitle: r.title });
      } catch (err) {
        summary.failed.push({ eventId: events[i].eventId, error: String((err as Error)?.message ?? err).split("\n")[0].slice(0, 160) });
      }
    }
    return summary;
  },
});
