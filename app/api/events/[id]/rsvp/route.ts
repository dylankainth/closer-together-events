import { NextRequest } from "next/server";
import { z } from "zod";
import { db, personaById } from "@/lib/store";
import { fail, ok } from "@/lib/http";
import { publicEvent } from "@/lib/serialize";

export const dynamic = "force-dynamic";
const Body = z.object({
  as: z.string().optional(),                 // a Muse user
  name: z.string().min(1).max(60).optional(), // a non-user from the plain invite link
  status: z.enum(["going", "maybe", "skip", "cant"]),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const e = db().events.get(params.id);
  if (!e) return fail("Event not found", 404);
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return fail("Invalid request");
  if (b.data.as) {
    const p = personaById(b.data.as);
    if (!p) return fail("Unknown user", 404);
    const g = e.guests.find((x) => x.personaId === p.id);
    if (g) g.status = b.data.status;
    else e.guests.push({ personaId: p.id, name: p.name, kind: "muse", status: b.data.status });
  } else if (b.data.name) {
    const name = b.data.name.trim();
    const g = e.guests.find((x) => x.kind === "external" && x.name === name);
    if (g) g.status = b.data.status;
    else e.guests.push({ name, kind: "external", status: b.data.status });
  } else return fail("Who is RSVPing?");
  // "Skip" is private: it sends nothing to the host or other guests.
  return ok(publicEvent(e));
}
