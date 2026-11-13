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

// Env-only: never hardcode a teammate's address in source (this repo goes public for Devpost).
// Empty => treated as offline (composed + logged, not sent) until CAKE_ORDER_TO is set on Convex.
const RECIPIENT = process.env.CAKE_ORDER_TO ?? "";

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

/** Send via the provider when a key AND recipient are set; otherwise log and report offline. The
 * Idempotency-Key makes a retry or double-approval a no-op upstream, so one approval = one email.
 * Never throws. */
async function deliver(to: string, subject: string, body: string, idempotencyKey: string): Promise<{ sent: boolean; via: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) {
    console.log("[cakeEmail offline] not sending —", key ? "no recipient configured" : "no provider key");
    return { sent: false, via: "offline" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
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
  } finally {
    clearTimeout(timer);
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
    const markDone = (detail: string) =>
      args.taskId
        ? ctx.runMutation(internal.events.updateTask, { eventId: args.eventId, taskId: args.taskId, patch: { status: "done", detail, needsYou: undefined } })
        : Promise.resolve();

    const cake = (event.drafts ?? []).find((d: any) => d.id === "cake" || d.item === "cake");
    if (cake?.status === "rejected") {
      await markDone("Cake order skipped — the draft was rejected.");
      return;
    }
    const { subject, body } = await composeCakeEmail(event);
    const { sent, via } = await deliver(RECIPIENT, subject, body, `${args.eventId}:${args.taskId ?? "cake"}`);
    await markDone(sent ? "Cake order emailed to the demo inbox." : `Cake order prepared (not sent: ${via}).`);
  },
});
