// Convex validators for event discovery, shared by schema.ts and the discovery functions.
// Field-for-field the DiscoveredInput interface in discoveryCore.ts.
import { v } from "convex/values";

const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());

export const discoveredInputFields = {
  source: v.union(v.literal("facebook"), v.literal("hackradar"), v.literal("parallel"), v.literal("allevents")),
  sourceId: v.string(),
  url: v.string(),
  title: v.string(),
  description: v.string(),
  startsAt: v.number(),
  endsAt: nullableNumber,
  venueName: nullableString,
  address: nullableString,
  city: nullableString,
  lat: nullableNumber,
  lng: nullableNumber,
  organizer: nullableString,
  imageUrl: nullableString,
  category: nullableString,
  price: v.union(v.literal("free"), v.literal("paid"), v.literal("unknown")),
  isOnline: v.boolean(),
  isCancelled: v.boolean(),
  allDay: v.optional(v.boolean()),
};

export const discoveredInputV = v.object(discoveredInputFields);

export const pickVerdictV = v.union(v.literal("go"), v.literal("maybe"));
export const pickKindV = v.union(v.literal("personal"), v.literal("popular"));
export const pickStatusV = v.union(
  v.literal("new"),
  v.literal("going"),
  v.literal("maybe"),
  v.literal("cant"),
  v.literal("snoozed"),
);
export const reasonSourceV = v.union(v.literal("muse"), v.literal("fallback"), v.literal("snapshot"));
