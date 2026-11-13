// The picks refresh button re-ranks at most once a minute per person.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canRefresh, REFRESH_GAP_MS } from "../convex/discoveryCore.ts";

const T = Date.UTC(2026, 10, 13, 18);

test("first refresh is always allowed", () => {
  assert.equal(canRefresh(null, T), true);
});

test("a second refresh inside a minute is refused, after a minute it is allowed", () => {
  assert.equal(REFRESH_GAP_MS, 60_000);
  assert.equal(canRefresh(T - 30_000, T), false);
  assert.equal(canRefresh(T - 59_999, T), false);
  assert.equal(canRefresh(T - 61_000, T), true);
});

test("a timestamp from the future (clock skew) does not lock the button forever", () => {
  assert.equal(canRefresh(T + 10 * 60_000, T), true);
});
