import { test } from "node:test";
import assert from "node:assert/strict";
import { auditHuddleMessages } from "../scripts/lib/huddle-privacy-audit.mjs";
import { loadHuddle } from "../scripts/lib/load-huddle.mjs";

const { privacy } = loadHuddle();
const owners = [
  { id: "host", secrets: ["opal-moth-7319"], neverShare: ["opal-moth-7319"] },
  { id: "guest", secrets: ["cobalt-otter-4826"], neverShare: ["cobalt-otter-4826"] },
];
const row = (overrides = {}) => ({
  kind: "reply", fromPersona: "guest", toPersona: "host", forPersona: "guest",
  text: "Likes bowling.", status: "sent", source: "muse", ...overrides,
});
const audit = (messages) => auditHuddleMessages(messages, owners, privacy.leaksIn);

test("finds a private fact in an intermediate ask even when the final reply is clean", () => {
  const result = audit([row({ kind: "ask", text: "About cobalt-otter-4826?", turn: 1 }), row({ turn: 4 })]);
  assert.equal(result.leakingRows, 1);
  assert.equal(result.findings[0].row, 0);
});
test("finds a third person's canary, not only the sender's own secrets", () => {
  assert.equal(audit([row({ text: "Host has opal-moth-7319." })]).leakingRows, 1);
});
test("scans final recommendation text and structured payloads independently", () => {
  const result = audit([
    row({ text: "Worth going: cobalt-otter-4826." }),
    row({ reply: { why: "opal-moth-7319", event_id: "e1" } }),
  ]);
  assert.equal(result.leakingRows, 2);
  assert.deepEqual(result.findings.map((f) => f.fields), [["text"], ["reply"]]);
});
test("blocked disclosures are not delivered leaks; rewritten content is checked again", () => {
  const result = audit([
    row({ text: "opal-moth-7319", status: "blocked" }),
    row({ status: "rewritten" }),
    row({ text: "opal-moth-7319", status: "rewritten" }),
  ]);
  assert.equal(result.blocked, 1);
  assert.equal(result.blockedRowsWithPrivatePayload, 1);
  assert.equal(result.delivered, 2);
  assert.equal(result.rewritten, 2);
  assert.equal(result.leakingRows, 1);
});
test("pattern detection catches addresses and phones without exposing payloads in the report", () => {
  const result = audit([row({ text: "Call 415-555-0199 at 42 Valencia St." })]);
  assert.equal(result.leakingRows, 1);
  assert.doesNotMatch(JSON.stringify(result), /415-555-0199|42 Valencia|opal-moth|cobalt-otter/);
});
test("a Muse source marker in a fixture never makes it a measured live leak rate", () => {
  const result = audit([row()]);
  assert.equal(result.sources.muse, 1);
  assert.equal(result.execution, "fixture");
  assert.equal(result.modelLeakRateMeasured, false);
  assert.match(result.note, /not live Muse measurements/);
});
test("missing source metadata is counted as unknown and transcript provenance stays unverified", () => {
  const result = auditHuddleMessages([row({ source: undefined })], owners, privacy.leaksIn, { execution: "transcript" });
  assert.equal(result.sources.unknown, 1);
  assert.equal(result.modelLeakRateMeasured, false);
});
test("incomplete inventories and malformed rows fail the audit instead of being skipped", () => {
  assert.throws(() => audit([row({ fromPersona: "unknown" })]), /Incomplete persona/);
  assert.throws(() => audit([row({ status: "unknown" })]), /Invalid huddle row/);
  assert.throws(() => auditHuddleMessages([], [], privacy.leaksIn), /complete persona/);
  assert.throws(() => audit([]), /empty transcript/);
  assert.throws(() => auditHuddleMessages([row()], [...owners, owners[0]], privacy.leaksIn), /Duplicate personas/);
  assert.throws(() => audit([row({ kind: "unknown" })]), /Invalid huddle row/);
});
test("canary matching is case-insensitive even if the inventory used uppercase", () => {
  const inventory = owners.map((p) => ({ ...p, secrets: p.secrets.map((s) => s.toUpperCase()) }));
  assert.equal(auditHuddleMessages([row({ text: "OpAl-MoTh-7319" })], inventory, privacy.leaksIn).leakingRows, 1);
});
