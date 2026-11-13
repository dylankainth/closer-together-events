// Regression tests for the final review's findings on event discovery.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  shouldSavePicks, excludeAnswered, shouldRerankAfterFetch, refreshDecision, sameEvent, mergeDuplicates,
  findDuplicate, fallbackRank, formatWhen, toPickView, eventKey,
} from "../convex/discoveryCore.ts";
import { mapHackRadar } from "../convex/sources/hackradar.ts";

const NOW = Date.UTC(2026, 10, 13, 18);
const ev = (o) => ({
  source: "hackradar", sourceId: "1", url: "u", title: "Jazz Night", description: "", startsAt: NOW + 86400e3, endsAt: null,
  venueName: null, address: null, city: "Palo Alto", lat: null, lng: null, organizer: null, imageUrl: null, category: null,
  price: "unknown", isOnline: false, isCancelled: false, ...o,
});

test("[1] a fallback run never overwrites Muse-written picks", () => {
  assert.equal(shouldSavePicks("fallback", ["muse", "muse"]), false);
  assert.equal(shouldSavePicks("fallback", ["fallback"]), true);
  assert.equal(shouldSavePicks("fallback", []), true);
  assert.equal(shouldSavePicks("muse", ["muse"]), true);
});

test("[2] events the person already answered are not offered again", () => {
  const cands = mergeDuplicates([ev({ title: "A" }), ev({ title: "B", sourceId: "2" })]);
  const out = excludeAnswered(cands, new Set([cands[0].key]));
  assert.deepEqual(out.map((c) => c.title), ["B"]);
});

test("[4] Hack Radar date-only rows keep their calendar day and show All day", () => {
  const e = mapHackRadar({ id: "x", title: "Fair", start_date: "2026-11-14T00:00:00Z", date_only: true, city: "Palo Alto" });
  assert.equal(e.allDay, true);
  assert.equal(formatWhen(e.startsAt, e.allDay), "Sat 14 Nov · All day");
  assert.match(eventKey(e), /\|2026-11-14\|/);
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/hackradar-events.json", import.meta.url), "utf8")).events;
  const dateOnly = fixture.find((r) => r.date_only);
  if (dateOnly) assert.equal(toPickView({ ...mapHackRadar(dateOnly), key: "k" }, { verdict: "go", reason: "r", kind: "personal", status: "new" }, NOW).whenLabel.endsWith("All day"), true);
});

test("[5] a manual refresh re-ranks again only when the fetch found new events", () => {
  assert.equal(shouldRerankAfterFetch(undefined, 0), true); // the schedule always re-ranks everyone
  assert.equal(shouldRerankAfterFetch("maya", 0), false);
  assert.equal(shouldRerankAfterFetch("maya", 3), true);
});

test("[6] refresh is refused for unknown people and inside a minute", () => {
  assert.equal(refreshDecision({ exists: false, lastAt: null, now: NOW }), "unknown");
  assert.equal(refreshDecision({ exists: true, lastAt: NOW - 30_000, now: NOW }), "too_soon");
  assert.equal(refreshDecision({ exists: true, lastAt: null, now: NOW }), "ok");
});

test("[7] the same event worded differently by two sources is one event", () => {
  const fb = ev({ source: "facebook", sourceId: "fb", title: "Holiday Stroll & Tree Lighting - SAVE THE DATE", city: "Stanford", lat: 37.4275, lng: -122.1697 });
  const hr = ev({ title: "Holiday Stroll &amp; Tree Lighting", city: "Palo Alto, CA" });
  assert.equal(sameEvent(fb, hr), true);
  const merged = mergeDuplicates([hr, fb]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "facebook");
  assert.equal(sameEvent(fb, ev({ title: "Holiday Stroll & Tree Lighting", city: "San Jose", lat: 37.3382, lng: -121.8863 })), false);
  assert.equal(sameEvent(fb, ev({ title: "Holiday Stroll & Tree Lighting", city: "Stanford", startsAt: NOW + 3 * 86400e3 })), false);
  assert.equal(sameEvent(ev({ title: "AI Night" }), ev({ title: "Design Night" })), false);
  const stored = [{ ...hr, key: eventKey(hr) }];
  assert.equal(findDuplicate(fb, stored)?.key, eventKey(hr));
});

test("[minor->important] interests match whole words: art is not party", () => {
  const cands = mergeDuplicates([ev({ title: "Rooftop party" }), ev({ title: "Art walk", sourceId: "2" })]);
  const picks = fallbackRank({ interests: ["art"], vibe: "", pastEvents: [] }, cands, NOW);
  const party = picks.find((p) => p.key === cands.find((c) => c.title === "Rooftop party").key);
  assert.doesNotMatch(party.reason, /into art/);
});
