// Read process.env live on every access rather than caching at module load: Convex reuses warm
// function workers across invocations, so a value captured once at import time can go stale
// relative to `npx convex env set` changes until the worker happens to cold-start again.
export const CONFIG = {
  get museBase() {
    return process.env.MUSE_BASE_URL ?? "https://api.meta.ai/v1";
  },
  get museKey() {
    return process.env.MUSE_API_KEY ?? "";
  },
  models: { spark: "muse-spark-1.3", wonder: "muse-wonder-1.0", ember: "muse-ember-1.0", image: "muse-image-1.0" },
  poolSize: 50,
  displaySize: 15,
  maxPeers: 3,
  // Free-conversation mode (convex/huddleChat.ts): hard cap on turns per candidate<->peer
  // exchange, counted across BOTH sides. 4 = two round-trips each way, which reads as a real
  // exchange while staying inside maxCallsPerEvent (claude.md §5.3's "cap and goal-bind").
  maxTurns: 4,
  // How many other Muses each candidate's Muse actually converses with. An exchange costs
  // maxTurns model calls + ONE closing sparkCheck (the per-turn code check is pure regex and
  // free), so ~5 calls/edge vs structured's ~2 — this number multiplies the whole huddle.
  //
  // Raised 2 -> 4 deliberately: two peers is a thin basis for "my Muse asked around", and the
  // swarm graph is visibly sparser for it. 4 cannot be changed on its own — at displaySize 15 it
  // takes the huddle from ~195 calls to ~345, which is over the OLD 240 ceiling, and busting the
  // ceiling does not fail loudly: museJSON silently returns offline fallbacks, so the back half
  // of the "real conversation" would quietly stop being real while still looking real. That is
  // the exact bug §20 was written about. maxCallsPerEvent below is raised to match.
  maxPeersFree: 4,
  // Headroom for free conversation, which is now the default (convex/huddle.ts). A full huddle at
  // displaySize 15 with maxPeersFree 4 costs roughly: 15 candidates x 2 (the opening reply + its
  // guard) + 15 x 4 edges x ~5 (4 turns + one closing Spark pass) + 15 deciders = ~345
  // (30 + 300 + 15). 420 leaves ~75 calls of headroom, the same ~20% slack the old 240 gave 195 —
  // slack matters because exhausting this ceiling degrades to offline fallbacks rather than
  // failing, so a huddle with no room left goes quietly fake instead of stopping.
  //
  // Changing displaySize OR maxPeersFree means redoing this arithmetic, not eyeballing it
  // (claude.md §18) — they multiply.
  //
  // Wall-clock is the real cost of the peer raise, not the call count: the exchanges dominate
  // (300 of the 345 calls), so doubling peers roughly doubles the huddle. A measured ~11 minute
  // huddle at displaySize 15 / 2 peers becomes ~20 minutes at 4. That still fits huddleRuntime's
  // 120s lease because every message write renews it — the lease is a liveness check, not a
  // deadline — but it is far too slow to run live on stage. Pre-run it and use the swarm's
  // Replay button (claude.md §20).
  maxCallsPerEvent: 420,
  // Measured low-effort spark calls average ~8.5s, wonder ~4.2s; every museJSON call site uses
  // "low" effort (no medium/high).
  //
  // This was 10s, which is an average plus almost no headroom — so every call slower than typical
  // was killed. On a real 12-candidate huddle that meant 34 AbortErrors and HALF the transcript
  // (43 of 86 messages) coming back as deterministic offline fallback while still looking like a
  // conversation. The deployment logs for that run contain no auth, rate-limit or schema failures
  // at all: every single fallback was this timeout firing on a call that would have succeeded.
  //
  // Raising it costs much less wall-clock than it looks, because an abort already burned the full
  // 10s and returned nothing — the choice is "wait 10s for nothing" vs "wait a bit longer for a
  // real answer". 20s sits well past the observed tail while still cutting a genuine hang short.
  timeoutMs: 20000,
};

export const museLive = () => Boolean(CONFIG.museKey);
