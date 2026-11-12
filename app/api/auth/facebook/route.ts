import { NextRequest, NextResponse } from "next/server";

/** Login with Facebook: name and photo only (public_profile). Without FB_APP_ID it falls back to the demo setup flow. */
export async function GET(req: NextRequest) {
  const appId = process.env.FB_APP_ID;
  const origin = req.nextUrl.origin;
  const next = req.nextUrl.searchParams.get("next") ?? "/setup";
  if (!appId) return NextResponse.redirect(`${origin}${next}${next.includes("?") ? "&" : "?"}demo=1`);
  const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/facebook/callback`);
  url.searchParams.set("scope", "public_profile");
  url.searchParams.set("state", next);
  return NextResponse.redirect(url.toString());
}
