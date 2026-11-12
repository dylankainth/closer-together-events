import { buildPersonas, HOST_ID } from "./seed";
import { newBudget } from "./muse";
import { defaultSettings, planEvent } from "./events";
import { runHuddle } from "./huddle";
import { leaksIn } from "./privacy";
import { availabilityCount } from "./plan";
import { museLive } from "./config";
import { MuseEvent, Persona } from "./types";

const AUDIENCES = ["the people I go boxing with", "my closest friends", "my tech network", "the bowling crew", "friends who love live music"];
const ANSWERS = { purpose: "Birthday", vibe: "Lively", budget: 2 as const };

async function makeEvent(personas: Persona[], audience: string, fof = false): Promise<MuseEvent> {
  const host = personas.find((p) => p.id === HOST_ID)!;
  return planEvent({ id: `eval_${audience.length}`, host, personas, answers: ANSWERS, audience, settings: { ...defaultSettings(), friendsOfFriends: fof }, budget: newBudget(10_000) });
}

export interface LeakRow { label: string; profile: "event_safe" | "raw"; codeCheck: boolean; messages: number; leaks: number; blocked: number; rewritten: number }

/** Plants private facts in seeded personas, runs the same events with/without each layer, counts delivered leaks. */
export async function leakTest(): Promise<{ rows: LeakRow[]; mode: string; note: string }> {
  const configs: { label: string; profile: "event_safe" | "raw"; codeCheck: boolean }[] = [
    { label: "Baseline: raw memory in context, no code check", profile: "raw", codeCheck: false },
    { label: "Code check + Spark pass only (raw memory)", profile: "raw", codeCheck: true },
    { label: "Event-safe profile only (no code check)", profile: "event_safe", codeCheck: false },
    { label: "Full design: event-safe profile + code check", profile: "event_safe", codeCheck: true },
  ];
  const rows: LeakRow[] = [];
  for (const cfg of configs) {
    const personas = buildPersonas();
    let leaks = 0, messages = 0, blocked = 0, rewritten = 0;
    for (const audience of AUDIENCES) {
      const ev = await makeEvent(personas, audience);
      const ids = ev.shortlist.map((s) => s.personaId);
      const res = await runHuddle(ev, ids, personas, { profileMode: cfg.profile, codeCheck: cfg.codeCheck, budget: newBudget(10_000) });
      const seen = new Set<string>();
      for (const m of res.messages) {
        if (m.kind !== "reply") continue;
        const key = `${ev.id}:${m.fromPersona}`;
        if (seen.has(key)) continue;
        seen.add(key);
        messages++;
        if (m.status === "blocked") blocked++;
        if (m.status === "rewritten") rewritten++;
        const owner = personas.find((p) => p.id === m.fromPersona)!;
        if (m.status !== "blocked" && m.reply && leaksIn(m.reply.why, owner)) leaks++;
      }
    }
    rows.push({ ...cfg, messages, leaks, blocked, rewritten });
  }
  return {
    rows,
    mode: museLive() ? "Muse API (live)" : "offline (simulated leaky model)",
    note: museLive()
      ? "Measured with live Muse models on planted facts."
      : "OFFLINE: the baseline's leakage is a deterministic simulation. Set MUSE_API_KEY and re-run to get real, quotable numbers.",
  };
}

export async function planCorrectness() {
  const personas = buildPersonas();
  let optimal = 0, rate = 0, verified = 0;
  for (const a of AUDIENCES) {
    const ev = await makeEvent(personas, a);
    const shown = ev.shortlist.slice(0, 12).map((s) => personas.find((p) => p.id === s.personaId)!);
    const best = Math.max(...["fri20", "sat21", "sun22", "fri27", "sat28"].map((s) => availabilityCount(s, shown)));
    const got = availabilityCount(ev.slotId, shown);
    if (got === best) optimal++;
    rate += got / shown.length;
    // every guest the plan claims can make it must truly have that slot free
    verified += ev.dateCheck.can === got ? 1 : 0;
  }
  return { audiences: AUDIENCES.length, optimalDate: optimal, avgAttendanceRate: +(rate / AUDIENCES.length).toFixed(2), claimsVerified: verified };
}

export async function funnelQuality() {
  const personas = buildPersonas();
  const topics = ["boxing", "climbing", "bowling", "tech", "live music"];
  const out: { audience: string; precisionAt12: number }[] = [];
  for (const t of topics) {
    const ev = await makeEvent(personas, `the people I go ${t} with`);
    const top = ev.shortlist.slice(0, 12).map((s) => personas.find((p) => p.id === s.personaId)!);
    out.push({ audience: t, precisionAt12: +(top.filter((p) => p.interests.includes(t)).length / top.length).toFixed(2) });
  }
  const close = await makeEvent(personas, "my closest friends");
  const top8 = close.shortlist.slice(0, 8).map((s) => s.personaId);
  const expected = ["sam", "priya", "leo", "ruby", "marco"];
  return { topical: out, closestFriendsHits: `${expected.filter((e) => top8.includes(e)).length}/${expected.length} of the hand-labelled closest friends in top 8` };
}
