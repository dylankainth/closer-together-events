// Give every existing event a poster picked at random from assets/banners (convex/banners.ts does the writing).
//
// Needs admin access to the deployment, from .env.local or the environment:
//   CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY   (the key is never printed)
// and convex/banners.ts must already be deployed.
//
//   node scripts/apply-banners.mjs --local    # no network: just list the banners that would be sent
//   node scripts/apply-banners.mjs            # dry run on the deployment: counts events, writes nothing
//   node scripts/apply-banners.mjs --apply    # really replaces every event's poster
//
// Each event gets one banner chosen independently at random. Re-running re-rolls them. The banners are
// stored as data URIs inside the event, the same way Muse Image posters are, so the app never reads these files.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Set(process.argv.slice(2));
const apply = flags.has("--apply");
const localOnly = flags.has("--local");

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

const dir = join(root, "assets", "banners");
const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
if (files.length === 0) {
  console.error(`No images found in ${dir}`);
  process.exit(1);
}
const mime = (f) => (/\.png$/i.test(f) ? "image/png" : /\.webp$/i.test(f) ? "image/webp" : "image/jpeg");
const banners = files.map((f) => `data:${mime(f)};base64,${readFileSync(join(dir, f)).toString("base64")}`);

console.log(`${files.length} banners from assets/banners:`);
files.forEach((f, i) => console.log(`  [${i}] ${f}  ${(banners[i].length / 1024).toFixed(0)} KB as a data URI`));
console.log(`total sent: ${(banners.reduce((n, b) => n + b.length, 0) / 1024 / 1024).toFixed(2)} MB`);
if (localOnly) process.exit(0);

const url = env("CONVEX_SELF_HOSTED_URL") || env("EXPO_PUBLIC_CONVEX_URL");
const key = env("CONVEX_SELF_HOSTED_ADMIN_KEY");
if (!url || !key) {
  console.error(`\nMissing ${!url ? "CONVEX_SELF_HOSTED_URL " : ""}${!key ? "CONVEX_SELF_HOSTED_ADMIN_KEY " : ""}(set it in .env.local or the environment).`);
  process.exit(1);
}

const client = new ConvexHttpClient(url);
client.setAdminAuth(key);
console.log(`\n${apply ? "APPLYING to" : "Dry run on"} ${new URL(url).host} ...`);
try {
  const r = await client.action(anyApi.banners.assignRandom, { banners, dryRun: !apply });
  console.log(`${r.dryRun ? "would update" : "updated"} ${r.updated} of ${r.events} events`);
  console.log("banner index -> events:", JSON.stringify(r.picks));
  if (r.failed.length) {
    console.log(`${r.failed.length} could not be written:`);
    r.failed.forEach((f) => console.log(`  ${f.eventId}: ${f.error}`));
  }
  if (r.dryRun) console.log("Dry run only. Re-run with --apply to replace the posters.");
} catch (err) {
  console.error(`failed: ${String(err?.message ?? err).split("\n")[0].slice(0, 300)}`);
  console.error("If it says the function isn't found, convex/banners.ts hasn't been deployed yet.");
  process.exit(1);
}
