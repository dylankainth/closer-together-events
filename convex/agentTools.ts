"use node";

// The real tool surface for the planning agent (convex/agentLoop.ts) — the backend half of "your
// agent is on it". Each tool wraps the same pure/Muse-calling functions the old one-shot
// planAction.planEvent pipeline used (plan.ts, funnel.ts), but as an independently callable step
// with its own preconditions, so the loop genuinely picks what to do next rather than running a
// hardcoded sequence. `availableTools(event)` is what gives the model real, state-dependent
// choice: once a venue is chosen, both generate_cover and draft_vendor_orders unlock at the same
// time, and the agent decides which to do first.

import { internal } from "./_generated/api";
import { parseAudience, retrieve, rerank } from "./funnel";
import { pickDate, venueOptions, titleFor, vendorDrafts, makePoster, ORDERABLE_VENDOR_IDS } from "./plan";
import { applyPins } from "./shortlistPolicy";
import { CONFIG } from "./museConfig";
import type { CallBudget, Persona } from "./types";

export interface ToolResult {
  summary: string;
  patch: Record<string, unknown>;
}

export interface Tool {
  name: string;
  description: string;
  run: (ctx: any, event: any, args: any, budget: CallBudget) => Promise<ToolResult>;
}

async function loadPersonas(ctx: any): Promise<Persona[]> {
  return ctx.runQuery(internal.personas.listAllInternal, {});
}

const match_audience: Tool = {
  name: "match_audience",
  description: "Read the host's audience description and work out who it's for: tie-strength (close vs any), topics, and whether to widen to friends of friends.",
  run: async (ctx, event, _args, budget) => {
    const personas = await loadPersonas(ctx);
    const host = personas.find((p) => p.id === event.hostId)!;
    const parsed = await parseAudience(event.audienceRaw, budget);
    const query = parsed.data;

    // Ballot B2/B4: infer friendsOfFriends + quota rather than ask the host to set a funnel mode.
    const closePool = retrieve(query, personas, { friendsOfFriends: false, quota: 0, reasons: { friendsOfFriends: "", quota: "", guestCount: "" } }, host.id);
    const inferFriendsOfFriends = query.tie === "any" && closePool.length < 8;
    const quota = Math.max(6, Math.min(CONFIG.displaySize, closePool.length || 8));
    const settings = {
      friendsOfFriends: inferFriendsOfFriends,
      quota,
      reasons: {
        friendsOfFriends: inferFriendsOfFriends ? "Your close network alone looked thin for this, so widened to friends of friends." : "Kept to your direct friends.",
        quota: `${quota} guests fits ${query.tie === "close" ? "a close-friends" : "this"} event.`,
        guestCount: `${quota} invites planned.`,
      },
    };
    const title = titleFor(host.name.split(" ")[0], event.answers, query.topics);

    return {
      summary: `Read "${event.audienceRaw}" as ${query.tie === "close" ? "close friends" : "an open ask"}${query.topics.length ? `, topics: ${query.topics.join(", ")}` : ""}. ${settings.reasons.friendsOfFriends}`,
      patch: { query, settings, title },
    };
  },
};

const check_availability: Tool = {
  name: "check_availability",
  description: "Check guest availability against the open date slots and pick the one that works for the most people.",
  run: async (ctx, event, _args, budget) => {
    const personas = await loadPersonas(ctx);
    const slots: any[] = await ctx.runQuery(internal.slots.list, {});
    const host = personas.find((p) => p.id === event.hostId)!;
    const pool = retrieve(event.query, personas, event.settings, host.id);
    const prelimGuests = pool.slice(0, CONFIG.displaySize).map((x) => x.p);
    const datePick = await pickDate(slots, prelimGuests, budget);
    const slot = slots.find((s) => s.id === datePick.slotId);
    return {
      summary: `Picked ${slot?.label ?? datePick.slotId} — works for ${datePick.can} of ${datePick.of} guests. ${datePick.note}`,
      patch: { slotId: datePick.slotId, dateCheck: { note: datePick.note, can: datePick.can, of: datePick.of, source: datePick.source } },
    };
  },
};

const rank_guests: Tool = {
  name: "rank_guests",
  description: "Rank the matched candidates for this event and write a one-line reason each; pick who makes the shortlist.",
  run: async (ctx, event, _args, budget) => {
    const personas = await loadPersonas(ctx);
    const host = personas.find((p) => p.id === event.hostId)!;
    const pool = retrieve(event.query, personas, event.settings, host.id);
    const reranked = await rerank(pool, event.query, event.slotId, event.settings, personas, budget);
    // Pins outrank rank: a host who picked "my 10 best friends" before this rerank ran must still
    // see them selected afterwards, even though rerank() just rebuilt selected purely by rank.
    const quota = event.settings?.quota ?? CONFIG.displaySize;
    const pinnedIds: string[] = event.pinnedGuestIds ?? [];
    const shortlist = applyPins(reranked.data, pinnedIds, quota);
    const picked = shortlist.filter((s) => s.selected).length;
    const pinnedPresent = shortlist.filter((s) => pinnedIds.includes(s.personaId)).length;
    const pinNote = pinnedPresent ? ` ${pinnedPresent} pinned guest${pinnedPresent === 1 ? "" : "s"} kept regardless of rank.` : "";
    return {
      summary: `Ranked ${shortlist.length} candidates — ${picked} selected to invite.${pinNote}`,
      patch: { shortlist },
    };
  },
};

