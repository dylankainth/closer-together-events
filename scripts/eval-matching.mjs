// Match-quality eval: prints the numbers claude.md §12 asks for ("funnel quality") and the
// honesty checks the nudge path has twice regressed on.
//
//   node --import ./tests/support/register-ts-resolve.mjs scripts/eval-matching.mjs
//
// Runs the real funnel/decider against the seeded personas with model calls substituted by each
// call site's own offline fallback, so the result is deterministic and reproducible on stage.
// It measures what OUR code is responsible for; it is not a benchmark of the model's prose.
import { world, shortlistFor, precisionAtN, verdictFor, claimsSomeoneAttends, claimsYoureFree } from "./lib/match-quality.mjs";

const AUDIENCES = [
  ["the people I go boxing with", "boxing"],
  ["my climbing friends", "climbing"],
  ["the foodies", "food"],
  ["my tech network", "tech"],
  ["people who are into live music", "live music"],
];

const pct = (n) => `${Math.round(n * 100)}%`.padStart(4);

const W = world();
console.log(`\nMatch quality — ${W.personas.length} seeded personas\n`);

console.log("FUNNEL: does the audience description select for what it describes?");
let total = 0;
for (const [text, interest] of AUDIENCES) {
  const { query, pool } = await shortlistFor(W, text);
  const p5 = precisionAtN(pool, interest, 5);
  total += p5;
  console.log(`  ${pct(p5)} of top 5 into "${interest}"   ← "${text}"   (topics: ${query.topics.join(", ") || "none"})`);
}
console.log(`  ${pct(total / AUDIENCES.length)} mean precision@5\n`);

console.log("STEERING: do different descriptions produce different people?");
const a = await shortlistFor(W, "the people I go boxing with");
const b = await shortlistFor(W, "my climbing friends");
const overlap = a.ids.slice(0, 5).filter((id) => b.ids.slice(0, 5).includes(id)).length;
console.log(`  ${overlap}/5 overlap between "boxing" and "climbing" top 5 — lower is better\n`);

console.log("HONESTY: does a nudge ever say something untrue?");
const busy = W.personas.filter((p) => !p.availability.includes("fri20"));
const freeFolk = W.personas.filter((p) => p.availability.includes("fri20"));
let falseAttendee = 0, falseFree = 0, silentOnBusy = 0;
for (const c of W.personas.slice(0, 40)) {
  const n = verdictFor(W, c.id, ["boxing"], busy.slice(0, 3).map((p) => p.id));
  if (claimsSomeoneAttends(n)) falseAttendee += 1; // nobody consulted is attending
  if (!c.availability.includes("fri20")) {
    if (claimsYoureFree(n)) falseFree += 1;
    if (!n.reasons.some((r) => /not free/i.test(r))) silentOnBusy += 1;
  }
}
console.log(`  ${falseAttendee} nudges named an attendee when nobody was attending   (want 0)`);
console.log(`  ${falseFree} nudges told a busy person they were free                 (want 0)`);
console.log(`  ${silentOnBusy} nudges stayed silent about a clash instead of naming it (want 0)\n`);

console.log("VERDICTS: is a free, interested person actually recommended?");
const keen = freeFolk.filter((p) => p.interests.includes("boxing")).slice(0, 10);
const worth = keen.filter((p) => verdictFor(W, p.id, ["boxing"], []).verdict === "worth").length;
console.log(`  ${worth}/${keen.length} free boxing fans rated "worth it" with no friends confirmed\n`);
