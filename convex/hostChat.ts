"use node";

import { z } from "zod";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { museJSON } from "./muse";
import { editPoster } from "./plan";
import { CONFIG } from "./museConfig";
import { requireHost } from "./authz";
import type { Slot, Venue } from "./types";

// Catches "change the poster colour/look/style" even when the live call is offline and the model
// never got a chance to propose editPoster itself — e.g. "I don't like the colour on the cover
// art, can you fix it" never reaches the model if museJSON falls back, so without this the host's
// request silently does nothing (the generic offline reply doesn't act on anything).
// "flyer" is what hosts actually call it — the screen is even named flyer.tsx — so leaving it out
// meant "change the flyer picture" matched nothing and silently did nothing.
const POSTER_WORDS = /\b(poster|flyer|cover art|invite (?:image|art|picture))\b/i;
const LOOK_WORDS = /\b(colou?r|look|style|design|vibe|palette|blue|pink|purple|violet|green|red|orange|gold|dark|moody|black|warm)\b/i;
// Asking to CHANGE it is a request on its own — "change the flyer picture" names no colour or
// mood, and requiring one meant that plainest possible phrasing did nothing.
const CHANGE_WORDS = /\b(chang|replac|redo|regenerat|remake|new|different|another|updat|swap|fix)/i;
// Same reasoning as POSTER_WORDS/LOOK_WORDS: an offline fallback never reaches the model, so an
// obvious "send/email/notify the guests" ask needs to be caught here or it silently does nothing.
const SEND_WORDS = /\b(send|email|notify|message|tell|ping)\b.*\b(guest|everyone|invite|them|all)\b|\bsend (the )?invites?\b/i;

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
    // Only the host (or a demo operator) may spend Muse calls chatting about this event.
    await requireHost(ctx, event, "write", "hostChat.reply");

    // Persist both sides as they happen, so the thread survives closing the app. Every exit from
    // here goes through `say`, so a reply can't be shown to the host without being stored.
    await ctx.runMutation(internal.hostChatData.append, { eventId: args.eventId, from: "me", text: message });
    const say = async (text: string) => {
      await ctx.runMutation(internal.hostChatData.append, { eventId: args.eventId, from: "agent", text });
      return { reply: text };
    };

    const checklist: any = await ctx.runQuery(api.checklist.forEvent, { eventId: args.eventId });
    const existingDrafts: any[] = event.drafts ?? [];

    const stuck = checklist?.items?.find((i: any) => i.state === "blocked");
    const next = checklist?.items?.find((i: any) => i.state === "active");
    const offline = stuck
      ? `${stuck.label}: ${stuck.detail} I can draft a message to another vendor. Want me to?`
      : next
        ? `Noted. ${checklist.doneCount} of ${checklist.total} steps are done and I'm on "${next.label}". I'll check with you before anything is paid or sent.`
        : "Noted. Everything on the list is done, so you can review and send when you're ready.";

    // Models drift on the draft-message field's name ("draft", "enquiry", "message", ...) despite
    // being told what to call it, so accept any of the likely synonyms rather than let a harmless
    // wording choice fail the whole schema and silently drop the proposal.
    const ReplySchema = z.object({
      reply: z.string().max(500),
      proposeOrder: z
        .object({
          vendor: z.string().max(60),
          item: z.string().max(60),
          draft: z.string().max(300).optional(),
          enquiry: z.string().max(300).optional(),
          message: z.string().max(300).optional(),
        })
        .optional(),
      editPoster: z.object({ instruction: z.string().max(200) }).optional(),
      sendInvites: z.boolean().optional(),
      tellGuests: z.object({ text: z.string().max(280) }).optional(),
      addTask: z.object({ label: z.string().max(60), detail: z.string().max(200) }).optional(),
    });
    type ReplyResult = z.infer<typeof ReplySchema>;

    const budget = { used: 0, max: CONFIG.maxCallsPerEvent };
    const r = await museJSON({
      model: "spark",
      budget,
      effort: "low",
      system:
        "You are the host's Muse, helping them finish planning their event. Use ONLY the event and checklist data given. " +
        "Be concrete and brief (1-3 short sentences). If a step is blocked, say what is wrong and offer one next step. " +
        "Vendors are simulated: never claim to have paid, ordered or booked anything, and say you will ask first before committing. " +
        "If the host asks you to get, order or arrange something (e.g. \"order pizza\") that isn't already in existingDrafts, " +
        "set proposeOrder to {vendor, item, draft} — vendor is a short name, item is what's being ordered, draft is the one-line " +
        "enquiry text (always use the key \"draft\" for that field). Tell them you've added it to their checklist for approval. " +
        "If it's already in existingDrafts, say so instead of proposing it again. " +
        "If the host wants the poster/flyer/cover art changed in any way (a different picture, colour, style, mood), set editPoster to {instruction} " +
        "describing the change in a few words, and tell them you've updated it. " +
        "If the host wants to TELL the people already coming something (e.g. moved to 8, bring a towel), "
        + "set tellGuests to {text} — the message in the host's own voice, one or two short sentences — "
        + "and confirm you have passed it on. Only when invites have already gone out; if the event has not "
        + "been sent yet, say so instead of pretending. " +
        "If the host asks you to send, email or notify the guests, or to send the invites now, set sendInvites to true " +
        "and tell them you've added it to the checklist and will ask once more before anything actually goes out. " +
        "If the host asks for anything else you can't already do with proposeOrder/editPoster/sendInvites (e.g. checking on " +
        "a specific guest, finding a backup option, anything else to track down), set addTask to {label, detail} — label is " +
        "a short checklist title (a few words), detail is one line on what it's for — and tell them you've added it to the " +
        "checklist and will work through it.",
      user: {
        message,
        recent: args.history.slice(-8).map((m) => ({ from: m.from, text: m.text.slice(0, 400) })),
        event: { title: event.title, slotId: event.slotId, venueId: event.venueId, status: event.status, dateCheck: event.dateCheck },
        checklist: checklist ? { summary: checklist.summary, items: checklist.items.map((i: any) => ({ step: i.label, state: i.state, detail: i.detail })) } : null,
        existingDrafts: existingDrafts.map((d) => ({ vendor: d.vendor, item: d.item })),
      },
      schema: ReplySchema,
      fallback: (): ReplyResult => ({ reply: offline }),
    });

    const proposal = r.data.proposeOrder;
    const draftText = proposal?.draft ?? proposal?.enquiry ?? proposal?.message;
    const duplicate = proposal && existingDrafts.some((d) => String(d.item).toLowerCase() === proposal.item.toLowerCase());
    if (proposal && draftText && !duplicate) {
      await ctx.runMutation(internal.events.proposeDraft, { eventId: args.eventId, vendor: proposal.vendor, item: proposal.item, draft: draftText });
    }

    // The model's own editPoster call only fires on a live response — if museJSON fell back
    // offline, the request never reached the model at all, so catch an obvious poster/colour
    // request here too rather than let it silently do nothing.
    const offlineLooksLikePosterEdit =
      r.source === "offline" && POSTER_WORDS.test(message) && (LOOK_WORDS.test(message) || CHANGE_WORDS.test(message));
    const posterInstruction = r.data.editPoster?.instruction ?? (offlineLooksLikePosterEdit ? message : null);
    if (posterInstruction) {
      const slots: Slot[] = (await ctx.runQuery(internal.slots.list, {})) as any;
      const venues: Venue[] = (await ctx.runQuery(internal.venues.list, {})) as any;
      const slot = slots.find((s) => s.id === event.slotId);
      const venue = venues.find((v2) => v2.id === event.venueId);
      if (slot && venue) {
        const poster = await editPoster(event.title, slot, venue, event.answers?.vibe ?? "Lively", posterInstruction, budget);
        await ctx.runMutation(internal.events.setPoster, { eventId: args.eventId, poster });
        if (offlineLooksLikePosterEdit) return say("Done — updated the flyer.");
      }
    }

    const offlineLooksLikeSend = r.source === "offline" && SEND_WORDS.test(message);
    if (r.data.sendInvites || offlineLooksLikeSend) {
      await ctx.runMutation(internal.events.addTask, {
        eventId: args.eventId,
        label: "Send invites",
        detail: "Invite your shortlisted guests — I'll ask before anything actually goes out.",
        kind: "send_invites",
      });
      await ctx.scheduler.runAfter(0, internal.taskRunner.runNext, { eventId: args.eventId });
      if (offlineLooksLikeSend) return say("Added to your checklist — I'll ask once more before anything actually goes out.");
    }
    if (r.data.tellGuests?.text) {
      if (event.status !== "sent") {
        return say("I can't pass that on yet — nothing has gone out, so there's nobody to tell. Send the invites first.");
      }
      // PROPOSE, don't send. This goes to every guest and the text above is the model's paraphrase
      // of what the host said, so the host approves the exact words first (claude.md §3.1, same
      // gate as a vendor order). taskRunner parks it; events.approveTask does the announcing.
      await ctx.runMutation(internal.events.addTask, {
        eventId: args.eventId,
        label: "Tell your guests",
        detail: r.data.tellGuests.text,
        kind: "announce",
      });
      await ctx.scheduler.runAfter(0, internal.taskRunner.runNext, { eventId: args.eventId });
      return say(`Ready to send: "${r.data.tellGuests.text}" — approve it on your checklist and it goes to everyone.`);
    }
    if (r.data.addTask) {
      await ctx.runMutation(internal.events.addTask, {
        eventId: args.eventId,
        label: r.data.addTask.label,
        detail: r.data.addTask.detail,
        kind: "custom",
      });
      await ctx.scheduler.runAfter(0, internal.taskRunner.runNext, { eventId: args.eventId });
    }

    return say(r.data.reply);
  },
});
