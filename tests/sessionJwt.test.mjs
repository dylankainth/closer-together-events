// Session JWTs we mint after Facebook login, checked by Convex's customJwt provider (ES256).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPair,
  signSession,
  verifySession,
  buildJwks,
  jwksDataUri,
  SessionTokenError,
} from "../convex/sessionJwt.ts";
import { makeAuthProviders, ISSUER, AUDIENCE, SESSION_TTL_SEC } from "../convex/authConstants.ts";

const NOW = 1_800_000_000;
const KID = "mch-1";
const STD = { issuer: ISSUER, audience: AUDIENCE, ttlSec: SESSION_TTL_SEC };
const VER = { issuer: ISSUER, audience: AUDIENCE };
const sign = (privateJwk, extra = {}) => signSession({ sub: "fb_123", privateJwk, kid: KID, nowSec: NOW, ...STD, ...extra });

async function setup() {
  const { privateJwk, publicJwk } = await generateKeyPair();
  const jwks = buildJwks(publicJwk, KID);
  const token = await sign(privateJwk);
  return { privateJwk, publicJwk, jwks, token };
}
const decodePart = (t, i) => JSON.parse(Buffer.from(t.split(".")[i], "base64url").toString());

test("round trip: our token verifies and carries the expected claims", async () => {
  const { jwks, token } = await setup();
  const c = await verifySession(token, { jwks: jwks.keys, nowSec: NOW + 10, ...VER });
  assert.equal(c.sub, "fb_123");
  assert.equal(c.iss, ISSUER);
  assert.equal(c.aud, AUDIENCE);
  assert.equal(c.exp - c.iat, SESSION_TTL_SEC);
});

test("header has kid, alg ES256, typ JWT; signature is raw 64 bytes (r||s)", async () => {
  const { token } = await setup();
  assert.deepEqual(decodePart(token, 0), { alg: "ES256", kid: KID, typ: "JWT" });
  assert.equal(Buffer.from(token.split(".")[2], "base64url").length, 64);
});

test("public JWK and JWKS never contain the private part", async () => {
  const { publicJwk, jwks } = await setup();
  assert.equal(publicJwk.d, undefined);
  assert.equal(jwks.keys[0].d, undefined);
  assert.equal(jwks.keys[0].kid, KID);
  assert.equal(jwks.keys[0].alg, "ES256");
});

test("JWKS data URI has Convex's documented prefix and decodes to {keys:[...]}", async () => {
  const { jwks } = await setup();
  const uri = jwksDataUri(jwks);
  assert.ok(uri.startsWith("data:text/plain;charset=utf-8;base64,"));
  const decoded = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  assert.deepEqual(decoded, jwks);
});

const rejects = (name, make) =>
  test(`rejects: ${name}`, async () => {
    const s = await setup();
    const { token, opts } = await make(s);
    await assert.rejects(verifySession(token, { jwks: s.jwks.keys, nowSec: NOW + 10, ...VER, ...opts }), SessionTokenError);
  });

rejects("tampered payload", async ({ token }) => {
  const [h, , sig] = token.split(".");
  const p = Buffer.from(JSON.stringify({ ...decodePart(token, 1), sub: "fb_999" })).toString("base64url");
  return { token: `${h}.${p}.${sig}` };
});
rejects("signed by another key", async () => {
  const other = await generateKeyPair();
  return { token: await sign(other.privateJwk) };
});
rejects("expired", async ({ token }) => ({ token, opts: { nowSec: NOW + SESSION_TTL_SEC + 120 } }));
rejects("wrong audience", async ({ privateJwk }) => ({ token: await sign(privateJwk, { audience: "someone-else" }) }));
rejects("wrong issuer", async ({ privateJwk }) => ({ token: await sign(privateJwk, { issuer: "https://evil.example" }) }));
rejects("alg none", async ({ token }) => {
  const [, p] = token.split(".");
  const h = Buffer.from(JSON.stringify({ alg: "none", kid: KID, typ: "JWT" })).toString("base64url");
  return { token: `${h}.${p}.` };
});
rejects("alg HS256", async ({ token }) => {
  const [, p, s] = token.split(".");
  const h = Buffer.from(JSON.stringify({ alg: "HS256", kid: KID, typ: "JWT" })).toString("base64url");
  return { token: `${h}.${p}.${s}` };
});
rejects("garbage", async () => ({ token: "not-a-jwt" }));

test("signSession refuses an empty subject", async () => {
  const { privateJwk } = await generateKeyPair();
  await assert.rejects(sign(privateJwk, { sub: "" }), SessionTokenError);
  await assert.rejects(sign(privateJwk, { ttlSec: 0 }), SessionTokenError);
});

test("the data URI from jwksDataUri is accepted by makeAuthProviders", async () => {
  const { jwks } = await setup();
  assert.equal(makeAuthProviders({ AUTH_JWKS: jwksDataUri(jwks) }).length, 1);
});

test("makeAuthProviders: one ES256 customJwt provider with env set, none without", () => {
  const p = makeAuthProviders({ AUTH_JWKS: "data:text/plain;charset=utf-8;base64,e30=" });
  assert.equal(p.length, 1);
  assert.deepEqual(p[0], {
    type: "customJwt",
    applicationID: AUDIENCE,
    issuer: ISSUER,
    jwks: "data:text/plain;charset=utf-8;base64,e30=",
    algorithm: "ES256",
  });
  assert.deepEqual(makeAuthProviders({}), []);
  assert.deepEqual(makeAuthProviders({ AUTH_JWKS: "https://not-a-data-uri" }), []);
});
