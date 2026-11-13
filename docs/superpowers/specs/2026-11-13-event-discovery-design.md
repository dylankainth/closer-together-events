# Muse event discovery: real nearby events in "Your agent's picks"

Status: design, awaiting Keanu's approval. Owner: Keanu. Date: Fri 13 Nov 2026 (submission 10:30 PT).

## Intent

On stage, the story is "your Muse quietly browses public Facebook events for you and brings back
a few that fit you, each with one honest reason". Today the picks page ("Your agent's picks",
`app/events/recommended.tsx`) only shows events a seeded host invited you to, with fixed or
huddle-made reasons, so it is often empty ("You're all caught up").

This feature fills it with real upcoming events near the venue (Menlo Park / Palo Alto / Stanford),
chosen per person by Muse from their interests and the events they went to, and keeps it filled.

Why it matters: it is the attendee half of the pitch ("raise the probability a person attends")
working on real data, and it must survive a live demo on venue wifi.

## Goals (in Keanu's priority order)

1. **Personal picks with a short reason.** For each person, Muse picks events that fit and gives a
   verdict (Go / Maybe) plus one short reason (one sentence, roughly 90 characters at most). Not an
   essay. This is the part that matters most.
2. **Real events, presented as Facebook events.** Real public events near the venue, all shown in
   the app as Facebook events regardless of where they came from.
3. **Always fresh, never empty.** Found overnight by a scheduled job, plus a refresh button on the
   picks page for a live moment in the demo.

## Non-goals

Buying tickets or RSVPing on the original site; posting to Facebook; Meta App Review; maps;
push notifications; other cities; editing discovered events; letting users add sources.

## Anti-goals (failure even if it "works")

- **The picks page blank, spinning, or erroring on stage.** Keanu's worst case: "literally
  everything broke and nothing loaded".
- Long or generic reasons ("This event may interest you").
- Private data in prompts or reasons: `personas.memory`, `secrets`, `neverShare` must never reach a
  model or the screen (claude.md 5.3).
- Breaking today's invited-event flow (seeded events, huddle nudges, `feed.respond`).
- The same event shown twice because two sources listed it.
- Any API key or token in git, logs, or the bus.

## Decided by Keanu

- **Sources: all of them**, merged into one pool:
  - Public Facebook events via the Apify "Facebook Events Scraper" (Keanu accepts the Meta terms
    risk of scraping; the Graph API cannot read public events: "Access to Events on Users and Pages
    is only available to Facebook Marketing Partners", Graph API v26 Event reference).
  - Parallel web search (finds facebook.com/events pages and richer listings: Stanford events,
    allevents.in).
  - Luma, Eventbrite and allevents listings for the area.
  - Keanu's `hackathonradar` database on his VPS (see "Hackathonradar" below).
- **Everything is presented as a Facebook event** in the app, whatever the source.
- **"Matches my interests" comes from Muse memory**: the person's interests and the events they
  went to before.
- **Runs for real logged-in users and for the demo personas** (Maya, Sam and the other seeded
  personas), so the stage demo has picks.
- **Both an overnight run and a live refresh button.**
- **Card and buttons stay as they are** (X / "I'm going" / snooze clock).
- **If only part lands by 10:30: personal reasons before real Facebook events**, ideally both.

## Constraints (facts, checked)

- Backend is Convex, self-hosted at https://convex-api.keanuc.net (Hetzner Hillsboro, 2 vCPU,
  2 GB). Node actions (`"use node"`) work. There is no `convex/crons.ts` yet.
- **Auth:** every new public query/mutation/action must call an authz helper (`requireActor`,
  `allowedAs`, ...) or `tests/guardCoverage.test.mjs` fails and nothing should deploy. Internal
  functions are exempt. `AUTHZ_MODE` is `warn` today; real `fb_` personas may only act as themselves,
  seeded personas are readable by anyone and writable by demo operators.
- **Muse calls:** `museJSON` in `convex/muse.ts` takes a zod schema and a `fallback()`, never throws,
  10 s timeout, models `muse-spark-1.3` and `muse-ember-1.0` (Dylan moved the question flow to
  ember for speed). Budgets today are per event (`events.museCalls`); a background job has none.
- **Privacy:** prompts may use only `eventSafeProfile` (interests, vibe, availability) and the
  approved Muse profile (`internal.musePersonas.approvedForPersonas`). `lib/privacy.ts` has a leak
  check (`codeCheck`) for generated text.
- **Today's data model** (convex/schema.ts): `events` need a `hostId` persona and many required
  planning fields; dates are one of 5 fixed `slots` (20-28 Nov); there is no URL, real start time,
  location or category. `feed.respond` requires a `guests` row. `feed.forViewer` loads whole tables
  on every call.
- **Secrets** live in Convex env vars (set with `npx convex env set`), never in the repo.
- **Deploy:** GitHub Actions is blocked on Dylan's account, so deploys are manual and only from an
  up-to-date `main`.

## Design (my calls unless marked as Keanu's)

### Data: two new tables, existing events untouched (my call)

Imported events are not forced into the `events` table (which assumes a host persona, planning
fields and fixed slots). Instead:

