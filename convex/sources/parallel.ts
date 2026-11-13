// Parallel /v1/search results -> (1) allevents events parsed from listing excerpts and (2) canonical
// facebook.com event URLs, which fetchParallel hands to Apify (startUrls) for full details.
// Pure: no Convex or Node imports; tested against a real response in tests/parallel.test.mjs.
import type { DiscoveredInput } from "../discoveryCore";

export interface ParallelResult {
  url?: string;
  title?: string;
  excerpts?: string[];
}

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

// One listing block: "Sun, 15 Nov, 2026 - 04:00 PM", then "[### Title](https://allevents.in/<city>/<slug>/<id> "...")",
// then the venue line, then an optional price line ("Free" or "USD 10").
const BLOCK_RE =
  /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec), (\d{4}) - (\d{2}):(\d{2}) (AM|PM)\s*\n\s*\[### ([^\]\n]+)\]\((https:\/\/allevents\.in\/([a-z-]+)\/[^\s)"]*?\/(\d{6,}))[^)]*\)\s*\n\s*([^\n*]+?)\s*\n(?:\s*\n)?(?:\s*(Free|USD [\d.,]+)\s*\n)?/g;

// Detail layout: "### [Title](url ...)", then "Date and Time" and the date, then "Location" and
// "Venue, street, city, country".
const DETAIL_RE =
  /### \[([^\]\n]+)\]\((https:\/\/allevents\.in\/([a-z-]+)\/[^\s)"]*?\/(\d{6,}))[^)]*\)\s*\n\s*Date and Time\s*\n\s*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec), (\d{4}) - (\d{2}):(\d{2}) (AM|PM)(?:\s*\n\s*Location\s*\n\s*([^\n]+))?/g;

/** UTC ms for a Los Angeles wall-clock time (DST: 2nd Sunday of March to 1st Sunday of November). */
function laWallToUtc(y: number, mo: number, d: number, h: number, mi: number): number {
  const wall = Date.UTC(y, mo, d, h, mi);
  const sunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return Date.UTC(y, month, 1 + ((7 - first) % 7) + 7 * (n - 1), 2);
  };
  const dst = wall >= sunday(2, 2) && wall < sunday(10, 1);
  return wall + (dst ? 7 : 8) * 3_600_000;
}

function cityFromSlug(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

interface Block {
  id: string;
  url: string;
  citySlug: string;
  title: string;
  day: string;
  mon: string;
  year: string;
  hh: string;
  mm: string;
  ampm: string;
  venue: string | null;
  address: string | null;
  price: string | null;
}

function toEvent(b: Block): DiscoveredInput {
  const h12 = Number(b.hh) % 12;
  const hour = b.ampm === "PM" ? h12 + 12 : h12;
  return {
    source: "allevents",
    sourceId: b.id,
    url: b.url,
    title: b.title.trim(),
    description: "",
    startsAt: laWallToUtc(Number(b.year), MONTHS[b.mon], Number(b.day), hour, Number(b.mm)),
    endsAt: null,
    venueName: b.venue,
    address: b.address,
    city: cityFromSlug(b.citySlug),
    lat: null,
    lng: null,
    organizer: null,
    imageUrl: null,
    category: null,
    price: b.price === "Free" ? "free" : b.price ? "paid" : "unknown",
    isOnline: false,
    isCancelled: false,
  };
}

/** "Free" or "USD 10": a price line, which a block without a venue line puts where the venue goes. */
function isPrice(s: string | undefined): boolean {
  return /^\s*(Free|USD [\d.,]+)\s*$/.test(s ?? "");
}

/** A truncated excerpt leaves "..." where the venue was; that is not a venue. */
function realLine(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  return t && !/^\.{2,}$/.test(t) ? t : null;
}

/** Events from allevents listing pages in the results (both layouts), de-duplicated by allevents id. */
export function parseAlleventsResults(results: ParallelResult[]): DiscoveredInput[] {
  const byId = new Map<string, DiscoveredInput>();
  for (const r of results ?? []) {
    if (!r?.url || !/allevents\.in/.test(r.url)) continue;
    const text = (r.excerpts ?? []).join("\n");
    for (const m of text.matchAll(BLOCK_RE)) {
      const [, day, mon, year, hh, mm, ampm, title, url, citySlug, id, venue, price] = m;
      if (!byId.has(id)) byId.set(id, toEvent({ id, url, citySlug, title, day, mon, year, hh, mm, ampm, venue: isPrice(venue) ? null : realLine(venue), address: null, price: price ?? (isPrice(venue) ? venue.trim() : null) }));
    }
    for (const m of text.matchAll(DETAIL_RE)) {
      const [, title, url, citySlug, id, day, mon, year, hh, mm, ampm, location] = m;
      if (byId.has(id)) continue;
      const loc = realLine(location);
      const comma = loc ? loc.indexOf(",") : -1;
      byId.set(id, toEvent({
        id, url, citySlug, title, day, mon, year, hh, mm, ampm,
        venue: loc ? (comma > 0 ? loc.slice(0, comma) : loc) : null,
        address: loc && comma > 0 ? loc.slice(comma + 1).trim() : null,
        price: null,
      }));
    }
  }
  return [...byId.values()];
}

/** Canonical https://www.facebook.com/events/<id>/ URLs among the results (pages and groups skipped). */
export function facebookEventUrls(results: ParallelResult[]): string[] {
  const ids = new Set<string>();
  for (const r of results ?? []) {
    const m = r?.url ? /facebook\.com\/events\/(?:[^?#]*\/)?(\d{6,})\/?(?:[?#]|$)/.exec(r.url) : null;
    if (m) ids.add(m[1]);
  }
  return [...ids].map((id) => `https://www.facebook.com/events/${id}/`);
}
