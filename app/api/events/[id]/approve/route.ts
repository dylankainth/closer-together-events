import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/store";
import { fail, ok } from "@/lib/http";
import { publicEvent } from "@/lib/serialize";
import { VENUES } from "@/lib/seed";
import { vendorDrafts, makePoster } from "@/lib/plan";
import { SLOTS } from "@/lib/seed";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const e = db().events.get(params.id);
  if (!e) return fail("Event not found", 404);
  const body = z.object({ venueId: z.string().optional() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return fail("Invalid request");
  const venue = VENUES.find((v) => v.id === (body.data.venueId ?? e.venueId));
  if (!venue) return fail("Unknown venue");
  if (venue.id !== e.venueId) {
    const slot = SLOTS.find((s) => s.id === e.slotId)!;
    e.venueId = venue.id;
    e.drafts = vendorDrafts(e.answers, e.title, slot, venue, Math.max(e.settings.quota, e.dateCheck.of));
    e.poster = await makePoster(e.title, slot, venue, e.answers.vibe);
  }
  e.status = "approved";
  return ok(publicEvent(e));
}
