// Pure event-discovery logic: dedupe, the "does it qualify" rule and the no-Muse fallback ranker.
// No imports, so tests/discoveryCore.test.mjs can load it with plain `node --test`, and the same
// code runs inside Convex functions. Dates are handled in America/Los_Angeles by hand (no Intl), so
// behaviour does not depend on which runtime has full ICU data.

export type Source = "facebook" | "hackradar" | "parallel" | "allevents";

export interface DiscoveredInput {
  source: Source;
  sourceId: string;
  url: string;
  title: string;
  description: string;
  startsAt: number;
  endsAt: number | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  organizer: string | null;
  imageUrl: string | null;
  category: string | null;
  price: "free" | "paid" | "unknown";
  isOnline: boolean;
  isCancelled: boolean;
}

export type Keyed = DiscoveredInput & { key: string };

export interface RankProfile {
  interests: string[];
  vibe: string;
  pastEvents: { title: string; category: string | null; feedback: string | null }[];
}

export interface PickDraft {
  key: string;
  verdict: "go" | "maybe";
  reason: string;
  score: number;
  kind: "personal" | "popular";
}

export const MENLO = { lat: 37.4529, lng: -122.1817 };
export const RADIUS_KM = 55;
export const WINDOW_DAYS = 21;
export const MAX_PICKS = 8;
export const MAX_REASON = 90;
export const POPULAR_REASON = "Popular near you this week.";
const DAY_MS = 86_400_000;

export const CITY_CENTRES: Record<string, { lat: number; lng: number }> = {
  "menlo park": { lat: 37.4529, lng: -122.1817 },
  "palo alto": { lat: 37.4419, lng: -122.143 },
  stanford: { lat: 37.4275, lng: -122.1697 },
  "mountain view": { lat: 37.3861, lng: -122.0839 },
  "redwood city": { lat: 37.4852, lng: -122.2364 },
  sunnyvale: { lat: 37.3688, lng: -122.0363 },
  "san jose": { lat: 37.3382, lng: -121.8863 },
  "santa clara": { lat: 37.3541, lng: -121.9552 },
  cupertino: { lat: 37.323, lng: -122.0322 },
  "san mateo": { lat: 37.563, lng: -122.3255 },
  oakland: { lat: 37.8044, lng: -122.2712 },
  berkeley: { lat: 37.8715, lng: -122.273 },
  "san francisco": { lat: 37.7749, lng: -122.4194 },
};

// ---- Pacific time without Intl ----

/** UTC ms of the nth Sunday of a month at 10:00 UTC (= 2am local transition, close enough for dates). */
function nthSunday(year: number, month: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (7 - first.getUTCDay()) % 7;
  return Date.UTC(year, month, 1 + offset + 7 * (n - 1), 10);
}

/** Hours to add to UTC for America/Los_Angeles (DST: 2nd Sunday of March to 1st Sunday of November). */
export function laOffsetHours(ms: number): number {
  const y = new Date(ms).getUTCFullYear();
  return ms >= nthSunday(y, 2, 2) && ms < nthSunday(y, 10, 1) ? -7 : -8;
}

/** A Date whose UTC fields read as Los Angeles wall-clock time. */
export function toLA(ms: number): Date {
  return new Date(ms + laOffsetHours(ms) * 3_600_000);
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function laDay(ms: number): string {
  return toLA(ms).toISOString().slice(0, 10);
}

// ---- keys and dedupe ----

function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

export function cityKey(city: string | null): string {
  return (city ?? "").split(",")[0].trim().toLowerCase();
}

export function eventKey(e: Pick<DiscoveredInput, "title" | "startsAt" | "city">): string {
  return `${normTitle(e.title)}|${laDay(e.startsAt)}|${cityKey(e.city)}`;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

/** One row per event. A Facebook record wins; empty fields are filled from the other sources. */
export function mergeDuplicates(items: DiscoveredInput[]): Keyed[] {
  const groups = new Map<string, DiscoveredInput[]>();
  for (const it of items) {
    const k = eventKey(it);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const primary = group.find((g) => g.source === "facebook") ?? group[0];
    const merged: Record<string, unknown> = { ...primary };
    for (const other of group) {
      for (const [field, value] of Object.entries(other)) {
        if (isEmpty(merged[field]) && !isEmpty(value)) merged[field] = value;
      }
    }
    return { ...(merged as unknown as DiscoveredInput), key };
  });
}

// ---- qualify ----

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function resolveCoords(e: DiscoveredInput): { lat: number; lng: number } | null {
  if (typeof e.lat === "number" && typeof e.lng === "number") return { lat: e.lat, lng: e.lng };
  return CITY_CENTRES[cityKey(e.city)] ?? null;
}

export function qualifies(e: DiscoveredInput, now: number): boolean {
  if (e.isOnline || e.isCancelled) return false;
  if (!(e.startsAt > now && e.startsAt <= now + WINDOW_DAYS * DAY_MS)) return false;
  const at = resolveCoords(e);
  return at !== null && distanceKm(MENLO, at) <= RADIUS_KM;
}

// ---- reasons and the fallback ranker ----

export function clampReason(text: string): string {
  const first = text.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  if (first.length <= MAX_REASON) return first;
  const cut = first.slice(0, MAX_REASON - 1);
  const atSpace = cut.lastIndexOf(" ");
  return `${(atSpace > 40 ? cut.slice(0, atSpace) : cut).replace(/[,;:\s]+$/, "")}.`;
}

function terms(profile: RankProfile): string[] {
  const words = [...profile.interests, ...profile.vibe.split(/[^a-zA-Z]+/)]
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3);
  return [...new Set(words)];
}

