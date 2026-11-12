export interface Slot { id: string; label: string; part: string }

export interface MuseSettings {
  talkToMuses: boolean;      // "Talk to friends' Muses about this event" (own grant)
  nudgesOn: boolean;         // receive Muse nudges
  askBeforeRsvp: boolean;    // committing always asks first
  askBeforeLocation: boolean;
  profileApproved: boolean;  // event-safe profile approved once
}

export interface Persona {
  id: string;
  name: string;
  initials: string;
  color: string;
  job: string;
  interests: string[];
  curious: string[];         // topics this person has told their Muse they're curious about
  vibe: string;              // how they like to socialise
  hop: 1 | 2;
  via?: string;              // for hop 2: the mutual friend
  friends: string[];
  features: { msgFreq: number; coAttended: number; sharedGroups: number; taggedPhotos: number };
  availability: string[];    // slot ids
  lastSeen: Record<string, string>;
  memory: string[];          // RAW private memory. Never leaves the Muse.
  secrets: string[];         // planted canaries (lowercase) for the leak test
  neverShare: string[];      // user-set never-share topics
  hasMuse: boolean;
  settings: MuseSettings;
}

export interface EventSafeProfile {
  interests: string[];
  socialStyle: string;
  availability: string[];    // slot labels
}

export type Tie = "close" | "any";
export interface AudienceQuery { tie: Tie; topics: string[]; raw: string }

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

export interface Venue { id: string; name: string; tier: 1 | 2 | 3; tags: string[]; area: string; capacity: number; note: string }
export interface VendorDraft { id: string; vendor: string; item: string; draft: string; simulatedReply: string; simulated: true }

export interface EventSettings {
  friendsOfFriends: boolean;
  mode: "shortlist_and_add" | "auto_invite";
  maxAutoInvites: number;
  quota: number;
}

export interface HostAnswers { purpose: string; vibe: string; budget: 1 | 2 | 3 }

export type RsvpStatus = "invited" | "going" | "maybe" | "skip" | "cant";
export interface Nudge { verdict: "worth" | "maybe" | "skip"; reasons: string[]; text: string }
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
  fromPersona: string;      // persona whose Muse sent it
  toPersona: string;
  forPersona: string;       // whose decision this belongs to
  text: string;             // delivered text ("Muse (Sam): ...")
  reply?: MuseReply;        // delivered structured payload (after the guard)
  status: MsgStatus;
  checks: string[];         // which layers fired
  source: "muse" | "offline";
  ts: number;
}

export interface MuseEvent {
  id: string;
  hostId: string;
  title: string;
  answers: HostAnswers;
  audience: string;
  query: AudienceQuery;
  settings: EventSettings;
  slotId: string;
  dateCheck: { slotId: string; can: number; of: number; note: string };
  venueId: string;
  venueOptions: Venue[];
  poster: string;
  drafts: VendorDraft[];
  shortlist: ShortlistItem[];
  status: "draft" | "approved" | "sent";
  guests: Guest[];
  messages: HuddleMessage[];
  museSource: "muse" | "offline";
  museCalls: number;
  createdAt: number;
}