const search_venues: Tool = {
  name: "search_venues",
  description: "Search venues that fit the vibe, budget and guest count; shortlist up to 3.",
  run: async (ctx, event) => {
    const venues: any[] = await ctx.runQuery(internal.venues.list, {});
    const picked = (event.shortlist ?? []).filter((s: any) => s.selected).length;
    const shownGuestCount = Math.max(picked, 6);
    const choices = venueOptions(venues, event.answers, event.query.topics, shownGuestCount);
    return {
      summary: choices.length ? `Shortlisted ${choices.map((v: any) => v.name).join(", ")}.` : "Nothing fit that guest count exactly — will fall back to the closest option.",
      patch: { venueOptions: choices },
    };
  },
};

const choose_venue: Tool = {
  name: "choose_venue",
  description: "Choose one venue from the shortlisted options (pass venue_id), or let the top match stand.",
  run: async (ctx, event, args) => {
    const options: any[] = event.venueOptions ?? [];
    let chosen = options.find((v) => v.id === args?.venue_id) ?? options[0];
    if (!chosen) {
      const venues: any[] = await ctx.runQuery(internal.venues.list, {});
      chosen = venues[0];
    }
    return { summary: `Chose ${chosen.name} — ${chosen.area}, fits ${chosen.capacity}. ${chosen.note ?? ""}`.trim(), patch: { venueId: chosen.id } };
  },
};

const generate_cover: Tool = {
  name: "generate_cover",
  description: "Generate the invite poster/cover art for the chosen date and venue.",
  run: async (ctx, event, _args, budget) => {
    const slots: any[] = await ctx.runQuery(internal.slots.list, {});
    const venues: any[] = await ctx.runQuery(internal.venues.list, {});
    const slot = slots.find((s) => s.id === event.slotId);
    const venue = venues.find((v) => v.id === event.venueId);
    const poster = await makePoster(event.title, slot, venue, event.answers?.vibe ?? "Lively", budget);
    return {
      summary: `Generated the invite cover${poster.source === "muse" ? " with Muse Image" : " (offline placeholder)"}.`,
      patch: { poster },
    };
  },
};

const draft_vendor_orders: Tool = {
  name: "draft_vendor_orders",
  description: "Draft simulated vendor enquiries (cake, venue booking, etc.) for the host to approve. Nothing is paid or sent.",
  run: async (ctx, event) => {
    const slots: any[] = await ctx.runQuery(internal.slots.list, {});
    const venues: any[] = await ctx.runQuery(internal.venues.list, {});
    const slot = slots.find((s) => s.id === event.slotId);
    const venue = venues.find((v) => v.id === event.venueId);
    const headcount = Math.max((event.shortlist ?? []).filter((s: any) => s.selected).length, event.settings?.quota ?? 6);
    const drafts = vendorDrafts(event.answers, event.title, slot, venue, headcount);
    // If there's a food order to place, queue a real vendor-email task for the host to approve
    // (dedup'd in events.addTask). This is the one draft that leaves the app for real, on the host's
    // OK — a cake for a birthday, pizza for a watch/game night, snacks for a housewarming.
    const order = drafts.find((d: any) => (ORDERABLE_VENDOR_IDS as readonly string[]).includes(d.id));
    if (order) {
      await ctx.runMutation(internal.events.addTask, {
        eventId: event.eventId,
        label: `Order the ${order.item}`,
        detail: `Email a ${order.item} order to ${order.vendor}.`,
        kind: "order_cake",
      });
      // Surface the approval prompt now rather than waiting on a later task to drive the queue.
      await ctx.scheduler.runAfter(0, internal.taskRunner.runNext, { eventId: event.eventId });
    }
    const suffix = order ? ` The ${order.item} order is a real email, queued for your OK.` : "";
    return { summary: `Drafted ${drafts.length} vendor enquiries (others simulated).${suffix}`, patch: { drafts } };
  },
};

// No "send_invites" tool here on purpose: sending always needs the host's explicit go-ahead
// (claude.md §5.3), so that step lives in the tasks/taskRunner approval flow, not this loop.
export const TOOLS: Tool[] = [match_audience, check_availability, rank_guests, search_venues, choose_venue, generate_cover, draft_vendor_orders];

/** What the agent may legally do right now, given what's already on the event doc. The loop only
 * ever offers tools whose preconditions hold — this (not a fixed order) is what makes each step a
 * real decision: once a venue is chosen, generate_cover and draft_vendor_orders unlock together. */
export function availableTools(e: any): Tool[] {
  const ranMatchAudience = (e.agentLog ?? []).some((l: any) => l.tool === "match_audience");
  if (!ranMatchAudience) return [match_audience];

  const list: Tool[] = [];
  if (!e.slotId) list.push(check_availability);
  if (e.slotId && !e.shortlist) list.push(rank_guests);
  if (e.shortlist && !e.venueOptions) list.push(search_venues);
  if (e.venueOptions && !e.venueId) list.push(choose_venue);
  if (e.venueId && !e.poster) list.push(generate_cover);
  if (e.venueId && !e.drafts) list.push(draft_vendor_orders);
  return list;
}

/** True once every tool the loop can run has run — the agent still has to call "finish" itself
 * (agentLoop.ts offers it as an explicit option once this holds); this just says the option exists. */
export function planComplete(e: any): boolean {
  return !!(e.slotId && e.venueId && e.poster && e.drafts && e.shortlist);
}
