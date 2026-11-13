// Apify "Facebook Events Scraper" (apify/facebook-events-scraper) dataset rows -> DiscoveredInput.
// Public Facebook events, read without login (Keanu accepted the Meta terms risk; see the design doc).
// Pure: no Convex or Node imports, tested against a real run in tests/apifyFacebook.test.mjs.
import type { DiscoveredInput } from "../discoveryCore";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function organizerOf(r: Record<string, unknown>): string | null {
  const orgs = Array.isArray(r.organizators) ? r.organizators : [];
  const first = orgs.find((o) => o && typeof o === "object" && str((o as Record<string, unknown>).name));
  if (first) return str((first as Record<string, unknown>).name);
  const by = str(r.organizedBy);
  return by ? by.replace(/^Event by\s+/i, "") : null;
}

export function mapApifyFacebook(item: unknown): DiscoveredInput | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const id = str(r.id);
  const title = str(r.name);
  const start = str(r.utcStartDate);
  const startsAt = start ? Date.parse(start) : NaN;
  if (!id || !title || !Number.isFinite(startsAt)) return null;
  const loc = (r.location && typeof r.location === "object" ? r.location : {}) as Record<string, unknown>;
  // placeType is "TEXT" even for named venues, so judge by the text: a leading street number is an address.
  const locName = str(loc.name);
  const isPlace = !!locName && !/^\d/.test(locName);
  const tickets = (r.ticketsInfo && typeof r.ticketsInfo === "object" ? r.ticketsInfo : null) as Record<string, unknown> | null;
  return {
    source: "facebook",
    sourceId: id,
    url: str(r.url) ?? `https://www.facebook.com/events/${id}/`,
    title,
    description: str(r.description) ?? "",
    startsAt,
    endsAt: null,
    venueName: isPlace ? locName : null,
    address: str(r.address) ?? str(loc.streetAddress) ?? (isPlace ? null : locName),
    city: str(loc.city) ?? str(loc.contextualName),
    lat: num(loc.latitude),
    lng: num(loc.longitude),
    organizer: organizerOf(r),
    imageUrl: str(r.imageUrl),
    category: null,
    price: r.paidContent === true || (tickets && str(tickets.price)) ? "paid" : "unknown",
    isOnline: r.isOnline === true,
    isCancelled: r.isCanceled === true,
  };
}
