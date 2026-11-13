"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { HostAnswers, Persona } from "./types";
import { HOST_ID } from "./seedData";
import { requireActor } from "./authz";

/**
 * Creates the bare draft event and hands it straight to agentLoop.run, which is what actually
 * plans it (match_audience -> check_availability -> rank_guests -> search_venues -> choose_venue
 * -> generate_cover / draft_vendor_orders -> finish), one real tool call at a time. This used to
 * run that whole pipeline synchronously and return a finished event; now it returns almost
 * instantly with a near-empty draft, and checklist.ts's live query shows the plan filling in over
 * the next several real seconds as agentLoop actually works through it — "your agent is on it"
 * is no longer a client-side replay of an already-finished plan.
 */
export const planEvent = action({
  args: {
    hostId: v.string(),
    answers: v.object({ purpose: v.string(), vibe: v.string(), budget: v.union(v.literal(1), v.literal(2), v.literal(3)) }),
    audienceRaw: v.string(),
    visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
  },
  handler: async (ctx, args): Promise<{ eventId: string }> => {
    await requireActor(ctx, args.hostId, "write", "planAction.planEvent");
    const personas: Persona[] = await ctx.runQuery(internal.personas.listAllInternal, {});
    const host = personas.find((p) => p.id === args.hostId) ?? personas.find((p) => p.id === HOST_ID)!;
    const visibility = args.visibility ?? "private";
    const answers = { ...args.answers, visibility } as HostAnswers;

    const eventId = `evt_${Date.now().toString(36)}`;
    await ctx.runMutation(internal.events.create, {
      event: {
        eventId,
        hostId: host.id,
        title: "Planning your event…", // overwritten by match_audience, the loop's first real step
        status: "draft",
        answers,
        audienceRaw: args.audienceRaw,
        // Public events let guests bring a friend (convex/plusOnes.ts); private ones never do.
        allowGuestInvites: visibility === "public",
        museCalls: 0,
        huddleSeq: 0,
        createdAt: Date.now(),
      },
    });
    await ctx.scheduler.runAfter(0, internal.agentLoop.run, { eventId });

    return { eventId };
  },
});
