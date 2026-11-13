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

// Palette for the Discover feed (app/events/feed.tsx): the original cream look. Swap these to re-skin the screen.
export const discover = {
  bg: "#F6F3EE",
  headerTint: "#F6F3EE",
  card: "#FFFFFF",
  line: "#E5E1DA",
  text: "#14141C",
  muted: "#6B6B76",
  pill: "#ECE8E0",
  categoryColors: ["#A855F7", "#D69E2E", "#E08A00", "#C79A00", "#4F7CFF", "#EC5FA0", "#14B8A6", "#F97316"],
};

/** "Sat 21 Nov, 7pm" -> { month: "NOV", day: "21", weekday: "Sat", time: "7pm" } (null if it doesn't parse). */
export function parseSlot(label: string | null | undefined) {
  if (!label) return null;
  const m = /^(\w{3}) (\d{1,2}) (\w{3}),? (.+)$/.exec(label.trim());
  if (!m) return null;
  return { weekday: m[1], day: m[2], month: m[3].toUpperCase(), time: m[4] };
}

export const priceLabel = (tier: number | null | undefined) => (tier ? "$".repeat(tier) : null);
