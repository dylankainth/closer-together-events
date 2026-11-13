// The review fixes live in tested pure functions (tests/reviewFixes.test.mjs); this pins that the
// Convex functions and screens actually call them, so a later edit cannot silently drop a fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("[1][2] ranking skips answered events and never lets a fallback overwrite Muse picks", () => {
  const rank = src("convex/discoveryRank.ts");
  assert.match(rank, /excludeAnswered\(/);
  assert.match(rank, /shouldSavePicks\(/);
});

test("[3] a new Facebook user gets picks ranked right after sign-up", () => {
  assert.match(src("convex/users.ts"), /scheduler\.runAfter\(0,\s*internal\.discoveryRank\.rankPersona/);
});

test("[5] a refresh re-ranks after the fetch only when new events arrived; ranking errors cannot skip the snapshot", () => {
  const s = src("convex/discoverySources.ts");
  assert.match(s, /shouldRerankAfterFetch\(/);
  assert.match(s, /catch[\s\S]{0,400}loadSnapshot/);
});

test("[6] refresh refuses unknown people", () => {
  assert.match(src("convex/discoveryData.ts"), /refreshDecision\(/);
});

test("[7] stored events are matched fuzzily, keeping the stored key so picks stay attached", () => {
  assert.match(src("convex/discoveryData.ts"), /findDuplicate\(/);
});

test("picks show their real date in Discover, and a vanished pick cannot crash the stack", () => {
  assert.match(src("app/events/feed.tsx"), /ev\.whenLabel/);
  assert.match(src("app/events/recommended.tsx"), /respondToPick\(\{[\s\S]{0,200}?\}\)\.catch\(/);
});

test("leftover: Parallel warns when it returns results but none parse (allevents layout changed)", () => {
  assert.match(src("convex/discoverySources.ts"), /parsed 0 allevents events/);
});

test("leftover: a fresh database is seeded with demo personas' past events", () => {
  assert.match(src("convex/seed.ts"), /pastEventsFor\(/);
});

test("leftover: friends-going reads use the [eventKey, status] index", () => {
  assert.match(src("convex/schema.ts"), /\.index\("by_eventKey_status", \["eventKey", "status"\]\)/);
  assert.match(src("convex/feed.ts"), /withIndex\("by_eventKey_status"/);
});

test("leftover: approving or withdrawing Muse re-ranks only when the approval actually changes", () => {
  assert.match(src("convex/musePersonas.ts"), /existing\.profileApproved !== args\.approved/);
});

test("Muse is not hammered: the cron ranks at most 2 people at a time (429s at 5)", () => {
  assert.match(src("convex/discoveryRank.ts"), /const CONCURRENCY = 2;/);
});

test("Task 9 review: sources fetch concurrently (10-minute action limit) and Apify gets startUrls as plain strings", () => {
  const s = src("convex/discoverySources.ts");
  assert.match(s, /Promise\.allSettled\(/);
  assert.match(s, /startUrls: fbUrls[,\s]/);
  assert.doesNotMatch(s, /fbUrls\.map\(\(url\) => \(\{ url \}\)\)/);
});
