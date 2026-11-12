import test from "node:test";
import assert from "node:assert/strict";
import { buildPersonas, HOST_ID } from "../lib/seed";
import { parseAudience, retrieve } from "../lib/funnel";
import { availabilityCount, bestSlot } from "../lib/plan";
import { defaultSettings, planEvent } from "../lib/events";
import { runHuddle } from "../lib/huddle";
import { newBudget } from "../lib/muse";

const P = buildPersonas();
const host = P.find((p) => p.id === HOST_ID)!;

test("audience text becomes a structured query", async () => {
  assert.deepEqual((await parseAudience("my closest friends")).tie, "close");
  const q = await parseAudience("the people I go boxing with");
  assert.deepEqual(q.topics, ["boxing"]);
});
test("friends of friends are off by default and only appear when enabled", async () => {
  const q = await parseAudience("my tech network");
  assert.equal(retrieve(q, P, defaultSettings(), HOST_ID).some((x) => x.p.hop === 2), false);
  assert.equal(retrieve(q, P, { ...defaultSettings(), friendsOfFriends: true }, HOST_ID).some((x) => x.p.hop === 2), true);
});
test("date picker agrees with brute force", () => {
  const guests = P.filter((p) => p.hop === 1).slice(0, 12);
  const best = bestSlot(guests);
  for (const s of ["fri20", "sat21", "sun22", "fri27", "sat28"]) assert.ok(availabilityCount(best.id, guests) >= availabilityCount(s, guests));
});
test("plan produces simulated-only vendor drafts and verified date", async () => {
  const ev = await planEvent({ id: "t", host, personas: P, answers: { purpose: "Birthday", vibe: "Lively", budget: 2 }, audience: "the people I go boxing with", settings: defaultSettings(), budget: newBudget() });
  assert.ok(ev.drafts.length >= 2 && ev.drafts.every((d) => d.simulated));
  assert.equal(ev.status, "draft");
  assert.ok(ev.dateCheck.can <= ev.dateCheck.of);
});
test("huddle: skip verdict for guests not free, no peers' private data in transcript", async () => {
  const ev = await planEvent({ id: "t2", host, personas: P, answers: { purpose: "Birthday", vibe: "Lively", budget: 2 }, audience: "the people I go boxing with", settings: defaultSettings(), budget: newBudget() });
  const ids = ev.shortlist.map((s) => s.personaId);
  const r = await runHuddle(ev, ids, P, { budget: newBudget() });
  for (const id of ids) {
    const p = P.find((x) => x.id === id)!;
    if (!p.availability.includes(ev.slotId)) assert.equal(r.nudges[id].verdict, "skip");
  }
  const all = r.messages.map((m) => m.text).join(" ").toLowerCase();
  for (const p of P) for (const s of p.secrets) assert.equal(all.includes(s), false, `leaked ${s}`);
});
test("personas who turn nudges off are excluded", async () => {
  const P2 = buildPersonas();
  P2.find((p) => p.id === "sam")!.settings.nudgesOn = false;
  const ev = await planEvent({ id: "t3", host: P2.find((p) => p.id === HOST_ID)!, personas: P2, answers: { purpose: "Other", vibe: "Chill", budget: 1 }, audience: "boxing", settings: defaultSettings(), budget: newBudget() });
  const r = await runHuddle(ev, ["sam", "priya"], P2, { budget: newBudget() });
  assert.equal(r.nudges["sam"], undefined);
  assert.ok(r.nudges["priya"]);
});
