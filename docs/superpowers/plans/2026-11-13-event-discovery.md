# Muse Event Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill "Your agent's picks" with real nearby events, each with a Muse verdict and one short personal reason, refreshed on a schedule and on demand, and never empty.

**Architecture:** Two new Convex tables (`discoveredEvents` pool, per-person `picks`) beside the existing event model, which stays untouched. Pure logic (dedupe, qualify, fallback ranking, view mapping) lives in import-free files tested with `node --test`; Convex internal actions fetch sources and rank with `museJSON`; `feed.forViewer` appends picks to `recommended` in the existing card shape.

**Tech Stack:** Convex 1.49 (self-hosted, Node actions), Expo Router / React Native, zod, Muse API (`muse-ember-1.0`), Node 24 `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-13-event-discovery-design.md`

## Global Constraints

- Branch `keanu/event-discovery` off `main`; deploy only from an up-to-date `main` (manual deploy, CI is blocked).
- Every new public `query` / `mutation` / `action` calls `requireActor` (or another `convex/authz.ts` helper) or `tests/guardCoverage.test.mjs` fails. Background work uses `internalQuery` / `internalMutation` / `internalAction` only.
- Prompts may use only the approved Muse profile / `eventSafeProfile` and the person's own past events. Never `personas.memory`, `secrets`, `neverShare`, or other people's RSVPs.
- Reason: one sentence, at most 90 characters, names a concrete link (interest, vibe, past event, distance or time); passes `leaksIn(reason, persona) === false` (`convex/privacy.ts`).
- Qualify: starts within 21 days, within 55 km of Menlo Park (37.4529, -122.1817), not cancelled, not online-only. Up to 8 picks per person per run.
- No outside links (Luma, Eventbrite, allevents, facebook.com) rendered anywhere in the app; source URLs are stored only.
- Secrets only in Convex env (`APIFY_TOKEN`, `PARALLEL_API_KEY`, `PREPARED_MUSE_PROFILES`); never in git, logs or the bus.
- Display times in `America/Los_Angeles`.
- No em dashes in any authored text (team rule; a hook blocks them).
- Before the first commit that touches `convex/schema.ts`, `convex/feed.ts`, `components/events/SwipeCard.tsx` or `app/events/recommended.tsx`, post one line on the bus to all saying which file and why (shared files).
- Pure modules (`convex/discoveryCore.ts`, `convex/pickView.ts`, `convex/preparedProfiles.ts`) import nothing from `convex/_generated` or Node built-ins, so tests can import them directly.

## Review Focus

- **Same event from two sources** (Hack Radar Eventbrite row + Facebook row, slightly different titles/cities): one pick, Facebook record wins, empty fields filled from the other. Test in Task 1.
- **Muse returns keys not in the candidate list, duplicates, or more than 8 picks:** drop unknown and duplicate keys, cap at 8, top up from the fallback if fewer than 3 remain. Test in Task 4.
- **Event with only a city string** ("San Francisco, California" vs "San Francisco, CA", or an unknown city): known cities resolve to the same centre; unknown city without coordinates does not qualify. Test in Task 1.
- **Refresh tapped repeatedly or while a run is in flight:** at most one re-rank per person per 60 s, never clears existing picks. Test in Task 7.
- **Viewer is a real `fb_` user with no profile:** gets "popular nearby" picks (no personal reason) and `needsMuse: true`, never an empty list when the pool has events. Test in Task 6.

---

### Task 1: Pure discovery core

**Files:**
- Create: `convex/discoveryCore.ts`
- Test: `tests/discoveryCore.test.mjs`

