import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const createSession = internalMutation({
  args: { hostId: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    // "description" is context for Muse's prompts, not a core field planEvent maps from, so it
    // doesn't count toward missingCoreFields()/the round cap.
    const answers = args.description ? { description: args.description } : {};
    return ctx.db.insert("questionSessions", { hostId: args.hostId, answers, status: "open", createdAt: now, updatedAt: now });
  },
});

export const appendAnswer = internalMutation({
  args: { sessionId: v.id("questionSessions"), field: v.string(), answer: v.any() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    // "other"-field answers overwrite each other if asked more than once; they're not used by
    // finishQuestionSession's mapping anyway, so this is a deliberate simplification.
    const answers = { ...session.answers, [args.field]: args.answer };
    await ctx.db.patch(session._id, { answers, updatedAt: Date.now() });
  },
});

export const markComplete = internalMutation({
  args: { sessionId: v.id("questionSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (session) await ctx.db.patch(session._id, { status: "complete", updatedAt: Date.now() });
  },
});

export const getSession = internalQuery({
  args: { sessionId: v.id("questionSessions") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.sessionId);
    return row ? (({ _id, _creationTime, ...rest }) => rest)(row) : null;
  },
});

/** Accepts a number, a "$"-style string, or a loose keyword; always returns a valid tier. */
function parseBudget(raw: unknown): 1 | 2 | 3 {
  if (raw === 1 || raw === 2 || raw === 3) return raw;
  if (typeof raw === "number") return raw <= 1 ? 1 : raw >= 3 ? 3 : 2;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (/^\${1,3}$/.test(raw.trim())) return Math.min(3, raw.trim().length) as 1 | 2 | 3;
    if (/low|cheap|budget|\$(?!\$)/.test(s)) return 1;
    if (/high|fancy|premium|lavish|\${3,}/.test(s)) return 3;
  }
  return 2;
}

export const finishQuestionSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId as Id<"questionSessions">);
    if (!session || session.status !== "complete") return null;

    const answers = session.answers as Record<string, unknown>;
    const description = typeof answers.description === "string" ? answers.description : "";
    return {
      purpose: typeof answers.purpose === "string" ? answers.purpose : "Other",
      vibe: typeof answers.vibe === "string" ? answers.vibe : "Lively",
      budget: parseBudget(answers.budget),
      // Fall back to the host's own opening description before the generic "my friends" — it's
      // a better guess if the round cap or an early "complete" skipped the audience question.
      audienceRaw: typeof answers.audience === "string" ? answers.audience : description || "my friends",
    };
  },
});
