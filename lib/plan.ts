import { z } from "zod";
import { HostAnswers, Persona, ShortlistItem, Slot, Venue, VendorDraft, AudienceQuery } from "./types";
import { SLOTS, VENUES } from "./seed";
import { museJSON, museImage, CallBudget } from "./muse";

/** Code-only verifier: how many of these guests can make a slot. */
export function availabilityCount(slotId: string, guests: Persona[]): number {
  return guests.filter((g) => g.availability.includes(slotId)).length;
}
export function bestSlot(guests: Persona[]): Slot {
  return [...SLOTS].sort((a, b) => availabilityCount(b.id, guests) - availabilityCount(a.id, guests))[0];
}

export interface DatePick { slot: Slot; can: number; of: number; note: string; source: "muse" | "offline" }

/**
 * Muse (Wonder) proposes a date; code verifies. If verification shows a better slot exists,
 * Muse is shown the evidence and revises once; otherwise code's best slot is used and flagged.
 */
export async function pickDate(guests: Persona[], budget?: CallBudget): Promise<DatePick> {
  const best = bestSlot(guests);
  const evidence = () => SLOTS.map((s) => ({ slot_id: s.id, label: s.label, can_make_it: availabilityCount(s.id, guests) }));
  const Schema = z.object({ slot_id: z.string() });
  const propose = (extra?: unknown) => museJSON({
    model: "wonder", budget,
    system: "Pick the best slot for the event so the most guests can attend. You may call check_availability for any slot; results are provided. Return {\"slot_id\": string}.",
    user: { slots: SLOTS, guests: guests.map((g) => g.id), check_availability: extra ?? "call result not yet available" },
    schema: Schema,
    fallback: () => ({ slot_id: best.id }),
  });
  let r = await propose();
  let slot = SLOTS.find((s) => s.id === r.data.slot_id);
  let note = "";
  if (!slot || availabilityCount(slot.id, guests) < availabilityCount(best.id, guests)) {
    r = await propose(evidence());
    slot = SLOTS.find((s) => s.id === r.data.slot_id);
    note = "Checked in code";
  }
  if (!slot || availabilityCount(slot.id, guests) < availabilityCount(best.id, guests)) { slot = best; note = "Code picked the slot most guests can make"; }
  const can = availabilityCount(slot.id, guests);
  return { slot, can, of: guests.length, note, source: r.source };
}

export function venueOptions(answers: HostAnswers, q: AudienceQuery, guestCount: number): Venue[] {
  const want = new Set(q.topics);
  const scored = VENUES.filter((v) => v.capacity >= guestCount).map((v) => {
    const topic = v.tags.filter((t) => want.has(t)).length;
    const budgetFit = v.tier <= answers.budget ? 1 : -2 * (v.tier - answers.budget);
    const vibe = answers.vibe === "Fancy" ? (v.tier >= 2 ? 1 : 0) : answers.vibe === "Chill" ? (v.id === "den" || v.id === "park" || v.id === "lanes" ? 1 : 0) : (v.tags.includes("music") || v.tags.includes("bowling") ? 1 : 0);
    return { v, s: topic * 2 + budgetFit + vibe };
  });
  return scored.sort((a, b) => b.s - a.s).slice(0, 3).map((x) => x.v);
}

export function titleFor(hostFirst: string, answers: HostAnswers, q: AudienceQuery): string {
  const t = q.topics[0];
  const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  if (answers.purpose === "Birthday") return `${hostFirst}'s birthday${t ? ` ${t}` : ""} night`;
  if (answers.purpose === "Housewarming") return `${hostFirst}'s housewarming`;
  if (answers.purpose === "Game night") return `${hostFirst}'s game night`;
  return `${hostFirst}'s ${t ? cap(t) : answers.purpose.toLowerCase()} night`;
}

