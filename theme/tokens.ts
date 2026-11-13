// Carried over from the old app's Tailwind config (design/sketches/01-muse-events-flow.md).
export const fb = {
  blue: "#0866FF",
  bg: "#F0F2F5",
  ink: "#050505",
  sub: "#65676B",
  line: "#CED0D4",
};

export const muse = {
  500: "#7C3AED",
  600: "#6D28D9",
  100: "#EDE9FE",
};

export const colors = {
  background: fb.bg,
  // Warm off-white used by the host-wizard screens (new-event/*), matching their own reference
  // design rather than the cool-gray Facebook chrome used elsewhere.
  cream: "#F6F3EE",
  card: "#FFFFFF",
  text: fb.ink,
  textMuted: fb.sub,
  border: fb.line,
  accent: fb.blue,
  museAccent: muse[500],
  museAccentDark: muse[600],
  museTint: muse[100],
  success: "#31A24C",
  warning: "#F0A202",
  danger: "#E41E3F",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };
