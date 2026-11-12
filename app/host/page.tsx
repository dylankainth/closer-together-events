"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, post, useViewer } from "@/lib/client";
import { Avatar, MuseBadge } from "@/components/Shell";

type Step = "questions" | "audience" | "plan" | "shortlist" | "huddle";
const PURPOSES = ["Birthday", "Housewarming", "Game night", "Other"];
const VIBES = ["Chill", "Lively", "Fancy"];

interface Ev {
  id: string; title: string; poster: string; slotLabel?: string; venueId: string;
  dateCheck: { can: number; of: number; note: string };
  venueOptions: { id: string; name: string; tier: number; area: string; note: string }[];
  drafts: { id: string; vendor: string; item: string; draft: string; simulatedReply: string }[];
  shortlist: { personaId: string; name: string; reason: string; selected: boolean; hop: number; available: boolean }[];
  settings: { mode: string; maxAutoInvites: number; friendsOfFriends: boolean; quota: number };
  museSource: string;
}
interface Msg { id: string; kind: string; text: string; status: string; checks: string[]; forPersona: string }
interface Decision { personaId: string; name: string; nudge: { verdict: string; reasons: string[] } }

export default function Host() {
  const { as } = useViewer();
  const [step, setStep] = useState<Step>("questions");
  const [purpose, setPurpose] = useState("Birthday");
  const [vibe, setVibe] = useState("Lively");
  const [budget, setBudget] = useState<1 | 2 | 3>(2);
  const [audience, setAudience] = useState("the people I go boxing with");
  const [mode, setMode] = useState<"shortlist_and_add" | "auto_invite">("shortlist_and_add");
  const [maxAuto, setMaxAuto] = useState(12);
  const [fof, setFof] = useState(false);
  const [quota, setQuota] = useState(15);
  const [ev, setEv] = useState<Ev | null>(null);
  const [venueId, setVenueId] = useState("");
  const [showDrafts, setShowDrafts] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState("");
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [done, setDone] = useState(false);
  const [listening, setListening] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { api(`/api/state?as=${as}`).then((s) => setPeople(s.people)).catch(() => {}); }, [as]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6 }); }, [msgs.length]);

  const voice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setErr("Voice input isn't supported in this browser. Type it instead."); return; }
    const r = new SR(); r.lang = "en-US"; setListening(true);
    r.onresult = (e: any) => setAudience(e.results[0][0].transcript);
    r.onend = () => setListening(false); r.start();
  };

  const plan = async () => {
    setBusy(true); setErr("");
    try {
      const e = await post<Ev>("/api/events", { as, answers: { purpose, vibe, budget }, audience, settings: { friendsOfFriends: fof, mode, maxAutoInvites: maxAuto, quota } });
      setEv(e); setVenueId(e.venueId); setPicked(new Set(e.shortlist.filter((s) => s.selected).map((s) => s.personaId))); setStep("plan");
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  const approve = async () => {
    if (!ev) return; setBusy(true);
    try { const e = await post<Ev>(`/api/events/${ev.id}/approve`, { venueId }); setEv({ ...ev, ...e }); setStep("shortlist"); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  const send = async () => {
    if (!ev) return; setStep("huddle"); setMsgs([]); setDecisions([]); setDone(false); setErr("");
    const ids = [...picked, ...(extra ? [extra] : [])];
    const res = await fetch(`/api/events/${ev.id}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ guestIds: ids }) });
    if (!res.ok || !res.body) { setErr("Could not send"); return; }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done: d } = await reader.read(); if (d) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.trim()) continue;
        const o = JSON.parse(l);
        if (o.type === "message") setMsgs((m) => [...m, o.message]);
        if (o.type === "decision") setDecisions((d2) => [...d2, o]);
        if (o.type === "done") setDone(true);
        if (o.type === "error") setErr(o.error);
      }
    }
  };

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const Back = ({ to }: { to: Step }) => <button onClick={() => setStep(to)} className="mb-2 text-sm text-fb-sub">‹ Back</button>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-bold">✦ Host with Muse</h1><Link href="/" className="text-sm text-fb-sub">Cancel</Link></div>
      {err && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {step === "questions" && (
        <div className="space-y-4">
          <section><h2 className="mb-2 font-semibold">What's it for?</h2><div className="flex flex-wrap gap-2">{PURPOSES.map((p) => <button key={p} onClick={() => setPurpose(p)} className={`chip ${purpose === p ? "chip-on" : ""}`}>{p}</button>)}</div></section>
          <section><h2 className="mb-2 font-semibold">What vibe?</h2><div className="flex flex-wrap gap-2">{VIBES.map((p) => <button key={p} onClick={() => setVibe(p)} className={`chip ${vibe === p ? "chip-on" : ""}`}>{p}</button>)}</div></section>
          <section><h2 className="mb-2 font-semibold">Rough budget?</h2><div className="flex gap-2">{([1, 2, 3] as const).map((b) => <button key={b} onClick={() => setBudget(b)} className={`chip ${budget === b ? "chip-on" : ""}`}>{"$".repeat(b)}</button>)}</div></section>
          <button className="btn btn-primary w-full" onClick={() => setStep("audience")}>Next</button>
        </div>
      )}

      {step === "audience" && (
        <div className="space-y-4">
          <Back to="questions" />
          <section>
            <h2 className="mb-2 font-semibold">Who is this for?</h2>
            <textarea value={audience} onChange={(e) => setAudience(e.target.value)} rows={2} className="w-full rounded-lg border border-fb-line p-3 text-sm" placeholder="my closest friends / my tech network / the people I go boxing with" />
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {["my closest friends", "my tech network", "the people I go boxing with", "the bowling crew"].map((s) => <button key={s} onClick={() => setAudience(s)} className="chip !py-1 !text-xs">{s}</button>)}
              <button onClick={voice} className="chip !py-1 !text-xs">{listening ? "Listening…" : "🎤 say it"}</button>
            </div>
          </section>
          <section className="card space-y-3 p-3">
            <h2 className="font-semibold">How should Muse find them?</h2>
            <label className="flex items-start gap-2 text-sm"><input type="radio" checked={mode === "shortlist_and_add"} onChange={() => setMode("shortlist_and_add")} /><span><b>Suggest a shortlist</b><br /><span className="text-fb-sub">You approve before anything is sent. (Recommended)</span></span></label>
            <label className="flex items-start gap-2 text-sm"><input type="radio" checked={mode === "auto_invite"} onChange={() => setMode("auto_invite")} /><span><b>Invite matches automatically</b><br /><span className="text-fb-sub">Top matches up to the cap are invited; the rest become a shortlist.</span></span></label>
            {mode === "auto_invite" && <label className="flex items-center gap-2 pl-6 text-sm">Max auto-invites <input type="number" min={1} max={50} value={maxAuto} onChange={(e) => setMaxAuto(+e.target.value)} className="w-16 rounded border border-fb-line px-2 py-1" /></label>}
            <label className="flex items-center justify-between text-sm"><span><b>Include friends of friends</b><br /><span className="text-fb-sub">Optional. Default off.</span></span><input type="checkbox" checked={fof} onChange={(e) => setFof(e.target.checked)} className="h-5 w-5" /></label>
            <label className="flex items-center justify-between text-sm"><b>Target attendance</b><input type="number" min={2} max={80} value={quota} onChange={(e) => setQuota(+e.target.value)} className="w-16 rounded border border-fb-line px-2 py-1" /></label>
          </section>
          <button className="btn btn-muse w-full" disabled={busy || audience.trim().length < 2} onClick={plan}>{busy ? "Muse is planning…" : "Plan with Muse"}</button>
        </div>
      )}

      {step === "plan" && ev && (
        <div className="space-y-4">
          <Back to="audience" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ev.poster} alt="Invite poster" className="mx-auto w-full max-w-[300px] rounded-xl shadow" />
          <div className="card p-3">
            <div className="text-lg font-bold">{ev.title}</div>
            <div className="mt-1 text-sm">📅 <b>{ev.slotLabel}</b></div>
            <div className="text-sm text-fb-sub">Checked: {ev.dateCheck.can} of {ev.dateCheck.of} can make it {ev.dateCheck.note && <span className="text-xs">({ev.dateCheck.note})</span>}</div>
            <div className="mt-1"><MuseBadge>{ev.museSource === "muse" ? "planned by Muse" : "offline demo planning"}</MuseBadge></div>
          </div>
          <div className="card p-3">
            <h2 className="mb-2 font-semibold">Venue</h2>
            {ev.venueOptions.map((v) => (
              <label key={v.id} className="flex items-start gap-2 py-1 text-sm"><input type="radio" checked={venueId === v.id} onChange={() => setVenueId(v.id)} className="mt-1" /><span><b>{v.name}</b> {"$".repeat(v.tier)} · {v.area}<br /><span className="text-fb-sub">{v.note}</span></span></label>
            ))}
          </div>
          <div className="card p-3">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Drafted for you</h2><span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">SIMULATED</span></div>
            <ul className="mt-1 text-sm">{ev.drafts.map((d) => <li key={d.id}>• {d.item}: draft ready</li>)}</ul>
            <button className="mt-1 text-sm text-fb-blue" onClick={() => setShowDrafts(!showDrafts)}>{showDrafts ? "Hide drafts" : "View drafts"}</button>
            {showDrafts && ev.drafts.map((d) => (
              <div key={d.id} className="mt-2 rounded-lg bg-fb-bg p-2 text-xs">
                <div className="font-semibold">To {d.vendor} (not sent)</div><div>{d.draft}</div>
                <div className="mt-1 text-green-700">↳ {d.simulatedReply}</div>
              </div>
            ))}
            <p className="mt-2 text-xs text-fb-sub">Nothing is sent or booked. Vendors are simulated; you approve before anything is committed.</p>
          </div>
          <div className="flex gap-2"><button className="btn btn-primary flex-1" disabled={busy} onClick={approve}>Looks good</button><button className="btn btn-ghost flex-1" onClick={() => setStep("audience")}>Change</button></div>
        </div>
      )}

      {step === "shortlist" && ev && (
        <div className="space-y-3">
          <h2 className="font-semibold">Suggested guests ({picked.size} selected of {ev.shortlist.length})</h2>
          {ev.settings.mode === "auto_invite" && <div className="rounded-lg bg-muse-100 p-2 text-xs text-muse-600">Auto-invite: top {ev.settings.maxAutoInvites} are pre-selected; the rest are suggestions. You still tap send.</div>}
          <div className="card divide-y divide-fb-line">
            {ev.shortlist.slice(0, 20).map((s) => {
              const p = people.find((x) => x.id === s.personaId);
              return (
                <label key={s.personaId} className="flex items-center gap-3 p-3 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={picked.has(s.personaId)} onChange={() => toggle(s.personaId)} />
                  <Avatar initials={s.name.split(" ").map((x) => x[0]).join("")} color="#7C3AED" size={34} />
                  <span className="min-w-0 flex-1"><b>{s.name}</b>{s.hop === 2 && <span className="ml-1 rounded bg-fb-bg px-1 text-[10px]">friend of friend</span>}<br /><span className="text-fb-sub">{s.reason}</span></span>
                </label>
              );
            })}
          </div>
          <div className="card p-3 text-sm">
            <div className="mb-1 font-semibold">Add someone yourself</div>
            <select value={extra} onChange={(e) => setExtra(e.target.value)} className="w-full rounded border border-fb-line p-2">
              <option value="">Choose a friend…</option>
              {people.filter((p) => p.id !== as && !ev.shortlist.slice(0, 20).some((s) => s.personaId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <p className="text-xs text-fb-sub">Muse suggests, you decide. Nothing is sent until you tap.</p>
          <button className="btn btn-primary w-full" disabled={picked.size + (extra ? 1 : 0) === 0} onClick={send}>Add selected and send</button>
        </div>
      )}

      {step === "huddle" && ev && (
        <div className="space-y-3">
          <h2 className="font-semibold">Friends' Muses are talking{done ? " — done" : "…"}</h2>
          <div ref={logRef} className="card max-h-72 space-y-1.5 overflow-y-auto p-3 text-xs">
            {msgs.map((m) => (
              <div key={m.id} className={m.status === "blocked" ? "text-red-600" : m.status === "rewritten" ? "text-amber-700" : m.kind === "ask" ? "text-fb-sub" : "text-fb-ink"}>
                {m.text}{m.status !== "sent" && <b> {m.status === "blocked" ? "⛔ blocked" : "✎ rewritten"} ({m.checks.join("; ")})</b>}
              </div>
            ))}
            {!done && <div className="animate-pulse text-fb-sub">…</div>}
          </div>
          {decisions.length > 0 && (
            <div className="card divide-y divide-fb-line">
              <div className="p-3 text-sm font-semibold">Each Muse's verdict for its person</div>
              {decisions.map((d) => (
                <div key={d.personaId} className="p-3 text-sm"><b>{d.name}</b> <span className={`ml-1 rounded px-1.5 text-xs ${d.nudge.verdict === "worth" ? "bg-green-100 text-green-700" : d.nudge.verdict === "maybe" ? "bg-amber-100 text-amber-700" : "bg-fb-bg text-fb-sub"}`}>{d.nudge.verdict === "skip" ? "skip (no nudge sent)" : d.nudge.verdict}</span>
                  {d.nudge.verdict !== "skip" && <ul className="mt-1 text-fb-sub">{d.nudge.reasons.map((r, i) => <li key={i}>{i + 1}. {r}</li>)}</ul>}
                </div>
              ))}
            </div>
          )}
          {done && <div className="flex gap-2"><Link href={`/e/${ev.id}`} className="btn btn-primary flex-1 text-center">View event page</Link><Link href="/" className="btn btn-ghost flex-1 text-center">Done</Link></div>}
        </div>
      )}
    </div>
  );
}
