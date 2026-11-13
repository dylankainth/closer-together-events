import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { v } from "convex/values";

// Exercise the real public mutation with its database and Convex registration boundary mocked.
// This keeps the tests independent of generated files, a deployment, and authentication.
const module = { exports: {} };
const source = readFileSync(new URL("../convex/events.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require(name) {
    if (name === "convex/values") return { v };
    if (name === "./_generated/server") return { query: (d) => d, mutation: (d) => d, internalMutation: (d) => d };
    if (name === "./_generated/api") return { internal: {} };
    if (name === "./authz") return {};
    // Spread has its own rule tests (tests/spread.test.mjs); here it's stubbed so these stay
    // focused on the RSVP mutation itself.
    if (name === "./spread") return { spreadFromAcceptance: async () => {} };
    throw new Error(`Unexpected import: ${name}`);
  },
});
const mutation = module.exports.rsvpExternal;

function database(status = "sent", guests = []) {
  const tables = {
    events: status === null ? [] : [{ _id: "event-row", eventId: "e1", status }],
    guests: guests.map((g) => ({ ...g })),
  };
  const writes = [];
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
      const row = tables.guests.find((g) => g._id === id);
      assert.ok(row, "patch targets an existing guest");
      Object.assign(row, fields);
      writes.push("patch");
    },
    async insert(table, fields) {
      tables[table].push({ _id: `new-${tables[table].length}`, ...fields });
      writes.push("insert");
    },
  } };
  return { ctx, tables, writes };
}

test("anonymous responses have a fixed status union; older clients may omit status", () => {
  assert.equal(mutation.args.status.isOptional, "optional");
  assert.deepEqual(mutation.args.status.json.value.map((v) => v.value), ["going", "maybe", "cant"]);
  assert.deepEqual(Object.keys(mutation.args).sort(), ["eventId", "name", "status"]);
});

for (const status of [undefined, "going", "maybe", "cant"]) {
  test(`external answer ${status ?? "omitted"} persists without a login`, async () => {
    const db = database();
    const result = await mutation.handler(db.ctx, { eventId: "e1", name: "  Alex  ", status });
    assert.equal(result, undefined, "a public RSVP returns no guest data");
    assert.equal(db.tables.guests[0].name, "Alex");
    assert.equal(db.tables.guests[0].status, status ?? "going");
    assert.equal(db.tables.guests[0].kind, "external");
    assert.equal(db.tables.guests[0].personaId, undefined);
  });
}

test("changing an answer updates only this event's external guest, never a Facebook user", async () => {
  const db = database("sent", [
    { _id: "real", eventId: "e1", name: "Alex", kind: "muse", personaId: "fb_alex", status: "going" },
    { _id: "external", eventId: "e1", name: "Alex", kind: "external", status: "going" },
    { _id: "other", eventId: "e2", name: "Alex", kind: "external", status: "going" },
  ]);
  await mutation.handler(db.ctx, { eventId: "e1", name: "Alex", status: "cant" });
  assert.deepEqual(db.tables.guests.map((g) => g.status), ["going", "cant", "going"]);
  assert.deepEqual(db.writes, ["patch"]);
});

for (const status of [null, "draft", "approved"]) {
  test(`missing or unopened invite (${status}) cannot accept a response`, async () => {
    const db = database(status);
    await assert.rejects(mutation.handler(db.ctx, { eventId: "e1", name: "Alex", status: "going" }), /isn't open/);
    assert.deepEqual(db.writes, []);
  });
}

for (const name of ["", "   ", "x".repeat(81)]) {
  test(`invalid name of length ${name.length} writes nothing`, async () => {
    const db = database();
    await assert.rejects(mutation.handler(db.ctx, { eventId: "e1", name }), /between 1 and 80/);
    assert.deepEqual(db.writes, []);
  });
}
