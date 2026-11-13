# Meta Muse Events

A Partiful-style event product built into the Facebook app as a swap-in for Facebook Events. Goal: bring younger people onto Facebook. Every user has a Meta Muse (a personal AI agent), and Muse works for the host and for each guest.

Status: working design from the team brainstorm plus the Closer Together hackathon game plan. Not locked.

Legend used throughout:
- **[Decided]** your call in this conversation
- **[Proposed]** my suggestion, not yet confirmed
- **[Doc]** taken from the hackathon game plan

---

## 1. One-paragraph pitch

Partiful made invites look good. Muse makes events actually happen. For hosts, Muse does the planning and logistics. For guests, each person's Muse works out whether an event is worth going to and says why. Events reach friends through the social graph, with an optional friends-of-friends spread. Non-users get a plain invite and are pushed to set up a Muse right after they RSVP.

## 2. Hackathon constraints that shape the design [Doc]

- Meta "Closer Together" AI hackathon, Menlo Park, 11-13 Nov 2026. Brief: make Facebook valuable for young adults.
- A Muse model (Spark, Wonder or Ember) must power the core AI. Keep other LLMs out of the product's AI path.
- Judging: AI integration 30%, product thinking and user impact 25%, execution and demo 25%, originality and cohesion 20%.
- "AI essential, not decorative." Demo must work with no unnecessary mockups. A mock Facebook screen is fine as the stage, but the AI feature itself must really run.
- Product thinking includes "gives people a reason to come back."
- Deadline Fri 13 Nov 10:30 PT on Devpost. Demo is 5 min plus 3 min Q&A.
- Nothing can be coded before kickoff. No previous work. Do not reuse Klick code.
- Facebook's Graph API cannot read Events, Groups or Marketplace, and only returns friends who use your app. So the friend graph and events are seeded data. Login with Facebook is used for name and photo only.
- Make it clearly not Klick. Klick matched strangers. Here, Muses that already belong to friends coordinate a real plan.
- Devpost registration needs all five teammates on the project before Wed 11 Nov 23:45 PT.

## 3. The two sides of the product

### 3.1 Organiser side: why use this instead of Partiful? [Decided]

Muse handles the event logistics: cake, candles, venue, food, invite art, the event page. This exists to win hosts over. Partiful gives a host an invite page. This gives the host an assistant.

- Real bookings and real vendor contact are out. **[Decided]** Everything involving vendors is **simulated**: Muse drafts the order or enquiry, a simulated vendor replies with a confirmation, and the UI labels it "simulated".
- The host approves before anything is sent or committed.
- Where a solver or checker is used (for example picking the date most guests can make), put it behind a Muse tool call: Muse proposes and revises, code only verifies.

### 3.2 Attendee side: raise the probability a person attends [Decided]

Two mechanisms.

**A. Friends-of-friends spread (optional, per event)**
- The event widens outward: host's friends (k=1), then their friends (k=2), until a quota is hit.
- The quota is a cap on how far the spread goes and the host's target attendance.
- Triggers that surface an event to someone: the host creates it, or a friend of a friend responds to it.
- Default off. Pitch it as optional so it does not read as matching strangers.

**B. Friend-Muse matching (the funnel)**
1. The host types an audience description: "closest friends", "my tech network", "the people I go boxing with".
2. A retrieval step narrows the host's friends (about 500) to a shortlist (about 50).
3. Muse-to-Muse conversation runs on the shortlist. Each friend's Muse decides whether the event is worth it for its own person and why.
4. Output is a nudge with a reason: "Sam will be there and you haven't seen him since August. He does tech sales, which you asked about. You're free after 6." The verdict can be skip.

For a small private event (say 10 specific friends): add them to the guest list and deselect friends of friends. Nothing spreads and no funnel selection runs. Muse still writes personalised nudges to those guests.

## 4. Settings (per event) [Decided]

| Setting | Values | Notes |
|---|---|---|
| Friends of friends | on / off | Default off. |
| Funnel mode | `shortlist_and_add` (default) / `auto_invite` | Shortlist: funnel proposes, host approves or edits, nothing sent until the host taps. Auto-invite: matches are invited directly. |
| Max auto-invites | integer | Only when mode is `auto_invite`. **[Proposed]** If matches exceed the cap, invite the top-ranked up to the cap and show the host the rest as a suggested shortlist. |
| Audience description | free text | Drives the funnel. |
| Quota | integer | Cap on how far friends-of-friends spread goes. |
| Shortlist size and per-friend summary caching | tunable | System parameters to control the cost of the Muse step. |

