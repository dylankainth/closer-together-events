export const CONFIG = {
  museBase: process.env.MUSE_BASE_URL ?? "https://api.meta.ai/v1",
  museKey: process.env.MUSE_API_KEY ?? "",
  models: { spark: "muse-spark-1.3", wonder: "muse-wonder-1.0", image: "muse-image-1.0" },
  poolSize: 50,
  displaySize: 12,
  maxPeers: 3,
  maxCallsPerEvent: 160,
  timeoutMs: 25000,
};

export const museLive = () => Boolean(CONFIG.museKey);
