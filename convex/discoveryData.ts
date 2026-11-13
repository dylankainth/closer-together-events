// Event discovery: the merged pool of real events. Internal only (called by the fetch actions and
// the ranker), so nothing here is reachable from the app.
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { discoveredInputV, pickKindV, pickVerdictV, reasonSourceV } from "./discoveryValidators";
import { findDuplicate, mergeDuplicates, pastEventsFor, qualifies, refreshDecision, WINDOW_DAYS, type DiscoveredInput, type Keyed, type RankProfile } from "./discoveryCore";
import type { Doc } from "./_generated/dataModel";
import { DEMO_SNAPSHOT } from "./demoSnapshot";

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
      // Same event already stored, maybe worded differently by another source: compare against
      // that local day's rows (plus or minus a day for time zones).
      const sameDay = await ctx.db
        .query("discoveredEvents")
        .withIndex("by_startsAt", (q) => q.gte("startsAt", fresh.startsAt - DAY_MS).lte("startsAt", fresh.startsAt + DAY_MS))
        .collect();
      const match = findDuplicate(fresh, sameDay.map((r) => ({ ...toInput(r), key: r.key })));
      const existing = match ? sameDay.find((r) => r.key === match.key) : undefined;
      if (!existing) {
        await ctx.db.insert("discoveredEvents", { ...fresh, key, fetchedAt: now });
        inserted += 1;
        continue;
      }
      const [merged] = mergeDuplicates([fresh, toInput(existing)]);
      const { key: _k, ...fields } = merged;
      // Keep the stored key: people's picks point at it.
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
    // Colour for richer reasons, only for personas that carry rich context (the named demo personas).
    const rich = persona.shareable ? { about: persona.shareable, curious: persona.curious, recentChats: persona.recentChats ?? [] } : {};
    const friendNames: string[] = [];
    if (persona.shareable) {
      for (const fid of persona.friends.filter((f) => !f.startsWith("p-fof-")).slice(0, 8)) {
        const f = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", fid)).unique();
        if (f) friendNames.push(f.name.split(" ")[0]);
      }
    }
    return {
      interests: approved ? approved.interests : persona.interests,
      vibe: approved ? approved.vibe : persona.vibe,
      pastEvents: past.map((p) => ({ title: p.title, category: p.category, feedback: p.feedback })),
      ...rich,
      ...(persona.shareable ? { friends: friendNames } : {}),
    };
  },
});

/** Which of this person's friends have said they are going to each event: event key -> first names. */
export const friendsGoingFor = internalQuery({
  args: { personaId: v.string() },
  handler: async (ctx, { personaId }): Promise<Record<string, string[]>> => {
    const me = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", personaId)).unique();
    const out: Record<string, string[]> = {};
    for (const fid of me?.friends ?? []) {
      const f = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", fid)).unique();
      if (!f) continue;
      const rows = await ctx.db.query("picks").withIndex("by_persona", (q) => q.eq("personaId", fid)).collect();
      for (const r of rows) if (r.status === "going") (out[r.eventKey] ??= []).push(f.name.split(" ")[0]);
    }
    return out;
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

/** Replace one person's past events (used by the simulated Muse connection). */
export const setPastEvents = internalMutation({
  args: {
    personaId: v.string(),
    rows: v.array(v.object({ personaId: v.string(), title: v.string(), category: v.union(v.string(), v.null()), feedback: v.union(v.string(), v.null()), when: v.number() })),
  },
  handler: async (ctx, { personaId, rows }) => {
    const old = await ctx.db.query("pastEvents").withIndex("by_persona", (q) => q.eq("personaId", personaId)).collect();
    for (const r of old) await ctx.db.delete(r._id);
    for (const r of rows) await ctx.db.insert("pastEvents", { ...r, personaId });
    return { saved: rows.length };
  },
});

const SNAPSHOT_DESCRIPTION = 400;

/** Today's good picks of the demo personas, for scripts/export-demo-snapshot.mjs. */
export const snapshotData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const picks = (await ctx.db.query("picks").collect()).filter((p) => !p.personaId.startsWith("fb_") && p.status === "new");
    const keys = [...new Set(picks.map((p) => p.eventKey))];
    const events = [];
    for (const key of keys) {
      const ev = await ctx.db.query("discoveredEvents").withIndex("by_key", (q) => q.eq("key", key)).unique();
      if (ev) events.push({ ...toInput(ev), description: ev.description.slice(0, SNAPSHOT_DESCRIPTION), key });
    }
    return {
      events,
      picks: picks.map((p) => ({ personaId: p.personaId, key: p.eventKey, verdict: p.verdict, reason: p.reason, score: p.score, kind: p.kind })),
    };
  },
});

