"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useViewer } from "@/lib/client";

export default function Setup() {
  const { change } = useViewer();
  const [fb, setFb] = useState<{ name?: string; photo?: string } | null>(null);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    setDemo(new URLSearchParams(location.search).has("demo"));
    const c = document.cookie.split("; ").find((x) => x.startsWith("fb_user="));
    if (c) try { setFb(JSON.parse(decodeURIComponent(decodeURIComponent(c.split("=")[1])))); } catch { /* ignore */ }
  }, []);
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-bold">✦ Set up your Muse</h1>
      <div className="card flex items-center gap-3 p-3 text-sm">
        {fb?.photo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={fb.photo} alt="" className="h-12 w-12 rounded-full" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muse-500 text-white">?</span>}
        <div><div className="font-semibold">{fb?.name ?? "Your Facebook profile"}</div><div className="text-fb-sub">Name and photo only. We never read your events or friends.</div></div>
      </div>
      {demo && <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Demo mode: Login with Facebook isn't configured (set FB_APP_ID and FB_APP_SECRET). The Muse setup below is the product flow.</div>}
      <div className="card space-y-2 p-3 text-sm">
        <div className="font-semibold">What your Muse will do</div>
        <ul className="list-disc pl-5 text-fb-sub"><li>Tell you which events are worth it, and why.</li><li>Talk to friends' Muses using a summary you approve.</li><li>Always ask before RSVPing or sharing your location.</li></ul>
      </div>
      <button className="btn btn-muse w-full" onClick={() => { change("maya"); location.href = "/settings"; }}>Create my Muse</button>
      <Link href="/" className="block text-center text-sm text-fb-sub">Not now</Link>
    </div>
  );
}
