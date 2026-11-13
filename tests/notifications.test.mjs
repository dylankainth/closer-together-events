// Pure shaping logic only (buildNotifications never touches Convex), same pattern as
// tests/pickView.test.mjs: import the helper straight from convex/*.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotifications } from "../convex/notifications.ts";

const row = (o = {}) => ({
  id: "a", kind: "invite", title: "t", body: "b", eventId: "evt_1", ts: 0, read: false, ...o,
});

test("sorts newest first", () => {
  const out = buildNotifications([row({ id: "a", ts: 10 }), row({ id: "b", ts: 30 }), row({ id: "c", ts: 20 })]);
  assert.deepEqual(out.map((r) => r.id), ["b", "c", "a"]);
});

test("drops exact-id duplicates, keeping the first occurrence", () => {
  const out = buildNotifications([row({ id: "a", ts: 10, title: "first" }), row({ id: "a", ts: 10, title: "second" })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "first");
});

test("empty input stays empty", () => {
  assert.deepEqual(buildNotifications([]), []);
});

test("does not mutate the input array", () => {
  const input = [row({ id: "a", ts: 1 }), row({ id: "b", ts: 2 })];
  const copy = [...input];
  buildNotifications(input);
  assert.deepEqual(input, copy);
});
