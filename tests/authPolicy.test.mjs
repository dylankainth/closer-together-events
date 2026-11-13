// Who may act as whom. Pure policy, no Convex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isSeeded, parseOperators, decide, applyMode, canViewEvent, canGoIf } from "../convex/authPolicy.ts";
import { buildPersonas } from "../convex/seedData.ts";

test("seeded vs real personas", () => {
  assert.equal(isSeeded("maya"), true);
  assert.equal(isSeeded("sam"), true);
  assert.equal(isSeeded("fb_123"), false);
  assert.equal(isSeeded(""), false); // empty id is never treated as demo data
});

test("every seeded persona id is non-fb_", () => {
  for (const p of buildPersonas()) assert.ok(!p.id.startsWith("fb_"), p.id);
});

test("parseOperators trims and drops blanks", () => {
  assert.deepEqual([...parseOperators(" fb_1, fb_2,, ")].sort(), ["fb_1", "fb_2"]);
  assert.equal(parseOperators(undefined).size, 0);
});

// [caller, isOperator, target, read, write] ; owner must equal write in every row
const TABLE = [
  [null, false, "maya", true, false], // anonymous + seeded
  [null, false, "fb_x", false, false], // anonymous + real user
  ["fb_x", false, "fb_x", true, true], // self
  ["fb_x", true, "fb_x", true, true], // operator self
  ["fb_x", false, "fb_y", false, false], // other real user
  ["fb_x", false, "maya", true, false], // non-operator + seeded
  ["fb_x", true, "maya", true, true], // operator + seeded
  ["fb_x", true, "fb_y", false, false], // operator + other real user
];
for (const [caller, op, target, read, write] of TABLE) {
  test(`decide caller=${caller} op=${op} target=${target}`, () => {
    assert.equal(decide({ callerId: caller, isOperator: op, targetId: target, level: "read" }).allow, read);
    assert.equal(decide({ callerId: caller, isOperator: op, targetId: target, level: "write" }).allow, write);
    assert.equal(decide({ callerId: caller, isOperator: op, targetId: target, level: "owner" }).allow, write);
  });
}

test("decide always gives a reason", () => {
  const d = decide({ callerId: null, isOperator: false, targetId: "fb_x", level: "write" });
  assert.equal(d.allow, false);
  assert.ok(d.reason.length > 0);
});

test("applyMode fails closed: only an explicit 'warn' lets a 'no' through", () => {
  assert.equal(applyMode("enforce", true), "allow");
  assert.equal(applyMode(undefined, true), "allow");
  for (const m of ["warn", "WARN", " Warn "]) assert.equal(applyMode(m, false), "warn", String(m));
  for (const m of [undefined, "", "enforce", "ENFORCE", "wran", "off", "allow"]) assert.equal(applyMode(m, false), "deny", String(m));
});

test("applyMode never warns for owner-level (private) checks", () => {
  assert.equal(applyMode("warn", false, "owner"), "deny");
  assert.equal(applyMode("warn", true, "owner"), "allow");
  assert.equal(applyMode("warn", false, "write"), "warn");
  assert.equal(applyMode("warn", false, "read"), "warn");
});

test("canViewEvent: drafts only for host and guests; sent events for everyone", () => {
  const draft = { status: "draft", hostId: "maya" };
  assert.equal(canViewEvent(draft, ["sam"], "maya"), true);
  assert.equal(canViewEvent(draft, ["sam"], "sam"), true);
  assert.equal(canViewEvent(draft, ["sam"], "priya"), false);
  assert.equal(canViewEvent({ status: "approved", hostId: "maya" }, [], "priya"), false);
  assert.equal(canViewEvent({ status: "sent", hostId: "maya" }, [], "priya"), true);
});

test("canGoIf: friend must be the viewer's friend AND on this event's guest list", () => {
  const friends = ["sam", "priya"];
  const guests = ["sam", "leo"];
  assert.equal(canGoIf(friends, guests, "sam"), true);
  assert.equal(canGoIf(friends, guests, "priya"), false); // friend, not invited
  assert.equal(canGoIf(friends, guests, "leo"), false); // invited, not a friend
  assert.equal(canGoIf(friends, guests, "stranger"), false);
  assert.equal(canGoIf(friends, guests, ""), false);
  assert.equal(canGoIf(friends, guests, undefined), false);
});
