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
  /** The source gave a date but no time; startsAt is noon that day in Los Angeles. */
  allDay?: boolean;
}

export type Keyed = DiscoveredInput & { key: string };

export interface RankProfile {
  interests: string[];
  vibe: string;
  pastEvents: { title: string; category: string | null; feedback: string | null }[];
  // Display-safe colour for richer reasons (only on personas that have it): approved talking points, what they are
  // curious about, what they recently told their own Muse, and first names of their friends. Never the private notes.
  about?: string[];
  curious?: string[];
  recentChats?: string[];
  friends?: string[];
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
export const MAX_REASON = 340; // a few short sentences; the card shows them in a small speech bubble
export const POPULAR_REASON = "Popular near you, coming up soon."; // the window is 21 days
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

/** One row per event (exact key, or the same event worded differently: see sameEvent). A Facebook
 * record wins; empty fields are filled from the other sources. */
export function mergeDuplicates(items: DiscoveredInput[]): Keyed[] {
  const groups: DiscoveredInput[][] = [];
  for (const it of items) {
    const group = groups.find((g) => sameEvent(g[0], it));
    if (group) group.push(it);
    else groups.push([it]);
  }
  return groups.map((group) => {
    const primary = group.find((g) => g.source === "facebook") ?? group[0];
    const key = eventKey(primary);
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

/**
 * Drop a trailing HIGH SURROGATE left behind by slicing through an emoji.
 *
 * JavaScript slices by UTF-16 code unit, so cutting a model-written reason mid-emoji leaves half a
 * surrogate pair. That lone surrogate is not valid text: Convex serialises the query's return
 * value and the client then fails the WHOLE response with "Could not parse return value as json:
 * unexpected end of hex escape" — so one emoji in one reason took out the entire picks screen for
 * that viewer, with an error naming neither the field nor the event.
 */
const dropLoneSurrogate = (s: string) => {
  const last = s.charCodeAt(s.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? s.slice(0, -1) : s;
};

/** Keeps whole sentences up to MAX_REASON characters; one over-long sentence is cut at a word. */
export function clampReason(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= MAX_REASON) return t;
  const cut = dropLoneSurrogate(t.slice(0, MAX_REASON));
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end >= 60) return cut.slice(0, end + 1);
  const atSpace = cut.lastIndexOf(" ");
  const body = atSpace > 40 ? cut.slice(0, atSpace) : dropLoneSurrogate(cut.slice(0, MAX_REASON - 1));
  return `${body.replace(/[,;:\s]+$/, "")}.`;
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

/** "Sat 14 Nov · 7:30 PM" in Los Angeles time ("Sat 14 Nov · All day" when the source had no time). */
export function formatWhen(ms: number, allDay: boolean = false): string {
  const d = toLA(ms);
  if (allDay) return `${SHORT_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} · All day`;
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

/** One person going to a pick, with the one-liner for why they matter to the viewer. */
export interface GoingItem {
  id: string;
  name: string;
  initials: string;
  color: string;
  note: string;
  friend: boolean;
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

export function toPickView(e: Keyed, p: PickState, now: number, friendsGoing: CardPerson[] = [], totalGoing: number = friendsGoing.length, goingList: GoingItem[] = []) {
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
    goingCount: Math.max(totalGoing, friendsGoing.length), // everyone going; friendsGoing is just the viewer's friends
    goingList, // up to 5 of them, each with a one-liner for the viewer
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
    whenLabel: formatWhen(e.startsAt, e.allDay === true) as string | null,
    placeLabel: placeOf(e),
    // For the in-app event page; links to the source site are removed (picks read as Facebook events).
    description: cleanText(e.description).slice(0, DESCRIPTION_CHARS),
  };
}

const DESCRIPTION_CHARS = 1200;

function cleanText(s: string): string {
  return s.replace(URL_RE, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function soonest(candidates: Keyed[]): Keyed[] {
  return [...candidates].sort((a, b) => a.startsAt - b.startsAt || kmFromMenlo(a) - kmFromMenlo(b));
}

/** Keyword score and template reason for one candidate (the deterministic, no-Muse judgement). */
function scoreCandidate(profile: RankProfile, c: Keyed, now: number): PickDraft {
  const wanted = terms(profile);
  const pastCats = profile.pastEvents.filter((p) => p.category).map((p) => ({ cat: p.category!.toLowerCase(), title: p.title }));
  const hay = `${c.title} ${c.category ?? ""} ${c.description}`.toLowerCase();
  // Whole words only: "art" must not match "party".
  const has = (t: string) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay);
  const hit = wanted.find(has);
  const past = c.category ? pastCats.find((p) => p.cat === c.category!.toLowerCase()) : undefined;
  const matches = wanted.filter(has).length;
  const days = (c.startsAt - now) / DAY_MS;
  const score = matches * 3 + (past ? 2 : 0) - days * 0.1 - kmFromMenlo(c) * 0.02;
  const reason = hit
    ? `You're into ${hit}, and it's ${weekday(c.startsAt)}.`
    : past
      ? `Like ${past.title.slice(0, 40)}, which you went to.`
      : `It's ${weekday(c.startsAt)}, about ${Math.round(kmFromMenlo(c))} km away.`;
  return { key: c.key, verdict: hit || past ? "go" : "maybe", reason: clampReason(reason), score, kind: "personal" };
}

/** Deterministic picks when Muse is unavailable. No profile means "popular": soonest first. */
export function fallbackRank(profile: RankProfile | null, candidates: Keyed[], now: number): PickDraft[] {
  if (!profile) {
    return soonest(candidates)
      .slice(0, MAX_PICKS)
      .map((c, i) => ({ key: c.key, verdict: "maybe", reason: POPULAR_REASON, score: MAX_PICKS - i, kind: "popular" }));
  }
  return candidates
    .map((c) => scoreCandidate(profile, c, now))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PICKS);
}

// ---- what Muse sees, and how its answer is cleaned ----

export const MAX_CANDIDATES = 40;
const ABOUT_CHARS = 200;
const URL_RE = /https?:\/\/\S+|\b(?:www\.)?[\w-]+\.(?:com|ma|io|ai|org|net|co)\/\S*/gi;

/** The n candidates worth showing Muse: best keyword score first (soonest if there is no profile). */
export function preselect(profile: RankProfile | null, candidates: Keyed[], now: number, n: number = MAX_CANDIDATES): Keyed[] {
  if (!profile) return soonest(candidates).slice(0, n);
  const byKey = new Map(candidates.map((c) => [c.key, c]));
  return candidates
    .map((c) => scoreCandidate(profile, c, now))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((p) => byKey.get(p.key)!);
}

const RANK_SYSTEM = [
  "You are this person's Muse, choosing real public events near them that they would genuinely enjoy.",
  `Pick up to ${MAX_PICKS} events from the candidates, best first. Use only the person and candidate data given.`,
  `For each pick give verdict "go" (clearly their thing) or "maybe", and a reason of 3 to 5 short sentences, at most ${MAX_REASON} characters in total,`,
  "written to the person as 'you'. Make it specific and warm, drawing on whatever of these the data gives you: which of their friends are going",
  "(only the names in friendsGoing, never invent anyone), an interest or their vibe, something they recently told you (recentlyToldYou), a past event they went to,",
  "how it fits what they are curious about, and the day or distance. Never generic (not 'this may interest you'). Do not invent facts.",
  "Never mention prices you were not given or anything private.",
  'Reply as JSON: {"picks":[{"key":"<candidate key>","verdict":"go"|"maybe","reason":"..."}]}.',
].join(" ");

export function buildRankPrompt(profile: RankProfile, candidates: Keyed[], now: number, friendsGoing: Record<string, string[]> = {}) {
  const chosen = preselect(profile, candidates, now, MAX_CANDIDATES);
  return {
    system: RANK_SYSTEM,
    user: {
      person: {
        interests: profile.interests,
        vibe: profile.vibe,
        pastEvents: profile.pastEvents.map((p) => ({ title: p.title, category: p.category, howWasIt: p.feedback })),
        ...(profile.about?.length ? { aboutYou: profile.about } : {}),
        ...(profile.curious?.length ? { curiousAbout: profile.curious } : {}),
        ...(profile.recentChats?.length ? { recentlyToldYou: profile.recentChats } : {}),
        ...(profile.friends?.length ? { yourFriends: profile.friends } : {}),
      },
      candidates: chosen.map((c) => ({
        key: c.key,
        title: c.title,
        category: c.category,
        when: formatWhen(c.startsAt),
        city: (c.city ?? "").split(",")[0].trim(),
        price: c.price,
        about: c.description.replace(URL_RE, "").replace(/\s+/g, " ").trim().slice(0, ABOUT_CHARS),
        ...(friendsGoing[c.key]?.length ? { friendsGoing: friendsGoing[c.key] } : {}),
      })),
    },
  };
}

export interface RankResponseShape {
  picks: { key: string; verdict: "go" | "maybe"; reason: string }[];
}

/** Keep only real, unique candidates, at most MAX_PICKS, with safe reasons of at most 90 chars.
 * A leaking or empty reason falls back to the deterministic one; fewer than 3 picks are topped up. */
export function cleanRankResponse(resp: RankResponseShape, keys: Set<string>, fallback: PickDraft[], isLeak: (s: string) => boolean): PickDraft[] {
  const out: PickDraft[] = [];
  const seen = new Set<string>();
  for (const p of resp.picks ?? []) {
    if (out.length >= MAX_PICKS) break;
    if (!keys.has(p.key) || seen.has(p.key)) continue;
    let reason = clampReason(p.reason ?? "");
    if (!reason || isLeak(reason)) reason = fallback.find((f) => f.key === p.key)?.reason ?? "";
    if (!reason || isLeak(reason)) continue;
    seen.add(p.key);
    out.push({ key: p.key, verdict: p.verdict === "go" ? "go" : "maybe", reason, score: 100 - out.length, kind: "personal" });
  }
  if (out.length < 3) {
    for (const f of fallback) {
      if (out.length >= MAX_PICKS) break;
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      out.push({ ...f, score: 50 - out.length });
    }
  }
  return out;
}

// ---- who is going, and why each person matters to you ----

export const MAX_GOING_LISTED = 5;
export const MAX_GOING_NOTE = 130;

export interface GoingCandidate {
  id: string;
  name: string;
  initials: string;
  color: string;
  friend: boolean;
  // Event-safe only: what that person has approved sharing. Never their private notes.
  interests: string[];
  vibe: string;
  talkingPoints: string[];
}

const GOING_SYSTEM = [
  "You are this person's Muse. Some people are going to an event you recommended to them.",
  `For EACH person going, write ONE short line (at most ${MAX_GOING_NOTE} characters) saying why they matter to your person,`,
  "written to your person as 'you'. Use only the data given: interests you share, something your person recently told you (recentlyToldYou),",
  "that the person is your person's friend, or one of that person's approved talkingPoints. Be specific, not generic. Never invent facts,",
  "never mention anything private, and do not repeat the same line for two people.",
  'Reply as JSON: {"notes":[{"id":"<person id>","note":"..."}]}.',
].join(" ");

export function buildGoingPrompt(profile: RankProfile, ev: { title: string; category: string | null }, going: GoingCandidate[]) {
  return {
    system: GOING_SYSTEM,
    user: {
      event: { title: ev.title, category: ev.category },
      you: {
        interests: profile.interests,
        vibe: profile.vibe,
        ...(profile.about?.length ? { aboutYou: profile.about } : {}),
        ...(profile.recentChats?.length ? { recentlyToldYou: profile.recentChats } : {}),
        ...(profile.curious?.length ? { curiousAbout: profile.curious } : {}),
      },
      going: going.map((g) => ({
        id: g.id,
        name: g.name.split(" ")[0],
        isYourFriend: g.friend,
        theirInterests: g.interests,
        theirVibe: g.vibe,
        ...(g.talkingPoints.length ? { theirTalkingPoints: g.talkingPoints } : {}),
      })),
    },
  };
}

/** Deterministic one-liner (used when Muse is down or answers badly): shared interests, else friendship, else vibe. */
export function fallbackGoingNote(profile: RankProfile, g: GoingCandidate): string {
  const mine = new Set(profile.interests.map((i) => i.toLowerCase()));
  const shared = g.interests.filter((i) => mine.has(i.toLowerCase()));
  const first = g.name.split(" ")[0];
  if (shared.length) return `You and ${first} both like ${shared.slice(0, 2).join(" and ")}.`;
  if (g.friend) return `${first} is a friend of yours, so it would be easy company.`;
  return `${first}'s ${g.vibe.toLowerCase()} vibe could be a good match.`;
}

export function clampGoingNote(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= MAX_GOING_NOTE) return t;
  const cut = t.slice(0, MAX_GOING_NOTE - 1);
  const atSpace = cut.lastIndexOf(" ");
  return `${(atSpace > 40 ? cut.slice(0, atSpace) : cut).replace(/[,;:\s]+$/, "")}.`;
}

/** Keep one safe line per listed person: unknown ids and leaks fall back to the deterministic line. */
export function cleanGoingNotes(
  resp: { notes?: { id: string; note: string }[] },
  profile: RankProfile,
  going: GoingCandidate[],
  isLeak: (s: string) => boolean,
): GoingItem[] {
  const byId = new Map((resp.notes ?? []).map((n) => [n.id, n.note]));
  return going.slice(0, MAX_GOING_LISTED).map((g) => {
    let note = clampGoingNote(byId.get(g.id) ?? "");
    if (!note || isLeak(note)) note = fallbackGoingNote(profile, g);
    return { id: g.id, name: g.name, initials: g.initials, color: g.color, note, friend: g.friend };
  });
}

// ---- seeded history for demo personas ----

const PAST_FEEDBACK = ["Loved it, would go again.", "Good crowd, ran a bit long.", "Fun, met some new people."];
const PAST_FORMATS = ["meetup", "night", "workshop"];

/** 2-3 past events a demo persona went to, derived from their interests, so Muse can cite them. */
export function pastEventsFor(personaId: string, interests: string[]) {
  return interests.slice(0, 3).map((interest, i) => {
    const name = interest.charAt(0).toUpperCase() + interest.slice(1);
    return {
      personaId,
      title: `${name} ${PAST_FORMATS[i % PAST_FORMATS.length]}`,
      category: interest.toLowerCase(),
      when: Date.UTC(2026, 8 + (i % 2), 10 + i * 7, 2),
      feedback: PAST_FEEDBACK[i % PAST_FEEDBACK.length],
    };
  });
}

// ---- refresh button gate ----

export const REFRESH_GAP_MS = 60_000;

/** At most one manual refresh per person per minute. A future timestamp (clock skew) never locks it. */
export function canRefresh(lastAt: number | null, now: number): boolean {
  if (lastAt === null || lastAt > now) return true;
  return now - lastAt >= REFRESH_GAP_MS;
}

// ---- rules from the final review ----

/** A fallback run (Muse down or slow) never replaces picks Muse already wrote. */
export function shouldSavePicks(newSource: "muse" | "fallback", existingSources: string[]): boolean {
  return newSource === "muse" || !existingSources.includes("muse");
}

/** Do not offer events the person already answered (going, maybe, can't, snoozed). */
export function excludeAnswered(candidates: Keyed[], answered: Set<string>): Keyed[] {
  return candidates.filter((c) => !answered.has(c.key));
}

/** After a background fetch: the schedule re-ranks everyone; a manual refresh only re-ranks if
 * something new arrived, so cards do not reshuffle under the presenter for nothing. */
export function shouldRerankAfterFetch(personaId: string | undefined, inserted: number): boolean {
  return personaId === undefined || inserted > 0;
}

export function refreshDecision(o: { exists: boolean; lastAt: number | null; now: number }): "ok" | "too_soon" | "unknown" {
  if (!o.exists) return "unknown";
  return canRefresh(o.lastAt, o.now) ? "ok" : "too_soon";
}

const TITLE_STOPWORDS = new Set(["and", "the", "a", "an", "of", "at", "in", "for", "with", "to", "on"]);
const SAME_PLACE_KM = 8;

function titleTokens(title: string): Set<string> {
  const t = normTitle(title).replace(/\bsave the date\b/g, " ");
  return new Set(t.split(" ").filter((w) => w && !TITLE_STOPWORDS.has(w)));
}

/** Same real event listed by two sources: same local day, one title essentially contained in the
 * other, and (when both locations are known) within a few km. Exact keys are the fast path. */
export function sameEvent(a: DiscoveredInput, b: DiscoveredInput): boolean {
  if (laDay(a.startsAt) !== laDay(b.startsAt)) return false;
  if (eventKey(a) === eventKey(b)) return true;
  const ta = titleTokens(a.title);
  const tb = titleTokens(b.title);
  const shared = [...ta].filter((w) => tb.has(w)).length;
  const smaller = Math.min(ta.size, tb.size);
  if (smaller < 2 || shared / smaller < 0.8) return false;
  const pa = resolveCoords(a);
  const pb = resolveCoords(b);
  return !pa || !pb || distanceKm(pa, pb) <= SAME_PLACE_KM;
}

/** The stored row this incoming event duplicates, if any. */
export function findDuplicate(item: DiscoveredInput, rows: Keyed[]): Keyed | undefined {
  const key = eventKey(item);
  return rows.find((r) => r.key === key) ?? rows.find((r) => sameEvent(r, item));
}
