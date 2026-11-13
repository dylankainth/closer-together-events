"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { museJSON } from "./muse";
import { CONFIG } from "./museConfig";
import { z } from "zod";
import type { CallBudget } from "./types";
import type { Id } from "./_generated/dataModel";

// Core fields planEvent actually needs; "other" is for anything else Muse asks (constraints,
// date, etc.) that gets recorded but doesn't feed the mapping in questionSessionData.ts.
const CORE_FIELDS = ["purpose", "vibe", "audience", "budget"] as const;
const MAX_ROUNDS = 6; // hard cap so a live model that never says "complete" can't strand the host

const QuestionSchema = z.object({
  kind: z.union([z.literal("question"), z.literal("complete")]),
  field: z.enum(["purpose", "vibe", "audience", "budget", "other"]).optional(),
  question: z.string().max(200),
  // Short reasoning shown under the question, e.g. "Most of your likely guests said under £35 is comfortable."
  note: z.string().max(140).optional(),
  options: z.array(z.string().max(40)).max(6).optional(),
  // Muse's own best guess, pre-selected on the card — the host can tap a different chip, type
  // their own answer, or just leave it and let this stand (matches the "or let me decide" copy).
  defaultOption: z.string().max(40).optional(),
  // "voice" dropped per ballot B12 (drop voice input for the demo) — chips/text only.
  inputType: z.union([z.literal("chips"), z.literal("text")]).optional(),
});
type QuestionResult = z.infer<typeof QuestionSchema>;

const FALLBACK_OPENING: QuestionResult = {
  kind: "question",
  field: "purpose",
  question: "What's the main purpose for this?",
  options: ["Cheer everyone on", "Bond with mates", "Just for fun", "Celebrate something"],
  defaultOption: "Just for fun",
  inputType: "chips",
};

// Deterministic per-field question, used both as the offline fallback and as a forced override
// if a live model tries to say "complete" while a core field is still missing — a chatty model
// deciding "one answer is enough" would otherwise defeat the whole point of asking.
const FIELD_FALLBACKS: Record<(typeof CORE_FIELDS)[number], QuestionResult> = {
  purpose: FALLBACK_OPENING,
  vibe: { kind: "question", field: "vibe", question: "What's the vibe?", options: ["Chill", "Lively", "Fancy"], defaultOption: "Lively", inputType: "chips" },
  audience: { kind: "question", field: "audience", question: "Who gets in?", options: ["Only who I pick", "My picks + they can bring 1", "Anyone can apply"], defaultOption: "My picks + they can bring 1", inputType: "chips" },
  budget: { kind: "question", field: "budget", question: "Budget per head?", options: ["Under £25", "£25-35", "£35+", "I'm paying"], defaultOption: "£25-35", inputType: "chips" },
};

function missingCoreFields(answers: Record<string, unknown>): (typeof CORE_FIELDS)[number][] {
  return CORE_FIELDS.filter((f) => !(f in answers));
}

export const startQuestionSession = action({
  args: { hostId: v.string(), initialDescription: v.string() },
  handler: async (ctx, args): Promise<{ sessionId: string; field?: string; question: string; note?: string; options?: string[]; defaultOption?: string; inputType: "chips" | "text" }> => {
    const sessionId: Id<"questionSessions"> = await ctx.runMutation(internal.questionSessionData.createSession, {
      hostId: args.hostId,
      description: args.initialDescription,
    });

    const budget: CallBudget = { used: 0, max: CONFIG.maxCallsPerEvent };
    const r = await museJSON({
      model: "spark",
      budget,
      effort: "low",
      system:
        'You are Muse helping a host plan an event. They just described it in one line. Ask ONE friendly follow-up question to learn more — skip anything the description already answers. Always propose your own best-guess default so the host can just accept it. Keep the question under 200 characters, and any "note" under 140. Offer 2-6 chip options if the answer is categorical, otherwise free text (no voice input). Never ask for home address, phone number, email, or secrets. Return {"kind":"question", "field": "purpose"|"vibe"|"audience"|"budget"|"other", "question": string, "note"?: string, "options"?: string[], "defaultOption"?: string (must be one of options), "inputType"?: "chips"|"text"}. "field" names which of purpose/vibe/audience/budget this question is collecting — use "other" only if it fits none of those.',
      user: { description: args.initialDescription },
      schema: QuestionSchema,
      fallback: (): QuestionResult => FALLBACK_OPENING,
    });

    if (r.data.kind === "complete") {
      await ctx.runMutation(internal.questionSessionData.markComplete, { sessionId });
      return { sessionId, question: "", options: [], inputType: "text" };
    }
    return { sessionId, field: r.data.field, question: r.data.question, note: r.data.note, options: r.data.options, defaultOption: r.data.defaultOption, inputType: r.data.inputType ?? "text" };
  },
});

