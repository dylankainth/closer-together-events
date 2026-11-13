// Prepared Muse profiles: the simulated "Connect my Muse" for real (fb_) users. There is no API
// to read a real Muse yet, so a prepared profile per Facebook persona id lives in the Convex env
// var PREPARED_MUSE_PROFILES (JSON, kept out of git). museAdapter.readMuseContext turns it into the
// same Muse-file text demoMuseContext produces, so parsing, approval, the huddle and picks are
// unchanged. Pure: no imports at runtime.
import type { MuseRawContext } from "./museContext";

export interface PreparedProfile {
  interests: string[];
  vibe: string;
  pastEvents: { title: string; category: string | null; feedback: string | null }[];
}

const DEFAULT_PAST_WHEN = Date.UTC(2026, 9, 1, 2); // 30 Sep 2026, evening in California

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function toProfile(v: unknown): PreparedProfile | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (!isStringArray(r.interests) || typeof r.vibe !== "string") return null;
  const past = Array.isArray(r.pastEvents) ? r.pastEvents : [];
  return {
    interests: r.interests,
    vibe: r.vibe,
    pastEvents: past
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && typeof (p as Record<string, unknown>).title === "string")
      .map((p) => ({
        title: p.title as string,
        category: typeof p.category === "string" ? p.category : null,
        feedback: typeof p.feedback === "string" ? p.feedback : null,
      })),
  };
}

/** Prepared profiles by persona id. Bad JSON or malformed entries are ignored, never thrown. */
export function parsePreparedProfiles(json: string | undefined): Record<string, PreparedProfile> {
  if (!json) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, PreparedProfile> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = toProfile(v);
    if (p) out[id] = p;
  }
  return out;
}

/** The same Muse-file text shape demoMuseContext builds, so extractShareableProfile parses it. */
export function museContextFromPrepared(name: string, p: PreparedProfile): MuseRawContext {
  return {
    identity: `# ${name}\nname: ${name}\nvibe: ${p.vibe}\n`,
    user: [`interests: ${p.interests.join(", ")}`, `social style: ${p.vibe}`].join("\n"),
    soul: "## Never share\n",
  };
}

/** pastEvents table rows for a prepared profile. */
export function preparedPastEvents(personaId: string, p: PreparedProfile) {
  return p.pastEvents.map((e, i) => ({ personaId, title: e.title, category: e.category, feedback: e.feedback, when: DEFAULT_PAST_WHEN - i * 7 * 86_400_000 }));
}
