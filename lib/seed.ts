import { Persona, Slot, Venue, MuseSettings } from "./types";

export const HOST_ID = "maya";

export const SLOTS: Slot[] = [
  { id: "fri20", label: "Fri 20 Nov, 7pm", part: "Fri after 6" },
  { id: "sat21", label: "Sat 21 Nov, 7pm", part: "Sat evening" },
  { id: "sun22", label: "Sun 22 Nov, 2pm", part: "Sun afternoon" },
  { id: "fri27", label: "Fri 27 Nov, 7pm", part: "Fri 27th after 6" },
  { id: "sat28", label: "Sat 28 Nov, 6pm", part: "Sat 28th evening" },
];

export const VENUES: Venue[] = [
  { id: "rec", name: "The Rec Room", tier: 2, tags: ["bowling", "games", "food", "music"], area: "Mission", capacity: 40, note: "Lanes, arcade, bar food." },
  { id: "lanes", name: "Mission Lanes", tier: 1, tags: ["bowling", "games"], area: "Mission", capacity: 30, note: "Classic cheap lanes." },
  { id: "boulder", name: "Dogpatch Boulders", tier: 2, tags: ["climbing", "fitness", "outdoors"], area: "Dogpatch", capacity: 25, note: "Bouldering gym with a lounge." },
  { id: "ring", name: "Iron Gloves Gym", tier: 1, tags: ["boxing", "fitness"], area: "SoMa", capacity: 20, note: "Private evening sparring class." },
  { id: "loft", name: "Hayes Loft", tier: 3, tags: ["music", "food", "startups", "tech"], area: "Hayes Valley", capacity: 60, note: "Event loft with catering." },
  { id: "park", name: "Dolores Park picnic", tier: 1, tags: ["outdoors", "food", "running"], area: "Dolores", capacity: 80, note: "Free, bring blankets." },
  { id: "den", name: "Maya's place", tier: 1, tags: ["games", "food", "board games", "gaming"], area: "Noe Valley", capacity: 14, note: "Cosy, host-hosted." },
];

const defaultSettings = (): MuseSettings => ({
  talkToMuses: true, nudgesOn: true, askBeforeRsvp: true, askBeforeLocation: true, profileApproved: true,
});

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(2026);
const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];
const COLORS = ["#7C3AED", "#2563EB", "#DB2777", "#059669", "#D97706", "#DC2626", "#0891B2", "#4F46E5"];

const CLUSTERS: Record<string, { interests: string[]; jobs: string[]; vibes: string[] }> = {
  boxing: { interests: ["boxing", "fitness"], jobs: ["personal trainer", "nurse", "software engineer", "product designer"], vibes: ["small groups, active plans"] },
  tech: { interests: ["startups", "tech"], jobs: ["software engineer", "product manager", "tech sales", "data scientist"], vibes: ["low-key, good conversation"] },
  bowling: { interests: ["bowling", "games"], jobs: ["barista", "teacher", "accountant", "photographer"], vibes: ["lively groups, easy plans"] },
  climbing: { interests: ["climbing", "outdoors"], jobs: ["designer", "paramedic", "researcher", "chef"], vibes: ["active, early evenings"] },
  music: { interests: ["live music", "vinyl"], jobs: ["sound engineer", "bartender", "writer", "copywriter"], vibes: ["late nights, big crowds"] },
  foodie: { interests: ["food", "cooking"], jobs: ["chef", "food writer", "consultant", "nurse"], vibes: ["dinners and sharing plates"] },
  gaming: { interests: ["gaming", "board games"], jobs: ["game dev", "student", "analyst", "librarian"], vibes: ["cosy, indoor hangs"] },
  running: { interests: ["running", "fitness"], jobs: ["physio", "teacher", "engineer", "marketer"], vibes: ["morning people, active"] },
};
const CLUSTER_KEYS = Object.keys(CLUSTERS);

