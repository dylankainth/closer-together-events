"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { StateResp, api, useViewer } from "@/lib/client";
import { Sheet, ToastProvider } from "./ui";

export function Avatar({ initials, color, size = 40, ring }: { initials: string; color: string; size?: number; ring?: boolean }) {
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${ring ? "ring-2 ring-white" : ""}`} style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export function AvatarStack({ people, max = 5, size = 28 }: { people: { initials: string; color: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="inline-flex items-center">
      {shown.map((p, i) => <span key={i} style={{ marginLeft: i ? -8 : 0 }}><Avatar {...p} size={size} ring /></span>)}
      {people.length > max && <span className="ml-1 text-xs text-fb-sub">+{people.length - max}</span>}
    </span>
  );
}

export function MuseBadge({ children = "from Muse" }: { children?: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-muse-100 px-2 py-0.5 text-[11px] font-semibold text-muse-600">✦ {children}</span>;
}

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
const TABS = [
  { href: "/", label: "Home", d: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10", dead: true },
  { href: "/messenger", label: "Messenger", d: "M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" },
  { href: "/", label: "Reels", d: "M5 4h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1zm5 5l5 3-5 3z", dead: true },
  { href: "/", label: "Events", d: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4", active: true },
  { href: "/settings", label: "Muse", d: "M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { as, change, ready } = useViewer();
  const [st, setSt] = useState<StateResp | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => { if (ready) api<StateResp>(`/api/state?as=${as}`).then(setSt).catch(() => {}); }, [as, ready]);
  const viewer = st?.viewer;
  const people = useMemo(() => (st?.people ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase())), [st, q]);

  return (
    <ToastProvider>
      <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-fb-bg shadow-xl">
        <header className="sticky top-0 z-20 border-b border-fb-line bg-white">
          <div className="flex items-center justify-between px-4 pt-3">
            <Link href="/" className="text-2xl font-extrabold tracking-tight text-fb-blue">facebook</Link>
            <div className="flex items-center gap-2">
              {st && <span title={st.museLive ? "Connected to Muse" : "No MUSE_API_KEY: using local stand-ins, not the real AI"} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.museLive ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{st.museLive ? "Muse live" : "Muse offline demo"}</span>}
              <button onClick={() => setOpen(true)} aria-label="Switch demo user" className="flex items-center gap-1 rounded-full bg-fb-bg py-0.5 pl-0.5 pr-2 text-xs text-fb-sub">
                {viewer ? <Avatar initials={viewer.initials} color={viewer.color} size={28} /> : <Avatar initials="?" color="#9CA3AF" size={28} />}
                <span aria-hidden>⇄</span>
              </button>
            </div>
          </div>
          <nav className="mt-1 flex justify-between px-1" aria-label="Facebook">
            {TABS.map((t) => {
              const on = t.active ? path === "/" || path.startsWith("/e/") || path.startsWith("/host") : !t.dead && path.startsWith(t.href);
              return (
                <Link key={t.label} href={t.href} aria-current={on ? "page" : undefined} aria-disabled={t.dead} tabIndex={t.dead ? -1 : 0}
                  className={`flex flex-1 flex-col items-center gap-0.5 border-b-[3px] py-1.5 text-[11px] ${on ? "border-fb-blue font-semibold text-fb-blue" : "border-transparent text-fb-sub"} ${t.dead ? "pointer-events-none opacity-35" : ""}`}>
                  <Icon d={t.d} />{t.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="flex-1 pb-8">{children}</main>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Demo as">
        <p className="mb-2 text-xs text-fb-sub">Switch who is using the app. Friends' Muses are seeded personas.</p>
        <div className="mb-2 flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => { change("maya"); setOpen(false); }}>Maya (host)</button>
          <button className="btn btn-ghost flex-1" onClick={() => { change("anon"); setOpen(false); }}>Not on Facebook</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search friends" className="mb-2 w-full rounded-lg border border-fb-line p-2.5 text-sm" />
        <ul className="divide-y divide-fb-line">
          {people.filter((p) => p.id !== "maya").map((p) => (
            <li key={p.id}><button onClick={() => { change(p.id); setOpen(false); }} className={`flex w-full items-center gap-3 py-2 text-left text-sm ${as === p.id ? "font-semibold" : ""}`}>
              <Avatar initials={p.initials} color={p.color} size={32} />
              <span className="min-w-0 flex-1"><span className="block truncate">{p.name}</span><span className="block truncate text-xs font-normal text-fb-sub">{p.job} · {p.interests.slice(0, 2).join(", ")}</span></span>
              {as === p.id && <span aria-label="current">✓</span>}
            </button></li>
          ))}
        </ul>
        <Link href="/leaktest" onClick={() => setOpen(false)} className="mt-3 block text-center text-sm text-muse-600 underline">Open privacy leak test</Link>
      </Sheet>
    </ToastProvider>
  );
}
