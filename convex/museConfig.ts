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
  maxCallsPerEvent: 160,
  // Measured low-effort spark calls average ~8.5s, wonder ~4.2s; every museJSON call site uses
  // "low" effort (no medium/high), so 10s gives headroom above the slowest normal case while
  // still cutting a genuine hang far short of the old 25s dead-air wait.
  timeoutMs: 10000,
};

export const museLive = () => Boolean(CONFIG.museKey);
