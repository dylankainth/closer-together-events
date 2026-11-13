import { query } from "./_generated/server";
import { v } from "convex/values";

// The host's "Your agent is on it" checklist, DERIVED from the event doc rather than stored: each step
// is true when the planner has already produced its output. Keeping it derived means it stays correct
// when event creation changes, as long as the same fields keep being filled in.

export type StepState = "done" | "active" | "todo" | "blocked";
export type Step = { key: string; label: string; detail: string; state: StepState };

const BLOCKED = /(unavailable|can't|cannot|sold out|fully booked|halt|delay|declin|no longer)/i;
const TIER = ["", "$", "$$", "$$$"];

export const forEvent = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const e: any = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) return null;

    const slot = e.slotId ? await ctx.db.query("slots").withIndex("by_slotId", (q) => q.eq("slotId", e.slotId)).unique() : null;
    const venue = e.venueId ? await ctx.db.query("venues").withIndex("by_venueId", (q) => q.eq("venueId", e.venueId)).unique() : null;

    const drafts: any[] = e.drafts ?? [];
    const blockedDraft = drafts.find((d) => BLOCKED.test(String(d.simulatedReply ?? "")));
    const pendingDrafts = drafts.filter((d) => d.status === "pending");
    const picked: any[] = (e.shortlist ?? []).filter((s: any) => s.selected);
    const sent = e.status === "sent";

    const steps: { key: string; label: string; detail: string; done: boolean; blocked: boolean }[] = [];
    const add = (key: string, label: string, detail: string, done: boolean, blocked = false) =>
      steps.push({ key, label, detail, done, blocked });

    add(
      "date",
      slot ? `Picked the date: ${slot.label}` : "Picking the date",
      e.dateCheck ? `Works for ${e.dateCheck.can} of ${e.dateCheck.of} guests` : "Checking who is free",
      !!e.slotId,
    );
    add(
      "venues",
      `Shortlisted ${e.venueOptions?.length ?? 0} venue${(e.venueOptions?.length ?? 0) === 1 ? "" : "s"}`,
      (e.venueOptions ?? []).slice(0, 3).map((o: any) => o.name).filter(Boolean).join(" · ") || "Looking for places that fit",
      (e.venueOptions?.length ?? 0) > 0,
    );
    add("venue", venue ? `Chose ${venue.name}` : "Choosing the venue", venue ? `${venue.area} · fits ${venue.capacity}` : "Waiting on the shortlist", !!e.venueId);
    add("invite", "Designed the invite", e.poster ? "Cover art and event page drafted" : "Making the poster", !!e.poster);
    add(
      "vendors",
      blockedDraft
        ? `${blockedDraft.vendor} needs attention`
        : drafts.length
          ? `Drafted ${drafts.length} vendor order${drafts.length === 1 ? "" : "s"}${pendingDrafts.length ? ` · ${pendingDrafts.length} awaiting your OK` : ""}`
          : "Drafting vendor orders",
      blockedDraft ? String(blockedDraft.simulatedReply) : drafts.length ? `${drafts.map((d) => d.item).join(", ")} (simulated, nothing is paid)` : "Cake, candles and more",
      drafts.length > 0 && !blockedDraft && pendingDrafts.length === 0,
      !!blockedDraft,
    );
    add("guests", picked.length ? `Picked ${picked.length} guests` : "Picking guests", picked.length ? "Each gets a personal reason why" : "Matching your audience", picked.length > 0);
    add("send", sent ? "Invites sent" : "Send invites", sent ? "Friends' Muses are deciding" : "Nothing goes out until you approve", sent);

    // First unfinished step is the one being worked on; the rest wait.
    let activeSet = false;
    const items: Step[] = steps.map((s) => {
      if (s.blocked) return { key: s.key, label: s.label, detail: s.detail, state: "blocked" as const };
      if (s.done) return { key: s.key, label: s.label, detail: s.detail, state: "done" as const };
      if (!activeSet) {
        activeSet = true;
        return { key: s.key, label: s.label, detail: s.detail, state: "active" as const };
      }
      return { key: s.key, label: s.label, detail: s.detail, state: "todo" as const };
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
