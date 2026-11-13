import { test } from "node:test";
import assert from "node:assert/strict";
import { sendReady, titleFromDescription, vendorStepDone } from "../convex/plannerRules.ts";

// Bug: the event was titled from Muse's purpose chip ("Maya's casual hangout with friends night")
// instead of what the host actually typed ("Boxing night with the crew").
test("the title uses the host's own words, lower-casing an ordinary first word", () => {
  assert.equal(titleFromDescription("Maya", "Boxing night with the crew"), "Maya's boxing night with the crew");
});

test("day and month names keep their capital", () => {
  assert.equal(titleFromDescription("Maya", "Sunday morning hike and brunch"), "Maya's Sunday morning hike and brunch");
});

test("lead-ins like 'I want to throw a' are dropped", () => {
  assert.equal(titleFromDescription("Maya", "I want to throw a watch party for the big game"), "Maya's watch party for the big game");
  assert.equal(titleFromDescription("Sam", "let's do a game night"), "Sam's game night");
  assert.equal(titleFromDescription("Sam", "Planning my birthday dinner"), "Sam's birthday dinner");
});

test("trailing punctuation goes, and a long line is cut to a few words without a dangling 'and'", () => {
  assert.equal(titleFromDescription("Maya", "Game night!!"), "Maya's game night");
  assert.equal(titleFromDescription("Maya", "Boxing night with the crew and then karaoke after"), "Maya's boxing night with the crew");
});

test("a description that already names the host is not doubled", () => {
  assert.equal(titleFromDescription("Maya", "Maya's leaving do"), "Maya's leaving do");
});

test("no usable description means no title, so the purpose-based title is kept", () => {
  for (const d of [undefined, "", "   ", "!!", "a"]) assert.equal(titleFromDescription("Maya", d), null, String(d));
});

// Bug: "Drafting orders..." kept spinning after the drafts existed, because drafts awaiting the
// host's OK kept the step unfinished, so it stayed the active (spinning) step.
test("the vendor step is done once drafts exist, even while they await approval", () => {
  assert.equal(vendorStepDone(2, false), true);
  assert.equal(vendorStepDone(0, false), false);
  assert.equal(vendorStepDone(2, true), false); // a vendor came back with a problem: that one is blocked
});

// Bug: the checklist's Send invites row only opened an explainer because it waited for EVERY step,
// including drafts and chat tasks awaiting approval; Manage's Send button never waited for those.
test("send is ready once the date, venue and guests are settled, whatever else is pending", () => {
  const core = [
    { key: "date", state: "done" }, { key: "venues", state: "done" }, { key: "venue", state: "done" },
    { key: "guests", state: "done" }, { key: "send", state: "todo" },
  ];
  assert.equal(sendReady([...core, { key: "vendors", state: "active" }, { key: "t_abc", state: "blocked" }, { key: "invite", state: "active" }]), true);
  assert.equal(sendReady(core.map((s) => (s.key === "guests" ? { ...s, state: "active" } : s))), false);
  assert.equal(sendReady(core.filter((s) => s.key !== "venue")), false);
  assert.equal(sendReady([]), false);
});
