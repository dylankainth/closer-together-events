// Event discovery: fetch real nearby events from outside sources into the pool. Internal actions
// only. Each source has its own timeout and never throws, so one failing source cannot stop the
// others or the ranker (design: "never empty").
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { MENLO, shouldRerankAfterFetch } from "./discoveryCore";
import { mapHackRadar } from "./sources/hackradar";
import { mapApifyFacebook } from "./sources/apifyFacebook";
import { facebookEventUrls, parseAlleventsResults, type ParallelResult } from "./sources/parallel";
import type { DiscoveredInput } from "./discoveryCore";

const HACKRADAR_URL = "https://hackradar.tech/api/discovery/v1/events";
const HACKRADAR_RADIUS_MILES = 35; // about 56 km, matches RADIUS_KM so San Francisco is included
const PAGE_SIZE = 100; // a limit of 500 hangs on this API
const MAX_PAGES = 3;
const TIMEOUT_MS = 15_000;
const UPSERT_CHUNK = 50;

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": "muse-events" }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function upsertAll(ctx: ActionCtx, items: DiscoveredInput[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < items.length; i += UPSERT_CHUNK) {
    const r = await ctx.runMutation(internal.discoveryData.upsertMany, { items: items.slice(i, i + UPSERT_CHUNK) });
    inserted += r.inserted;
  }
  return inserted;
}

