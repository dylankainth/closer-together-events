import type { ShortlistItem } from "./types";

// Pins are the host's explicit "my 10 best friends" override — a fixed set of guests that must
// survive a re-rank. Before this, convex/agentTools.ts's rank_guests wrote `shortlist: reranked.data`
// wholesale and convex/funnel.ts computed `selected: idx < cut` purely by rank, so any host
// selection stored on a shortlist item got clobbered the moment ranking ran again. This module is
// the fix: pins live as a separate top-level array of persona ids (see schema.ts), and
// `applyPins` is the one place that reconciles "who the host pinned" against "what rank says" —
// called both right after a fresh rerank and immediately when the host edits their pins, so the
// two paths can never drift apart on the rule.
//
// Rules, in order of precedence:
//   1. A pinned persona is ALWAYS selected, no matter where they land in the rank.
//   2. Remaining slots (quota minus pins present in the shortlist) are filled best-first from the
//      existing order, skipping anyone already pinned.
//   3. Everyone else is unselected.
//   4. A pinned id that isn't in the shortlist at all is silently ignored — there is nothing to
//      flip selected on, and this path cannot invite someone outside the ranked pool.
//   5. No pins (undefined or empty) reproduces exactly today's "top `quota` by rank" behaviour,
//      so existing events with no pinned guests see no change.
//   6. If the host pinned MORE people than the quota, every pin stays selected and nothing else
//      is added. This is deliberate, not a clamp we forgot: quota is a planning target, but a
//      pin is the host naming a specific person they want at the event. Letting the explicit
//      choice outrank the cap keeps the feature honest — "my 10 best friends" must mean exactly
//      that, even if quota says 8.
export function applyPins(
  shortlist: ShortlistItem[],
  pinnedIds: string[] | undefined,
  quota: number,
): ShortlistItem[] {
  const pins = new Set(pinnedIds ?? []);
  const pinnedCount = shortlist.reduce((n, item) => n + (pins.has(item.personaId) ? 1 : 0), 0);
  // Pins that aren't in the shortlist don't take a slot — only the ones actually present count
  // against quota, per rule 4.
  const remaining = Math.max(0, quota - pinnedCount);
  let filled = 0;
  return shortlist.map((item) => {
    if (pins.has(item.personaId)) return { ...item, selected: true };
    if (filled < remaining) {
      filled += 1;
      return { ...item, selected: true };
    }
    return { ...item, selected: false };
  });
}
