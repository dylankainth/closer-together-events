import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// One-off maintenance: make the "friends going" pill on Muse's picks real for the demo. Picks are real nearby events,
// and the pill shows which of YOUR friends said they are going to the same one (their own pick row with status
// "going"). Nobody has tapped anything, so it is empty. This marks 1-3 friends of the demo viewers as going to each
// upcoming event, preferring friends whose interests fit the event. Internal-only (scripts/seed-pick-going.mjs).
// The demo viewers themselves are never marked, so their own cards stay open. Safe to re-run.

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

export const markGoing = internalMutation({
  args: { key: v.string(), personaIds: v.array(v.string()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let changed = 0;
    for (const personaId of args.personaIds) {
      const row = await ctx.db.query("picks").withIndex("by_persona_key", (q) => q.eq("personaId", personaId).eq("eventKey", args.key)).unique();
      if (row?.status === "going") continue;
      changed++;
      if (args.dryRun) continue;
      if (row) await ctx.db.patch(row._id, { status: "going", snoozedUntil: undefined });
      else await ctx.db.insert("picks", { personaId, eventKey: args.key, verdict: "maybe", reason: "", score: 0, kind: "personal", status: "going", rankedAt: Date.now(), reasonSource: "fallback" });
    }
    return changed;
  },
});

export const run = internalAction({
  args: { keepFree: v.array(v.string()), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const events: { key: string; title: string; category: string | null; description: string }[] = await ctx.runQuery(internal.discoveryData.candidates, {});
    const personas: { id: string; interests: string[]; friends: string[]; hasMuse: boolean; hop: number }[] = await ctx.runQuery(internal.personas.listAllInternal, {});
    const free = new Set(args.keepFree);
    const friendIds = new Set(personas.filter((p) => free.has(p.id)).flatMap((p) => p.friends));
    const pool = personas.filter((p) => friendIds.has(p.id) && !free.has(p.id) && p.hasMuse && p.hop === 1 && !p.id.startsWith("fb_"));
    let marked = 0;
    for (const e of events) {
      const text = `${e.title} ${e.category ?? ""} ${e.description}`.toLowerCase();
      const fit = (p: { id: string; interests: string[] }) => p.interests.filter((i) => text.includes(i.toLowerCase())).length;
      const count = 1 + (hash(e.key) % 3);
      const goers = [...pool].sort((a, b) => fit(b) - fit(a) || hash(e.key + a.id) - hash(e.key + b.id)).slice(0, count).map((p) => p.id);
      marked += await ctx.runMutation(internal.seedPickGoing.markGoing, { key: e.key, personaIds: goers, dryRun: args.dryRun });
    }
    return { dryRun: !!args.dryRun, events: events.length, pool: pool.length, marked };
  },
});
