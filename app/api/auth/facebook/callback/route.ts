import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "/setup";
  const next = state.startsWith("/") ? state : "/setup";
  const { FB_APP_ID, FB_APP_SECRET } = process.env;
  if (!code || !FB_APP_ID || !FB_APP_SECRET) return NextResponse.redirect(`${origin}${next}?demo=1`);
  try {
    const redirect = `${origin}/api/auth/facebook/callback`;
    const tok = await (await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${FB_APP_ID}&client_secret=${FB_APP_SECRET}&redirect_uri=${encodeURIComponent(redirect)}&code=${code}`)).json() as { access_token?: string };
    if (!tok.access_token) throw new Error("no token");
    const me = await (await fetch(`https://graph.facebook.com/me?fields=name,picture.type(large)&access_token=${tok.access_token}`)).json() as { name?: string; picture?: { data?: { url?: string } } };
    const res = NextResponse.redirect(`${origin}${next}`);
    // Only name + photo are kept. The token is discarded.
    res.cookies.set("fb_user", encodeURIComponent(JSON.stringify({ name: me.name, photo: me.picture?.data?.url })), { httpOnly: false, maxAge: 3600, sameSite: "lax", path: "/" });
    return res;
  } catch {
    return NextResponse.redirect(`${origin}${next}?demo=1`);
  }
}
