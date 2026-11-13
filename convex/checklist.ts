import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireHost } from "./authz";

// The host's "Your agent is on it" checklist, DERIVED from the event doc rather than stored: each step
// is true when the planner has already produced its output. Keeping it derived means it stays correct
// when event creation changes, as long as the same fields keep being filled in.

export type StepState = "done" | "active" | "todo" | "blocked";
export type Step = { key: string; label: string; detail: string; state: StepState; explain: string };

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

    const steps: { key: string; label: string; detail: string; explain: string; done: boolean; blocked: boolean }[] = [];
    const add = (key: string, label: string, detail: string, explain: string, done: boolean, blocked = false) =>
      steps.push({ key, label, detail, explain, done, blocked });

    add(
      "date",
      slot ? `Picked the date: ${slot.label}` : "Picking the date",
      e.dateCheck ? `Works for ${e.dateCheck.can} of ${e.dateCheck.of} guests` : "Checking who is free",
      e.dateCheck
        ? `Checked each invited guest's free/busy pattern against the slots and picked the one that works for the most people — ${e.dateCheck.can} of ${e.dateCheck.of} so far. ${e.dateCheck.note ?? ""}`.trim()
        : "Still comparing guests' availability across the open slots.",
      !!e.slotId,
    );
    add(
      "venues",
      `Shortlisted ${e.venueOptions?.length ?? 0} venue${(e.venueOptions?.length ?? 0) === 1 ? "" : "s"}`,
      (e.venueOptions ?? []).slice(0, 3).map((o: any) => o.name).filter(Boolean).join(" · ") || "Looking for places that fit",
      (e.venueOptions ?? []).length
        ? `Matched venues against your vibe, budget and guest count:\n${(e.venueOptions as any[]).slice(0, 3).map((o) => `• ${o.name} — ${o.area}, fits ${o.capacity}`).join("\n")}`
        : "Still looking for places that fit the vibe and budget.",
      (e.venueOptions?.length ?? 0) > 0,
    );
    add(
      "venue",
      venue ? `Chose ${venue.name}` : "Choosing the venue",
      venue ? `${venue.area} · fits ${venue.capacity}` : "Waiting on the shortlist",
      venue ? `Picked the top match from the shortlist: ${venue.name} in ${venue.area}, fits ${venue.capacity} guests. ${venue.note ?? ""}`.trim() : "Waiting on the venue shortlist above.",
      !!e.venueId,
    );
    add(
      "invite",
      "Designed the invite",
      e.poster ? "Cover art and event page drafted" : "Making the poster",
      e.poster
        ? `Generated a poster for the invite${e.poster.source === "muse" ? " with Muse Image" : " (offline placeholder — ask in chat to try again or change the colours)"}.`
        : "Still drafting the cover art.",
      !!e.poster,
    );
    add(
      "vendors",
      blockedDraft
        ? `${blockedDraft.vendor} needs attention`
        : drafts.length
          ? `Drafted ${drafts.length} vendor order${drafts.length === 1 ? "" : "s"}${pendingDrafts.length ? ` · ${pendingDrafts.length} awaiting your OK` : ""}`
          : "Drafting vendor orders",
      blockedDraft ? String(blockedDraft.simulatedReply) : drafts.length ? `${drafts.map((d) => d.item).join(", ")} (simulated, nothing is paid)` : "Cake, candles and more",
      drafts.length
        ? `Drafted enquiries for each vendor (all simulated, nothing is paid or booked):\n${drafts.map((d) => `• ${d.vendor} — ${d.item}${d.simulatedReply ? `: "${d.simulatedReply}"` : ""}`).join("\n")}`
        : "Still working out what the event needs from vendors.",
      drafts.length > 0 && !blockedDraft && pendingDrafts.length === 0,
      !!blockedDraft,
    );
    add(
      "guests",
      picked.length ? `Picked ${picked.length} guests` : "Picking guests",
      picked.length ? "Each gets a personal reason why" : "Matching your audience",
      picked.length
        ? `Matched your audience description against your friends and ranked them by fit.${e.settings?.reasons?.quota ? ` ${e.settings.reasons.quota}` : ""}${e.settings?.reasons?.friendsOfFriends ? ` ${e.settings.reasons.friendsOfFriends}` : ""}`
        : "Still matching your audience description against your friends.",
      picked.length > 0,
    );
    add(
      "send",
      sent ? "Invites sent" : "Send invites",
      sent ? "Friends' Muses are deciding" : "Nothing goes out until you approve",
      sent
        ? "Each invited friend's own Muse is deciding, privately, whether this is worth it for them — you'll see replies come in as they decide."
        : "Nothing is sent until you approve: once you do, each guest's Muse decides on their behalf, using only what they've shared.",
      sent,
    );

    // First unfinished step is the one being worked on; the rest wait.
    let activeSet = false;
    const items: Step[] = steps.map((s) => {
      if (s.blocked) return { key: s.key, label: s.label, detail: s.detail, explain: s.explain, state: "blocked" as const };
      if (s.done) return { key: s.key, label: s.label, detail: s.detail, explain: s.explain, state: "done" as const };
      if (!activeSet) {
        activeSet = true;
        return { key: s.key, label: s.label, detail: s.detail, explain: s.explain, state: "active" as const };
      }
      return { key: s.key, label: s.label, detail: s.detail, explain: s.explain, state: "todo" as const };
    });

    const needsYou = blockedDraft
      ? { title: "One thing from you", body: String(blockedDraft.simulatedReply) }
      : !sent && drafts.length > 0
        ? { title: "One thing from you", body: "I've drafted the vendor orders (simulated). I'll pause before paying or ordering anything." }
        : null;

    const guestCount = e.settings?.quota ?? picked.length;
    const summary = [e.answers?.purpose && e.answers.purpose !== "Other" ? e.answers.purpose : null, e.answers?.vibe, guestCount ? `~${guestCount} guests` : null, TIER[e.answers?.budget ?? 0] || null]
      .filter(Boolean)
      .join(" · ");

    return {
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
    };
  },
});
