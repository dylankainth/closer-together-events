"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, post, useViewer } from "@/lib/client";
import { AvatarStack, MuseBadge } from "@/components/Shell";
import { Skeleton, StickyBar, useToast } from "@/components/ui";

interface Ev {
  id: string; title: string; poster: string; hostName: string; hostId: string; slotLabel?: string; venueId: string; status: string;
  venueOptions: { id: string; name: string; area: string }[];
  guests: { personaId?: string; name: string; kind: string; status: string; nudge?: { verdict: string; reasons: string[]; text: string } }[];
}
const PALETTE = ["#7C3AED", "#2563EB", "#DB2777", "#059669", "#D97706", "#0891B2"];
const ini = (n: string) => n.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

export default function EventPage({ params }: { params: { id: string } }) {
  const { as, ready } = useViewer();
  const toast = useToast();
  const [ev, setEv] = useState<Ev | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [rsvpd, setRsvpd] = useState("");
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => api<Ev>(`/api/events/${params.id}`).then(setEv).catch((e) => setErr(e.message)), [params.id]);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  if (err && !ev) return <div className="p-6 text-center"><div className="text-3xl">🫥</div><div className="mt-1 font-semibold">Event not found</div><Link href="/" className="text-sm text-fb-blue">Back to Events</Link></div>;
  if (!ev) return <div className="space-y-3 p-4" role="status"><Skeleton className="h-72" /><Skeleton className="h-8 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>;

  const venue = ev.venueOptions.find((v) => v.id === ev.venueId);
  const me = ev.guests.find((g) => g.personaId === as);
  const going = ev.guests.filter((g) => g.status === "going");
  const maybe = ev.guests.filter((g) => g.status === "maybe");
  const anon = as === "anon";
  const isHost = ev.hostId === as;
  const cur = anon ? rsvpd : me?.status;
  const [, day, mon] = (ev.slotLabel ?? "").split(/[ ,]+/);

  const rsvp = async (status: string) => {
    try {
      if (anon) { if (!name.trim()) { setErr("Add your name first"); return; } await post(`/api/events/${ev.id}/rsvp`, { name, status }); setRsvpd(status); }
      else await post(`/api/events/${ev.id}/rsvp`, { as, status });
      setErr(""); toast(status === "skip" ? "Skipped privately. Nothing was sent." : status === "going" ? "You're going!" : status === "maybe" ? "Marked as maybe." : "Got it, thanks for letting them know.");
      load();
    } catch (e) { setErr((e as Error).message); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(`${location.origin}/e/${ev.id}`); setCopied(true); toast("Invite link copied"); setTimeout(() => setCopied(false), 2000); } catch { toast("Copy failed", "info"); } };

  const goingPeople = [{ initials: ini(ev.hostName), color: PALETTE[0] }, ...going.map((g, i) => ({ initials: ini(g.name), color: PALETTE[(i + 1) % PALETTE.length] }))];

  return (
    <div className={`pb-28 ${isHost ? "" : ""}`}>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ev.poster} alt="Invite poster" className="mx-auto max-h-[380px] w-full object-cover object-top" />
        <Link href="/" aria-label="Back" className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur">‹</Link>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight">{ev.title}</h1>
          <div className="mt-2 flex items-center gap-3">
            <div className="w-12 shrink-0 rounded-xl bg-fb-blue/10 py-1 text-center text-fb-blue" aria-hidden><div className="text-[10px] font-bold uppercase">{mon}</div><div className="text-xl font-extrabold leading-none">{day}</div></div>
            <div className="text-sm"><div className="font-semibold">{ev.slotLabel}</div><div className="text-fb-sub">{venue?.name}, {venue?.area}</div></div>
          </div>
          <div className="mt-1 text-sm text-fb-sub">Hosted by {isHost ? "you" : ev.hostName}</div>
        </div>

        {!anon && me?.nudge && me.nudge.verdict !== "skip" && (
          <div className="card rise space-y-1.5 border-muse-500/30 bg-muse-100/40 p-3 text-sm">
            <MuseBadge>Why you</MuseBadge>
            <ul className="space-y-0.5">{me.nudge.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            <Link href={`/e/${ev.id}/transcript`} className="inline-block pt-0.5 font-medium text-fb-blue">See what my Muse said ›</Link>
          </div>
        )}

        {anon && !rsvpd && <div className="card p-3"><label htmlFor="nm" className="mb-1 block text-sm font-semibold">Your name</label><input id="nm" value={name} onChange={(e) => setName(e.target.value)} placeholder={`So ${ev.hostName.split(" ")[0]} knows who's coming`} className="w-full rounded-lg border border-fb-line p-2.5 text-sm" autoComplete="name" /></div>}
        {err && <div role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{err}</div>}

        {anon && rsvpd && (
          <div className="rise rounded-2xl bg-gradient-to-br from-muse-500 to-fb-blue p-4 text-white">
            <div className="text-lg font-bold">You're in. Want a Muse of your own?</div>
            <p className="text-sm text-white/90">Muse finds events worth going to, with a reason, and keeps the plans straight.</p>
            <a href="/api/auth/facebook?next=/setup" className="btn mt-3 flex items-center justify-center bg-white text-fb-blue">Continue with Facebook</a>
            <p className="mt-2 text-[11px] text-white/80">We only use your name and photo.</p>
          </div>
        )}

        <div className="card space-y-2 p-3 text-sm">
          <div className="flex items-center justify-between"><div className="font-semibold">Going ({going.length + 1})</div>{maybe.length > 0 && <span className="text-xs text-fb-sub">{maybe.length} maybe</span>}</div>
          <AvatarStack people={goingPeople} max={7} size={32} />
          <div className="text-fb-sub">{ev.hostName.split(" ")[0]} (host){going.length ? ", " + going.slice(0, 4).map((g) => g.name.split(" ")[0]).join(", ") + (going.length > 4 ? ` and ${going.length - 4} more` : "") : ""}</div>
        </div>
        {isHost && (
          <div className="card space-y-1 p-3 text-sm">
            <div className="font-semibold">Guest list</div>
            <div className="text-fb-sub">{ev.guests.length} invited · {ev.guests.filter((g) => g.status === "invited").length} waiting · {ev.guests.filter((g) => g.nudge && g.nudge.verdict !== "skip").length} nudged by their Muse · {ev.guests.filter((g) => g.nudge?.verdict === "skip").length} skipped by their Muse</div>
          </div>
        )}
        <button onClick={copy} className="btn btn-ghost w-full">{copied ? "✓ Link copied" : "Copy invite link"}</button>
      </div>

      {!isHost && (
        <StickyBar>
          <div className="flex gap-2" role="group" aria-label="RSVP">
            {[["going", "Going"], ["maybe", "Maybe"], [anon ? "cant" : "skip", anon ? "Can't" : "Skip"]].map(([s, l]) => (
              <button key={s} onClick={() => rsvp(s)} aria-pressed={cur === s} className={`btn flex-1 ${cur === s ? (s === "going" ? "btn-primary" : "bg-fb-ink text-white") : "btn-ghost"}`}>{cur === s ? "✓ " : ""}{l}</button>
            ))}
          </div>
          {!anon && cur === "skip" && <p className="mt-1 text-center text-xs text-fb-sub">Skip is private. Nothing was sent to {ev.hostName.split(" ")[0]}.</p>}
        </StickyBar>
      )}
    </div>
  );
}
