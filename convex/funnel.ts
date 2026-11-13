"use node";

import { z } from "zod";
import { museJSON } from "./muse";
import { CONFIG } from "./museConfig";
import type { AudienceQuery, CallBudget, EventSettings, Persona, ShortlistItem, Tie } from "./types";

export const TOPIC_VOCAB: Record<string, string[]> = {
  boxing: ["boxing", "box", "sparring"],
  tech: ["tech", "startup", "coding", "engineer", "software"],
  bowling: ["bowling", "bowl", "lanes"],
  climbing: ["climbing", "climb", "boulder", "bouldering"],
  "live music": ["music", "concert", "gig", "band", "vinyl"],
  food: ["food", "foodie", "cooking", "dinner", "brunch"],
  gaming: ["gaming", "games", "gamer", "esports"],
  running: ["running", "run", "marathon", "5k"],
  fitness: ["fitness", "gym", "workout", "training"],
  outdoors: ["outdoors", "hiking", "camping", "park"],
  design: ["design", "art", "creative"],
};

export async function parseAudience(raw: string, budget: CallBudget): Promise<{ data: AudienceQuery; source: "muse" | "offline" }> {
  const r = await museJSON({
    model: "spark",
    effort: "low",
    budget,
    system:
      'Convert a host\'s free-text description of who an event is for into a tie-strength requirement plus topical tags. Return {"tie": "close" or "any", "topics": string[] (up to 6 short topic words)}.',
    user: { text: raw },
    schema: z.object({ tie: z.enum(["close", "any"]), topics: z.array(z.string().max(30)).max(6) }),
    fallback: () => {
      const lower = raw.toLowerCase();
      const tie: Tie = /(closest|close friends|best friends|inner circle|bffs?)/.test(lower) ? "close" : "any";
      // Match a vocabulary word as a PREFIX of a word the host wrote, rather than exactly. Hosts
      // name groups by what the people are ("the foodies", "my climbers"), not by the activity,
      // and exact matching parsed those to NO topics at all — the whole audience description was
      // then discarded and the shortlist fell back to raw tie-strength. Prefixing covers the
      // plural and the -er/-ers forms together, instead of stacking suffix rules that keep
      // missing one. Four characters minimum so short entries can't match on a stray fragment.
      const tokens = lower.split(/[^a-z0-9]+/u).filter(Boolean);
      const mentions = (w: string) => tokens.some((t) => t === w || (w.length >= 4 && t.startsWith(w)));
      const topics = Object.entries(TOPIC_VOCAB)
        .filter(([, words]) => words.some(mentions))
        .map(([topic]) => topic);
      return { tie, topics };
    },
  });
  return { data: { ...r.data, raw }, source: r.source };
}

export function tieStrength(p: Persona): number {
  const f = p.features;
  return 0.35 * f.msgFreq + 0.3 * f.coAttended + 0.2 * f.sharedGroups + 0.15 * f.taggedPhotos;
}

function tokenize(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tok of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    counts.set(tok, (counts.get(tok) ?? 0) + 1);
  }
  return counts;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [tok, count] of a) dot += count * (b.get(tok) ?? 0);
  const norm = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));
  const na = norm(a);
  const nb = norm(b);
  return na && nb ? dot / (na * nb) : 0;
}

const summaryCache = new Map<string, Map<string, number>>();
function summaryTokens(p: Persona): Map<string, number> {
  if (!summaryCache.has(p.id)) summaryCache.set(p.id, tokenize([...p.interests, p.job, p.vibe].join(" ")));
  return summaryCache.get(p.id)!;
}

export function topicScore(p: Persona, topics: string[]): number {
  if (!topics.length) return 0;
  const exact = topics.filter((t) => p.interests.includes(t)).length / topics.length;
  const sim = cosine(tokenize(topics.join(" ")), summaryTokens(p));
  return Math.min(1, 0.7 * exact + 0.3 * sim * 2);
}

