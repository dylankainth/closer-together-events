// Run: node --test tests/fbVerify.test.mjs   (Node 23+ strips the TypeScript types itself)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyLimitedLoginToken,
  checkDebugToken,
  initialsOf,
  FacebookTokenError,
} from "../convex/fbVerify.ts";

const APP_ID = "1234567890";
const ISSUER = "https://www.facebook.com";
const NOW = 1_800_000_000;

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const enc = (obj) => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function makeKey(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, jwk: { kid, kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", use: "sig" } };
}

async function sign(privateKey, claims, header = { alg: "RS256", kid: "k1", typ: "JWT" }) {
  const input = `${enc(header)}.${enc(claims)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

const goodClaims = { sub: "987", name: "Sam Rivera", picture: "https://x/p.jpg", iss: ISSUER, aud: APP_ID, exp: NOW + 3600, nonce: "n-1" };

const ISSUERS = ["https://www.facebook.com", "https://facebook.com"];

test("accepts a correctly signed Limited Login token", async () => {
  const { privateKey, jwk } = await makeKey("k1");
  const token = await sign(privateKey, goodClaims);
  const c = await verifyLimitedLoginToken(token, { appId: APP_ID, issuers: ISSUERS, jwks: [jwk], nonce: "n-1", nowSec: NOW });
  assert.equal(c.sub, "987");
  assert.equal(c.name, "Sam Rivera");
});

test("accepts the bare facebook.com issuer too", async () => {
  const { privateKey, jwk } = await makeKey("k1");
  const token = await sign(privateKey, { ...goodClaims, iss: "https://facebook.com" });
  const c = await verifyLimitedLoginToken(token, { appId: APP_ID, issuers: ISSUERS, jwks: [jwk], nonce: "n-1", nowSec: NOW });
  assert.equal(c.sub, "987");
});

test("rejects: empty nonce option", async () => {
  const { privateKey, jwk } = await makeKey("k1");
  const token = await sign(privateKey, { ...goodClaims, nonce: "" });
  await assert.rejects(
    verifyLimitedLoginToken(token, { appId: APP_ID, issuers: ISSUERS, jwks: [jwk], nonce: "", nowSec: NOW }),
    FacebookTokenError,
  );
});

const rejects = (name, mutate) =>
  test(`rejects: ${name}`, async () => {
    const { privateKey, jwk } = await makeKey("k1");
    const ctx = { claims: { ...goodClaims }, opts: { appId: APP_ID, issuers: ISSUERS, jwks: [jwk], nonce: "n-1", nowSec: NOW } };
    const token = await mutate(ctx, privateKey);
    await assert.rejects(verifyLimitedLoginToken(token, ctx.opts), FacebookTokenError);
  });

rejects("token for another app", (c, k) => sign(k, { ...c.claims, aud: "999" }));
rejects("wrong issuer", (c, k) => sign(k, { ...c.claims, iss: "https://evil.example" }));
rejects("expired token", (c, k) => sign(k, { ...c.claims, exp: NOW - 3600 }));
rejects("nonce mismatch", (c, k) => sign(k, { ...c.claims, nonce: "other" }));
rejects("missing user id", (c, k) => sign(k, { ...c.claims, sub: "" }));
rejects("alg none", (c, k) => sign(k, c.claims, { alg: "none", kid: "k1" }));
rejects("unknown key id", (c, k) => sign(k, c.claims, { alg: "RS256", kid: "nope" }));
rejects("tampered payload", async (c, k) => {
  const t = await sign(k, c.claims);
  const [h, , s] = t.split(".");
  return `${h}.${enc({ ...c.claims, sub: "attacker" })}.${s}`;
});
rejects("signed by a different key", async (c) => {
  const other = await makeKey("k1");
  return sign(other.privateKey, c.claims);
});
rejects("garbage", async () => "not.a.jwt");
rejects("bad base64 signature", async (c, k) => {
  const t = await sign(k, c.claims);
  return t.slice(0, t.lastIndexOf(".") + 1) + "!!!";
});
rejects("payload that is JSON null", async (c, k) => {
  const t = await sign(k, c.claims);
  const [h, , s] = t.split(".");
  return `${h}.${enc(null)}.${s}`;
});
rejects("non-RSA key in JWKS", async (c, k) => {
  c.opts.jwks = [{ ...c.opts.jwks[0], kty: "EC" }];
  return sign(k, c.claims);
});

test("debug_token: valid token for our app returns the user id", () => {
  assert.equal(checkDebugToken({ is_valid: true, app_id: APP_ID, user_id: "42", expires_at: NOW + 10 }, APP_ID, NOW), "42");
  assert.equal(checkDebugToken({ is_valid: true, app_id: APP_ID, user_id: "42", expires_at: 0 }, APP_ID, NOW), "42");
});

test("debug_token: rejects invalid, foreign, expired or anonymous tokens", () => {
  const bad = [
    undefined,
    { is_valid: false, app_id: APP_ID, user_id: "42" },
    { is_valid: true, app_id: "999", user_id: "42" },
    { is_valid: true, app_id: APP_ID, user_id: "42", expires_at: NOW - 1 },
    { is_valid: true, app_id: APP_ID },
  ];
  for (const d of bad) assert.throws(() => checkDebugToken(d, APP_ID, NOW), FacebookTokenError);
});

test("initials", () => {
  assert.equal(initialsOf("Sam Rivera"), "SR");
  assert.equal(initialsOf("Keanu"), "K");
  assert.equal(initialsOf("Mary Jane Watson"), "MW");
  assert.equal(initialsOf(""), "?");
});
