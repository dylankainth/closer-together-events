"use node";
// Login with Facebook: verify the token the app got from the Facebook SDK, then create or update
// the user. Runs in the Node runtime ("use node") for fetch + Web Crypto.
//
// Convex env vars (set with `npx convex env set`, never in the app bundle):
//   FB_APP_ID      the Facebook app id
//   FB_APP_SECRET  the Facebook app secret (server only; makes the app access token)
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import {
  checkDebugToken,
  FACEBOOK_ISSUERS,
  FacebookTokenError,
  verifyLimitedLoginToken,
  type DebugTokenData,
  type Jwk,
} from "./fbVerify";

const GRAPH = "https://graph.facebook.com/v27.0";
const OIDC_DISCOVERY = "https://limited.facebook.com/.well-known/openid-configuration/";
const OIDC_CACHE_MS = 60 * 60 * 1000;
const OIDC_MIN_REFRESH_MS = 60 * 1000; // a forced refresh (unknown key id) at most once a minute

let oidcCache: { issuer: string; jwks: Jwk[]; at: number } | null = null;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new FacebookTokenError(`Facebook request failed: ${msg}`);
  }
  return body;
}

async function facebookOidc(force = false): Promise<{ issuer: string; jwks: Jwk[] }> {
  const age = oidcCache ? Date.now() - oidcCache.at : Infinity;
  if (oidcCache && (age < OIDC_MIN_REFRESH_MS || (!force && age < OIDC_CACHE_MS))) return oidcCache;
  const disc = (await getJson(OIDC_DISCOVERY)) as { issuer?: unknown; jwks_uri?: unknown };
  if (typeof disc.issuer !== "string" || typeof disc.jwks_uri !== "string") {
    throw new FacebookTokenError("Facebook OIDC discovery returned an unexpected document");
  }
  const keys = (await getJson(disc.jwks_uri)) as { keys?: unknown };
  if (!Array.isArray(keys.keys)) throw new FacebookTokenError("Facebook JWKS returned no keys");
  oidcCache = { issuer: disc.issuer, jwks: keys.keys as Jwk[], at: Date.now() };
  return oidcCache;
}

function appConfig(): { appId: string; appSecret: string } {
  const appId = process.env.FB_APP_ID ?? "";
  const appSecret = process.env.FB_APP_SECRET ?? "";
  if (!appId || !appSecret) {
    throw new ConvexError({ code: "not_configured", message: "Login with Facebook isn't set up on the server yet." });
  }
  return { appId, appSecret };
}

interface FacebookProfile {
  fbId: string;
  name: string;
  pictureUrl?: string;
  email?: string;
  tokenKind: "limited" | "classic";
}

async function fromLimitedToken(idToken: string, nonce: string, appId: string): Promise<FacebookProfile> {
  const nowSec = Math.floor(Date.now() / 1000);
  const verify = async (force: boolean) => {
    const oidc = await facebookOidc(force);
    const issuers = Array.from(new Set([oidc.issuer, ...FACEBOOK_ISSUERS]));
    return verifyLimitedLoginToken(idToken, { appId, issuers, jwks: oidc.jwks, nonce, nowSec });
  };
  let claims;
  try {
    claims = await verify(false);
  } catch (e) {
    // Facebook may have rotated its signing keys since we cached them: refresh once and retry.
    if (!(e instanceof FacebookTokenError) || !e.message.includes("signing key not found")) throw e;
    claims = await verify(true);
  }
  const name = claims.name ?? [claims.given_name, claims.family_name].filter(Boolean).join(" ");
  return { fbId: claims.sub, name: name || "Facebook user", pictureUrl: claims.picture, email: claims.email, tokenKind: "limited" };
}

async function fromAccessToken(accessToken: string, appId: string, appSecret: string): Promise<FacebookProfile> {
  const appToken = `${appId}|${appSecret}`;
  const dbg = (await getJson(
    `${GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`,
  )) as { data?: DebugTokenData };
  const fbId = checkDebugToken(dbg.data, appId, Math.floor(Date.now() / 1000));
  const me = (await getJson(
    `${GRAPH}/me?fields=id,name,email,picture.width(256).height(256)&access_token=${encodeURIComponent(accessToken)}`,
  )) as { id?: string; name?: string; email?: string; picture?: { data?: { url?: string } } };
  if (me.id !== fbId) throw new FacebookTokenError("profile does not match the token's user");
  return { fbId, name: me.name || "Facebook user", pictureUrl: me.picture?.data?.url, email: me.email, tokenKind: "classic" };
}

export const loginWithFacebook = action({
  args: {
    // iOS Limited Login: the OIDC id token and the nonce the app passed to the SDK.
    idToken: v.optional(v.string()),
    nonce: v.optional(v.string()),
    // Classic login (Android, or iOS with tracking allowed): the user access token.
    accessToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ personaId: string; name: string; pictureUrl: string | null; isNew: boolean }> => {
    const { appId, appSecret } = appConfig();
    let profile: FacebookProfile;
    try {
      if (args.idToken) {
        if (!args.nonce) throw new FacebookTokenError("missing nonce for Limited Login token");
        profile = await fromLimitedToken(args.idToken, args.nonce, appId);
      } else if (args.accessToken) {
        profile = await fromAccessToken(args.accessToken, appId, appSecret);
      } else {
        throw new FacebookTokenError("no Facebook token provided");
      }
    } catch (e) {
      // ConvexError keeps the reason visible to the app on production deployments too.
      // Messages are ours; token contents are never echoed.
      if (e instanceof FacebookTokenError) {
        throw new ConvexError({ code: "facebook_token", message: `Facebook login failed: ${e.message}` });
      }
      throw e;
    }
    const res = await ctx.runMutation(internal.users.upsertFromFacebook, profile);
    return { personaId: res.personaId, name: profile.name, pictureUrl: profile.pictureUrl ?? null, isNew: res.isNew };
  },
});
