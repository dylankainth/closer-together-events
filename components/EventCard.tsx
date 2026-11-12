"use client";
import Link from "next/link";
import { AvatarStack, MuseBadge } from "./Shell";

export interface CardData {
  id: string; title: string; poster: string; hostName: string; slot?: string; venue?: string; going: number;
  goingPeople?: { initials: string; color: string }[]; invited?: number; nudged?: number;
  myStatus?: string; nudge?: { verdict: string; reasons: string[]; text: string };
}

const LABEL: Record<string, string> = { going: "Going", maybe: "Maybe", skip: "Skip" };

export function EventCard({ e, onRsvp, hosting }: { e: CardData; onRsvp?: (id: string, s: string) => void; hosting?: boolean }) {
  return (
    <article className="card rise overflow-hidden">
      <Link href={`/e/${e.id}`} className="flex gap-3 p-3" aria-label={`${e.title}, ${e.slot}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={e.poster} alt="" className="h-32 w-24 shrink-0 rounded-xl object-cover shadow-sm" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-fb-blue">{e.slot}</div>
          <h3 className="text-base font-bold leading-snug">{e.title}</h3>
          <div className="truncate text-sm text-fb-sub">{e.venue} · {hosting ? "You're hosting" : e.hostName}</div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-fb-sub">
            {e.goingPeople && <AvatarStack people={e.goingPeople} max={4} size={22} />}
            <span>{e.going} going{hosting && e.invited ? ` · ${e.invited} invited` : ""}</span>
          </div>
          {e.nudge && e.nudge.verdict !== "skip" && (
            <div className="mt-2 rounded-lg bg-muse-100/60 p-2 text-sm">
              <MuseBadge>Why you</MuseBadge>
              <div className="mt-0.5 leading-snug">{e.nudge.reasons.slice(0, 2).join(" ")}</div>
            </div>
          )}
        </div>
      </Link>
      {onRsvp && (
        <div className="flex gap-2 px-3 pb-3" role="group" aria-label="RSVP">
          {(["going", "maybe", "skip"] as const).map((s) => (
            <button key={s} onClick={() => onRsvp(e.id, s)} aria-pressed={e.myStatus === s} className={`btn flex-1 ${e.myStatus === s ? (s === "going" ? "btn-primary" : "bg-fb-ink text-white") : "btn-ghost"}`}>
              {e.myStatus === s ? "✓ " : ""}{LABEL[s]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
