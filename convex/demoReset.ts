import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { pickStatusV } from "./discoveryValidators";

// One-off demo maintenance: undo the rows that rehearsals and backup recordings leave behind, so the live
// demo starts clean. Internal-only, so it can only be run with admin access, e.g.
//   npx convex run demoReset:apply '{"deleteEventIds":["evt_x"],"guests":[...],"picks":[...]}'
// Every row to change is named explicitly; nothing is found by guessing. dryRun defaults to true and only
// reports. An event that was sent to guests is never deleted, only test drafts.

const guestStatusV = v.union(
  v.literal("invited"),
  v.literal("going"),
  v.literal("maybe"),
  v.literal("skip"),
  v.literal("cant"),
);

type Ctx = MutationCtx;

async function deleteTestEvent(ctx: Ctx, eventId: string, dryRun: boolean): Promise<string> {
  const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).unique();
  if (!e) return `event ${eventId}: not found, skipped`;
  if (e.status === "sent") return `event ${eventId} "${e.title}": was sent to guests, not deleted`;
  const guests = await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect();
  const messages = await ctx.db
    .query("huddleMessages")
    .withIndex("by_eventId_seq", (q) => q.eq("eventId", eventId))
    .collect();
  if (!dryRun) {
    for (const row of [...guests, ...messages]) await ctx.db.delete(row._id);
    await ctx.db.delete(e._id);
  }
  const verb = dryRun ? "would delete" : "deleted";
  return `event ${eventId} "${e.title}": ${verb}, with ${guests.length} guests and ${messages.length} huddle messages`;
}

async function resetGuest(
  ctx: Ctx,
  g: { eventId: string; personaId: string; status: "invited" | "going" | "maybe" | "skip" | "cant" },
  dryRun: boolean,
): Promise<string> {
  const rows = await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", g.eventId)).collect();
  const row = rows.find((r) => r.personaId === g.personaId);
  if (!row) return `guest ${g.personaId} on ${g.eventId}: not found, skipped`;
  // Same fields the feed RSVP clears on every answer (feed.ts), so no stale condition or snooze survives.
  if (!dryRun) await ctx.db.patch(row._id, { status: g.status, goIfFriend: undefined, snoozedUntil: undefined });
  return `guest ${g.personaId} on ${g.eventId}: ${row.status} -> ${g.status}${dryRun ? " (would change)" : ""}`;
}

async function resetPick(
  ctx: Ctx,
  p: { personaId: string; eventKey: string; status: "new" | "going" | "maybe" | "cant" | "snoozed" },
  dryRun: boolean,
): Promise<string> {
  const row = await ctx.db
    .query("picks")
    .withIndex("by_persona_key", (q) => q.eq("personaId", p.personaId).eq("eventKey", p.eventKey))
    .unique();
  if (!row) return `pick ${p.eventKey} for ${p.personaId}: not found, skipped`;
  // picks.respond clears snoozedUntil on every non-snooze answer; a reset does the same.
  if (!dryRun) await ctx.db.patch(row._id, { status: p.status, snoozedUntil: undefined });
  return `pick ${p.eventKey} for ${p.personaId}: ${row.status} -> ${p.status}${dryRun ? " (would change)" : ""}`;
}

export const apply = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    deleteEventIds: v.optional(v.array(v.string())),
    guests: v.optional(v.array(v.object({ eventId: v.string(), personaId: v.string(), status: guestStatusV }))),
    picks: v.optional(v.array(v.object({ personaId: v.string(), eventKey: v.string(), status: pickStatusV }))),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const report: string[] = [];
    for (const eventId of args.deleteEventIds ?? []) report.push(await deleteTestEvent(ctx, eventId, dryRun));
    for (const g of args.guests ?? []) report.push(await resetGuest(ctx, g, dryRun));
    for (const p of args.picks ?? []) report.push(await resetPick(ctx, p, dryRun));
    return { dryRun, report };
  },
});
