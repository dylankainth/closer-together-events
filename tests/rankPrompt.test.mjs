// What Muse sees when picking events, and how its answer is cleaned before anyone sees it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRankPrompt, cleanRankResponse, preselect, pastEventsFor, mergeDuplicates, fallbackRank, MAX_PICKS } from "../convex/discoveryCore.ts";

const NOW = Date.UTC(2026, 10, 13, 18);
const ev = (i, o = {}) => ({
  source: "hackradar", sourceId: String(i), url: `https://lu.ma/${i}`, title: `Event ${i}`, description: "d".repeat(500),
  startsAt: NOW + (1 + (i % 10)) * 86400e3, endsAt: null, venueName: null, address: null, city: "Palo Alto",
  lat: null, lng: null, organizer: null, imageUrl: null, category: null, price: "unknown", isOnline: false, isCancelled: false, ...o,
});
const pool = mergeDuplicates(Array.from({ length: 60 }, (_, i) => ev(i)));
const profile = { interests: ["jazz", "climbing"], vibe: "chill", pastEvents: [{ title: "Jazz at the Guild", category: "music", feedback: "Loved it" }] };

test("the prompt carries only the safe profile, past events and at most 40 trimmed candidates", () => {
  const { system, user } = buildRankPrompt(profile, pool, NOW);
  const text = JSON.stringify(user);
  for (const banned of ["memory", "secrets", "neverShare", "lu.ma", "url"]) assert.ok(!text.includes(banned), `prompt contains ${banned}`);
  assert.equal(user.candidates.length, 40);
  assert.ok(user.candidates.every((c) => c.about.length <= 200 && c.key && c.when));
  assert.deepEqual(user.person.interests, ["jazz", "climbing"]);
  assert.equal(user.person.pastEvents[0].title, "Jazz at the Guild");
  assert.match(system, /90 characters/);
});

test("preselect keeps the 40 best fallback-scored candidates, interest matches included", () => {
  const withJazz = mergeDuplicates([...Array.from({ length: 60 }, (_, i) => ev(i)), ev(99, { title: "Late jazz jam", startsAt: NOW + 20 * 86400e3 })]);
  const chosen = preselect(profile, withJazz, NOW, 40);
  assert.equal(chosen.length, 40);
  assert.ok(chosen.some((c) => c.title === "Late jazz jam"));
});

test("cleaning drops unknown and duplicate keys, caps at 8, clamps reasons", () => {
  const keys = new Set(pool.map((c) => c.key));
  const fallback = fallbackRank(profile, pool, NOW);
  const resp = { picks: [
    { key: "nope", verdict: "go", reason: "Made up." },
    ...pool.slice(0, 12).map((c) => ({ key: c.key, verdict: "go", reason: "You love jazz and this is close. ".repeat(5) })),
    { key: pool[0].key, verdict: "maybe", reason: "Duplicate." },
  ] };
  const out = cleanRankResponse(resp, keys, fallback, () => false);
  assert.equal(out.length, MAX_PICKS);
  assert.ok(out.every((p) => keys.has(p.key) && p.reason.length <= 90 && p.kind === "personal"));
  assert.equal(new Set(out.map((p) => p.key)).size, out.length);
});

test("a leaking reason is replaced, and too few picks are topped up from the fallback", () => {
  const keys = new Set(pool.map((c) => c.key));
  const fallback = fallbackRank(profile, pool, NOW);
  const resp = { picks: [{ key: pool[0].key, verdict: "go", reason: "Call me on 415 555 0100 about it." }] };
  const out = cleanRankResponse(resp, keys, fallback, (s) => /\d{3} \d{3} \d{4}/.test(s));
  assert.ok(out.length >= 3);
  assert.ok(out.every((p) => !/555/.test(p.reason)));
});

test("past events for a demo persona come from their interests, in Sep/Oct, with feedback", () => {
  const rows = pastEventsFor("sam", ["bowling", "tech sales", "hiking"]);
  assert.ok(rows.length >= 2 && rows.length <= 3);
  for (const r of rows) {
    assert.equal(r.personaId, "sam");
    assert.ok(r.title && r.feedback);
    const m = new Date(r.when).getUTCMonth();
    assert.ok(m === 8 || m === 9);
  }
  assert.match(rows[0].title.toLowerCase(), /bowling/);
  assert.deepEqual(pastEventsFor("x", []), []);
});