export function vendorDrafts(answers: HostAnswers, title: string, slot: Slot, venue: Venue, headcount: number): VendorDraft[] {
  const mk = (id: string, vendor: string, item: string, draft: string, reply: string): VendorDraft => ({ id, vendor, item, draft, simulatedReply: reply, simulated: true });
  const when = slot.label;
  const list: VendorDraft[] = [];
  if (answers.purpose === "Birthday") {
    list.push(mk("cake", "Noe Valley Bakery", "Cake", `Hi! Enquiring about a celebration cake for ${headcount} people, pickup ${when}. Chocolate or lemon, name on top. Budget ${"$".repeat(answers.budget)}.`, `Confirmed: lemon cake for ${headcount}, ready 4pm on the day. (simulated vendor)`));
    list.push(mk("candles", "Party Parlour", "Candles & balloons", `Please set aside a candle set and a small balloon bundle for ${title}, pickup before ${when}.`, "Confirmed: bundle reserved at the till. (simulated vendor)"));
  } else if (answers.purpose === "Housewarming") {
    list.push(mk("snacks", "Tartine Catering", "Snack platters", `Two grazing platters for ${headcount}, delivered ${when}.`, "Confirmed: delivery window 5-6pm. (simulated vendor)"));
    list.push(mk("plants", "Leaf & Co", "Plant favours", `${Math.min(headcount, 12)} small succulents as housewarming favours.`, "Confirmed: pickup Friday. (simulated vendor)"));
  } else {
    list.push(mk("food", "Slice House", "Food", `Pizza for ${headcount} at ${venue.name}, ${when}. Mix of veg and meat.`, "Confirmed: 6 pizzas, arriving 7:15pm. (simulated vendor)"));
  }
  list.push(mk("venue", venue.name, "Venue enquiry", `Hi ${venue.name}, enquiring about a group of ~${headcount} on ${when}. Anything to know about booking?`, `Confirmed: a group booking for ${headcount} is possible. (simulated vendor)`));
  return list;
}

export function posterSvg(title: string, slot: Slot, venue: Venue, vibe: string): string {
  const palettes: Record<string, [string, string, string]> = {
    Chill: ["#2563EB", "#7C3AED", "#BAE6FD"],
    Lively: ["#DB2777", "#F59E0B", "#FDE68A"],
    Fancy: ["#111827", "#7C3AED", "#E9D5FF"],
  };
  const [a, b, c] = palettes[vibe] ?? palettes.Lively;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const words = esc(title).split(" ");
  const lines: string[] = []; let cur = "";
  words.forEach((w) => { if ((cur + " " + w).trim().length > 14) { lines.push(cur.trim()); cur = w; } else cur += " " + w; });
  lines.push(cur.trim());
  const text = lines.slice(0, 4).map((l, i) => `<text x="48" y="${250 + i * 78}" font-size="68" font-weight="800" fill="#fff" font-family="Helvetica,Arial,sans-serif">${l}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><circle cx="500" cy="120" r="140" fill="${c}" opacity=".25"/><circle cx="80" cy="720" r="200" fill="${c}" opacity=".18"/><text x="48" y="110" font-size="22" letter-spacing="6" fill="${c}" font-family="Helvetica,Arial,sans-serif">YOU'RE INVITED</text>${text}<text x="48" y="660" font-size="30" font-weight="700" fill="#fff" font-family="Helvetica,Arial,sans-serif">${esc(slot.label)}</text><text x="48" y="704" font-size="26" fill="${c}" font-family="Helvetica,Arial,sans-serif">${esc(venue.name)} · ${esc(venue.area)}</text><text x="48" y="760" font-size="18" fill="#fff" opacity=".7" font-family="Helvetica,Arial,sans-serif">Poster by Muse</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function makePoster(title: string, slot: Slot, venue: Venue, vibe: string, budget?: CallBudget): Promise<string> {
  const img = await museImage(`Invite poster for "${title}", ${slot.label} at ${venue.name}, ${vibe} vibe, bold type, social event, no real people`, budget);
  return img ?? posterSvg(title, slot, venue, vibe);
}

export type { ShortlistItem };
