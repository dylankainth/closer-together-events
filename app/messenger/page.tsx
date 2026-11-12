"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, post, useViewer } from "@/lib/client";
import { CardData } from "@/components/EventCard";
import { MuseBadge } from "@/components/Shell";
import { Skeleton, useToast } from "@/components/ui";

export default function Messenger() {
  const { as, ready } = useViewer();
  const toast = useToast();
  const [feed, setFeed] = useState<{ picked: CardData[] } | null>(null);
  const load = useCallback(() => { if (ready) api(`/api/feed?as=${as}`).then(setFeed).catch(() => setFeed({ picked: [] })); }, [ready, as]);
  useEffect(() => { setFeed(null); load(); }, [load]);
  const rsvp = async (id: string, status: string) => {
    setFeed((f) => f && { picked: f.picked.map((e) => (e.id === id ? { ...e, myStatus: status } : e)) });
    try { await post(`/api/events/${id}/rsvp`, { as, status }); toast(status === "skip" ? "Skipped privately" : status === "going" ? "You're going!" : "Marked as maybe"); } catch { load(); }
  };
  return (
    <div className="flex min-h-[calc(100vh-110px)] flex-col">
      <div className="flex items-center gap-3 border-b border-fb-line bg-white px-4 py-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-muse-500 to-fb-blue text-lg text-white" aria-hidden>✦</span>
        <div><div className="font-bold leading-tight">Muse</div><div className="text-xs text-fb-sub">Your personal agent · writes only when it's worth it</div></div>
      </div>
      <div className="flex-1 space-y-3 p-4">
        {as === "anon" && <div className="card p-3 text-sm text-fb-sub">No Muse yet. RSVP on an invite link to set one up.</div>}
        {!feed && as !== "anon" && <Skeleton className="h-40 w-4/5" />}
        {feed?.picked.length === 0 && as !== "anon" && <div className="mx-auto max-w-[85%] rounded-2xl bg-white p-3 text-center text-sm text-fb-sub shadow-sm">No nudges yet. Your Muse messages you at most once per event, and only when it's worth your time.</div>}
        {feed?.picked.map((e) => (
          <div key={e.id} className="rise max-w-[90%] space-y-2 rounded-2xl rounded-tl-sm bg-white p-3.5 text-sm shadow-sm">
            <div className="flex items-center justify-between gap-2"><MuseBadge>from your Muse</MuseBadge><Link href={`/e/${e.id}`} className="truncate text-xs font-semibold text-fb-blue">{e.title}</Link></div>
            <div className="whitespace-pre-line leading-relaxed">{e.nudge?.text}</div>
            <div className="flex gap-2" role="group" aria-label={`RSVP to ${e.title}`}>
              {(["going", "maybe", "skip"] as const).map((s) => <button key={s} aria-pressed={e.myStatus === s} onClick={() => rsvp(e.id, s)} className={`btn flex-1 !py-1.5 ${e.myStatus === s ? (s === "going" ? "btn-primary" : "bg-fb-ink text-white") : "btn-ghost"}`}>{e.myStatus === s ? "✓ " : ""}{s === "going" ? "Going" : s === "maybe" ? "Maybe" : "Skip"}</button>)}
            </div>
            <Link href={`/e/${e.id}/transcript`} className="block text-center text-xs font-medium text-fb-blue">See what my Muse said</Link>
            <div className="text-[11px] text-fb-sub">Muse never RSVPs for you. Tapping is your decision.</div>
          </div>
        ))}
      </div>
    </div>
  );
}
