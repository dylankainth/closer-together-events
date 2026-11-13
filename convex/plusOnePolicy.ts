// Shared by the offer query and invitation mutation: a suggestion never grants permission.
export type InvitePerson = {
  personaId: string; name: string; initials: string; friends: string[];
  hasMuse: boolean; availability: string[];
  settings: { talkToMuses: boolean; nudgesOn: boolean };
};
export type InviteGuest = {
  personaId?: string; status: string; invitedByPersonaId?: string;
};
export type InviteEvent = {
  hostId: string; status: string; allowGuestInvites?: boolean; slotId?: string;
  settings?: { quota: number };
  answers?: { visibility?: "public" | "private" };
};

export function invitationLimit(event: InviteEvent, capacity?: number): number {
  const quota = event.settings?.quota;
  if (!quota || !Number.isInteger(quota) || quota < 1) return 0;
  // A public event has room for plus-ones beyond the planned guests: up to as many again, within the venue's capacity.
  const room = event.answers?.visibility === "public" ? quota * 2 : quota;
  return Math.min(room, capacity ?? Infinity);
}

export function canOfferInvite(event: InviteEvent, guests: InviteGuest[], viewerId: string, capacity?: number): boolean {
  const mine = guests.find((g) => g.personaId === viewerId);
  return event.status === "sent" && event.allowGuestInvites === true &&
    viewerId !== event.hostId && mine?.status === "going" && !mine.invitedByPersonaId &&
    !guests.some((g) => g.invitedByPersonaId === viewerId) &&
    guests.length < invitationLimit(event, capacity);
}

export function eligibleFriend(event: InviteEvent, guests: InviteGuest[], viewer: InvitePerson, host: InvitePerson, friend: InvitePerson): boolean {
  return friend.personaId !== viewer.personaId && friend.personaId !== event.hostId &&
    viewer.friends.includes(friend.personaId) &&
    // Preserve the existing send-invites restriction for real Facebook accounts.
    (!friend.personaId.startsWith("fb_") || host.friends.includes(friend.personaId)) &&
    !guests.some((g) => g.personaId === friend.personaId) &&
    friend.hasMuse && friend.settings.talkToMuses && friend.settings.nudgesOn &&
    !!event.slotId && friend.availability.includes(event.slotId);
}
