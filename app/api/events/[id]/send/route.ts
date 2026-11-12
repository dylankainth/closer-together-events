import { NextRequest } from "next/server";
import { z } from "zod";
import { db, personaById } from "@/lib/store";
import { fail } from "@/lib/http";
import { newBudget } from "@/lib/muse";
import { runHuddle, HuddleEvent } from "@/lib/huddle";
import { publicEvent } from "@/lib/serialize";
import { Guest } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Host taps "Add selected and send": invites go out, the huddle runs, results stream back as NDJSON. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const e = db().events.get(params.id);
  if (!e) return fail("Event not found", 404);
  if (e.status === "draft") return fail("Approve the plan first", 409);
  const body = z.object({ guestIds: z.array(z.string()).max(100) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return fail("Invalid request");

  const ids = Array.from(new Set(body.data.guestIds)).filter((id) => id !== e.hostId && personaById(id));
  const existing = new Set(e.guests.map((g) => g.personaId));
  ids.forEach((id) => {
    if (existing.has(id)) return;
    const p = personaById(id)!;
    e.guests.push({ personaId: id, name: p.name, kind: "muse", status: "invited" } as Guest);
  });
  e.status = "sent";

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const budget = newBudget();
        const res = await runHuddle(e, ids, db().personas, {
          budget,
          onEvent: (ev: HuddleEvent) => {
            if (ev.type === "message") send({ type: "message", message: ev.message });
            if (ev.type === "decision") send({ type: "decision", personaId: ev.personaId, name: personaById(ev.personaId)?.name, nudge: ev.nudge });
          },
        });
        e.messages.push(...res.messages);
        e.museCalls += res.calls;
        e.guests.forEach((g) => { if (g.personaId && res.nudges[g.personaId]) g.nudge = res.nudges[g.personaId]; });
        send({ type: "done", event: publicEvent(e) });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "huddle failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