Demo note **[Proposed]**: show shortlist mode as the main flow. Auto-invite exists in the design, but the doc's design rule (from Klick) is that the Muses can only suggest and the people do the deciding. Be ready to explain why auto-invite is a host opt-in.

## 5. Architecture

### 5.1 Decision: one Muse per person, Muses talk to each other [Decided]

Compared in the sketch and the game plan:
- **A. One central agent reads everyone's data.** Rejected. It pools private memory in one place.
- **B. Muses chat freely.** Strong demo, hardest to build, leaks in tests, first-reply bias.
- **C. Fixed form plus one decider.** Your Muse sends each friend's Muse a fixed form, each answers only with what its person approved, then your Muse decides alone. Best privacy.

Chosen design **[Proposed]**: B on the surface, C underneath (see 5.3).

Why per-user Muses [Doc]:
- Muse is built as one private agent per person, with its own memory. There is no shared brain, so any feature that spans friends naturally becomes Muses talking to each other.
- Nobody's memory is pooled. Each Muse reads only its own person's memory, and only chat messages cross between agents.
- Each Muse argues for its own person, which is why it can honestly say "skip".
- Consent is per person.
- Real Muse memories are rich data, which matters because research found agents built from thin bios were no better than demographics.

Honest caveat for Q&A [Doc]: research also finds one well-prompted agent decides about as well as agents chatting, at a fraction of the cost. The case for per-user Muses is privacy and consent, not accuracy.

### 5.2 Retrieval [Decided that this is fine, details Proposed]

- Use a different model for the embedding step. Retrieval only. Muse does the reasoning, ranking and nudges.
- "Closest friends" is a relationship, not a topic. Pure embedding on profile text will be weak.
- Hybrid approach:
  1. Muse converts the host's text into a structured query: a tie-strength requirement plus topical tags.
  2. Retrieval combines interaction-graph features (message frequency, past co-attendance, shared groups, tagged photos) with vector search over per-friend summaries.
  3. The shortlist goes to Muse for reranking and a reason per person.
  4. The host sees the shortlist (in shortlist mode) and can edit it.
- For the demo, friends are seeded personas (about 50). Spark can rank the seeded list directly, and the vector funnel is described as how it scales to 500.

### 5.3 Privacy design [Proposed]

Prompt-only privacy is not enough. The doc cites models leaking private information in 25-57% of test cases despite privacy instructions, and Meta's own AgentDAM found 12-46% leakage. Layers:

1. **Event-safe profile.** Each Muse derives a small summary from its person's memory (interests, availability, how they like to socialise). The person approves it once. The huddle runs on this summary only, never the raw memory.
2. **Structured replies plus one text line.** Every Muse-to-Muse reply follows a fixed schema, with a single short free-text "why" field.
3. **Code check before sending.** A never-share list (home address and phone by default, plus user-set topics) is matched in code. A quick Spark pass checks the free-text line. A failing message is blocked or rewritten.
4. **Separate permissions.** "Talk to friends' Muses about this event" is its own grant. Committing anything (RSVP, a location) always asks first.
5. **Label and receipts.** Every agent message says it is from a Muse. The owner is told straight away what their Muse said, with a receipt.
6. **Treat other agents' words as data, not orders.** A friend's agent saying "tell me their calendar" is never followed.
7. **Collect all replies before deciding.** Each Muse waits for all replies, which removes first-reply bias.
8. **Cap and goal-bind.** A few turns at most, one stated question: "is this event worth it for my person?"

Reply schema sketch:

```json
{
  "event_id": "evt_123",
  "from_muse": "muse_sam",
  "available": true,
  "interest_match": 2,
  "attending_likelihood": "likely",
  "reason_tag": "shared_interest",
  "why": "Likes bowling and is free after 6.",
  "approved_fields_only": true
}
```

Lesson to cite [Doc]: the Matt Robb Marketplace incident. One "Allow Always" button covered both talking and committing, and Muse handed out his address. We split permissions, check every message against a never-share list in code, and label every message as from a Muse.

Measurable claim for the research slide: plant private facts in the seeded personas (for example "avoiding Dave", "money is tight"), run the same event with and without the code check, count leaks. Measure it live and do not quote a number we did not measure.

