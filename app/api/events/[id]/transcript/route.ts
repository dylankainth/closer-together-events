import { NextRequest } from "next/server";
import { db, ensureSeeded } from "@/lib/store";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";
/** "See what my Muse said": the conversation the viewer's Muse took part in, plus a receipt of what it shared and what was blocked. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  await ensureSeeded();
  const as = req.nextUrl.searchParams.get("as") ?? "";
  const e = db().events.get(params.id);
  if (!e) return fail("Event not found", 404);
  const mine = e.messages.filter((m) => m.forPersona === as);
  const own = new Map(e.messages.filter((m) => m.kind === "reply" && m.fromPersona === as).map((m) => [m.id, m]));
  const replies = Array.from(own.values());
  const shared: string[] = [];
  if (replies.some((m) => m.status !== "blocked")) {
    shared.push("whether you're free then (from your calendar)");
    const interests = replies.find((m) => m.reply?.reason_tag === "shared_interest");
    if (interests?.reply) shared.push(`one-line reason: "${interests.reply.why}"`);
  }
  const blocked = replies.filter((m) => m.status !== "sent");
  return ok({
    title: e.title,
    messages: mine.map((m) => ({ id: m.id, kind: m.kind, from: m.fromPersona, to: m.toPersona, text: m.text, status: m.status, checks: m.checks, source: m.source })),
    receipt: { shared, blocked: blocked.length, blockedWhy: Array.from(new Set(blocked.flatMap((m) => m.checks))) },
  });
}
