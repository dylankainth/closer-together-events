// Colours for the recommended-events swipe stack, event page and feed (from the design mockups).
// Kept out of theme/tokens.ts on purpose: that file is shared and holds the Facebook chrome palette.
export const swipe = {
  blue: "#3447E4", // swipe stack background
  blueDeep: "#222A8C", // banner placeholder
  blueSoft: "rgba(255,255,255,0.18)", // card peeking behind the front card
  ink: "#14141C", // primary dark buttons / text on cream
  lavender: "#E6E9FF", // "why you'd like this" panel
  lavenderLine: "#CDD3FF",
  lavenderText: "#3447E4",
  chip: "#FFFFFF",
  cream: "#F6F3EE",
};

// Dark palette for the Discover feed (app/events/feed.tsx). Swap these to re-skin the whole screen.
export const discover = {
  bg: "#161618",
  headerTint: "#2A1F3D",
  card: "#222226",
  line: "#2E2E34",
  text: "#FFFFFF",
  muted: "#9A9AA4",
  badge: "#E8793B", // status badge on a row (Hosting / Going / Invited)
  pill: "#2B2B30",
  categoryColors: ["#A855F7", "#D69E2E", "#F5A524", "#E0B000", "#4F7CFF", "#EC5FA0", "#2DD4BF", "#F97316"],
};

/** "Sat 21 Nov, 7pm" -> { month: "NOV", day: "21", weekday: "Sat", time: "7pm" } (null if it doesn't parse). */
export function parseSlot(label: string | null | undefined) {
  if (!label) return null;
  const m = /^(\w{3}) (\d{1,2}) (\w{3}),? (.+)$/.exec(label.trim());
  if (!m) return null;
  return { weekday: m[1], day: m[2], month: m[3].toUpperCase(), time: m[4] };
}

export const priceLabel = (tier: number | null | undefined) => (tier ? "$".repeat(tier) : null);