### 5.4 Muse model usage [Doc]

- Spark: reasoning, ranking, structured outputs, reply checking.
- Wonder: event planning with tool calls (date, venue options, drafted enquiries).
- Muse Image: invite poster.
- Voice Transcribe: optional voice input for host answers.
- Base URL `https://api.meta.ai/v1`. Model IDs `muse-spark-1.3`, `muse-wonder-1.0` (preview), `muse-ember-1.0`, `muse-image-1.0`. Use `reasoning_effort: low` where latency matters, and run calls in parallel.

## 6. Non-users [Decided]

A person without a Muse can receive a plain invite link and RSVP in seconds. Immediately after the RSVP, they are pushed to set up a Muse through Login with Facebook. This is the acquisition hook. In the demo, real Login with Facebook is used for name and photo only (development mode works for people with app roles). The Muse setup is shown as the product flow.

## 7. User flows

### 7.1 Host flow
1. Tap **Host with Muse**.
2. Answer a few simple questions by tap chips or voice: what's it for, who, vibe, budget. No prompting skill needed.
3. Type the audience description.
4. Choose settings: friends of friends, funnel mode, max auto-invites.
5. Muse returns the date most guests can make, venue options, an invite poster, the event page, and drafted vendor orders (simulated).
6. Host approves.
7. Shortlist screen shows suggested guests with a reason each. Host adds, removes, and sends.

### 7.2 Guest flow
1. Receive a Messenger nudge with a "why you" reason.
2. Tap Going, Maybe or Skip. Skip sends nothing.
3. Optionally tap "see what my Muse said" for the transcript and receipt.

### 7.3 Non-user flow
Plain link, RSVP, then "set up your Muse" with Login with Facebook.

### 7.4 Huddle (behind the scenes)
1. Host ticks "Let my friends know with Muse".
2. Each friend's Muse, running on that friend's event-safe profile, exchanges structured replies with the Muses of friends who are going.
3. Every outgoing message passes the never-share check.
4. Each Muse waits for all replies, then decides for its own person.
5. Only "worth it" becomes a nudge. At most one nudge per event. Only friends who turned Muse nudges on are included.

## 8. Scope

**In v1 [Decided]**
- Host logistics through Muse, with simulated vendors
- Audience text box feeding the funnel
- Friend-Muse matching with personalised, reasoned nudges
- Friends-of-friends toggle
- Per-event funnel mode and max auto-invites
- Plain invites for non-users with a set-up-Muse prompt
- Privacy: event-safe profile, structured replies, code check, labels, receipts **[Proposed]**

**Out of scope for now [Decided]**
- Richer feedback from attendee Muses after the event
- QR or Bluetooth check-in
- Age handling (treated as zero)
- Real bookings and real vendor contact

Risk to be ready for [Doc]: the brief scores "gives people a reason to come back", and the game plan's loop closes through feedback and discovery. Without it, have a clear answer for what brings people back.

## 9. Facebook app mockups

Purpose: show where each feature fits inside the existing Facebook app, using seeded data. Mockups are the stage. The AI behind them really runs. All screens are mobile.

### 9.1 Where features fit in the app

| Feature | Facebook surface | Notes |
|---|---|---|
| Host with Muse | Events tab, new entry point | Replaces the Create Event flow |
| Audience, settings, shortlist | Events create flow | New screens inside Create Event |
| Event page | Events | Replaces the existing event page |
| Suggested events with "why you" | Events tab, Discover | Per-person reasons |
| Nudge | Messenger | Message from your Muse, with buttons |
| Muse transcript and receipt | Event page and Messenger | "see what my Muse said" |
| Muse settings (permissions, never-share, event-safe profile) | Settings, Muse | Where the person sees and edits what is shared |
| Non-user landing | Web link outside the app | RSVP then set up Muse |
| Notifications | Notifications tab | Standard badge, no new surface |

### 9.2 Screen list

Core screens to mock first:
1. Events tab home
2. Host with Muse: questions
3. Host with Muse: audience and settings
4. Muse plan review (date, venue, poster, simulated orders)
5. Shortlist
6. Event page (guest view)
7. Messenger nudge
8. Muse transcript and receipt
9. Muse settings
10. Non-user landing and RSVP, then set up Muse

### 9.3 Wireframes

