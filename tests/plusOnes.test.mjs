import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { ConvexError, v } from "convex/values";
import * as policy from "../convex/plusOnePolicy.ts";
import { loadHuddle } from "../scripts/lib/load-huddle.mjs";

const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../convex/plusOnes.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, {
  module: mod, exports: mod.exports,
  require(name) {
    if (name === "convex/values") return { ConvexError, v };
    if (name === "./_generated/server") return { query: (d) => d, mutation: (d) => d };
    if (name === "./_generated/api") return { internal: { huddle: { runHuddle: "guarded-huddle" } } };
    if (name === "./plusOnePolicy") return policy;
    if (name === "./huddleRuntime") return loadHuddle().load("convex/huddleRuntime.ts");
    if (name === "./authz") return {
      requireActor: async (ctx, id) => { if (ctx.caller !== id) throw Error("forbidden"); },
      requireOwner: async (ctx, id) => { if (ctx.caller !== id) throw Error("forbidden"); },
      requireHost: async (ctx, e) => { if (!e || ctx.caller !== e.hostId) throw Error("forbidden"); },
    };
    throw Error(`Unexpected import ${name}`);
  },
});
const { offer, invite, configure } = mod.exports;
const person = (id, extra = {}) => ({
  _id: id, personaId: id, name: id.toUpperCase(), initials: id[0].toUpperCase(), friends: [],
  hasMuse: true, availability: ["s1"], settings: { talkToMuses: true, nudgesOn: true },
  memory: ["private memory"], neverShare: ["secret"], ...extra,
});
function world() {
  const tables = {
    events: [{ _id: "e", eventId: "e1", hostId: "host", status: "sent", slotId: "s1", venueId: "v1", shortlist: [], allowGuestInvites: true,
      settings: { friendsOfFriends: false, quota: 5, reasons: { friendsOfFriends: "", quota: "", guestCount: "" } } }],
    guests: [{ _id: "g", eventId: "e1", personaId: "sam", name: "SAM", status: "going", kind: "muse" }],
    personas: [person("host"), person("sam", { friends: ["lee", "jo"] }), person("lee", { friends: ["sam"] }), person("jo")],
    venues: [{ _id: "v", venueId: "v1", capacity: 5 }],
    musePersonas: [],
    huddleRuns: [],
  };
  const scheduled = [];
  const ctx = { caller: "sam", db: {
    query(table) {
      const filters = [];
      const idx = { eq(k, value) { filters.push((r) => r[k] === value); return idx; } };
      const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
      return {
        withIndex(_name, build) { build(idx); return this; },
        async unique() { const r = rows(); assert.ok(r.length <= 1); return r[0] ?? null; },
        async collect() { return rows(); },
      };
    },
    async insert(table, value) { const id = `${table}-${tables[table].length}`; tables[table].push({ _id: id, ...value }); return id; },
    async patch(id, patch) {
      const row = Object.values(tables).flat().find((r) => r._id === id);
      assert.ok(row); Object.assign(row, patch);
    },
  }, scheduler: { async runAfter(delay, fn, args) { scheduled.push({ delay, fn, args }); } } };
  return { ctx, tables, scheduled, event: tables.events[0], guest: tables.guests[0] };
}
const args = { eventId: "e1", personaId: "sam", friendId: "lee" };

test("eligible offer exposes identity only, then sends one invitation and one guarded personal huddle", async () => {
  const w = world();
  const result = await offer.handler(w.ctx, args);
  assert.equal(result.state, "available");
  assert.deepEqual(Object.keys(result.person).sort(), ["initials", "name", "personaId"]);
  assert.equal(result.person.personaId, "lee");
  await invite.handler(w.ctx, args);
  assert.equal(w.tables.guests.length, 2);
  const friend = w.tables.guests[1];
  assert.equal(friend.status, "invited", "never RSVP for the recipient");
  assert.equal(friend.invitedByPersonaId, "sam");
  assert.equal(w.guest.status, "going");
  assert.equal(w.scheduled.length, 1);
  assert.equal(String(w.scheduled[0].fn), "internal.huddle.runHuddle");
  assert.equal(w.scheduled[0].args.codeCheck, true);
  assert.equal(w.scheduled[0].args.profileMode, "event_safe");
  assert.equal(w.scheduled[0].args.candidateIds.join(), "lee");
  assert.equal((await offer.handler(w.ctx, args)).state, "sent");
});

test("repeat invitation is idempotent and original guest cannot invite a second person", async () => {
  const w = world();
  await invite.handler(w.ctx, args);
  await invite.handler(w.ctx, args);
  await assert.rejects(invite.handler(w.ctx, { ...args, friendId: "jo" }));
  assert.equal(w.tables.guests.length, 2);
  assert.equal(w.scheduled.length, 1);
});

