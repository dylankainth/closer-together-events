import { NextRequest } from "next/server";
import { db, ensureSeeded } from "@/lib/store";
import { ok } from "@/lib/http";
import { SLOTS, VENUES } from "@/lib/seed";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  await ensureSeeded();
  const as = req.nextUrl.searchParams.get("as") ?? "maya";
  const d = db();
  const card = (e: ReturnType<typeof d.events.get> & object) => {
    const host = d.personas.find((p) => p.id === e.hostId)!;
    const me = e.guests.find((g) => g.personaId === as);
    return {
      id: e.id, title: e.title, poster: e.poster, hostName: host.name, slot: SLOTS.find((s) => s.id === e.slotId)?.label,
      venue: VENUES.find((v) => v.id === e.venueId)?.name, status: e.status,
      going: e.guests.filter((g) => g.status === "going").length + 1,
      goingPeople: [host, ...e.guests.filter((g) => g.status === "going").map((g) => d.personas.find((p) => p.id === g.personaId)).filter(Boolean)].slice(0, 6).map((p) => ({ initials: p!.initials, color: p!.color })),
      invited: e.guests.length,
      nudged: e.guests.filter((g) => g.nudge && g.nudge.verdict !== "skip").length,
      myStatus: me?.status, nudge: me?.nudge,
    };
  };
  const all = Array.from(d.events.values());
  const yours = all.filter((e) => e.hostId === as).map(card);
  const picked = all.filter((e) => e.status === "sent" && e.hostId !== as && e.guests.some((g) => g.personaId === as && g.nudge && g.nudge.verdict !== "skip")).map(card);
  return ok({ yours, picked });
}
