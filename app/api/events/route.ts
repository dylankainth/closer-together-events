import { NextRequest } from "next/server";
import { z } from "zod";
import { db, ensureSeeded, newId, personaById } from "@/lib/store";
import { fail, ok } from "@/lib/http";
import { defaultSettings, planEvent } from "@/lib/events";
import { newBudget } from "@/lib/muse";
import { publicEvent } from "@/lib/serialize";

export const dynamic = "force-dynamic";
const Body = z.object({
  as: z.string().default("maya"),
  answers: z.object({ purpose: z.string().max(60), vibe: z.string().max(30), budget: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  audience: z.string().min(2).max(200),
  settings: z.object({
    friendsOfFriends: z.boolean(), mode: z.enum(["shortlist_and_add", "auto_invite"]),
    maxAutoInvites: z.number().int().min(0).max(100), quota: z.number().int().min(1).max(100),
  }).default(defaultSettings()),
});

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid request");
  const host = personaById(parsed.data.as);
  if (!host) return fail("Unknown host", 404);
  const event = await planEvent({ id: newId("evt"), host, personas: db().personas, answers: parsed.data.answers, audience: parsed.data.audience, settings: parsed.data.settings, budget: newBudget() });
  db().events.set(event.id, event);
  return ok(publicEvent(event));
}

