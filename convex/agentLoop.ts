"use node";

// The real "your agent is on it" engine: drives the event's plan to completion one genuine tool
// call at a time, instead of planAction's old single synchronous pipeline. Each turn, the model
// picks ONE next tool from whatever's currently legal (agentTools.availableTools), that tool
// actually runs (hitting Muse where the underlying plan.ts/funnel.ts functions do), and the
// result is appended to the event's agentLog + applied to the event doc — which checklist.ts's
// live query picks up immediately, so the client sees real progress land over real seconds, not a
// scripted replay of an already-finished plan.

import { z } from "zod";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { museJSON } from "./muse";
import { CONFIG } from "./museConfig";
import { TOOLS, availableTools, planComplete } from "./agentTools";
import type { CallBudget } from "./types";

const MAX_STEPS = 10; // one more than the real tool count — a safety net, not a target

export const run = internalAction({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const budget: CallBudget = { used: 0, max: CONFIG.maxCallsPerEvent };

    for (let i = 0; i < MAX_STEPS; i++) {
      const event: any = await ctx.runQuery(internal.huddleData.getEventForHuddle, { eventId: args.eventId });
      if (!event || event.status !== "draft") return; // event gone, or host already moved it past planning

      // Stop at anything waiting on the host instead of working around it. A drafted vendor order
      // is a real decision ("order the pizza?"), so carrying on past it would mean the rest of the
      // plan was built on an answer the host never gave. A Convex action can't sit blocked for
      // minutes, so the loop EXITS here — events.approveDraft/rejectDraft re-schedule it, and it
      // picks up from whatever the event doc looks like then.
      const pending = (event.drafts ?? []).filter((d: any) => d.status === "pending");
      if (pending.length > 0) {
        const log = (event.agentLog ?? []) as any[];
        // Only log the pause once, however many times approve/reject re-enters this loop.
        if (log[log.length - 1]?.tool !== "awaiting_approval") {
          await ctx.runMutation(internal.events.appendAgentLog, {
            eventId: args.eventId,
            tool: "awaiting_approval",
            args: { items: pending.map((d: any) => d.item) },
            summary: `Waiting on you: ${pending.map((d: any) => d.item).join(", ")}. Nothing else moves until you decide.`,
            source: "offline",
          });
        }
        return;
      }

      const options = availableTools(event);
      const canFinish = planComplete(event);
      if (options.length === 0 && !canFinish) return; // truly stuck — nothing left it's allowed to try

      const names = [...options.map((t) => t.name), ...(canFinish ? ["finish"] : [])];
      const decision = await museJSON({
        model: "wonder",
        effort: "low",
        budget,
        system:
          "You are the host's Muse, planning their event one real step at a time. You will be shown which tools you're " +
          "currently allowed to call (only the ones whose prerequisites are met) and the log of what you've done so far. " +
          "Pick exactly one tool to call next. " +
          (canFinish
            ? 'Everything required is done — call "finish" unless something genuinely still needs attention. '
            : "") +
          'Return {"tool": one of the given names, "args": object (optional, only for choose_venue\'s venue_id)}.',
        user: {
          available_tools: options.map((t) => ({ name: t.name, description: t.description })).concat(canFinish ? [{ name: "finish", description: "Nothing left to do before the host reviews it." }] : []),
          done_so_far: (event.agentLog ?? []).map((l: any) => ({ tool: l.tool, summary: l.summary })),
          venue_options: options.some((t) => t.name === "choose_venue") ? (event.venueOptions ?? []).map((v: any) => ({ venue_id: v.id, name: v.name, area: v.area })) : undefined,
        },
        schema: z.object({ tool: z.enum(names as [string, ...string[]]), args: z.record(z.string(), z.any()).optional() }),
        fallback: (): { tool: string; args?: Record<string, any> } => ({ tool: names[0] }),
      });

      const toolName = names.includes(decision.data.tool) ? decision.data.tool : names[0];

      if (toolName === "finish") {
        await ctx.runMutation(internal.events.appendAgentLog, {
          eventId: args.eventId,
          tool: "finish",
          args: {},
          summary: "Plan complete — ready for your review.",
          source: decision.source,
        });
        return;
      }

      const tool = options.find((t) => t.name === toolName)!;
      let result;
      try {
        result = await tool.run(ctx, event, decision.data.args ?? {}, budget);
      } catch (e) {
        // A tool threw (bad upstream data, a budget edge case) — log it plainly rather than let
        // the whole loop die silently; the host still sees what happened and can ask in chat.
        await ctx.runMutation(internal.events.appendAgentLog, {
          eventId: args.eventId,
          tool: toolName,
          args: decision.data.args ?? {},
          summary: `Hit a snag on "${toolName}": ${e instanceof Error ? e.message : String(e)}.`,
          source: "offline",
        });
        return;
      }

      await ctx.runMutation(internal.events.applyAgentStep, {
        eventId: args.eventId,
        patch: result.patch,
        tool: toolName,
        args: decision.data.args ?? {},
        summary: result.summary,
        source: decision.source,
      });
    }
  },
});
