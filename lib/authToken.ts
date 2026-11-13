// In-memory session for Convex auth: the JWT that fbAuth.loginWithFacebook mints, plus who it is
// for. Memory only (no expo-secure-store: adding a native module would force a rebuild), so a
// restart means logging in again, which is one tap.
import { useCallback, useSyncExternalStore } from "react";

export interface Session {
  token: string;
  expiresAt: number; // ms since epoch
  personaId: string;
  isOperator: boolean; // display hint only; the server re-checks on every call
}

let current: Session | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Treat a token as gone a minute before it expires, so a request never races expiry.
const SKEW_MS = 60_000;
const isLive = (s: Session | null): s is Session => !!s && s.expiresAt - SKEW_MS > Date.now();

export function setSession(s: Session | null): void {
  current = s;
  notify();
}

export function getSession(): Session | null {
  if (current && !isLive(current)) {
    current = null;
    notify();
  }
  return current;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, () => (isLive(current) ? current : null), () => null);
}

// For <ConvexProviderWithAuth useAuth={useConvexSessionAuth}>. fetchAccessToken changes identity
// whenever the token changes, which tells the Convex client to re-authenticate.
export function useConvexSessionAuth(): {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: (args: { forceRefreshToken: boolean }) => Promise<string | null>;
} {
  const session = useSession();
  const token = session?.token ?? null;
  // No refresh endpoint in v1 (an 8h token covers a demo day); on expiry we return null and the
  // app falls back to anonymous, read-only demo data until the next login.
  const fetchAccessToken = useCallback(async () => getSession()?.token ?? null, [token]);
  return { isLoading: false, isAuthenticated: token !== null, fetchAccessToken };
}
