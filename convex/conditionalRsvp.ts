type Guest = { personaId?: string; status: string; goIfFriend?: string };
export type ConditionalState = "waiting" | "ready" | "declined" | "unavailable";

/** Derive from the saved choice, never from whichever friend happens to be suggested today. */
export function conditionalRsvp(viewerId: string, friends: string[], guests: Guest[]): { state: ConditionalState; friendId: string | null } | null {
  const mine = guests.find((g) => g.personaId === viewerId);
  if (mine?.status !== "maybe" || !mine.goIfFriend) return null;
  const id = mine.goIfFriend;
  if (id === viewerId || !friends.includes(id)) return { state: "unavailable", friendId: null };
  const friend = guests.find((g) => g.personaId === id);
  if (!friend) return { state: "unavailable", friendId: id };
  return { friendId: id, state: friend.status === "going" ? "ready" : friend.status === "cant" || friend.status === "skip" ? "declined" : "waiting" };
}