- **`discoveredEvents`**: the merged pool. One row per real event: `key` (dedupe key), `source`
  (facebook | parallel | luma | eventbrite | allevents | hackathonradar), `sourceId`, `url`,
  `title`, `description` (trimmed), `startsAt` / `endsAt` (ms, with timezone handled at import),
  `venueName`, `address`, `city`, `lat`, `lng`, `organizer`, `imageUrl`, `category`, `price`
  (free / paid / unknown), `fetchedAt`. Indexed by `key` and `startsAt`.
- **`picks`**: one row per person per event: `personaId`, `eventKey`, `verdict` (go | maybe),
  `reason`, `score`, `status` (new | going | cant | snoozed), `snoozedUntil`, `rankedAt`,
  `source` of the reason (muse | fallback | snapshot). Indexed by `personaId`.

`feed.forViewer` appends the viewer's active picks to `recommended`, mapped into the same card
shape (`relation: "pick"`), after today's invited events. Buttons on a pick call a new guarded
`picks.respond` (requireActor write); `feed.respond` stays as it is.

### Dedupe (my call)

`key` = normalised title (lowercase, punctuation and "the/a" stripped) + start day (local date) +
city. When two sources collide, keep the Facebook record and fill empty fields from the others.

### Which events qualify (my call, constants in one config file)

Starting within the next 21 days, within about 55 km of Menlo Park (37.4529, -122.1817), which
reaches San Francisco (see Hackathonradar), not cancelled, not online-only. Events with only a city
(no coordinates) use that city's centre. Up to 8 stored picks per person per run.

### Ranking and reasons (Keanu: Muse memory; my call: how)

