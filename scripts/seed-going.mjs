// Seed people as already going to the existing events (convex/seedGoing.ts does the writing).
//
//   node scripts/seed-going.mjs            # dry run: reports who would be marked going, changes nothing
//   node scripts/seed-going.mjs --apply    # really does it
//
// Needs admin access from .env.local or the environment (the key is never printed):
//   CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY
// and convex/seedGoing.ts must already be deployed. Safe to re-run. The demo viewers (maya, sam, priya, leo,
// jess, tessa) are never marked going, so their own invitations stay open in the swipe stack.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const KEEP_FREE = ["maya", "sam", "priya", "leo", "jess", "tessa"];
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
const key = env("CONVEX_SELF_HOSTED_ADMIN_KEY");
if (!url || !key) {
  console.error(`Missing ${!url ? "CONVEX_SELF_HOSTED_URL " : ""}${!key ? "CONVEX_SELF_HOSTED_ADMIN_KEY " : ""}(set it in .env.local or the environment).`);
  process.exit(1);
}
const client = new ConvexHttpClient(url);
client.setAdminAuth(key);
console.log(`${apply ? "APPLYING on" : "Dry run on"} ${new URL(url).host} ...`);
try {
  const r = await client.action(anyApi.seedGoing.run, { keepFree: KEEP_FREE, dryRun: !apply });
  console.log(`${r.events} sent events`);
  for (const x of r.results) {
    if (x.skipped) console.log(`  ${x.eventId}: skipped (${x.skipped})`);
    else console.log(`  ${x.eventId}: going ${x.goingNow}/${x.target}  (${x.flipped.length} were invited, ${x.added.length} added)`);
  }
  if (r.dryRun) console.log("Dry run only. Re-run with --apply to write it.");
} catch (err) {
  console.error(`failed: ${String(err?.message ?? err).split("\n")[0].slice(0, 300)}`);
  console.error("If it says the function isn't found, convex/seedGoing.ts hasn't been deployed yet.");
  process.exit(1);
}
