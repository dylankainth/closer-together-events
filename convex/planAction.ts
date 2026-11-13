"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { parseAudience, retrieve, rerank } from "./funnel";
import { pickDate, venueOptions, titleFor, vendorDrafts, makePoster } from "./plan";
import { CONFIG } from "./museConfig";
import type { CallBudget, EventSettings, HostAnswers, Persona, Venue } from "./types";
import { HOST_ID } from "./seedData";
import { requireActor } from "./authz";

/**
 * Orchestrates the whole host-wizard "planEvent" pipeline: parseAudience -> retrieve -> pickDate
 * -> rerank -> venueOptions -> title/poster -> events.create. Per the team's adopted ballot
 * proposal (B2/B4): friendsOfFriends/quota are inferred here (not chosen by the host) and shown
 * back as reasoned, editable chips on the review screen rather than a fixed funnel "mode".
 */
export const planEvent = action({
  args: {
    hostId: v.string(),
    answers: v.object({ purpose: v.string(), vibe: v.string(), budget: v.union(v.literal(1), v.literal(2), v.literal(3)) }),
    audienceRaw: v.string(),
  },
  handler: async (ctx, args): Promise<{ eventId: string }> => {
    await requireActor(ctx, args.hostId, "write", "planAction.planEvent");
    const budget: CallBudget = { used: 0, max: CONFIG.maxCallsPerEvent };
    const personas: Persona[] = await ctx.runQuery(internal.personas.listAllInternal, {});
    const venues: Venue[] = await ctx.runQuery(internal.venues.list, {});
    const slots = (await ctx.runQuery(internal.slots.list, {})) as { id: string; label: string; part: string }[];

    const host = personas.find((p) => p.id === args.hostId) ?? personas.find((p) => p.id === HOST_ID)!;
    const answers = args.answers as HostAnswers;

    const parsed = await parseAudience(args.audienceRaw, budget);
    const query = parsed.data;

    // Infer friendsOfFriends/quota (B2/B4): on only when the audience reads broad ("any" tie, no
    // close-friends language) and the host's network alone can't fill a reasonable quota; unsure
    // defaults to the safe side (off, small), per the team's adopted ballot guardrail.
    const closePool = retrieve(query, personas, { friendsOfFriends: false, quota: 0, reasons: { friendsOfFriends: "", quota: "", guestCount: "" } }, host.id);
    const inferFriendsOfFriends = query.tie === "any" && closePool.length < 8;
    const quota = Math.max(6, Math.min(CONFIG.displaySize, closePool.length || 8));
    const settings: EventSettings = {
      friendsOfFriends: inferFriendsOfFriends,
      quota,
      reasons: {
        friendsOfFriends: inferFriendsOfFriends ? "Your close network alone looked thin for this, so widened to friends of friends." : "Kept to your direct friends.",
        quota: `${quota} guests fits ${query.tie === "close" ? "a close-friends" : "this"} event.`,
        guestCount: `${quota} invites planned.`,
      },
    };

    const pool = retrieve(query, personas, settings, host.id);
    const prelimGuests = pool.slice(0, CONFIG.displaySize).map((x) => x.p);
    const datePick = await pickDate(slots, prelimGuests, budget);

    const reranked = await rerank(pool, query, datePick.slotId, settings, personas, budget);
    const shortlist = reranked.data;

    const shownGuestCount = Math.max(shortlist.filter((s) => s.selected).length, 6);
    const venueChoices = venueOptions(venues, answers, query.topics, shownGuestCount);
    const venue = venueChoices[0] ?? venues[0];
    const slot = slots.find((s) => s.id === datePick.slotId)!;

    const title = titleFor(host.name.split(" ")[0], answers, query.topics);
    const poster = await makePoster(title, slot, venue, answers.vibe, budget);
    const drafts = vendorDrafts(answers, title, slot, venue, shownGuestCount);

    const eventId = `evt_${Date.now().toString(36)}`;
    await ctx.runMutation(internal.events.create, {
      event: {
        eventId,
        hostId: host.id,
        title,
        status: "draft",
        answers,
        audienceRaw: args.audienceRaw,
        query,
        settings,
        slotId: datePick.slotId,
        dateCheck: { note: datePick.note, can: datePick.can, of: datePick.of, source: datePick.source },
        venueId: venue.id,
        venueOptions: venueChoices,
        poster,
        drafts,
        shortlist,
        museSource: datePick.source,
        museCalls: budget.used,
        huddleSeq: 0,
        createdAt: Date.now(),
      },
    });

    return { eventId };
  },
});
