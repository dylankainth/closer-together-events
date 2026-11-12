"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useViewer } from "@/lib/client";
import { Pill, Skeleton } from "@/components/ui";

interface T {
  title: string;
  messages: { id: string; kind: string; text: string; status: string; checks: string[] }[];
  receipt: { shared: string[]; blocked: number; blockedWhy: string[] };
}
export default function Transcript({ params }: { params: { id: string } }) {
  const { as, ready } = useViewer();
  const [t, setT] = useState<T | null>(null);
  useEffect(() => { if (ready) api<T>(`/api/events/${params.id}/transcript?as=${as}`).then(setT).catch(() => setT({ title: "Event", messages: [], receipt: { shared: [], blocked: 0, blockedWhy: [] } })); }, [ready, as, params.id]);
  if (!t) return <div className="space-y-3 p-4" role="status"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-48" /><Skeleton className="h-32" /></div>;
  return (
    <div className="space-y-4 p-4">
      <Link href={`/e/${params.id}`} className="text-sm text-fb-sub">‹ {t.title}</Link>
      <div><h1 className="text-xl font-bold">What my Muse said</h1><p className="text-sm text-fb-sub">Everything your Muse shared, and everything it was stopped from sharing.</p></div>
      <div className="space-y-2">
        {t.messages.length === 0 && <div className="card p-4 text-center text-sm text-fb-sub">Your Muse hasn't talked to anyone about this event.</div>}
        {t.messages.map((m) => (
          <div key={m.id} className={`rise max-w-[92%] rounded-2xl p-2.5 text-sm ${m.kind === "ask" ? "bg-fb-bg text-fb-sub" : "bg-white shadow-sm"} ${m.status === "blocked" ? "!bg-red-50" : ""}`}>
            {m.text}
            {m.status !== "sent" && <div className="mt-1"><Pill tone={m.status === "blocked" ? "red" : "amber"}>{m.status === "blocked" ? "Blocked" : "Rewritten"}: {m.checks.join("; ")}</Pill></div>}
          </div>
        ))}
      </div>
      <section className="card space-y-2 p-4 text-sm" aria-label="Receipt">
        <div className="font-bold">🧾 Receipt</div>
        <div className="font-semibold">Shared on your behalf</div>
        {t.receipt.shared.length ? t.receipt.shared.map((s) => <div key={s}>• {s} <Pill tone="green">approved</Pill></div>) : <div className="text-fb-sub">Nothing shared.</div>}
        <div className="pt-1 font-semibold">Blocked</div>
        <div className={t.receipt.blocked ? "text-red-600" : "text-fb-sub"}>{t.receipt.blocked ? `${t.receipt.blocked} message(s): ${t.receipt.blockedWhy.join("; ")}` : "Nothing was blocked."}</div>
      </section>
      <Link href="/settings" className="btn btn-ghost flex items-center justify-center">Edit what Muse can share</Link>
    </div>
  );
}