const SECRET_POOL: { m: string; s: string; n: string | null }[] = [
  { m: "Therapy every Thursday evening", s: "therapy every thursday", n: "therapy" },
  { m: "Interviewing at another company, hasn't told the team", s: "interviewing at another company", n: null },
  { m: "Salary is 140k and hates people knowing", s: "salary is 140k", n: "salary" },
  { m: "Still hurting after the breakup with Chris", s: "breakup with chris", n: null },
  { m: "Recovering from knee surgery, hiding it", s: "knee surgery", n: null },
  { m: "Owes a friend $2,000", s: "owes a friend", n: "owes" },
  { m: "Phone: 415-555-0188", s: "415-555-0188", n: null },
  { m: "Lives at 17 Folsom St, apt 4", s: "17 folsom", n: null },
];

const initials = (n: string) => n.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

function build(p: Partial<Persona> & { id: string; name: string; job: string; interests: string[] }): Persona {
  return {
    initials: initials(p.name), color: pick(COLORS), curious: [], vibe: "easy plans with friends",
    hop: 1, friends: [], features: { msgFreq: 0.4, coAttended: 0.3, sharedGroups: 0.3, taggedPhotos: 0.2 },
    availability: [], lastSeen: {}, memory: [], secrets: [], neverShare: [], hasMuse: true,
    settings: defaultSettings(), ...p,
  } as Persona;
}

const f = (a: number, b: number, c: number, d: number) => ({ msgFreq: a, coAttended: b, sharedGroups: c, taggedPhotos: d });

