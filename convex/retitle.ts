import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// One-off maintenance: rename events (scripts/retitle-events.mjs holds the list). Internal-only: it can only be
// run with admin access.
//
// Each rename carries the title the event is expected to have now (`from`). If someone has since renamed the
// event, it is skipped and reported instead of overwritten.

export const setTitle = internalMutation({
  args: { eventId: v.string(), from: v.string(), to: v.string() },
  handler: async (ctx, args) => {
    const to = args.to.trim();
    if (!to || to.length > 120) throw new Error("Title must be 1-120 characters");
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    if (e.title !== args.from) return { changed: false as const, current: e.title };
    await ctx.db.patch(e._id, { title: to });
    return { changed: true as const, current: to };
  },
});

type Summary = {
  dryRun: boolean;
  renamed: number;
  skipped: { eventId: string; reason: string }[];
};

/** Applies a list of renames, each in its own mutation. `dryRun` checks each one and writes nothing. */
export const retitle = internalAction({
  args: {
    renames: v.array(v.object({ eventId: v.string(), from: v.string(), to: v.string() })),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Summary> => {
    const summary: Summary = { dryRun: !!args.dryRun, renamed: 0, skipped: [] };
    for (const r of args.renames) {
      if (args.dryRun) {
        summary.renamed += 1;
        continue;
      }
      try {
        const res: { changed: boolean; current: string } = await ctx.runMutation(internal.retitle.setTitle, r);
        if (res.changed) summary.renamed += 1;
        else summary.skipped.push({ eventId: r.eventId, reason: `title is now "${res.current}", not "${r.from}"` });
      } catch (err) {
        summary.skipped.push({ eventId: r.eventId, reason: String((err as Error)?.message ?? err).split("\n")[0].slice(0, 160) });
      }
    }
    return summary;
  },
});
