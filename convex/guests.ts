import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const listForEvent = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) =>
    (await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).collect()).map(({ _id, _creationTime, ...rest }) => rest),
});

export const setNudge = internalMutation({
  args: { eventId: v.string(), personaId: v.string(), nudge: v.any() },
  handler: async (ctx, args) => {
    const g = await ctx.db.query("guests").withIndex("by_event_persona", (q) => q.eq("eventId", args.eventId).eq("personaId", args.personaId)).unique();
    if (!g) return;
    await ctx.db.patch(g._id, { nudge: args.nudge });
  },
});
