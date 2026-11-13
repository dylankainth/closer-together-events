// applyPins (convex/shortlistPolicy.ts) is the fix for a real bug: rank_guests used to write
// `shortlist: reranked.data` wholesale on every rerun, so any host selection stored per-item got
// clobbered the next time ranking ran. Pins live outside the shortlist and this is the one place
// that reconciles them against it — these tests pin down the rules rather than leaving them to
// review.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPins } from "../convex/shortlistPolicy.ts";

// Already ranked best-first, as rerank() produces it — that ordering is load-bearing for "fill
// remaining slots by existing order".
const item = (id, over = {}) => ({
  personaId: id, name: id, initials: id[0].toUpperCase(), color: "#000",
  score: 0, tie: 0, topic: 0, reason: "", available: true, hop: 1, selected: false, ...over,
});
const shortlist = (ids) => ids.map((id) => item(id));

test("no pins behaves exactly like today's top-quota-by-rank", () => {
  const got = applyPins(shortlist(["a", "b", "c", "d"]), [], 2);
  assert.deepEqual(got.map((s) => s.selected), [true, true, false, false]);
});

test("undefined pins is the same as empty pins", () => {
  const got = applyPins(shortlist(["a", "b", "c"]), undefined, 1);
  assert.deepEqual(got.map((s) => s.selected), [true, false, false]);
});

test("a pin outranks the ranking — stays selected even ranked outside quota", () => {
  // "d" is last by rank but pinned; quota 2 would otherwise only select a, b.
  const got = applyPins(shortlist(["a", "b", "c", "d"]), ["d"], 2);
  const byId = Object.fromEntries(got.map((s) => [s.personaId, s.selected]));
  assert.equal(byId.d, true, "pinned guest must be selected regardless of rank");
});

test("remaining slots fill up to quota, best-first, skipping pins", () => {
  // quota 3, "c" pinned (uses one slot) -> two more slots fill from rank order a, b (skipping c).
  const got = applyPins(shortlist(["a", "b", "c", "d"]), ["c"], 3);
  const byId = Object.fromEntries(got.map((s) => [s.personaId, s.selected]));
  assert.deepEqual(byId, { a: true, b: true, c: true, d: false });
});

test("unknown pinned ids (not in the shortlist) are ignored", () => {
  const got = applyPins(shortlist(["a", "b", "c"]), ["ghost", "a"], 1);
  const byId = Object.fromEntries(got.map((s) => [s.personaId, s.selected]));
  // "a" is both pinned and top-ranked, so quota=1 is already satisfied by it alone.
  assert.deepEqual(byId, { a: true, b: false, c: false });
});

test("more pins than quota: all pins stay selected, nothing extra added", () => {
  // Quota is 1 but three are pinned — the host's explicit choice wins over the cap (see the
  // comment in shortlistPolicy.ts for why this is deliberate).
  const got = applyPins(shortlist(["a", "b", "c", "d"]), ["a", "b", "c"], 1);
  const byId = Object.fromEntries(got.map((s) => [s.personaId, s.selected]));
  assert.deepEqual(byId, { a: true, b: true, c: true, d: false });
});

test("does not mutate the input shortlist array or its items", () => {
  const input = shortlist(["a", "b", "c"]);
  const snapshot = JSON.parse(JSON.stringify(input));
  applyPins(input, ["b"], 1);
  assert.deepEqual(input, snapshot);
});

test("pins alone, with quota 0, still select every pin", () => {
  const got = applyPins(shortlist(["a", "b"]), ["a", "b"], 0);
  assert.deepEqual(got.map((s) => s.selected), [true, true]);
});