// ---- Hand-written personas (used in the demo script) --------------------
function named(): Persona[] {
  return [
    build({
      id: "maya", name: "Maya Chen", job: "product designer", interests: ["bowling", "boxing", "games", "design"],
      vibe: "hosts often, loves a themed night", availability: ["fri20", "sat21", "sun22", "fri27", "sat28"],
      memory: ["Birthday is coming up", "Wants a bowling night with the boxing crowd"],
    }),
    build({
      id: "sam", name: "Sam Okafor", job: "tech sales", interests: ["bowling", "boxing", "tech", "games"],
      vibe: "up for anything with friends", features: f(0.95, 0.9, 0.8, 0.7), availability: ["fri20", "sat21", "fri27"],
      lastSeen: { maya: "August" }, memory: ["Phone: 415-555-0142", "Trains at Iron Gloves on Tuesdays"],
      secrets: ["415-555-0142"], color: "#2563EB",
    }),
    build({
      id: "priya", name: "Priya Nair", job: "software engineer", interests: ["boxing", "tech", "bowling", "startups"],
      curious: ["tech sales"], vibe: "small groups, active plans", features: f(0.9, 0.85, 0.8, 0.75), availability: ["fri20", "sun22", "fri27"],
      lastSeen: { maya: "September", sam: "July" }, memory: ["Lives at 42 Valencia St apt 3", "Asked her Muse about getting into tech sales"],
      secrets: ["42 valencia"], color: "#DB2777",
    }),
    build({
      id: "leo", name: "Leo Martins", job: "nurse", interests: ["boxing", "fitness", "bowling"],
      vibe: "chill hangs after work", features: f(0.8, 0.8, 0.7, 0.6), availability: ["fri20", "sat21"],
      lastSeen: { maya: "last month" }, memory: ["Money is tight this month, skipping anything pricey"],
      secrets: ["money is tight", "tight this month"], neverShare: ["afford"], color: "#059669",
    }),
    build({
      id: "dana", name: "Dana Whitfield", job: "photographer", interests: ["bowling", "photography", "music"],
      vibe: "social but picky about crowds", features: f(0.5, 0.45, 0.4, 0.6), availability: ["fri20", "sat21", "sat28"],
      lastSeen: { maya: "June" }, memory: ["Avoiding Dave after the falling out"], secrets: ["avoiding dave"], neverShare: ["dave"], color: "#D97706",
    }),
    build({
      id: "marco", name: "Marco Rossi", job: "personal trainer", interests: ["boxing", "fitness", "running"],
      features: f(0.8, 0.75, 0.6, 0.5), availability: ["fri20", "sat21", "sun22"], lastSeen: { maya: "two weeks ago" },
      memory: ["Runs the Tuesday boxing class"], vibe: "small groups, active plans", color: "#DC2626",
    }),
    build({
      id: "jess", name: "Jess Park", job: "designer", interests: ["climbing", "outdoors", "design"],
      features: f(0.7, 0.6, 0.5, 0.5), availability: ["sat21", "sun22", "sat28"], lastSeen: { maya: "October" },
      memory: ["Planning a Yosemite trip"], vibe: "active, early evenings", color: "#0891B2",
    }),
    build({
      id: "tessa", name: "Tessa Moore", job: "sound engineer", interests: ["live music", "vinyl", "bowling"],
      features: f(0.55, 0.5, 0.4, 0.45), availability: ["fri20", "fri27", "sat28"], lastSeen: { maya: "August" },
      memory: ["Still hurting after the breakup with Chris"], secrets: ["breakup with chris"], vibe: "late nights, big crowds", color: "#7C3AED",
    }),
    build({
      id: "noah", name: "Noah Kim", job: "game dev", interests: ["gaming", "board games", "tech"],
      features: f(0.6, 0.5, 0.55, 0.3), availability: ["sat21", "sun22", "fri27"], lastSeen: { maya: "September" },
      memory: ["Interviewing at another company, hasn't told the team"], secrets: ["interviewing at another company"], vibe: "cosy, indoor hangs", color: "#4F46E5",
    }),
    build({
      id: "amara", name: "Amara Diallo", job: "physio", interests: ["running", "fitness", "boxing"],
      features: f(0.65, 0.6, 0.5, 0.4), availability: ["fri20", "sun22"], lastSeen: { maya: "last month" },
      memory: ["Half-marathon in December"], vibe: "morning people, active", color: "#059669",
    }),
    build({
      id: "kai", name: "Kai Tanaka", job: "chef", interests: ["food", "cooking", "bowling"],
      features: f(0.7, 0.65, 0.5, 0.55), availability: ["sat21", "fri27", "sat28"], lastSeen: { maya: "July" },
      memory: ["Works Friday nights usually"], vibe: "dinners and sharing plates", color: "#D97706",
    }),
    build({
      id: "ruby", name: "Ruby Alvarez", job: "teacher", interests: ["bowling", "games", "music"],
      features: f(0.75, 0.7, 0.7, 0.65), availability: ["fri20", "sat21", "sun22", "fri27"], lastSeen: { maya: "last week" },
      memory: ["Salary is 140k and hates people knowing"], secrets: ["salary is 140k"], neverShare: ["salary"], vibe: "lively groups, easy plans", color: "#DB2777",
    }),
  ];
}

const FIRST_HOP1 = ["Aiden", "Bianca", "Carlos", "Deepa", "Elena", "Felix", "Grace", "Hugo", "Isla", "Jamal", "Kira", "Liam", "Mei", "Nate", "Olive", "Pedro", "Quinn", "Rosa", "Stefan", "Tara", "Uma", "Victor", "Wren", "Xavier", "Yara", "Zane", "Ben", "Chloe", "Diego", "Emi", "Farah", "Gabe", "Hana", "Ivan", "June", "Kofi", "Lena", "Mo"];
const LAST = ["Reyes", "Shah", "Brooks", "Ito", "Novak", "Haddad", "Silva", "Cohen", "Adeyemi", "Lund", "Ortiz", "Singh", "Baker", "Kovacs", "Ng"];
const FIRST_HOP2 = ["Alex", "Blake", "Cam", "Drew", "Eli", "Finn", "Gia", "Hal", "Ira", "Jo", "Kit", "Lou"];
const MONTHS = ["July", "August", "September", "October", "last month", "last week"];

