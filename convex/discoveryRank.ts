"use node";

// Event discovery: choose each person's picks from the pool. Internal actions only.
// One Muse call per person per run (ember, low effort). Muse sees only the safe profile, the
// person's own past events and up to 40 trimmed candidates (discoveryCore.buildRankPrompt). Its
// answer is cleaned (unknown keys, duplicates, length, leaks) before it is stored; if Muse is
// down or slow, the deterministic fallback writes the picks instead.
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { museJSON } from "./muse";
import { leaksIn } from "./privacy";
import { buildRankPrompt, cleanRankResponse, fallbackRank, type Keyed, type RankProfile } from "./discoveryCore";
import type { Persona } from "./types";

const CONCURRENCY = 5;

const RankResponse = z.object({
  picks: z.array(z.object({ key: z.string(), verdict: z.enum(["go", "maybe"]), reason: z.string() })),
});

export const rankPersona = internalAction({
  args: { personaId: v.string() },
  handler: async (ctx, { personaId }): Promise<{ picks: number; source: "muse" | "fallback" }> => {
    const candidates: Keyed[] = await ctx.runQuery(internal.discoveryData.candidates, {});
    if (candidates.length === 0) return { picks: 0, source: "fallback" };
    const profile: RankProfile | null = await ctx.runQuery(internal.discoveryData.profileFor, { personaId });
    const now = Date.now();
    const fallback = fallbackRank(profile, candidates, now);

    // No profile (a real user whose Muse is not connected): popular picks, no Muse call.
    if (!profile) {
      const { saved } = await ctx.runMutation(internal.discoveryData.savePicks, { personaId, reasonSource: "fallback", picks: fallback });
      return { picks: saved, source: "fallback" };
    }

    const guard: string[] = await ctx.runQuery(internal.discoveryData.leakGuardFor, { personaId });
    const owner = { secrets: guard } as unknown as Persona;
    const isLeak = (s: string) => leaksIn(s, owner);
    const { system, user } = buildRankPrompt(profile, candidates, now);
    const result = await museJSON({
      model: "ember",
      effort: "low",
      system,
      user,
      schema: RankResponse,
      budget: { used: 0, max: 1 },
      fallback: () => ({ picks: fallback.map(({ key, verdict, reason }) => ({ key, verdict, reason })) }),
    });
    const picks = cleanRankResponse(result.data, new Set(candidates.map((c) => c.key)), fallback, isLeak);
    const reasonSource = result.source === "muse" ? "muse" : "fallback";
    const { saved } = await ctx.runMutation(internal.discoveryData.savePicks, { personaId, reasonSource, picks });
    return { picks: saved, source: reasonSource };
  },
});

export const rankAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ personas: number; picks: number; muse: number }> => {
    const ids: string[] = await ctx.runQuery(internal.discoveryData.rankTargets, {});
    let total = 0;
    let muse = 0;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const results = await Promise.all(
        ids.slice(i, i + CONCURRENCY).map((personaId) =>
          ctx.runAction(internal.discoveryRank.rankPersona, { personaId }).catch(() => ({ picks: 0, source: "fallback" as const })),
        ),
      );
      total += results.reduce((n, r) => n + r.picks, 0);
      muse += results.filter((r) => r.source === "muse").length;
    }
    return { personas: ids.length, picks: total, muse };
  },
});
