// Event discovery: fetch real nearby events from outside sources into the pool. Internal actions
// only. Each source has its own timeout and never throws, so one failing source cannot stop the
// others or the ranker (design: "never empty").
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { MENLO } from "./discoveryCore";
import { mapHackRadar } from "./sources/hackradar";
import { mapApifyFacebook } from "./sources/apifyFacebook";
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
    const sources = [
      ["hackradar", internal.discoverySources.fetchHackRadar, 15 * 60_000],
      ["apify-facebook", internal.discoverySources.fetchApifyFacebook, 60 * 60_000],
    ] as const;
    for (const [name, fn, minGapMs] of sources) {
      try {
        // Refresh taps must not re-run a source (Apify is paid per event) more often than its gap.
        if (!(await ctx.runMutation(internal.discoveryData.claimSourceRun, { source: name, minGapMs }))) {
          fetched[name] = 0;
          continue;
        }
        fetched[name] = (await ctx.runAction(fn, {})).fetched;
      } catch (err) {
        console.warn(`[discovery] ${name} failed: ${err instanceof Error ? err.message : "unknown error"}`);
        fetched[name] = 0;
      }
    }
    if (personaId) await ctx.runAction(internal.discoveryRank.rankPersona, { personaId });
    else await ctx.runAction(internal.discoveryRank.rankAll, {});
    await ctx.runMutation(internal.discoveryData.loadSnapshot, {});
    return { fetched };
  },
});

export const fetchHackRadar = internalAction({
  args: {},
  handler: async (ctx): Promise<{ fetched: number }> => {
    let items: DiscoveredInput[] = [];
    try {
      items = await fetchHackRadarItems();
    } catch (err) {
      console.warn(`[discovery] hackradar fetch failed: ${err instanceof Error ? err.message : "unknown error"}`);
      return { fetched: 0 };
    }
    for (let i = 0; i < items.length; i += UPSERT_CHUNK) {
      await ctx.runMutation(internal.discoveryData.upsertMany, { items: items.slice(i, i + UPSERT_CHUNK) });
    }
    return { fetched: items.length };
  },
});

// ---- public Facebook events via Apify (apify/facebook-events-scraper) ----

const APIFY_URL = "https://api.apify.com/v2/acts/apify~facebook-events-scraper/run-sync-get-dataset-items?timeout=240";
const APIFY_SEARCHES = ["Palo Alto", "Menlo Park", "Mountain View", "Redwood City", "Stanford University", "San Francisco"];
const APIFY_MAX_PER_SEARCH = 20;
const APIFY_TIMEOUT_MS = 270_000;

export const fetchApifyFacebook = internalAction({
  args: {},
  handler: async (ctx): Promise<{ fetched: number }> => {
    const token = process.env.APIFY_TOKEN;
    if (!token) return { fetched: 0 };
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
      return { fetched: 0 };
    } finally {
      clearTimeout(timer);
    }
    const items = rows.map(mapApifyFacebook).filter((e): e is DiscoveredInput => e !== null);
    for (let i = 0; i < items.length; i += UPSERT_CHUNK) {
      await ctx.runMutation(internal.discoveryData.upsertMany, { items: items.slice(i, i + UPSERT_CHUNK) });
    }
    return { fetched: items.length };
  },
});
