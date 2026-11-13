import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { allowedAs, getCaller } from "./authz";

/** The client subscription that replaces the old NDJSON stream: each insertMessage commit below
 * automatically re-pushes the updated array to every subscribed client, live. */
export const messagesForEvent = query({
  args: { eventId: v.string(), forPersona: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // A person sees the huddle messages addressed to them. The full transcript belongs to whoever
    // can act as the host; for a seeded demo host anyone may read it, minus messages involving a
    // real (fb_) user other than the caller. Empty (not an error) otherwise.
    let hideOtherRealUsers = false;
    let callerId: string | null = null;
    if (args.forPersona) {
      if (!(await allowedAs(ctx, args.forPersona, "read", "huddleData.messagesForEvent"))) return [];
    } else {
      const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
      if (!e || !(await allowedAs(ctx, e.hostId, "read", "huddleData.messagesForEvent"))) return [];
      hideOtherRealUsers = !(await allowedAs(ctx, e.hostId, "write", "huddleData.messagesForEvent"));
      callerId = (await getCaller(ctx)).callerId;
    }
    const isOtherRealUser = (id: string) => id.startsWith("fb_") && id !== callerId;
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
    return rows
      .filter((m) => !hideOtherRealUsers || ![m.forPersona, m.fromPersona, m.toPersona].some(isOtherRealUser))
      .map(({ _id, _creationTime, ...rest }) => rest);
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
