"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { museJSON } from "./muse";
import { CONFIG } from "./museConfig";
import { z } from "zod";
import type { CallBudget } from "./types";
import type { Id } from "./_generated/dataModel";
import { requireActor } from "./authz";

// Core fields planEvent actually needs; "other" is for anything else Muse asks (constraints,
// date, etc.) that gets recorded but doesn't feed the mapping in questionSessionData.ts.
const CORE_FIELDS = ["purpose", "vibe", "audience", "budget", "visibility"] as const;
const MAX_ROUNDS = 6; // hard cap so a live model that never says "complete" can't strand the host

const QuestionSchema = z.object({
  kind: z.union([z.literal("question"), z.literal("complete")]),
  field: z.enum(["purpose", "vibe", "audience", "budget", "visibility", "other"]).optional(),
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
  audience: { kind: "question", field: "audience", question: "Who is it for?", options: ["My closest friends", "Friends who'd get along", "Anyone I know"], defaultOption: "My closest friends", inputType: "chips" },
  // This answer is the host's consent for BOTH ways an event reaches someone they didn't pick:
  // allowGuestInvites (a guest spends their one plus-one) and allowSpread (a yes automatically
  // surfaces it to that guest's close friends) — see planAction. The note has to describe both,
  // or the host approves plus-ones and silently gets the spread loop too, which is the §5.3
  // Marketplace lesson exactly: one button covering two different grants.
  visibility: { kind: "question", field: "visibility", question: "Is this public or private?", note: "Public lets guests bring a friend, and when someone says yes their close friends can be shown it too — each still decides for themselves. Private means neither: only the people you invite.", options: ["Private (only who I invite)", "Public (can reach friends of guests)"], defaultOption: "Private (only who I invite)", inputType: "chips" },
  budget: { kind: "question", field: "budget", question: "Budget per head?", options: ["Under £25", "£25-35", "£35+", "I'm paying"], defaultOption: "£25-35", inputType: "chips" },
};

function missingCoreFields(answers: Record<string, unknown>): (typeof CORE_FIELDS)[number][] {
  return CORE_FIELDS.filter((f) => !(f in answers));
}

export const startQuestionSession = action({
  args: { hostId: v.string(), initialDescription: v.string() },
  handler: async (ctx, args): Promise<{ sessionId: string; field?: string; question: string; note?: string; options?: string[]; defaultOption?: string; inputType: "chips" | "text" }> => {
    await requireActor(ctx, args.hostId, "write", "questionSession.startQuestionSession");
    const sessionId: Id<"questionSessions"> = await ctx.runMutation(internal.questionSessionData.createSession, {
      hostId: args.hostId,
      description: args.initialDescription,
    });

    const budget: CallBudget = { used: 0, max: CONFIG.maxCallsPerEvent };
    // ember measured ~4-5x faster than spark for this exact prompt (~1.7s vs ~9.5s), same
    // quality/schema-conformance — worth the deviation from the spark="structured output"
    // convention for a call on the host's critical path.
    const r = await museJSON({
      model: "ember",
      budget,
      effort: "low",
      system:
        'You are Muse helping a host plan an event. They just described it in one line. Ask ONE friendly follow-up question to learn more — skip anything the description already answers. Always propose your own best-guess default so the host can just accept it. Keep the question under 200 characters, and any "note" under 140. Offer 2-6 chip options if the answer is categorical, otherwise free text (no voice input). Never ask for home address, phone number, email, or secrets. Return {"kind":"question", "field": "purpose"|"vibe"|"audience"|"budget"|"visibility"|"other", "question": string, "note"?: string, "options"?: string[], "defaultOption"?: string (must be one of options), "inputType"?: "chips"|"text"}. "field" names which of purpose/vibe/audience/budget/visibility this question is collecting — use "other" only if it fits none of those. "visibility" is whether the event is public or private, and it is the host\'s consent for BOTH ways the event can reach someone they did not pick: a guest bringing one friend, AND a guest saying yes causing it to be shown to that guest\'s close friends (who each still decide for themselves). Always ask it, say what public grants rather than only mentioning plus-ones, and use the two options "Private (only who I invite)" and "Public (can reach friends of guests)".',
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
    // Check who owns the session BEFORE writing the answer into it.
    const owner = await ctx.runQuery(internal.questionSessionData.getSession, { sessionId });
    if (!owner) throw new Error("Session not found");
    await requireActor(ctx, owner.hostId, "write", "questionSession.submitAnswer");
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
      model: "ember",
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
    // Only the session's host may finish it (checked before any write).
    const owner = await ctx.runQuery(internal.questionSessionData.getSession, { sessionId });
    if (!owner) throw new Error("Session not found");
    await requireActor(ctx, owner.hostId, "write", "questionSession.skipRest");
    if (args.field && args.defaultAnswer) {
      await ctx.runMutation(internal.questionSessionData.appendAnswer, { sessionId, field: args.field, answer: args.defaultAnswer });
    }
    await ctx.runMutation(internal.questionSessionData.markComplete, { sessionId });
    return { complete: true };
  },
});
