import { EventSettings, HostAnswers, MuseEvent, Persona } from "./types";
import { CONFIG } from "./config";
import { CallBudget } from "./muse";
import { parseAudience, rerank, retrieve } from "./funnel";
import { makePoster, pickDate, titleFor, vendorDrafts, venueOptions } from "./plan";
import { VENUES } from "./seed";

export const defaultSettings = (): EventSettings => ({ friendsOfFriends: false, mode: "shortlist_and_add", maxAutoInvites: 12, quota: 15 });

/** Host with Muse: audience -> funnel -> date (Muse proposes, code verifies) -> venue, poster, simulated vendor drafts. */
export async function planEvent(opts: {
  id: string; host: Persona; personas: Persona[]; answers: HostAnswers; audience: string; settings: EventSettings; budget: CallBudget;
}): Promise<MuseEvent> {
  const { host, personas, answers, audience, settings, budget } = opts;
  const query = await parseAudience(audience, budget);
  const pool = retrieve(query, personas, settings, host.id);
  const prelim = pool.slice(0, CONFIG.displaySize).map((x) => x.p);
  const date = await pickDate(prelim, budget);
  const shortlist = await rerank(pool, query, date.slot.id, settings, personas, budget);
  const shown = shortlist.slice(0, CONFIG.displaySize).map((s) => personas.find((p) => p.id === s.personaId)!);
  const venues = venueOptions(answers, query, Math.max(shown.length, 6));
  const venue = venues[0] ?? VENUES[0];
  const title = titleFor(host.name.split(" ")[0], answers, query);
  const [poster] = await Promise.all([makePoster(title, date.slot, venue, answers.vibe, budget)]);
  return {
    id: opts.id, hostId: host.id, title, answers, audience, query, settings,
    slotId: date.slot.id,
    dateCheck: { slotId: date.slot.id, can: shown.filter((p) => p.availability.includes(date.slot.id)).length, of: shown.length, note: date.note },
    venueId: venue.id, venueOptions: venues.length ? venues : [venue], poster,
    drafts: vendorDrafts(answers, title, date.slot, venue, Math.max(settings.quota, shown.length)),
    shortlist, status: "draft", guests: [], messages: [], museSource: date.source, museCalls: budget.used, createdAt: Date.now(),
  };
}
