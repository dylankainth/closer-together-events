import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getByPersonaId = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("musePersonas").withIndex("by_personaId", (q) => q.eq("personaId", args.personaId)).unique();
    return row ? (({ _id, _creationTime, ...rest }) => rest)(row) : null;
  },
});

/** Approved musePersonas for a set of personaIds, keyed by personaId — huddle.ts overlays these
 * onto the seeded Persona when present, matching the shareable-profile shape either way. */
export const approvedForPersonas = internalQuery({
  args: { personaIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const ids = new Set(args.personaIds);
    const rows = await ctx.db.query("musePersonas").collect();
    const out: Record<string, { name: string; vibe: string; interests: string[]; socialStyle: string; availability: string[]; neverShare: string[] }> = {};
    for (const r of rows) {
      if (r.profileApproved && ids.has(r.personaId)) {
        out[r.personaId] = { name: r.name, vibe: r.vibe, interests: r.interests, socialStyle: r.socialStyle, availability: r.availability, neverShare: r.neverShare };
      }
    }
    return out;
  },
});

export const upsertFromContext = internalMutation({
  args: {
    personaId: v.string(),
    profile: v.object({
      name: v.string(), vibe: v.string(), interests: v.array(v.string()),
      socialStyle: v.string(), availability: v.array(v.string()), neverShare: v.array(v.string()),
    }),
    source: v.union(v.literal("muse"), v.literal("demo")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("musePersonas").withIndex("by_personaId", (q) => q.eq("personaId", args.personaId)).unique();
    const row = { personaId: args.personaId, ...args.profile, source: args.source, lastSyncedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, row);
    } else {
      await ctx.db.insert("musePersonas", { ...row, profileApproved: false });
    }
  },
});

export const setApproved = mutation({
  args: { personaId: v.string(), approved: v.boolean() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("musePersonas").withIndex("by_personaId", (q) => q.eq("personaId", args.personaId)).unique();
    if (!existing) throw new Error("Sync this persona's Muse context first.");
    await ctx.db.patch(existing._id, { profileApproved: args.approved });
    // Approving is the last step of Muse setup, so the persona now counts as a Muse guest in the
    // funnel and huddle. Un-approving leaves hasMuse as it is.
    if (args.approved) {
      const persona = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", args.personaId)).unique();
      if (persona && !persona.hasMuse) await ctx.db.patch(persona._id, { hasMuse: true });
    }
  },
});
