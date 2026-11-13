import { internalMutation, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { allowedAs, requireHost } from "./authz";
import { HUDDLE_LEASE_MS, scheduleHuddle } from "./huddleRuntime";

async function findEvent(ctx: any, eventId: string) {
  return ctx.db.query("events").withIndex("by_eventId", (q: any) => q.eq("eventId", eventId)).unique();
}
async function eventRuns(ctx: any, eventId: string) {
  return ctx.db.query("huddleRuns").withIndex("by_eventId", (q: any) => q.eq("eventId", eventId)).collect();
}
async function legacyPending(ctx: any, event: any, runs: any[]) {
  const guests = await ctx.db.query("guests").withIndex("by_eventId", (q: any) => q.eq("eventId", event.eventId)).collect();
  const covered = new Set(runs.flatMap((r) => r.candidateIds));
  const personas = await ctx.db.query("personas").collect();
  const eligible = new Set(personas.filter((p: any) => p.hasMuse && p.settings.talkToMuses && p.settings.nudgesOn).map((p: any) => p.personaId));
  const candidateIds = guests.filter((g: any) => g.personaId && !g.nudge && !covered.has(g.personaId) && eligible.has(g.personaId)).map((g: any) => g.personaId);
  const last = await ctx.db.query("huddleMessages").withIndex("by_eventId_seq", (q: any) => q.eq("eventId", event.eventId)).order("desc").first();
  return { candidateIds, retryAt: Math.max(event.createdAt, last?.ts ?? 0) + HUDDLE_LEASE_MS };
}

export const forEvent = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }): Promise<{
    runs: { runId: Id<"huddleRuns">; attempt: number; status: "queued" | "running" | "completed" | "failed"; leaseUntil: number; count: number }[];
    legacy: { count: number; retryAt: number } | null;
  } | null> => {
    const event = await findEvent(ctx, eventId);
    if (!event || event.status !== "sent" || !(await allowedAs(ctx, event.hostId, "write", "huddleRecovery.forEvent"))) return null;
    const runs = await eventRuns(ctx, eventId);
    const legacy = await legacyPending(ctx, event, runs);
    return {
      runs: runs.map((r: any) => ({ runId: r._id, attempt: r.attempt, status: r.status as "queued" | "running" | "completed" | "failed", leaseUntil: r.leaseUntil, count: r.candidateIds.length })),
      legacy: legacy.candidateIds.length ? { count: legacy.candidateIds.length, retryAt: legacy.retryAt } : null,
    };
  },
});

export const retry = mutation({
  args: { eventId: v.string(), runId: v.optional(v.id("huddleRuns")), attempt: v.optional(v.number()) },
  handler: async (ctx, { eventId, runId, attempt }): Promise<{ started: boolean }> => {
    const event = await findEvent(ctx, eventId);
    await requireHost(ctx, event, "write", "huddleRecovery.retry");
    if (event.status !== "sent") throw new ConvexError("Send the invitations before starting a conversation.");
    const now = Date.now();
    if (!runId) {
      const pending = await legacyPending(ctx, event, await eventRuns(ctx, eventId));
      if (!pending.candidateIds.length || now < pending.retryAt) return { started: false };
      await scheduleHuddle(ctx, eventId, pending.candidateIds);
      return { started: true };
    }
    const run = await ctx.db.get(runId);
    if (!run || run.eventId !== eventId) throw new ConvexError("Conversation not found.");
    if (run.attempt !== attempt || run.status === "completed" || (run.status !== "failed" && now < run.leaseUntil)) return { started: false };
    const next = run.attempt + 1;
    await ctx.db.patch(runId, { attempt: next, status: "queued", updatedAt: now, leaseUntil: now + HUDDLE_LEASE_MS });
    // Clear stale recommendations for this cohort, never the guest's own RSVP or a plus-one's run.
    for (const personaId of run.candidateIds) {
      const guest = await ctx.db.query("guests").withIndex("by_event_persona", (q) => q.eq("eventId", eventId).eq("personaId", personaId)).unique();
      if (guest) await ctx.db.patch(guest._id, { nudge: undefined });
    }
    await ctx.scheduler.runAfter(0, internal.huddle.runHuddle, {
      eventId, candidateIds: run.candidateIds, profileMode: "event_safe", codeCheck: true, runId, attempt: next,
    });
    return { started: true };
  },
});

export const start = internalMutation({
  args: { eventId: v.string(), runId: v.id("huddleRuns"), attempt: v.number() },
  handler: async (ctx, { eventId, runId, attempt }): Promise<boolean> => {
    const run = await ctx.db.get(runId);
    if (!run || run.eventId !== eventId || run.attempt !== attempt || run.status !== "queued") return false;
    await ctx.db.patch(runId, { status: "running", updatedAt: Date.now(), leaseUntil: Date.now() + HUDDLE_LEASE_MS });
    return true;
  },
});

export const finish = internalMutation({
  args: { eventId: v.string(), runId: v.id("huddleRuns"), attempt: v.number(), failed: v.boolean() },
  handler: async (ctx, { eventId, runId, attempt, failed }): Promise<void> => {
    const run = await ctx.db.get(runId);
    if (!run || run.eventId !== eventId || run.attempt !== attempt || run.status !== "running") return;
    await ctx.db.patch(runId, { status: failed ? "failed" : "completed", updatedAt: Date.now(), leaseUntil: Date.now() });
  },
});
