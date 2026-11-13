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

// A spread invite reaches someone the host never picked, because a friend of theirs said yes.
// Attributing it to the host is both false and useless: it hides the only fact that explains
// why the event turned up at all. Verified live first — Leo's notification read "Jess invited
// you" when it was Blake's acceptance that reached him.
test("a spread invite names the friend whose yes caused it, not the host", async () => {
  const { inviteCopy } = await import("../convex/notifications.ts");
  const { title, body } = inviteCopy("Jess's climbing social", "Jess Kim", "Blake Okafor");
  assert.equal(title, "Blake is going to Jess's climbing social");
  assert.match(body, /^Blake said yes, so Jess's event came your way\./);
  // The host still gets credit for the event; they just didn't pick this person.
  assert.ok(body.includes("Jess"));
});

test("an ordinary invite still reads as coming from the host", async () => {
  const { inviteCopy } = await import("../convex/notifications.ts");
  const { title, body } = inviteCopy("Bowling night", "Maya Chen");
  assert.equal(title, "Maya invited you to Bowling night");
  assert.equal(body, "Tap to see who's going and reply.");
});
