// Who may act as whom. Pure (no Convex imports) so the whole decision table is unit-tested.
//
// Personas are "real" (fb_<id>, created on Facebook login) or "seeded" demo data (maya, sam, ...).
// - Anyone, even logged out, may READ seeded demo data.
// - A logged-in person may read and write their own fb_ persona, and never another real user's.
// - A "demo operator" (team allowlist, Convex env DEMO_OPERATOR_PERSONA_IDS) may also WRITE as
//   seeded personas, so presenters can switch to Maya or Sam on stage.
// "owner" is for private data (never-share list, consent, Muse sync) and follows "write" exactly;
// it exists so private reads are never accidentally downgraded to "read".

export type AccessLevel = "read" | "write" | "owner";

export interface Decision {
  allow: boolean;
  reason: string;
}

export function isSeeded(personaId: string): boolean {
  return personaId.length > 0 && !personaId.startsWith("fb_");
}

export function parseOperators(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function decide(opts: {
  callerId: string | null;
  isOperator: boolean;
  targetId: string;
  level: AccessLevel;
}): Decision {
  const { callerId, isOperator, targetId, level } = opts;
  if (!targetId) return { allow: false, reason: "no target persona" };
  if (callerId && callerId === targetId) return { allow: true, reason: "own persona" };
  if (!isSeeded(targetId)) {
    return { allow: false, reason: callerId ? "another real user's persona" : "not signed in" };
  }
  if (level === "read") return { allow: true, reason: "seeded demo data is readable" };
  if (!callerId) return { allow: false, reason: "not signed in" };
  if (isOperator) return { allow: true, reason: "demo operator acting as a seeded persona" };
  return { allow: false, reason: "only demo operators can act as seeded personas" };
}

export type Outcome = "allow" | "deny" | "warn";

// Fails closed: a "no" only becomes a logged warning when AUTHZ_MODE is explicitly "warn" (the
// rollout setting). Unset, empty or a typo denies. Owner-level checks (private data, consent)
// never warn: private data stays private even during rollout.
export function applyMode(mode: string | undefined, allowed: boolean, level?: AccessLevel): Outcome {
  if (allowed) return "allow";
  if (level === "owner") return "deny";
  return (mode ?? "").trim().toLowerCase() === "warn" ? "warn" : "deny";
}

export function canViewEvent(event: { status: string; hostId: string }, guestIds: string[], viewerId: string): boolean {
  return event.status === "sent" || event.hostId === viewerId || guestIds.includes(viewerId);
}

export function canGoIf(viewerFriends: string[], eventGuestIds: string[], friendId: string | undefined): boolean {
  return !!friendId && viewerFriends.includes(friendId) && eventGuestIds.includes(friendId);
}