Screen 1: Events tab home

```
+--------------------------------------+
|  facebook            [search] [msg]  |
|  Home  Friends  Reels  Events  Menu  |
+--------------------------------------+
|  Events                              |
|  [ Your events ]  [ Discover ]       |
|                                      |
|  +--------------------------------+  |
|  |  + Host with Muse              |  |
|  |  Plan it in a minute.          |  |
|  +--------------------------------+  |
|                                      |
|  Picked for you                      |
|  +--------------------------------+  |
|  | [poster]  Maya's bowling night |  |
|  |           Fri 7pm, Mission     |  |
|  |  Why you: Sam is going and you |  |
|  |  both like bowling.            |  |
|  |  [Going] [Maybe] [Skip]        |  |
|  +--------------------------------+  |
|  | [poster]  Climbing social      |  |
|  |  Why you: closer than the last |  |
|  |  one you skipped.              |  |
|  +--------------------------------+  |
+--------------------------------------+
```

Screen 2: Host with Muse, questions

```
+--------------------------------------+
|  < Host with Muse                    |
+--------------------------------------+
|  What's it for?                      |
|  (Birthday)(Housewarming)(Game night)|
|  (Other...)                          |
|                                      |
|  What vibe?                          |
|  (Chill)(Lively)(Fancy)              |
|                                      |
|  Rough budget?                       |
|  ( $ )( $$ )( $$$ )                  |
|                                      |
|  or  [ mic: say it ]                 |
|                                      |
|            [ Next ]                  |
+--------------------------------------+
```

Screen 3: Audience and settings

```
+--------------------------------------+
|  < Who is this for?                  |
+--------------------------------------+
|  Describe who it's for               |
|  +--------------------------------+  |
|  | the people I go boxing with    |  |
|  +--------------------------------+  |
|                                      |
|  How should Muse find them?          |
|  (o) Suggest a shortlist             |
|  ( ) Invite matches automatically    |
|        Max auto-invites: [ 12 ]      |
|                                      |
|  Include friends of friends   [ off ]|
|  Target attendance            [ 15 ] |
|                                      |
|            [ Plan with Muse ]        |
+--------------------------------------+
```

Screen 4: Muse plan review

```
+--------------------------------------+
|  < Your plan                         |
+--------------------------------------+
|  [ invite poster by Muse Image ]     |
|                                      |
|  Date: Fri 14 Nov, 7pm               |
|  Checked: 11 of 12 can make it       |
|                                      |
|  Venue                               |
|  (o) The Rec Room        $$          |
|  ( ) Mission Lanes       $           |
|                                      |
|  Drafted for you (simulated)         |
|  - Cake order: draft ready           |
|  - Candles: draft ready              |
|  [View drafts]                       |
|                                      |
|     [ Looks good ]   [ Change ]      |
+--------------------------------------+
```

Screen 5: Shortlist

```
+--------------------------------------+
|  < Suggested guests (12 of 50)       |
+--------------------------------------+
|  [x] Sam      Close. Boxes with you. |
|  [x] Priya    Close. Free after 6.   |
|  [x] Leo      Boxed with you twice.  |
|  [ ] Dana     Free, less close.      |
|                                      |
|  Muse suggested these because ...    |
|  [ See why ]                         |
|                                      |
|   [ Add selected and send ]          |
+--------------------------------------+
```

Screen 6: Event page (guest view)

```
+--------------------------------------+
|  < Maya's bowling night              |
+--------------------------------------+
|  [ poster ]                          |
|  Fri 14 Nov, 7pm  The Rec Room       |
|                                      |
|  Why you: Sam is going, and you both |
|  like bowling.                       |
|  [ see what my Muse said ]           |
|                                      |
|  [ Going ]  [ Maybe ]  [ Skip ]      |
|                                      |
|  Going (7)  [avatars]                |
|  Friends going: Sam, Priya           |
+--------------------------------------+
```

Screen 7: Messenger nudge

```
+--------------------------------------+
|  < Muse                [from your Muse]|
+--------------------------------------+
|  Maya is hosting Friday. Worth going:|
|  1. Sam will be there, you haven't   |
|     seen him since August.           |
|  2. He does tech sales, which you    |
|     asked about.                     |
|  3. You're free after 6.             |
|                                      |
|  [ Going ] [ Maybe ] [ Skip ]        |
|  [ see what my Muse said ]           |
+--------------------------------------+
```

