// Event discovery: one Muse pick as an in-app event page, and the person's own answers to their
// picks (X / I'm going / snooze).
import { action, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { requireActor } from "./authz";
import { toPickView, type CardPerson } from "./discoveryCore";

/** The refresh button: re-rank this person's picks from the events already fetched (seconds), then
 * fetch fresh events in the background and re-rank them again. Never clears what they see. */
export const refresh = action({
  args: { personaId: v.string() },
  handler: async (ctx, { personaId }): Promise<{ status: "ranked" | "too_soon" | "unknown"; picks: number }> => {
    await requireActor(ctx, personaId, "write", "picks.refresh");
    const claim: "ok" | "too_soon" | "unknown" = await ctx.runMutation(internal.discoveryData.claimRefresh, { personaId });
    if (claim !== "ok") return { status: claim, picks: 0 };
    const { picks } = await ctx.runAction(internal.discoveryRank.rankPersona, { personaId });
    await ctx.scheduler.runAfter(0, internal.discoverySources.fetchAll, { personaId });
    return { status: "ranked", picks };
  },
});

/** The pick's event page for this viewer, or null if it no longer exists. */
export const detail = query({
  args: { personaId: v.string(), key: v.string() },
  handler: async (ctx, { personaId, key }) => {
    await requireActor(ctx, personaId, "read", "picks.detail");
    const pick = await ctx.db
      .query("picks")
      .withIndex("by_persona_key", (q) => q.eq("personaId", personaId).eq("eventKey", key))
      .unique();
    const ev = await ctx.db.query("discoveredEvents").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!pick || !ev) return null;
    // Friends of the viewer who said they're going (same rule as the card's friends pill; never shown to Muse).
    const me = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", personaId)).unique();
    const friends = new Set<string>(me?.friends ?? []);
    const others = await ctx.db
      .query("picks")
      .withIndex("by_eventKey_status", (q) => q.eq("eventKey", key).eq("status", "going"))
      .collect();
    const going: CardPerson[] = [];
    for (const o of others) {
      if (!friends.has(o.personaId)) continue;
      const p = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", o.personaId)).unique();
      if (p) going.push({ id: p.personaId, name: p.name, initials: p.initials, color: p.color });
    }
    const { _id, _creationTime, fetchedAt, ...event } = ev;
    return toPickView(event, pick, Date.now(), going, others.filter((o) => o.status === "going").length, pick.goingNotes ?? []);
  },
});

const SNOOZE_MS = 60 * 60 * 1000;

export const respond = mutation({
  args: {
    personaId: v.string(),
    key: v.string(),
    action: v.union(v.literal("going"), v.literal("maybe"), v.literal("cant"), v.literal("snooze")),
  },
  handler: async (ctx, { personaId, key, action }) => {
    await requireActor(ctx, personaId, "write", "picks.respond");
    const pick = await ctx.db
      .query("picks")
      .withIndex("by_persona_key", (q) => q.eq("personaId", personaId).eq("eventKey", key))
      .unique();
    if (!pick) throw new ConvexError({ code: "not_found", message: "That pick is no longer available." });
    if (action === "snooze") {
      await ctx.db.patch(pick._id, { status: "snoozed", snoozedUntil: Date.now() + SNOOZE_MS });
    } else {
      await ctx.db.patch(pick._id, { status: action, snoozedUntil: undefined });
    }
  },
});
