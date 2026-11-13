"use node";

import { z } from "zod";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { museJSON } from "./muse";
import { CONFIG } from "./museConfig";

/**
 * Drives the event's `tasks` queue (chat-added checklist items, see events.addTask) one item at a
 * time: picks the first "todo" task, marks it active, and either settles it from data already on
 * the event ("done") or stops and surfaces a permission ask ("blocked") — same "ask before
 * committing anything" rule as the rest of the plan (claude.md §5.3). A "blocked" task halts the
 * queue; approveTask/rejectTask re-schedule this to pick up wherever it left off, so later tasks
 * never jump ahead of one still waiting on the host.
 */
export const runNext = internalAction({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const event: any = await ctx.runQuery(internal.huddleData.getEventForHuddle, { eventId: args.eventId });
    if (!event) return;
    const tasks: any[] = event.tasks ?? [];
    const task = tasks.find((t) => t.status === "todo");
    if (!task) return;

    await ctx.runMutation(internal.events.updateTask, { eventId: args.eventId, taskId: task.id, patch: { status: "active" } });

    // "send_invites" always needs the host's go-ahead — committing (sending, RSVPing, sharing
    // location) always asks first, so this never tries to resolve itself.
    if (task.kind === "send_invites") {
      await ctx.runMutation(internal.events.updateTask, {
        eventId: args.eventId,
        taskId: task.id,
        patch: {
          status: "blocked",
          needsYou: {
            title: "Send invites?",
            body: "I'll invite your shortlisted guests and their Muses will start deciding. Nothing goes out until you say go.",
          },
        },
      });
      return;
    }

    // "order_cake" is a real vendor email — a commit action, so it waits for the host's go-ahead
    // the same way send_invites does. The actual send happens in events.approveTask -> emailAction.
    if (task.kind === "order_cake") {
      const cake = (event.drafts ?? []).find((d: any) => d.id === "cake" || d.item === "cake");
      const preview = cake?.draft ? ` Draft: "${cake.draft}"` : "";
      await ctx.runMutation(internal.events.updateTask, {
        eventId: args.eventId,
        taskId: task.id,
        patch: {
          status: "blocked",
          needsYou: {
            title: "Order the cake?",
            body: `Say go and I'll email this cake order to our demo inbox — nothing is sent until you approve.${preview}`,
          },
        },
      });
      return;
    }

    const budget = { used: 0, max: CONFIG.maxCallsPerEvent };
    const Schema = z.object({
      canResolve: z.boolean(),
      result: z.string().max(300).optional(),
      needsApprovalPrompt: z.string().max(200).optional(),
    });
    const r = await museJSON({
      model: "spark",
      budget,
      effort: "low",
      system:
        "You are the host's Muse working through their event checklist one item at a time. For this task, decide: " +
        "if you can settle it with a concrete answer using ONLY the event data given, set canResolve true and fill result " +
        "(1-2 short sentences stating what you did or found). If doing this for real would mean messaging someone, spending " +
        "money, changing a confirmed part of the plan, or anything else the host hasn't already approved, set canResolve " +
        "false and fill needsApprovalPrompt with the one specific permission you need, phrased as a question.",
      user: {
        task: { label: task.label, detail: task.detail },
        event: { title: event.title, slotId: event.slotId, venueId: event.venueId, status: event.status },
      },
      schema: Schema,
      fallback: () => ({ canResolve: false, needsApprovalPrompt: `Want me to go ahead with "${task.label}"?` }),
    });

    if (r.data.canResolve) {
      await ctx.runMutation(internal.events.updateTask, {
        eventId: args.eventId,
        taskId: task.id,
        patch: { status: "done", detail: r.data.result ?? "Done." },
      });
      // Settled without needing the host — keep working through whatever's queued next.
      await ctx.scheduler.runAfter(0, internal.taskRunner.runNext, { eventId: args.eventId });
    } else {
      await ctx.runMutation(internal.events.updateTask, {
        eventId: args.eventId,
        taskId: task.id,
        patch: {
          status: "blocked",
          needsYou: { title: "One thing from you", body: r.data.needsApprovalPrompt ?? `Want me to go ahead with "${task.label}"?` },
        },
      });
    }
  },
});
