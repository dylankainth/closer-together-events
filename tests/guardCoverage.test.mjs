// Every public Convex function must check who is calling, or be explicitly listed as open.
// Catches a new query/mutation/action that forgets authz. Internal* functions are exempt (only
// other server functions can call them).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = new URL("../convex/", import.meta.url).pathname;
const GUARDS = /\b(requireActor|requireOwner|requireHost|requireSignedIn|allowedAs|mayViewEvent)\s*\(/;

// Open on purpose, with the reason.
const OPEN = {
  "fbAuth.loginWithFacebook": "how you get a session in the first place",
  "events.rsvpExternal": "people without Muse RSVP from a plain link (claude.md section 6); sent events only",
  "personas.listAll": "public projection only (name, initials, colour, job)",
  "personas.getByPersonaId": "public projection only",
  "personas.eventSafeProfile": "the event-safe profile is designed to be shared",
  "venues.listPublic": "seed reference data",
  "slots.listPublic": "seed reference data",
};

function publicFunctions() {
  const out = [];
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".ts") && !n.startsWith("_"))) {
    const src = readFileSync(join(DIR, f), "utf8");
    const re = /export const (\w+) = (query|mutation|action)\(/g;
    const starts = [...src.matchAll(re)];
    starts.forEach((m, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].index : src.length;
      const next = src.indexOf("\nexport ", m.index + 1);
      const body = src.slice(m.index, next === -1 ? end : Math.min(end, next));
      out.push({ name: `${f.replace(/\.ts$/, "")}.${m[1]}`, body });
    });
  }
  return out;
}

test("every public Convex function is guarded or explicitly open", () => {
  const fns = publicFunctions();
  assert.ok(fns.length >= 30, `expected ~33 public functions, found ${fns.length}`);
  const unguarded = fns.filter((f) => !GUARDS.test(f.body) && !(f.name in OPEN)).map((f) => f.name);
  assert.deepEqual(unguarded, [], `unguarded public functions: ${unguarded.join(", ")}`);
});

test("the open list has no stale entries", () => {
  const names = new Set(publicFunctions().map((f) => f.name));
  for (const n of Object.keys(OPEN)) assert.ok(names.has(n), `OPEN lists ${n}, which no longer exists`);
});
