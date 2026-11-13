// Pure ES256 session JWTs over Web Crypto: no imports at all, so tests run under plain Node
// (which needs file extensions on relative imports; the Convex bundler and tsc config don't allow
// them). Callers pass issuer, audience and lifetime from authConstants.ts.
// Web Crypto's ECDSA signature is already raw r||s (IEEE P1363), which is what JWS ES256 wants.

const DATA_URI_PREFIX = "data:text/plain;charset=utf-8;base64,"; // same as authConstants.ts

export interface EcJwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
  d?: string;
  kid?: string;
  alg?: string;
  use?: string;
}

export interface SessionClaims {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export class SessionTokenError extends Error {}

const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;
const enc = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new SessionTokenError("token is not valid base64url");
  }
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const jsonPart = (o: object): string => toB64Url(enc.encode(JSON.stringify(o)));

function parsePart(part: string): Record<string, unknown> {
  let v: unknown;
  try {
    v = JSON.parse(new TextDecoder().decode(fromB64Url(part)));
  } catch {
    throw new SessionTokenError("token is not a well-formed JWT");
  }
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new SessionTokenError("token is not a well-formed JWT");
  return v as Record<string, unknown>;
}

const publicOnly = (k: EcJwk): EcJwk => ({ kty: k.kty, crv: k.crv, x: k.x, y: k.y });

export async function generateKeyPair(): Promise<{ privateJwk: EcJwk; publicJwk: EcJwk }> {
  const pair = (await crypto.subtle.generateKey(ALG, true, ["sign", "verify"])) as CryptoKeyPair;
  const privateJwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as EcJwk;
  return { privateJwk, publicJwk: publicOnly(privateJwk) };
}

export async function signSession(opts: {
  sub: string;
  privateJwk: EcJwk;
  kid: string;
  nowSec: number;
  ttlSec: number;
  issuer: string;
  audience: string;
}): Promise<string> {
  if (!opts.sub) throw new SessionTokenError("refusing to sign a token without a subject");
  if (!(opts.ttlSec > 0)) throw new SessionTokenError("token lifetime must be positive");
  const iat = opts.nowSec;
  const claims: SessionClaims = { sub: opts.sub, iss: opts.issuer, aud: opts.audience, iat, exp: iat + opts.ttlSec };
  const input = `${jsonPart({ alg: "ES256", kid: opts.kid, typ: "JWT" })}.${jsonPart(claims)}`;
  const key = await crypto.subtle.importKey("jwk", { ...opts.privateJwk, ext: true }, ALG, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign(SIGN, key, enc.encode(input)));
  return `${input}.${toB64Url(sig)}`;
}

// Mirrors what Convex checks, for tests and the live smoke script.
export async function verifySession(
  token: string,
  opts: { jwks: EcJwk[]; nowSec: number; issuer: string; audience: string; leewaySec?: number },
): Promise<SessionClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new SessionTokenError("token is not a well-formed JWT");
  const [h, p, s] = parts;
  const header = parsePart(h);
  if (header.alg !== "ES256") throw new SessionTokenError(`unexpected alg ${String(header.alg)}`);
  const jwk = opts.jwks.find((k) => k.kid === header.kid);
  if (!jwk || jwk.kty !== "EC") throw new SessionTokenError("signing key not found");
  let ok: boolean;
  try {
    const key = await crypto.subtle.importKey("jwk", { ...publicOnly(jwk), ext: true }, ALG, false, ["verify"]);
    ok = await crypto.subtle.verify(SIGN, key, fromB64Url(s), enc.encode(`${h}.${p}`));
  } catch (e) {
    if (e instanceof SessionTokenError) throw e;
    throw new SessionTokenError("could not check token signature");
  }
  if (!ok) throw new SessionTokenError("bad token signature");
  const c = parsePart(p) as unknown as SessionClaims;
  if (c.iss !== opts.issuer) throw new SessionTokenError("wrong issuer");
  if (c.aud !== opts.audience) throw new SessionTokenError("wrong audience");
  if (typeof c.exp !== "number" || c.exp + (opts.leewaySec ?? 30) < opts.nowSec) throw new SessionTokenError("token expired");
  if (typeof c.sub !== "string" || !c.sub) throw new SessionTokenError("token has no subject");
  return c;
}

export function buildJwks(publicJwk: EcJwk, kid: string): { keys: EcJwk[] } {
  return { keys: [{ ...publicOnly(publicJwk), kid, alg: "ES256", use: "sig" }] };
}

export function jwksDataUri(jwks: { keys: EcJwk[] }): string {
  return DATA_URI_PREFIX + btoa(JSON.stringify(jwks));
}
