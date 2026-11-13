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
  displaySize: 12,
  maxPeers: 3,
  // Free-conversation mode (convex/huddleChat.ts): hard cap on turns per candidate<->peer
  // exchange, counted across BOTH sides. 4 = two round-trips each way, which reads as a real
  // exchange while staying inside maxCallsPerEvent (claude.md §5.3's "cap and goal-bind").
  maxTurns: 4,
  // Free mode fans out less than structured mode, because turns multiply: an exchange costs
  // maxTurns model calls + ONE closing sparkCheck (the per-turn code check is pure regex and
  // free), so ~5 calls/edge vs structured's ~2. At displaySize 12 candidates that is
  // 12 x (2 edges x 5 + 1 decide) = 132 calls, inside the 160 ceiling; using maxPeers (3) here
  // would need ~300 and would silently exhaust the budget mid-huddle, leaving the back half of
  // the "real conversation" demo running on offline fallbacks.
  maxPeersFree: 2,
  // Headroom for free conversation, which is now the default (convex/huddle.ts). A full huddle at
  // displaySize 12 costs roughly: 12 candidates x 2 (the opening reply + its guard) + 12 x 2 edges
  // x ~5 (4 turns + one closing Spark pass) + 12 deciders = ~156. The old 160 left so little slack
  // that one retry would push a huddle past it — and museJSON degrades to offline fallbacks rather
  // than failing, so the back half would quietly stop being real while still looking real.
  maxCallsPerEvent: 240,
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
