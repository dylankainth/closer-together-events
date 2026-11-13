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
  models: { spark: "muse-spark-1.3", wonder: "muse-wonder-1.0", image: "muse-image-1.0" },
  poolSize: 50,
  displaySize: 12,
  maxPeers: 3,
  maxCallsPerEvent: 160,
  timeoutMs: 25000,
};

export const museLive = () => Boolean(CONFIG.museKey);