- One Muse call per person per run, model ember: the person's safe profile + their past events
  (events they RSVP'd "going" to, their "How was it?" answers, picks they said "I'm going" to) +
  up to 40 candidate events in compact form. Returns up to 8 picks, each `{eventKey, verdict,
  reason}`; reason one sentence, 90 characters max, must name a concrete link to the person
  (an interest, their vibe, a past event, the distance or time), never generic.
- **Other people's RSVPs never enter a person's prompt or reason** (my call, claude.md 5.1: each
  Muse reads only its own person). The card's "friends going" pill may still show friends who
  tapped "I'm going" on the same pick, like Facebook shows friends going, but Muse never cites it.
- **Past events for demo personas** (my call): the seed adds 2-3 past events per demo persona that
  they went to, with a "How was it?" answer, so reasons like "you loved the jazz night in October"
  are possible on stage. Today nothing writes feedback and all seeded events are in the future.
  `personas.memory` stays out of prompts.
- Every reason passes the privacy leak check; a failing reason is replaced by the fallback.
- **Fallback (no Muse, timeout, bad JSON):** keyword overlap between the person's interests/vibe
  and the event's title/category/description, with a template reason ("You're into jazz, and it's
  10 minutes away"). The page must never wait on Muse.
- Budget: a per-run cap on Muse calls (one per person) stored in `appMeta`, so a cron can't run
  away.

### Fetching (my call; parsing details left to the builder)

- Each source is its own internal Node action with its own timeout, writing into
  `discoveredEvents`. One source failing never stops the others.
- Facebook: Apify `apify/facebook-events-scraper`, keyword + city search for Menlo Park,
  Palo Alto, Mountain View, Stanford, Redwood City, with a date window. Token in env `APIFY_TOKEN`.
- Parallel: search API for facebook.com/events and local listings, then extract details. Key in env
  `PARALLEL_API_KEY` (a server key, separate from Keanu's MCP setup).
- Luma / Eventbrite / allevents: public listing pages for the area (structured data on the page
  where available).
- Hackathonradar: its public discovery API (details below). Build this source first: no key needed.

### Schedule and refresh (Keanu: both; my call: how)

- `convex/crons.ts`: fetch all sources every 6 hours; rank all personas after each fetch.
- **Refresh button** on the picks page header (guarded public action, requireActor write, at most
  once a minute per person): re-ranks from the existing pool right away (seconds), and kicks off a
  background fetch whose new picks appear when ready. While working, the header shows
  "Muse is looking..."; the list is never cleared.

### Never empty (Keanu's anti-goal)

- Picks are stored, so the page loads instantly from Convex even if every source and Muse are down.
- A refresh only ever adds or reorders; a failed refresh leaves existing picks on screen.
- **Frozen demo snapshot:** a checked-in JSON of good picks for the demo personas, loaded when a
  demo persona has no picks (and loadable by hand before the demo).

### Card (Keanu: same card; my call: additions)

Today's swipe card plus the real date and time and the place. All picks look like Facebook events
(Facebook-style host/organizer line, no "via Luma", no outside links; see "Tapping a pick").

## Hackathonradar

Checked by a scout on 13 Nov (project at `~/Documents/Projects/hackathonradar`, "Hack Radar",
Go + Postgres on a Hetzner VPS, scraping Luma every 2 hours plus Eventbrite and others).

- **Use its public API, not the database** (my call): `GET https://hackradar.tech/api/discovery/v1/events`,
  no auth, filters `kind`, `q`, `category`, `city`, `latitude`, `longitude`, `radius_miles`,
  `limit`, `offset`. Returns title, description, dates, location, city, image, organizer, price and
  registration URL. Use `limit=100` and page (a `limit=500` request hung). This avoids credentials
  and load on the VPS, whose Luma IP is rate-limit sensitive.
- **What it has:** 174 curated ("posted") Bay Area events between 13 Nov and 15 Dec (101 Eventbrite,
  73 Luma), all with description, image, location, end date and organizer. Mostly meetups,
  founder/VC, workshops, conferences, some AI/ML. **172 of them are in San Francisco**; the
  Peninsula and South Bay have only about 14, uncurated.
- **Gaps:** no latitude/longitude (city-level only), no event-local timezone (times are UTC
  timestamps), inconsistent city strings ("San Francisco, CA" vs "San Francisco, California"),
  Luma rows have an empty registration URL (use `source_url` / `canonical_url`, a `lu.ma` link).
- **Consequence for the qualify rule:** the radius must reach San Francisco (about 45 km from Menlo
  Park) or most of this pool is dropped, so the radius is 55 km (my call) and events are ranked
  closer-first among equals.

It is the first source to build, because it needs no new account or key.

## Real logged-in users (Keanu: simulate the Muse connection)

A real Muse connection can't be built in time, so it is simulated for the demo (Keanu's call):

- **"Connect my Muse"** already exists and is already simulated: `AccountSheet` calls
  `museSync.syncMuseContext`, whose adapter `museAdapter.readMuseContext` ("THIS IS THE DEMO
  HOOK") always builds fake Muse files from the persona's seeded fields via `demoMuseContext`,
  parsed by `museContext.extractShareableProfile` into `musePersonas` (unapproved until the user
  approves). For a fresh Facebook persona those fields are empty, so the profile is empty.
- **Change (my call):** in that same adapter, when the persona has a prepared profile, build the
  fake Muse files from it (interests, vibe, 2-3 past events) instead of the empty persona fields.
  Prepared profiles live in one seed file keyed by Facebook persona id, starting with Keanu's
  (Keanu supplies his interests). Parsing, approval, the huddle and now picks stay unchanged, and
  the day a real Muse read exists only the adapter changes. Picks for that user are then ranked
  exactly like a demo persona's, from the approved profile.
- Route B (Arav/Arnav's live "Connect your Muse" connector) has no code on any branch as of 13 Nov;
  this design does not depend on it.
- **A real user with no prepared profile** sees popular events nearby (ranked closest and soonest,
  no personal reason) and a "Connect your Muse for picks that fit you" prompt (my call). Never an
  empty page.
- **On stage:** the main demo runs on a demo persona (Maya) through the operator switcher; Keanu's
  own real login is the bonus moment, so both paths must work.

## Tapping a pick: an in-app Facebook-style event page (Keanu: option A)

Tapping a pick (on the picks page or in Discover's Popular Events, where picks also appear) opens an
in-app event page in the same Facebook style as our own events: cover image, title, date and time,
place, organizer shown as the host, description, Muse's reason, and Going / Maybe / Can't. It reads
the discovered event and the viewer's pick (a guarded query), not `feed.detail`.

To keep the "these are Facebook events" presentation (my call): no link to Luma, Eventbrite or
allevents anywhere in the app in this version; the original URL is stored for later. The card's
earlier "Open event page" link is dropped.

## Build order and cut line (my call, from Keanu's priority)

One builder (Keanu's Claude session), one branch, one deploy from `main`. In order; each step
ships on its own, so stopping anywhere still leaves a working demo:

1. Tables, Hack Radar source, fallback ranker, picks in `forViewer`, `picks.respond`, card lines.
2. Seeded past events + Muse ranking and reasons + privacy check.
3. In-app event page for picks.
4. Frozen snapshot for demo personas; simulated Muse connection with Keanu's prepared profile;
   "popular nearby" for real users without one.
5. Refresh button + `crons.ts`.
6. Apify Facebook source (needs `APIFY_TOKEN`; the demo goes ahead without it).
7. Parallel / allevents (needs `PARALLEL_API_KEY` for Parallel).

Teammates are told on the bus before `schema.ts`, `feed.ts`, `SwipeCard.tsx` or
`recommended.tsx` change, since those are shared.

## Tests the builder must include

Dedupe and normalisation per source; the qualify filter (date window, distance); the fallback
ranker and reason length; the privacy check on reasons; `picks.respond` and the refresh action
guarded (guardCoverage); `forViewer` still returning invited events unchanged.

## Left to the builder

Exact scraping/parsing per source, prompt wording, styling of the new card lines and the refresh
button, and index choices.

## Keanu to do (accounts and keys; never by the agent)

- Apify account and API token (for `APIFY_TOKEN`).
- A Parallel API key for server use (`PARALLEL_API_KEY`), if the MCP key cannot be reused.
- Nothing for hackathonradar: its public API needs no credentials.
- Keanu's own interests, vibe and 2-3 past events, for his prepared Muse profile.
