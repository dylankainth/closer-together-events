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
  // Secondary muted role, a touch darker than `muted` — body copy on light surfaces that needs a
  // little more contrast than a caption but shouldn't compete with `text`.
  textDim: "#55555F",
  pill: "#ECE8E0",
  categoryColors: ["#A855F7", "#D69E2E", "#E08A00", "#C79A00", "#4F7CFF", "#EC5FA0", "#14B8A6", "#F97316"],
};

// "Your agent is on it" checklist + Muse chat (app/new-event/planning.tsx): the dark look from the designs.
/**
 * The one dark palette for every "Muse at work" surface: the checklist ("your agent is on it"),
 * the swarm, and the agent room. Values come from the committed design export
 * (design/sketches/04-swarm-wow-moment.html), which is the team's reference for these screens.
 *
 * This used to be three near-identical palettes — #141418 vs #0E0F14 for the ground, pure #FFFFFF
 * vs the warmer #F2F1EC for text — close enough to look like a mistake rather than a choice when
 * you moved between the screens. One object now, so they can't drift again. Deliberately separate
 * from theme/tokens.ts, which is the light Facebook chrome the rest of the app wears.
 */
export const agent = {
  bg: "#0E0F14",
  panel: "#15161C",
  card: "#1C1E25",
  bubbleThem: "#23252D",
  line: "#23252D",
  panelLine: "#23252D",
  text: "#F2F1EC",
  muted: "#8A8D96",
  sub: "#B8BAC2",
  dim: "#6E717A",
  todo: "#33363F",
  blue: "#4F6BFF",
  ring: "#AFC0FF",
  link: "#AFC0FF",
  warn: "#F2C14E",
  going: "#5BD69A",
  goingLine: "rgba(91,214,154,0.55)",
  maybe: "#F2C14E",
  darkFg: "#0E0F14",
  // Deeper than `blue`: this fills a chat bubble carrying body text, so it needs enough weight to
  // hold white text at 15px without vibrating against the ground.
  bubbleMe: "#2F4BE8",
  think: "#B8BAC2", // the agent-working trace's italic reasoning line, a touch lighter than `muted`
};

/** "Sat 21 Nov, 7pm" -> { month: "NOV", day: "21", weekday: "Sat", time: "7pm" } (null if it doesn't parse). */
export function parseSlot(label: string | null | undefined) {
  if (!label) return null;
  const m = /^(\w{3}) (\d{1,2}) (\w{3}),? (.+)$/.exec(label.trim());
  if (!m) return null;
  return { weekday: m[1], day: m[2], month: m[3].toUpperCase(), time: m[4] };
}

export const priceLabel = (tier: number | null | undefined) => (tier ? "$".repeat(tier) : null);
