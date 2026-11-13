// Make the "friends going" pill on Muse's picks real (convex/seedPickGoing.ts), and optionally re-rank the demo
// viewers' picks so their reasons can mention who is going.
//
//   node scripts/seed-pick-going.mjs                    # dry run: counts, changes nothing
//   node scripts/seed-pick-going.mjs --apply            # marks 2-4 friends going per upcoming event
//   node scripts/seed-pick-going.mjs --rerank           # re-ranks the six demo viewers' picks (Muse calls; run after --apply)
//
// Needs admin access from .env.local or the environment (the key is never printed):
//   CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY
// and convex/seedPickGoing.ts must already be deployed. Safe to re-run.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const VIEWERS = ["maya", "sam", "priya", "leo", "jess", "tessa"];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Set(process.argv.slice(2));
const apply = flags.has("--apply");
const rerank = flags.has("--rerank");

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
try {
  if (rerank) {
    console.log(`Re-ranking ${VIEWERS.join(", ")} on ${new URL(url).host} ...`);
    for (const personaId of VIEWERS) {
      const r = await client.action(anyApi.discoveryRank.rankPersona, { personaId });
      console.log(`  ${personaId}: ${r.picks} picks (${r.source})`);
    }
  } else {
    console.log(`${apply ? "APPLYING on" : "Dry run on"} ${new URL(url).host} ...`);
    const r = await client.action(anyApi.seedPickGoing.run, { keepFree: VIEWERS, dryRun: !apply });
    console.log(`${r.events} upcoming events, ${r.pool} friends to draw from, ${r.dryRun ? "would mark" : "marked"} ${r.marked} as going`);
    if (r.dryRun) console.log("Dry run only. Re-run with --apply to write it.");
  }
} catch (err) {
  console.error(`failed: ${String(err?.message ?? err).split("\n")[0].slice(0, 300)}`);
  console.error("If it says the function isn't found, the code hasn't been deployed yet.");
  process.exit(1);
}
