// Hack Radar public API rows -> DiscoveredInput, checked against a real response
// (tests/fixtures/hackradar-events.json, captured 13 Nov 2026 near Menlo Park).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapHackRadar } from "../convex/sources/hackradar.ts";

const raw = JSON.parse(readFileSync(new URL("./fixtures/hackradar-events.json", import.meta.url), "utf8"));
const items = raw.events;

test("every fixture row maps to a complete DiscoveredInput", () => {
  const mapped = items.map(mapHackRadar);
  assert.equal(mapped.filter(Boolean).length, items.length);
  for (const e of mapped) {
    assert.equal(e.source, "hackradar");
    assert.ok(e.title && e.sourceId && Number.isFinite(e.startsAt));
    assert.ok(e.endsAt === null || e.endsAt >= e.startsAt);
    assert.ok(["free", "paid", "unknown"].includes(e.price));
    assert.equal(typeof e.isOnline, "boolean");
    assert.equal(e.isCancelled, false);
  }
});

test("coordinates come from geography, times parse as UTC", () => {
  const first = mapHackRadar(items[0]);
  assert.equal(first.lat, items[0].geography.latitude);
  assert.equal(first.lng, items[0].geography.longitude);
  assert.equal(first.startsAt, Date.parse(items[0].start_date));
});

test("url is the registration link and free events are marked free", () => {
  const free = items.find((i) => i.is_free === true);
  assert.equal(mapHackRadar(free).price, "free");
  assert.equal(mapHackRadar(items[0]).url, items[0].registration_url);
});

test("organizer comes through when present", () => {
  const withOrg = items.find((i) => i.organizer_name);
  if (withOrg) assert.equal(mapHackRadar(withOrg).organizer, withOrg.organizer_name);
});

test("garbage maps to null instead of throwing", () => {
  assert.equal(mapHackRadar({}), null);
  assert.equal(mapHackRadar(null), null);
  assert.equal(mapHackRadar({ id: "x", title: "No date" }), null);
  assert.equal(mapHackRadar({ id: "x", title: "Bad date", start_date: "soon" }), null);
});