Screen 8: Transcript and receipt

```
+--------------------------------------+
|  < What my Muse said                 |
+--------------------------------------+
|  Muse (you)  to  Muse (Sam):         |
|  "Is Friday worth it for Sam?"       |
|  Muse (Sam): "Available, likely,     |
|   shared interest: bowling."         |
|                                      |
|  Shared on your behalf               |
|   - free after 6pm   (approved)      |
|   - interests: bowling (approved)    |
|  Blocked                             |
|   - 1 message (matched never-share)  |
|                                      |
|  [ Edit what Muse can share ]        |
+--------------------------------------+
```

Screen 9: Muse settings

```
+--------------------------------------+
|  < Muse and events                   |
+--------------------------------------+
|  Let Muse talk to friends' Muses     |
|  about events                [ on ]  |
|                                      |
|  Always ask before                   |
|   - RSVP for me             [ on ]   |
|   - share my location       [ on ]   |
|                                      |
|  Never share                         |
|  home address, phone number,         |
|  + [ add topic ]                     |
|                                      |
|  What Muse knows about you for events|
|  [ view and edit summary ]           |
+--------------------------------------+
```

Screen 10: Non-user landing

```
+--------------------------------------+
|  Maya invited you                    |
|  [ poster ]                          |
|  Fri 14 Nov, 7pm  The Rec Room       |
|                                      |
|  [ Going ]  [ Maybe ]  [ Can't ]     |
|                                      |
|  After RSVP:                         |
|  +--------------------------------+  |
|  | Get your own Muse              |  |
|  | Muse finds events worth going  |  |
|  | to, with a reason.             |  |
|  | [ Continue with Facebook ]     |  |
|  +--------------------------------+  |
+--------------------------------------+
```

### 9.4 Mockup notes for the design lane

- Taste decides the switch from Partiful [Doc]. The invite page and poster have to look better than Partiful's. Give one person design and the Muse Image poster.
- Facebook look: stay consistent with the app's tab bar and card style so features read as part of Facebook.
- Every Muse-written line (nudge, "why you") is labelled as from Muse.
- Out-of-scope surfaces to leave as greyed placeholders if shown at all: QR check-in at the door, one-tap feedback, discovery re-rank after feedback.

## 10. Seeded data (needed because the Graph API cannot read Events or friends)

- About 50 friend personas for the host, plus one or two hops of friends of friends.
- Each persona has an event-safe profile, interaction features (closeness), and an availability pattern.
- Real Muse memories can be exported from teammates' own Muses (Settings, Data controls, Download your Muse data), redacted of anything they do not want on stage, and loaded into their agent. There is no developer API that reads a Muse memory directly. **[Doc]**
- Plant private facts in the personas for the leak test.

## 11. Demo script (5 minutes) [Proposed, based on the Doc's loop]

1. **Problem (30s).** A friend group cannot turn "we should do something" into a plan, and Partiful makes invites but not events.
2. **Host (90s).** Maya taps Host with Muse, answers the questions, types who it's for. Muse returns date, venue, poster, simulated vendor drafts. She approves.
3. **Funnel (60s).** Shortlist appears with a reason per friend. She adds the guests.
4. **Huddle (60s).** Friends' Muses exchange structured replies. Show the live transcript and the blocked message.
5. **Nudge (30s).** A guest gets the Messenger nudge. Tap Going.
6. **Non-user (30s).** A guest without Facebook RSVPs from a link, then gets the set-up-Muse prompt.
7. **Privacy slide (30s).** Leak count with and without the code check, from the live test.

Likely Q&A: why Muse is essential, how wrong plans and leaks are prevented, how it is different from Klick, what brings people back, what you would build next.

## 12. Evaluation

- **Leak test.** Planted facts, with and without the code check, same events, count leaks.
- **Plan correctness.** Date and attendance checks: how often the proposed date works for everyone who said they were free.
- **Funnel quality.** On seeded personas, whether the shortlist matches the audience description (for example "boxing people" returns the boxing friends).

## 13. Future scope [Decided]

- Hardening beyond v1: stricter data access so each Muse exposes only a narrow approved view of the data it holds.
- Check-in (QR, then Bluetooth through a native app).
- Post-event feedback feeding discovery, which is the loop that makes every event better.
- Age handling and safety rules for younger users.
- Real vendor bookings.

