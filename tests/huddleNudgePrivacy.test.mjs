import { test } from "node:test";
import assert from "node:assert/strict";
import { loadHuddle } from "../scripts/lib/load-huddle.mjs";

// Adversarial model output, real structured huddle + privacy code, in-memory storage.
// This is a regression check, not a measured live model leak rate.
async function run({ text = "sam-private-canary", verdict = "worth", codeCheck = true } = {}) {
  let owners;
  const runtime = loadHuddle({ async museJSON(opts) {
    if (opts.system.includes("privacy filter")) return { data: await opts.fallback(), source: "offline" };
    const data = opts.system.includes("decide alone")
      ? { verdict, reasons: [text] }
      : { available: true, interest_match: 2, attending_likelihood: "likely", reason_tag: "shared_interest", why: "Likes bowling." };
    return { data: opts.schema.parse(data), source: "muse" };
  } });
  const seeds = runtime.load("convex/seedData.ts").buildPersonas();
  owners = ["maya", "sam"].map((id) => {
    const p = structuredClone(seeds.find((p) => p.id === id));
    return { ...p, friends: [], secrets: ["sam-private-canary"], neverShare: ["sam-private-canary"] };
  });
  const messages = [], nudges = [];
  await runtime.huddle().runHuddle.handler({
    async runQuery(ref) {
      if (String(ref) === "internal.huddleData.getEventForHuddle") return { eventId: "e1", hostId: "maya", title: "Bowling", slotId: "fri20", query: { topics: ["bowling"] }, museCalls: 0 };
      if (String(ref) === "internal.personas.listAllInternal") return owners;
      if (String(ref) === "internal.musePersonas.approvedForPersonas") return {};
      throw new Error(`Unexpected query ${String(ref)}`);
    },
    async runMutation(ref, args) {
      if (String(ref) === "internal.huddleData.insertMessage") messages.push(structuredClone(args));
      else if (String(ref) === "internal.guests.setNudge") nudges.push(structuredClone(args.nudge));
      else if (String(ref) !== "internal.events.bumpCalls") throw new Error(`Unexpected mutation ${String(ref)}`);
    },
  }, { eventId: "e1", candidateIds: ["sam"], profileMode: "event_safe", codeCheck });
  return { messages, nudge: nudges[0], privacy: runtime.privacy, owner: owners[1] };
}

for (const text of ["sam-private-canary", "Call 415-555-0199.", "Money is tight this month."]) {
  test(`final recommendation removes private output from transcript AND guest storage (${text.split(" ")[0]})`, async () => {
    const result = await run({ text });
    const last = result.messages.at(-1);
    assert.notEqual(last.status, "sent");
    assert.ok(last.checks.length > 0);
    assert.equal(result.privacy.leaksIn(last.text, { ...result.owner, secrets: [text.toLowerCase()] }), false);
    assert.doesNotMatch(JSON.stringify(result.nudge), new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  });
}
test("skip verdicts cannot hide private reasons behind a clean display line", async () => {
  const result = await run({ verdict: "skip" });
  assert.doesNotMatch(JSON.stringify(result.nudge), /sam-private-canary/);
  assert.equal(result.nudge.verdict, "skip");
});
test("safe long recommendations are not rejected by the structured reply's 140-character limit", async () => {
  const text = "Likes bowling with friends and trying a new place after work on Friday. ".repeat(2).trim();
  const result = await run({ text });
  assert.ok(result.nudge.text.length > 140);
  assert.equal(result.messages.at(-1).status, "sent");
  assert.equal(result.nudge.reasons[0], text);
});
test("checks-off remains a genuine positive control for the leak harness", async () => {
  const result = await run({ codeCheck: false });
  assert.equal(result.messages.at(-1).status, "sent");
  assert.match(JSON.stringify(result.nudge), /sam-private-canary/);
});
