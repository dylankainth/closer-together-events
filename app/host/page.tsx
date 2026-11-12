"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, post, useViewer } from "@/lib/client";
import { Avatar, MuseBadge } from "@/components/Shell";
import { Bar, Pill, StickyBar, Stepper } from "@/components/ui";

type Step = "questions" | "audience" | "plan" | "shortlist" | "huddle";
const ORDER: Step[] = ["questions", "audience", "plan", "shortlist", "huddle"];
const PURPOSES = [["Birthday", "🎂"], ["Housewarming", "🏠"], ["Game night", "🎲"], ["Other", "✨"]];
const VIBES = [["Chill", "Easy and low-key"], ["Lively", "Loud and social"], ["Fancy", "Dress up a bit"]];
const STAGES = ["Reading who you mean…", "Searching your friends…", "Checking who's free…", "Picking a date and venue…", "Designing your poster…"];

interface Ev {
  id: string; title: string; poster: string; slotLabel?: string; venueId: string;
  dateCheck: { can: number; of: number; note: string };
  venueOptions: { id: string; name: string; tier: number; area: string; note: string }[];
  drafts: { id: string; vendor: string; item: string; draft: string; simulatedReply: string }[];
  shortlist: { personaId: string; name: string; initials: string; color: string; reason: string; selected: boolean; hop: number; available: boolean; tie: number }[];
  settings: { mode: string; maxAutoInvites: number; friendsOfFriends: boolean; quota: number };
  museSource: string;
}
function DateTile({ label = "" }: { label?: string }) {
  const [, day, mon] = label.split(/[ ,]+/);
  return <div className="w-14 shrink-0 rounded-xl bg-fb-blue/10 py-1.5 text-center text-fb-blue" aria-hidden><div className="text-[10px] font-bold uppercase">{mon}</div><div className="text-2xl font-extrabold leading-none">{day}</div></div>;
}
interface Msg { id: string; kind: string; text: string; status: string; checks: string[]; fromPersona: string }
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
  const [stage, setStage] = useState(0);
  const [err, setErr] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [listening, setListening] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => { api(`/api/state?as=${as}`).then((s) => setPeople(s.people)).catch(() => {}); }, [as]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6 }); }, [msgs.length, showLog]);
  useEffect(() => { top.current?.scrollIntoView({ block: "start" }); window.scrollTo({ top: 0 }); }, [step]);
  useEffect(() => {
    if (!busy) return;
    setStage(0);
    const t = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1100);
    return () => clearInterval(t);
  }, [busy]);

  const voice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setErr("Voice input isn't supported in this browser. Type it instead."); return; }
    const r = new SR(); r.lang = "en-US"; setListening(true); setErr("");
    r.onresult = (e: any) => setAudience(e.results[0][0].transcript);
    r.onend = () => setListening(false); r.start();
  };

  const plan = async () => {
    setBusy(true); setErr("");
    try {
      const e = await post<Ev>("/api/events", { as, answers: { purpose, vibe, budget }, audience, settings: { friendsOfFriends: fof, mode, maxAutoInvites: maxAuto, quota } });
      setEv(e); setVenueId(e.venueId);
      setPicked(new Set(e.shortlist.filter((s) => s.selected && s.available).map((s) => s.personaId)));
      setStep("plan");
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const approve = async () => {
    if (!ev) return; setBusy(true); setErr("");
    try { const e = await post<Ev>(`/api/events/${ev.id}/approve`, { venueId }); setEv({ ...ev, ...e }); setStep("shortlist"); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const send = async () => {
    if (!ev) return;
    const ids = [...picked, ...(extra ? [extra] : [])];
    setStep("huddle"); setMsgs([]); setDecisions([]); setDone(false); setErr(""); setTotal(ids.length); setShowLog(false);
    try {
      const res = await fetch(`/api/events/${ev.id}/send`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ guestIds: ids }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not send");
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
    } catch (x) { setErr((x as Error).message); }
  };

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const idx = ORDER.indexOf(step);
  const byId = useMemo(() => new Map(ev?.shortlist.map((s) => [s.personaId, s]) ?? []), [ev]);

  // Privacy panel numbers, one per sending Muse.
  const privacy = useMemo(() => {
    const seen = new Map<string, Msg>();
    msgs.filter((m) => m.kind === "reply").forEach((m) => seen.set(m.fromPersona, m));
    const all = Array.from(seen.values());
    return { replies: all.length, blocked: all.filter((m) => m.status === "blocked").length, rewritten: all.filter((m) => m.status === "rewritten").length };
  }, [msgs]);

  const sorted = [...decisions].sort((a, b) => ["worth", "maybe", "skip"].indexOf(a.nudge.verdict) - ["worth", "maybe", "skip"].indexOf(b.nudge.verdict));
  const counts = { worth: decisions.filter((d) => d.nudge.verdict === "worth").length, maybe: decisions.filter((d) => d.nudge.verdict === "maybe").length, skip: decisions.filter((d) => d.nudge.verdict === "skip").length };
  const free = ev?.shortlist.filter((s) => s.available) ?? [];

  return (
    <div ref={top} className="space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">✦ Host with Muse</h1>
        {step !== "huddle" ? <Link href="/" className="text-sm text-fb-sub">Cancel</Link> : done ? <Link href="/" onClick={() => { try { sessionStorage.setItem("muse_tab", "yours"); } catch { /* ignore */ } }} className="text-sm text-fb-blue">Done</Link> : null}
      </div>
      <Stepper steps={["Basics", "Audience", "Plan", "Guests", "Send"]} current={idx} />
      {err && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      {step === "questions" && (
        <>
          <section><h2 className="mb-2 font-semibold">What's it for?</h2>
            <div className="grid grid-cols-2 gap-2">{PURPOSES.map(([p, e]) => <button key={p} onClick={() => setPurpose(p)} aria-pressed={purpose === p} className={`card flex items-center gap-2 p-3 text-left text-sm font-medium ${purpose === p ? "!border-muse-500 !bg-muse-100" : ""}`}><span className="text-xl" aria-hidden>{e}</span>{p}</button>)}</div></section>
          <section><h2 className="mb-2 font-semibold">What vibe?</h2>
            <div className="space-y-2">{VIBES.map(([p, d]) => <button key={p} onClick={() => setVibe(p)} aria-pressed={vibe === p} className={`card flex w-full items-center justify-between p-3 text-left text-sm ${vibe === p ? "!border-muse-500 !bg-muse-100" : ""}`}><b>{p}</b><span className="text-fb-sub">{d}</span></button>)}</div></section>
          <section><h2 className="mb-2 font-semibold">Rough budget?</h2>
            <div className="flex gap-2">{([1, 2, 3] as const).map((b) => <button key={b} onClick={() => setBudget(b)} aria-pressed={budget === b} className={`chip flex-1 !py-2.5 text-center ${budget === b ? "chip-on" : ""}`}>{"$".repeat(b)}<span className="block text-[10px] font-normal text-fb-sub">{["Cheap", "Moderate", "Treat it"][b - 1]}</span></button>)}</div></section>
          <StickyBar><button className="btn btn-primary w-full" onClick={() => setStep("audience")}>Next</button></StickyBar>
        </>
      )}

      {step === "audience" && !busy && (
        <>
          <button onClick={() => setStep("questions")} className="text-sm text-fb-sub">‹ Back</button>
          <section>
            <h2 className="mb-1 font-semibold">Who is this for?</h2>
            <p className="mb-2 text-xs text-fb-sub">Describe them however you'd say it to a friend.</p>
            <textarea value={audience} onChange={(e) => setAudience(e.target.value)} rows={2} className="w-full rounded-xl border border-fb-line p-3 text-sm" aria-label="Audience description" placeholder="my closest friends / my tech network / the people I go boxing with" />
            <div className="mt-2 flex flex-wrap gap-2">
              {["my closest friends", "my tech network", "the people I go boxing with", "the bowling crew"].map((s) => <button key={s} onClick={() => setAudience(s)} className={`chip !py-1 !text-xs ${audience === s ? "chip-on" : ""}`}>{s}</button>)}
              <button onClick={voice} className="chip !py-1 !text-xs">{listening ? "Listening…" : "🎤 say it"}</button>
            </div>
          </section>
          <section className="card space-y-3 p-3">
            <h2 className="font-semibold">How should Muse find them?</h2>
            <label className="flex items-start gap-2 text-sm"><input type="radio" className="mt-1" checked={mode === "shortlist_and_add"} onChange={() => setMode("shortlist_and_add")} /><span><b>Suggest a shortlist</b> <Pill tone="purple">Recommended</Pill><br /><span className="text-fb-sub">You approve before anything is sent.</span></span></label>
            <label className="flex items-start gap-2 text-sm"><input type="radio" className="mt-1" checked={mode === "auto_invite"} onChange={() => setMode("auto_invite")} /><span><b>Invite matches automatically</b><br /><span className="text-fb-sub">Top matches up to a cap are pre-selected. The rest stay suggestions.</span></span></label>
            {mode === "auto_invite" && <label className="flex items-center gap-2 pl-6 text-sm">Max auto-invites <input type="number" min={1} max={50} value={maxAuto} onChange={(e) => setMaxAuto(Math.max(1, +e.target.value || 1))} className="w-16 rounded border border-fb-line px-2 py-1" /></label>}
            <label className="flex items-center justify-between gap-3 text-sm"><span><b>Include friends of friends</b><br /><span className="text-fb-sub">Optional. Widens the circle to mutual friends.</span></span><input type="checkbox" checked={fof} onChange={(e) => setFof(e.target.checked)} className="h-6 w-6 shrink-0" /></label>
            <label className="flex items-center justify-between text-sm"><b>Target attendance</b><input type="number" min={2} max={80} value={quota} onChange={(e) => setQuota(Math.max(2, +e.target.value || 2))} className="w-16 rounded border border-fb-line px-2 py-1" /></label>
          </section>
          <StickyBar><button className="btn btn-muse w-full" disabled={audience.trim().length < 2} onClick={plan}>Plan with Muse</button></StickyBar>
        </>
      )}

      {step === "audience" && busy && (
        <div className="card flex flex-col items-center gap-4 p-8 text-center" role="status">
          <div className="relative h-14 w-14"><span className="absolute inset-0 animate-ping rounded-full bg-muse-500/30" /><span className="absolute inset-0 flex items-center justify-center rounded-full bg-muse-500 text-2xl text-white">✦</span></div>
          <div><div className="font-semibold">Muse is planning</div><div key={stage} className="rise text-sm text-fb-sub">{STAGES[stage]}</div></div>
        </div>
      )}

      {step === "plan" && ev && (
        <>
          <button onClick={() => setStep("audience")} className="text-sm text-fb-sub">‹ Back</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ev.poster} alt="Invite poster" className="mx-auto w-full max-w-[280px] rounded-2xl shadow-lg" />
          <div className="card space-y-2 p-4">
            <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-bold leading-tight">{ev.title}</h2><MuseBadge>{ev.museSource === "muse" ? "by Muse" : "offline demo"}</MuseBadge></div>
            <div className="flex items-center gap-3">
              <DateTile label={ev.slotLabel} />
              <div><div className="font-semibold">{ev.slotLabel}</div><div className="text-sm text-fb-sub">Verified in code: <b className="text-green-700">{ev.dateCheck.can} of {ev.dateCheck.of}</b> can make it{ev.dateCheck.note && ` · ${ev.dateCheck.note}`}</div></div>
            </div>
          </div>
          <div className="card p-3">
            <h2 className="mb-1 font-semibold">Venue</h2>
            <div className="space-y-1.5" role="radiogroup" aria-label="Venue">
              {ev.venueOptions.map((v, i) => (
                <label key={v.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${venueId === v.id ? "border-muse-500 bg-muse-100/50" : "border-fb-line"}`}>
                  <input type="radio" className="mt-1" checked={venueId === v.id} onChange={() => setVenueId(v.id)} />
                  <span><b>{v.name}</b> <span className="text-fb-sub">{"$".repeat(v.tier)} · {v.area}</span>{i === 0 && <> <Pill tone="purple">Best match</Pill></>}<br /><span className="text-fb-sub">{v.note}</span></span>
                </label>
              ))}
            </div>
          </div>
          <div className="card p-3">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Drafted for you</h2><Pill tone="amber">SIMULATED</Pill></div>
            <ul className="mt-1 text-sm">{ev.drafts.map((d) => <li key={d.id} className="py-0.5">• {d.item}: <span className="text-fb-sub">draft ready, not sent</span></li>)}</ul>
            <button className="mt-1 text-sm font-medium text-fb-blue" onClick={() => setShowDrafts(!showDrafts)} aria-expanded={showDrafts}>{showDrafts ? "Hide drafts" : "View drafts"}</button>
            {showDrafts && ev.drafts.map((d) => (
              <div key={d.id} className="rise mt-2 rounded-lg bg-fb-bg p-2.5 text-xs">
                <div className="font-semibold">To {d.vendor} <span className="font-normal text-fb-sub">(not sent)</span></div><div className="mt-0.5">{d.draft}</div>
                <div className="mt-1 text-green-700">↳ {d.simulatedReply}</div>
              </div>
            ))}
            <p className="mt-2 text-xs text-fb-sub">Nothing is booked. Vendors are simulated, and you approve before anything is committed.</p>
          </div>
          <StickyBar><div className="flex gap-2"><button className="btn btn-ghost flex-1" onClick={() => setStep("audience")}>Change</button><button className="btn btn-primary flex-[2]" disabled={busy} onClick={approve}>{busy ? "Saving…" : "Looks good"}</button></div></StickyBar>
        </>
      )}

      {step === "shortlist" && ev && (
        <>
          <div>
            <h2 className="text-lg font-bold">Who should come?</h2>
            <p className="text-sm text-fb-sub">Muse suggests, you decide. Nothing goes out until you tap send.</p>
          </div>
          {ev.settings.mode === "auto_invite" && <div className="rounded-lg bg-muse-100 p-2.5 text-xs text-muse-600">Auto-invite is on: your top {ev.settings.maxAutoInvites} matches are pre-selected, the rest are suggestions.</div>}
          <div className="flex items-center justify-between text-sm">
            <span className="text-fb-sub"><b className="text-fb-ink">{picked.size}</b> selected · {free.length} free that day</span>
            <span className="flex gap-3 text-fb-blue"><button onClick={() => setPicked(new Set(free.map((s) => s.personaId)))}>All free</button><button onClick={() => setPicked(new Set())}>Clear</button></span>
          </div>
          <ul className="card divide-y divide-fb-line">
            {ev.shortlist.slice(0, 24).map((s) => (
              <li key={s.personaId}>
                <label className="flex cursor-pointer items-center gap-3 p-3 text-sm">
                  <input type="checkbox" className="h-5 w-5 shrink-0" checked={picked.has(s.personaId)} onChange={() => toggle(s.personaId)} aria-label={`Invite ${s.name}`} />
                  <Avatar initials={s.initials} color={s.color} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5"><b className="truncate">{s.name}</b>{s.hop === 2 && <Pill>friend of friend</Pill>}{!s.available && <Pill tone="amber">busy</Pill>}</span>
                    <span className="block text-fb-sub">{s.reason.replace(/ ?(Free|Busy) then\.?$/, "").replace(/\.$/, "")}</span>
                    {s.hop === 1 && <Bar value={Math.min(1, s.tie * 1.2)} label="closeness" />}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="card p-3 text-sm">
            <label className="mb-1 block font-semibold" htmlFor="extra">Add someone yourself</label>
            <select id="extra" value={extra} onChange={(e) => setExtra(e.target.value)} className="w-full rounded-lg border border-fb-line p-2.5">
              <option value="">Choose a friend…</option>
              {people.filter((p) => p.id !== as && !ev.shortlist.slice(0, 24).some((s) => s.personaId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <StickyBar><button className="btn btn-primary w-full" disabled={picked.size + (extra ? 1 : 0) === 0} onClick={send}>Add {picked.size + (extra ? 1 : 0)} and send</button></StickyBar>
        </>
      )}

      {step === "huddle" && ev && (
        <>
          <div className="card space-y-3 p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">{done ? "All Muses have answered" : "Friends' Muses are talking…"}</h2><span className="text-sm text-fb-sub">{decisions.length}/{total}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-fb-line" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={decisions.length}><div className="h-full rounded-full bg-gradient-to-r from-muse-500 to-fb-blue transition-all duration-300" style={{ width: `${total ? (decisions.length / total) * 100 : 0}%` }} /></div>
            <div className="flex flex-wrap gap-2 text-xs"><Pill tone="green">{counts.worth} worth it</Pill><Pill tone="amber">{counts.maybe} maybe</Pill><Pill>{counts.skip} skip</Pill></div>
          </div>

          <div className="card space-y-2 p-3 text-sm">
            <div className="font-semibold">Privacy checks</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-fb-bg p-2"><div className="text-xl font-bold">{privacy.replies}</div><div className="text-[11px] text-fb-sub">replies checked</div></div>
              <div className={`rounded-lg p-2 ${privacy.rewritten ? "bg-amber-50 text-amber-800" : "bg-fb-bg"}`}><div className="text-xl font-bold">{privacy.rewritten}</div><div className="text-[11px]">rewritten</div></div>
              <div className={`rounded-lg p-2 ${privacy.blocked ? "bg-red-50 text-red-700" : "bg-fb-bg"}`}><div className="text-xl font-bold">{privacy.blocked}</div><div className="text-[11px]">blocked</div></div>
            </div>
            <button className="text-fb-blue" onClick={() => setShowLog(!showLog)} aria-expanded={showLog}>{showLog ? "Hide" : "Show"} live conversation ({msgs.length})</button>
            {showLog && (
              <div ref={logRef} className="max-h-60 space-y-1.5 overflow-y-auto rounded-lg bg-fb-bg p-2 text-xs">
                {msgs.map((m) => (
                  <div key={m.id} className={m.status === "blocked" ? "text-red-600" : m.status === "rewritten" ? "text-amber-700" : m.kind === "ask" ? "text-fb-sub" : ""}>
                    {m.text}{m.status !== "sent" && <b> {m.status === "blocked" ? "⛔ blocked" : "✎ rewritten"} ({m.checks.join("; ")})</b>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {sorted.length > 0 && (
            <ul className="card divide-y divide-fb-line">
              {sorted.map((d) => {
                const s = byId.get(d.personaId);
                return (
                  <li key={d.personaId} className="rise flex gap-3 p-3 text-sm">
                    <Avatar initials={s?.initials ?? d.name[0]} color={s?.color ?? "#9CA3AF"} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><b className="truncate">{d.name}</b><Pill tone={d.nudge.verdict === "worth" ? "green" : d.nudge.verdict === "maybe" ? "amber" : "gray"}>{d.nudge.verdict === "skip" ? "Muse says skip · no nudge" : d.nudge.verdict === "worth" ? "Nudged" : "Soft nudge"}</Pill></div>
                      {d.nudge.verdict !== "skip" && <ul className="mt-0.5 text-fb-sub">{d.nudge.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {done && (
            <StickyBar><div className="flex gap-2"><Link href={`/e/${ev.id}`} className="btn btn-primary flex-[2] text-center">View event page</Link><Link href="/" onClick={() => { try { sessionStorage.setItem("muse_tab", "yours"); } catch { /* ignore */ } }} className="btn btn-ghost flex-1 text-center">Done</Link></div></StickyBar>
          )}
        </>
      )}
    </div>
  );
}
