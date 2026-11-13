// Give the demo events more varied names (convex/retitle.ts does the writing).
//
//   node scripts/retitle-events.mjs            # PREVIEW: reads public data, changes nothing, needs no key
//   node scripts/retitle-events.mjs --apply    # really renames them (needs the admin key, see below)
//
// --apply needs admin access from .env.local or the environment:
//   CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY   (the key is never printed)
// and convex/retitle.ts must already be deployed.
//
// Every rename names the title the event has now. If someone has renamed it since, that event is skipped and
// reported, never overwritten. Jess's and Tessa's events are left as they are: their names already read differently.
// Where an event's poster is a Muse Image with the old title printed in it, the new name stays in the same theme.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

// eventId, the title it has now, the title it should get
const RENAMES = [
  ["evt_mwe376gq", "Maya's birthday boxing night", "Ringside Birthday Bash"],
  ["evt_mwe38mdw", "Sam's birthday boxing night", "Gloves Off Birthday Dinner"],
  ["evt_mwe3jo2z", "Priya's birthday boxing night", "Heavy Bag Happy Hour"],
  ["evt_mwe3k8a3", "Leo's birthday bowling night", "Pins, Pints & Cake"],
  ["evt_mwe3kqua", "Maya's birthday running night", "Run Club Birthday After-Party"],
  ["evt_mwe3nfwy", "Sam's birthday boxing night", "Sam's Knockout Birthday"],
  ["evt_mwe3rea6", "Priya's birthday boxing night", "Priya's Main Event"],
  ["evt_mwe3s2o4", "Leo's birthday boxing night", "Leo's Round-by-Round Birthday"],
  ["evt_mwe3w11b", "Maya's birthday boxing night", "Maya's Birthday Fight Night"],
  ["evt_mwe65i5i", "Sam's game night", "Frames & Games Night"],
  ["evt_mwe7wjdc", "Priya's birthday boxing night", "Gloves, Cake & Good Company"],
  ["evt_mwe8565s", "Priya's dylan night", "Friday Night Frames"],
  ["evt_mweb5uup", "Leo's just for fun night", "Cozy Lanes & Comfort Food"],
  ["evt_mwebe8gf", "Maya's team bonding night", "Strike Team Bonding Night"],
  ["evt_mwednlho", "Sam's birthday night", "Ringside Dinner & Drinks"],
  ["evt_mwegmqa5", "Priya's just hanging out to watch the game night", "Game Day at the Lanes"],
].map(([eventId, from, to]) => ({ eventId, from, to }));

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");

function env(name) {
  if (process.env[name]) return process.env[name];
  const file = join(root, ".env.local");
  if (!existsSync(file)) return "";
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] === name) return m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return "";
}

const url = env("CONVEX_SELF_HOSTED_URL") || env("EXPO_PUBLIC_CONVEX_URL");
if (!url) {
  console.error("No deployment URL (CONVEX_SELF_HOSTED_URL or EXPO_PUBLIC_CONVEX_URL in .env.local).");
  process.exit(1);
}
const client = new ConvexHttpClient(url);

// ---- preview: public data only ----
const current = new Map();
for (const id of ["maya", "sam", "priya", "leo", "jess", "tessa"]) {
  const r = await client.query(anyApi.feed.forViewer, { personaId: id });
  for (const e of [...r.recommended, ...r.feed]) if (e.relation !== "pick") current.set(e.eventId, e.title);
}
console.log(`${RENAMES.length} renames (the other ${[...current.keys()].filter((k) => !RENAMES.some((r) => r.eventId === k)).length} events keep their names):\n`);
let mismatches = 0;
RENAMES.forEach((r, i) => {
  const now = current.get(r.eventId);
  const ok = now === r.from;
  if (!ok) mismatches++;
  console.log(`  ${String(i + 1).padStart(2)}. ${ok ? "  " : "!!"} ${r.from}  =>  ${r.to}${ok ? "" : `    (title right now: ${now === undefined ? "event not found" : `"${now}"`}; will be skipped)`}`);
});
console.log(mismatches ? `\n${mismatches} will be skipped because the title has changed or the event is gone.` : "\nAll titles match what is live.");

if (!apply) {
  console.log("\nPreview only: nothing was changed. Re-run with --apply to rename them (needs the admin key).");
  process.exit(0);
}

// ---- apply: admin ----
const key = env("CONVEX_SELF_HOSTED_ADMIN_KEY");
if (!key) {
  console.error("\nMissing CONVEX_SELF_HOSTED_ADMIN_KEY (set it in .env.local or the environment).");
  process.exit(1);
}
client.setAdminAuth(key);
console.log(`\nAPPLYING on ${new URL(url).host} ...`);
try {
  const r = await client.action(anyApi.retitle.retitle, { renames: RENAMES, dryRun: false });
  console.log(`renamed ${r.renamed} of ${RENAMES.length}`);
  if (r.skipped.length) {
    console.log(`${r.skipped.length} skipped:`);
    r.skipped.forEach((s) => console.log(`  ${s.eventId}: ${s.reason}`));
  }
} catch (err) {
  console.error(`failed: ${String(err?.message ?? err).split("\n")[0].slice(0, 300)}`);
  console.error("If it says the function isn't found, convex/retitle.ts hasn't been deployed yet.");
  process.exit(1);
}
