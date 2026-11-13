// "Is the AI actually real right now?" — the pre-demo check claude.md §19 asks for, as one command.
//
//   node scripts/check-muse-live.mjs                 # the most recent sent event
//   node scripts/check-muse-live.mjs evt_abc123      # a specific one
//
// Every museJSON call site falls back to a deterministic offline answer rather than failing, which
// is excellent for demo safety and terrible for knowing whether the demo is real: the swarm looks
// identical either way and still counts the fallback messages. On one live 12-candidate huddle,
// HALF the transcript was fallback and nothing on screen said so.
//
// This reads the stored `source` on each huddle message and tells you the split, so the answer is
// measured rather than assumed. Needs admin access from .env.local (the key is never printed):
//   CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  console.error("Missing CONVEX_SELF_HOSTED_URL / CONVEX_SELF_HOSTED_ADMIN_KEY (set them in .env.local).");
  process.exit(1);
}
const client = new ConvexHttpClient(url);
client.setAdminAuth(key);

const pct = (n, of) => (of ? Math.round((100 * n) / of) : 0);

try {
  let eventId = process.argv[2];
  if (!eventId) {
    // No id given: whichever sent event was created most recently, across all hosts.
    const personas = await client.query(anyApi.personas.listAll, {});
    const events = [];
    for (const p of personas) {
      const mine = await client.query(anyApi.events.listForHost, { hostId: p.id }).catch(() => []);
      for (const e of mine) if (e.status === "sent") events.push(e);
    }
    events.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    if (!events.length) {
      console.error("No sent events found — send one first, then re-run.");
      process.exitCode = 1;
      throw new Error("no sent events");
    }
    eventId = events.at(-1).eventId;
  }

  const messages = await client.query(anyApi.huddleData.messagesForEvent, { eventId });
  if (!messages.length) {
    console.error(`${eventId}: no huddle messages yet. Wait for the swarm to run, then re-run.`);
    process.exitCode = 1;
    throw new Error("no messages");
  }

  const muse = messages.filter((m) => m.source === "muse").length;
  const offline = messages.length - muse;
  const blocked = messages.filter((m) => m.status !== "sent").length;
  const musePct = pct(muse, messages.length);

  console.log(`\n${eventId} on ${new URL(url).host}`);
  console.log(`  messages     ${messages.length}`);
  console.log(`  from Muse    ${muse} (${musePct}%)`);
  console.log(`  offline      ${offline} (${pct(offline, messages.length)}%)`);
  console.log(`  guarded      ${blocked} blocked/rewritten`);

  // A healthy run is overwhelmingly real. Anything less means a call is failing somewhere and the
  // transcript on stage is partly canned — check the deployment logs for "[museJSON]".
  if (musePct >= 90) console.log(`\n  OK — the conversation on screen is real.\n`);
  else if (musePct >= 60) console.log(`\n  WARNING — ${offline} of ${messages.length} messages are canned fallback. Check deployment logs for "[museJSON]".\n`);
  else console.log(`\n  NOT DEMO READY — most of this transcript is deterministic fallback, not Muse.\n`);
  // exitCode rather than exit(): process.exit() with the Convex client's sockets still open trips
  // a libuv assertion on Windows and prints a crash dump underneath the result.
  process.exitCode = musePct >= 90 ? 0 : 1;
} catch (err) {
  console.error(`failed: ${String(err?.message ?? err).split("\n")[0].slice(0, 300)}`);
  process.exit(1);
}
