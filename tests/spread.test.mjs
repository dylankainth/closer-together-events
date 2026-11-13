// The four rules in convex/spreadPolicy.ts are the difference between "the circle widens" and "one yes
// spams everyone's address book". They're asserted here rather than left to code review.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spreadTargets, MAX_PER_ACCEPTANCE } from "../convex/spreadPolicy.ts";

const person = (id, over = {}) => ({
  personaId: id, name: `${id[0].toUpperCase()}${id.slice(1)} P`, initials: id[0].toUpperCase(),
  friends: [], hasMuse: true, availability: ["fri20"],
  settings: { talkToMuses: true, nudgesOn: true }, ...over,
});

// maya hosts; sam is going and has four eligible friends.
const FRIENDS = ["ana", "ben", "cara", "dev"];
function world(over = {}) {
  const sam = person("sam", { friends: FRIENDS });
  const host = person("maya", { friends: [...FRIENDS, "sam"] });
  const byId = new Map([["sam", sam], ["maya", host], ...FRIENDS.map((f) => [f, person(f, { friends: ["sam"] })])]);
  const event = {
    hostId: "maya", status: "sent", allowSpread: true, slotId: "fri20",
    settings: { quota: 20 }, answers: { visibility: "private" }, ...over,
  };
  const guests = over.guests ?? [{ personaId: "sam", status: "going" }];
  return { event, guests, sam, host, byId };
}
const run = (w, capacity) => spreadTargets(w.event, w.guests, w.sam, w.host, w.byId, capacity);

test("a yes reaches the accepter's eligible friends", () => {
  const got = run(world());
  assert.ok(got.length > 0);
  assert.ok(got.every((id) => FRIENDS.includes(id)));
});

test("rule 2: host must opt in — absent allowSpread spreads to nobody", () => {
  assert.deepEqual(run(world({ allowSpread: undefined })), []);
  assert.deepEqual(run(world({ allowSpread: false })), []);
});

test("rule 3: capped per acceptance, however many friends they have", () => {
  const w = world();
  w.sam.friends = [...FRIENDS, "e", "f", "g", "h"];
  for (const id of ["e", "f", "g", "h"]) w.byId.set(id, person(id, { friends: ["sam"] }));
  assert.equal(run(w).length, MAX_PER_ACCEPTANCE);
});

test("rule 3: never exceeds the event's remaining room", () => {
  const w = world({ settings: { quota: 2 } }); // room = 2 - 1 existing guest = 1
  assert.equal(run(w).length, 1);
});

test("rule 1: one hop — someone who arrived via spread cannot spread onward", () => {
  const w = world({ guests: [{ personaId: "sam", status: "going", spreadFrom: "someone-else" }] });
  assert.deepEqual(run(w), []);
});

test("rule 4 + idempotency: a second yes from the same person invites no second wave", () => {
  const w = world({ guests: [{ personaId: "sam", status: "going" }, { personaId: "ana", status: "invited", spreadFrom: "sam" }] });
  assert.deepEqual(run(w), []);
});

test("only an actual yes spreads — maybe and can't do not", () => {
  for (const status of ["invited", "maybe", "cant", "skip"]) {
    assert.deepEqual(run(world({ guests: [{ personaId: "sam", status }] })), [], status);
  }
});

test("never re-invites someone already on the guest list", () => {
  const w = world({ guests: [{ personaId: "sam", status: "going" }, { personaId: "ana", status: "invited" }] });
  assert.ok(!run(w).includes("ana"));
});

test("skips friends who can't make the date, or whose Muse is switched off", () => {
  const w = world();
  w.byId.get("ana").availability = ["sat21"];
  w.byId.get("ben").settings = { talkToMuses: false, nudgesOn: true };
  w.byId.get("cara").settings = { talkToMuses: true, nudgesOn: false };
  assert.deepEqual(run(w), ["dev"]);
});

test("the host's own RSVP never triggers spread", () => {
  const w = world({ guests: [{ personaId: "maya", status: "going" }] });
  assert.deepEqual(spreadTargets(w.event, w.guests, w.host, w.host, w.byId, undefined), []);
});

test("a draft event spreads to nobody", () => {
  assert.deepEqual(run(world({ status: "draft" })), []);
});

test("venue capacity is respected even when quota is generous", () => {
  assert.deepEqual(run(world(), 1), []); // capacity 1, already 1 guest
});
