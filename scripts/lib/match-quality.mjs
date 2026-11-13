// Does the matching actually pick the right people, and does it tell them the truth?
//
// Every existing eval answers "is it SAFE" (privacy, leaks, auth). Nothing answered "is it GOOD",
// which claude.md §12 listed as "funnel quality" and nobody built. This is that harness.
//
// It deliberately runs the OFFLINE deterministic path (loadHuddle substitutes model calls with
// each call site's own fallback). Asserting on live model prose would be flaky and would test the
// model rather than our system; the properties below are ones our code is responsible for and must
// hold whether or not Muse is reachable.
import { loadHuddle } from "./load-huddle.mjs";

const SLOT = "fri20";

export function world() {
  const runtime = loadHuddle();
  const seed = runtime.load("convex/seedData.ts");
  const funnel = runtime.load("convex/funnel.ts");
  const huddle = runtime.load("convex/huddle.ts");
  const personas = seed.buildPersonas();
  return { runtime, seed, funnel, huddle, personas, byId: new Map(personas.map((p) => [p.id, p])) };
}

const SETTINGS = { friendsOfFriends: false, quota: 12, reasons: { friendsOfFriends: "", quota: "", guestCount: "" } };

/** Rank the host's friends for an audience description, as the planner would. */
export async function shortlistFor({ funnel, personas }, audience, hostId = "maya") {
  const parsed = await funnel.parseAudience(audience, { used: 0, max: 50 });
  const pool = funnel.retrieve(parsed.data, personas, SETTINGS, hostId);
  return { query: parsed.data, pool, ids: pool.map((x) => x.p.id) };
}

/** Share of the top `n` who genuinely hold the interest the audience asked for. */
export function precisionAtN(pool, interest, n = 5) {
  const top = pool.slice(0, n);
  if (!top.length) return 0;
  return top.filter((x) => x.p.interests.includes(interest)).length / top.length;
}

/** What a candidate's Muse concludes, through the real decider's offline path. */
export function verdictFor({ huddle, byId }, candidateId, topics, peerIds = []) {
  const candidate = byId.get(candidateId);
  const replies = peerIds.map((id) => {
    const p = byId.get(id);
    const free = p.availability.includes(SLOT);
    return {
      p,
      r: {
        event_id: "eval", from_muse: `muse_${id}`, available: free,
        interest_match: p.interests.filter((i) => topics.includes(i)).length,
        attending_likelihood: free ? "likely" : "unlikely",
        reason_tag: free ? "shared_interest" : "busy",
        why: free ? "Free and interested." : "Not free then.",
        approved_fields_only: true,
      },
    };
  });
  return huddle.decideOffline(candidate, SLOT, topics, replies);
}

export const claimsSomeoneAttends = (nudge) => nudge.reasons.some((r) => /\bwill be there\b/i.test(r));
export const claimsYoureFree = (nudge) => nudge.reasons.some((r) => /you're free/i.test(r));
