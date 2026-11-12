"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, post, useViewer } from "@/lib/client";
import { CardData } from "@/components/EventCard";
import { MuseBadge } from "@/components/Shell";

export default function Messenger() {
  const { as, ready } = useViewer();
  const [feed, setFeed] = useState<{ picked: CardData[] } | null>(null);
  const load = useCallback(() => { if (ready) api(`/api/feed?as=${as}`).then(setFeed).catch(() => {}); }, [ready, as]);
  useEffect(load, [load]);
  const rsvp = async (id: string, status: string) => { await post(`/api/events/${id}/rsvp`, { as, status }); load(); };
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-muse-500 text-lg text-white">✦</span><div><div className="font-bold">Muse</div><MuseBadge>from your Muse</MuseBadge></div></div>
      {as === "anon" && <div className="card p-3 text-sm text-fb-sub">No Muse yet. RSVP on an invite link to set one up.</div>}
      {feed?.picked.length === 0 && as !== "anon" && <div className="card p-3 text-sm text-fb-sub">No nudges. Your Muse only writes when an event is worth it, at most once per event.</div>}
      {feed?.picked.map((e) => (
        <div key={e.id} className="max-w-[88%] space-y-2 rounded-2xl rounded-tl-sm bg-white p-3 text-sm shadow-sm">
          <div className="whitespace-pre-line">{e.nudge?.text}</div>
          <div className="flex gap-2">
            {(["going", "maybe", "skip"] as const).map((s) => <button key={s} onClick={() => rsvp(e.id, s)} className={`btn flex-1 !py-1.5 ${e.myStatus === s ? "btn-primary" : "btn-ghost"}`}>{s === "going" ? "Going" : s === "maybe" ? "Maybe" : "Skip"}</button>)}
          </div>
          <Link href={`/e/${e.id}/transcript`} className="block text-center text-fb-blue">see what my Muse said</Link>
          <div className="text-[11px] text-fb-sub">Muse asks before RSVPing for you. Tapping is your decision.</div>
        </div>
      ))}
    </div>
  );
}
