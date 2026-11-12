"use client";
import Link from "next/link";
import { MuseBadge } from "./Shell";

export interface CardData {
  id: string; title: string; poster: string; hostName: string; slot?: string; venue?: string; going: number;
  myStatus?: string; nudge?: { verdict: string; reasons: string[]; text: string };
}

export function EventCard({ e, as, onRsvp }: { e: CardData; as: string; onRsvp?: (id: string, s: string) => void }) {
  return (
    <div className="card overflow-hidden">
      <Link href={`/e/${e.id}`} className="flex gap-3 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={e.poster} alt="" className="h-24 w-[72px] shrink-0 rounded-lg object-cover" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{e.title}</div>
          <div className="text-sm text-fb-sub">{e.slot} · {e.venue}</div>
          <div className="text-xs text-fb-sub">Hosted by {e.hostName} · {e.going} going</div>
          {e.nudge && (
            <div className="mt-1.5 text-sm">
              <MuseBadge>Why you</MuseBadge>
              <div className="mt-0.5 text-fb-ink">{e.nudge.reasons[0]}</div>
            </div>
          )}
        </div>
      </Link>
      {onRsvp && (
        <div className="flex gap-2 px-3 pb-3">
          {(["going", "maybe", "skip"] as const).map((s) => (
            <button key={s} onClick={() => onRsvp(e.id, s)} className={`btn flex-1 ${e.myStatus === s ? "btn-primary" : "btn-ghost"}`}>
              {s === "going" ? "Going" : s === "maybe" ? "Maybe" : "Skip"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
