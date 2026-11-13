// Spread one host's events over several hosts (convex/redistribute.ts does the writing).
//
//   node scripts/redistribute-hosts.mjs                    # PREVIEW only: reads public data, changes nothing, needs no key
//   node scripts/redistribute-hosts.mjs --apply            # really moves the events (needs the admin key, see below)
//   node scripts/redistribute-hosts.mjs --from=maya --to=maya,sam,priya,leo   # these are the defaults
//
// --apply needs admin access from .env.local or the environment:
//   CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY   (the key is never printed)
// and convex/redistribute.ts must already be deployed.
//
// The events are taken oldest first and dealt out to the hosts in turn. A moved event is renamed if its title starts
// with the old host's first name ("Maya's ..." -> "Sam's ...") and the new host is removed from its guest list.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const opt = (name, fallback) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const from = opt("from", "maya");
const to = opt("to", "maya,sam,priya,leo").split(",").map((s) => s.trim()).filter(Boolean);

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
const first = (n) => n.split(" ")[0];

// ---- preview: public data only ----
const people = await client.query(anyApi.personas.listAll, {});
const byId = new Map(people.map((p) => [p.id, p]));
for (const id of [from, ...to]) {
  if (!byId.has(id)) {
    console.error(`Unknown user "${id}". Known: ${people.slice(0, 12).map((p) => p.id).join(", ")} ...`);
    process.exit(1);
  }
}
const view = await client.query(anyApi.feed.forViewer, { personaId: from });
const hosted = [...view.recommended, ...view.feed]
  .filter((e) => e.relation === "hosting")
  .sort((a, b) => a.createdAt - b.createdAt);

console.log(`${first(byId.get(from).name)} hosts ${hosted.length} events. Dealing them out to: ${to.map((id) => first(byId.get(id).name)).join(", ")}\n`);
const perHost = {};
hosted.forEach((e, i) => {
  const dest = to[i % to.length];
  perHost[dest] = (perHost[dest] ?? 0) + 1;
  const prefix = `${first(byId.get(from).name)}'s `;
  const newTitle = dest !== from && e.title.startsWith(prefix) ? `${first(byId.get(dest).name)}'s ${e.title.slice(prefix.length)}` : e.title;
  const mark = dest === from ? "stays  " : "-> " + first(byId.get(dest).name).padEnd(5);
  console.log(`  ${String(i + 1).padStart(2)}. ${mark} ${newTitle === e.title ? e.title : `${e.title}  =>  ${newTitle}`}`);
});
console.log("\nresult:", to.map((id) => `${first(byId.get(id).name)} ${perHost[id] ?? 0}`).join(", "));

if (!apply) {
  console.log("\nPreview only: nothing was changed. Re-run with --apply to do it (needs the admin key).");
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
  const r = await client.action(anyApi.redistribute.redistribute, { fromHostId: from, toHostIds: to, dryRun: false });
  console.log(`moved ${r.moved.length} of ${r.total} events (${r.unchanged} stayed with ${first(byId.get(from).name)})`);
  r.moved.forEach((m) => console.log(`  ${m.eventId} -> ${m.to}  ${m.newTitle ?? ""}`));
  if (r.failed.length) {
    console.log(`${r.failed.length} could not be moved:`);
    r.failed.forEach((f) => console.log(`  ${f.eventId}: ${f.error}`));
  }
} catch (err) {
  console.error(`failed: ${String(err?.message ?? err).split("\n")[0].slice(0, 300)}`);
  console.error("If it says the function isn't found, convex/redistribute.ts hasn't been deployed yet.");
  process.exit(1);
}
