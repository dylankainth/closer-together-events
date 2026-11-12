export const CONFIG = {
  museBase: process.env.MUSE_BASE_URL ?? "https://api.meta.ai/v1",
  museKey: process.env.MUSE_API_KEY ?? "",
  models: { spark: "muse-spark-1.3", wonder: "muse-wonder-1.0", image: "muse-image-1.0" },
  // cost controls (open question 3): tunable system parameters
  poolSize: 50,          // retrieval shortlist handed to Muse
  displaySize: 12,       // guests shown to the host
  maxPeers: 3,           // Muse-to-Muse conversations per guest
  maxCallsPerEvent: 160, // hard cap on Muse calls per event
  timeoutMs: 25000,
};
export const museLive = () => Boolean(CONFIG.museKey);
