// Shared constants for our own session tokens (minted after Facebook login, checked by Convex's
// customJwt provider). Pure: imported by auth.config.ts, the minting action, and tests.

export const ISSUER = "https://convex-site.keanuc.net/muse-events";
export const AUDIENCE = "muse-events";
export const SESSION_TTL_SEC = 8 * 60 * 60; // a demo day; re-login is one tap
export const DEFAULT_KID = "mch-1";

const DATA_URI_PREFIX = "data:text/plain;charset=utf-8;base64,"; // same literal in sessionJwt.ts

export interface CustomJwtProvider {
  type: "customJwt";
  applicationID: string;
  issuer: string;
  jwks: string;
  algorithm: "ES256";
}

// The public JWKS arrives as a data URI in the AUTH_JWKS env var (set by scripts/gen-auth-keys.mjs),
// so the self-hosted backend never has to fetch keys over the network. Without it, no provider is
// configured: a deploy never breaks, and every caller is simply anonymous.
export function makeAuthProviders(env: { AUTH_JWKS?: string }): CustomJwtProvider[] {
  const jwks = env.AUTH_JWKS;
  if (!jwks || !jwks.startsWith(DATA_URI_PREFIX)) return [];
  return [{ type: "customJwt", applicationID: AUDIENCE, issuer: ISSUER, jwks, algorithm: "ES256" }];
}

export { DATA_URI_PREFIX };
