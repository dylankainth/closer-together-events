import { z } from "zod";
import { AudienceQuery, EventSettings, Persona, ShortlistItem } from "./types";
import { CONFIG } from "./config";
import { museJSON, CallBudget } from "./muse";

const TOPIC_VOCAB: Record<string, string[]> = {
  boxing: ["boxing", "boxers", "box"],
  tech: ["tech", "startup", "startups", "engineer", "engineers", "software"],
  bowling: ["bowling"],
  climbing: ["climbing", "climb", "boulder", "bouldering"],
  "live music": ["music", "gig", "gigs", "concert", "vinyl"],
  food: ["food", "foodie", "dinner", "cooking", "chefs"],
  gaming: ["gaming", "games", "gamers", "board games"],
  running: ["running", "runners", "run"],
  fitness: ["gym", "fitness", "workout"],
  outdoors: ["outdoors", "hiking", "hike"],
  design: ["design", "designers"],
};

/** Step 1: Muse converts free text into a structured query. Offline fallback is rule-based. */
export async function parseAudience(raw: string, budget?: CallBudget): Promise<AudienceQuery> {
  const r = await museJSON({
    model: "spark",
    budget,
    system: "Turn the host's audience description into {\"tie\":\"close\"|\"any\",\"topics\":string[]}. 'closest friends' is a relationship (tie=close), not a topic. Topics are short lowercase interest tags.",
    user: { audience: raw },
    schema: z.object({ tie: z.enum(["close", "any"]), topics: z.array(z.string().max(30)).max(6) }),
    fallback: () => {
      const t = raw.toLowerCase();
      const tie = /(closest|close friends|best friends|inner circle|bffs?)/.test(t) ? "close" : "any";
      const topics = Object.entries(TOPIC_VOCAB).filter(([, ws]) => ws.some((w) => new RegExp(`\\b${w}\\b`).test(t))).map(([k]) => k);
      return { tie, topics } as { tie: "close" | "any"; topics: string[] };
    },
  });
  return { tie: r.data.tie, topics: r.data.topics, raw };
}

/** Interaction-graph tie strength between host and friend (0..1). */
export function tieStrength(p: Persona): number {
  const x = p.features;
  return 0.35 * x.msgFreq + 0.3 * x.coAttended + 0.2 * x.sharedGroups + 0.15 * x.taggedPhotos;
}

const tok = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
function cosine(a: string[], b: string[]) {
  const fa = new Map<string, number>(), fb = new Map<string, number>();
  a.forEach((w) => fa.set(w, (fa.get(w) ?? 0) + 1));
  b.forEach((w) => fb.set(w, (fb.get(w) ?? 0) + 1));
  let dot = 0, na = 0, nb = 0;
  fa.forEach((v, k) => { dot += v * (fb.get(k) ?? 0); na += v * v; });
  fb.forEach((v) => (nb += v * v));
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
/** Per-friend summary text (cached per persona). Stand-in for an embedding vector at demo scale. */
const summaryCache = new Map<string, string[]>();
function summaryTokens(p: Persona) {
  let t = summaryCache.get(p.id);
  if (!t) { t = tok([...p.interests, p.job, p.vibe].join(" ")); summaryCache.set(p.id, t); }
  return t;
}
export function topicScore(p: Persona, topics: string[]): number {
  if (!topics.length) return 0;
  const exact = topics.filter((t) => p.interests.some((i) => i.toLowerCase() === t)).length / topics.length;
  return Math.min(1, 0.7 * exact + 0.3 * cosine(tok(topics.join(" ")), summaryTokens(p)) * 2);
}

/** Step 2: hybrid retrieval. Tie strength from the interaction graph + topical similarity. */
export function retrieve(q: AudienceQuery, personas: Persona[], settings: EventSettings, hostId: string): { p: Persona; score: number; tie: number; topic: number }[] {
  const wTie = q.tie === "close" ? 0.7 : q.topics.length ? 0.3 : 1;
  const wTopic = 1 - wTie;
  return personas
    .filter((p) => p.id !== hostId && p.hasMuse !== undefined && (p.hop === 1 || settings.friendsOfFriends))
    .map((p) => {
      const tie = p.hop === 1 ? tieStrength(p) : 0.12;
      const topic = topicScore(p, q.topics);
      const hopPenalty = p.hop === 2 ? 0.8 : 1;
      return { p, tie, topic, score: (wTie * tie + wTopic * topic) * hopPenalty };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.poolSize);
}

function reasonFor(p: Persona, tie: number, topics: string[], available: boolean, personas: Persona[]): string {
  const parts: string[] = [];
  if (p.hop === 2) {
    const via = personas.find((x) => x.id === p.via);
    parts.push(`Friend of ${via?.name.split(" ")[0] ?? "a friend"}`);
  } else parts.push(tie > 0.65 ? "Close" : tie > 0.4 ? "Friend" : "Less close");
  const shared = topics.filter((t) => p.interests.includes(t));
  if (shared.length) parts.push(shared[0] === "boxing" ? "Boxes with you" : `Into ${shared[0]} too`);
  parts.push(available ? "Free then" : "Busy then");
  return parts.join(". ") + ".";
}

/** Step 3: Muse reranks the pool and writes a reason per person. */
export async function rerank(
  pool: { p: Persona; score: number; tie: number; topic: number }[],
  q: AudienceQuery,
  slotId: string,
  settings: EventSettings,
  allPersonas: Persona[],
  budget?: CallBudget,
): Promise<ShortlistItem[]> {
  const items = pool.map((x) => {
    const available = x.p.availability.includes(slotId);
    return { x, available, base: reasonFor(x.p, x.tie, q.topics, available, allPersonas) };
  });
  // Muse call: reorder + sharpen reasons. Offline: keep retrieval order, availability breaks ties.
  const r = await museJSON({
    model: "spark",
    budget,
    system: "Rerank candidate guests for a host's event. For each candidate return {id, reason} (<=12 words, why they fit the audience). Return {\"ranking\": [...]} best first. Never invent facts.",
    user: { audience: q.raw, candidates: items.map((i) => ({ id: i.x.p.id, interests: i.x.p.interests, job: i.x.p.job, tie: +i.x.tie.toFixed(2), free: i.available })) },
    schema: z.object({ ranking: z.array(z.object({ id: z.string(), reason: z.string().max(120) })) }),
    fallback: () => ({
      ranking: [...items]
        .sort((a, b) => b.x.score + (b.available ? 0.08 : 0) - (a.x.score + (a.available ? 0.08 : 0)))
        .map((i) => ({ id: i.x.p.id, reason: i.base })),
    }),
  });
  const byId = new Map(items.map((i) => [i.x.p.id, i]));
  const ordered = r.data.ranking.filter((e) => byId.has(e.id));
  const seen = new Set(ordered.map((e) => e.id));
  items.forEach((i) => { if (!seen.has(i.x.p.id)) ordered.push({ id: i.x.p.id, reason: i.base }); });
  const cap = Math.max(CONFIG.displaySize, 1);
  return ordered.slice(0, CONFIG.poolSize).map((e, idx) => {
    const i = byId.get(e.id)!;
    return {
      personaId: i.x.p.id, name: i.x.p.name, initials: i.x.p.initials, color: i.x.p.color, score: +i.x.score.toFixed(3), tie: +i.x.tie.toFixed(2), topic: +i.x.topic.toFixed(2),
      reason: e.reason, available: i.available, hop: i.x.p.hop, via: i.x.p.via,
      selected: settings.mode === "auto_invite" ? idx < settings.maxAutoInvites : idx < Math.min(cap, settings.quota || cap),
    };
  });
}
