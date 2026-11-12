"use client";
import { useEffect, useState } from "react";
import { api, put, useViewer, StateResp } from "@/lib/client";

export default function Settings() {
  const { as, ready } = useViewer();
  const [st, setSt] = useState<StateResp | null>(null);
  const [topic, setTopic] = useState("");
  const load = () => api<StateResp>(`/api/state?as=${as}`).then(setSt);
  useEffect(() => { if (ready) load(); }, [ready, as]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = st?.viewer;
  if (as === "anon") return <div className="p-4 text-sm text-fb-sub">No Muse yet. <a className="text-fb-blue" href="/setup">Set one up</a>.</div>;
  if (!v) return <div className="p-6 text-center text-sm text-fb-sub">Loading…</div>;
  const set = async (k: string, val: boolean) => { await put("/api/settings", { as, settings: { [k]: val } }); load(); };
  const save = async (neverShare: string[]) => { await put("/api/settings", { as, neverShare }); load(); };
  const Row = ({ k, label, locked }: { k: string; label: string; locked?: boolean }) => (
    <label className="flex items-center justify-between py-2 text-sm"><span>{label}{locked && <span className="ml-1 text-xs text-fb-sub">(always on)</span>}</span><input type="checkbox" className="h-5 w-5" checked={!!v.settings[k]} disabled={locked} onChange={(e) => set(k, e.target.checked)} /></label>
  );
  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-bold">Muse and events</h1>
      <div className="card divide-y divide-fb-line px-3">
        <Row k="talkToMuses" label="Let Muse talk to friends' Muses about events" />
        <Row k="nudgesOn" label="Muse nudges in Messenger" />
        <div className="py-2 text-xs text-fb-sub">Talking and committing are separate grants. Muse always asks before:</div>
        <Row k="askBeforeRsvp" label="RSVP for me" locked />
        <Row k="askBeforeLocation" label="Share my location" locked />
      </div>
      <div className="card space-y-2 p-3 text-sm">
        <div className="font-semibold">Never share</div>
        <div className="text-fb-sub">Always blocked: home address, phone number, emails. Plus your topics:</div>
        <div className="flex flex-wrap gap-2">{v.neverShare.map((t) => <button key={t} onClick={() => save(v.neverShare.filter((x) => x !== t))} className="chip !py-1">{t} ✕</button>)}</div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (topic.trim()) { save([...v.neverShare, topic.trim()]); setTopic(""); } }}>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="add topic" className="min-w-0 flex-1 rounded border border-fb-line px-2 py-1.5" />
          <button className="btn btn-ghost !py-1.5">Add</button>
        </form>
      </div>
      <div className="card space-y-1 p-3 text-sm">
        <div className="font-semibold">What Muse knows about you for events</div>
        <div className="text-fb-sub">Muse talks to friends' Muses using only this summary, never your raw memory.</div>
        <div><b>Interests:</b> {v.profile.interests.join(", ")}</div>
        <div><b>Social style:</b> {v.profile.socialStyle}</div>
        <div><b>Free:</b> {v.profile.availability.join("; ")}</div>
        <Row k="profileApproved" label="I approve this summary" />
      </div>
    </div>
  );
}
