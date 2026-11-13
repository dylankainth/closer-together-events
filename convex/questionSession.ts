"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { museJSON } from "./muse";
import { CONFIG } from "./museConfig";
import { z } from "zod";
import type { CallBudget } from "./types";
import type { Id } from "./_generated/dataModel";

const QuestionSchema = z.object({
  kind: z.union([z.literal("question"), z.literal("complete")]),
  question: z.string().max(200),
  options: z.array(z.string().max(40)).max(6).optional(),
  inputType: z.union([z.literal("chips"), z.literal("text"), z.literal("voice")]).optional(),
});
type QuestionResult = z.infer<typeof QuestionSchema>;

const FALLBACK_OPENING: QuestionResult = {
  kind: "question",
  question: "What kind of event are you hosting?",
  options: ["Birthday", "Housewarming", "Game night", "Other"],
  inputType: "chips",
};
const FALLBACK_COMPLETE: QuestionResult = { kind: "complete", question: "" };

export const startQuestionSession = action({
  args: { hostId: v.string() },
  handler: async (ctx, args): Promise<{ sessionId: string; question: string; options?: string[]; inputType: "chips" | "text" | "voice" }> => {
    const sessionId: Id<"questionSessions"> = await ctx.runMutation(internal.questionSessionData.createSession, { hostId: args.hostId });

    const budget: CallBudget = { used: 0, max: CONFIG.maxCallsPerEvent };
    const r = await museJSON({
      model: "spark",
      budget,
      effort: "low",
      system:
        'You are Muse helping a host plan an event. Ask ONE friendly opening question to learn about the event (purpose, vibe, who it is for, budget, date). Keep it under 200 characters. Offer 2-6 chip options if the answer is categorical, otherwise free text. Never ask for home address, phone number, email, or secrets. Return {"kind":"question", "question": string, "options"?: string[], "inputType"?: "chips"|"text"|"voice"}.',
      user: {},
      schema: QuestionSchema,
      fallback: (): QuestionResult => FALLBACK_OPENING,
    });

    if (r.data.kind === "complete") {
      await ctx.runMutation(internal.questionSessionData.markComplete, { sessionId });
      return { sessionId, question: "", options: [], inputType: "text" };
    }
    return { sessionId, question: r.data.question, options: r.data.options, inputType: r.data.inputType ?? "text" };
  },
});

export const submitAnswer = action({
  args: { sessionId: v.string(), questionId: v.string(), answer: v.any() },
  handler: async (ctx, args): Promise<{ question?: string; options?: string[]; inputType?: "chips" | "text" | "voice"; complete: boolean }> => {
    const sessionId = args.sessionId as Id<"questionSessions">;
    await ctx.runMutation(internal.questionSessionData.appendAnswer, { sessionId, questionId: args.questionId, answer: args.answer });

    const session = await ctx.runQuery(internal.questionSessionData.getSession, { sessionId });
    if (!session) throw new Error("Session not found");

    const budget: CallBudget = { used: 0, max: CONFIG.maxCallsPerEvent };
    const r = await museJSON({
      model: "spark",
      budget,
      effort: "low",
      system:
        "The host is planning an event. They have answered these questions so far: " +
        JSON.stringify(session.answers) +
        '. Ask ONE follow-up question to learn more (purpose, vibe, who, budget, date, constraints). If you have enough information to plan the event, return {"kind":"complete","question":""}. Otherwise return {"kind":"question", "question": string, "options"?: string[], "inputType"?: "chips"|"text"|"voice"}. Keep questions under 200 chars. Never ask for home address, phone number, email, or secrets.',
      user: {},
      schema: QuestionSchema,
      fallback: (): QuestionResult => FALLBACK_COMPLETE,
    });

    if (r.data.kind === "complete") {
      await ctx.runMutation(internal.questionSessionData.markComplete, { sessionId });
      return { complete: true };
    }
    return { question: r.data.question, options: r.data.options, inputType: r.data.inputType ?? "text", complete: false };
  },
});
