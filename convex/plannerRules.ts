// Small, pure planner rules shared by convex/plan.ts (title), convex/checklist.ts (vendor step) and
// app/new-event/planning.tsx (when the Send invites row is live). No imports, so tests load it directly.

const LEAD_IN =
  /^(?:(?:i|we)(?:'d| would)?\s+(?:want|like|wanna|plan|need)\s+(?:to\s+)?(?:host|throw|have|plan|organi[sz]e|do|run|put on)\s+|(?:let'?s)\s+(?:do|have|throw|plan|host)\s+|(?:planning|hosting|throwing|having|plan)\s+)/i;
const ARTICLE = /^(?:a|an|my|our|the|some)\s+/i;
const PROPER = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)$/i;
const TRAILING_STOP_WORD = /\s+(?:and|then|with|the|a|an|for|to|of|at|in|on|or|but|plus)$/i;
const MAX_WORDS = 6;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The event title in the host's own words: "Boxing night with the crew" -> "Maya's boxing night with
 * the crew". Drops lead-ins ("I want to throw a ..."), keeps day and month names capitalised, and cuts a
 * long line to a few words without leaving a dangling "and". Returns null when there is nothing usable,
 * so the caller keeps its purpose-based title.
 */
export function titleFromDescription(hostFirst: string, description: string | undefined): string | null {
  if (!description) return null;
  let s = description.replace(/\s+/g, " ").trim().replace(/[.!?,;:\s]+$/, "");
  s = s.replace(new RegExp(`^${escapeRe(hostFirst)}'s\\s+`, "i"), "");
  s = s.replace(LEAD_IN, "").replace(ARTICLE, "");
  let clip = s.split(" ").filter(Boolean).slice(0, MAX_WORDS).join(" ");
  while (TRAILING_STOP_WORD.test(clip)) clip = clip.replace(TRAILING_STOP_WORD, "");
  clip = clip.replace(/[.!?,;:]+$/, "");
  if (clip.replace(/[^\p{L}\p{N}]/gu, "").length < 2) return null;
  const [first, ...rest] = clip.split(" ");
  const keepCapital = PROPER.test(first) || (first.length > 1 && first === first.toUpperCase());
  const firstWord = keepCapital ? first : first.charAt(0).toLowerCase() + first.slice(1);
  return `${hostFirst}'s ${[firstWord, ...rest].join(" ")}`;
}

/** Drafting is finished once drafts exist; drafts awaiting the host's OK are shown as their own
 * approve cards, so they must not keep this step "active" (that showed a spinner forever). A vendor
 * that came back with a problem still blocks it. */
export function vendorStepDone(draftCount: number, blocked: boolean): boolean {
  return draftCount > 0 && !blocked;
}

/** The plan steps that must be settled before invites can go out. Drafts and chat tasks awaiting
 * approval don't gate sending (Manage's Send button never waited for them either). */
export const SEND_PREREQUISITES = ["date", "venue", "guests"] as const;

export function sendReady(items: { key: string; state: string }[]): boolean {
  return SEND_PREREQUISITES.every((k) => items.some((i) => i.key === k && i.state === "done"));
}
