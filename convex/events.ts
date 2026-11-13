import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { allowedAs, requireActor, requireHost } from "./authz";

function publicEvent(e: any) {
  const { _id, _creationTime, ...rest } = e;
  return rest;
}

// What a non-host may see of a sent event: no shortlist (who else was considered), no vendor
// drafts or venue options, no raw audience text. Only the host's own screens read those.
function guestEvent(e: any) {
  const { shortlist, drafts, venueOptions, query: audienceQuery, audienceRaw, ...rest } = publicEvent(e);
  return rest;
}

export const getByEventId = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) return null;
    if (await allowedAs(ctx, e.hostId, "read", "events.getByEventId")) return publicEvent(e);
    return e.status === "sent" ? guestEvent(e) : null;
  },
});

export const listForHost = query({
  args: { hostId: v.string() },
  handler: async (ctx, args) => {
    await requireActor(ctx, args.hostId, "read", "events.listForHost");
    return (await ctx.db.query("events").withIndex("by_hostId", (q) => q.eq("hostId", args.hostId)).collect()).map(publicEvent);
  },
});

export const listInvitedFor = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    await requireActor(ctx, args.personaId, "read", "events.listInvitedFor");
    const guestRows = await ctx.db.query("guests").collect();
    const eventIds = new Set(guestRows.filter((g) => g.personaId === args.personaId).map((g) => g.eventId));
    const events = await ctx.db.query("events").collect();
    return events.filter((e) => eventIds.has(e.eventId) && e.hostId !== args.personaId).map(guestEvent);
  },
});

/** "Other events" / "Events in {city}" discover sections. City filtering is a v1 placeholder (no-op). */
export const listDiscoverable = query({
  args: { excludePersonaId: v.string() },
  handler: async (ctx, args) => {
    await requireActor(ctx, args.excludePersonaId, "read", "events.listDiscoverable");
    const events = await ctx.db.query("events").withIndex("by_status", (q) => q.eq("status", "sent")).collect();
    const guestRows = await ctx.db.query("guests").collect();
    const invitedEventIds = new Set(guestRows.filter((g) => g.personaId === args.excludePersonaId).map((g) => g.eventId));
    return events.filter((e) => e.hostId !== args.excludePersonaId && !invitedEventIds.has(e.eventId)).map(guestEvent);
  },
});

export const create = internalMutation({
  args: { event: v.any() },
  handler: async (ctx, args) => ctx.db.insert("events", args.event),
});

/** Called by hostChat.reply after regenerating the poster from a host's revision request
 * ("make it more blue"). Internal: the chat action already checked requireHost before calling it. */
export const setPoster = internalMutation({
  args: { eventId: v.string(), poster: v.any() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    await ctx.db.patch(e._id, { poster: args.poster });
  },
});

export const approve = mutation({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    await requireHost(ctx, e, "write", "events.approve");
    await ctx.db.patch(e!._id, { status: "approved" });
  },
});

// Only these keys of events.settings may be changed from the client, with these types.
function cleanSettingsPatch(raw: unknown): Record<string, unknown> {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof s.friendsOfFriends === "boolean") out.friendsOfFriends = s.friendsOfFriends;
  if (typeof s.quota === "number" && Number.isFinite(s.quota) && s.quota >= 0 && s.quota <= 500) out.quota = Math.round(s.quota);
  return out;
}

export const updateSettings = mutation({
  args: { eventId: v.string(), settings: v.any() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    await requireHost(ctx, e, "write", "events.updateSettings");
    await ctx.db.patch(e!._id, { settings: { ...e!.settings, ...cleanSettingsPatch(args.settings) } });
  },
});

/** Called by hostChat.reply when the host asks for something not already on the plan (e.g. "order
 * pizza"). Adds it to the checklist as a pending item — nothing is "sent" to a vendor until the
 * host approves it via approveDraft, consistent with every other vendor step being simulated. */
