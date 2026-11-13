"use node";

import { z } from "zod";
import { museJSON, museImage } from "./muse";
import type { CallBudget, HostAnswers, Persona, Slot, Venue } from "./types";

export function availabilityCount(slotId: string, guests: Persona[]): number {
  return guests.filter((g) => g.availability.includes(slotId)).length;
}

export function bestSlot(slots: Slot[], guests: Persona[]): Slot {
  return [...slots].sort((a, b) => availabilityCount(b.id, guests) - availabilityCount(a.id, guests))[0];
}

export interface DatePick {
  slotId: string;
  can: number;
  of: number;
  note: string;
  source: "muse" | "offline";
}

/** "Muse proposes, code verifies, Muse revises once." */
export async function pickDate(slots: Slot[], guests: Persona[], budget: CallBudget): Promise<DatePick> {
  const best = bestSlot(slots, guests);
  const evidence = () => slots.map((s) => ({ slot_id: s.id, label: s.label, can_make_it: availabilityCount(s.id, guests) }));

  const propose = (withEvidence: boolean) =>
    museJSON({
      model: "wonder",
      effort: "low",
      budget,
      system:
        'Pick the best date slot for this event from the given list. You may call a simulated tool `check_availability` (evidence provided below if present) to verify a slot before answering. Return {"slot_id": string}, using exactly one of the given ids (not the label).',
      user: withEvidence
        ? { slots: slots.map((s) => ({ id: s.id, label: s.label })), check_availability: evidence() }
        : { slots: slots.map((s) => ({ id: s.id, label: s.label })) },
      schema: z.object({ slot_id: z.string() }),
      fallback: () => ({ slot_id: best.id }),
    });

  let r = await propose(false);
  let chosen = slots.find((s) => s.id === r.data.slot_id);
  let note = "Muse's pick";
  let source = r.source;

  if (!chosen || availabilityCount(chosen.id, guests) < availabilityCount(best.id, guests)) {
    r = await propose(true);
    chosen = slots.find((s) => s.id === r.data.slot_id);
    note = "Checked in code";
    source = r.source;
  }
  if (!chosen || availabilityCount(chosen.id, guests) < availabilityCount(best.id, guests)) {
    chosen = best;
    note = "Code picked the slot most guests can make";
  }
  return { slotId: chosen.id, can: availabilityCount(chosen.id, guests), of: guests.length, note, source };
}

export function scoreVenue(v: Venue, answers: HostAnswers, topics: string[]): number {
  const topicMatches = v.tags.filter((t) => topics.includes(t)).length;
  const budgetFit = v.tier <= answers.budget ? 1 : -2 * (v.tier - answers.budget);
  const vibeFit =
    answers.vibe === "Fancy"
      ? v.tier >= 2 ? 1 : 0
      : answers.vibe === "Chill"
        ? ["den", "park", "lanes"].includes(v.id) ? 1 : 0
        : v.tags.includes("music") || v.tags.includes("bowling") ? 1 : 0;
  return topicMatches * 2 + budgetFit + vibeFit;
}

