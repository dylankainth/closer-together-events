// Event discovery: the merged pool of real events. Internal only (called by the fetch actions and
// the ranker), so nothing here is reachable from the app.
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { discoveredInputV, pickKindV, pickVerdictV, reasonSourceV } from "./discoveryValidators";
import { mergeDuplicates, pastEventsFor, qualifies, WINDOW_DAYS, type DiscoveredInput, type Keyed, type RankProfile } from "./discoveryCore";
import type { Doc } from "./_generated/dataModel";

const MAX_DESCRIPTION = 2000;
const DAY_MS = 86_400_000;

function toInput(d: Doc<"discoveredEvents">): DiscoveredInput {
  const { _id, _creationTime, key, fetchedAt, ...rest } = d;
  return rest;
}

/** Merge a batch into the pool by event key. A Facebook record keeps priority over other sources;
 * otherwise the fresh row wins and empty fields are filled from what was stored. */
export const upsertMany = internalMutation({
  args: { items: v.array(discoveredInputV) },
  handler: async (ctx, { items }) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    const batch = items.map((i) => ({ ...i, description: i.description.slice(0, MAX_DESCRIPTION) }));
    for (const item of mergeDuplicates(batch)) {
      const { key, ...fresh } = item;
      const existing = await ctx.db.query("discoveredEvents").withIndex("by_key", (q) => q.eq("key", key)).unique();
      if (!existing) {
        await ctx.db.insert("discoveredEvents", { ...fresh, key, fetchedAt: now });
        inserted += 1;
        continue;
      }
      const [merged] = mergeDuplicates([fresh, toInput(existing)]);
      const { key: _k, ...fields } = merged;
      await ctx.db.patch(existing._id, { ...fields, fetchedAt: now });
      updated += 1;
    }
    return { inserted, updated };
  },
});

/** Events that qualify right now (window, radius, not online or cancelled), soonest first. */
export const candidates = internalQuery({
  args: {},
  handler: async (ctx): Promise<Keyed[]> => {
    const now = Date.now();
    const rows = await ctx.db
      .query("discoveredEvents")
      .withIndex("by_startsAt", (q) => q.gt("startsAt", now).lte("startsAt", now + WINDOW_DAYS * DAY_MS))
      .collect();
    return rows.filter((r) => qualifies(r, now)).map((r) => ({ ...toInput(r), key: r.key }));
  },
});

/** Who gets picks: seeded personas with a Muse, plus every real (fb_) user. */
export const rankTargets = internalQuery({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const personas = await ctx.db.query("personas").collect();
    return personas.filter((p) => p.hasMuse || p.personaId.startsWith("fb_")).map((p) => p.personaId);
  },
});

/** What Muse may know when picking for this person: the approved Muse profile if there is one, a
 * seeded persona's event-safe interests and vibe otherwise, plus their own past events. Never
 * memory, secrets or never-share. A real user without an approved profile gets null ("popular"). */
export const profileFor = internalQuery({
  args: { personaId: v.string() },
  handler: async (ctx, { personaId }): Promise<RankProfile | null> => {
    const persona = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", personaId)).unique();
    if (!persona) return null;
    const muse = await ctx.db.query("musePersonas").withIndex("by_personaId", (q) => q.eq("personaId", personaId)).unique();
    const approved = muse?.profileApproved ? muse : null;
    if (!approved && personaId.startsWith("fb_")) return null;
    const past = await ctx.db.query("pastEvents").withIndex("by_persona", (q) => q.eq("personaId", personaId)).collect();
    return {
      interests: approved ? approved.interests : persona.interests,
      vibe: approved ? approved.vibe : persona.vibe,
      pastEvents: past.map((p) => ({ title: p.title, category: p.category, feedback: p.feedback })),
    };
  },
});

/** Replace this person's unanswered picks; picks they already answered are kept as they are. */
export const savePicks = internalMutation({
  args: {
    personaId: v.string(),
    reasonSource: reasonSourceV,
    picks: v.array(v.object({ key: v.string(), verdict: pickVerdictV, reason: v.string(), score: v.number(), kind: pickKindV })),
  },
  handler: async (ctx, { personaId, reasonSource, picks }) => {
    // An empty run (sources or Muse down) must never clear what the person already sees.
    if (picks.length === 0) return { saved: 0 };
    const now = Date.now();
    const existing = await ctx.db.query("picks").withIndex("by_persona", (q) => q.eq("personaId", personaId)).collect();
    const answered = new Set(existing.filter((p) => p.status !== "new").map((p) => p.eventKey));
    for (const p of existing) if (p.status === "new") await ctx.db.delete(p._id);
    let saved = 0;
    for (const p of picks) {
      if (answered.has(p.key)) continue;
      await ctx.db.insert("picks", {
        personaId, eventKey: p.key, verdict: p.verdict, reason: p.reason, score: p.score, kind: p.kind,
        status: "new", rankedAt: now, reasonSource,
      });
      saved += 1;
    }
    return { saved };
  },
});

/** Seed 2-3 past events per demo persona (only where none exist), so Muse can cite them. */
export const seedPastEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const personas = await ctx.db.query("personas").collect();
    let inserted = 0;
    for (const p of personas) {
      if (!p.hasMuse || p.personaId.startsWith("fb_")) continue;
      const has = await ctx.db.query("pastEvents").withIndex("by_persona", (q) => q.eq("personaId", p.personaId)).first();
      if (has) continue;
      for (const row of pastEventsFor(p.personaId, p.interests)) {
        await ctx.db.insert("pastEvents", row);
        inserted += 1;
      }
    }
    return { inserted };
  },
});

/** Private facts used ONLY to check Muse's reasons for leaks; never sent to a model. */
export const leakGuardFor = internalQuery({
  args: { personaId: v.string() },
  handler: async (ctx, { personaId }): Promise<string[]> => {
    const persona = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", personaId)).unique();
    return persona ? [...persona.secrets, ...persona.neverShare].map((s) => s.toLowerCase()) : [];
  },
});
