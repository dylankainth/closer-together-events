import { test } from "node:test";
import assert from "node:assert/strict";
import { loadHuddle } from "../scripts/lib/load-huddle.mjs";

function world() {
  const runtime = loadHuddle();
  const sourcePersonas = runtime.load("convex/seedData.ts").buildPersonas().filter((p) => ["maya", "sam", "priya"].includes(p.id));
  const people = sourcePersonas.map((p) => ({ ...p, availability: ["fri20"], friends: [], hasMuse: true,
    settings: { ...p.settings, talkToMuses: true, nudgesOn: true } }));
  const tables = {
    events: [{ _id: "e", eventId: "e1", hostId: "fb_host", title: "Bowling", status: "sent", createdAt: Date.now() - 300_000,
      slotId: "fri20", museCalls: 0, huddleSeq: 0, conversationMode: "structured", query: { topics: ["bowling"] } }],
    personas: people.map((p) => ({ ...p, personaId: p.id })),
    guests: [{ _id: "g-sam", eventId: "e1", personaId: "sam", name: "Sam", status: "going", nudge: { verdict: "worth", reasons: ["old"], text: "old" } },
      { _id: "g-priya", eventId: "e1", personaId: "priya", status: "invited" }],
    huddleRuns: [], huddleMessages: [],
  };
  const scheduled = [];
  const ctx = {
    caller: "fb_host", failInserts: false,
    auth: { async getUserIdentity() { return { subject: ctx.caller }; } },
    db: {
      async get(id) { return Object.values(tables).flat().find((r) => r._id === id) ?? null; },
      query(table) {
        const filters = []; let desc = false;
        const idx = { eq(k, value) { filters.push((r) => r[k] === value); return idx; } };
        const rows = () => {
          const found = tables[table].filter((r) => filters.every((f) => f(r)));
          return desc ? found.slice().sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0)) : found;
        };
        return {
          withIndex(_name, build) { build(idx); return this; },
          order(direction) { desc = direction === "desc"; return this; },
          async unique() { const found = rows(); assert.ok(found.length <= 1); return found[0] ?? null; },
          async first() { return rows()[0] ?? null; }, async collect() { return rows(); },
        };
      },
      async insert(table, value) {
        if (table === "huddleMessages" && ctx.failInserts) throw Error("storage failure");
        const id = `${table}-${tables[table].length}`;
        tables[table].push({ _id: id, ...structuredClone(value) }); return id;
      },
      async patch(id, patch) { const row = await this.get(id); assert.ok(row); Object.assign(row, structuredClone(patch)); },
    },
    scheduler: { async runAfter(delay, fn, args) { scheduled.push({ delay, fn: String(fn), args: structuredClone(args) }); } },
    async runQuery(ref) {
      switch (String(ref)) {
        case "internal.huddleData.getEventForHuddle": return tables.events[0];
        case "internal.personas.listAllInternal": return [...people, { ...people[0], id: "fb_host" }];
        case "internal.musePersonas.approvedForPersonas": return {};
        default: throw Error(`Unexpected query ${String(ref)}`);
      }
    },
    async runMutation(ref, args) {
      const key = String(ref).replace(/^internal\./, "").split(".");
      return runtime.load(`convex/${key[0]}.ts`)[key[1]].handler(ctx, args);
    },
  };
  return { ctx, tables, scheduled, runtime, recovery: runtime.load("convex/huddleRecovery.ts"), tracking: runtime.load("convex/huddleRuntime.ts") };
}
async function queued(w, candidates = ["sam"]) {
  const id = await w.tracking.scheduleHuddle(w.ctx, "e1", candidates);
  return w.tables.huddleRuns.find((r) => r._id === id);
}
const retry = (w, r) => w.recovery.retry.handler(w.ctx, { eventId: "e1", runId: r._id, attempt: r.attempt });
const start = (w, r) => w.recovery.start.handler(w.ctx, { eventId: "e1", runId: r._id, attempt: r.attempt });

