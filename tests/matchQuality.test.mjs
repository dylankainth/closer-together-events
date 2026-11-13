// Is the matching GOOD, not just safe? Every other eval in this repo answers "does it leak" or
// "is it authorised". claude.md §12 listed "funnel quality" as a planned eval and nobody wrote it,
// so a regression that made the shortlist nonsense or the reasons untrue would have shipped
// silently — which is exactly what happened twice already (the all-negative huddle, and nudges
// claiming "Sam will be there" about a Sam who'd declined).
import { test } from "node:test";
import assert from "node:assert/strict";
import { world, shortlistFor, precisionAtN, verdictFor, claimsSomeoneAttends, claimsYoureFree } from "../scripts/lib/match-quality.mjs";

const W = world();
const free = (id) => W.byId.get(id).availability.includes("fri20");

test("the audience description actually selects for the thing it describes", async () => {
  const { query, pool } = await shortlistFor(W, "the people I go boxing with");
  assert.ok(query.topics.includes("boxing"), `parsed topics: ${query.topics}`);
  const p = precisionAtN(pool, "boxing", 5);
  assert.ok(p >= 0.6, `only ${Math.round(p * 100)}% of the top 5 are into boxing`);
});

test("a different description selects a different crowd", async () => {
  const boxing = await shortlistFor(W, "the people I go boxing with");
  const climbing = await shortlistFor(W, "my climbing friends");
  assert.ok(climbing.query.topics.includes("climbing"));
  // If the funnel ignored the text, these two would return the same ranking.
  const overlap = boxing.ids.slice(0, 5).filter((id) => climbing.ids.slice(0, 5).includes(id)).length;
  assert.ok(overlap < 5, "boxing and climbing returned an identical top 5 — the audience text isn't steering anything");
  assert.ok(precisionAtN(climbing.pool, "climbing", 5) >= 0.6);
});

test("plural group names parse — hosts write 'the foodies', not 'foodie'", async () => {
  // This silently returned NO topics, so the audience text was discarded entirely and the
  // shortlist fell back to raw tie-strength. Found by scripts/eval-matching.mjs.
  for (const [text, topic] of [["the foodies", "food"], ["my climbers", "climbing"], ["the gamers", "gaming"]]) {
    const { query } = await shortlistFor(W, text);
    assert.ok(query.topics.includes(topic), `"${text}" parsed to [${query.topics}]`);
  }
});

test("vague audiences still return people rather than nothing", async () => {
  for (const text of ["everyone", "just my closest friends", "whoever's around"]) {
    const { pool } = await shortlistFor(W, text);
    assert.ok(pool.length >= 5, `"${text}" returned ${pool.length}`);
  }
});

test("a nudge never tells someone a friend is coming when that friend declined", () => {
  // Every consulted peer is busy, so nobody is attending and nobody may be named as attending.
  const busy = W.personas.filter((p) => !p.availability.includes("fri20")).slice(0, 3).map((p) => p.id);
  assert.ok(busy.length >= 2, "seed data needs some people busy on fri20 for this to be a real test");
  const nudge = verdictFor(W, "sam", ["boxing"], busy);
  assert.equal(claimsSomeoneAttends(nudge), false, `claimed an attendee with none: ${JSON.stringify(nudge.reasons)}`);
});

test("a nudge never tells someone they're free when they are not", () => {
  const busy = W.personas.find((p) => !p.availability.includes("fri20"));
  const nudge = verdictFor(W, busy.id, ["boxing"], []);
  assert.equal(claimsYoureFree(nudge), false, JSON.stringify(nudge.reasons));
  // It should say the opposite plainly rather than quietly omitting it.
  assert.ok(nudge.reasons.some((r) => /not free/i.test(r)), JSON.stringify(nudge.reasons));
});

test("being free and interested is enough to be worth it, with no friends confirmed", () => {
  // The regression that produced "0 of 12": peers' availability was dragging candidates down.
  const keen = W.personas.find((p) => p.availability.includes("fri20") && p.interests.includes("boxing"));
  assert.ok(keen, "seed data needs a free, boxing-interested persona");
  assert.equal(verdictFor(W, keen.id, ["boxing"], []).verdict, "worth");
});

test("busy friends cannot drag down a candidate who is free and interested", () => {
  const keen = W.personas.find((p) => p.availability.includes("fri20") && p.interests.includes("boxing"));
  const busy = W.personas.filter((p) => !p.availability.includes("fri20")).slice(0, 3).map((p) => p.id);
  assert.equal(verdictFor(W, keen.id, ["boxing"], busy).verdict, "worth");
});

test("every nudge gives at least one reason, and none are empty strings", () => {
  for (const id of ["sam", "priya", "leo"].filter((x) => W.byId.has(x))) {
    const n = verdictFor(W, id, ["boxing"], ["maya"]);
    assert.ok(n.reasons.length >= 1, `${id} got no reasons`);
    assert.ok(n.reasons.every((r) => r.trim().length > 0), `${id} has a blank reason`);
    assert.ok(n.text.includes(n.reasons[0]), `${id}'s text doesn't carry its own first reason`);
  }
});

test("free personas are not told they're busy", () => {
  const f = W.personas.find((p) => p.availability.includes("fri20"));
  assert.ok(free(f.id));
  assert.equal(verdictFor(W, f.id, ["boxing"], []).reasons.some((r) => /not free/i.test(r)), false);
});
