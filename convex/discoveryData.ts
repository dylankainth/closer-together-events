// Event discovery: the merged pool of real events. Internal only (called by the fetch actions and
// the ranker), so nothing here is reachable from the app.
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { discoveredInputV } from "./discoveryValidators";
import { mergeDuplicates, qualifies, WINDOW_DAYS, type DiscoveredInput, type Keyed } from "./discoveryCore";
import type { Doc } from "./_generated/dataModel";

const MAX_DESCRIPTION = 2000;
const DAY_MS = 86_400_000;

function toInput(d: Doc<"discoveredEvents">): DiscoveredInput {
  const { _id, _creationTime, key, fetchedAt, ...rest } = d;
  return rest;
}

/** Merge a batch into the pool by event key. A Facebook record keeps priority over other sources;
 * otherwise the fresh row wins and empty fields are filled from what was stored. */
export const upsertMany = internalMutation({
  args: { items: v.array(discoveredInputV) },
  handler: async (ctx, { items }) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    const batch = items.map((i) => ({ ...i, description: i.description.slice(0, MAX_DESCRIPTION) }));
    for (const item of mergeDuplicates(batch)) {
      const { key, ...fresh } = item;
      const existing = await ctx.db.query("discoveredEvents").withIndex("by_key", (q) => q.eq("key", key)).unique();
      if (!existing) {
        await ctx.db.insert("discoveredEvents", { ...fresh, key, fetchedAt: now });
        inserted += 1;
        continue;
      }
      const [merged] = mergeDuplicates([fresh, toInput(existing)]);
      const { key: _k, ...fields } = merged;
      await ctx.db.patch(existing._id, { ...fields, fetchedAt: now });
      updated += 1;
    }
    return { inserted, updated };
  },
});

/** Events that qualify right now (window, radius, not online or cancelled), soonest first. */
export const candidates = internalQuery({
  args: {},
  handler: async (ctx): Promise<Keyed[]> => {
    const now = Date.now();
    const rows = await ctx.db
      .query("discoveredEvents")
      .withIndex("by_startsAt", (q) => q.gt("startsAt", now).lte("startsAt", now + WINDOW_DAYS * DAY_MS))
      .collect();
    return rows.filter((r) => qualifies(r, now)).map((r) => ({ ...toInput(r), key: r.key }));
  },
});