test("scheduling records the candidate cohort and a queued action atomically", async () => {
  const w = world(); const run = await queued(w, ["sam", "sam", "priya"]);
  assert.equal(run.candidateIds.join(), "sam,priya");
  assert.equal(run.status, "queued"); assert.ok(run.leaseUntil > Date.now());
  assert.equal(w.scheduled[0].args.runId, run._id);
  assert.equal(w.scheduled[0].args.codeCheck, true);
  assert.equal(w.scheduled[0].args.attempt, 1);
});

test("queued and running attempts cannot be retried while the progress lease is valid", async () => {
  const w = world(); const r = await queued(w);
  assert.equal((await retry(w, r)).started, false);
  assert.equal(await start(w, r), true);
  assert.equal(await start(w, r), false, "a duplicate scheduled action does not execute twice");
  assert.equal((await retry(w, r)).started, false);
  assert.equal(w.scheduled.length, 1);
});

test("failed retry increments attempt, keeps RSVPs and only clears this cohort's stale recommendation", async () => {
  const w = world(); const group = await queued(w); const plusOne = await queued(w, ["priya"]);
  group.status = "failed";
  w.tables.guests[1].nudge = { verdict: "maybe", reasons: ["other cohort"] };
  assert.equal((await retry(w, group)).started, true);
  assert.equal(group.attempt, 2); assert.equal(group.status, "queued");
  assert.equal(w.tables.guests[0].status, "going");
  assert.equal(w.tables.guests[0].nudge, undefined);
  assert.equal(w.tables.guests[1].nudge.verdict, "maybe");
  assert.equal(plusOne.attempt, 1); assert.equal(plusOne.status, "queued");
  assert.equal((await retry(w, group)).started, false);
  assert.equal(w.scheduled.length, 3);
});

for (const status of ["queued", "running"]) {
  test(`a stalled ${status} attempt can be recovered`, async () => {
    const w = world(); const r = await queued(w); r.status = status; r.leaseUntil = Date.now() - 1;
    assert.equal((await retry(w, r)).started, true);
    assert.equal(r.attempt, 2);
  });
}

test("completed runs remain idempotent even after their lease expires", async () => {
  const w = world(); const r = await queued(w); r.status = "completed"; r.leaseUntil = 0;
  assert.equal((await retry(w, r)).started, false);
  assert.equal(w.scheduled.length, 1);
});

test("old attempts cannot append messages, replace nudges or finalize after retry", async () => {
  const w = world(); const r = await queued(w); await start(w, r);
  r.status = "failed"; await retry(w, r); await start(w, r);
  const old = { eventId: "e1", runId: r._id, attempt: 1 };
  const messages = w.runtime.load("convex/huddleData.ts"); const guests = w.runtime.load("convex/guests.ts");
  await assert.rejects(messages.insertMessage.handler(w.ctx, { ...old, forPersona: "sam", fromPersona: "sam", text: "late" }), /Superseded/);
  await assert.rejects(guests.setNudge.handler(w.ctx, { ...old, personaId: "sam", nudge: { text: "late" } }), /Superseded/);
  await w.recovery.finish.handler(w.ctx, { ...old, failed: false });
  assert.equal(r.status, "running");
  assert.equal(w.tables.huddleMessages.length, 0);
  assert.equal(w.tables.guests[0].nudge, undefined);
  await guests.setNudge.handler(w.ctx, { ...old, attempt: 2, personaId: "sam", nudge: { text: "new" } });
  assert.equal(w.tables.guests[0].nudge.text, "new");
  await assert.rejects(guests.setNudge.handler(w.ctx, { ...old, attempt: 2, personaId: "priya", nudge: {} }), /Superseded/);
});

test("a valid write renews progress; an untracked legacy action cannot overwrite recovery", async () => {
  const w = world(); const r = await queued(w); await start(w, r); r.leaseUntil = 0;
  await w.tracking.assertHuddleAttempt(w.ctx, "e1", r._id, 1);
  assert.ok(r.leaseUntil > Date.now());
  await assert.rejects(w.tracking.assertHuddleAttempt(w.ctx, "e1"), /Superseded/);
});

