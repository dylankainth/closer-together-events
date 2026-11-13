import { test } from "node:test";
import assert from "node:assert/strict";
import { conditionalRsvp } from "../convex/conditionalRsvp.ts";
import { loadHuddle } from "../scripts/lib/load-huddle.mjs";

const mine = { personaId: "fb_me", status: "maybe", goIfFriend: "fb_sam" };
for (const [status, state] of [["invited", "waiting"], ["maybe", "waiting"], ["going", "ready"], ["cant", "declined"], ["skip", "declined"]]) {
  test(`selected friend's ${status} answer produces ${state}, without changing my answer`, () => {
    const rows = [{ ...mine }, { personaId: "fb_sam", status }];
    assert.equal(conditionalRsvp("fb_me", ["fb_sam"], rows).state, state);
    assert.equal(rows[0].status, "maybe");
  });
}
test("missing or former friends do not produce a confirmation offer", () => {
  assert.equal(conditionalRsvp("fb_me", ["fb_sam"], [{ ...mine }]).state, "unavailable");
  const result = conditionalRsvp("fb_me", [], [{ ...mine }, { personaId: "fb_sam", status: "going" }]);
  assert.equal(result.state, "unavailable"); assert.equal(result.friendId, null);
  assert.equal(conditionalRsvp("fb_me", ["fb_sam"], [{ ...mine, status: "cant" }]), null);
});

function world() {
  const runtime = loadHuddle(); const writes = [];
  const person = (id, name, friends = []) => ({ _id: id, personaId: id, name, initials: name[0], color: "#abc", friends,
    interests: ["bowling"], availability: ["s1"], vibe: "chill", hasMuse: true, settings: { talkToMuses: true, nudgesOn: true } });
  const tables = {
    events: [{ _id: "event", eventId: "e1", hostId: "fb_host", status: "sent", title: "Bowling", slotId: "s1", createdAt: 1 }],
    personas: [person("fb_me", "Me", ["fb_sam", "fb_lee"]), person("fb_sam", "Sam"), person("fb_lee", "Lee"), person("fb_host", "Host")],
    guests: [{ _id: "me", eventId: "e1", ...mine }, { _id: "sam", eventId: "e1", personaId: "fb_sam", status: "going", name: "Sam" },
      { _id: "lee", eventId: "e1", personaId: "fb_lee", status: "going", name: "Lee" }],
    venues: [], slots: [{ slotId: "s1", label: "Fri 20 Nov, 7pm" }], picks: [], discoveredEvents: [],
    musePersonas: [], huddleMessages: [], huddleRuns: [],
  };
  const ctx = { caller: "fb_me", auth: { async getUserIdentity() { return { subject: ctx.caller }; } }, db: {
    query(table) {
      const filters = [];
      const index = { eq(k, value) { filters.push((r) => r[k] === value); return index; } };
      const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
      return { withIndex(_name, build) { build(index); return this; }, async unique() { return rows()[0] ?? null; }, async collect() { return rows(); } };
    },
    async patch(id, patch) { const row = Object.values(tables).flat().find((r) => r._id === id); assert.ok(row); Object.assign(row, patch); writes.push({ id, patch }); },
  } };
  return { ctx, tables, writes, feed: runtime.load("convex/feed.ts") };
}
const args = { eventId: "e1", personaId: "fb_me", action: "confirmGoIf" };

test("friend accepting resurfaces the conditional event, while keeping my RSVP Maybe", async () => {
  const w = world(); w.tables.guests[1].status = "invited";
  assert.equal((await w.feed.forViewer.handler(w.ctx, { personaId: "fb_me" })).recommended.length, 0);
  w.tables.guests[1].status = "going";
  const result = await w.feed.forViewer.handler(w.ctx, { personaId: "fb_me" });
  assert.equal(result.recommended.length, 1);
  assert.equal(result.recommended[0].conditionalRsvp.friend.name, "Sam");
  assert.equal(w.tables.guests[0].status, "maybe"); assert.equal(w.writes.length, 0);
});

test("detail keeps the selected friend's identity even if another friend is going first", async () => {
  const w = world(); w.tables.guests[1].status = "invited";
  const result = await w.feed.detail.handler(w.ctx, { eventId: "e1", personaId: "fb_me" });
  assert.equal(result.goIfOffer.name, "Sam");
  assert.equal(result.conditionalRsvp.state, "waiting");
});

test("explicit confirmation updates only my answer and duplicate confirmation is harmless", async () => {
  const w = world();
  await w.feed.respond.handler(w.ctx, args);
  await w.feed.respond.handler(w.ctx, args);
  assert.equal(w.tables.guests[0].status, "going");
  assert.equal(w.tables.guests[0].goIfFriend, undefined);
  assert.equal(w.writes.length, 1); assert.equal(w.writes[0].id, "me");
  assert.equal((await w.feed.forViewer.handler(w.ctx, { personaId: "fb_me" })).recommended.length, 0);
});

test("choosing Go if for an already-going friend still requires a later explicit confirmation", async () => {
  const w = world(); w.tables.guests[0].status = "invited"; delete w.tables.guests[0].goIfFriend;
  await w.feed.respond.handler(w.ctx, { ...args, action: "goIf", friendId: "fb_sam" });
  assert.equal(w.tables.guests[0].status, "maybe");
  assert.equal(w.tables.guests[0].goIfFriend, "fb_sam");
});

for (const status of ["invited", "maybe", "cant"]) {
  test(`stale confirmation rejects when saved friend is now ${status}, even if Lee is going`, async () => {
    const w = world(); w.tables.guests[1].status = status;
    await assert.rejects(w.feed.respond.handler(w.ctx, args), /still marked Maybe/);
    assert.equal(w.tables.guests[0].status, "maybe"); assert.equal(w.writes.length, 0);
  });
}

test("cancelled condition, removed friend and unopened event cannot be confirmed", async () => {
  for (const change of [
    (w) => { w.tables.guests[0].goIfFriend = undefined; },
    (w) => { w.tables.personas[0].friends = []; },
    (w) => { w.tables.events[0].status = "draft"; },
  ]) {
    const w = world(); change(w);
    await assert.rejects(w.feed.respond.handler(w.ctx, args));
    assert.equal(w.writes.length, 0);
  }
});

test("changing my answer clears the condition, and snooze still hides a ready prompt", async () => {
  const w = world();
  await w.feed.respond.handler(w.ctx, { ...args, action: "snooze" });
  assert.equal((await w.feed.forViewer.handler(w.ctx, { personaId: "fb_me" })).recommended.length, 0);
  await w.feed.respond.handler(w.ctx, { ...args, action: "cant" });
  assert.equal(w.tables.guests[0].goIfFriend, undefined);
  assert.equal(w.tables.guests[0].status, "cant");
});

test("cannot confirm another person's answer", async () => {
  const w = world(); w.ctx.caller = "fb_stranger";
  await assert.rejects(w.feed.respond.handler(w.ctx, args));
  assert.equal(w.writes.length, 0);
});
