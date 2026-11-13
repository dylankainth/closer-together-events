import { eligibleFriend, type InviteEvent, type InviteGuest, type InvitePerson } from "./plusOnePolicy";

// Acceptance-driven spread: when a guest says yes, close friends of theirs who aren't invited yet
// get the event surfaced — each still judged by their own Muse, exactly like an original invitee.
// This is the loop the product is built around: an RSVP used to be a terminal state that changed
// one field and reached nobody.
//
// Four rules it will not break, because each is the difference between "useful" and "creepy":
//   1. ONE HOP. Friends of the accepter only. A spread invite never spreads again (`spreadFrom`
//      is set on every row this creates, and accepters who arrived that way are skipped), so an
//      event cannot cascade through the whole graph off one yes.
//   2. HOST-GATED. Only when the host set `allowSpread`. Absent means off.
//   3. CAPPED, twice: MAX_PER_ACCEPTANCE per yes, and the venue's capacity overall.
//   4. NEVER AUTO-RSVPs. Rows land as "invited". The person still decides.

/** A single yes should widen the circle, not empty someone's address book into it. */
export const MAX_PER_ACCEPTANCE = 3;

/**
 * Who this acceptance should reach. Pure so it can be tested without Convex, and so the rules
 * above are readable in one place rather than inferred from mutation code.
 */
export function spreadTargets(
  event: InviteEvent & { allowSpread?: boolean },
  guests: (InviteGuest & { spreadFrom?: string })[],
  accepter: InvitePerson,
  host: InvitePerson,
  byId: Map<string, InvitePerson>,
  capacity?: number,
): string[] {
  if (event.allowSpread !== true || event.status !== "sent") return [];
  if (accepter.personaId === event.hostId) return [];

  const mine = guests.find((g) => g.personaId === accepter.personaId);
  if (mine?.status !== "going") return [];
  // Rule 1: someone who only heard about this through spread doesn't get to spread it onward.
  if (mine.spreadFrom) return [];
  // Idempotent: a guest toggling going -> maybe -> going must not invite a second wave.
  if (guests.some((g) => g.spreadFrom === accepter.personaId)) return [];

  // Rule 3's second half: capped by the event's real capacity, which is what the host is told
  // ("at most three per yes, never past your capacity").
  //
  // This used to subtract from invitationLimit(), and that was wrong in a way no unit test caught
  // because every fixture here hands out generous quota headroom. invitationLimit is the PLUS-ONE
  // budget, derived from settings.quota — and both the seed and the planner set quota to the
  // number of guests they then invite. So room was quota - quota = 0 on essentially every real
  // event, and spread could never fire at all. Found by accepting an invite on a seeded event and
  // watching a guest list of 8 stay a guest list of 8.
  //
  // Capacity is the honest bound: it is the physical constraint, whereas quota only ever meant
  // "how many to invite at plan time", not "the most this event may ever reach". Growth stays
  // bounded without it anyway — three per acceptance, one hop, and every target must be an
  // eligible friend who isn't already invited.
  const room = (capacity ?? Infinity) - guests.length;
  if (room <= 0) return [];

  return accepter.friends
    .map((id) => byId.get(id))
    .filter((f): f is InvitePerson => !!f && eligibleFriend(event, guests, accepter, host, f))
    .slice(0, Math.min(MAX_PER_ACCEPTANCE, room))
    .map((f) => f.personaId);
}
