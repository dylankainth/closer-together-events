import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { RICH_CONTEXT } from "./personaContextData";

// One-off maintenance: give the 12 named personas their richer context (convex/personaContextData.ts) on a database
// that is already seeded (seed.ts only runs once). Internal-only: it needs admin access
// (scripts/apply-persona-context.mjs). Safe to re-run: it sets the same values again. Each persona's planted
// secrets / neverShare are kept; the new ones are added.

export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: { id: string; found: boolean; hasContext: boolean }[] = [];
    for (const id of Object.keys(RICH_CONTEXT)) {
      const row = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", id)).unique();
      out.push({ id, found: !!row, hasContext: !!row?.shareable });
    }
    return out;
  },
});

export const apply = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const updated: string[] = [];
    const missing: string[] = [];
    for (const [id, c] of Object.entries(RICH_CONTEXT)) {
      const row = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", id)).unique();
      if (!row) {
        missing.push(id);
        continue;
      }
      if (!args.dryRun) {
        await ctx.db.patch(row._id, {
          memory: c.memory,
          curious: c.curious,
          shareable: c.shareable,
          ties: c.ties,
          secrets: Array.from(new Set([...row.secrets, ...(c.secrets ?? [])])),
          neverShare: Array.from(new Set([...row.neverShare, ...(c.neverShare ?? [])])),
        });
      }
      updated.push(id);
    }
    return { dryRun: !!args.dryRun, updated, missing };
  },
});
