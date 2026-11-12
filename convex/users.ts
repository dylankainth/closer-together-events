import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { HOST_ID } from "./seedData";
import { hashString, initialsOf } from "./fbVerify";

const COLORS = ["#F87171", "#FB923C", "#FBBF24", "#34D399", "#22D3EE", "#60A5FA", "#A78BFA", "#F472B6"];

const newPersonaSettings = {
  talkToMuses: true,
  nudgesOn: true,
  askBeforeRsvp: true,
  askBeforeLocation: true,
  profileApproved: false,
};

// Called only by the verified login action (fbAuth.loginWithFacebook), never by clients.
// First login creates a persona for the person. Facebook's Graph API returns no friends to a
// hackathon app, so the new persona joins the seeded host's friend group (symmetrically, like the
// seed data): the person's real name and photo, with demo friends. It starts with hasMuse: false,
// so the funnel and huddle don't treat a blank profile as a guest Muse until Muse setup is done.
// Later logins just refresh name and photo, and re-create the persona if it was ever deleted.
export const upsertFromFacebook = internalMutation({
  args: {
    fbId: v.string(),
    name: v.string(),
    pictureUrl: v.optional(v.string()),
    email: v.optional(v.string()),
    tokenKind: v.union(v.literal("limited"), v.literal("classic")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_fbId", (q) => q.eq("fbId", args.fbId))
      .unique();
    const personaId = existing?.personaId ?? `fb_${args.fbId}`;

    const persona = await ctx.db
      .query("personas")
      .withIndex("by_personaId", (q) => q.eq("personaId", personaId))
      .unique();
    if (!persona) {
      const host = await ctx.db
        .query("personas")
        .withIndex("by_personaId", (q) => q.eq("personaId", HOST_ID))
        .unique();
      if (!host) throw new Error("Seed data missing: run seed.run before logging in.");
      const friends = Array.from(new Set([HOST_ID, ...host.friends]));
      await ctx.db.insert("personas", {
        personaId,
        name: args.name,
        initials: initialsOf(args.name),
        color: COLORS[hashString(args.fbId) % COLORS.length]!,
        job: "",
        interests: [],
        curious: [],
        vibe: "",
        hop: 1,
        friends,
        features: { msgFreq: 0.5, coAttended: 0.4, sharedGroups: 0.3, taggedPhotos: 0.4 },
        availability: host.availability,
        lastSeen: {},
        memory: [],
        secrets: [],
        neverShare: ["home address", "phone number"],
        hasMuse: false,
        settings: newPersonaSettings,
      });
      // Friendships are symmetric in the seed data, so add the new person to each friend's list.
      for (const fid of friends) {
        const f = await ctx.db
          .query("personas")
          .withIndex("by_personaId", (q) => q.eq("personaId", fid))
          .unique();
        if (f && !f.friends.includes(personaId)) {
          await ctx.db.patch(f._id, { friends: [...f.friends, personaId] });
        }
      }
    } else if (persona.name !== args.name) {
      await ctx.db.patch(persona._id, { name: args.name, initials: initialsOf(args.name) });
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        pictureUrl: args.pictureUrl,
        email: args.email,
        tokenKind: args.tokenKind,
        lastLoginAt: now,
      });
      return { personaId, isNew: false };
    }
    await ctx.db.insert("users", {
      fbId: args.fbId,
      personaId,
      name: args.name,
      pictureUrl: args.pictureUrl,
      email: args.email,
      tokenKind: args.tokenKind,
      createdAt: now,
      lastLoginAt: now,
    });
    return { personaId, isNew: true };
  },
});

// Name and photo for the signed-in persona, for the header avatar. Returns null for seeded personas.
// The photo URL is a signed Facebook CDN link that expires; it refreshes on the next login.
export const profileForPersona = query({
  args: { personaId: v.string() },
  handler: async (ctx, args) => {
    const u = await ctx.db
      .query("users")
      .withIndex("by_personaId", (q) => q.eq("personaId", args.personaId))
      .unique();
    return u ? { name: u.name, pictureUrl: u.pictureUrl ?? null } : null;
  },
});
