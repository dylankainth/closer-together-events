"use node";

// THIS IS THE DEMO HOOK. Swap demoMuseContext() for a real internal call the day Meta opens one;
// everything else (museContext.ts parsing, musePersonas.ts, huddle.ts) stays the same either way.
import type { Persona } from "./types";
import type { MuseRawContext } from "./museContext";

const SLOT_LABELS: Record<string, string> = {
  fri20: "Fri 20 Nov", sat21: "Sat 21 Nov", sun22: "Sun 22 Nov", fri27: "Fri 27 Nov", sat28: "Sat 28 Nov",
};

/** Demo mode: synthesize plausible VM markdown from the seeded persona, so the full parse
 * pipeline (museContext.ts) runs on real-shaped text even with no internal Muse API. */
function demoMuseContext(p: Persona): MuseRawContext {
  return {
    identity: `# ${p.name}\nname: ${p.name}\nvibe: ${p.vibe}\n`,
    user: [
      `interests: ${p.interests.join(", ")}`,
      `social style: ${p.vibe}`,
      `## Availability`,
      ...p.availability.map((id) => `- ${SLOT_LABELS[id] ?? id}`),
    ].join("\n"),
    soul: [`## Never share`, ...p.neverShare.map((t) => `- ${t}`)].join("\n"),
  };
}

export async function readMuseContext(persona: Persona): Promise<{ raw: MuseRawContext; source: "muse" | "demo" }> {
  if (!process.env.INTERNAL_MUSE_API_KEY) {
    return { raw: demoMuseContext(persona), source: "demo" };
  }
  // Real mode: no public internal Muse-read API is documented as of 2026-11-12 (keanu's research).
  // Left as the adapter boundary for when/if one exists; falls back to demo rather than failing.
  return { raw: demoMuseContext(persona), source: "demo" };
}
