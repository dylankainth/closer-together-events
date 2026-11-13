import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireHost } from "./authz";
import { scheduleHuddle } from "./huddleRuntime";
import { spreadTargets } from "./spreadPolicy";

// Convex half of acceptance-driven spread. The rules themselves are pure and tested in
// spreadPolicy.ts — same split as plusOnePolicy.ts / plusOnes.ts.

/**
 * Turn acceptance-driven spread on or off for one event.
 *
 * Spread was set once, at planning time, from the host's public/private answer, and after that
 * there was no way to see it or take it back. That is a consent grant with no off switch, which is
 * not what claude.md §5.3 asks for — and the host could not even tell it was on. Nothing here is
 * retroactive: turning it off stops future acceptances spreading, and people already invited keep
 * their invite, because withdrawing an invitation somebody has already been shown would be a
 * worse surprise than the one this fixes.
 */
export const setSpread = mutation({
  args: { eventId: v.string(), enabled: v.boolean() },
  handler: async (ctx, { eventId, enabled }) => {
    const event = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).unique();
    await requireHost(ctx, event, "write", "spread.setSpread");
    await ctx.db.patch(event!._id, { allowSpread: enabled });
  },
});

/**
 * Called from the RSVP mutations when someone becomes "going". Inserts the invites and hands the
 * new recipients to the normal huddle, so a spread invite arrives with a real, personal reason
 * rather than a bare notification. Caller has already authorised the RSVP itself.
 */
export async function spreadFromAcceptance(ctx: { db: any; scheduler: any }, eventId: string, accepterId: string) {
  const event = await ctx.db.query("events").withIndex("by_eventId", (q: any) => q.eq("eventId", eventId)).unique();
  if (!event || event.allowSpread !== true) return;

  const guests = await ctx.db.query("guests").withIndex("by_eventId", (q: any) => q.eq("eventId", eventId)).collect();
  const personas = await ctx.db.query("personas").collect();
  const byId = new Map<string, any>(personas.map((p: any) => [p.personaId, { ...p, personaId: p.personaId }]));
  const accepter = byId.get(accepterId);
  const host = byId.get(event.hostId);
  if (!accepter || !host) return;

  const venue = event.venueId
    ? await ctx.db.query("venues").withIndex("by_venueId", (q: any) => q.eq("venueId", event.venueId)).unique()
    : null;
  const capacity = event.capacity ?? venue?.capacity ?? undefined;

  const targets = spreadTargets(event, guests, accepter, host, byId, capacity);
  if (!targets.length) return;

  for (const pid of targets) {
    const p = byId.get(pid);
    await ctx.db.insert("guests", {
      eventId,
      personaId: pid,
      name: p.name,
      kind: "muse",
      status: "invited",
      spreadFrom: accepterId,
    });
  }
  // Goes through scheduleHuddle, not the scheduler directly, so a spread cohort gets its own run
  // record and lease like any other — otherwise a spread huddle that stalled would be invisible to
  // the host's Retry.
  await scheduleHuddle(ctx, eventId, targets);
}
