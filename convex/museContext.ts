// Route A of the two real-memories routes (keanu's research 2/3): parse a person's exported Muse
// VM files (SOUL.md, IDENTITY.md, USER.md, ...) into the same shareable-profile shape
// lib/privacy.ts's eventSafeProfile() already produces from seeded personas. This file is the
// single adapter boundary: if Meta opens an internal Muse-read API, only readMuseContext() in
// museAdapter.ts changes — this parsing logic and everything downstream of it stays the same.
//
// Route B (arav/arnav): the live "Connect your Muse" OAuth MCP connector. Different mechanism
// (Muse calls into us, live), not a conflict with this file (we read an exported snapshot).

export interface MuseRawContext {
  soul?: string; // SOUL.md - boundaries, never-share
  identity?: string; // IDENTITY.md - name, vibe, tagline
  user?: string; // USER.md - interests, availability
  memory?: string; // MEMORY.md - durable facts (never parsed for sharing, see below)
}

export interface MuseShareableProfile {
  name: string;
  vibe: string;
  interests: string[];
  socialStyle: string;
  availability: string[]; // slot ids, matched against SLOTS by label text found in USER.md
  neverShare: string[];
}

const SLOT_LABEL_TO_ID: Record<string, string> = {
  "fri 20 nov": "fri20",
  "sat 21 nov": "sat21",
  "sun 22 nov": "sun22",
  "fri 27 nov": "fri27",
  "sat 28 nov": "sat28",
};

function firstMatch(text: string, re: RegExp): string | undefined {
  return re.exec(text)?.[1]?.trim();
}

function listUnderHeading(text: string, heading: string): string[] {
  const re = new RegExp(`${heading}[^\\n]*\\n([\\s\\S]*?)(\\n#{1,3}\\s|$)`, "i");
  const block = re.exec(text)?.[1] ?? "";
  return block
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export function parseName(identity: string): string {
  return firstMatch(identity, /name:\s*(.+)/i) ?? firstMatch(identity, /^#\s*(.+)/m) ?? "Muse user";
}

export function parseVibe(identity: string): string {
  return firstMatch(identity, /vibe:\s*(.+)/i) ?? "Chill";
}

export function parseInterests(user: string): string[] {
  const inline = firstMatch(user, /interests:\s*(.+)/i);
  if (inline) return inline.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
  return listUnderHeading(user, "interests");
}

export function parseSocialStyle(user: string): string {
  return firstMatch(user, /social style:\s*(.+)/i) ?? firstMatch(user, /vibe:\s*(.+)/i) ?? "Chill";
}

export function parseAvailability(user: string): string[] {
  const lines = listUnderHeading(user, "availability");
  const ids: string[] = [];
  for (const line of lines) {
    const match = Object.entries(SLOT_LABEL_TO_ID).find(([label]) => line.toLowerCase().includes(label));
    if (match) ids.push(match[1]);
  }
  return ids;
}

export function parseNeverShare(soul: string): string[] {
  return listUnderHeading(soul, "never share");
}

/** The only place that touches raw .md content: everything downstream only sees the distilled profile. */
export function extractShareableProfile(raw: MuseRawContext): MuseShareableProfile {
  const identity = raw.identity ?? "";
  const user = raw.user ?? "";
  const soul = raw.soul ?? "";
  return {
    name: parseName(identity),
    vibe: parseVibe(identity),
    interests: parseInterests(user),
    socialStyle: parseSocialStyle(user),
    availability: parseAvailability(user),
    neverShare: parseNeverShare(soul),
  };
}
