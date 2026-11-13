import { scheduleHuddle } from "./huddleRuntime";
import { spreadTargets } from "./spreadPolicy";

// Convex half of acceptance-driven spread. The rules themselves are pure and tested in
// spreadPolicy.ts — same split as plusOnePolicy.ts / plusOnes.ts.

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
