import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    }),
    audienceRaw: v.string(),
    query: v.object({
      tie: v.union(v.literal("close"), v.literal("any")),
      topics: v.array(v.string()),
      raw: v.string(),
    }),
    // Per the team's adopted ballot proposal (B2/B4): no funnel `mode`/`maxAutoInvites` — Muse
    // infers friendsOfFriends + quota and shows each as an editable, reasoned chip on the single
    // review screen. Auto-invite is dropped entirely.
    settings: v.object({
      friendsOfFriends: v.boolean(),
      quota: v.number(),
      reasons: v.object({
        friendsOfFriends: v.string(),
        quota: v.string(),
        guestCount: v.string(),
      }),
    }),
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
    museSource: v.optional(v.string()),
    museCalls: v.number(), // CallBudget.used, persisted so budget survives across action runs
    huddleSeq: v.number(), // monotonic counter for huddleMessages.seq
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

  // ---- app-level bookkeeping ----
  appMeta: defineTable({
    key: v.string(), // "seeded" -> true once seed.run has populated the database
    value: v.any(),
  }).index("by_key", ["key"]),
});
