import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { allowedAs, requireActor, requireHost } from "./authz";
import { scheduleHuddle } from "./huddleRuntime";

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

const DEFAULT_SETTINGS = { friendsOfFriends: false, quota: 0, reasons: { friendsOfFriends: "", quota: "", guestCount: "" } };

export const updateSettings = mutation({
  args: { eventId: v.string(), settings: v.any() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    await requireHost(ctx, e, "write", "events.updateSettings");
    // e!.settings can be absent while the agent loop is still building the event up incrementally
    // (settings land via its own tool call, not necessarily at creation) — fall back to a default
    // shape so the spread below always produces a complete EventSettings, not a partial one.
    await ctx.db.patch(e!._id, { settings: { ...(e!.settings ?? DEFAULT_SETTINGS), ...cleanSettingsPatch(args.settings) } });
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
    // The planning agent parks itself whenever a draft is pending (convex/agentLoop.ts), so the
    // host answering is what lets it carry on. No-ops if the plan is already finished.
    if (e.status === "draft") await ctx.scheduler.runAfter(0, internal.agentLoop.run, { eventId: args.eventId });
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
    // "Not now" is just as much an answer as "approve" — either way the agent is unblocked.
    if (e.status === "draft") await ctx.scheduler.runAfter(0, internal.agentLoop.run, { eventId: args.eventId });
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

/** Applies one real agentLoop.run tool-call result to the event doc: the patch it produced
 * (e.g. { slotId, dateCheck }) plus one entry in the ordered agentLog — this log IS the "your
 * agent is on it" trace; checklist.ts reads it back, nothing is reconstructed or faked. */
export const applyAgentStep = internalMutation({
  args: { eventId: v.string(), patch: v.any(), tool: v.string(), args: v.any(), summary: v.string(), source: v.union(v.literal("muse"), v.literal("offline")) },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) return;
    const log = e.agentLog ?? [];
    const entry = { seq: log.length + 1, tool: args.tool, args: args.args, summary: args.summary, source: args.source, ts: Date.now() };
    await ctx.db.patch(e._id, { ...(args.patch as Record<string, unknown>), agentLog: [...log, entry] });
  },
});

/** Same as applyAgentStep but with no state patch — used for the "finish" step and for logging a
 * tool that threw, where there's nothing new to write to the event besides the trace entry. */
export const appendAgentLog = internalMutation({
  args: { eventId: v.string(), tool: v.string(), args: v.any(), summary: v.string(), source: v.union(v.literal("muse"), v.literal("offline")) },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) return;
    const log = e.agentLog ?? [];
    const entry = { seq: log.length + 1, tool: args.tool, args: args.args, summary: args.summary, source: args.source, ts: Date.now() };
    await ctx.db.patch(e._id, { agentLog: [...log, entry] });
  },
});

/** Shared by the "Send invites" button (events.sendEvent) and the host-chat "send invites" task
 * (events.approveTask): sets status to "sent", seeds `guests` rows, then schedules the huddle
 * action so the caller returns immediately. Caller must already hold a write-level requireHost. */
async function doSendInvites(ctx: { db: any; scheduler: any }, e: { eventId: string; hostId: string; status: string; _id: any }, rawCandidateIds: string[]) {
  // Idempotent: the checklist's send row, Manage's Send button and the host-chat send task all
  // reach here, and the checklist row stays tappable after sending (it reopens the swarm), so a
  // second call must NOT seed guests again or schedule a second concurrent huddle run.
  if (e.status === "sent") return;
  const personas = await ctx.db.query("personas").collect();
  const hostFriends = new Set(personas.find((x: any) => x.personaId === e.hostId)?.friends ?? []);
  // A host can invite seeded demo personas (incl. friends of friends), but a REAL user only if
  // they're the host's friend: no inviting (and Muse-huddling) arbitrary real people.
  const candidateIds = rawCandidateIds.filter((pid) => !pid.startsWith("fb_") || hostFriends.has(pid));
  for (const pid of candidateIds) {
    const existing = await ctx.db.query("guests").withIndex("by_event_persona", (q: any) => q.eq("eventId", e.eventId).eq("personaId", pid)).unique();
    if (existing) continue;
    const p = personas.find((x: any) => x.personaId === pid);
    if (!p) continue;
    await ctx.db.insert("guests", { eventId: e.eventId, personaId: pid, name: p.name, kind: "muse", status: "invited" });
  }
  await ctx.db.patch(e._id, { status: "sent" });
  await scheduleHuddle(ctx, e.eventId, candidateIds);
}

export const sendEvent = mutation({
  args: { eventId: v.string(), candidateIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    await requireHost(ctx, e, "write", "events.sendEvent");
    await doSendInvites(ctx, e!, args.candidateIds);
  },
});

