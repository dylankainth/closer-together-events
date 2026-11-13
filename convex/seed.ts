import { internalMutation } from "./_generated/server";
import { buildPersonas, HOST_ID, SLOTS, VENUES } from "./seedData";
import { pastEventsFor } from "./discoveryCore";

/**
 * Replaces the old app's serverless-unsafe `globalThis.__muse_db` in-memory store: Convex's
 * tables are the real, persistent, multi-instance-safe store. Guarded by `appMeta.seeded` so it
 * only runs once. Demo events are built directly (no LLM calls) so seeding is deterministic and
 * works with no MUSE_API_KEY.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const already = await ctx.db.query("appMeta").withIndex("by_key", (q) => q.eq("key", "seeded")).unique();
    if (already) return { skipped: true };

    for (const s of SLOTS) await ctx.db.insert("slots", { slotId: s.id, label: s.label, part: s.part });
    for (const v of VENUES) await ctx.db.insert("venues", { venueId: v.id, name: v.name, tier: v.tier, tags: v.tags, area: v.area, capacity: v.capacity, note: v.note });

    const personas = buildPersonas();
    for (const p of personas) {
      const { id, ...rest } = p;
      await ctx.db.insert("personas", { personaId: id, ...rest });
      // Events they went to, so Muse's picks can cite them (event discovery).
      if (p.hasMuse) for (const row of pastEventsFor(id, p.interests)) await ctx.db.insert("pastEvents", row);
    }

    const jess = personas.find((p) => p.id === "jess")!;
    const tessa = personas.find((p) => p.id === "tessa")!;
    const demoGuestIds = (hostId: string) => personas.filter((p) => p.friends.includes(hostId) && p.hasMuse).slice(0, 8).map((p) => p.id);

    const demoEvents = [
      { id: "evt_demo1", host: jess, title: "Jess's climbing social", slotId: "sat21", venueId: "boulder", vibe: "Lively", purpose: "Other" },
      { id: "evt_demo2", host: tessa, title: "Tessa's vinyl & dumplings night", slotId: "fri20", venueId: "den", vibe: "Chill", purpose: "Other" },
    ];

    for (const d of demoEvents) {
      const guestIds = demoGuestIds(d.host.id);
      await ctx.db.insert("events", {
        eventId: d.id,
        hostId: d.host.id,
        title: d.title,
        status: "sent",
        answers: { purpose: d.purpose, vibe: d.vibe, budget: 2 },
        audienceRaw: "my friends",
        query: { tie: "close", topics: [], raw: "my friends" },
        settings: { friendsOfFriends: false, quota: guestIds.length, reasons: { friendsOfFriends: "Kept to close friends for a first event.", quota: `${guestIds.length} close friends fit the vibe.`, guestCount: `${guestIds.length} guests invited.` } },
        slotId: d.slotId,
        dateCheck: { note: "Code picked the slot most guests can make", can: guestIds.length, of: guestIds.length, source: "offline" },
        venueId: d.venueId,
        museSource: "offline",
        museCalls: 0,
        huddleSeq: 0,
        createdAt: Date.now(),
      });
      for (const gid of guestIds) {
        const g = personas.find((p) => p.id === gid)!;
        const available = g.availability.includes(d.slotId);
        await ctx.db.insert("guests", {
          eventId: d.id,
          personaId: gid,
          name: g.name,
          kind: "muse",
          status: "invited",
          nudge: available
            ? { verdict: "worth", reasons: [`${d.host.name.split(" ")[0]} is hosting.`, "You're free then."], text: `${d.host.name.split(" ")[0]} is hosting ${d.title.split("'s ")[1]}. Worth going:\n1. ${d.host.name.split(" ")[0]} is hosting.\n2. You're free then.` }
            : { verdict: "skip", reasons: ["You're not free then."], text: `${d.host.name.split(" ")[0]} is hosting ${d.title.split("'s ")[1]}. Probably skip: you're not free then.` },
        });
      }
    }

    await ctx.db.insert("appMeta", { key: "seeded", value: true });
    return { personas: personas.length, events: demoEvents.length, venues: VENUES.length, slots: SLOTS.length };
  },
});