export async function fetchHackRadarItems(): Promise<DiscoveredInput[]> {
  const out: DiscoveredInput[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({
      latitude: String(MENLO.lat),
      longitude: String(MENLO.lng),
      radius_miles: String(HACKRADAR_RADIUS_MILES),
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    const body = (await getJson(`${HACKRADAR_URL}?${qs}`)) as { events?: unknown[] };
    const rows = Array.isArray(body?.events) ? body.events : [];
    for (const r of rows) {
      const mapped = mapHackRadar(r);
      if (mapped) out.push(mapped);
    }
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/** Fetch every source (each fails on its own), then re-rank: one person after a manual refresh,
 * everyone on the schedule. Demo personas left with no picks get the saved snapshot back. */
export const fetchAll = internalAction({
  args: { personaId: v.optional(v.string()) },
  handler: async (ctx, { personaId }): Promise<{ fetched: Record<string, number> }> => {
    const fetched: Record<string, number> = {};
    let inserted = 0;
    const sources = [
      ["hackradar", internal.discoverySources.fetchHackRadar, 15 * 60_000],
      ["apify-facebook", internal.discoverySources.fetchApifyFacebook, 60 * 60_000],
      ["parallel", internal.discoverySources.fetchParallel, 60 * 60_000],
    ] as const;
    for (const [name, fn, minGapMs] of sources) {
      try {
        // Refresh taps must not re-run a source (Apify is paid per event) more often than its gap.
        if (!(await ctx.runMutation(internal.discoveryData.claimSourceRun, { source: name, minGapMs }))) {
          fetched[name] = 0;
          continue;
        }
        const r = await ctx.runAction(fn, {});
        fetched[name] = r.fetched;
        inserted += r.inserted;
      } catch (err) {
        console.warn(`[discovery] ${name} failed: ${err instanceof Error ? err.message : "unknown error"}`);
        fetched[name] = 0;
      }
    }
    if (shouldRerankAfterFetch(personaId, inserted)) {
      try {
        if (personaId) await ctx.runAction(internal.discoveryRank.rankPersona, { personaId });
        else await ctx.runAction(internal.discoveryRank.rankAll, {});
      } catch (err) {
        console.warn(`[discovery] ranking failed: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
    // Never empty: runs even if ranking failed.
    await ctx.runMutation(internal.discoveryData.loadSnapshot, {});
    return { fetched };
  },
});

export const fetchHackRadar = internalAction({
  args: {},
  handler: async (ctx): Promise<{ fetched: number; inserted: number }> => {
    let items: DiscoveredInput[] = [];
    try {
      items = await fetchHackRadarItems();
    } catch (err) {
      console.warn(`[discovery] hackradar fetch failed: ${err instanceof Error ? err.message : "unknown error"}`);
      return { fetched: 0, inserted: 0 };
    }
    return { fetched: items.length, inserted: await upsertAll(ctx, items) };
  },
});

// ---- public Facebook events via Apify (apify/facebook-events-scraper) ----

const APIFY_URL = "https://api.apify.com/v2/acts/apify~facebook-events-scraper/run-sync-get-dataset-items?timeout=240";
const APIFY_SEARCHES = ["Palo Alto", "Menlo Park", "Mountain View", "Redwood City", "Stanford University", "San Francisco"];
const APIFY_MAX_PER_SEARCH = 20;
const APIFY_TIMEOUT_MS = 270_000;

export const fetchApifyFacebook = internalAction({
  args: {},
  handler: async (ctx): Promise<{ fetched: number; inserted: number }> => {
    const token = process.env.APIFY_TOKEN;
    if (!token) return { fetched: 0, inserted: 0 };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), APIFY_TIMEOUT_MS);
    let rows: unknown[] = [];
    try {
      const res = await fetch(APIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ searchQueries: APIFY_SEARCHES, startUrls: [], maxEvents: APIFY_MAX_PER_SEARCH }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      rows = Array.isArray(body) ? body : [];
    } catch (err) {
      console.warn(`[discovery] apify fetch failed: ${err instanceof Error ? err.message : "unknown error"}`);
      return { fetched: 0, inserted: 0 };
    } finally {
      clearTimeout(timer);
    }
    const items = rows.map(mapApifyFacebook).filter((e): e is DiscoveredInput => e !== null);
    return { fetched: items.length, inserted: await upsertAll(ctx, items) };
  },
});

// ---- Parallel web search: allevents listings + Facebook event pages (details via Apify) ----

const PARALLEL_URL = "https://api.parallel.ai/v1/search";
const PARALLEL_TIMEOUT_MS = 60_000;
const PARALLEL_BODY = {
  objective:
    "Public events (Facebook events and allevents listings) in Menlo Park, Palo Alto, Stanford, Mountain View or Redwood City, California in the next three weeks, with title, date, time and address.",
  search_queries: [
    "facebook events Palo Alto this month",
    "facebook events Menlo Park",
    "allevents Palo Alto this week",
    "allevents Mountain View events",
    "allevents Menlo Park events",
    "allevents Redwood City events",
  ],
  advanced_settings: { max_results: 20, source_policy: { include_domains: ["facebook.com", "allevents.in"] } },
};

export const fetchParallel = internalAction({
  args: {},
  handler: async (ctx): Promise<{ fetched: number; inserted: number }> => {
    const key = process.env.PARALLEL_API_KEY;
    if (!key) return { fetched: 0, inserted: 0 };
    let results: ParallelResult[] = [];
    try {
      const body = (await postJson(PARALLEL_URL, { "x-api-key": key }, PARALLEL_BODY, PARALLEL_TIMEOUT_MS)) as { results?: ParallelResult[] };
      results = Array.isArray(body?.results) ? body.results : [];
    } catch (err) {
      console.warn(`[discovery] parallel search failed: ${err instanceof Error ? err.message : "unknown error"}`);
      return { fetched: 0, inserted: 0 };
    }
    const items: DiscoveredInput[] = parseAlleventsResults(results);
    const alleventsPages = results.filter((r) => /allevents\.in/.test(r.url ?? "")).length;
    if (alleventsPages > 0 && items.length === 0) {
      console.warn(`[discovery] parallel returned ${alleventsPages} allevents pages but parsed 0 allevents events; their page layout may have changed (convex/sources/parallel.ts)`);
    }
    // Facebook event pages Parallel found: Apify reads their full details (same mapper as the city search).
    const fbUrls = facebookEventUrls(results);
    const token = process.env.APIFY_TOKEN;
    if (fbUrls.length > 0 && token) {
      try {
        const rows = (await postJson(APIFY_URL, { Authorization: `Bearer ${token}` }, { searchQueries: [], startUrls: fbUrls.map((url) => ({ url })), maxEvents: fbUrls.length }, APIFY_TIMEOUT_MS)) as unknown[];
        for (const row of Array.isArray(rows) ? rows : []) {
          const mapped = mapApifyFacebook(row);
          if (mapped) items.push(mapped);
        }
      } catch (err) {
        console.warn(`[discovery] apify detail fetch failed: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    }
    return { fetched: items.length, inserted: await upsertAll(ctx, items) };
  },
});

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