function weekday(ms: number): string {
  return WEEKDAYS[toLA(ms).getUTCDay()];
}

function kmFromMenlo(e: DiscoveredInput): number {
  const at = resolveCoords(e);
  return at ? distanceKm(MENLO, at) : RADIUS_KM;
}

// ---- card view (same shape feed.forViewer returns for invited events) ----

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ORG_COLORS = ["#1877F2", "#E4405F", "#2E7D32", "#F57C00", "#6A1B9A", "#00838F"];

/** "Sat 14 Nov · 7:30 PM" in Los Angeles time. */
export function formatWhen(ms: number): string {
  const d = toLA(ms);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${SHORT_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} · ${h12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

export interface PickState {
  verdict: "go" | "maybe";
  reason: string;
  kind: "personal" | "popular";
  status: string;
  snoozedUntil?: number;
}

export interface CardPerson {
  id: string;
  name: string;
  initials: string;
  color: string;
}

function organizerCard(name: string | null): CardPerson {
  const label = name ?? "Organizer";
  const initials = label.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "O";
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { id: "org", name: label, initials, color: ORG_COLORS[h % ORG_COLORS.length] };
}

function placeOf(e: DiscoveredInput): string | null {
  const city = (e.city ?? "").split(",")[0].trim() || null;
  if (e.venueName && city) return `${e.venueName}, ${city}`;
  return e.venueName ?? city;
}

export function toPickView(e: Keyed, p: PickState, now: number, friendsGoing: CardPerson[] = []) {
  const snoozed = p.status === "snoozed" && typeof p.snoozedUntil === "number" && p.snoozedUntil > now;
  return {
    eventId: `pick:${e.key}`,
    title: e.title,
    status: "sent",
    poster: e.imageUrl ? { url: e.imageUrl } : null,
    host: organizerCard(e.organizer),
    slotLabel: null as string | null,
    venue: null as { name: string; area: string } | null,
    priceTier: null as 1 | 2 | 3 | null,
    vibe: null as string | null,
    purpose: null as string | null,
    tags: e.category ? [e.category] : [],
    goingCount: friendsGoing.length,
    capacity: null as number | null,
    spotsLeft: null as number | null,
    relation: "pick" as const,
    myStatus: p.status === "new" ? null : p.status,
    snoozed,
    goIfFriend: null as string | null,
    verdict: (p.verdict === "go" ? "worth" : "maybe") as "worth" | "maybe" | "skip" | null,
    reasons: [p.reason],
    matchPct: p.verdict === "go" ? 78 : 55,
    friendsGoing: friendsGoing.slice(0, 3),
    chips: [] as { kind: "people" | "goal" | "fit" | "plan"; text: string }[],
    createdAt: e.startsAt,
    whenLabel: formatWhen(e.startsAt) as string | null,
    placeLabel: placeOf(e),
  };
}

/** Deterministic picks when Muse is unavailable. No profile means "popular": soonest first. */
export function fallbackRank(profile: RankProfile | null, candidates: Keyed[], now: number): PickDraft[] {
  if (!profile) {
    return [...candidates]
      .sort((a, b) => a.startsAt - b.startsAt || kmFromMenlo(a) - kmFromMenlo(b))
      .slice(0, MAX_PICKS)
      .map((c, i) => ({ key: c.key, verdict: "maybe", reason: POPULAR_REASON, score: MAX_PICKS - i, kind: "popular" }));
  }
  const wanted = terms(profile);
  const pastCats = profile.pastEvents.filter((p) => p.category).map((p) => ({ cat: p.category!.toLowerCase(), title: p.title }));
  const scored = candidates.map((c) => {
    const hay = `${c.title} ${c.category ?? ""} ${c.description}`.toLowerCase();
    const hit = wanted.find((t) => hay.includes(t));
    const past = c.category ? pastCats.find((p) => p.cat === c.category!.toLowerCase()) : undefined;
    const matches = wanted.filter((t) => hay.includes(t)).length;
    const days = (c.startsAt - now) / DAY_MS;
    const score = matches * 3 + (past ? 2 : 0) - days * 0.1 - kmFromMenlo(c) * 0.02;
    const km = Math.round(kmFromMenlo(c));
    const reason = hit
      ? `You're into ${hit}, and it's ${weekday(c.startsAt)}.`
      : past
        ? `Like ${past.title.slice(0, 40)}, which you went to.`
        : `It's ${weekday(c.startsAt)}, about ${km} km away.`;
    const pick: PickDraft = { key: c.key, verdict: hit || past ? "go" : "maybe", reason: clampReason(reason), score, kind: "personal" };
    return pick;
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, MAX_PICKS);
}
