// Prepared Muse profiles: the simulated "Connect my Muse" for real logged-in users.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePreparedProfiles, museContextFromPrepared, preparedPastEvents } from "../convex/preparedProfiles.ts";
import { extractShareableProfile } from "../convex/museContext.ts";

const keanu = {
  interests: ["ai agents", "climbing", "jazz"],
  vibe: "curious, lively",
  pastEvents: [{ title: "Cal Hacks 13.0", category: "non_uni_hackathon", feedback: "Loved building with a team." }],
};

test("bad or missing JSON gives no profiles instead of throwing", () => {
  assert.deepEqual(parsePreparedProfiles(undefined), {});
  assert.deepEqual(parsePreparedProfiles("not json"), {});
  assert.deepEqual(parsePreparedProfiles("[1,2]"), {});
});

test("valid profiles round-trip, and malformed entries are dropped", () => {
  const map = parsePreparedProfiles(JSON.stringify({ fb_1: keanu, fb_2: { interests: "nope" } }));
  assert.deepEqual(Object.keys(map), ["fb_1"]);
  assert.deepEqual(map.fb_1.interests, keanu.interests);
  assert.equal(map.fb_1.pastEvents[0].title, "Cal Hacks 13.0");
});

test("the fake Muse files parse back to the same interests and vibe", () => {
  const profile = extractShareableProfile(museContextFromPrepared("Keanu", keanu));
  assert.equal(profile.name, "Keanu");
  assert.deepEqual(profile.interests, keanu.interests);
  assert.equal(profile.vibe, keanu.vibe);
});

test("prepared past events become pastEvents rows for that person", () => {
  const rows = preparedPastEvents("fb_1", keanu);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].personaId, "fb_1");
  assert.equal(rows[0].title, "Cal Hacks 13.0");
  assert.ok(Number.isFinite(rows[0].when));
});
