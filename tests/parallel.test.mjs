// Parallel /v1/search results -> allevents events (parsed from listing excerpts) and facebook.com
// event URLs (handed to Apify for full details). Checked against a real response
// (tests/fixtures/parallel-search.json, 13 Nov 2026, Peninsula queries).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseAlleventsResults, facebookEventUrls } from "../convex/sources/parallel.ts";

const results = JSON.parse(readFileSync(new URL("./fixtures/parallel-search.json", import.meta.url), "utf8")).results;

test("allevents listing excerpts become events with title, local time, city and venue", () => {
  const events = parseAlleventsResults(results);
  // The fixture has 7 complete blocks; the other linked titles are cut off by "..." with no date.
  assert.ok(events.length >= 7, `only ${events.length} parsed`);
  for (const e of events) {
    assert.equal(e.source, "allevents");
    assert.ok(e.title && e.sourceId && Number.isFinite(e.startsAt));
    assert.match(e.url, /^https:\/\/allevents\.in\//);
    assert.ok(e.city);
  }
  const slac = events.find((e) => /SLAC Public Tour/.test(e.title));
  assert.equal(slac.startsAt, Date.UTC(2026, 10, 13, 18, 30)); // 10:30 AM PST
  assert.equal(slac.city, "Menlo Park");
  assert.equal(slac.venueName, "SLAC National Accelerator Laboratory");
  assert.equal(slac.price, "free");
  const sonVolt = events.find((e) => e.title === "Son Volt");
  assert.equal(sonVolt.startsAt, Date.UTC(2026, 10, 16, 0, 0)); // Sun 15 Nov 4:00 PM PST
});

test("the same event listed on two allevents pages is parsed once", () => {
  const events = parseAlleventsResults(results);
  const ids = events.map((e) => e.sourceId);
  assert.equal(new Set(ids).size, ids.length);
});

test("facebook.com event pages are collected as canonical URLs for Apify", () => {
  const urls = facebookEventUrls(results);
  assert.ok(urls.length >= 1);
  for (const u of urls) assert.match(u, /^https:\/\/www\.facebook\.com\/events\/\d{6,}\/$/);
  assert.equal(new Set(urls).size, urls.length);
});

test("garbage input yields nothing instead of throwing", () => {
  assert.deepEqual(parseAlleventsResults([]), []);
  assert.deepEqual(parseAlleventsResults([{ url: "https://allevents.in/x", excerpts: ["nothing here"] }]), []);
  assert.deepEqual(facebookEventUrls([{ url: "https://www.facebook.com/somepage" }]), []);
});

test("a block with no venue line keeps the price as the price, not the venue", () => {
  const block = "* Sat, 14 Nov, 2026 - 01:00 PM\n  \n  [### Pottery Drop-in](https://allevents.in/palo-alto/pottery-drop-in/1000000000001 \"Pottery\")\n  \n  Free\n* Sun";
  const [e] = parseAlleventsResults([{ url: "https://allevents.in/palo-alto/all", excerpts: [block] }]);
  assert.equal(e.title, "Pottery Drop-in");
  assert.equal(e.venueName, null);
  assert.equal(e.price, "free");
});