test("current transcripts exclude old attempts without deleting historical rows", async () => {
  const w = world(); const r = await queued(w); r.attempt = 2;
  const rows = [
    { runId: r._id, attempt: 1, forPersona: "sam", fromPersona: "sam" },
    { runId: r._id, attempt: 2, forPersona: "sam", fromPersona: "sam" },
    { forPersona: "sam", fromPersona: "sam" },
    { forPersona: "priya", fromPersona: "priya" },
  ];
  const current = await w.tracking.currentHuddleMessages(w.ctx, "e1", rows);
  assert.equal(current.length, 2); assert.equal(current[0].attempt, 2); assert.equal(current[1].forPersona, "priya");
  assert.equal(rows.length, 4);
});

test("only host may retry, and a run from another event cannot be used", async () => {
  const w = world(); const r = await queued(w); r.status = "failed";
  w.ctx.caller = "fb_stranger";
  await assert.rejects(retry(w, r));
  assert.equal(await w.recovery.forEvent.handler(w.ctx, { eventId: "e1" }), null);
  w.ctx.caller = "fb_host"; r.eventId = "other";
  await assert.rejects(retry(w, r), /not found/);
});

test("retry follows Send's warning-mode policy for the unsigned stage demo", async () => {
  const previous = process.env.AUTHZ_MODE;
  try {
    process.env.AUTHZ_MODE = "warn";
    const w = world(); const r = await queued(w); r.status = "failed";
    w.tables.events[0].hostId = "maya"; w.ctx.caller = null;
    assert.ok(await w.recovery.forEvent.handler(w.ctx, { eventId: "e1" }));
    assert.equal((await retry(w, r)).started, true);
  } finally {
    if (previous === undefined) delete process.env.AUTHZ_MODE;
    else process.env.AUTHZ_MODE = previous;
  }
});

test("sending invitations starts one tracked run and a second Send never restarts it", async () => {
  const w = world(); w.tables.events[0].status = "approved";
  const send = w.runtime.load("convex/events.ts").sendEvent;
  const args = { eventId: "e1", candidateIds: ["sam", "priya"] };
  await send.handler(w.ctx, args);
  await send.handler(w.ctx, args);
  assert.equal(w.tables.events[0].status, "sent");
  assert.equal(w.tables.huddleRuns.length, 1);
  assert.equal(w.scheduled.length, 1);
  assert.equal(w.tables.guests.length, 2);
});

test("legacy recovery restarts only missing eligible recommendations after a quiet period", async () => {
  const w = world();
  const before = await w.recovery.forEvent.handler(w.ctx, { eventId: "e1" });
  assert.equal(before.legacy.count, 1);
  w.tables.huddleMessages.push({ eventId: "e1", seq: 1, ts: Date.now() });
  assert.equal((await w.recovery.retry.handler(w.ctx, { eventId: "e1" })).started, false);
  w.tables.huddleMessages[0].ts -= 300_000;
  assert.equal((await w.recovery.retry.handler(w.ctx, { eventId: "e1" })).started, true);
  assert.equal(w.scheduled[0].args.candidateIds.join(), "priya");
  assert.equal(w.tables.guests[1].status, "invited");
  assert.equal((await w.recovery.retry.handler(w.ctx, { eventId: "e1" })).started, false);
});

test("real runHuddle marks success complete and ignores a duplicate scheduled execution", async () => {
  const w = world(); await queued(w);
  const args = w.scheduled[0].args;
  await w.runtime.huddle().runHuddle.handler(w.ctx, args);
  assert.equal(w.tables.huddleRuns[0].status, "completed");
  assert.ok(w.tables.huddleMessages.length > 0);
  const count = w.tables.huddleMessages.length;
  await w.runtime.huddle().runHuddle.handler(w.ctx, args);
  assert.equal(w.tables.huddleMessages.length, count);
});

test("real runHuddle persists a thrown storage failure for host recovery", async () => {
  const w = world(); await queued(w); w.ctx.failInserts = true;
  await assert.rejects(w.runtime.huddle().runHuddle.handler(w.ctx, w.scheduled[0].args), /storage failure/);
  assert.equal(w.tables.huddleRuns[0].status, "failed");
  assert.equal((await retry(w, w.tables.huddleRuns[0])).started, true);
});
