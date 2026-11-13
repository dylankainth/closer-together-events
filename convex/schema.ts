import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { discoveredInputFields, pickKindV, pickStatusV, pickVerdictV, reasonSourceV } from "./discoveryValidators";

// Normalization rule: `guests` and `huddleMessages` are separate tables because the UI needs
// independent, incremental writes (RSVP status per guest; one huddle message at a time as it
// streams) that a client can subscribe to via a reactive query. `venueOptions`/`drafts`/
// `shortlist`/`query` are embedded JSON on the event doc instead: they're produced once by the
// plan action and never mutated field-by-field, so splitting them would only add joins.

const museSettings = v.object({
  talkToMuses: v.boolean(),
  nudgesOn: v.boolean(),
  askBeforeRsvp: v.boolean(),
  askBeforeLocation: v.boolean(),
  profileApproved: v.boolean(),
});

const museReply = v.object({
  event_id: v.string(),
  from_muse: v.string(),
  available: v.boolean(),
  interest_match: v.number(),
  attending_likelihood: v.union(v.literal("likely"), v.literal("maybe"), v.literal("unlikely")),
  reason_tag: v.union(
    v.literal("shared_interest"),
    v.literal("free_time"),
    v.literal("close_friend"),
    v.literal("new_people"),
    v.literal("busy"),
    v.literal("no_fit"),
  ),
  why: v.string(),
  approved_fields_only: v.literal(true),
});

// Ad-hoc checklist items hostChat can add on top of the fixed plan-time steps. "send_invites"
// always lands as "blocked" (committing always asks first, claude.md §5.3); "custom" is resolved
// or blocked by taskRunner.runNext — see convex/types.ts's EventTask for the shape.
const eventTask = v.object({
  id: v.string(),
  label: v.string(),
  detail: v.string(),
  kind: v.union(v.literal("send_invites"), v.literal("custom"), v.literal("order_cake")),
  status: v.union(v.literal("todo"), v.literal("active"), v.literal("done"), v.literal("blocked")),
  needsYou: v.optional(v.object({ title: v.string(), body: v.string() })),
});

// One real tool call the planning agent made (convex/agentLoop.ts), in order. This IS the "your
// agent is on it" trace — checklist.ts reads it back verbatim instead of inferring progress from
// which event fields happen to be filled.
const agentLogEntry = v.object({
  seq: v.number(),
  tool: v.string(),
  args: v.any(),
  summary: v.string(),
  source: v.union(v.literal("muse"), v.literal("offline")),
  ts: v.number(),
});

const nudge = v.object({
  verdict: v.union(v.literal("worth"), v.literal("maybe"), v.literal("skip")),
  reasons: v.array(v.string()),
  text: v.string(),
});

