"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, post, useViewer } from "@/lib/client";
import { CardData, EventCard } from "@/components/EventCard";
import { CardSkeletons, useToast } from "@/components/ui";

export default function EventsHome() {
  const { as, ready } = useViewer();
  const toast = useToast();
  const [tab, setTab] = useState<"yours" | "discover">("discover");
  const [feed, setFeed] = useState<{ yours: CardData[]; picked: CardData[] } | null>(null);
  const load = useCallback(() => { if (ready) api(`/api/feed?as=${as}`).then(setFeed).catch(() => setFeed({ yours: [], picked: [] })); }, [as, ready]);
  useEffect(() => { setFeed(null); load(); }, [load]);
  // After hosting, land on "Your events" so the new event is visible.
  useEffect(() => { try { if (sessionStorage.getItem("muse_tab") === "yours") { setTab("yours"); sessionStorage.removeItem("muse_tab"); } } catch { /* ignore */ } }, []);

  const rsvp = async (id: string, status: string) => {
    setFeed((f) => f && { ...f, picked: f.picked.map((e) => (e.id === id ? { ...e, myStatus: status } : e)) });
    try {
      await post(`/api/events/${id}/rsvp`, { as, status });
      toast(status === "skip" ? "Skipped. Nothing was sent to the host." : status === "going" ? "You're going! Your Muse never RSVPs for you." : "Marked as maybe.");
    } catch { toast("Couldn't save that. Try again.", "info"); load(); }
  };

  if (as === "anon") {
    return (
      <div className="space-y-3 p-4">
        <div className="card space-y-2 p-4 text-sm"><div className="text-base font-bold">You're viewing as a guest</div><p className="text-fb-sub">People without a Muse get a plain invite link. Open <code>/e/&lt;id&gt;</code> from a host's event, or switch the demo user with the ⇄ button above.</p></div>
      </div>
    );
  }
  const list = tab === "yours" ? feed?.yours : feed?.picked;
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-end justify-between px-1"><h1 className="text-2xl font-bold">Events</h1></div>
      <Link href="/host" className="group block rounded-2xl bg-gradient-to-br from-muse-500 via-muse-600 to-fb-blue p-4 text-white shadow-md transition active:scale-[.99]">
        <div className="flex items-center justify-between"><div className="text-lg font-bold">✦ Host with Muse</div><span className="text-xl transition group-hover:translate-x-0.5" aria-hidden>→</span></div>
        <div className="mt-0.5 text-sm text-white/90">Plan it in a minute. Muse picks the date, venue and poster, and finds who'd actually come.</div>
      </Link>
      <div className="flex gap-2" role="tablist">
        {(["discover", "yours"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`chip ${tab === t ? "chip-on" : ""}`}>
            {t === "yours" ? `Your events${feed?.yours.length ? ` (${feed.yours.length})` : ""}` : `Picked for you${feed?.picked.length ? ` (${feed.picked.length})` : ""}`}
          </button>
        ))}
      </div>
      {!feed && <CardSkeletons />}
      {feed && list?.length === 0 && (
        <div className="card p-6 text-center text-sm text-fb-sub">
          <div className="text-3xl" aria-hidden>{tab === "yours" ? "🎉" : "✦"}</div>
          <div className="mt-1 font-semibold text-fb-ink">{tab === "yours" ? "No events yet" : "No picks right now"}</div>
          <p className="mt-1">{tab === "yours" ? "Tap Host with Muse to plan your first one." : "When a friend's event is worth it for you, your Muse will say why here."}</p>
        </div>
      )}
      {list?.map((e) => <EventCard key={e.id} e={e} hosting={tab === "yours"} onRsvp={tab === "discover" ? rsvp : undefined} />)}
    </div>
  );
}
