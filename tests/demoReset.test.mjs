import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { v } from "convex/values";

// Loads convex/demoReset.ts with the Convex registration boundary and the database mocked, the same way
// tests/externalRsvp.test.mjs does, so it runs without generated files or a deployment.
function loadTs(relPath, requireFn) {
  const module = { exports: {} };
  const source = readFileSync(new URL(relPath, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, require: requireFn });
  return module.exports;
}

const validators = loadTs("../convex/discoveryValidators.ts", (name) => {
  if (name === "convex/values") return { v };
  throw new Error(`Unexpected import: ${name}`);
});
const { apply } = loadTs("../convex/demoReset.ts", (name) => {
  if (name === "convex/values") return { v };
  if (name === "./_generated/server") return { internalMutation: (d) => d };
  if (name === "./discoveryValidators") return validators;
  throw new Error(`Unexpected import: ${name}`);
});

function database(seed) {
  const tables = {
    events: [], guests: [], huddleMessages: [], picks: [],
    ...Object.fromEntries(Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))])),
  };
  const writes = [];
  const find = (id) => Object.entries(tables).flatMap(([t, rows]) => rows.map((r) => [t, r])).find(([, r]) => r._id === id);
  const ctx = { db: {
    query(table) {
      const filters = [];
      const index = { eq(key, value) { filters.push((r) => r[key] === value); return index; } };
      const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
      return {
        withIndex(_name, build) { build(index); return this; },
        async unique() { return rows()[0] ?? null; },
        async collect() { return rows(); },
      };
    },
    async patch(id, fields) {
      const hit = find(id);
      assert.ok(hit, `patch targets an existing row (${id})`);
      Object.assign(hit[1], fields);
      writes.push(`patch ${id}`);
    },
    async delete(id) {
      const hit = find(id);
      assert.ok(hit, `delete targets an existing row (${id})`);
      tables[hit[0]] = tables[hit[0]].filter((r) => r._id !== id);
      writes.push(`delete ${id}`);
    },
  } };
  return { ctx, tables, writes };
}

const seed = () => ({
  events: [
    { _id: "ev-draft", eventId: "evt_test", title: "Test night", status: "draft" },
    { _id: "ev-sent", eventId: "evt_live", title: "Real party", status: "sent" },
  ],
  guests: [
    { _id: "g1", eventId: "evt_test", personaId: "p_a", status: "invited" },
    { _id: "g2", eventId: "evt_live", personaId: "p_leo", status: "going" },
    { _id: "g3", eventId: "evt_live", personaId: "p_b", status: "going" },
  ],
  huddleMessages: [{ _id: "h1", eventId: "evt_test", seq: 1 }],
  picks: [{ _id: "k1", personaId: "p_maya", eventKey: "key1", status: "going" }],
});

const everything = {
  deleteEventIds: ["evt_test"],
  guests: [{ eventId: "evt_live", personaId: "p_leo", status: "invited" }],
  picks: [{ personaId: "p_maya", eventKey: "key1", status: "new" }],
};

test("dry run is the default: it reports every change and writes nothing", async () => {
  const db = database(seed());
  const out = await apply.handler(db.ctx, everything);
  assert.equal(out.dryRun, true);
  assert.equal(out.report.length, 3);
  assert.deepEqual(db.writes, []);
});

test("applying deletes the test event with its guests and huddle messages", async () => {
  const db = database(seed());
  await apply.handler(db.ctx, { dryRun: false, deleteEventIds: ["evt_test"] });
  assert.deepEqual(db.tables.events.map((e) => e.eventId), ["evt_live"]);
  assert.deepEqual(db.tables.guests.map((g) => g._id), ["g2", "g3"]);
  assert.deepEqual(db.tables.huddleMessages, []);
});

test("an event already sent to guests is never deleted", async () => {
  const db = database(seed());
  const out = await apply.handler(db.ctx, { dryRun: false, deleteEventIds: ["evt_live"] });
  assert.deepEqual(db.writes, []);
  assert.match(out.report[0], /sent.*not deleted/i);
});

test("applying resets only the named guest's answer on that event", async () => {
  const db = database(seed());
  await apply.handler(db.ctx, { dryRun: false, guests: everything.guests });
  assert.deepEqual(db.tables.guests.map((g) => g.status), ["invited", "invited", "going"]);
});

test("applying puts a pick back to new", async () => {
  const db = database(seed());
  await apply.handler(db.ctx, { dryRun: false, picks: everything.picks });
  assert.equal(db.tables.picks[0].status, "new");
});

test("a reset also clears a pick's snooze, as picks.respond does on every answer", async () => {
  const db = database({ picks: [{ _id: "k1", personaId: "p_maya", eventKey: "key1", status: "snoozed", snoozedUntil: 9e12 }] });
  await apply.handler(db.ctx, { dryRun: false, picks: everything.picks });
  assert.equal(db.tables.picks[0].status, "new");
  assert.equal(db.tables.picks[0].snoozedUntil, undefined);
});

test("a guest reset also clears go-if-friend and snooze, as the feed RSVP does", async () => {
  const db = database({ guests: [{ _id: "g2", eventId: "evt_live", personaId: "p_leo", status: "maybe", goIfFriend: "p_b", snoozedUntil: 9e12 }] });
  await apply.handler(db.ctx, { dryRun: false, guests: everything.guests });
  assert.equal(db.tables.guests[0].status, "invited");
  assert.equal(db.tables.guests[0].goIfFriend, undefined);
  assert.equal(db.tables.guests[0].snoozedUntil, undefined);
});

test("the report says 'would' on a dry run and states what was done otherwise", async () => {
  const dry = await apply.handler(database(seed()).ctx, everything);
  assert.ok(dry.report.every((l) => /would/.test(l)), dry.report.join("\n"));
  const done = await apply.handler(database(seed()).ctx, { ...everything, dryRun: false });
  assert.ok(done.report.every((l) => !/would/.test(l)), done.report.join("\n"));
});

test("a sent event is kept even when listed with a test draft in one call", async () => {
  const db = database(seed());
  await apply.handler(db.ctx, { dryRun: false, deleteEventIds: ["evt_live", "evt_test"] });
  assert.deepEqual(db.tables.events.map((e) => e.eventId), ["evt_live"]);
});

test("rows that don't exist are reported and skipped, not thrown", async () => {
  const db = database(seed());
  const out = await apply.handler(db.ctx, {
    dryRun: false,
    deleteEventIds: ["evt_missing"],
    guests: [{ eventId: "evt_live", personaId: "p_nobody", status: "invited" }],
    picks: [{ personaId: "p_maya", eventKey: "nope", status: "new" }],
  });
  assert.deepEqual(db.writes, []);
  assert.equal(out.report.filter((l) => /not found/.test(l)).length, 3);
});

test("statuses are fixed unions, not free text", () => {
  const guestStatuses = apply.args.guests.json.value.value.status.fieldType.value.map((x) => x.value);
  assert.deepEqual(guestStatuses, ["invited", "going", "maybe", "skip", "cant"]);
  const pickStatuses = apply.args.picks.json.value.value.status.fieldType.value.map((x) => x.value);
  assert.deepEqual(pickStatuses, ["new", "going", "maybe", "cant", "snoozed"]);
});
