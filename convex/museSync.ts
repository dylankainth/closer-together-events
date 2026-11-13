"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { readMuseContext } from "./museAdapter";
import { extractShareableProfile } from "./museContext";
import { requireOwner } from "./authz";
import type { Persona } from "./types";

/** "Connect my Muse": read (or simulate reading) this persona's VM context, parse it down to the
 * shareable profile, and store it — unapproved until the user explicitly approves the preview. */
export const syncMuseContext = action({
  args: { personaId: v.string() },
  handler: async (ctx, args): Promise<{ profile: ReturnType<typeof extractShareableProfile>; source: "muse" | "demo" }> => {
    await requireOwner(ctx, args.personaId, "museSync.syncMuseContext");
    const persona: Persona | null = await ctx.runQuery(internal.personas.getByPersonaIdInternal, { personaId: args.personaId });
    if (!persona) throw new Error("Unknown persona");
    const { raw, source } = await readMuseContext(persona);
    const profile = extractShareableProfile(raw);
    await ctx.runMutation(internal.musePersonas.upsertFromContext, { personaId: args.personaId, profile, source });
    return { profile, source };
  },
});
