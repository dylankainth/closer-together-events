import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function publicEvent(e: any) {
  const { _id, _creationTime, ...rest } = e;
  return rest;
}

export const getByEventId = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    return e ? publicEvent(e) : null;
  },
});

export const listForHost = query({
  args: { hostId: v.string() },
  handler: async (ctx, args) =>
    (await ctx.db.query("events").withIndex("by_hostId", (q) => q.eq("hostId", args.hostId)).collect()).map(publicEvent),
});

export const listInvitedFor = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    const guestRows = await ctx.db.query("guests").collect();
    const eventIds = new Set(guestRows.filter((g) => g.personaId === args.personaId).map((g) => g.eventId));
    const events = await ctx.db.query("events").collect();
    return events.filter((e) => eventIds.has(e.eventId) && e.hostId !== args.personaId).map(publicEvent);
  },
});

/** "Other events" / "Events in {city}" discover sections. City filtering is a v1 placeholder (no-op). */
export const listDiscoverable = query({
  args: { excludePersonaId: v.string() },
  handler: async (ctx, args) => {
    const events = await ctx.db.query("events").withIndex("by_status", (q) => q.eq("status", "sent")).collect();
    const guestRows = await ctx.db.query("guests").collect();
    const invitedEventIds = new Set(guestRows.filter((g) => g.personaId === args.excludePersonaId).map((g) => g.eventId));
    return events.filter((e) => e.hostId !== args.excludePersonaId && !invitedEventIds.has(e.eventId)).map(publicEvent);
  },
});

export const create = internalMutation({
  args: { event: v.any() },
  handler: async (ctx, args) => ctx.db.insert("events", args.event),
});

export const approve = mutation({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    await ctx.db.patch(e._id, { status: "approved" });
  },
});

export const updateSettings = mutation({
  args: { eventId: v.string(), settings: v.any() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    await ctx.db.patch(e._id, { settings: { ...e.settings, ...args.settings } });
  },
});

export const bumpCalls = internalMutation({
  args: { eventId: v.string(), by: v.number() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) return;
    await ctx.db.patch(e._id, { museCalls: e.museCalls + args.by });
  },
});

/** Sets status to "sent", seeds `guests` rows, then schedules the huddle action so it returns immediately. */
export const sendEvent = mutation({
  args: { eventId: v.string(), candidateIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    const personas = await ctx.db.query("personas").collect();
    for (const pid of args.candidateIds) {
      const existing = await ctx.db.query("guests").withIndex("by_event_persona", (q) => q.eq("eventId", args.eventId).eq("personaId", pid)).unique();
      if (existing) continue;
      const p = personas.find((x) => x.personaId === pid);
      if (!p) continue;
      await ctx.db.insert("guests", { eventId: args.eventId, personaId: pid, name: p.name, kind: "muse", status: "invited" });
    }
    await ctx.db.patch(e._id, { status: "sent" });
    await ctx.scheduler.runAfter(0, internal.huddle.runHuddle, {
      eventId: args.eventId,
      candidateIds: args.candidateIds,
      profileMode: "event_safe",
      codeCheck: true,
    });
  },
});

export const rsvpExternal = mutation({
  args: { eventId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).collect();
    const dup = existing.find((g) => g.kind === "external" && g.name === args.name);
    if (dup) {
      await ctx.db.patch(dup._id, { status: "going" });
      return;
    }
    await ctx.db.insert("guests", { eventId: args.eventId, name: args.name, kind: "external", status: "going" });
  },
});

export const updateRsvp = mutation({
  args: { eventId: v.string(), personaId: v.string(), status: v.union(v.literal("going"), v.literal("maybe"), v.literal("skip"), v.literal("cant")) },
  handler: async (ctx, args) => {
    const g = await ctx.db.query("guests").withIndex("by_event_persona", (q) => q.eq("eventId", args.eventId).eq("personaId", args.personaId)).unique();
    if (!g) throw new Error("Guest not found");
    await ctx.db.patch(g._id, { status: args.status });
  },
});