export const submitAnswer = action({
  args: { sessionId: v.string(), field: v.string(), answer: v.any() },
  handler: async (ctx, args): Promise<{ field?: string; question?: string; note?: string; options?: string[]; defaultOption?: string; inputType?: "chips" | "text"; complete: boolean }> => {
    const sessionId = args.sessionId as Id<"questionSessions">;
    await ctx.runMutation(internal.questionSessionData.appendAnswer, { sessionId, field: args.field, answer: args.answer });

    const session = await ctx.runQuery(internal.questionSessionData.getSession, { sessionId });
    if (!session) throw new Error("Session not found");

    const answerCount = Object.keys(session.answers).length;
    const stillMissing = missingCoreFields(session.answers);
    // Stop without another Muse call once we have everything planEvent needs, or we've hit the
    // round cap — covers both "model never says complete" and plain cost control.
    if (stillMissing.length === 0 || answerCount >= MAX_ROUNDS) {
      await ctx.runMutation(internal.questionSessionData.markComplete, { sessionId });
      return { complete: true };
    }

    const nextFallback = FIELD_FALLBACKS[stillMissing[0]];
    const budget: CallBudget = { used: 0, max: CONFIG.maxCallsPerEvent };
    const r = await museJSON({
      model: "spark",
      budget,
      effort: "low",
      system:
        "The host is planning an event. Answered so far: " +
        JSON.stringify(session.answers) +
        `. You still need: ${stillMissing.join(", ")}. Ask ONE follow-up question about one of those — do not stop until all of them are answered. Always propose your own best-guess default so the host can just accept it. Return {"kind":"question", "field": "${stillMissing.join('"|"')}", "question": string, "note"?: string, "options"?: string[], "defaultOption"?: string (must be one of options), "inputType"?: "chips"|"text"}. Keep questions under 200 chars, chips/text only (no voice). Never ask for home address, phone number, email, or secrets.`,
      user: {},
      schema: QuestionSchema,
      fallback: (): QuestionResult => nextFallback,
    });

    // A chatty model may still try to end early ("complete") or target an already-answered
    // field — override with the deterministic fallback for the next genuinely-missing field
    // rather than letting the interview end (or stall) prematurely.
    const usable = r.data.kind === "question" && r.data.field && stillMissing.includes(r.data.field as (typeof CORE_FIELDS)[number]);
    const chosen = usable ? r.data : nextFallback;
    return { field: chosen.field, question: chosen.question, note: chosen.note, options: chosen.options, defaultOption: chosen.defaultOption, inputType: chosen.inputType ?? "text", complete: false };
  },
});

/** "Skip the rest, use my judgement" — accepts the current card's own default (if any) and ends
 * the interview immediately; finishQuestionSession's per-field defaults cover anything else
 * still missing. */
export const skipRest = action({
  args: { sessionId: v.string(), field: v.optional(v.string()), defaultAnswer: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ complete: true }> => {
    const sessionId = args.sessionId as Id<"questionSessions">;
    if (args.field && args.defaultAnswer) {
      await ctx.runMutation(internal.questionSessionData.appendAnswer, { sessionId, field: args.field, answer: args.defaultAnswer });
    }
    await ctx.runMutation(internal.questionSessionData.markComplete, { sessionId });
    return { complete: true };
  },
});
