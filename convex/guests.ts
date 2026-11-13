import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { allowedAs, getCaller } from "./authz";
import { isSeeded } from "./authPolicy";

// Who sees what of an event's guest list:
// - whoever can act as the host (the host, or a demo operator for a seeded host): everything;
// - everyone else, for a sent event: every row, but a Muse nudge only on your own row or on
//   seeded demo personas' rows (a real user's nudge is private to them and the host);
// - an unsent event: nothing.
export const listForEvent = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) return [];
    const rows = (await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).collect()).map(
      ({ _id, _creationTime, ...rest }) => rest,
    );
    if (await allowedAs(ctx, e.hostId, "write", "guests.listForEvent")) return rows;
    if (e.status !== "sent") return [];
    const { callerId } = await getCaller(ctx);
    // Same shape for every caller (screens read g.nudge).
    return rows.map((g) => {
      const ownRow = !!g.personaId && g.personaId === callerId;
      const demoRow = !!g.personaId && isSeeded(g.personaId);
      return ownRow || demoRow ? g : { ...g, nudge: undefined };
    });
  },
});

export const setNudge = internalMutation({
  args: { eventId: v.string(), personaId: v.string(), nudge: v.any() },
  handler: async (ctx, args) => {
    const g = await ctx.db.query("guests").withIndex("by_event_persona", (q) => q.eq("eventId", args.eventId).eq("personaId", args.personaId)).unique();
    if (!g) return;
    await ctx.db.patch(g._id, { nudge: args.nudge });
  },
});
