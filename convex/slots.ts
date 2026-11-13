import { internalQuery, query } from "./_generated/server";

export const list = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("slots").collect()).map((r) => ({ id: r.slotId, label: r.label, part: r.part })),
});

export const listPublic = query({
  args: {},
  handler: async (ctx) => ctx.db.query("slots").collect(),
});
