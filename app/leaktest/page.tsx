"use client";
import { useState } from "react";
import { api } from "@/lib/client";

export default function LeakTest() {
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { setR(await api("/api/eval")); } finally { setBusy(false); } };
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-bold">Privacy leak test</h1>
      <p className="text-sm text-fb-sub">Private facts are planted in seeded personas ("avoiding Dave", "money is tight", phone numbers, addresses). The same events run with and without each protection. We count private facts that reach another Muse.</p>
      <button className="btn btn-muse w-full" onClick={run} disabled={busy}>{busy ? "Running…" : "Run live test"}</button>
      {r && (
        <>
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><b>{r.leak.mode}.</b> {r.leak.note}</div>
          <div className="card divide-y divide-fb-line text-sm">
            {r.leak.rows.map((x: any) => (
              <div key={x.label} className="flex items-center justify-between gap-2 p-3">
                <div><div className="font-medium">{x.label}</div><div className="text-xs text-fb-sub">{x.messages} replies · {x.blocked} blocked · {x.rewritten} rewritten</div></div>
                <div className={`text-2xl font-extrabold ${x.leaks ? "text-red-600" : "text-green-600"}`}>{x.leaks}</div>
              </div>
            ))}
          </div>
          <div className="card space-y-1 p-3 text-sm"><b>Plan correctness</b><div>Best available date picked: {r.plan.optimalDate}/{r.plan.audiences}. Avg guests free on that date: {Math.round(r.plan.avgAttendanceRate * 100)}%. Attendance claims verified in code: {r.plan.claimsVerified}/{r.plan.audiences}.</div></div>
          <div className="card space-y-1 p-3 text-sm"><b>Funnel quality (precision@12)</b>{r.funnel.topical.map((t: any) => <div key={t.audience}>"{t.audience}": {Math.round(t.precisionAt12 * 100)}%</div>)}<div className="text-fb-sub">{r.funnel.closestFriendsHits}</div></div>
        </>
      )}
    </div>
  );
}
