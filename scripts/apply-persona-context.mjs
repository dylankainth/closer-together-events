// Give the 12 named personas their richer context (convex/personaContext.ts + personaContextData.ts).
//
//   node scripts/apply-persona-context.mjs            # dry run: reports who would be updated, changes nothing
//   node scripts/apply-persona-context.mjs --apply    # really writes it
//
// Needs admin access from .env.local or the environment (the key is never printed):
//   CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY
// and convex/personaContext.ts must already be deployed. Safe to re-run.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

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
  const r = await client.mutation(anyApi.personaContext.apply, { dryRun: !apply });
  console.log(`${r.dryRun ? "would update" : "updated"} ${r.updated.length}: ${r.updated.join(", ")}`);
  if (r.missing.length) console.log(`not found in the database: ${r.missing.join(", ")}`);
  if (r.dryRun) console.log("Dry run only. Re-run with --apply to write it.");
} catch (err) {
  console.error(`failed: ${String(err?.message ?? err).split("\n")[0].slice(0, 300)}`);
  console.error("If it says the function isn't found, convex/personaContext.ts hasn't been deployed yet.");
  process.exit(1);
}
