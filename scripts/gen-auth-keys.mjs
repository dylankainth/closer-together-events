// Generate the ES256 key pair for our session tokens and install it on the Convex deployment.
// The private key goes straight into Convex env via `npx convex env set`; it is never printed or
// written to disk. Run from the repo root with the deployment configured (.env.local with
// CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY, or CONVEX_DEPLOYMENT).
//
//   node scripts/gen-auth-keys.mjs            # dry run: prints the public JWKS only
//   node scripts/gen-auth-keys.mjs --apply    # sets AUTH_JWT_PRIVATE_KEY, AUTH_JWT_KID, AUTH_JWKS
//
// Order matters: set the env BEFORE deploying auth.config.ts, because Convex evaluates it at push.
// Rotating keys (new kid) logs everyone out; that's fine for a demo.
import { spawnSync } from "node:child_process";
import { generateKeyPair, buildJwks, jwksDataUri } from "../convex/sessionJwt.ts";

const apply = process.argv.includes("--apply");
const kid = `mch-${new Date().toISOString().slice(0, 10)}`;
const { privateJwk, publicJwk } = await generateKeyPair();
const jwks = buildJwks(publicJwk, kid);

console.log(`kid: ${kid}`);
console.log(`public JWKS: ${JSON.stringify(jwks)}`);
if (!apply) {
  console.log("Dry run. Re-run with --apply to install the keys on the Convex deployment.");
  process.exit(0);
}

const set = (name, value) => {
  const r = spawnSync("npx", ["convex", "env", "set", name, value], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`failed to set ${name}: ${(r.stderr || "").replaceAll(value, "<redacted>").slice(-300)}`);
    process.exit(1);
  }
  console.log(`set ${name}`);
};
set("AUTH_JWT_PRIVATE_KEY", JSON.stringify({ ...privateJwk, kid }));
set("AUTH_JWT_KID", kid);
set("AUTH_JWKS", jwksDataUri(jwks));
console.log("Done. Now deploy (npx convex dev --once / dylan's deploy) so auth.config.ts picks up AUTH_JWKS.");
