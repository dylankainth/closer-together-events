// Plain TypeScript shapes mirroring convex/schema.ts, used by pure functions that run before
// (or independently of) a database round-trip — e.g. funnel scoring over an in-memory persona list.

export interface Slot {
  id: string;
  label: string;
  part: string;
}

export interface MuseSettings {
  talkToMuses: boolean;
  nudgesOn: boolean;
  askBeforeRsvp: boolean;
  askBeforeLocation: boolean;
  profileApproved: boolean;
}

export interface Persona {
  id: string;
  name: string;
  initials: string;
  color: string;
  job: string;
  interests: string[];
  curious: string[];
  vibe: string;
  hop: 1 | 2;
  via?: string;
  friends: string[];
  features: { msgFreq: number; coAttended: number; sharedGroups: number; taggedPhotos: number };
  availability: string[];
  lastSeen: Record<string, string>;
  memory: string[];
  secrets: string[];
  neverShare: string[];
  hasMuse: boolean;
  settings: MuseSettings;
}

export interface EventSafeProfile {
  interests: string[];
  socialStyle: string;
  availability: string[];
}

export type Tie = "close" | "any";
export interface AudienceQuery {
  tie: Tie;
  topics: string[];
  raw: string;
}

export interface ShortlistItem {
  personaId: string;
  name: string;
  initials: string;
  color: string;
  score: number;
  tie: number;
  topic: number;
  reason: string;
  available: boolean;
  hop: 1 | 2;
  via?: string;
  selected: boolean;
}

export interface Venue {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  tags: string[];
  area: string;
  capacity: number;
  note: string;
}

export interface VendorDraft {
  id: string;
  vendor: string;
  item: string;
  draft: string;
  simulatedReply: string;
  simulated: true;
}

// Per the team's adopted ballot proposal (B2/B4): no `mode`/`maxAutoInvites`. Muse infers
// friendsOfFriends + quota and surfaces each as a reasoned, editable chip the host approves.
export interface EventSettings {
  friendsOfFriends: boolean;
  quota: number;
  reasons: { friendsOfFriends: string; quota: string; guestCount: string };
}

// Ad-hoc checklist items chat can add on top of the fixed plan-time steps (date/venue/poster/
// vendors/guests/send) — e.g. "email all guests" (kind "send_invites", always blocked for
// approval since it commits) or a free-form ask (kind "custom", resolved or blocked by
// taskRunner.runNext). Stored, not derived, since progress through them is stateful.
export type TaskStatus = "todo" | "active" | "done" | "blocked";
export interface EventTask {
  id: string;
  label: string;
  detail: string;
  kind: "send_invites" | "custom" | "order_cake";
  status: TaskStatus;
  needsYou?: { title: string; body: string };
}

export interface HostAnswers {
  purpose: string;
  vibe: string;
  budget: 1 | 2 | 3;
}

export type RsvpStatus = "invited" | "going" | "maybe" | "skip" | "cant";
export interface Nudge {
  verdict: "worth" | "maybe" | "skip";
  reasons: string[];
  text: string;
}
export interface Guest {
  personaId?: string;
  name: string;
  kind: "muse" | "external";
  status: RsvpStatus;
  nudge?: Nudge;
}

export type MsgStatus = "sent" | "rewritten" | "blocked";
export interface MuseReply {
  event_id: string;
  from_muse: string;
  available: boolean;
  interest_match: number;
  attending_likelihood: "likely" | "maybe" | "unlikely";
  reason_tag: "shared_interest" | "free_time" | "close_friend" | "new_people" | "busy" | "no_fit";
  why: string;
  approved_fields_only: true;
}
export interface HuddleMessage {
  id: string;
  eventId: string;
  kind: "ask" | "reply";
  fromPersona: string;
  toPersona: string;
  forPersona: string;
  text: string;
  reply?: MuseReply;
  status: MsgStatus;
  checks: string[];
  source: "muse" | "offline";
  ts: number;
}

export interface CallBudget {
  used: number;
  max: number;
}
export interface MuseResult<T> {
  data: T;
  source: "muse" | "offline";
}
