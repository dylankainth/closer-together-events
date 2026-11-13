import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { requireActor, requireHost, requireOwner } from "./authz";
import { canOfferInvite, eligibleFriend, invitationLimit, type InvitePerson } from "./plusOnePolicy";

async function load(ctx: any, eventId: string, personaId: string) {
  const event = await ctx.db.query("events").withIndex("by_eventId", (q: any) => q.eq("eventId", eventId)).unique();
  if (!event) return null;
  const [guests, rawPersonas, profiles, venue] = await Promise.all([
    ctx.db.query("guests").withIndex("by_eventId", (q: any) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("personas").collect(),
    ctx.db.query("musePersonas").collect(),
    event.venueId ? ctx.db.query("venues").withIndex("by_venueId", (q: any) => q.eq("venueId", event.venueId)).unique() : null,
  ]);
  // Match the approved availability used by the huddle, without exposing the profile to the caller.
  const approved = new Map(profiles.filter((p: any) => p.profileApproved).map((p: any) => [p.personaId, p.availability]));
  const personas = rawPersonas.map((p: InvitePerson) => approved.has(p.personaId) ? { ...p, availability: approved.get(p.personaId) } : p);
  const viewer = personas.find((p: InvitePerson) => p.personaId === personaId);
  const host = personas.find((p: InvitePerson) => p.personaId === event.hostId);
  return { event, guests, personas: personas as InvitePerson[], viewer, host, capacity: event.capacity ?? venue?.capacity };
}

// Only identity is returned. Availability, interests and the friend's private profile stay server-side.
const identity = (p: InvitePerson) => ({ personaId: p.personaId, name: p.name, initials: p.initials });

export const offer = query({
  args: { eventId: v.string(), personaId: v.string() },
  handler: async (ctx, { eventId, personaId }) => {
    await requireActor(ctx, personaId, "read", "plusOnes.offer");
    const world = await load(ctx, eventId, personaId);
    if (!world || world.event.status !== "sent" || !world.guests.some((g: any) => g.personaId === personaId)) return null;
    const { event, guests, personas, viewer, host, capacity } = world;
    const sent = guests.find((g: any) => g.invitedByPersonaId === personaId);
    if (sent) {
      const friend = personas.find((p) => p.personaId === sent.personaId);
      return friend ? { state: "sent" as const, person: identity(friend) } : null;
    }
    if (!viewer || !host || !canOfferInvite(event, guests, personaId, capacity)) return null;
    const friend = personas.find((p) => eligibleFriend(event, guests, viewer, host, p));
    return friend ? { state: "available" as const, person: identity(friend) } : null;
  },
});

export const invite = mutation({
  args: { eventId: v.string(), personaId: v.string(), friendId: v.string() },
  handler: async (ctx, { eventId, personaId, friendId }) => {
    await requireOwner(ctx, personaId, "plusOnes.invite");
    const world = await load(ctx, eventId, personaId);
    if (!world) throw new ConvexError("Event not found.");
    const { event, guests, personas, viewer, host, capacity } = world;
    // A repeated tap returns the same result without another guest or another huddle.
    const existing = guests.find((g: any) => g.personaId === friendId && g.invitedByPersonaId === personaId);
    if (existing) return;
    const friend = personas.find((p) => p.personaId === friendId);
    if (!viewer || !host || !friend || !canOfferInvite(event, guests, personaId, capacity) ||
      !eligibleFriend(event, guests, viewer, host, friend)) {
      throw new ConvexError("This friend can't be invited now. The guest list or host's permissions may have changed.");
    }
    // Convex commits this row and scheduling atomically. Concurrent taps compete on the same reads.
    await ctx.db.insert("guests", {
      eventId, personaId: friendId, name: friend.name, kind: "muse", status: "invited", invitedByPersonaId: personaId,
    });
    await ctx.scheduler.runAfter(0, internal.huddle.runHuddle, {
      eventId, candidateIds: [friendId], profileMode: "event_safe", codeCheck: true,
    });
  },
});

export const configure = mutation({
  args: { eventId: v.string(), enabled: v.boolean(), limit: v.number() },
  handler: async (ctx, { eventId, enabled, limit }) => {
    const event = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).unique();
    await requireHost(ctx, event, "write", "plusOnes.configure");
    if (!enabled) {
      await ctx.db.patch(event!._id, { allowGuestInvites: false });
      return;
    }
    if (!event!.shortlist) throw new ConvexError("Finish planning before enabling friend invitations.");
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new ConvexError("Invite limit must be a whole number from 1 to 500.");
    const world = (await load(ctx, eventId, event!.hostId))!;
    if (limit < world.guests.length) throw new ConvexError("The limit can't be lower than the existing guest list.");
    if (limit > invitationLimit({ ...event!, settings: { quota: limit } }, world.capacity)) throw new ConvexError("The invite limit can't exceed the event's capacity.");
    const settings = event!.settings ?? { friendsOfFriends: false, quota: limit, reasons: { friendsOfFriends: "", quota: "", guestCount: "" } };
    await ctx.db.patch(event!._id, { allowGuestInvites: true, settings: { ...settings, quota: limit } });
  },
});