**Interfaces:**
- Produces:
  - `type Source = "facebook" | "hackradar" | "parallel" | "allevents"`
  - `interface DiscoveredInput { source: Source; sourceId: string; url: string; title: string; description: string; startsAt: number; endsAt: number | null; venueName: string | null; address: string | null; city: string | null; lat: number | null; lng: number | null; organizer: string | null; imageUrl: string | null; category: string | null; price: "free" | "paid" | "unknown"; isOnline: boolean; isCancelled: boolean }`
  - `eventKey(e: Pick<DiscoveredInput, "title" | "startsAt" | "city">): string`
  - `mergeDuplicates(items: DiscoveredInput[]): (DiscoveredInput & { key: string })[]`
  - `resolveCoords(e: DiscoveredInput): { lat: number; lng: number } | null`
  - `qualifies(e: DiscoveredInput, now: number): boolean`
  - `distanceKm(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number`
  - `interface RankProfile { interests: string[]; vibe: string; pastEvents: { title: string; category: string | null; feedback: string | null }[] }`
  - `interface PickDraft { key: string; verdict: "go" | "maybe"; reason: string; score: number; kind: "personal" | "popular" }`
  - `fallbackRank(profile: RankProfile | null, candidates: (DiscoveredInput & { key: string })[], now: number): PickDraft[]` (max 8)
  - `clampReason(text: string): string` (one sentence, at most 90 chars, no trailing fragment)
  - constants `MENLO = { lat: 37.4529, lng: -122.1817 }`, `RADIUS_KM = 55`, `WINDOW_DAYS = 21`, `MAX_PICKS = 8`, `CITY_CENTRES: Record<string, {lat:number;lng:number}>` (Menlo Park, Palo Alto, Stanford, Mountain View, Redwood City, Sunnyvale, San Jose, Santa Clara, Cupertino, San Mateo, Oakland, Berkeley, San Francisco)

- [ ] **Step 1: Write the failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventKey, mergeDuplicates, qualifies, resolveCoords, fallbackRank, clampReason, MAX_PICKS } from "../convex/discoveryCore.ts";

const NOW = Date.UTC(2026, 10, 13, 18);
const ev = (o) => ({ source: "hackradar", sourceId: "1", url: "u", title: "Jazz Night", description: "", startsAt: NOW + 86400e3, endsAt: null, venueName: null, address: null, city: "Palo Alto", lat: null, lng: null, organizer: null, imageUrl: null, category: null, price: "unknown", isOnline: false, isCancelled: false, ...o });

