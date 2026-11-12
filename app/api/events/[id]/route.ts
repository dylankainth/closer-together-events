import { NextRequest } from "next/server";
import { db, ensureSeeded } from "@/lib/store";
import { fail, ok } from "@/lib/http";
import { publicEvent } from "@/lib/serialize";
import { SLOTS } from "@/lib/seed";

export const dynamic = "force-dynamic";
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  await ensureSeeded();
  const e = db().events.get(params.id);
  if (!e) return fail("Event not found", 404);
  const host = db().personas.find((p) => p.id === e.hostId)!;
  return ok({ ...publicEvent(e), hostName: host.name, slotLabel: SLOTS.find((s) => s.id === e.slotId)?.label });
}
