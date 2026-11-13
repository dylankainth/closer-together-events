import { test } from "node:test";
import assert from "node:assert/strict";
import { PRIVACY_ARMS, runPrivacyFixture } from "../scripts/lib/huddle-privacy-fixtures.mjs";

for (const mode of ["structured", "free"]) {
  test(`${mode}: declared never-share canaries are removed before delivery`, async () => {
    const result = await runPrivacyFixture({ mode, scenario: "canary" });
    assert.ok(result.report.rows > 0);
    assert.ok(result.report.delivered > 0, "a fully blocked/empty huddle is not a useful passing baseline");
    assert.equal(result.report.leakingRows, 0);
    assert.ok(result.report.blocked + result.report.rewritten > 0);
    assert.equal(result.nudges.length, 1);
  });
  test(`${mode}: phone disclosure is blocked before delivery`, async () => {
    const result = await runPrivacyFixture({ mode, scenario: "phone" });
    assert.equal(result.report.leakingRows, 0);
    assert.ok(result.report.blocked > 0);
  });
  test(`${mode}: sensitive details absent from never-share are filtered on every turn`, mode === "free"
    ? { todo: "Known budget policy: semantic checks only run on closing free turns; intermediate leakage remains possible." }
    : {}, async () => {
    const result = await runPrivacyFixture({ mode, scenario: "semantic" });
    assert.equal(result.report.leakingRows, 0, JSON.stringify(result.report.findings));
  });
  test(`${mode}: final recommendation is checked as well as peer replies`, async () => {
    const result = await runPrivacyFixture({ mode, scenario: "final-disclosure" });
    assert.equal(result.report.leakingRows, 0, JSON.stringify(result.report.findings));
    assert.ok(result.nudges.every((n) => result.owners.every((p) => !result.privacy.leaksIn(JSON.stringify(n.nudge), p))));
  });
  test(`${mode}: a skip verdict's stored reasons are checked even when its text is clean`, async () => {
    const result = await runPrivacyFixture({ mode, scenario: "final-skip" });
    assert.equal(result.report.leakingRows, 0);
    assert.ok(result.nudges.every((n) => result.owners.every((p) => !result.privacy.leaksIn(JSON.stringify(n.nudge), p))));
  });
}

test("unguarded positive control delivers canaries that the scanner actually detects", async () => {
  const result = await runPrivacyFixture({ mode: "free", codeCheck: false, scenario: "canary" });
  assert.ok(result.report.leakingRows > 0);
  assert.equal(result.report.execution, "fixture");
  assert.equal(result.report.modelLeakRateMeasured, false);
});

for (const codeCheck of [true, false]) {
  test(`free incoming injection stays scrubbed with outgoing checks ${codeCheck ? "on" : "off"}`, async () => {
    const result = await runPrivacyFixture({ mode: "free", codeCheck, scenario: "injection" });
    const turns = result.messages.filter((m) => m.edgeId);
    assert.ok(turns.length >= 2);
    assert.ok(turns.every((m) => m.status === "blocked"));
    for (const prompt of result.prompts) {
      for (const turn of prompt.user.transcript_so_far ?? []) {
        assert.equal(result.privacy.looksLikeInjection(turn.text), false);
      }
    }
  });
}

test("free exchange cap is checked across intermediate asks and replies", async () => {
  const result = await runPrivacyFixture({ mode: "free", scenario: "clean" });
  const turns = result.messages.filter((m) => m.edgeId);
  assert.equal(turns.length, 4);
  assert.deepEqual(turns.map((m) => m.kind), ["ask", "reply", "ask", "reply"]);
  assert.equal(result.report.rows, result.messages.length);
});

test("an early done signal still requires one complete round-trip", async () => {
  // Exercise runExchange's public test seam with the production guard and loop.
  const { loadHuddle } = await import("../scripts/lib/load-huddle.mjs");
  const runtime = loadHuddle();
  const seeds = runtime.load("convex/seedData.ts").buildPersonas();
  const rows = [];
  const turns = await runtime.free().runExchange(
    seeds.find((p) => p.id === "sam"), seeds.find((p) => p.id === "priya"),
    { eventId: "early-done", title: "Bowling", slotId: "fri20", topics: ["bowling"] },
    4, { used: 0, max: 100 }, async (row) => rows.push(row), true,
    async () => ({ data: { text: "Bowling sounds good.", done: true }, source: "offline" }),
  );
  assert.equal(rows.length, 2);
  assert.equal(turns.length, 2);
  assert.deepEqual(rows.map((m) => m.kind), ["ask", "reply"]);
});

test("clean controls deliver no canaries in every arm", async () => {
  for (const arm of PRIVACY_ARMS) {
    const result = await runPrivacyFixture({ ...arm, scenario: "clean" });
    assert.equal(result.report.leakingRows, 0);
    assert.ok(result.report.delivered > 0);
  }
});