export default defineSchema({
  // ---- static/seed reference data ----
  slots: defineTable({
    slotId: v.string(),
    label: v.string(),
    part: v.string(),
  }).index("by_slotId", ["slotId"]),

  venues: defineTable({
    venueId: v.string(),
    name: v.string(),
    tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    tags: v.array(v.string()),
    area: v.string(),
    capacity: v.number(),
    note: v.string(),
  }).index("by_venueId", ["venueId"]),

  // ---- people ----
  personas: defineTable({
    personaId: v.string(),
    name: v.string(),
    initials: v.string(),
    color: v.string(),
    job: v.string(),
    interests: v.array(v.string()),
    curious: v.array(v.string()),
    vibe: v.string(),
    hop: v.union(v.literal(1), v.literal(2)),
    via: v.optional(v.string()),
    friends: v.array(v.string()),
    features: v.object({
      msgFreq: v.number(),
      coAttended: v.number(),
      sharedGroups: v.number(),
      taggedPhotos: v.number(),
    }),
    availability: v.array(v.string()),
    lastSeen: v.record(v.string(), v.string()),
    memory: v.array(v.string()),
    secrets: v.array(v.string()),
    neverShare: v.array(v.string()),
    shareable: v.optional(v.array(v.string())),
    // What this person actively does NOT want. The model had no way to express a negative
    // preference before — only "no shared interest", which reads as indifference. "I don't do
    // football" is a different answer from "football isn't in my list", and only the first can
    // honestly produce "this isn't for you".
    dislikes: v.optional(v.array(v.string())),
    ties: v.optional(v.record(v.string(), v.string())),
    recentChats: v.optional(v.array(v.string())),
    hasMuse: v.boolean(),
    settings: museSettings,
  }).index("by_personaId", ["personaId"]),

  // ---- events ----
  events: defineTable({
    eventId: v.string(),
    hostId: v.string(),
    title: v.string(),
    status: v.union(v.literal("draft"), v.literal("approved"), v.literal("sent")),
    answers: v.object({
      purpose: v.string(),
      vibe: v.string(),
      budget: v.union(v.literal(1), v.literal(2), v.literal(3)),
      // Asked by Muse in the planner. Public = guests may bring a friend (plus-ones); private = no plus-ones.
      visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
    }),
    audienceRaw: v.string(),
    // Optional: a fresh draft starts with no reading on its audience yet — agentLoop's
    // match_audience tool is what fills this in (and settings below), as its first real step.
    query: v.optional(
      v.object({
        tie: v.union(v.literal("close"), v.literal("any")),
        topics: v.array(v.string()),
        raw: v.string(),
      }),
    ),
    // Per the team's adopted ballot proposal (B2/B4): no funnel `mode`/`maxAutoInvites` — Muse
    // infers friendsOfFriends + quota and shows each as an editable, reasoned chip on the single
    // review screen. Auto-invite is dropped entirely. Optional for the same reason as `query`.
    settings: v.optional(
      v.object({
        friendsOfFriends: v.boolean(),
        quota: v.number(),
        reasons: v.object({
          friendsOfFriends: v.string(),
          quota: v.string(),
          guestCount: v.string(),
        }),
      }),
    ),
    slotId: v.optional(v.string()),
    dateCheck: v.optional(
      v.object({
        note: v.string(),
        can: v.number(),
        of: v.number(),
        source: v.union(v.literal("muse"), v.literal("offline")),
      }),
    ),
    venueId: v.optional(v.string()),
    venueOptions: v.optional(v.array(v.any())), // Venue[] with score, write-once at plan time
    poster: v.optional(
      v.object({ url: v.string(), source: v.union(v.literal("muse"), v.literal("offline")) }),
    ),
    drafts: v.optional(v.array(v.any())), // VendorDraft[], write-once
    shortlist: v.optional(v.array(v.any())), // ShortlistItem[], write-once (re-plan = new event)
    tasks: v.optional(v.array(eventTask)), // chat-added checklist items, appended/updated after plan time
    agentLog: v.optional(v.array(agentLogEntry)), // real tool-call trace from agentLoop.run, in order
    museSource: v.optional(v.string()),
    // Host-edited details (Manage > Details). Optional so events made before these existed still validate.
    description: v.optional(v.string()),
    capacity: v.optional(v.number()),
    // Explicit host opt-in for one friend per original guest; absent means disabled.
    allowGuestInvites: v.optional(v.boolean()),
    // Host gate for acceptance-driven spread (convex/spread.ts): when a guest says yes, close
    // friends of theirs who aren't invited yet get the event surfaced, each still judged by their
    // own Muse. Separate from allowGuestInvites (one explicit plus-one chosen by the guest) —
    // this one is automatic, so it needs its own opt-in. Absent = off.
    allowSpread: v.optional(v.boolean()),
    // Things the host told everyone ("moved to 8pm", "bring a towel"). Embedded rather than a
    // table because they're few, short, written once and only ever read with the event — the same
    // reasoning that keeps venueOptions/drafts here. The host writes these through their Muse in
    // chat; convex/notifications.ts turns each into a notification for every guest.
    announcements: v.optional(
      v.array(v.object({ id: v.string(), text: v.string(), ts: v.number() })),
    ),
    museCalls: v.number(), // CallBudget.used, persisted so budget survives across action runs
    huddleSeq: v.number(), // monotonic counter for huddleMessages.seq
    // How this event's huddle runs (claude.md §5.1). "free" = real multi-turn agent-to-agent
    // conversation per edge (convex/huddleChat.ts); "structured" = one fixed ask and one schema'd
    // reply per peer ("B on the surface, C underneath"). Absent means "free", which is the
    // default — set "structured" explicitly to opt an event out.
    conversationMode: v.optional(v.union(v.literal("structured"), v.literal("free"))),
    createdAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_hostId", ["hostId"])
    .index("by_status", ["status"]),

  // ---- guests: separate table so RSVP mutations + nudge writes are independently reactive ----
  guests: defineTable({
    eventId: v.string(),
    personaId: v.optional(v.string()),
    name: v.string(),
    kind: v.union(v.literal("muse"), v.literal("external")),
    status: v.union(
      v.literal("invited"),
      v.literal("going"),
      v.literal("maybe"),
      v.literal("skip"),
      v.literal("cant"),
    ),
    nudge: v.optional(nudge),
    // Q1 (ballot, agreed 2026-11-12): one-tap post-event "how was it?" — the signal that tells
    // Muse who/what to suggest next time (events.listDiscoverable reads this).
    feedback: v.optional(v.union(v.literal("fun"), v.literal("meh"), v.literal("skip"))),
    // Swipe-card "remind me later": hide this recommendation until this timestamp (ms).
    snoozedUntil: v.optional(v.number()),
    // "Go if <friend> goes": a conditional RSVP, stored as status "maybe" + that friend's personaId.
    goIfFriend: v.optional(v.string()),
    // Guest-initiated invitations cannot themselves expand the guest list.
    invitedByPersonaId: v.optional(v.string()),
    // Who said yes and caused this person to be surfaced the event (convex/spread.ts). Deliberately
    // NOT invitedByPersonaId: that field means "this guest spent their one plus-one on you", and
    // plusOnePolicy counts it to enforce one-each. Spread is automatic and must not consume
    // anyone's plus-one, so it gets its own provenance.
    spreadFrom: v.optional(v.string()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_event_persona", ["eventId", "personaId"]),

  // ---- huddle transcript: separate table, this IS the live-streaming surface ----
  huddleMessages: defineTable({
    eventId: v.string(),
    kind: v.union(v.literal("ask"), v.literal("reply")),
    fromPersona: v.string(),
    toPersona: v.string(),
    forPersona: v.string(), // viewer-visibility filter
    text: v.string(),
    reply: v.optional(museReply),
    status: v.union(v.literal("sent"), v.literal("rewritten"), v.literal("blocked")),
    checks: v.array(v.string()),
    source: v.union(v.literal("muse"), v.literal("offline")),
    ts: v.number(),
    seq: v.number(), // monotonic order within event, for stable client sort
    // Free-conversation mode only (convex/huddleChat.ts): `edgeId` groups the turns of one
    // candidate<->peer exchange, `turn` is the 1-indexed position within it. Both absent for
    // structured-mode messages, which are single-shot and need no grouping.
    edgeId: v.optional(v.string()),
    turn: v.optional(v.number()),
    runId: v.optional(v.id("huddleRuns")),
    attempt: v.optional(v.number()),
  })
    .index("by_eventId_seq", ["eventId", "seq"])
    .index("by_event_forPersona", ["eventId", "forPersona"]),

  // ---- real people who signed in with Facebook ----
  // Login with Facebook gives an app-scoped id, name and photo only (Graph API can't read friends
  // or events), so each user is linked to a persona that carries the seeded social graph.
  users: defineTable({
    fbId: v.string(), // app-scoped Facebook user id (ASID)
    personaId: v.string(),
    name: v.string(),
    pictureUrl: v.optional(v.string()),
    email: v.optional(v.string()),
    tokenKind: v.union(v.literal("limited"), v.literal("classic")),
    createdAt: v.number(),
    lastLoginAt: v.number(),
  })
    .index("by_fbId", ["fbId"])
    .index("by_personaId", ["personaId"]),

  // ---- real-memories route A (additive, parallel to route B's "Connect your Muse" connector):
  // a distilled shareable profile parsed from a person's exported Muse VM files, overlaid onto
  // their persona when profileApproved. Never stores raw .md content, only the filtered subset
  // convex/museContext.ts's extractShareableProfile() produces. ----
  musePersonas: defineTable({
    personaId: v.string(),
    name: v.string(),
    vibe: v.string(),
    interests: v.array(v.string()),
    socialStyle: v.string(),
    availability: v.array(v.string()),
    neverShare: v.array(v.string()),
    source: v.union(v.literal("muse"), v.literal("demo")),
    profileApproved: v.boolean(), // user tapped "Connect my Muse" after previewing the parsed profile
    lastSyncedAt: v.number(),
  }).index("by_personaId", ["personaId"]),

  // ---- adaptive question session (Muse interviews the host before planning) ----
  questionSessions: defineTable({
    hostId: v.string(),
    answers: v.record(v.string(), v.any()),
    status: v.union(v.literal("open"), v.literal("complete"), v.literal("abandoned")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_hostId", ["hostId"]),

  // ---- event discovery: real nearby events merged from outside sources, and each person's
  // Muse picks from them (docs/superpowers/specs/2026-11-13-event-discovery-design.md). Kept apart
  // from `events`, which assumes a host persona, planning fields and the fixed demo slots. ----
  discoveredEvents: defineTable({
    ...discoveredInputFields,
    key: v.string(), // discoveryCore.eventKey: normalised title + local day + city
    fetchedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_startsAt", ["startsAt"]),

  picks: defineTable({
    personaId: v.string(),
    eventKey: v.string(),
    verdict: pickVerdictV,
    reason: v.string(),
    score: v.number(),
    kind: pickKindV,
    status: pickStatusV,
    snoozedUntil: v.optional(v.number()),
    rankedAt: v.number(),
    reasonSource: reasonSourceV,
    // Who is going, each with a one-line reason they matter to this viewer (written by the viewer's Muse at rank time).
    goingNotes: v.optional(v.array(v.object({ id: v.string(), name: v.string(), initials: v.string(), color: v.string(), note: v.string(), friend: v.boolean() }))),
  })
    .index("by_persona", ["personaId"])
    .index("by_persona_key", ["personaId", "eventKey"])
    .index("by_eventKey_status", ["eventKey", "status"]), // friends going to the same pick (card pill only)

  // Events a person went to before, with their one-line "How was it?" answer. Feeds Muse's picks.
  pastEvents: defineTable({
    personaId: v.string(),
    title: v.string(),
    category: v.union(v.string(), v.null()),
    when: v.number(),
    feedback: v.union(v.string(), v.null()),
  }).index("by_persona", ["personaId"]),

  // Independent cohorts allow a later plus-one huddle to recover without restarting everyone.
  huddleRuns: defineTable({
    eventId: v.string(), candidateIds: v.array(v.string()), attempt: v.number(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("failed")),
    leaseUntil: v.number(), updatedAt: v.number(), createdAt: v.number(),
  }).index("by_eventId", ["eventId"]),

  // ---- app-level bookkeeping ----
  // ---- the host's running chat with their Muse on the checklist page ----
  // Its own table rather than an array on the event doc: feed.ts reads whole `events` rows in
  // bulk, and an unbounded conversation hanging off each one is exactly the growth that makes
  // those reads expensive. Separate also means it streams in like huddleMessages does.
  hostMessages: defineTable({
    eventId: v.string(),
    from: v.union(v.literal("me"), v.literal("agent")),
    text: v.string(),
    note: v.optional(v.string()),
    ts: v.number(),
  }).index("by_eventId", ["eventId"]),

  appMeta: defineTable({
    key: v.string(), // "seeded" -> true once seed.run has populated the database
    value: v.any(),
  }).index("by_key", ["key"]),
});
