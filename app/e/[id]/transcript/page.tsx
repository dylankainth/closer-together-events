"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useViewer } from "@/lib/client";

interface T {
  title: string;
  messages: { id: string; kind: string; text: string; status: string; checks: string[] }[];
  receipt: { shared: string[]; blocked: number; blockedWhy: string[] };
}
export default function Transcript({ params }: { params: { id: string } }) {
  const { as, ready } = useViewer();
  const [t, setT] = useState<T | null>(null);
  useEffect(() => { if (ready) api<T>(`/api/events/${params.id}/transcript?as=${as}`).then(setT).catch(() => {}); }, [ready, as, params.id]);
  if (!t) return <div className="p-6 text-center text-sm text-fb-sub">Loading…</div>;
  return (
    <div className="space-y-3 p-4">
      <Link href={`/e/${params.id}`} className="text-sm text-fb-sub">‹ {t.title}</Link>
      <h1 className="text-xl font-bold">What my Muse said</h1>
      <div className="card space-y-2 p-3 text-sm">
        {t.messages.length === 0 && <div className="text-fb-sub">Your Muse hasn't talked to anyone about this event.</div>}
        {t.messages.map((m) => (
          <div key={m.id} className={m.kind === "ask" ? "text-fb-sub" : ""}>
            {m.text}
            {m.status !== "sent" && <div className="text-xs text-amber-700">{m.status === "blocked" ? "Blocked" : "Rewritten"}: {m.checks.join("; ")}</div>}
          </div>
        ))}
      </div>
      <div className="card space-y-1 p-3 text-sm">
        <div className="font-semibold">Receipt: shared on your behalf</div>
        {t.receipt.shared.length ? t.receipt.shared.map((s) => <div key={s}>• {s} <span className="text-green-700">(approved)</span></div>) : <div className="text-fb-sub">Nothing shared.</div>}
        <div className="pt-1 font-semibold">Blocked</div>
        <div className={t.receipt.blocked ? "text-red-600" : "text-fb-sub"}>{t.receipt.blocked ? `${t.receipt.blocked} message(s): ${t.receipt.blockedWhy.join("; ")}` : "Nothing blocked."}</div>
      </div>
      <Link href="/settings" className="btn btn-ghost block text-center">Edit what Muse can share</Link>
    </div>
  );
}
