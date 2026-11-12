import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { EventSafeProfile, Persona } from "./types";

// Duplicated from privacy.ts rather than imported: that file is "use node" (it calls Spark),
// and a plain query (default/V8 runtime) cannot import a "use node" module in Convex.
function pureEventSafeProfile(p: Persona): EventSafeProfile {
  return { interests: p.interests, socialStyle: p.vibe, availability: p.availability };
}

function toPersona(row: any): Persona {
  const { _id, _creationTime, personaId, ...rest } = row;
  return { id: personaId, ...rest };
}

export const listAll = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("personas").collect()).map(toPersona),
});

export const listAllInternal = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("personas").collect()).map(toPersona),
});

export const getByPersonaId = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("personas")
      .withIndex("by_personaId", (q) => q.eq("personaId", args.personaId))
      .unique();
    return row ? toPersona(row) : null;
  },
});

export const eventSafeProfile = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("personas")
      .withIndex("by_personaId", (q) => q.eq("personaId", args.personaId))
      .unique();
    if (!row) return null;
    return pureEventSafeProfile(toPersona(row));
  },
});
