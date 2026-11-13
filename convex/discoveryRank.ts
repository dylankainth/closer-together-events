"use node";

// Event discovery: choose each person's picks from the pool. Internal actions only. Task 3 ships
// the deterministic fallback; Muse-written reasons plug in here (design: "Ranking and reasons").
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { fallbackRank, type Keyed, type RankProfile } from "./discoveryCore";

const CONCURRENCY = 5;

export const rankPersona = internalAction({
  args: { personaId: v.string() },
  handler: async (ctx, { personaId }): Promise<{ picks: number; source: "muse" | "fallback" }> => {
    const candidates: Keyed[] = await ctx.runQuery(internal.discoveryData.candidates, {});
    if (candidates.length === 0) return { picks: 0, source: "fallback" };
    const profile: RankProfile | null = await ctx.runQuery(internal.discoveryData.profileFor, { personaId });
    const picks = fallbackRank(profile, candidates, Date.now());
    const { saved } = await ctx.runMutation(internal.discoveryData.savePicks, { personaId, reasonSource: "fallback", picks });
    return { picks: saved, source: "fallback" };
  },
});

export const rankAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ personas: number; picks: number }> => {
    const ids: string[] = await ctx.runQuery(internal.discoveryData.rankTargets, {});
    let total = 0;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const results = await Promise.all(
        ids.slice(i, i + CONCURRENCY).map((personaId) =>
          ctx.runAction(internal.discoveryRank.rankPersona, { personaId }).catch(() => ({ picks: 0 })),
        ),
      );
      total += results.reduce((n, r) => n + r.picks, 0);
    }
    return { personas: ids.length, picks: total };
  },
});
