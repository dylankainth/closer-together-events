// Pure discovery logic: dedupe, qualify rules, fallback ranking. No Convex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventKey, mergeDuplicates, qualifies, resolveCoords, fallbackRank, clampReason, MAX_PICKS } from "../convex/discoveryCore.ts";

const NOW = Date.UTC(2026, 10, 13, 18);
const ev = (o) => ({
  source: "hackradar", sourceId: "1", url: "u", title: "Jazz Night", description: "",
  startsAt: NOW + 86400e3, endsAt: null, venueName: null, address: null, city: "Palo Alto",
  lat: null, lng: null, organizer: null, imageUrl: null, category: null, price: "unknown",
  isOnline: false, isCancelled: false, ...o,
});

test("key ignores case, punctuation, articles and city spelling", () => {
  assert.equal(
    eventKey(ev({ title: "The Jazz Night!", city: "San Francisco, CA" })),
    eventKey(ev({ title: "jazz night", city: "San Francisco, California" })),
  );
});

test("different events keep different keys", () => {
  assert.notEqual(eventKey(ev({ title: "Jazz Night" })), eventKey(ev({ title: "Salsa Night" })));
  assert.notEqual(eventKey(ev({})), eventKey(ev({ startsAt: NOW + 3 * 86400e3 })));
});

test("duplicates merge, facebook record wins, empty fields filled", () => {
  const out = mergeDuplicates([ev({ source: "hackradar", imageUrl: "img" }), ev({ source: "facebook", sourceId: "fb", imageUrl: null })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "facebook");
  assert.equal(out[0].sourceId, "fb");
  assert.equal(out[0].imageUrl, "img");
  assert.equal(typeof out[0].key, "string");
});

test("city-only events resolve; unknown city without coords does not qualify", () => {
  assert.ok(resolveCoords(ev({ city: "San Francisco, California" })));
  assert.deepEqual(resolveCoords(ev({ city: "San Francisco, CA" })), resolveCoords(ev({ city: "san francisco" })));
  assert.equal(resolveCoords(ev({ city: "Atlantis" })), null);
  assert.equal(qualifies(ev({ city: "Atlantis" }), NOW), false);
});

test("qualify rules: window, radius, online, cancelled", () => {
  assert.equal(qualifies(ev({}), NOW), true);
  assert.equal(qualifies(ev({ city: "San Francisco" }), NOW), true); // about 45 km, inside 55 km
  assert.equal(qualifies(ev({ startsAt: NOW + 22 * 86400e3 }), NOW), false);
  assert.equal(qualifies(ev({ startsAt: NOW - 3600e3 }), NOW), false);
  assert.equal(qualifies(ev({ city: "Sacramento", lat: 38.58, lng: -121.49 }), NOW), false);
  assert.equal(qualifies(ev({ isOnline: true }), NOW), false);
  assert.equal(qualifies(ev({ isCancelled: true }), NOW), false);
});

test("fallback ranks interest matches first with a concrete short reason", () => {
  const cands = mergeDuplicates([ev({ title: "Bowling social" }), ev({ title: "Tax seminar", sourceId: "2" })]);
  const picks = fallbackRank({ interests: ["bowling"], vibe: "lively", pastEvents: [] }, cands, NOW);
  assert.equal(picks[0].key, cands.find((c) => c.title === "Bowling social").key);
  assert.equal(picks[0].kind, "personal");
  assert.equal(picks[0].verdict, "go");
  assert.match(picks[0].reason, /bowling/i);
  assert.ok(picks.every((p) => p.reason.length <= 90));
});

test("a past event's category lifts similar events", () => {
  const cands = mergeDuplicates([ev({ title: "Open mic", category: "music" }), ev({ title: "Cooking class", sourceId: "2", category: "food" })]);
  const picks = fallbackRank({ interests: [], vibe: "", pastEvents: [{ title: "Jazz at the Guild", category: "music", feedback: "Loved it" }] }, cands, NOW);
  assert.equal(picks[0].key, cands.find((c) => c.category === "music").key);
});

test("no profile means popular picks: soonest first, no personal claim", () => {
  const picks = fallbackRank(null, mergeDuplicates([ev({ title: "Later", sourceId: "3", startsAt: NOW + 5 * 86400e3 }), ev({})]), NOW);
  assert.ok(picks.every((p) => p.kind === "popular" && p.verdict === "maybe"));
  assert.equal(picks.length, 2);
  assert.equal(picks[0].reason, "Popular near you this week.");
});

test("never more than MAX_PICKS", () => {
  const many = mergeDuplicates(Array.from({ length: 20 }, (_, i) => ev({ title: `Event ${i}`, sourceId: String(i) })));
  assert.equal(MAX_PICKS, 8);
  assert.equal(fallbackRank(null, many, NOW).length, 8);
});

test("clampReason keeps one sentence within 90 characters", () => {
  const r = clampReason("You love jazz and this is ten minutes away. Also bring friends, there is a long story here that goes on.");
  assert.equal(r, "You love jazz and this is ten minutes away.");
  const long = clampReason("x".repeat(200));
  assert.ok(long.length <= 90);
});
