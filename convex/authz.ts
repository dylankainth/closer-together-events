// Server-side "who is calling" checks for public Convex functions.
//
// The caller comes from our own session JWT (minted by fbAuth.loginWithFacebook, verified by the
// customJwt provider in auth.config.ts): identity.subject is their persona id. Policy lives in
// authPolicy.ts (unit-tested). AUTHZ_MODE (Convex env) decides what a "no" does, failing closed:
//   "warn" (rollout) -> log "[authz] would deny ..." and allow, EXCEPT owner-level checks
//                       (private data, consent), which always deny
//   anything else, including unset or a typo -> throw ConvexError({ code, message })
import { ConvexError } from "convex/values";
import type { Auth } from "convex/server";
import { applyMode, canViewEvent, decide, parseOperators, type AccessLevel, type Decision } from "./authPolicy";

export interface Caller {
  callerId: string | null;
  isOperator: boolean;
}

type WithAuth = { auth: Auth };

export async function getCaller(ctx: WithAuth): Promise<Caller> {
  const identity = await ctx.auth.getUserIdentity();
  const callerId = identity?.subject ?? null;
  const operators = parseOperators(process.env.DEMO_OPERATOR_PERSONA_IDS);
  return { callerId, isOperator: callerId !== null && operators.has(callerId) };
}

function settle(fn: string, d: Decision, caller: Caller, level: AccessLevel): boolean {
  const outcome = applyMode(process.env.AUTHZ_MODE, d.allow, level);
  if (outcome === "allow") return true;
  if (level === "owner") console.warn(`[authz] denied (owner-level, always strict) fn=${fn} reason=${d.reason} signedIn=${caller.callerId !== null}`);
  if (outcome === "warn") {
    console.warn(`[authz] would deny fn=${fn} reason=${d.reason} signedIn=${caller.callerId !== null}`);
    return true;
  }
  throw new ConvexError({
    code: caller.callerId ? "forbidden" : "unauthorized",
    message: caller.callerId ? "You can't do that as this person." : "Sign in with Facebook to do that.",
  });
}

// Throws (in enforce mode) unless the caller may act as `personaId` at `level`.
export async function requireActor(ctx: WithAuth, personaId: string, level: AccessLevel, fn: string): Promise<Caller> {
  const caller = await getCaller(ctx);
  settle(fn, decide({ ...caller, targetId: personaId, level }), caller, level);
  return caller;
}

export const requireOwner = (ctx: WithAuth, personaId: string, fn: string): Promise<Caller> =>
  requireActor(ctx, personaId, "owner", fn);

// For an event the handler already loaded: the caller must be able to act as its host.
export async function requireHost(
  ctx: WithAuth,
  event: { hostId: string } | null,
  level: AccessLevel,
  fn: string,
): Promise<Caller> {
  if (!event) throw new ConvexError({ code: "not_found", message: "Event not found." });
  return requireActor(ctx, event.hostId, level, fn);
}

export async function requireSignedIn(ctx: WithAuth, fn: string): Promise<Caller> {
  const caller = await getCaller(ctx);
  settle(fn, caller.callerId ? { allow: true, reason: "signed in" } : { allow: false, reason: "not signed in" }, caller, "write");
  return caller;
}

// Non-throwing version of requireActor, for queries that degrade (strip fields, return null)
// instead of failing. Respects AUTHZ_MODE: in warn mode it logs and returns true.
export async function allowedAs(ctx: WithAuth, personaId: string, level: AccessLevel, fn: string): Promise<boolean> {
  const caller = await getCaller(ctx);
  const d = decide({ ...caller, targetId: personaId, level });
  const outcome = applyMode(process.env.AUTHZ_MODE, d.allow, level);
  if (outcome === "warn") console.warn(`[authz] would limit fn=${fn} reason=${d.reason} signedIn=${caller.callerId !== null}`);
  if (outcome === "deny" && level === "owner") console.warn(`[authz] limited (owner-level, always strict) fn=${fn} reason=${d.reason}`);
  return outcome !== "deny";
}

// Soft check for queries that should return null rather than throw (e.g. feed.detail on a draft).
// Respects AUTHZ_MODE: in warn mode it logs and returns true.
export async function mayViewEvent(
  ctx: WithAuth,
  event: { status: string; hostId: string },
  guestIds: string[],
  viewerId: string,
  fn: string,
): Promise<boolean> {
  const caller = await getCaller(ctx);
  // Bind the viewer to the caller here too, so the helper is safe even if a caller forgets
  // requireActor: you may only ask "can X see this event" for an X you may read as.
  const viewerOk = decide({ ...caller, targetId: viewerId, level: "read" }).allow;
  const ok = viewerOk && canViewEvent(event, guestIds, viewerId);
  const outcome = applyMode(process.env.AUTHZ_MODE, ok, "read");
  if (outcome === "warn") console.warn(`[authz] would hide fn=${fn} reason=event not visible to viewer signedIn=${caller.callerId !== null}`);
  return outcome !== "deny";
}
