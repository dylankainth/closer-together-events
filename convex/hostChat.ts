"use node";

import { z } from "zod";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { museJSON } from "./muse";
import { CONFIG } from "./museConfig";

/**
 * The host's ongoing chat with their Muse about getting the event done (checklist page > chat).
 * Unlike askAction.askAboutEvent (one question, no memory) this takes the recent conversation, and it
 * sees the live checklist, so "the cake order is stuck, what now?" is answerable. It only proposes:
 * it never claims to have paid for or ordered anything (vendors are simulated and the host approves).
 */
export const reply = action({
  args: {
    eventId: v.string(),
    message: v.string(),
    history: v.array(v.object({ from: v.union(v.literal("me"), v.literal("agent")), text: v.string() })),
  },
  handler: async (ctx, args) => {
    const message = args.message.trim().slice(0, 600);
    const event: any = await ctx.runQuery(internal.huddleData.getEventForHuddle, { eventId: args.eventId });
    if (!event) return { reply: "I couldn't find that event." };
    const checklist: any = await ctx.runQuery(api.checklist.forEvent, { eventId: args.eventId });

    const stuck = checklist?.items?.find((i: any) => i.state === "blocked");
    const next = checklist?.items?.find((i: any) => i.state === "active");
    const offline = stuck
      ? `${stuck.label}: ${stuck.detail} I can draft a message to another vendor. Want me to?`
      : next
        ? `Noted. ${checklist.doneCount} of ${checklist.total} steps are done and I'm on "${next.label}". I'll check with you before anything is paid or sent.`
        : "Noted. Everything on the list is done, so you can review and send when you're ready.";

    const budget = { used: 0, max: CONFIG.maxCallsPerEvent };
    const r = await museJSON({
      model: "spark",
      budget,
      effort: "low",
      system:
        "You are the host's Muse, helping them finish planning their event. Use ONLY the event and checklist data given. " +
        "Be concrete and brief (1-3 short sentences). If a step is blocked, say what is wrong and offer one next step. " +
        "Vendors are simulated: never claim to have paid, ordered or booked anything, and say you will ask first before committing.",
      user: {
        message,
        recent: args.history.slice(-8).map((m) => ({ from: m.from, text: m.text.slice(0, 400) })),
        event: { title: event.title, slotId: event.slotId, venueId: event.venueId, status: event.status, dateCheck: event.dateCheck },
        checklist: checklist ? { summary: checklist.summary, items: checklist.items.map((i: any) => ({ step: i.label, state: i.state, detail: i.detail })) } : null,
      },
      schema: z.object({ reply: z.string().max(500) }),
      fallback: () => ({ reply: offline }),
    });
    return { reply: r.data.reply };
  },
});
