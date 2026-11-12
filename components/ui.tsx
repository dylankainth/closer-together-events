"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

/* ---------- Toasts ---------- */
const ToastCtx = createContext<(msg: string, tone?: "ok" | "info") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; tone: string }[]>([]);
  const push = useCallback((msg: string, tone: "ok" | "info" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex max-w-[430px] flex-col items-center gap-2 px-4">
        {items.map((i) => (
          <div key={i.id} className="rise pointer-events-auto rounded-full bg-fb-ink px-4 py-2 text-sm text-white shadow-lg">{i.tone === "ok" ? "✓ " : ""}{i.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Small pieces ---------- */
export function Skeleton({ className = "h-20" }: { className?: string }) { return <div className={`skeleton ${className}`} aria-hidden />; }
export function CardSkeletons({ n = 2 }: { n?: number }) {
  return <div className="space-y-3" role="status" aria-label="Loading">{Array.from({ length: n }).map((_, i) => <div key={i} className="card flex gap-3 p-3"><Skeleton className="h-28 w-20 shrink-0" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" /></div></div>)}</div>;
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 flex-col gap-1" aria-current={i === current ? "step" : undefined}>
          <span className={`h-1.5 rounded-full transition-all ${i < current ? "bg-muse-500" : i === current ? "bg-fb-blue" : "bg-fb-line"}`} />
          <span className={`text-[10px] leading-none ${i === current ? "font-semibold text-fb-ink" : "text-fb-sub"}`}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function StickyBar({ children }: { children: React.ReactNode }) {
  return <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[430px] -translate-x-1/2 border-t border-fb-line bg-white/95 px-4 py-3 backdrop-blur" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>{children}</div>;
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet max-h-[80vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-fb-line" />
        <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button onClick={onClose} className="rounded-full px-2 py-1 text-fb-sub" aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

export function Bar({ value, label }: { value: number; label: string }) {
  return <span className="inline-flex items-center gap-1.5 text-[11px] text-fb-sub" title={`${label}: ${Math.round(value * 100)}%`}><span className="h-1.5 w-12 overflow-hidden rounded-full bg-fb-line"><span className="block h-full rounded-full bg-muse-500" style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} /></span>{label}</span>;
}

export function Pill({ tone = "gray", children }: { tone?: "gray" | "green" | "amber" | "red" | "purple"; children: React.ReactNode }) {
  const t = { gray: "bg-fb-bg text-fb-sub", green: "bg-green-100 text-green-700", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-700", purple: "bg-muse-100 text-muse-600" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>;
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-muse-500" : "bg-fb-line"} ${disabled ? "opacity-50" : ""}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
