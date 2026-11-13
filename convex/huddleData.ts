import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/** The client subscription that replaces the old NDJSON stream: each insertMessage commit below
 * automatically re-pushes the updated array to every subscribed client, live. */
export const messagesForEvent = query({
  args: { eventId: v.string(), forPersona: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.forPersona) {
      const rows = await ctx.db
        .query("huddleMessages")
        .withIndex("by_event_forPersona", (q) => q.eq("eventId", args.eventId).eq("forPersona", args.forPersona!))
        .collect();
      return rows.sort((a, b) => a.seq - b.seq).map(({ _id, _creationTime, ...rest }) => rest);
    }
    const rows = await ctx.db
      .query("huddleMessages")
      .withIndex("by_eventId_seq", (q) => q.eq("eventId", args.eventId))
      .order("asc")
      .collect();
    return rows.map(({ _id, _creationTime, ...rest }) => rest);
  },
});

export const insertMessage = internalMutation({
  args: {
    eventId: v.string(),
    kind: v.union(v.literal("ask"), v.literal("reply")),
    fromPersona: v.string(),
    toPersona: v.string(),
    forPersona: v.string(),
    text: v.string(),
    reply: v.optional(v.any()),
    status: v.union(v.literal("sent"), v.literal("rewritten"), v.literal("blocked")),
    checks: v.array(v.string()),
    source: v.union(v.literal("muse"), v.literal("offline")),
  },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    const seq = (e?.huddleSeq ?? 0) + 1;
    if (e) await ctx.db.patch(e._id, { huddleSeq: seq });
    await ctx.db.insert("huddleMessages", { ...args, ts: Date.now(), seq });
  },
});

export const getEventForHuddle = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    return e ? (({ _id, _creationTime, ...rest }) => rest)(e) : null;
  },
});
