import { internalQuery, query } from "./_generated/server";

export const list = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("venues").collect();
    return rows.map((r) => ({ id: r.venueId, name: r.name, tier: r.tier, tags: r.tags, area: r.area, capacity: r.capacity, note: r.note }));
  },
});

export const listPublic = query({
  args: {},
  handler: async (ctx) => ctx.db.query("venues").collect(),
});
