"use node";

import { z } from "zod";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { museJSON } from "./muse";
import { CONFIG } from "./museConfig";

/** Manage screen's "Chat with muse" box: answers questions about the event from its own fields only. */
export const askAboutEvent = action({
  args: { eventId: v.string(), question: v.string() },
  handler: async (ctx, args) => {
    const event: any = await ctx.runQuery(internal.huddleData.getEventForHuddle, { eventId: args.eventId });
    if (!event) return { answer: "I couldn't find that event." };
    const budget = { used: 0, max: CONFIG.maxCallsPerEvent };
    const r = await museJSON({
      model: "spark",
      budget,
      effort: "low",
      system: "Answer the host's question about their own event using ONLY the event data given. Keep it to 1-2 short sentences.",
      user: { question: args.question, event: { title: event.title, slotId: event.slotId, venueId: event.venueId, status: event.status, settings: event.settings, dateCheck: event.dateCheck } },
      schema: z.object({ answer: z.string().max(300) }),
      fallback: () => ({ answer: `${event.title} is ${event.status} for ${event.slotId ?? "a date TBD"}.` }),
    });
    return r.data;
  },
});
