"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, post, useViewer } from "@/lib/client";
import { CardData, EventCard } from "@/components/EventCard";

export default function EventsHome() {
  const { as, ready } = useViewer();
  const [tab, setTab] = useState<"yours" | "discover">("discover");
  const [feed, setFeed] = useState<{ yours: CardData[]; picked: CardData[] } | null>(null);
  const load = useCallback(() => { if (ready) api(`/api/feed?as=${as}`).then(setFeed).catch(() => {}); }, [as, ready]);
  useEffect(load, [load]);
  const rsvp = async (id: string, status: string) => { await post(`/api/events/${id}/rsvp`, { as, status }); load(); };

  if (as === "anon") {
    return (
      <div className="p-4">
        <div className="card p-4 text-sm text-fb-sub">You're viewing as someone without Facebook. Open an invite link (<code>/e/&lt;id&gt;</code>) to see the plain RSVP page, or switch the demo user below.</div>
      </div>
    );
  }
  const list = tab === "yours" ? feed?.yours : feed?.picked;
  return (
    <div className="space-y-3 p-3">
      <h1 className="px-1 text-2xl font-bold">Events</h1>
      <div className="flex gap-2">
        {(["yours", "discover"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`chip ${tab === t ? "chip-on" : ""}`}>{t === "yours" ? "Your events" : "Discover"}</button>
        ))}
      </div>
      <Link href="/host" className="block rounded-xl bg-gradient-to-r from-muse-500 to-fb-blue p-4 text-white shadow">
        <div className="text-lg font-bold">✦ Host with Muse</div>
        <div className="text-sm opacity-90">Plan it in a minute. Muse handles the date, venue, poster and the guest list.</div>
      </Link>
      <h2 className="px-1 pt-1 text-sm font-semibold text-fb-sub">{tab === "yours" ? "Hosting" : "Picked for you"}</h2>
      {!feed && <div className="p-6 text-center text-sm text-fb-sub">Loading…</div>}
      {feed && list?.length === 0 && <div className="card p-4 text-sm text-fb-sub">{tab === "yours" ? "Nothing yet. Tap Host with Muse." : "No picks right now. When a friend's event is worth it for you, your Muse will say why here."}</div>}
      {list?.map((e) => <EventCard key={e.id} e={e} as={as} onRsvp={tab === "discover" ? rsvp : undefined} />)}
    </div>
  );
}
