// Event discovery: one Muse pick as an in-app event page, and the person's own answers to their
// picks (X / I'm going / snooze).
import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireActor } from "./authz";
import { toPickView } from "./discoveryCore";

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
    const { _id, _creationTime, fetchedAt, ...event } = ev;
    return toPickView(event, pick, Date.now());
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
