"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { StateResp, api, useViewer } from "@/lib/client";

export function Avatar({ initials, color, size = 40 }: { initials: string; color: string; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>
      {initials}
    </span>
  );
}

export function MuseBadge({ children = "from Muse" }: { children?: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-muse-100 px-2 py-0.5 text-[11px] font-semibold text-muse-600">✦ {children}</span>;
}

const TABS = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/messenger", label: "Messenger", icon: "✉" },
  { href: "/", label: "Reels", icon: "▶", dead: true },
  { href: "/", label: "Events", icon: "▦", active: true },
  { href: "/settings", label: "Menu", icon: "☰" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { as, change, ready } = useViewer();
  const [st, setSt] = useState<StateResp | null>(null);
  useEffect(() => { if (ready) api<StateResp>(`/api/state?as=${as}`).then(setSt).catch(() => {}); }, [as, ready]);
  const viewer = st?.viewer;

  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-fb-bg shadow-xl">
      <header className="sticky top-0 z-20 border-b border-fb-line bg-white">
        <div className="flex items-center justify-between px-4 pt-3">
          <Link href="/" className="text-2xl font-extrabold tracking-tight text-fb-blue">facebook</Link>
          <div className="flex items-center gap-2 text-fb-sub">
            {st && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.museLive ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{st.museLive ? "Muse live" : "Muse offline demo"}</span>}
            {viewer ? <Avatar initials={viewer.initials} color={viewer.color} size={30} /> : null}
          </div>
        </div>
        <nav className="mt-1 flex justify-between px-2">
          {TABS.map((t) => {
            const on = t.href === "/" ? (t.active ? path === "/" || path.startsWith("/e/") || path.startsWith("/host") : false) : path.startsWith(t.href);
            return (
              <Link key={t.label} href={t.href} aria-disabled={t.dead} className={`flex-1 border-b-[3px] py-2 text-center text-xs ${on ? "border-fb-blue font-semibold text-fb-blue" : "border-transparent text-fb-sub"} ${t.dead ? "pointer-events-none opacity-40" : ""}`}>
                <div className="text-lg leading-none">{t.icon}</div>{t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 pb-24">{children}</main>
      <footer className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-fb-line bg-white/95 px-3 py-2 text-xs backdrop-blur">
        <label className="flex items-center gap-2 text-fb-sub">
          <span className="whitespace-nowrap font-semibold">Demo as</span>
          <select value={as} onChange={(e) => change(e.target.value)} className="min-w-0 flex-1 rounded-md border border-fb-line bg-white px-2 py-1 text-fb-ink">
            <option value="maya">Maya Chen (host)</option>
            <option value="anon">Not on Facebook (invite link)</option>
            {st?.people.filter((p) => p.id !== "maya").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Link href="/leaktest" className="whitespace-nowrap text-muse-600 underline">Leak test</Link>
        </label>
      </footer>
    </div>
  );
}
