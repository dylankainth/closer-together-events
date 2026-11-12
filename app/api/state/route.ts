import { NextRequest } from "next/server";
import { db, ensureSeeded } from "@/lib/store";
import { ok } from "@/lib/http";
import { museLive } from "@/lib/config";
import { eventSafeProfile } from "@/lib/privacy";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  await ensureSeeded();
  const as = req.nextUrl.searchParams.get("as") ?? "maya";
  const d = db();
  const persona = d.personas.find((p) => p.id === as);
  return ok({
    museLive: museLive(),
    viewer: persona ? { id: persona.id, name: persona.name, initials: persona.initials, color: persona.color, settings: persona.settings, neverShare: persona.neverShare, profile: eventSafeProfile(persona) } : null,
    people: d.personas.filter((p) => p.hop === 1).map((p) => ({ id: p.id, name: p.name, initials: p.initials, color: p.color, interests: p.interests, job: p.job })),
  });
}
