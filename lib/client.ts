"use client";
import { useCallback, useEffect, useState } from "react";

export interface Person { id: string; name: string; initials: string; color: string; interests: string[]; job: string }
export interface StateResp {
  museLive: boolean;
  viewer: null | { id: string; name: string; initials: string; color: string; neverShare: string[]; settings: Record<string, boolean>; profile: { interests: string[]; socialStyle: string; availability: string[] } };
  people: Person[];
}

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Request failed (${r.status})`);
  return j as T;
}
export const post = <T = any>(url: string, body: unknown) => api<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const KEY = "muse_viewer";
export function useViewer() {
  const [as, setAs] = useState<string>("maya");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(location.search).get("as");
      const v = q ?? localStorage.getItem(KEY);
      if (v) setAs(v);
    } catch { /* ignore */ }
    setReady(true);
    const h = (e: Event) => setAs((e as CustomEvent<string>).detail);
    window.addEventListener("muse-viewer", h);
    return () => window.removeEventListener("muse-viewer", h);
  }, []);
  const change = useCallback((id: string) => {
    try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
    setAs(id);
    window.dispatchEvent(new CustomEvent("muse-viewer", { detail: id }));
  }, []);
  return { as, ready, change };
}

export function useState_() {
  const { as, ready } = useViewer();
  const [data, setData] = useState<StateResp | null>(null);
  const reload = useCallback(() => { if (ready) api<StateResp>(`/api/state?as=${as}`).then(setData).catch(() => {}); }, [as, ready]);
  useEffect(reload, [reload]);
  return { data, as, ready, reload };
}

export const put = <T = any>(url: string, body: unknown) => api<T>(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
