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

/** "Sat 21 Nov, 7pm" -> { month: "NOV", day: "21", weekday: "Sat", time: "7pm" } (null if it doesn't parse). */
export function parseSlot(label: string | null | undefined) {
  if (!label) return null;
  const m = /^(\w{3}) (\d{1,2}) (\w{3}),? (.+)$/.exec(label.trim());
  if (!m) return null;
  return { weekday: m[1], day: m[2], month: m[3].toUpperCase(), time: m[4] };
}

export const priceLabel = (tier: number | null | undefined) => (tier ? "$".repeat(tier) : null);