test("key ignores case, punctuation, articles and city spelling", () => {
  assert.equal(eventKey(ev({ title: "The Jazz Night!", city: "San Francisco, CA" })), eventKey(ev({ title: "jazz night", city: "San Francisco, California" })));
});
test("duplicates merge, facebook record wins, empty fields filled", () => {
  const out = mergeDuplicates([ev({ source: "hackradar", imageUrl: "img" }), ev({ source: "facebook", sourceId: "fb", imageUrl: null })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "facebook");
  assert.equal(out[0].imageUrl, "img");
});
test("city-only events resolve; unknown city without coords does not qualify", () => {
  assert.ok(resolveCoords(ev({ city: "San Francisco, California" })));
  assert.equal(qualifies(ev({ city: "Atlantis" }), NOW), false);
});
test("qualify rules: window, radius, online, cancelled", () => {
  assert.equal(qualifies(ev({}), NOW), true);
  assert.equal(qualifies(ev({ startsAt: NOW + 22 * 86400e3 }), NOW), false);
  assert.equal(qualifies(ev({ startsAt: NOW - 3600e3 }), NOW), false);
  assert.equal(qualifies(ev({ city: "Sacramento", lat: 38.58, lng: -121.49 }), NOW), false);
  assert.equal(qualifies(ev({ isOnline: true }), NOW), false);
  assert.equal(qualifies(ev({ isCancelled: true }), NOW), false);
});
test("fallback ranks interest matches first with a concrete short reason", () => {
  const cands = mergeDuplicates([ev({ title: "Bowling social" }), ev({ title: "Tax seminar", sourceId: "2" })]);
  const picks = fallbackRank({ interests: ["bowling"], vibe: "lively", pastEvents: [] }, cands, NOW);
  assert.equal(picks[0].key, cands.find((c) => c.title === "Bowling social").key);
  assert.equal(picks[0].kind, "personal");
  assert.match(picks[0].reason, /bowling/i);
  assert.ok(picks[0].reason.length <= 90);
});
test("no profile means popular picks: soonest and closest, no personal claim", () => {
  const picks = fallbackRank(null, mergeDuplicates([ev({}), ev({ title: "Later", sourceId: "3", startsAt: NOW + 5 * 86400e3 })]), NOW);
  assert.ok(picks.every((p) => p.kind === "popular"));
  assert.equal(picks.length, 2);
  assert.ok(picks.length <= MAX_PICKS);
});
test("clampReason keeps one sentence within 90 characters", () => {
  const r = clampReason("You love jazz and this is ten minutes away. Also bring friends, there is a long story here that goes on.");
  assert.ok(r.length <= 90);
  assert.equal(r, "You love jazz and this is ten minutes away.");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/discoveryCore.test.mjs`
Expected: FAIL, cannot find module `../convex/discoveryCore.ts`.

- [ ] **Step 3: Implement `convex/discoveryCore.ts`** with the Interfaces above. `eventKey` = lowercased title with punctuation and leading "the/a/an" removed + `YYYY-MM-DD` of `startsAt` in America/Los_Angeles + city before the first comma, lowercased. `fallbackRank` scores: +3 per interest/vibe word found in title/category/description, +2 if category matches a past event's category, minus days until start * 0.1, minus km * 0.02; personal reasons use templates like `You're into ${interest}, and it's ${weekday}.`; popular picks get reason `Popular near you this week.` and verdict `maybe`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/discoveryCore.test.mjs` then `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/discoveryCore.ts tests/discoveryCore.test.mjs
git commit -m "feat(discovery): pure core for dedupe, qualify and fallback ranking"
```

---

### Task 2: Tables and the Hack Radar source

**Files:**
- Modify: `convex/schema.ts` (add three tables before `appMeta`)
- Create: `convex/discoveryData.ts` (internal mutations/queries), `convex/discoverySources.ts` (`"use node"` internal actions), `convex/sources/hackradar.ts` (pure mapper)
- Test: `tests/hackradar.test.mjs`, fixture `tests/fixtures/hackradar-events.json`

**Interfaces:**
- Consumes: `DiscoveredInput`, `mergeDuplicates`, `qualifies` (Task 1).
- Produces:
  - tables: `discoveredEvents` (all `DiscoveredInput` fields + `key: string`, `fetchedAt: number`; indexes `by_key`, `by_startsAt`); `picks` (`personaId`, `eventKey`, `verdict: "go"|"maybe"`, `reason`, `score`, `kind: "personal"|"popular"`, `status: "new"|"going"|"maybe"|"cant"|"snoozed"`, `snoozedUntil?: number`, `rankedAt`, `reasonSource: "muse"|"fallback"|"snapshot"`; indexes `by_persona` [`personaId`], `by_persona_key` [`personaId`,`eventKey`]); `pastEvents` (`personaId`, `title`, `category: string|null`, `when: number`, `feedback: string|null`; index `by_persona`).
  - `mapHackRadar(item: unknown): DiscoveredInput | null` in `convex/sources/hackradar.ts`
  - `internal.discoveryData.upsertMany({ items: DiscoveredInput[] }) -> { inserted: number; updated: number }` (merges by key, keeps Facebook record)
  - `internal.discoveryData.candidates({}) -> (DiscoveredInput & {key})[]` (qualifying, by `startsAt`)
  - `internal.discoverySources.fetchHackRadar({}) -> { fetched: number }`

- [ ] **Step 1: Capture a real fixture**

Run: `curl -fsS "https://hackradar.tech/api/discovery/v1/events?latitude=37.4529&longitude=-122.1817&radius_miles=35&limit=20" -o tests/fixtures/hackradar-events.json`
Expected: a JSON file with an events array; note the exact field names for the mapper (title, description, start/end, city, image, organizer, price, URL fields).

- [ ] **Step 2: Write the failing test**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapHackRadar } from "../convex/sources/hackradar.ts";

const raw = JSON.parse(readFileSync(new URL("./fixtures/hackradar-events.json", import.meta.url), "utf8"));
const items = Array.isArray(raw) ? raw : raw.events ?? raw.data ?? [];

test("every fixture row maps to a complete DiscoveredInput or null", () => {
  const mapped = items.map(mapHackRadar).filter(Boolean);
  assert.ok(mapped.length > 0);
  for (const e of mapped) {
    assert.equal(e.source, "hackradar");
    assert.ok(e.title && e.sourceId && Number.isFinite(e.startsAt));
    assert.ok(!/lu\.ma|eventbrite/.test(e.title));
    assert.ok(["free", "paid", "unknown"].includes(e.price));
  }
});
test("luma rows fall back to source_url when registration_url is empty", () => {
  const luma = items.find((i) => /lu\.ma/.test(JSON.stringify(i)));
  if (luma) assert.match(mapHackRadar(luma).url, /lu\.ma/);
});
test("garbage maps to null instead of throwing", () => {
  assert.equal(mapHackRadar({}), null);
  assert.equal(mapHackRadar(null), null);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test tests/hackradar.test.mjs`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement** `mapHackRadar`, the three tables, `discoveryData.upsertMany` / `candidates`, and `discoverySources.fetchHackRadar` (pages with `limit=100`, `offset`, up to 3 pages, 15 s timeout per request, `User-Agent: muse-events`; on any failure returns `{ fetched: 0 }` and logs one line).

- [ ] **Step 5: Verify**

Run: `npm test` and `npx tsc --noEmit -p .` (after `npx convex codegen --typecheck disable` with the self-hosted env)
Expected: all PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/discoveryData.ts convex/discoverySources.ts convex/sources/hackradar.ts tests/hackradar.test.mjs tests/fixtures/hackradar-events.json
git commit -m "feat(discovery): discoveredEvents/picks/pastEvents tables and Hack Radar source"
```

---

### Task 3: Picks on the page (fallback ranking), buttons and card lines

**Files:**
- Create: `convex/pickView.ts` (pure), `convex/picks.ts` (public `respond`), `convex/discoveryRank.ts` (`"use node"`)
- Modify: `convex/feed.ts` (`forViewer` appends picks), `components/events/SwipeCard.tsx`, `app/events/recommended.tsx`
- Test: `tests/pickView.test.mjs`

**Interfaces:**
- Consumes: tables and `candidates` (Task 2), `fallbackRank` (Task 1).
- Produces:
  - `toPickView(e: DiscoveredInput & {key: string}, p: { verdict: "go"|"maybe"; reason: string; kind: "personal"|"popular"; status: string; snoozedUntil?: number }, now: number)` returning every field of today's `buildView` result (`eventId: "pick:" + key`, `relation: "pick"`, `verdict: "worth"|"maybe"`, `reasons: [reason]`, `host: { id: "org", name: organizer ?? "Organizer", initials, color }`, `poster: imageUrl ? {url} : null`, `slotLabel: null`, `venue: null`, `priceTier: null`, `friendsGoing` (passed in by the caller: up to 3 of the viewer's friends whose pick for the same key has `status: "going"`; display only, never sent to Muse), `chips: []`, `matchPct`, `createdAt: startsAt`) plus `whenLabel: string` (e.g. `Sat 14 Nov · 7:30 PM`) and `placeLabel: string | null`.
  - `buildView` gains `whenLabel: null, placeLabel: null` so the union type stays uniform.
  - `forViewer` returns `{ recommended, feed, needsMuse: boolean }`; picks with `status === "new"` and not snoozed are appended to `recommended` after invited events.
  - `api.picks.respond({ personaId, key, action: "going"|"maybe"|"cant"|"snooze" })` (requireActor write; snooze = now + 1 h).
  - `internal.discoveryRank.rankPersona({ personaId, useMuse: boolean }) -> { picks: number; source: "muse"|"fallback" }` (Task 3 ships fallback only) and `internal.discoveryRank.rankAll({})`.

- [ ] **Step 1: Write the failing test** (`tests/pickView.test.mjs`): `toPickView` output has `eventId` starting `pick:`, `relation` `"pick"`, verdict `go` maps to `"worth"`, `reasons[0]` equals the reason, `whenLabel` equals `"Sat 14 Nov · 7:30 PM"` for `startsAt = Date.UTC(2026,10,15,3,30)`, `placeLabel` is `"Bing Concert Hall, Stanford"` when venueName and city are set, and no field contains `lu.ma`, `eventbrite` or `facebook.com`.
- [ ] **Step 2: Run** `node --test tests/pickView.test.mjs`; expected FAIL (module not found).
- [ ] **Step 3: Implement** `toPickView`, the `forViewer` append (load `picks` by `by_persona`, join `discoveredEvents` by key), `needsMuse` (= viewer id starts with `fb_` and has no approved `musePersonas` row), `picks.respond`, and `rankPersona` / `rankAll` writing up to 8 `picks` rows with `reasonSource: "fallback"` (replace only rows still `new`; keep answered ones).
- [ ] **Step 4: Client.** `SwipeCard`: when `ev.whenLabel` is set, the meta line shows `whenLabel` and `placeLabel` instead of the slot/price line. `recommended.tsx`: `answer()` calls `api.picks.respond` with `key = eventId.slice(5)` when `current.relation === "pick"`, else today's `feed.respond`; `open()` routes picks to `/picks/${key}` (screen arrives in Task 5; until then it is a no-op for picks).
- [ ] **Step 5: Verify** `npm test` (guardCoverage covers `picks.respond`), `tsc` 0 errors, then deploy from `main` and run `npx convex run discoverySources:fetchHackRadar` and `npx convex run discoveryRank:rankAll`; on the simulator, Maya's picks page shows real events with date and place.
- [ ] **Step 6: Commit** `feat(discovery): picks in the swipe stack with fallback reasons`.

---

### Task 4: Past events and Muse reasons

**Files:**
- Create: `convex/pastEventsSeed.ts` (internalMutation `seedPastEvents`, idempotent), `convex/rankPrompt.ts` (pure: prompt builder + response cleaner)
- Modify: `convex/discoveryRank.ts`
- Test: `tests/rankPrompt.test.mjs`

**Interfaces:**
- Consumes: `RankProfile`, `PickDraft`, `fallbackRank`, `clampReason` (Task 1); `museJSON` (`convex/muse.ts`); `leaksIn` (`convex/privacy.ts`); `internal.musePersonas.approvedForPersonas`.
- Produces:
  - `buildRankPrompt(profile: RankProfile, candidates: (DiscoveredInput & {key})[]): { system: string; user: unknown }` (candidates trimmed to key, title, category, whenLabel, city, 200-char description; max 40)
  - `RankResponse = z.object({ picks: z.array(z.object({ key: z.string(), verdict: z.enum(["go","maybe"]), reason: z.string() })) })`
  - `cleanRankResponse(resp, candidateKeys: Set<string>, fallback: PickDraft[], isLeak: (s: string) => boolean): PickDraft[]`
  - `seedPastEvents` writes 2-3 `pastEvents` rows for each seeded persona with `hasMuse`, derived from that persona's interests (title, category, a date in Sep/Oct 2026, a one-line "How was it?" feedback).

- [ ] **Step 1: Write the failing tests**: prompt user payload contains no `memory`, `secrets`, `neverShare` keys and at most 40 candidates; `cleanRankResponse` drops unknown keys and duplicates, caps at 8, clamps reasons to 90 chars, replaces a leaking reason with the fallback reason for that key, and tops up from `fallback` when fewer than 3 remain.
- [ ] **Step 2: Run** `node --test tests/rankPrompt.test.mjs`; expected FAIL.
- [ ] **Step 3: Implement** `buildRankPrompt` (system text says: pick up to 8 events this person would genuinely enjoy; one sentence reason of at most 90 characters naming a concrete link to them; never generic; never mention other people), `cleanRankResponse`, `seedPastEvents`; switch `rankPersona` to `museJSON({ model: "ember", effort: "low", budget, schema: RankResponse, fallback })` with `reasonSource: "muse"` when live; `rankAll` shares one budget `{ used: 0, max: personaCount }` and runs at most 5 personas at a time.
- [ ] **Step 4: Verify** `npm test`, `tsc`; deploy; `npx convex run pastEventsSeed:seedPastEvents`, `npx convex run discoveryRank:rankAll`; Maya's reasons are personal and at most 90 characters (check 5 in the data browser).
- [ ] **Step 5: Commit** `feat(discovery): Muse-written reasons from interests and past events`.

---

### Task 5: In-app event page for a pick

**Files:**
- Create: `app/picks/[key].tsx`
- Modify: `convex/picks.ts` (add `detail`), `app/events/recommended.tsx` (open route), the Discover feed card tap in `app/events/feed.tsx` for `relation === "pick"`
- Test: extend `tests/pickView.test.mjs`

**Interfaces:**
- Consumes: `toPickView` (Task 3).
- Produces: `api.picks.detail({ personaId, key }) -> (PickView & { description: string }) | null` (requireActor read; null when the key is unknown).

- [ ] **Step 1: Failing test**: `toPickView(...).description` is the event description trimmed to 1,200 chars with no URLs (strip `https?://\S+`).
- [ ] **Step 2: Run** the test; expected FAIL.
- [ ] **Step 3: Implement** `picks.detail` and the screen in the existing event page style: cover image, title, whenLabel, placeLabel, organizer as host, description, Muse's reason labelled as from Muse, Going / Maybe / Can't calling `picks.respond`. No outside link. Loading state shows a skeleton, an unknown key shows "This event is no longer available" with a back button.
- [ ] **Step 4: Verify** tests, `tsc`, and on the simulator tapping a pick from the stack and from Discover opens this page.
- [ ] **Step 5: Commit** `feat(discovery): Facebook-style event page for picks`.

---

### Task 6: Never-empty: snapshot, prepared profiles, popular nearby

**Files:**
- Create: `convex/preparedProfiles.ts` (pure), `convex/demoSnapshot.ts` (data), `scripts/export-demo-snapshot.mjs`
- Modify: `convex/museAdapter.ts` (`readMuseContext`), `convex/discoveryRank.ts`, `convex/feed.ts` (snapshot fallback), `app/events/recommended.tsx` (Connect your Muse prompt)
- Test: `tests/preparedProfiles.test.mjs`

**Interfaces:**
- Produces:
  - `parsePreparedProfiles(json: string | undefined): Record<string, { interests: string[]; vibe: string; pastEvents: { title: string; category: string | null; feedback: string | null }[] }>` (bad JSON returns `{}`)
  - `museContextFromPrepared(name: string, prof): MuseRawContext` (same text shape `demoMuseContext` produces, so `extractShareableProfile` parses it)
  - `readMuseContext(persona)` uses `parsePreparedProfiles(process.env.PREPARED_MUSE_PROFILES)[persona.id]` when present, else today's `demoMuseContext`.
  - `DEMO_SNAPSHOT: { personaId: string; events: DiscoveredInput[]; picks: PickDraft[] }[]`, loaded by `internal.discoveryData.loadSnapshot({})` for demo personas with zero picks; `forViewer` triggers nothing, the cron and a manual `npx convex run discoveryData:loadSnapshot` do.
  - `rankPersona` for an `fb_` persona with no approved profile uses `fallbackRank(null, ...)` (popular).

- [ ] **Step 1: Failing tests**: `parsePreparedProfiles("not json")` is `{}`; a valid map round-trips; `extractShareableProfile(museContextFromPrepared("Keanu", prof)).interests` equals `prof.interests`.
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement**; the picks page shows a "Connect your Muse for picks that fit you" banner above the stack when `needsMuse` is true, opening the account sheet.
- [ ] **Step 4: Verify** tests and `tsc`; set `PREPARED_MUSE_PROFILES` (Keanu's values, via `npx convex env set` with the value piped in, never echoed); on the simulator, Keanu logs in, taps Connect my Muse, approves, refreshes, and sees personal picks; before approving he sees popular picks and the banner.
- [ ] **Step 5: Commit** `feat(discovery): prepared Muse profiles, popular picks and demo snapshot`.

---

### Task 7: Refresh button and schedule

**Files:**
- Create: `convex/crons.ts`
- Modify: `convex/picks.ts` (public `refresh` action), `app/events/recommended.tsx` (header button)
- Test: `tests/refreshGate.test.mjs` (pure gate in `convex/discoveryCore.ts`: `canRefresh(lastAt: number | null, now: number): boolean`, 60 s)

**Interfaces:**
- Produces: `api.picks.refresh({ personaId }) -> { status: "ranked" | "too_soon"; picks: number }` (requireActor write; checks `appMeta` key `refresh:<personaId>`; re-ranks from the pool now, then `ctx.scheduler.runAfter(0, internal.discoverySources.fetchAll, {})`); `internal.discoverySources.fetchAll({})` runs every source with its own try/catch, then schedules `rankAll`; `crons.ts`: `crons.interval("discover events", { hours: 6 }, internal.discoverySources.fetchAll, {})`.

- [ ] **Step 1: Failing test**: `canRefresh(null, t)` true; `canRefresh(t - 30e3, t)` false; `canRefresh(t - 61e3, t)` true.
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement**; the header button shows a spinner and "Muse is looking..." while the action runs, the list stays rendered, `too_soon` shows nothing new.
- [ ] **Step 4: Verify** tests, `tsc`, guardCoverage; on the simulator, tapping refresh twice within a minute returns `too_soon` the second time and the list never empties.
- [ ] **Step 5: Commit** `feat(discovery): refresh button and 6-hourly discovery`.

---

### Task 8: Facebook events via Apify (needs `APIFY_TOKEN`)

**Files:**
- Create: `convex/sources/apifyFacebook.ts` (pure mapper), fixture `tests/fixtures/apify-facebook-events.json`
- Modify: `convex/discoverySources.ts` (`fetchApifyFacebook`, added to `fetchAll`)
- Test: `tests/apifyFacebook.test.mjs`

**Interfaces:**
- Produces: `mapApifyFacebook(item: unknown): DiscoveredInput | null`; `internal.discoverySources.fetchApifyFacebook({}) -> { fetched: number }` calling `POST https://api.apify.com/v2/acts/apify~facebook-events-scraper/run-sync-get-dataset-items` with input `{ searchQueries: ["events"], ... city search for Menlo Park, Palo Alto, Mountain View, Stanford, Redwood City, maxEvents: 60 }` (confirm input field names on the actor page when writing), 120 s timeout, token from `process.env.APIFY_TOKEN`; skipped with `{ fetched: 0 }` when the token is unset.

- [ ] **Step 1:** Capture a fixture with one small run (Keanu's token in the shell only) into `tests/fixtures/apify-facebook-events.json`; remove any attendee names or personal data from the fixture before committing.
- [ ] **Step 2: Failing test**: every row maps with `source: "facebook"`, finite `startsAt`, coordinates when the fixture has them; garbage maps to null.
- [ ] **Step 3: Run**; expected FAIL. **Step 4: Implement.** **Step 5: Verify** tests, `tsc`, deploy, `npx convex run discoverySources:fetchApifyFacebook`, Facebook rows win merges.
- [ ] **Step 6: Commit** `feat(discovery): public Facebook events via Apify`.

---

### Task 9: Parallel and allevents (needs `PARALLEL_API_KEY`)

**Files:**
- Create: `convex/sources/parallel.ts` (pure mapper), fixture `tests/fixtures/parallel-search.json`
- Modify: `convex/discoverySources.ts` (`fetchParallel`, added to `fetchAll`)
- Test: `tests/parallel.test.mjs`

**Interfaces:**
- Produces: `mapParallelResult(r: unknown): DiscoveredInput | null` (keeps only results with a parseable date in the window and a city; title from the page title; source `parallel` or `allevents` by URL host); `internal.discoverySources.fetchParallel({}) -> { fetched: number }` using Parallel's server Search API (check the current endpoint and auth header in Parallel's docs when writing), queries for facebook.com/events and allevents.in pages in the five Peninsula cities.

- [ ] Steps as in Task 8: fixture, failing mapper test, implement, verify, commit `feat(discovery): Parallel and allevents sources`.

---

## After each shippable task (3 to 9)

Merge `keanu/event-discovery` into `main` (or PR when CI works), deploy with `scratchpad/convex/deploy_main.py` (it refuses if something live is missing from `main`), and post one line on the bus listing new public functions and any env var a teammate needs.
