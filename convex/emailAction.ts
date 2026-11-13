"use node";

// Real vendor email for the host's cake order — the one "commit" step that actually leaves the
// app. Muse composes the order from the event's pending cake draft; delivery goes through an email
// provider IF a key is configured, otherwise it logs and no-ops. Same silent-fallback contract as
// muse.ts: a missing key or a failed send never throws past this boundary, so the task flow and
// the demo work end-to-end with no credential (a real send is a RESEND_API_KEY drop-in).

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { museJSON } from "./muse";
import { CONFIG } from "./museConfig";

const RECIPIENT = process.env.CAKE_ORDER_TO ?? "kainth.dylan@gmail.com";

/** Muse writes a clean subject+body from the event's pending cake draft; falls back to the draft
 * text already on the event when Muse isn't live. */
async function composeCakeEmail(event: any): Promise<{ subject: string; body: string }> {
  const cake = (event.drafts ?? []).find((d: any) => d.id === "cake" || d.item === "cake");
  const fallbackBody = cake?.draft ?? `Hi! Could we order a cake for "${event.title}"? Thank you.`;
  const r = await museJSON({
    model: "spark",
    effort: "low",
    budget: { used: 0, max: CONFIG.maxCallsPerEvent },
    system:
      "Write a short, friendly cake-order email to a bakery on the host's behalf, under 90 words, " +
      'ready to send with no unfilled placeholders. Return {"subject": string, "body": string}.',
    user: { event_title: event.title, cake_draft: cake ?? null },
    schema: z.object({ subject: z.string().max(140), body: z.string().max(1200) }),
    fallback: () => ({ subject: `Cake order — ${event.title}`, body: fallbackBody }),
  });
  return r.data;
}

/** Send via the provider when a key is set; otherwise log and report offline. Never throws. */
async function deliver(to: string, subject: string, body: string): Promise<{ sent: boolean; via: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log("[cakeEmail offline] would send to", to, "|", subject);
    return { sent: false, via: "offline" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.CAKE_ORDER_FROM ?? "Muse Events <onboarding@resend.dev>",
        to,
        subject,
        text: body,
      }),
    });
    if (res.ok) return { sent: true, via: "resend" };
    console.error("[cakeEmail] non-ok", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[cakeEmail] fetch failed", e instanceof Error ? e.message : e);
  }
  return { sent: false, via: "error" };
}

/** Called from events.approveTask once the host approves an "order_cake" task: composes and sends
 * the cake order, then marks the task done with what actually happened. */
export const sendCakeOrder = internalAction({
  args: { eventId: v.string(), taskId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const event: any = await ctx.runQuery(internal.huddleData.getEventForHuddle, { eventId: args.eventId });
    if (!event) return;
    const { subject, body } = await composeCakeEmail(event);
    const { sent, via } = await deliver(RECIPIENT, subject, body);
    const detail = sent ? `Cake order emailed to ${RECIPIENT}.` : `Cake order prepared for ${RECIPIENT} (not sent: ${via}).`;
    if (args.taskId) {
      await ctx.runMutation(internal.events.updateTask, {
        eventId: args.eventId,
        taskId: args.taskId,
        patch: { status: "done", detail, needsYou: undefined },
      });
    }
  },
});
