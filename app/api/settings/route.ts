import { NextRequest } from "next/server";
import { z } from "zod";
import { personaById } from "@/lib/store";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";
const Body = z.object({
  as: z.string(),
  settings: z.object({ talkToMuses: z.boolean(), nudgesOn: z.boolean(), askBeforeRsvp: z.boolean(), askBeforeLocation: z.boolean(), profileApproved: z.boolean() }).partial().optional(),
  neverShare: z.array(z.string().min(1).max(40)).max(30).optional(),
});
export async function PUT(req: NextRequest) {
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return fail("Invalid request");
  const p = personaById(b.data.as);
  if (!p) return fail("Unknown user", 404);
  if (b.data.settings) {
    const s = b.data.settings;
    // Committing (RSVP / location) always asks first: these cannot be switched off.
    p.settings = { ...p.settings, ...s, askBeforeRsvp: true, askBeforeLocation: true };
  }
  if (b.data.neverShare) p.neverShare = b.data.neverShare.map((x) => x.toLowerCase());
  return ok({ settings: p.settings, neverShare: p.neverShare });
}