export function retrieve(
  query: AudienceQuery,
  personas: Persona[],
  settings: EventSettings,
  hostId: string,
): { p: Persona; score: number; tie: number; topic: number }[] {
  const wTie = query.tie === "close" ? 0.7 : query.topics.length ? 0.3 : 1;
  const wTopic = 1 - wTie;
  const pool = personas
    .filter((p) => p.id !== hostId && p.hasMuse)
    .filter((p) => p.hop === 1 || settings.friendsOfFriends)
    .map((p) => {
      const tie = p.hop === 1 ? tieStrength(p) : 0.12;
      const topic = topicScore(p, query.topics);
      const hopPenalty = p.hop === 2 ? 0.8 : 1;
      return { p, score: (wTie * tie + wTopic * topic) * hopPenalty, tie, topic };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, CONFIG.poolSize);
  return pool;
}

function reasonFor(
  p: Persona,
  query: AudienceQuery,
  slotId: string,
  via: Persona | undefined,
): string {
  const clauses: string[] = [];
  if (p.hop === 2 && via) clauses.push(`Friend of ${via.name.split(" ")[0]}`);
  else {
    const tie = tieStrength(p);
    clauses.push(tie > 0.65 ? "Close" : tie > 0.4 ? "Friend" : "Less close");
  }
  const shared = p.interests.find((i) => query.topics.includes(i));
  if (shared) clauses.push(shared === "boxing" ? "Boxes with you" : `Into ${shared}`);
  clauses.push(p.availability.includes(slotId) ? "Free then." : "Busy then.");
  return clauses.join(". ");
}

export async function rerank(
  pool: { p: Persona; score: number; tie: number; topic: number }[],
  query: AudienceQuery,
  slotId: string,
  settings: EventSettings,
  allPersonas: Persona[],
  budget: CallBudget,
): Promise<{ data: ShortlistItem[]; source: "muse" | "offline" }> {
  const byId = new Map(allPersonas.map((p) => [p.id, p]));
  const items = pool.map(({ p, score, tie, topic }) => ({
    id: p.id,
    available: p.availability.includes(slotId),
    base: reasonFor(p, query, slotId, p.via ? byId.get(p.via) : undefined),
    score,
    tie,
    topic,
    p,
  }));
  // Only the top slice (by pre-score) goes to the LLM: a reasoning model over all ~50 candidates
  // at once risks the call's own timeout, which silently falls back offline. The rest keep their
  // code-computed `base` reason via the "missing ids appended" merge below.
  const toRank = [...items].sort((a, b) => b.score - a.score).slice(0, Math.min(items.length, 20));
  const r = await museJSON({
    model: "spark",
    effort: "low",
    budget,
    system:
      'Rank these candidates for the event by relevance and write a one-line reason each (max 12 words). Never invent facts not given to you. Return {"ranking": [{"id": string, "reason": string}, ...]} covering every given id, best first.',
    user: { items: toRank.map(({ id, available, base }) => ({ id, available, base })) },
    schema: z.object({ ranking: z.array(z.object({ id: z.string(), reason: z.string().max(120) })).max(toRank.length) }),
    fallback: () => ({
      ranking: [...items]
        .sort((a, b) => b.score + (b.available ? 0.08 : 0) - (a.score + (a.available ? 0.08 : 0)))
        .map((i) => ({ id: i.id, reason: i.base })),
    }),
  });
  const byItemId = new Map(items.map((i) => [i.id, i]));
  const ordered = r.data.ranking.filter((x) => byItemId.has(x.id));
  for (const i of items) if (!ordered.some((x) => x.id === i.id)) ordered.push({ id: i.id, reason: i.base });
  const sliced = ordered.slice(0, CONFIG.poolSize);
  const shortlist: ShortlistItem[] = sliced.map((x, idx) => {
    const i = byItemId.get(x.id)!;
    const cut = Math.min(CONFIG.displaySize, settings.quota || CONFIG.displaySize);
    return {
      personaId: i.p.id,
      name: i.p.name,
      initials: i.p.initials,
      color: i.p.color,
      score: Math.round(i.score * 1000) / 1000,
      tie: Math.round(i.tie * 100) / 100,
      topic: Math.round(i.topic * 100) / 100,
      reason: x.reason,
      available: i.available,
      hop: i.p.hop,
      via: i.p.via,
      selected: idx < cut,
    };
  });
  return { data: shortlist, source: r.source };
}
