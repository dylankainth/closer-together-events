import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const createSession = internalMutation({
  args: { hostId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("questionSessions", { hostId: args.hostId, answers: {}, status: "open", createdAt: now, updatedAt: now });
  },
});

export const appendAnswer = internalMutation({
  args: { sessionId: v.id("questionSessions"), questionId: v.string(), answer: v.any() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    const answers = { ...session.answers, [args.questionId]: args.answer };
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

export const finishQuestionSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId as Id<"questionSessions">);
    if (!session || session.status !== "complete") return null;

    const answers = session.answers as Record<string, any>;
    const purpose = answers.purpose ?? answers.eventType ?? answers.occasion ?? "Other";
    const vibe = answers.vibe ?? "Lively";
    const budgetRaw = answers.budget ?? answers.budgetRange ?? 2;
    const budget = budgetRaw === 1 ? 1 : budgetRaw === 3 ? 3 : 2;
    const audienceRaw = answers.audience ?? answers.who ?? answers.guests ?? "my friends";

    return { purpose, vibe, budget, audienceRaw };
  },
});