export const proposeDraft = internalMutation({
  args: { eventId: v.string(), vendor: v.string(), item: v.string(), draft: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    const drafts = e.drafts ?? [];
    const id = `d_${Date.now().toString(36)}_${drafts.length}`;
    await ctx.db.patch(e._id, {
      drafts: [...drafts, { id, vendor: args.vendor, item: args.item, draft: args.draft, simulated: true, status: "pending" }],
    });
    return { id };
  },
});

/** Host approves a pending draft from the checklist: fills in the canned vendor confirmation,
 * same simulated pattern as the drafts created at plan time. */
export const approveDraft = mutation({
  args: { eventId: v.string(), draftId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    await requireHost(ctx, e, "write", "events.approveDraft");
    const drafts = (e.drafts ?? []).map((d: any) =>
      d.id === args.draftId ? { ...d, status: "confirmed", simulatedReply: "Sorted, confirming shortly (simulated, nothing is paid)." } : d,
    );
    await ctx.db.patch(e._id, { drafts });
  },
});

/** Host dismisses a pending draft instead of approving it. */
export const rejectDraft = mutation({
  args: { eventId: v.string(), draftId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    await requireHost(ctx, e, "write", "events.rejectDraft");
    await ctx.db.patch(e._id, { drafts: (e.drafts ?? []).filter((d: any) => d.id !== args.draftId) });
  },
});

export const bumpCalls = internalMutation({
  args: { eventId: v.string(), by: v.number() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) return;
    await ctx.db.patch(e._id, { museCalls: e.museCalls + args.by });
  },
});

/** Sets status to "sent", seeds `guests` rows, then schedules the huddle action so it returns immediately. */
export const sendEvent = mutation({
  args: { eventId: v.string(), candidateIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    await requireHost(ctx, e, "write", "events.sendEvent");
    const personas = await ctx.db.query("personas").collect();
    const hostFriends = new Set(personas.find((x) => x.personaId === e!.hostId)?.friends ?? []);
    // A host can invite seeded demo personas (incl. friends of friends), but a REAL user only if
    // they're the host's friend: no inviting (and Muse-huddling) arbitrary real people.
    const candidateIds = args.candidateIds.filter((pid) => !pid.startsWith("fb_") || hostFriends.has(pid));
    for (const pid of candidateIds) {
      const existing = await ctx.db.query("guests").withIndex("by_event_persona", (q) => q.eq("eventId", args.eventId).eq("personaId", pid)).unique();
      if (existing) continue;
      const p = personas.find((x) => x.personaId === pid);
      if (!p) continue;
      await ctx.db.insert("guests", { eventId: args.eventId, personaId: pid, name: p.name, kind: "muse", status: "invited" });
    }
    await ctx.db.patch(e!._id, { status: "sent" });
    await ctx.scheduler.runAfter(0, internal.huddle.runHuddle, {
      eventId: args.eventId,
      candidateIds,
      profileMode: "event_safe",
      codeCheck: true,
    });
  },
});

// Open by design: a person without a Muse RSVPs from a plain link (claude.md section 6).
// Hardened: only for sent events, with a sane name.
export const rsvpExternal = mutation({
  args: { eventId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (name.length < 1 || name.length > 80) throw new Error("Enter a name between 1 and 80 characters.");
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e || e.status !== "sent") throw new Error("This invite isn't open.");
    const existing = await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).collect();
    const dup = existing.find((g) => g.kind === "external" && g.name === name);
    if (dup) {
      await ctx.db.patch(dup._id, { status: "going" });
      return;
    }
    await ctx.db.insert("guests", { eventId: args.eventId, name, kind: "external", status: "going" });
  },
});

export const updateRsvp = mutation({
  args: { eventId: v.string(), personaId: v.string(), status: v.union(v.literal("going"), v.literal("maybe"), v.literal("skip"), v.literal("cant")) },
  handler: async (ctx, args) => {
    await requireActor(ctx, args.personaId, "write", "events.updateRsvp");
    const g = await ctx.db.query("guests").withIndex("by_event_persona", (q) => q.eq("eventId", args.eventId).eq("personaId", args.personaId)).unique();
    if (!g) throw new Error("Guest not found");
    await ctx.db.patch(g._id, { status: args.status });
  },
});
