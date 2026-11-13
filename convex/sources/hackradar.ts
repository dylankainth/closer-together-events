// Hack Radar public discovery API (https://hackradar.tech/api/discovery/v1/events) -> DiscoveredInput.
// Pure: no Convex or Node imports, so tests/hackradar.test.mjs runs it against a real captured
// response. Rows that lack a title, id or parseable start time map to null instead of throwing.
import type { DiscoveredInput } from "../discoveryCore";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function time(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export function mapHackRadar(item: unknown): DiscoveredInput | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const id = str(r.id);
  const title = str(r.title);
  // date_only rows carry a calendar date at 00:00Z; keep that day by storing 20:00 UTC (noon or 1pm
  // in California, the same calendar day all year) and mark it all-day so no fake time is shown.
  const allDay = r.date_only === true;
  const dayMatch = allDay ? /^(\d{4})-(\d{2})-(\d{2})/.exec(str(r.start_date) ?? "") : null;
  const startsAt = dayMatch ? Date.UTC(+dayMatch[1], +dayMatch[2] - 1, +dayMatch[3], 20) : time(r.start_date);
  if (!id || !title || startsAt === null) return null;
  const endsAt = allDay ? null : time(r.end_date);
  const geo = (r.geography && typeof r.geography === "object" ? r.geography : {}) as Record<string, unknown>;
  const city = str(r.city) ?? str(geo.name);
  const location = str(r.location);
  return {
    source: "hackradar",
    sourceId: id,
    url: str(r.registration_url) ?? "",
    title,
    description: str(r.description) ?? "",
    startsAt,
    endsAt: endsAt !== null && endsAt >= startsAt ? endsAt : null,
    venueName: null,
    address: location && location !== city ? location : null,
    city,
    lat: num(geo.latitude),
    lng: num(geo.longitude),
    organizer: str(r.organizer_name),
    imageUrl: str(r.image_url),
    category: str(r.category),
    price: r.is_free === true ? "free" : str(r.price_info) ? "paid" : "unknown",
    isOnline: r.is_online === true,
    isCancelled: false,
    ...(allDay ? { allDay: true } : {}),
  };
}