## 14. Open questions

1. Fill in the blank: "Why is Muse-Muse better than ___?" Suggested: better than one central agent reading everyone's data.
2. What can one Muse reveal to another, especially with friends of friends who are not your friends? (The event-safe profile and the schema answer this for v1.)
3. How to cap the per-event Muse cost.
4. Whether the quota is only a cap on spread or also the host's target attendance (assumed both).
5. What brings people back, given feedback and discovery are out of scope.
6. Which embedding model to use for retrieval, given Muse must power the core AI.
7. Overflow behaviour for auto-invite (proposed above, not confirmed).

## 15. Source notes

- The idea sketch (Excalidraw, freehand), read from a rendered image. Some handwriting may be misread.
- The Closer Together hackathon game plan (attachment), including the team direction, the brief, the research check and the Marketplace incident write-up.
- Your decisions in this conversation, tagged **[Decided]**.

## 16. Backlog: deferred UI (2026-11-12)

Pulled out of the live app so we can wire the Menu profile row to real login/logout + the demo-
persona switcher instead. Not deleted — the Convex functions (`convex/settings.ts`:
`getUserSettings`, `updateUserSettings`, `updateNeverShare`, `approveProfile`) still exist and
work; only the screen (`app/settings/index.tsx`, removed) was in the way.

**What it covered, to rebuild later, properly integrated with the account sheet rather than as a
separate screen:**
- `talkToMuses` / `nudgesOn` toggles (per-persona Muse permissions).
- Read-only "always ask before" rows (RSVP, location) — these are forced `true` server-side per
  claude.md §5.3, never actually editable.
