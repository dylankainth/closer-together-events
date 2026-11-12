"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, post, useViewer } from "@/lib/client";
import { MuseBadge } from "@/components/Shell";

interface Ev {
  id: string; title: string; poster: string; hostName: string; hostId: string; slotLabel?: string; venueId: string; status: string;
  venueOptions: { id: string; name: string; area: string }[];
  guests: { personaId?: string; name: string; kind: string; status: string; nudge?: { verdict: string; reasons: string[]; text: string } }[];
}

export default function EventPage({ params }: { params: { id: string } }) {
  const { as, ready } = useViewer();
  const [ev, setEv] = useState<Ev | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [rsvpd, setRsvpd] = useState("");
  const load = useCallback(() => api<Ev>(`/api/events/${params.id}`).then(setEv).catch((e) => setErr(e.message)), [params.id]);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  if (err) return <div className="p-4 text-sm text-red-600">{err}</div>;
  if (!ev) return <div className="p-6 text-center text-sm text-fb-sub">Loading…</div>;
  const venue = ev.venueOptions.find((v) => v.id === ev.venueId);
  const me = ev.guests.find((g) => g.personaId === as);
  const going = ev.guests.filter((g) => g.status === "going");
  const anon = as === "anon";
  const isHost = ev.hostId === as;

  const rsvp = async (status: string) => {
    if (anon) { if (!name.trim()) { setErr("Add your name first"); return; } await post(`/api/events/${ev.id}/rsvp`, { name, status }); setRsvpd(status); setErr(""); }
    else { await post(`/api/events/${ev.id}/rsvp`, { as, status }); }
    load();
  };
  const cur = anon ? rsvpd : me?.status;

  return (
    <div className="space-y-3 pb-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ev.poster} alt="Invite poster" className="mx-auto max-h-[420px] w-full object-cover" />
      <div className="space-y-3 px-4">
        <div>
          <h1 className="text-2xl font-bold">{ev.title}</h1>
          <div className="text-sm text-fb-sub">{ev.slotLabel} · {venue?.name}, {venue?.area}</div>
          <div className="text-sm text-fb-sub">Hosted by {isHost ? "you" : ev.hostName}</div>
        </div>

        {!anon && me?.nudge && me.nudge.verdict !== "skip" && (
          <div className="card space-y-1 p-3 text-sm">
            <MuseBadge>Why you</MuseBadge>
            <ul>{me.nudge.reasons.map((r, i) => <li key={i}>{i + 1}. {r}</li>)}</ul>
            <Link href={`/e/${ev.id}/transcript`} className="text-fb-blue">See what my Muse said ›</Link>
          </div>
        )}

        {!isHost && (
          <div className="card space-y-2 p-3">
            {anon && !rsvpd && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full rounded-lg border border-fb-line p-2.5 text-sm" />}
            <div className="flex gap-2">
              {[["going", "Going"], ["maybe", "Maybe"], [anon ? "cant" : "skip", anon ? "Can't" : "Skip"]].map(([s, l]) => (
                <button key={s} onClick={() => rsvp(s)} className={`btn flex-1 ${cur === s ? "btn-primary" : "btn-ghost"}`}>{l}</button>
              ))}
            </div>
            {!anon && cur === "skip" && <p className="text-xs text-fb-sub">Skip is private. Nothing was sent to {ev.hostName.split(" ")[0]}.</p>}
          </div>
        )}

        {anon && rsvpd && (
          <div className="rounded-xl bg-gradient-to-br from-muse-500 to-fb-blue p-4 text-white">
            <div className="text-lg font-bold">Get your own Muse</div>
            <p className="text-sm opacity-90">Muse finds events worth going to, with a reason, and keeps your plans straight.</p>
            <a href="/api/auth/facebook?next=/setup" className="btn mt-3 block bg-white text-center text-fb-blue">Continue with Facebook</a>
            <p className="mt-2 text-[11px] opacity-80">We only use your name and photo.</p>
          </div>
        )}

        <div className="card p-3 text-sm">
          <div className="font-semibold">Going ({going.length + 1})</div>
          <div className="text-fb-sub">{ev.hostName.split(" ")[0]} (host){going.length ? ", " + going.map((g) => g.name.split(" ")[0]).join(", ") : ""}</div>
        </div>
        {isHost && <div className="card p-3 text-sm"><div className="font-semibold">Invited ({ev.guests.length})</div><div className="text-fb-sub">{ev.guests.filter((g) => g.status === "invited").length} waiting · {ev.guests.filter((g) => g.nudge && g.nudge.verdict !== "skip").length} nudged by their Muse</div></div>}
        <div className="text-xs text-fb-sub">Share link: <code>/e/{ev.id}</code></div>
      </div>
    </div>
  );
}
