// Pure, deterministic seed-data generation — no DB access, no "use node" (no I/O at all), so this
// can be imported by both the seeding mutation and (later) the eval harness without restriction.

import type { Persona } from "./types";

export const HOST_ID = "maya";

export const SLOTS = [
  { id: "fri20", label: "Fri 20 Nov, 7pm", part: "evening" },
  { id: "sat21", label: "Sat 21 Nov, 7pm", part: "evening" },
  { id: "sun22", label: "Sun 22 Nov, 4pm", part: "afternoon" },
  { id: "fri27", label: "Fri 27 Nov, 7pm", part: "evening" },
  { id: "sat28", label: "Sat 28 Nov, 7pm", part: "evening" },
];

export const VENUES = [
  { id: "rec", name: "The Rec Room", tier: 2 as const, tags: ["bowling", "games"], area: "Mission", capacity: 30, note: "Bar + lanes" },
  { id: "lanes", name: "Mission Lanes", tier: 1 as const, tags: ["bowling"], area: "Mission", capacity: 24, note: "Classic bowling alley" },
  { id: "boulder", name: "Boulder Project", tier: 2 as const, tags: ["climbing", "fitness"], area: "SoMa", capacity: 40, note: "Bouldering gym" },
  { id: "ring", name: "The Ring", tier: 1 as const, tags: ["boxing", "fitness"], area: "Dogpatch", capacity: 20, note: "Boxing gym with a lounge" },
  { id: "loft", name: "Harrison Loft", tier: 3 as const, tags: ["design", "music"], area: "SoMa", capacity: 50, note: "Event loft space" },
  { id: "park", name: "Dolores Park", tier: 1 as const, tags: ["outdoors"], area: "Mission", capacity: 100, note: "Public park" },
  { id: "den", name: "The Den", tier: 1 as const, tags: ["gaming", "food"], area: "Mission", capacity: 18, note: "Game bar" },
];

const CLUSTERS: { topic: string; interests: string[] }[] = [
  { topic: "boxing", interests: ["boxing", "fitness"] },
  { topic: "tech", interests: ["tech", "startups"] },
  { topic: "bowling", interests: ["bowling", "food"] },
  { topic: "climbing", interests: ["climbing", "outdoors"] },
  { topic: "live music", interests: ["live music", "vinyl"] },
  { topic: "food", interests: ["food", "cooking"] },
  { topic: "gaming", interests: ["gaming", "tech"] },
  { topic: "running", interests: ["running", "fitness"] },
];

const SECRET_POOL = [
  { m: "Starting therapy this month.", s: "therapy", n: null },
  { m: "Has a job interview next week.", s: "job interview", n: null },
  { m: "Salary just went up a lot.", s: "salary", n: "salary" },
  { m: "Went through a breakup recently.", s: "breakup", n: null },
  { m: "Recovering from knee surgery.", s: "knee surgery", n: null },
  { m: "Carrying credit card debt.", s: "debt", n: null },
  { m: "Phone number is 415-555-0199.", s: "phone number", n: null },
  { m: "Lives at 42 Valencia St.", s: "home address", n: null },
];

const FIRST_HOP1 = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn", "Reese",
  "Drew", "Skyler", "Rowan", "Elliot", "Charlie", "Finley", "Hayden", "Emerson", "Micah", "Sage",
  "Blake", "Cameron", "Dakota", "Parker", "Spencer", "Shawn", "Lane", "Remy", "Val", "Ash",
  "Teagan", "Wren", "Noa", "Kit", "Jesse", "Lou", "Marlowe", "Frankie",
];
const FIRST_HOP2 = ["Owen", "Mia", "Zoe", "Eli", "Ivy", "Max", "Luna", "Theo", "Nora", "Ezra", "Ada", "Milo"];
const LAST = ["Chen", "Garcia", "Patel", "Kim", "Nguyen", "Brown", "Lee", "Martin", "Clark", "Diaz", "Ibrahim", "Singh", "Okafor", "Rossi", "Haddad"];

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").toUpperCase();
}
const COLORS = ["#F87171", "#FB923C", "#FBBF24", "#34D399", "#22D3EE", "#60A5FA", "#A78BFA", "#F472B6"];

function named(): Persona[] {
  const base = (id: string, name: string, job: string, interests: string[], vibe: string, extra: Partial<Persona> = {}): Persona => ({
    id, name, initials: initials(name), color: COLORS[id.length % COLORS.length], job, interests,
    curious: [], vibe, hop: 1, friends: [],
    features: { msgFreq: 0.5, coAttended: 0.4, sharedGroups: 0.3, taggedPhotos: 0.4 },
    availability: ["fri20", "sat21"], lastSeen: {}, memory: [], secrets: [], neverShare: [],
    hasMuse: true,
    settings: { talkToMuses: true, nudgesOn: true, askBeforeRsvp: true, askBeforeLocation: true, profileApproved: true },
    ...extra,
  });
  return [
    base(HOST_ID, "Maya Chen", "Product designer", ["boxing", "design", "food"], "Lively"),
    base("sam", "Sam Rivera", "Tech sales", ["boxing", "tech"], "Chill", { memory: ["Loves bowling"], lastSeen: { [HOST_ID]: "August" } }),
    base("priya", "Priya Nair", "Software engineer", ["tech", "gaming"], "Chill"),
    base("leo", "Leo Martin", "Barista", ["food", "live music"], "Lively"),
    base("dana", "Dana Okafor", "Nurse", ["fitness", "running"], "Chill", { memory: ["Avoiding Dave lately"], secrets: ["avoiding dave"], neverShare: ["Dave"] }),
    base("marco", "Marco Rossi", "Chef", ["food", "cooking"], "Lively"),
    base("jess", "Jess Kim", "Climbing instructor", ["climbing", "outdoors"], "Chill"),
    base("tessa", "Tessa Brown", "DJ", ["live music", "vinyl"], "Lively"),
    base("noah", "Noah Haddad", "Grad student", ["gaming", "tech"], "Chill"),
    base("amara", "Amara Singh", "Therapist", ["running", "fitness"], "Chill", { memory: ["Money is tight this month"], secrets: ["money is tight"] }),
    base("kai", "Kai Diaz", "Photographer", ["design", "outdoors"], "Lively"),
    base("ruby", "Ruby Clark", "Teacher", ["food", "boxing"], "Chill"),
  ];
}

