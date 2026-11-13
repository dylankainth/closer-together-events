import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireHost } from "./authz";
import { scrubDeep } from "./discoveryCore";

// The host's "Your agent is on it" checklist, DERIVED from the event doc rather than stored: each step
// is true when the planner has already produced its output. Keeping it derived means it stays correct
// when event creation changes, as long as the same fields keep being filled in.

export type StepState = "done" | "active" | "todo" | "blocked";
export type TraceLine = { kind: "tool" | "result" | "think"; text: string };
export type Step = { key: string; label: string; activeLabel: string; detail: string; state: StepState; explain: string; trace: TraceLine[] };

const BLOCKED = /(unavailable|can't|cannot|sold out|fully booked|halt|delay|declin|no longer)/i;
const TIER = ["", "$", "$$", "$$$"];

export const forEvent = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const e: any = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) return null;
    // Host-only: the checklist shows vendor drafts and planning state before anything is sent.
    await requireHost(ctx, e, "read", "checklist.forEvent");

    const slot = e.slotId ? await ctx.db.query("slots").withIndex("by_slotId", (q) => q.eq("slotId", e.slotId)).unique() : null;
    const venue = e.venueId ? await ctx.db.query("venues").withIndex("by_venueId", (q) => q.eq("venueId", e.venueId)).unique() : null;

    const drafts: any[] = e.drafts ?? [];
    const blockedDraft = drafts.find((d) => BLOCKED.test(String(d.simulatedReply ?? "")));
    const pendingDrafts = drafts.filter((d) => d.status === "pending");
    const picked: any[] = (e.shortlist ?? []).filter((s: any) => s.selected);
    const sent = e.status === "sent";

    const T = (text: string): TraceLine => ({ kind: "tool", text });
    const R = (text: string): TraceLine => ({ kind: "result", text });
    const K = (text: string): TraceLine => ({ kind: "think", text });
    const guestCountEarly = e.settings?.quota ?? picked.length;

    // The REAL trace: agentLoop.run records every tool call it actually made, in order. Where an
    // entry exists for a step, show what the agent genuinely did rather than the reconstructed
    // line below it — those reconstructions are a fallback for events planned before the loop
    // existed (and for steps the loop has not reached yet), not the source of truth.
    const logByTool = new Map<string, any>();
    for (const entry of (e.agentLog ?? []) as any[]) logByTool.set(entry.tool, entry);
    const STEP_TOOL: Record<string, string> = {
      date: "check_availability",
      venues: "search_venues",
      venue: "choose_venue",
      invite: "generate_cover",
      vendors: "draft_vendor_orders",
      guests: "rank_guests",
    };
    const realTrace = (key: string): TraceLine[] | null => {
      const entry = logByTool.get(STEP_TOOL[key]);
      if (!entry) return null;
      const args = entry.args && Object.keys(entry.args).length ? JSON.stringify(entry.args).slice(1, -1) : "";
      return [T(`${entry.tool}(${args})`), R(entry.source === "muse" ? "via Muse" : "offline fallback"), K(entry.summary)];
    };

    const steps: { key: string; label: string; activeLabel: string; detail: string; explain: string; trace: TraceLine[]; done: boolean; blocked: boolean }[] = [];
    const add = (key: string, label: string, activeLabel: string, detail: string, explain: string, trace: TraceLine[], done: boolean, blocked = false) =>
      steps.push({ key, label, activeLabel, detail, explain, trace: realTrace(key) ?? trace, done, blocked });

    add(
      "date",
      slot ? `Picked the date: ${slot.label}` : "Picking the date",
      "Finding a date that works",
      e.dateCheck ? `Works for ${e.dateCheck.can} of ${e.dateCheck.of} guests` : "Checking who is free",
      e.dateCheck
        ? `Checked each invited guest's free/busy pattern against the slots and picked the one that works for the most people — ${e.dateCheck.can} of ${e.dateCheck.of} so far. ${e.dateCheck.note ?? ""}`.trim()
        : "Still comparing guests' availability across the open slots.",
      e.dateCheck
        ? [T(`check_availability(guests: ${e.dateCheck.of})`), R(`${e.dateCheck.can} of ${e.dateCheck.of} free on ${slot?.label ?? "the chosen slot"}`), K(e.dateCheck.note || "Picked the slot that works for the most people.")]
        : [T("check_availability(...)"), K("Comparing guests' free/busy across the open slots.")],
      !!e.slotId,
    );
    add(
      "venues",
      `Shortlisted ${e.venueOptions?.length ?? 0} venue${(e.venueOptions?.length ?? 0) === 1 ? "" : "s"}`,
      "Looking for venues",
      (e.venueOptions ?? []).slice(0, 3).map((o: any) => o.name).filter(Boolean).join(" · ") || "Looking for places that fit",
      (e.venueOptions ?? []).length
        ? `Matched venues against your vibe, budget and guest count:\n${(e.venueOptions as any[]).slice(0, 3).map((o) => `• ${o.name} — ${o.area}, fits ${o.capacity}`).join("\n")}`
        : "Still looking for places that fit the vibe and budget.",
      (e.venueOptions ?? []).length
        ? [
            T(`search_venues(budget: "${TIER[e.answers?.budget ?? 0] || "$"}", group: ${guestCountEarly})`),
            R(`${e.venueOptions.length} shortlisted`),
            K(`Matched against the "${e.answers?.vibe ?? "Lively"}" vibe and your budget.`),
          ]
        : [T("search_venues(...)"), K("Looking for places that fit the vibe and budget.")],
      (e.venueOptions?.length ?? 0) > 0,
    );
    add(
      "venue",
      venue ? `Chose ${venue.name}` : "Choosing the venue",
      "Choosing the venue",
      venue ? `${venue.area} · fits ${venue.capacity}` : "Waiting on the shortlist",
      venue ? `Picked the top match from the shortlist: ${venue.name} in ${venue.area}, fits ${venue.capacity} guests. ${venue.note ?? ""}`.trim() : "Waiting on the venue shortlist above.",
      venue
        ? [T(`compare_shortlist(${e.venueOptions?.length ?? 0} venues)`), R(`chose ${venue.name}`), K(venue.note || `${venue.area}, fits ${venue.capacity}.`)]
        : [T("compare_shortlist(...)"), K("Waiting on the venue shortlist above.")],
      !!e.venueId,
    );
    add(
      "invite",
      "Designed the invite",
      "Designing the invite",
      e.poster ? "Cover art and event page drafted" : "Making the poster",
      e.poster
        ? `Generated a poster for the invite${e.poster.source === "muse" ? " with Muse Image" : " (offline placeholder — ask in chat to try again or change the colours)"}.`
        : "Still drafting the cover art.",
      e.poster
        ? [
            T(`generate_cover(vibe: "${e.answers?.vibe ?? "Lively"}")`),
            R(e.poster.source === "muse" ? "cover.png" : "cover drafted (offline placeholder)"),
            K("Keeping the invite short and casual."),
          ]
        : [T("generate_cover(...)"), K("Drafting the cover art.")],
      !!e.poster,
    );
    add(
      "vendors",
      blockedDraft
        ? `${blockedDraft.vendor} needs attention`
        : drafts.length
          ? `Drafted ${drafts.length} vendor order${drafts.length === 1 ? "" : "s"}${pendingDrafts.length ? ` · ${pendingDrafts.length} awaiting your OK` : ""}`
          : "Drafting vendor orders",
      "Drafting orders",
      blockedDraft ? String(blockedDraft.simulatedReply) : drafts.length ? `${drafts.map((d) => d.item).join(", ")} (simulated, nothing is paid)` : "Cake, candles and more",
      drafts.length
        ? `Drafted enquiries for each vendor (all simulated, nothing is paid or booked):\n${drafts.map((d) => `• ${d.vendor} — ${d.item}${d.simulatedReply ? `: "${d.simulatedReply}"` : ""}`).join("\n")}`
        : "Still working out what the event needs from vendors.",
      drafts.length
        ? [
            ...drafts.slice(0, 2).map((d) => T(`draft_order(${d.vendor}: ${d.item})`)),
            R("simulated · nothing paid"),
            K(blockedDraft ? String(blockedDraft.simulatedReply) : "Drafted enquiries — nothing sent until you approve."),
          ]
        : [T("draft_order(...)"), K("Working out what the event needs from vendors.")],
      drafts.length > 0 && !blockedDraft && pendingDrafts.length === 0,
      !!blockedDraft,
    );
    add(
      "guests",
      picked.length ? `Picked ${picked.length} guests` : "Picking guests",
      "Picking the guest list",
      picked.length ? "Each gets a personal reason why" : "Matching your audience",
      picked.length
        ? `Matched your audience description against your friends and ranked them by fit.${e.settings?.reasons?.quota ? ` ${e.settings.reasons.quota}` : ""}${e.settings?.reasons?.friendsOfFriends ? ` ${e.settings.reasons.friendsOfFriends}` : ""}`
        : "Still matching your audience description against your friends.",
      picked.length
        ? [T(`match_audience("${e.audienceRaw ?? ""}")`), R(`${picked.length} selected`), K(e.settings?.reasons?.quota || "Matched your friends against who fits this best.")]
        : [T("match_audience(...)"), K("Matching your audience description against your friends.")],
      picked.length > 0,
    );
    add(
      "send",
      sent ? "Invites sent" : "Send invites",
      "Send invites",
      sent ? "Friends' Muses are deciding" : "Nothing goes out until you approve",
      sent
        ? "Each invited friend's own Muse is deciding, privately, whether this is worth it for them — you'll see replies come in as they decide."
        : "Nothing is sent until you approve: once you do, each guest's Muse decides on their behalf, using only what they've shared.",
      [],
      sent,
    );

    // First unfinished step is the one being worked on; the rest wait.
    let activeSet = false;
    const items: Step[] = steps.map((s) => {
      if (s.blocked) return { key: s.key, label: s.label, activeLabel: s.activeLabel, detail: s.detail, explain: s.explain, trace: s.trace, state: "blocked" as const };
      if (s.done) return { key: s.key, label: s.label, activeLabel: s.activeLabel, detail: s.detail, explain: s.explain, trace: s.trace, state: "done" as const };
      if (!activeSet) {
        activeSet = true;
        return { key: s.key, label: s.label, activeLabel: s.activeLabel, detail: s.detail, explain: s.explain, trace: s.trace, state: "active" as const };
      }
      return { key: s.key, label: s.label, activeLabel: s.activeLabel, detail: s.detail, explain: s.explain, trace: s.trace, state: "todo" as const };
    });

    // Chat-added items (events.addTask), appended after the fixed plan steps above. Unlike those,
    // these carry their own stored status: taskRunner.runNext drives each through
    // todo -> active -> done/blocked one at a time, so it's read back here, not derived.
    const chatTasks: any[] = e.tasks ?? [];
    for (const t of chatTasks) {
      items.push({ key: t.id, label: t.label, activeLabel: t.label, detail: t.detail, explain: t.detail, trace: [T(t.kind === "send_invites" ? "send_invites()" : `task("${t.label}")`)], state: t.status });
    }
    const pendingTasks = chatTasks
      .filter((t) => t.status === "blocked" && t.needsYou)
      .map((t) => ({ id: t.id as string, title: t.needsYou.title as string, body: t.needsYou.body as string }));

    // Only for the blocked case now: a plain "nothing to approve, just FYI" draft already gets its
    // own actionable card below via pendingDrafts, so a second text-only summary of the same thing
    // would be redundant.
    const needsYou = blockedDraft
      ? { title: "One thing from you", body: String(blockedDraft.simulatedReply), draftId: blockedDraft.id as string, item: blockedDraft.item as string }
      : null;

    const guestCount = e.settings?.quota ?? picked.length;
    const summary = [e.answers?.purpose && e.answers.purpose !== "Other" ? e.answers.purpose : null, e.answers?.vibe, guestCount ? `~${guestCount} guests` : null, TIER[e.answers?.budget ?? 0] || null]
      .filter(Boolean)
      .join(" · ");

    // scrubDeep at the boundary: one lone surrogate in model-written text makes the WHOLE
    // response unserialisable, so a bad character costs a screen rather than a string.
    return scrubDeep({
      eventId: e.eventId as string,
      title: e.title as string,
      status: e.status as string,
      hostId: e.hostId as string,
      summary,
      doneCount: items.filter((i) => i.state === "done").length,
      total: items.length,
      items,
      needsYou,
      pendingDrafts: pendingDrafts.map((d: any) => ({ id: d.id as string, vendor: d.vendor as string, item: d.item as string, draft: d.draft as string })),
      pendingTasks,
    });
  },
});
