import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireHost } from "./authz";

/**
 * Manage > Details: the host edits an event's basics by hand. Every field is optional so the form can
 * send only what changed. Unknown slot/venue ids are rejected so a bad edit can't leave the event
 * pointing at something that doesn't exist.
 */
export const updateDetails = mutation({
  args: {
    eventId: v.string(),
    patch: v.object({
      title: v.optional(v.string()),
      slotId: v.optional(v.string()),
      venueId: v.optional(v.string()),
      vibe: v.optional(v.string()),
      description: v.optional(v.string()),
      capacity: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { eventId, patch }) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).unique();
    if (!e) throw new Error("Event not found");
    await requireHost(ctx, e, "write", "manage.updateDetails");

    const next: Record<string, unknown> = {};

    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title) throw new Error("Title can't be empty");
      if (title.length > 120) throw new Error("Title is too long");
      next.title = title;
    }
    if (patch.slotId !== undefined) {
      const slot = await ctx.db.query("slots").withIndex("by_slotId", (q) => q.eq("slotId", patch.slotId!)).unique();
      if (!slot) throw new Error("Unknown date");
      next.slotId = patch.slotId;
    }
    if (patch.venueId !== undefined) {
      const venue = await ctx.db.query("venues").withIndex("by_venueId", (q) => q.eq("venueId", patch.venueId!)).unique();
      if (!venue) throw new Error("Unknown venue");
      next.venueId = patch.venueId;
    }
    if (patch.vibe !== undefined) {
      const vibe = patch.vibe.trim();
      if (!vibe || vibe.length > 40) throw new Error("Vibe must be 1-40 characters");
      next.answers = { ...e.answers, vibe };
    }
    if (patch.description !== undefined) {
      if (patch.description.length > 2000) throw new Error("Description is too long");
      next.description = patch.description.trim();
    }
    if (patch.capacity !== undefined) {
      if (!Number.isInteger(patch.capacity) || patch.capacity < 1 || patch.capacity > 1000) throw new Error("Capacity must be a whole number from 1 to 1000");
      next.capacity = patch.capacity;
    }

    if (Object.keys(next).length > 0) await ctx.db.patch(e._id, next);
  },
});
