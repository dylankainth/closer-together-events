// Pure Facebook token checks, no Convex imports, so they run in tests under plain Node.
//
// Two token kinds reach the backend (see Meta's Limited Login docs):
//  - iOS Limited Login returns an OIDC id token (a JWT). It cannot call the Graph API, so we
//    verify its RS256 signature against Facebook's published JWKS and check iss/aud/exp/nonce.
//  - Classic login (Android, or iOS with tracking allowed) returns a user access token. We check it
//    with Graph API `debug_token` using the app access token, which must stay server-side.

export interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
}

export interface LimitedLoginClaims {
  sub: string; // app-scoped user id
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  iss: string;
  aud: string;
  exp: number;
  iat?: number;
  nonce?: string;
}

export interface DebugTokenData {
  app_id?: string;
  is_valid?: boolean;
  user_id?: string;
  expires_at?: number;
  type?: string;
}

export class FacebookTokenError extends Error {}

// Facebook's discovery document says "https://www.facebook.com"; some tokens and SDKs use the bare
// domain. Both are Facebook, and the signature is still checked against Facebook's own keys.
export const FACEBOOK_ISSUERS = ["https://www.facebook.com", "https://facebook.com"];

const encoder = new TextEncoder();

export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new FacebookTokenError("token is not valid base64url");
  }
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(part: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
  } catch {
    throw new FacebookTokenError("token is not a well-formed JWT");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FacebookTokenError("token is not a well-formed JWT");
  }
  return parsed as Record<string, unknown>;
}

export async function verifyLimitedLoginToken(
  token: string,
  opts: { appId: string; issuers: string[]; jwks: Jwk[]; nonce: string; nowSec: number; leewaySec?: number },
): Promise<LimitedLoginClaims> {
  if (!opts.nonce) throw new FacebookTokenError("missing nonce");
  const parts = token.split(".");
  if (parts.length !== 3) throw new FacebookTokenError("token is not a well-formed JWT");
  const [h, p, sig] = parts;
  const header = decodeJson(h);
  if (header.alg !== "RS256") throw new FacebookTokenError(`unexpected alg ${String(header.alg)}`);
  const jwk = opts.jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new FacebookTokenError("signing key not found in Facebook JWKS");
  if (jwk.kty !== "RSA") throw new FacebookTokenError("signing key is not RSA");

  let ok: boolean;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlToBytes(sig), encoder.encode(`${h}.${p}`));
  } catch (e) {
    if (e instanceof FacebookTokenError) throw e;
    throw new FacebookTokenError("could not check token signature");
  }
  if (!ok) throw new FacebookTokenError("bad token signature");

  const c = decodeJson(p) as unknown as LimitedLoginClaims;
  const leeway = opts.leewaySec ?? 60;
  if (!opts.issuers.includes(c.iss)) throw new FacebookTokenError("wrong issuer");
  if (c.aud !== opts.appId) throw new FacebookTokenError("token was issued for a different app");
  if (typeof c.exp !== "number" || c.exp + leeway < opts.nowSec) throw new FacebookTokenError("token expired");
  if (c.nonce !== opts.nonce) throw new FacebookTokenError("nonce mismatch");
  if (typeof c.sub !== "string" || c.sub.length === 0) throw new FacebookTokenError("token has no user id");
  return c;
}

export function checkDebugToken(data: DebugTokenData | undefined, appId: string, nowSec: number): string {
  if (!data || data.is_valid !== true) throw new FacebookTokenError("access token is not valid");
  if (data.app_id !== appId) throw new FacebookTokenError("access token was issued for a different app");
  if (data.expires_at && data.expires_at !== 0 && data.expires_at < nowSec) {
    throw new FacebookTokenError("access token expired");
  }
  if (!data.user_id) throw new FacebookTokenError("access token has no user id");
  return data.user_id;
}

export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase());
  return (letters.length > 1 ? letters[0] + letters[letters.length - 1] : letters[0] ?? "?").slice(0, 2);
}

// Stable small hash, used to pick an avatar colour per Facebook id.
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