export function venueOptions(venues: Venue[], answers: HostAnswers, topics: string[], guestCount: number): Venue[] {
  return venues
    .filter((v) => v.capacity >= guestCount)
    .map((v) => ({ v, score: scoreVenue(v, answers, topics) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.v);
}

export function titleFor(hostFirst: string, answers: HostAnswers, topics: string[]): string {
  const topic = topics[0];
  switch (answers.purpose) {
    case "Birthday":
      return `${hostFirst}'s birthday${topic ? ` ${topic}` : ""} night`;
    case "Housewarming":
      return `${hostFirst}'s housewarming`;
    case "Game night":
      return `${hostFirst}'s game night`;
    default: {
      const base = topic ? topic.replace(/^\w/, (c) => c.toUpperCase()) : answers.purpose;
      return `${hostFirst}'s ${base.toLowerCase()} night`;
    }
  }
}

export function vendorDrafts(answers: HostAnswers, title: string, slot: Slot, venue: Venue, headcount: number) {
  // "pending" so these flow through the same approve/reject UI as drafts proposed later in chat,
  // per claude.md §3.1: the host approves before anything is sent or committed.
  const drafts: { id: string; vendor: string; item: string; draft: string; simulatedReply: string; simulated: true; status: "pending" }[] = [];
  const add = (id: string, vendor: string, item: string, draft: string, simulatedReply: string) =>
    drafts.push({ id, vendor, item, draft, simulatedReply, simulated: true, status: "pending" });

  if (/birthday/i.test(answers.purpose)) {
    add("cake", "Noe Valley Bakery", "cake", `Hi! Could we get a cake for "${title}" (${headcount} people) on ${slot.label}?`, "Sure thing, £30, ready for pickup that morning.");
    add("candles", "Party Parlour", "candles & balloons", `Hi, candles + balloons for ${headcount} guests please.`, "Got it, £12, bundled with pickup.");
  } else if (answers.purpose === "Housewarming") {
    add("snacks", "Tartine Catering", "snack platters", `Snack platters for ${headcount} at a housewarming, ${slot.label}?`, "Yes — £8/head, delivered an hour before.");
    add("favours", "Leaf & Co", "plant favours", `Small plant favours for up to ${Math.min(headcount, 12)} guests?`, "Can do, £6 each, ready by then.");
  } else {
    add("pizza", "Slice House", "pizza", `Pizza for ${headcount} at ${venue.name}, ${slot.label}?`, "Sorted — £9/head, delivered on time.");
  }
  add("venue", venue.name, "venue booking enquiry", `Hi, enquiring about booking ${venue.name} for ${headcount} on ${slot.label}.`, "Looks available — confirming shortly.");
  return drafts;
}

const PALETTES: Record<string, [string, string]> = {
  Chill: ["#60A5FA", "#1877F2"],
  Lively: ["#F472B6", "#7C3AED"],
  Fancy: ["#D4AF37", "#1C1E21"],
};

// Keyword match against a host's free-text revision request (e.g. "make it more blue"), checked
// before falling back to the vibe's default palette. Order matters for overlapping words like
// "gold" vs gold being part of no other key.
const NAMED_PALETTES: [string, [string, string]][] = [
  ["blue", ["#60A5FA", "#1877F2"]],
  ["pink", ["#F472B6", "#DB2777"]],
  ["purple", ["#A78BFA", "#7C3AED"]],
  ["violet", ["#A78BFA", "#7C3AED"]],
  ["green", ["#34D399", "#059669"]],
  ["gold", ["#D4AF37", "#92702A"]],
  ["red", ["#F87171", "#DC2626"]],
  ["orange", ["#FB923C", "#EA580C"]],
  ["warm", ["#FB923C", "#EA580C"]],
  ["dark", ["#4B5563", "#111827"]],
  ["moody", ["#4B5563", "#111827"]],
  ["black", ["#4B5563", "#111827"]],
];

function paletteFor(vibe: string, instruction?: string): [string, string] {
  const s = instruction?.toLowerCase();
  const hit = s ? NAMED_PALETTES.find(([word]) => s.includes(word)) : undefined;
  return hit?.[1] ?? PALETTES[vibe] ?? PALETTES.Lively;
}

function wrapTitle(title: string): string[] {
  const words = title.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > 14) {
      lines.push(line.trim());
      line = w;
    } else {
      line = `${line} ${w}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

export function posterSvg(title: string, slot: Slot, venue: Venue, vibe: string, instruction?: string): string {
  const [c1, c2] = paletteFor(vibe, instruction);
  const lines = wrapTitle(title);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient></defs>
    <rect width="768" height="1024" fill="url(#g)"/>
    <circle cx="640" cy="120" r="140" fill="white" opacity="0.08"/>
    <circle cx="80" cy="900" r="180" fill="white" opacity="0.06"/>
    <text x="48" y="140" font-family="sans-serif" font-size="28" fill="white" opacity="0.85">YOU'RE INVITED</text>
    ${lines.map((l, i) => `<text x="48" y="${220 + i * 64}" font-family="sans-serif" font-size="52" font-weight="700" fill="white">${l}</text>`).join("")}
    <text x="48" y="${220 + lines.length * 64 + 60}" font-family="sans-serif" font-size="26" fill="white" opacity="0.9">${slot.label}</text>
    <text x="48" y="${220 + lines.length * 64 + 96}" font-family="sans-serif" font-size="24" fill="white" opacity="0.8">${venue.name}, ${venue.area}</text>
    <text x="48" y="980" font-family="sans-serif" font-size="18" fill="white" opacity="0.6">Poster by Muse</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function makePoster(title: string, slot: Slot, venue: Venue, vibe: string, budget: CallBudget) {
  const img = await museImage(`An invite poster for "${title}" at ${venue.name}, ${vibe} vibe. No real people.`, budget);
  if (img.url) return { url: img.url, source: img.source };
  return { url: posterSvg(title, slot, venue, vibe), source: "offline" as const };
}

/** Re-draws the poster from a host's revision request in chat (e.g. "make it more blue") —
 * same generation path as makePoster, with the instruction folded into the live prompt and
 * matched against a handful of named palettes for the offline fallback. */
export async function editPoster(title: string, slot: Slot, venue: Venue, vibe: string, instruction: string, budget: CallBudget) {
  const img = await museImage(`An invite poster for "${title}" at ${venue.name}, ${vibe} vibe. Revision requested: ${instruction}. No real people.`, budget);
  if (img.url) return { url: img.url, source: img.source };
  return { url: posterSvg(title, slot, venue, vibe, instruction), source: "offline" as const };
}
