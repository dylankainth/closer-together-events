import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { v } from "convex/values";

// A guest (anyone who isn't the host) must never get the host's private planning text: what they typed to
// their Muse (hostDescription) and who they described as the audience (audienceRaw).
const module = { exports: {} };
const source = readFileSync(new URL("../convex/events.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(compiled, {
  module, exports: module.exports,
  require(name) {
    if (name === "convex/values") return { v, ConvexError: Error };
    if (name === "./_generated/server") return { query: (d) => d, mutation: (d) => d, internalMutation: (d) => d };
    if (name === "./authz") return { allowedAs: async () => false, requireActor: async () => {}, requireHost: async () => {} };
    return {};
  },
});
const { getByEventId } = module.exports;

const event = {
  _id: "row", eventId: "evt_x", hostId: "priya", status: "sent", title: "Priya's birthday night",
  hostDescription: "Sam's 30th, he's had a rough year so keep it low key",
  audienceRaw: "my closest friends except Dave", shortlist: [{ id: "a" }], drafts: [], venueOptions: [],
};
const ctx = { db: { query: () => ({ withIndex: () => ({ unique: async () => event }) }) } };

test("a guest's view of a sent event leaves out the host's private planning text", async () => {
  const view = await getByEventId.handler(ctx, { eventId: "evt_x" });
  assert.equal(view.title, "Priya's birthday night");
  for (const key of ["hostDescription", "audienceRaw", "shortlist", "drafts", "venueOptions"]) {
    assert.equal(key in view, false, `${key} must not reach a guest`);
  }
});
