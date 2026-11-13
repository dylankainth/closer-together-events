"use node";

import { z } from "zod";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { museJSON } from "./muse";
import { CONFIG } from "./museConfig";
import { requireSignedIn } from "./authz";

/**
 * Screen 4 -> 5: turns the host's single free-text box ("What are we making happen?") into a
 * draft {purpose, vibe, budget, audience} guess, which screen 5's chips then refine (never
 * replace). Thin, new — not a 1:1 port of the old wizard, which asked these as separate steps.
 */
export const extractDraft = action({
  args: { raw: v.string() },
  handler: async (ctx, args) => {
    await requireSignedIn(ctx, "extractAction.extractDraft"); // spends Muse budget
    const budget = { used: 0, max: CONFIG.maxCallsPerEvent };
    const r = await museJSON({
      model: "spark",
      budget,
      effort: "low",
      system:
        'Extract a draft event plan from one free-text line a host typed. Return {purpose: one of "Birthday"|"Housewarming"|"Game night"|"Other", vibe: one of "Chill"|"Lively"|"Fancy", budget: 1|2|3, audience: string (who it\'s for, best-guess, can be empty)}.',
      user: { text: args.raw },
      schema: z.object({
        purpose: z.enum(["Birthday", "Housewarming", "Game night", "Other"]),
        vibe: z.enum(["Chill", "Lively", "Fancy"]),
        budget: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        audience: z.string().max(200),
      }),
      fallback: () => {
        const lower = args.raw.toLowerCase();
        const purpose = /birthday/.test(lower) ? "Birthday" : /housewarming/.test(lower) ? "Housewarming" : /game/.test(lower) ? "Game night" : "Other";
        const vibe = /fancy|dress/.test(lower) ? "Fancy" : /chill|low[- ]?key/.test(lower) ? "Chill" : "Lively";
        return { purpose: purpose as any, vibe: vibe as any, budget: 2 as const, audience: "" };
      },
    });
    return r.data;
  },
});