- "Never share" topic list with an add-a-topic input (feeds `lib/privacy.ts`'s `codeCheck`).
- The event-safe profile summary (interests, social style) + a one-time "approve this summary"
  action (`profileApproved`), per claude.md §5.3's event-safe-profile privacy layer.

Where this should resurface: likely inside `components/AccountSheet.tsx`, below the login/logout
section, scoped to whichever persona is actually signed in, not a standalone tab/route.

## 17. Shipping: CI deploys Convex (2026-11-13)

`.github/workflows/ci.yml` runs `npm test` on every PR and, on every push to `main`, deploys
`convex/` to the shared self-hosted deployment (https://convex-api.keanuc.net), then smoke-checks it.

- **Do not run `npx convex deploy` or `npx convex dev` against the shared deployment** from a
  laptop or an agent: `convex dev` pushes uncommitted code on every save, and the next CI deploy
  replaces whatever is live with `main` anyway. Change backend code by merging to `main`.
- Loop: branch, `npm test`, open a PR to `main`, wait for `test` to pass (`gh pr checks --watch`),
  merge, then watch the `deploy convex` job in the Actions tab. `gh pr merge --auto --squash` does
  this for you only once the repo owner has enabled auto-merge and made `test` a required check.
- Redeploy the latest `main` by hand: Actions tab > CI > Run workflow (branch `main`).
- Deployment env vars (Facebook, Muse, auth keys) live on the deployment. CI never sets them; ask
  Dylan or Keanu to change one.
- Break glass (CI down): one person deploys by hand after posting a `claim` on the bus.
- New public Convex functions need an authz guard (see `tests/guardCoverage.test.mjs` once the
  auth PR lands), or the `test` job fails and nothing deploys.

## 18. Free agent-to-agent conversation + the swarm (2026-11-13)

Section 5.1 chose "B on the surface, C underneath". Design B itself now exists as a real,
opt-in alternative, so the two can be compared instead of argued about.

**The default, per event (changed 2026-11-13).** `events.conversationMode` is
`"structured" | "free"` and is **optional** — absent now means **`"free"`**. A real exchange is
the thing worth showing, and it is what gives the agent room something to render. Structured
mode's code path in `convex/huddle.ts` is unchanged, not refactored, and an event opts back into
it by setting `"structured"` explicitly. Nothing in the app writes this field; it is set on the
event document directly.

Flipping the default also meant raising `CONFIG.maxCallsPerEvent` from 160 to 240. A free huddle
at `displaySize` 12 costs ~156 calls, which left so little slack that one retry would have pushed
it over — and `museJSON` degrades to offline fallbacks rather than failing, so the back half of a
huddle would have quietly stopped being real while still looking real.

**What free mode does** (`convex/huddleChat.ts`, `runExchange()`): a genuine multi-turn exchange
per candidate↔peer edge, capped at `CONFIG.maxTurns` (4) counted across both sides, and never
ending before one full round-trip. The bound question from section 5.3 ("is this event worth it
for my person?") is restated in the system prompt **every** turn, not just the first — over a
longer exchange that is what stops drift. The host's Muse still does not chat; it keeps the same
synthetic reply.

**Privacy had to get stricter, not looser.** Section 5.3's layers were written for one schema'd
reply; free text across several turns is exactly the shape the research in that section says
leaks:
- `privacy.guardText()` is the counterpart to `guardOutgoing` for a bare line. The never-share /
  pattern / injection regex scan is now shared by both through `scanTopics()`, so the two modes
  can never drift apart on what counts as a leak.
- Incoming turns are injection-scrubbed **before** they can land in the shared transcript or the
  next prompt. Checking on the way out only is not enough once there is a next turn to poison.
- `runHuddle`'s existing `codeCheck` flag is threaded into free mode, so section 12's leak test
  can run it unguarded as a baseline. The injection scrub deliberately stays on even then: the
  baseline measures what leaks *out of* a Muse, whereas the scrub stops a Muse being *steered* by
  another agent, and letting that through would corrupt the eval's own transcripts.

**Cost is the real constraint, and it shaped the design.** A Spark privacy call on every turn
costs ~8 Muse calls per edge, ~300 per event at `displaySize` 12, against a
`maxCallsPerEvent` ceiling of 160 — `museJSON` degrades to offline fallbacks rather than failing,
so the back half of a huddle would have quietly stopped being real while still looking real. So:
the regex layer runs every turn (it is free and it is the layer that catches hard leaks), the
Spark pass runs **once per exchange**, and free mode fans out over `CONFIG.maxPeersFree` (2)
rather than `maxPeers` (3). That lands at ~132 calls. Raising any of those three numbers needs
the arithmetic redone — `museConfig.ts` carries it.

**Honest caveat for Q&A.** Section 5.1's caveat still holds and free mode does not refute it:
this is more expensive per event than structured mode and is not claimed to decide better. What
it buys is that the transcript shown on stage is a real conversation.

### The swarm (`app/events/[eventId]/swarm.tsx`)

The "wow moment" screen: the host watches their friends' Muses answer. Design export is committed
at `design/sketches/04-swarm-wow-moment.html`; that artboard is a fixed 1440×900 desktop split
(960px network canvas beside a feed panel), which does not survive contact with a phone, so the
screen is one column: compact pan/zoom graph, confirmed count, stat row, live feed, footer link
into the existing transcript.

- Node layout lives on a fixed 340×340 virtual canvas, and the visible frame is a clipped viewport
  onto it — that is what gives panning somewhere to go. Pan/zoom is `PanResponder` + `Animated`
  (scale clamped 0.6–2.5, translation clamped so the graph cannot leave the frame).
  **Not** `react-native-gesture-handler`: it is a native module, and adding one would break every
  teammate's already-built dev client until they rebuild.
- Node state is derived **client-side** from queries that already exist (`events.getByEventId`,
  `huddleData.messagesForEvent`, `guests.listForEvent`) — no new public Convex function, so no new
  authz guard and no `guardCoverage` entry. Verdict prefers a guest's Muse `nudge` over their raw
  RSVP `status`; a persona with an ask but no verdict yet shows as "talking".
- "Private info shared: 0" is a true statement about the guard, not a placeholder.
- Graph drawing is capped at 14 nodes for legibility; the counters still count the whole shortlist.

### Sending starts where the host already is

The checklist's last row (`checklist.ts`'s `"send"` step) was decorative — a host could not
actually send from the screen where they watch the plan get built. It now has three states driven
by real checklist data (not by the playback animation, which deliberately never auto-completes
that step): inert while anything else is unfinished, a "Send invites" call-to-action once
everything else is done, and "tap to view" once sent, which reopens the swarm and never resends.
Manage's send button and its transcript button both land on the swarm too; the swarm links onward
to the transcript, so nothing was removed.

`events.doSendInvites` is now idempotent (early-return when `status === "sent"`). It previously
scheduled another concurrent `runHuddle` on every call, which the old single Send button hid and
a re-tappable checklist row would not have.
