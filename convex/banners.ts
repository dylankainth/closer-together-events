import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// One-off maintenance: give every existing event a poster picked at random from a set of banner images.
//
// A poster is stored on the event as `poster: { url, source }`, where `url` is either a link or a
// `data:image/...;base64,...` string (that is exactly what Muse Image posters already are), so the
// banners are written the same way: as data URIs inside the event record. Nothing reads the image files
// at runtime. These functions are internal: they can only be run with admin access (scripts/apply-banners.mjs).

const PAGE = 3; // events are big documents (a shortlist is embedded in each), so read them a few at a time

/** A few event ids at a time, so no single query reads too many bytes. */
export const eventIdsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("events").paginate({ numItems: PAGE, cursor: args.cursor });
    return {
      events: page.page.map((e) => ({ eventId: e.eventId, posterSource: (e.poster?.source ?? null) as "muse" | "offline" | null })),
      done: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

export const setPoster = internalMutation({
  args: { eventId: v.string(), url: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    // source is limited to "muse" | "offline" by the schema; a banner we chose ourselves is not a Muse image.
    await ctx.db.patch(e._id, { poster: { url: args.url, source: "offline" } });
  },
});

type Summary = {
  events: number;
  updated: number;
  keptMuse: number; // events left alone because their poster is a Muse Image
  dryRun: boolean;
  failed: { eventId: string; error: string }[];
  picks: Record<string, number>; // banner index -> how many events got it
};

/**
 * Every event gets one banner, chosen independently at random, EXCEPT events whose poster is a Muse Image: those
 * are kept by default (`replaceMuse: true` overrides), because a Muse-generated poster is part of the demo that
 * Muse powers the core AI. Each event is updated in its own mutation, so one that can't be written (for example
 * a record already near the 1 MB limit) is reported and skipped instead of undoing the rest. `dryRun` picks and
 * reports without writing anything.
 */
export const assignRandom = internalAction({
  args: { banners: v.array(v.string()), dryRun: v.optional(v.boolean()), replaceMuse: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<Summary> => {
    if (args.banners.length === 0) throw new Error("No banners given");

    const events: { eventId: string; posterSource: "muse" | "offline" | null }[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: { events: { eventId: string; posterSource: "muse" | "offline" | null }[]; done: boolean; cursor: string } = await ctx.runQuery(
        internal.banners.eventIdsPage,
        { cursor },
      );
      events.push(...page.events);
      if (page.done) break;
      cursor = page.cursor;
    }

    const summary: Summary = { events: events.length, updated: 0, keptMuse: 0, dryRun: !!args.dryRun, failed: [], picks: {} };
    for (const { eventId, posterSource } of events) {
      if (posterSource === "muse" && !args.replaceMuse) {
        summary.keptMuse += 1;
        continue;
      }
      const i = Math.floor(Math.random() * args.banners.length);
      if (!args.dryRun) {
        try {
          await ctx.runMutation(internal.banners.setPoster, { eventId, url: args.banners[i] });
        } catch (err) {
          summary.failed.push({ eventId, error: String((err as Error)?.message ?? err).split("\n")[0].slice(0, 160) });
          continue;
        }
      }
      summary.updated += 1;
      summary.picks[String(i)] = (summary.picks[String(i)] ?? 0) + 1;
    }
    return summary;
  },
});
