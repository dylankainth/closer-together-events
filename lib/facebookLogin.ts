// Client side of Login with Facebook.
//
// Needs a development build: react-native-fbsdk-next ships native code, so it cannot run in Expo Go
// (Expo docs) or on web. In those places `facebookLoginAvailable()` is false and the setup screen
// keeps its demo button.
//
// iOS uses Limited Login (no App Tracking Transparency prompt): the SDK returns an OIDC id token
// that our Convex action verifies against Facebook's public keys with our nonce. Android uses
// classic login, which returns an access token the action checks with Graph API debug_token.
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Crypto from "expo-crypto";

export type FacebookTokens =
  | { kind: "limited"; idToken: string; nonce: string }
  | { kind: "classic"; accessToken: string };

type FbsdkModule = typeof import("react-native-fbsdk-next");

let sdk: FbsdkModule | null | undefined;

function loadSdk(): FbsdkModule | null {
  if (sdk !== undefined) return sdk;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require("react-native-fbsdk-next") as FbsdkModule;
  } catch {
    sdk = null;
  }
  return sdk;
}

export function facebookLoginAvailable(): boolean {
  if (Platform.OS === "web") return false;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return false; // Expo Go
  // Only when this build was made with the Facebook plugin configured (app.config.ts sets this);
  // calling the SDK without its native config would crash.
  if (Constants.expoConfig?.extra?.fbConfigured !== true) return false;
  return loadSdk() !== null;
}

export class LoginCancelled extends Error {}

export async function signInWithFacebook(): Promise<FacebookTokens> {
  const fb = loadSdk();
  if (!fb || !facebookLoginAvailable()) throw new Error("Login with Facebook needs the development build.");
  const { LoginManager, AccessToken, AuthenticationToken } = fb;

  if (Platform.OS === "ios") {
    const nonce = Crypto.randomUUID();
    const res = await LoginManager.logInWithPermissions(["public_profile", "email"], "limited", nonce);
    if (res.isCancelled) throw new LoginCancelled("Login cancelled");
    const tok = await AuthenticationToken.getAuthenticationTokenIOS();
    if (!tok?.authenticationToken) throw new Error("Facebook did not return a login token.");
    return { kind: "limited", idToken: tok.authenticationToken, nonce };
  }

  const res = await LoginManager.logInWithPermissions(["public_profile", "email"]);
  if (res.isCancelled) throw new LoginCancelled("Login cancelled");
  const tok = await AccessToken.getCurrentAccessToken();
  if (!tok?.accessToken) throw new Error("Facebook did not return an access token.");
  return { kind: "classic", accessToken: tok.accessToken };
}

export async function signOutOfFacebook(): Promise<void> {
  loadSdk()?.LoginManager.logOut();
}
