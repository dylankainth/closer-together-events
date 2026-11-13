// Convex accepts our own session JWTs (minted by fbAuth.loginWithFacebook after it verifies
// Facebook). The public key arrives as a data-URI JWKS in the AUTH_JWKS env var, set by
// scripts/gen-auth-keys.mjs. Without it there is no provider and every caller is anonymous, so a
// deploy from a branch without the env never breaks anything.
import { makeAuthProviders } from "./authConstants";

export default {
  providers: makeAuthProviders({ AUTH_JWKS: process.env.AUTH_JWKS }),
};