/** Never empty: any demo persona with no picks gets its saved snapshot back (events + picks). */
export const loadSnapshot = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let restored = 0;
    const byPersona = new Map<string, typeof DEMO_SNAPSHOT.picks>();
    for (const p of DEMO_SNAPSHOT.picks) byPersona.set(p.personaId, [...(byPersona.get(p.personaId) ?? []), p]);
    for (const [personaId, picks] of byPersona) {
      const has = await ctx.db.query("picks").withIndex("by_persona", (q) => q.eq("personaId", personaId)).first();
      if (has) continue;
      for (const p of picks) {
        const exists = await ctx.db.query("discoveredEvents").withIndex("by_key", (q) => q.eq("key", p.key)).unique();
        const ev = DEMO_SNAPSHOT.events.find((e) => e.key === p.key);
        if (!exists && ev) await ctx.db.insert("discoveredEvents", { ...ev, fetchedAt: now });
        await ctx.db.insert("picks", { personaId, eventKey: p.key, verdict: p.verdict, reason: p.reason, score: p.score, kind: p.kind, status: "new", rankedAt: now, reasonSource: "snapshot" });
      }
      restored += 1;
    }
    return { restored };
  },
});

/** Atomically claim this person's refresh slot (at most one per minute). */
export const claimRefresh = internalMutation({
  args: { personaId: v.string() },
  handler: async (ctx, { personaId }): Promise<"ok" | "too_soon" | "unknown"> => {
    const now = Date.now();
    // Unknown ids are refused before anything is written, so made-up ids cannot pile up rows or cost.
    const persona = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", personaId)).unique();
    const key = `refresh:${personaId}`;
    const row = persona ? await ctx.db.query("appMeta").withIndex("by_key", (q) => q.eq("key", key)).unique() : null;
    const last = row && typeof row.value === "number" ? row.value : null;
    const decision = refreshDecision({ exists: !!persona, lastAt: last, now });
    if (decision !== "ok") return decision;
    if (row) await ctx.db.patch(row._id, { value: now });
    else await ctx.db.insert("appMeta", { key, value: now });
    return "ok";
  },
});

/** What this person already did with their picks: answered event keys, and who wrote the live ones. */
export const pickState = internalQuery({
  args: { personaId: v.string() },
  handler: async (ctx, { personaId }): Promise<{ answered: string[]; liveSources: string[] }> => {
    const rows = await ctx.db.query("picks").withIndex("by_persona", (q) => q.eq("personaId", personaId)).collect();
    return {
      answered: rows.filter((r) => r.status !== "new").map((r) => r.eventKey),
      liveSources: rows.filter((r) => r.status === "new").map((r) => r.reasonSource),
    };
  },
});

/** Atomically claim a source fetch slot, so taps on refresh cannot run a paid source (Apify) over and over. */
export const claimSourceRun = internalMutation({
  args: { source: v.string(), minGapMs: v.number() },
  handler: async (ctx, { source, minGapMs }): Promise<boolean> => {
    const now = Date.now();
    const key = `source:${source}`;
    const row = await ctx.db.query("appMeta").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const last = row && typeof row.value === "number" ? row.value : null;
    if (last !== null && last <= now && now - last < minGapMs) return false;
    if (row) await ctx.db.patch(row._id, { value: now });
    else await ctx.db.insert("appMeta", { key, value: now });
    return true;
  },
});
