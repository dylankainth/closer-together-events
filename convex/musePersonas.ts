import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { allowedAs, requireOwner } from "./authz";
import { internal } from "./_generated/api";

// Owner-only: holds the never-share list and interests. Returns null (not an error) to anyone
// else, so screens that render for a demo persona just hide the box.
export const getByPersonaId = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    if (!(await allowedAs(ctx, args.personaId, "owner", "musePersonas.getByPersonaId"))) return null;
    const row = await ctx.db.query("musePersonas").withIndex("by_personaId", (q) => q.eq("personaId", args.personaId)).unique();
    return row ? (({ _id, _creationTime, ...rest }) => rest)(row) : null;
  },
});

/** Approved musePersonas for a set of personaIds, keyed by personaId: huddle.ts overlays these
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
    // Consent: only the person themself approves what their Muse may share.
    await requireOwner(ctx, args.personaId, "musePersonas.setApproved");
    const existing = await ctx.db.query("musePersonas").withIndex("by_personaId", (q) => q.eq("personaId", args.personaId)).unique();
    if (!existing) throw new Error("Sync this persona's Muse context first.");
    await ctx.db.patch(existing._id, { profileApproved: args.approved });
    // Approving is the last step of Muse setup, so the persona now counts as a Muse guest in the
    // funnel and huddle. Un-approving takes a REAL user (fb_) back out, so the huddle never runs on
    // their blank profile; seeded demo personas keep hasMuse so the demo funnel still has guests.
    const persona = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", args.personaId)).unique();
    if (persona) {
      const hasMuse = args.approved ? true : args.personaId.startsWith("fb_") ? false : persona.hasMuse;
      if (persona.hasMuse !== hasMuse) await ctx.db.patch(persona._id, { hasMuse });
    }
    // Picks follow the approval straight away: personal once approved, popular if withdrawn.
    await ctx.scheduler.runAfter(0, internal.discoveryRank.rankPersona, { personaId: args.personaId });
  },
});
