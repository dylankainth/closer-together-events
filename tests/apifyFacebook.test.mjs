// Apify "Facebook Events Scraper" rows -> DiscoveredInput, checked against a real run
// (tests/fixtures/apify-facebook-events.json: searches Palo Alto, Menlo Park, Mountain View, Stanford, 13 Nov 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapApifyFacebook } from "../convex/sources/apifyFacebook.ts";
import { qualifies } from "../convex/discoveryCore.ts";

const items = JSON.parse(readFileSync(new URL("./fixtures/apify-facebook-events.json", import.meta.url), "utf8"));
const NOW = Date.UTC(2026, 10, 13, 8);

test("every row with an id, name and start maps to a facebook event", () => {
  const mapped = items.map(mapApifyFacebook).filter(Boolean);
  assert.ok(mapped.length >= items.length - 2);
  for (const e of mapped) {
    assert.equal(e.source, "facebook");
    assert.match(e.url, /^https:\/\/www\.facebook\.com\/events\//);
    assert.ok(e.title && e.sourceId && Number.isFinite(e.startsAt));
    assert.ok(["free", "paid", "unknown"].includes(e.price));
  }
});

test("organizer, venue and coordinates come from the location and organizators", () => {
  const jazz = items.find((i) => /Afro-Latin Jazz/.test(i.name));
  const e = mapApifyFacebook(jazz);
  assert.equal(e.organizer, jazz.organizators[0].name);
  assert.equal(e.venueName, "Dinkelspiel Auditorium");
  assert.equal(e.lat, jazz.location.latitude);
  assert.equal(e.startsAt, Date.parse(jazz.utcStartDate));
});

test("Stanford, Kentucky is found by the search but does not qualify; the Stanford concert does", () => {
  const ky = mapApifyFacebook(items.find((i) => /Stanford, KY/.test(i.location?.name ?? "")));
  assert.equal(qualifies(ky, NOW), false);
  const jazz = mapApifyFacebook(items.find((i) => /Afro-Latin Jazz/.test(i.name)));
  assert.equal(qualifies(jazz, NOW), true);
});

test("organizedBy text is used when organizators is empty; garbage maps to null", () => {
  const e = mapApifyFacebook({ id: "1", name: "X", utcStartDate: "2026-11-20T03:00:00.000Z", organizedBy: "Event by Palo Alto Library", url: "https://www.facebook.com/events/1/" });
  assert.equal(e.organizer, "Palo Alto Library");
  assert.equal(mapApifyFacebook({}), null);
  assert.equal(mapApifyFacebook({ id: "1", name: "No date" }), null);
});
