# Muse Events

A Partiful-style event product built into the Facebook app as a swap-in for Facebook Events. Every user has a Muse (a personal AI agent) that works for the host and for each guest. Full design: [`claude.md`](./claude.md).

Built for the Meta "Closer Together" hackathon. The AI path runs on Muse models only (`muse-spark-1.3`, `muse-wonder-1.0`, `muse-image-1.0`).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Zod. No database: state lives in memory (seeded on boot), so run it as a single Node process (`next dev` / `next start`). Serverless hosts will lose state between invocations.

## Run

```bash
npm install
cp .env.example .env.local   # add MUSE_API_KEY for live Muse; leave empty for offline demo mode
npm run dev                  # http://localhost:3000
npm test                     # privacy, funnel, plan and huddle tests
npm run eval                 # leak test, plan correctness, funnel quality
```

**Offline demo mode.** With no `MUSE_API_KEY` every Muse call uses a deterministic local fallback, and the header shows an amber "Muse offline demo" badge. The whole product flow works, but that is not the AI. For the demo and the AI-integration score, set `MUSE_API_KEY` (and `MUSE_BASE_URL` if different). Calls that fail or time out fall back per call and are marked `source: "offline"`.

Not verified here: the live Muse request/response shapes (chat completions with JSON output, `/images/generations`) were written from the design doc and have not been run against the real API.

## Demo path

1. `/` as **Maya Chen**: Events tab with "Picked for you" cards.
2. **Host with Muse**: questions → audience ("the people I go boxing with") and settings → plan (date checked in code, venue, poster, **simulated** vendor drafts) → shortlist with a reason per friend → send.
3. The huddle streams live: Muse-to-Muse structured replies, each passing the never-share check. Each Muse collects all replies, then decides for its own person.
4. Switch **Demo as** to Priya or Sam: Messenger shows the nudge with a "why you"; tap "see what my Muse said" for the transcript and receipt.
5. Switch to **Not on Facebook**, open `/e/<id>`, RSVP, and get the "Get your own Muse" prompt.
6. `/leaktest`: planted private facts, run with and without each protection.

## Where things are

| Area | File |
|---|---|
| Muse client (JSON calls, image, offline fallback, call budget) | `lib/muse.ts` |
| Privacy: reply schema, code check, Spark pass, event-safe profile, injection check | `lib/privacy.ts` |
| Funnel: audience → structured query → hybrid retrieval → rerank | `lib/funnel.ts` |
| Plan: date (Muse proposes, code verifies), venues, poster, simulated vendors | `lib/plan.ts`, `lib/events.ts` |
| Huddle: parallel Muse-to-Muse replies, collect-all-then-decide | `lib/huddle.ts` |
| Seeded friends (50 + 12 friends of friends), planted private facts | `lib/seed.ts` |
| Leak / plan / funnel evals | `lib/eval.ts`, `scripts/eval.ts` |

## Honesty notes

- Friends, events and availability are seeded: Facebook's Graph API cannot read them. Login with Facebook (name and photo only) works when `FB_APP_ID` / `FB_APP_SECRET` are set; otherwise the setup screen runs in demo mode.
- Vendors are simulated and labelled as such. Nothing is booked or sent.
- Retrieval uses interaction-graph features plus a bag-of-words similarity over per-friend summaries as a stand-in for an embedding model (which Muse can't supply; see open question 6 in `claude.md`).
- **Leak test numbers**: offline, the no-protection baseline's leakage is a *simulation* (a model that volunteers raw memory about half the time), so those counts are illustrative. Only quote numbers measured with live Muse models.
- Out of scope per the design: check-in, post-event feedback and discovery re-rank, age handling, real bookings.
