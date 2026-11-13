# Muse Events — full flow sketch (dylan, 2026-11-12)

Hand-drawn Excalidraw sketch covering the whole app flow (not one screen — see `01-muse-events-flow.excalidraw` / `.png`). This supersedes claude.md section 9's older wireframes for screen *content and order* where they differ; claude.md's product rules (privacy layers, out-of-scope list, settings shape) still stand. Full architecture/port plan: see the `dylan/expo-convex` branch plan (Convex + Expo rebuild).

Rendered from the raw freedraw strokes via a Python/PIL rasterizer (no text layer in the source — it's all hand-lettering as vector strokes).

## Screens

### 1. FB menu → Events
Standard Facebook hamburger menu; tap "Events" in the nav list. No new build — fold into the app's tab header rather than a literal drawer (low priority, nice-to-have).

### 2. Stories-style event card (swipe-down dismiss)
- Content: date/time/location, host name, a photo box, an **"Agent Reasoning"** box (this is the AI-essential "why you" nudge — the most important surface on the screen), then three actions: **Remind me later**, **No!**, **Yes!** (check).
- Muse call: none live here — reads the pre-computed `Nudge` (`verdict/reasons/text`) from `huddle.messagesForEvent`/`guests.nudge` for the viewing persona.
- Component: `app/(tabs)/events/[eventId]/story.tsx`, `transparentModal` presentation, swipe-to-dismiss gesture.

### 3. Events home ("Hi {name}")
- Sections: "Your current invited events" (horizontal cards), "Other events", "Events in {city}" (discover), floating **+** labeled "Make an event".
- Data: `events.listInvitedFor`, `events.listDiscoverable`.
- Component: `app/(tabs)/events/index.tsx`.

### 4. "What are we making happen?"
- Single free-text input (placeholder example: "ABCD") + **Go** button.
- Muse call: a lightweight extraction action parses the free text into a draft `{purpose, vibe, budget, audience}` guess before routing to screen 5 (new, thin action — not a 1:1 port, see plan `new-event/index.tsx`).
- Component: `app/new-event/index.tsx`.

### 5. Quick-questions refinement
- Header shows the parsed title ("ABCD."), copy: "Love it! A few quick questions."
- Fields: "What's the vibe?" (chips, e.g. Awkward/Chill/...), "Who gets in" (audience-style selector), "Do you want cake?" (options), "Budget etc" (free-text) + **Done**.
- These chips refine (never replace) the screen-4 extraction.
- Component: `app/new-event/questions.tsx`.

### 6. "Your agent is on it!" — live planning
- A checklist filling in live: ✓ Picked the style, ✓ Shortlisted N venues, ⏳ Ordering the cake, 🔄 doing xyz — driven by which optional fields are populated on the `events` doc as `plan.planEvent` runs (slotId set → date picked; venueId set → venue shortlisted; drafts set → vendor drafts ready; poster set → poster made).
- Plus an inline approval chat: the agent can ask approval questions ("cake costs £30, can I charge your card ***? Yes/No") and the host can type free text back. v1 simplification: this can be a client-side mock conversation reading the `drafts`/budget fields rather than a full bidirectional agent chat (flagged as a stretch goal, not core).
- Component: `app/new-event/planning.tsx`.

### 7. Event flyer
- Poster (from `plan.makePoster`, Muse Image or SVG fallback) + event description + green **manage** button.
- Component: `app/(tabs)/events/[eventId]/flyer.tsx`.

### 8. Manage screen
- Event details box, a **"Chat with muse"** box (free-text Q&A about the event, answered from the event doc's fields only — new, thin action), guest list box, hosts box.
- Layout reference noted in the sketch: "(copy Luma page)" — follow Luma's event-management page structure for this screen's layout.
- This is also where **Send** lives, which schedules the huddle (`events.sendEvent` → `huddle.runHuddle`).
- Component: `app/(tabs)/events/[eventId]/manage.tsx`.

## Design principles noted at the top of the sketch (context, not new screens — already reflected in claude.md, no new scope)
1. **Make listing an event dead simple.** Muse chains cake → venue → food logistics automatically. Richer post-event feedback and QR check-in are marked "ask in app" / probably-not-v1 — matches claude.md's explicit out-of-scope list (QR check-in, post-event feedback/discovery re-rank).
2. **Attendee side: increase the odds someone attends** via friend-relevance matching ("your friends are going" beats generic "close strangers" matching) — matches claude.md's funnel + friends-of-friends design (§3.2).

## Design tokens (carried over from the old app's Tailwind config into `theme/tokens.ts`)
```
fb.blue #1877F2   fb.bg #F0F2F5   fb.ink #1C1E21   fb.sub #65676B   fb.line #DADDE1
muse.500 #7C3AED  muse.600 #6D28D9  muse.100 #EDE9FE
```

## Mentor feedback context
Keanu posted a flowchart (hivemind bus, 2026-11-12 12:16) showing the full designed flow has 16 decision points, 7 on the host before send, and that a Meta mentor called it too long/complicated. This sketch's single-text-box-first screen 4 already collapses several of those steps into one input. Further cuts are a team decision, not made here — compare this flow against keanu's flowchart once it's live.
