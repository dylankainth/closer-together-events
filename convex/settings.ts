import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

async function findPersona(ctx: any, personaId: string) {
  return ctx.db.query("personas").withIndex("by_personaId", (q: any) => q.eq("personaId", personaId)).unique();
}

export const getUserSettings = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    const p = await findPersona(ctx, args.personaId);
    return p ? { settings: p.settings, neverShare: p.neverShare } : null;
  },
});

export const updateUserSettings = mutation({
  args: {
    personaId: v.string(),
    settings: v.object({
      talkToMuses: v.optional(v.boolean()),
      nudgesOn: v.optional(v.boolean()),
      profileApproved: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const p = await findPersona(ctx, args.personaId);
    if (!p) throw new Error("Persona not found");
    // askBeforeRsvp / askBeforeLocation are forced true per claude.md — committing always asks first.
    await ctx.db.patch(p._id, { settings: { ...p.settings, ...args.settings, askBeforeRsvp: true, askBeforeLocation: true } });
  },
});

export const updateNeverShare = mutation({
  args: { personaId: v.string(), topics: v.array(v.string()) },
  handler: async (ctx, args) => {
    const p = await findPersona(ctx, args.personaId);
    if (!p) throw new Error("Persona not found");
    await ctx.db.patch(p._id, { neverShare: args.topics });
  },
});

export const approveProfile = mutation({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    const p = await findPersona(ctx, args.personaId);
    if (!p) throw new Error("Persona not found");
    await ctx.db.patch(p._id, { settings: { ...p.settings, profileApproved: true } });
  },
});
