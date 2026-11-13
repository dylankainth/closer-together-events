import { internal } from "./_generated/api";

export const HUDDLE_LEASE_MS = 120_000;

/** Called inside the same transaction that creates invitations. Each cohort has its own run. */
export async function scheduleHuddle(ctx: any, eventId: string, candidateIds: string[]) {
  const now = Date.now();
  const candidates = [...new Set(candidateIds)];
  const runId = await ctx.db.insert("huddleRuns", {
    eventId, candidateIds: candidates, attempt: 1, status: "queued",
    leaseUntil: now + HUDDLE_LEASE_MS, updatedAt: now, createdAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.huddle.runHuddle, {
    eventId, candidateIds: candidates, profileMode: "event_safe", codeCheck: true, runId, attempt: 1,
  });
  return runId;
}

/** The run row is read and renewed in the SAME transaction as a message/nudge write.
 * A retry increments attempt, so work returning late from an old model call cannot commit.
 */
export async function assertHuddleAttempt(ctx: any, eventId: string, runId?: string, attempt?: number, personaId?: string) {
  if (!runId) {
    // Older scheduled actions have no attempt token. Once recovery tracking exists they cannot
    // overwrite its results; a host can recover their unfinished recipients after the quiet period.
    const tracked = await ctx.db.query("huddleRuns").withIndex("by_eventId", (q: any) => q.eq("eventId", eventId)).first();
    if (tracked) throw new Error("Superseded huddle attempt.");
    return;
  }
  const run = await ctx.db.get(runId);
  if (!run || run.eventId !== eventId || run.attempt !== attempt || run.status !== "running" ||
    (personaId && !run.candidateIds.includes(personaId))) throw new Error("Superseded huddle attempt.");
  await ctx.db.patch(run._id, { updatedAt: Date.now(), leaseUntil: Date.now() + HUDDLE_LEASE_MS });
}

/** Preserve historical rows for audits, but render only the current attempt's conversations. */
export async function currentHuddleMessages<T extends { runId?: string; attempt?: number; forPersona: string; fromPersona: string }>(ctx: any, eventId: string, rows: T[]): Promise<T[]> {
  const runs = await ctx.db.query("huddleRuns").withIndex("by_eventId", (q: any) => q.eq("eventId", eventId)).collect();
  const attempts = new Map(runs.map((r: any) => [String(r._id), r.attempt]));
  const covered = new Set(runs.flatMap((r: any) => r.candidateIds));
  return rows.filter((m) => m.runId ? attempts.get(String(m.runId)) === m.attempt : !covered.has(m.forPersona) && !covered.has(m.fromPersona));
}
