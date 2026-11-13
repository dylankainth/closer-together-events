import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireHost } from "./authz";

// Storage for the host's chat with their Muse. Separate from hostChat.ts because that file is
// "use node" (it makes model calls), and Convex queries/mutations can't live in a node-runtime
// module.

const EVENT_BY_ID = (eventId: string) => (q: any) => q.eq("eventId", eventId);

/** The whole thread, oldest first. Host-only: it's their private conversation, and it quotes
 * vendor drafts and planning state that guests never see. */
export const history = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const e = await ctx.db.query("events").withIndex("by_eventId", EVENT_BY_ID(args.eventId)).unique();
    if (!e) return [];
    await requireHost(ctx, e, "read", "hostChatData.history");
    const rows = await ctx.db.query("hostMessages").withIndex("by_eventId", EVENT_BY_ID(args.eventId)).collect();
    return rows.sort((a, b) => a.ts - b.ts).map(({ _id, _creationTime, ...rest }) => rest);
  },
});

/** Appends one turn. Internal: hostChat.reply already checked requireHost before calling it. */
export const append = internalMutation({
  args: {
    eventId: v.string(),
    from: v.union(v.literal("me"), v.literal("agent")),
    text: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("hostMessages", { ...args, ts: Date.now() });
  },
});
