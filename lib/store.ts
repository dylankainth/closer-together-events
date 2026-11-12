import { HOST_ID, SEED_EVENTS, SLOTS, VENUES, buildPersonas } from "./seed";
import { Guest, MuseEvent, Persona } from "./types";
import { newBudget } from "./muse";
import { runHuddle } from "./huddle";
import { posterSvg } from "./plan";

interface DB { personas: Persona[]; events: Map<string, MuseEvent>; ready: Promise<void> | null; counter: number }
const g = globalThis as unknown as { __muse_db?: DB };

export function db(): DB {
  if (!g.__muse_db) g.__muse_db = { personas: buildPersonas(), events: new Map(), ready: null, counter: 0 };
  return g.__muse_db;
}

export const personaById = (id: string) => db().personas.find((p) => p.id === id);
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(++db().counter).toString(36)}`;

/** Seeds events hosted by other friends and runs their huddles once, so Maya's feed has real "why you" nudges. */
export function ensureSeeded(): Promise<void> {
  const d = db();
  if (!d.ready) {
    d.ready = (async () => {
      for (const s of SEED_EVENTS) {
        const venue = VENUES.find((v) => v.id === s.venueId)!;
        const slot = SLOTS.find((x) => x.id === s.slotId)!;
        const ev: MuseEvent = {
          id: s.id, hostId: s.hostId, title: s.title, answers: { purpose: "Other", vibe: "Lively", budget: 2 }, audience: s.topics.join(", "),
          query: { tie: "any", topics: s.topics, raw: s.topics.join(", ") },
          settings: { friendsOfFriends: false, mode: "shortlist_and_add", maxAutoInvites: 0, quota: 12 },
          slotId: s.slotId, dateCheck: { slotId: s.slotId, can: s.guests.length, of: s.guests.length, note: "" },
          venueId: s.venueId, venueOptions: [venue], poster: posterSvg(s.title, slot, venue, "Lively"), drafts: [], shortlist: [],
          status: "sent", guests: [], messages: [], museSource: "offline", museCalls: 0, createdAt: Date.now(),
        };
        d.events.set(ev.id, ev);
        const budget = newBudget();
        const res = await runHuddle(ev, s.guests, d.personas, { budget });
        ev.messages = res.messages;
        ev.museCalls = res.calls;
        ev.guests = s.guests.map((id): Guest => {
          const p = d.personas.find((x) => x.id === id)!;
          return { personaId: id, name: p.name, kind: "muse", status: "invited", nudge: res.nudges[id] };
        });
      }
    })();
  }
  return d.ready;
}

export const isHostOf = (e: MuseEvent, id: string) => e.hostId === id;
export { HOST_ID };
