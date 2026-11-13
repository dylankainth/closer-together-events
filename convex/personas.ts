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

// What any client may see of a persona: the fields the app renders. Never memory, secrets,
// neverShare, availability, friends or settings (memory/secrets hold the leak-test plants).
function publicPersona(row: any) {
  return { id: row.personaId as string, name: row.name as string, initials: row.initials as string, color: row.color as string, job: row.job as string, hop: row.hop as 1 | 2, hasMuse: row.hasMuse as boolean };
}

export const listAll = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("personas").collect()).map(publicPersona),
});

export const listAllInternal = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("personas").collect()).map(toPersona),
});

export const getByPersonaIdInternal = internalQuery({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("personas").withIndex("by_personaId", (q) => q.eq("personaId", args.personaId)).unique();
    return row ? toPersona(row) : null;
  },
});

export const getByPersonaId = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("personas")
      .withIndex("by_personaId", (q) => q.eq("personaId", args.personaId))
      .unique();
    return row ? publicPersona(row) : null;
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