function generated(): Persona[] {
  const out: Persona[] = [];
  FIRST_HOP1.forEach((first, i) => {
    const key = CLUSTER_KEYS[i % CLUSTER_KEYS.length];
    const c = CLUSTERS[key];
    const secondKey = pick(CLUSTER_KEYS);
    const interests = Array.from(new Set([...c.interests, ...(rand() < 0.5 ? CLUSTERS[secondKey].interests.slice(0, 1) : [])]));
    const sec = rand() < 0.6 ? pick(SECRET_POOL) : null;
    const tie = 0.15 + rand() * 0.55;
    out.push(build({
      id: first.toLowerCase(), name: `${first} ${pick(LAST)}`, job: pick(c.jobs), interests, vibe: c.vibes[0],
      features: f(tie, tie * (0.6 + rand() * 0.4), rand() * 0.7, rand() * 0.6),
      availability: ["fri20", "sat21", "sun22", "fri27", "sat28"].filter(() => rand() < 0.65),
      lastSeen: { maya: pick(MONTHS) },
      memory: sec ? [sec.m] : [], secrets: sec ? [sec.s] : [], neverShare: sec && sec.n ? [sec.n] : [],
      curious: rand() < 0.2 ? ["tech sales"] : [],
    }));
  });
  return out;
}

function fof(hop1: Persona[]): Persona[] {
  return FIRST_HOP2.map((first, i) => {
    const via = hop1[(i * 5 + 3) % hop1.length];
    const c = CLUSTERS[CLUSTER_KEYS[i % CLUSTER_KEYS.length]];
    return build({
      id: `fof_${first.toLowerCase()}`, name: `${first} ${pick(LAST)}`, job: pick(c.jobs), interests: [...c.interests, ...(rand() < 0.5 ? via.interests.slice(0, 1) : [])],
      vibe: c.vibes[0], hop: 2, via: via.id, friends: [via.id],
      features: f(0, 0, 0.1, 0), availability: ["fri20", "sat21", "sun22", "fri27", "sat28"].filter(() => rand() < 0.7),
      lastSeen: {}, memory: [], secrets: [],
    });
  });
}

function wireFriends(all: Persona[]) {
  const hop1 = all.filter((p) => p.hop === 1);
  const byId = new Map(all.map((p) => [p.id, p]));
  hop1.forEach((p) => {
    if (p.id === HOST_ID) return;
    const peers = hop1.filter((q) => q.id !== p.id && q.id !== HOST_ID && q.interests.some((t) => p.interests.includes(t)));
    const set = new Set<string>([HOST_ID, ...peers.slice(0, 6).map((q) => q.id)]);
    for (let i = 0; i < 2; i++) set.add(pick(hop1).id);
    set.delete(p.id);
    p.friends = Array.from(set);
  });
  const maya = byId.get(HOST_ID)!;
  maya.friends = hop1.filter((p) => p.id !== HOST_ID).map((p) => p.id);
  // symmetric friendships for hop1 and FoF links
  hop1.forEach((p) => p.friends.forEach((fid) => { const q = byId.get(fid); if (q && !q.friends.includes(p.id)) q.friends.push(p.id); }));
  all.filter((p) => p.hop === 2).forEach((p) => { const v = byId.get(p.via!); if (v && !v.friends.includes(p.id)) v.friends.push(p.id); });
  // sam lastSeen for a few peers (nudge flavour)
  byId.get("priya")!.lastSeen.sam = "July";
  byId.get("marco")!.lastSeen.sam = "last month";
}

export function buildPersonas(): Persona[] {
  const base = [...named(), ...generated()];
  const all = [...base, ...fof(base)];
  wireFriends(all);
  return all;
}

/** Seeded events hosted by other personas, so Maya's Events tab has "Picked for you". */
export const SEED_EVENTS = [
  { id: "seed_climb", hostId: "jess", title: "Climbing social", topics: ["climbing", "outdoors"], venueId: "boulder", slotId: "sat21", guests: ["maya", "marco", "amara", "kai", "noah", "dana", "tessa"] },
  { id: "seed_music", hostId: "tessa", title: "Vinyl & dumplings night", topics: ["live music", "food"], venueId: "loft", slotId: "fri27", guests: ["maya", "ruby", "dana", "sam", "kai", "jess"] },
];
