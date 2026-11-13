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
import { buildGoingPrompt, buildRankPrompt, cleanGoingNotes, cleanRankResponse, excludeAnswered, fallbackRank, shouldSavePicks, type GoingCandidate, type Keyed, type RankProfile } from "./discoveryCore";
import type { Persona } from "./types";

const CONCURRENCY = 2; // Muse answered 429 rate_limit_exceeded at 5 parallel calls

// verdict is any string: one odd value must not throw away Muse's whole answer;
// cleanRankResponse maps anything other than "go" to "maybe".
const GoingResponse = z.object({ notes: z.array(z.object({ id: z.string(), note: z.string() })) });

const RankResponse = z.object({
  picks: z.array(z.object({ key: z.string(), verdict: z.string(), reason: z.string() })),
});

export const rankPersona = internalAction({
  args: { personaId: v.string() },
  handler: async (ctx, { personaId }): Promise<{ picks: number; source: "muse" | "fallback" }> => {
    const state: { answered: string[]; liveSources: string[] } = await ctx.runQuery(internal.discoveryData.pickState, { personaId });
    const pool: Keyed[] = await ctx.runQuery(internal.discoveryData.candidates, {});
    // Never offer again what the person already answered.
    const candidates = excludeAnswered(pool, new Set(state.answered));
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
    const friendsGoing: Record<string, string[]> = await ctx.runQuery(internal.discoveryData.friendsGoingFor, { personaId });
    const { system, user } = buildRankPrompt(profile, candidates, now, friendsGoing);
    const result = await museJSON({
      model: "ember",
      effort: "low",
      system,
      user,
      schema: RankResponse,
      budget: { used: 0, max: 1 },
      fallback: () => ({ picks: fallback.map(({ key, verdict, reason }) => ({ key, verdict, reason })) }),
    });
    const data = { picks: result.data.picks.map((p) => ({ ...p, verdict: p.verdict === "go" ? ("go" as const) : ("maybe" as const) })) };
    const picks = cleanRankResponse(data, new Set(candidates.map((c) => c.key)), fallback, isLeak);
    const reasonSource = result.source === "muse" ? "muse" : "fallback";
    // Muse down or slow: keep the Muse-written picks the person already has.
    if (!shouldSavePicks(reasonSource, state.liveSources)) return { picks: 0, source: reasonSource };
    const { saved } = await ctx.runMutation(internal.discoveryData.savePicks, { personaId, reasonSource, picks });

    // Light agent-to-agent step: for each pick, your Muse reads who is going (their approved, event-safe profile only)
    // and writes one line per person on why they matter to you. One Muse call per pick; a failure falls back to a
    // plain line and never blocks the picks.
    const byKey = new Map(candidates.map((c) => [c.key, c]));
    const leakGuards = new Map<string, string[]>([[personaId, guard]]);
    for (const p of picks) {
      try {
        const going: GoingCandidate[] = await ctx.runQuery(internal.discoveryData.goingPeopleFor, { personaId, eventKey: p.key });
        if (going.length === 0) continue;
        const shown = going.slice(0, 5);
        for (const g of shown) {
          if (!leakGuards.has(g.id)) leakGuards.set(g.id, await ctx.runQuery(internal.discoveryData.leakGuardFor, { personaId: g.id }));
        }
        const owners = { secrets: [...leakGuards.values()].flat() } as unknown as Persona;
        const ev = byKey.get(p.key);
        const { system: gSystem, user: gUser } = buildGoingPrompt(profile, { title: ev?.title ?? "", category: ev?.category ?? null }, shown);
        const r = await museJSON({
          model: "ember",
          effort: "low",
          system: gSystem,
          user: gUser,
          schema: GoingResponse,
          budget: { used: 0, max: 1 },
          fallback: () => ({ notes: [] }),
        });
        const notes = cleanGoingNotes(r.data, profile, shown, (s) => leaksIn(s, owners));
        await ctx.runMutation(internal.discoveryData.saveGoingNotes, { personaId, eventKey: p.key, notes });
      } catch {
        // keep the pick; the list just shows without notes
      }
    }
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