/** Appends a chat-requested checklist item (hostChat.reply). "send_invites" is deduped — only one
 * live (non-done) send task per event — since chat may be asked to "send invites" more than once
 * while one is still sitting in the checklist awaiting approval. Internal: hostChat already
 * checked requireHost before calling it. */
export const addTask = internalMutation({
  args: { eventId: v.string(), label: v.string(), detail: v.string(), kind: v.union(v.literal("send_invites"), v.literal("custom"), v.literal("order_cake")) },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) throw new Error("Event not found");
    const tasks = e.tasks ?? [];
    if (args.kind === "send_invites" || args.kind === "order_cake") {
      const live = tasks.find((t: any) => t.kind === args.kind && t.status !== "done");
      if (live) return { id: live.id as string };
    }
    const id = `t_${Date.now().toString(36)}_${tasks.length}`;
    await ctx.db.patch(e._id, { tasks: [...tasks, { id, label: args.label, detail: args.detail, kind: args.kind, status: "todo" }] });
    return { id };
  },
});

/** Patches one task in place (taskRunner.runNext driving it through active -> done/blocked). */
export const updateTask = internalMutation({
  args: { eventId: v.string(), taskId: v.string(), patch: v.any() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e) return;
    const tasks = (e.tasks ?? []).map((t: any) => (t.id === args.taskId ? { ...t, ...args.patch } : t));
    await ctx.db.patch(e._id, { tasks });
  },
});

/** Host grants the permission a blocked task was waiting on. "send_invites" actually sends;
 * a "custom" task is marked done and the queue continues with whatever's next. */
export const approveTask = mutation({
  args: { eventId: v.string(), taskId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    await requireHost(ctx, e, "write", "events.approveTask");
    const task = (e!.tasks ?? []).find((t: any) => t.id === args.taskId);
    if (!task) throw new Error("Task not found");
    if (task.kind === "order_cake") {
      // Only a blocked (awaiting-approval) task fires — guards a double tap or stale client from
      // sending the order twice.
      if (task.status !== "blocked") return;
      // Host approved the vendor email: hand off to the action that composes + sends it (it marks
      // the task done with the real result) and keep the queue moving while it goes out.
      const next = (e!.tasks ?? []).map((t: any) => (t.id === args.taskId ? { ...t, status: "active", needsYou: undefined } : t));
      await ctx.db.patch(e!._id, { tasks: next });
      await ctx.scheduler.runAfter(0, internal.emailAction.sendCakeOrder, { eventId: args.eventId, taskId: args.taskId });
      await ctx.scheduler.runAfter(0, internal.taskRunner.runNext, { eventId: args.eventId });
      return;
    }
    if (task.kind === "send_invites" && e!.status !== "sent") {
      const candidateIds = (e!.shortlist ?? []).filter((s: any) => s.selected).map((s: any) => s.personaId);
      await doSendInvites(ctx, e!, candidateIds);
    }
    const tasks = (e!.tasks ?? []).map((t: any) =>
      t.id === args.taskId ? { ...t, status: "done", detail: task.kind === "send_invites" ? "Invites sent." : "Approved — done.", needsYou: undefined } : t,
    );
    await ctx.db.patch(e!._id, { tasks });
    if (task.kind !== "send_invites") await ctx.scheduler.runAfter(0, internal.taskRunner.runNext, { eventId: args.eventId });
  },
});

/** Host declines a blocked task. The queue still moves on to whatever's next. */
export const rejectTask = mutation({
  args: { eventId: v.string(), taskId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    await requireHost(ctx, e, "write", "events.rejectTask");
    const tasks = (e!.tasks ?? []).map((t: any) => (t.id === args.taskId ? { ...t, status: "done", detail: "Skipped.", needsYou: undefined } : t));
    await ctx.db.patch(e!._id, { tasks });
    await ctx.scheduler.runAfter(0, internal.taskRunner.runNext, { eventId: args.eventId });
  },
});

// Open by design: a person without a Muse RSVPs from a plain link (claude.md section 6).
// Hardened: only for sent events, with a sane name.
export const rsvpExternal = mutation({
  args: {
    eventId: v.string(),
    name: v.string(),
    // Older invite clients only sent a name; keep their default "going" response.
    status: v.optional(v.union(v.literal("going"), v.literal("maybe"), v.literal("cant"))),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (name.length < 1 || name.length > 80) throw new Error("Enter a name between 1 and 80 characters.");
    const status = args.status ?? "going";
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).unique();
    if (!e || e.status !== "sent") throw new Error("This invite isn't open.");
    const existing = await ctx.db.query("guests").withIndex("by_eventId", (q) => q.eq("eventId", args.eventId)).collect();
    const dup = existing.find((g) => g.kind === "external" && g.name === name);
    if (dup) {
      await ctx.db.patch(dup._id, { status });
      return;
    }
    await ctx.db.insert("guests", { eventId: args.eventId, name, kind: "external", status });
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