function generated(): Persona[] {
  const rng = mulberry32(2026);
  const out: Persona[] = [];
  for (let i = 0; i < FIRST_HOP1.length; i++) {
    const first = FIRST_HOP1[i];
    const last = LAST[Math.floor(rng() * LAST.length)];
    const name = `${first} ${last}`;
    const id = `p-gen-${String(i).padStart(3, "0")}`;
    const cluster = CLUSTERS[i % CLUSTERS.length];
    const interests = [...cluster.interests];
    if (rng() < 0.4) interests.push(CLUSTERS[Math.floor(rng() * CLUSTERS.length)].interests[0]);
    const hasSecret = rng() < 0.6;
    const secretEntry = hasSecret ? SECRET_POOL[Math.floor(rng() * SECRET_POOL.length)] : null;
    const tieBase = 0.15 + rng() * 0.55;
    out.push({
      id, name, initials: initials(name), color: COLORS[i % COLORS.length],
      job: `${cluster.topic} enthusiast`, interests, curious: [], vibe: rng() < 0.5 ? "Chill" : "Lively",
      hop: 1, friends: [],
      features: {
        msgFreq: tieBase + rng() * 0.2, coAttended: tieBase + rng() * 0.2,
        sharedGroups: tieBase + rng() * 0.2, taggedPhotos: tieBase + rng() * 0.2,
      },
      availability: SLOTS.filter(() => rng() < 0.65).map((s) => s.id),
      lastSeen: {}, memory: secretEntry ? [secretEntry.m] : [], secrets: secretEntry ? [secretEntry.s] : [],
      neverShare: secretEntry?.n ? [secretEntry.n] : [], hasMuse: true,
      settings: { talkToMuses: true, nudgesOn: true, askBeforeRsvp: true, askBeforeLocation: true, profileApproved: true },
    });
  }
  return out;
}

function fof(hop1: Persona[]): Persona[] {
  return FIRST_HOP2.map((first, i) => {
    const last = LAST[(i * 3 + 1) % LAST.length];
    const name = `${first} ${last}`;
    const id = `p-fof-${String(i).padStart(3, "0")}`;
    const via = hop1[(i * 5 + 3) % hop1.length];
    return {
      id, name, initials: initials(name), color: COLORS[(i + 3) % COLORS.length],
      job: "Friend of a friend", interests: [...via.interests], curious: [], vibe: via.vibe,
      hop: 2 as const, via: via.id, friends: [],
      features: { msgFreq: 0, coAttended: 0, sharedGroups: 0.1, taggedPhotos: 0 },
      availability: SLOTS.filter(() => Math.random() < 0.7).map((s) => s.id),
      lastSeen: {}, memory: [], secrets: [], neverShare: [], hasMuse: true,
      settings: { talkToMuses: true, nudgesOn: true, askBeforeRsvp: true, askBeforeLocation: true, profileApproved: true },
    };
  });
}

function wireFriends(all: Persona[]): Persona[] {
  const byId = new Map(all.map((p) => [p.id, p]));
  const hop1NonHost = all.filter((p) => p.hop === 1 && p.id !== HOST_ID);
  const host = byId.get(HOST_ID)!;
  host.friends = hop1NonHost.map((p) => p.id);

  for (const p of hop1NonHost) {
    const shared = hop1NonHost
      .filter((o) => o.id !== p.id && o.interests.some((i) => p.interests.includes(i)))
      .slice(0, 6)
      .map((o) => o.id);
    const randomPeers = hop1NonHost
      .filter((o) => o.id !== p.id && !shared.includes(o.id))
      .sort(() => Math.random() - 0.5)
      .slice(0, 2)
      .map((o) => o.id);
    p.friends = Array.from(new Set([HOST_ID, ...shared, ...randomPeers]));
  }
  // symmetrize
  for (const p of hop1NonHost) {
    for (const fid of p.friends) {
      const f = byId.get(fid);
      if (f && f.hop === 1 && !f.friends.includes(p.id)) f.friends.push(p.id);
    }
  }
  for (const p of all.filter((p) => p.hop === 2)) {
    if (p.via) byId.get(p.via)?.friends.push(p.id);
    p.friends = p.via ? [p.via] : [];
  }
  host.lastSeen = { sam: "August" };
  return all;
}

export function buildPersonas(): Persona[] {
  const base = [...named(), ...generated()];
  const all = [...base, ...fof(base.filter((p) => p.hop === 1))];
  return wireFriends(all);
}
