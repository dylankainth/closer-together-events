import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { InviteView } from "./rsvpPage";

/** What the web RSVP page shows: only display fields of an event that has been sent (same rule as
 * events.rsvpExternal), so the link reveals nothing about drafts, guests or Muse context. */
export const inviteView = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, args): Promise<InviteView | null> => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e || e.status !== "sent") return null;
    const host = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", e.hostId)).unique();
    const slot = e.slotId ? await ctx.db.query("slots").withIndex("by_slotId", (q) => q.eq("slotId", e.slotId!)).unique() : null;
    const venue = e.venueId ? await ctx.db.query("venues").withIndex("by_venueId", (q) => q.eq("venueId", e.venueId!)).unique() : null;
    return {
      eventId: e.eventId,
      title: e.title ?? "An event",
      host: host?.name?.split(" ")[0] ?? "Someone",
      when: slot?.label ?? null,
      venue: venue?.name ?? null,
    };
  },
});