const denied = {
  "host permission absent": (w) => { delete w.event.allowGuestInvites; },
  "host turned permission off": (w) => { w.event.allowGuestInvites = false; },
  "draft event": (w) => { w.event.status = "draft"; },
  "not a guest": (w) => { w.tables.guests.length = 0; },
  "guest has not accepted": (w) => { w.guest.status = "invited"; },
  "guest declined": (w) => { w.guest.status = "cant"; },
  "invitees cannot extend the chain": (w) => { w.guest.invitedByPersonaId = "another"; },
  "quota reached, including anonymous guests": (w) => { w.event.settings.quota = 2; w.tables.guests.push({ eventId: "e1", kind: "external", status: "maybe" }); },
  "capacity reached": (w) => { w.event.capacity = 1; },
  "venue capacity reached": (w) => { w.tables.venues[0].capacity = 1; },
  "zero quota": (w) => { w.event.settings.quota = 0; },
  "target is not my friend": (w) => { w.tables.personas[1].friends = []; },
  "target is already invited": (w) => { w.tables.guests.push({ eventId: "e1", personaId: "lee", status: "invited" }); },
  "target has no Muse": (w) => { w.tables.personas[2].hasMuse = false; },
  "target opted out of conversation": (w) => { w.tables.personas[2].settings.talkToMuses = false; },
  "target opted out of nudges": (w) => { w.tables.personas[2].settings.nudgesOn = false; },
  "target not available": (w) => { w.tables.personas[2].availability = []; },
  "real target is not host's friend": (w) => { w.tables.personas[2].personaId = "fb_lee"; w.tables.personas[1].friends = ["fb_lee"]; },
};
for (const [reason, change] of Object.entries(denied)) {
  test(`invitation rejected without writes: ${reason}`, async () => {
    const w = world(); change(w);
    const before = JSON.stringify(w.tables);
    await assert.rejects(invite.handler(w.ctx, { ...args, friendId: w.tables.personas[2].personaId }));
    assert.equal(JSON.stringify(w.tables), before);
    assert.equal(w.scheduled.length, 0);
  });
}

test("real target still requires host friendship", async () => {
  const w = world();
  w.tables.personas[2].personaId = "fb_lee";
  w.tables.personas[1].friends = ["fb_lee"];
  w.tables.personas[0].friends = ["fb_lee"];
  await invite.handler(w.ctx, { ...args, friendId: "fb_lee" });
  assert.equal(w.tables.guests[1].personaId, "fb_lee");
});

test("approved Muse availability matches the huddle overlay; unapproved data is not used", async () => {
  const w = world();
  w.tables.personas[2].availability = [];
  w.tables.musePersonas.push({ personaId: "lee", profileApproved: false, availability: ["s1"] });
  await assert.rejects(invite.handler(w.ctx, args));
  w.tables.musePersonas[0].profileApproved = true;
  await invite.handler(w.ctx, args);
  assert.equal(w.tables.guests[1].personaId, "lee");
});

test("stale suggestion is rejected if another invitation fills the limit", async () => {
  const w = world(); w.event.settings.quota = 2;
  assert.equal((await offer.handler(w.ctx, args)).state, "available");
  w.tables.guests.push({ eventId: "e1", personaId: "someone", status: "invited" });
  await assert.rejects(invite.handler(w.ctx, args));
  assert.equal(w.scheduled.length, 0);
});

test("cannot act as another guest or configure another host's event", async () => {
  const w = world(); w.ctx.caller = "stranger";
  await assert.rejects(invite.handler(w.ctx, args), /forbidden/);
  await assert.rejects(offer.handler(w.ctx, args), /forbidden/);
  await assert.rejects(configure.handler(w.ctx, { eventId: "e1", enabled: true, limit: 3 }), /forbidden/);
  assert.equal(w.tables.guests.length, 1);
});

test("host explicitly enables expansion and changes the shared invite limit", async () => {
  const w = world(); w.ctx.caller = "host"; delete w.event.allowGuestInvites;
  await configure.handler(w.ctx, { eventId: "e1", enabled: true, limit: 4 });
  assert.equal(w.event.allowGuestInvites, true);
  assert.equal(w.event.settings.quota, 4);
  assert.equal(w.event.settings.friendsOfFriends, false, "initial planner matching remains independent");
});
for (const limit of [0, 1.5, 501, 6]) {
  test(`host cannot configure invalid or over-capacity limit ${limit}`, async () => {
    const w = world(); w.ctx.caller = "host";
    await assert.rejects(configure.handler(w.ctx, { eventId: "e1", enabled: true, limit }));
  });
}
test("host can turn expansion off even after capacity is lowered; existing invites stay", async () => {
  const w = world(); await invite.handler(w.ctx, args);
  w.ctx.caller = "host"; w.event.capacity = 1;
  await configure.handler(w.ctx, { eventId: "e1", enabled: false, limit: 5 });
  assert.equal(w.event.allowGuestInvites, false);
  assert.equal(w.tables.guests.length, 2);
});

test("planning cannot overwrite a host's newly configured quota", async () => {
  const w = world(); w.ctx.caller = "host"; delete w.event.shortlist;
  await assert.rejects(configure.handler(w.ctx, { eventId: "e1", enabled: true, limit: 4 }), /Finish planning/);
  assert.equal(w.event.settings.quota, 5);
});
