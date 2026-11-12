import { ok } from "@/lib/http";
import { funnelQuality, leakTest, planCorrectness } from "@/lib/eval";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  const [leak, plan, funnel] = [await leakTest(), await planCorrectness(), await funnelQuality()];
  return ok({ leak, plan, funnel });
}
