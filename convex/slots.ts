import { internalQuery, query } from "./_generated/server";

export const list = internalQuery({
  args: {},
  // Dates a host picked on the calendar (slotId "c-...") are left out: the planner only chooses between the seeded slots.
  handler: async (ctx) => (await ctx.db.query("slots").collect()).filter((r) => !r.slotId.startsWith("c-")).map((r) => ({ id: r.slotId, label: r.label, part: r.part })),
});

export const listPublic = query({
  args: {},
  handler: async (ctx) => ctx.db.query("slots").collect(),
});
