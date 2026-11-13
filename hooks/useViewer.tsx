import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth } from "convex/react";
import { HOST_ID } from "@/convex/seedData";
import { setSession, useSession } from "@/lib/authToken";

// Two separate things:
// - viewerId: which persona the screens show ("which phone am I holding"). Anyone can view seeded
//   demo personas; acting as them (writes) needs a demo-operator session on the server.
// - the session (lib/authToken.ts): who actually signed in with Facebook. It survives switching
//   viewer, so a team operator can drive Maya and Sam on stage, and is cleared on logout or expiry.
export interface LoginSession {
  token: string | null;
  expiresAt: number | null;
  isOperator: boolean;
}

interface ViewerContextValue {
  viewerId: string;
  setViewerId: (id: string) => void;
  isLoggedIn: boolean;
  sessionPersonaId: string | null;
  isOperator: boolean;
  // Can this session write as the persona currently being viewed? (UI hint; the server decides.)
  canActAsViewer: boolean;
  // Throws if the server issued no session token (auth keys not installed on that deployment).
  onFacebookLogin: (personaId: string, session?: LoginSession) => void;
  // True between a successful login and Convex confirming the token.
  signingIn: boolean;
  loginError: string | null;
  logout: () => void;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);
const AUTH_CONFIRM_TIMEOUT_MS = 15_000;

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewerId, setViewerIdState] = useState(HOST_ID);
  const [pendingViewer, setPendingViewer] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const session = useSession();
  const { isAuthenticated } = useConvexAuth();
  const isLoggedIn = session !== null;
  const sessionPersonaId = session?.personaId ?? null;
  const isOperator = session?.isOperator ?? false;

  // Switch to the real persona only once Convex has accepted the token, so the first query for an
  // fb_ persona never goes out anonymously (which enforce mode would reject).
  useEffect(() => {
    if (pendingViewer && isAuthenticated) {
      setViewerIdState(pendingViewer);
      setPendingViewer(null);
    }
  }, [pendingViewer, isAuthenticated]);

  useEffect(() => {
    if (!pendingViewer) return;
    const t = setTimeout(() => {
      setPendingViewer(null);
      setSession(null);
      setLoginError("Signed in with Facebook, but the server didn't accept the session. Try again.");
    }, AUTH_CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pendingViewer]);

  // Session expired or cleared while viewing your own real persona: fall back to demo data.
  // Only after a session existed, so a login in progress is never bounced.
  const hadSession = useRef(false);
  useEffect(() => {
    if (session) hadSession.current = true;
    else if (hadSession.current && viewerId.startsWith("fb_")) {
      hadSession.current = false;
      setViewerIdState(HOST_ID);
    }
  }, [session, viewerId]);

  const value = useMemo<ViewerContextValue>(() => {
    const canActAsViewer =
      isLoggedIn && isAuthenticated && (viewerId === sessionPersonaId || (isOperator && !viewerId.startsWith("fb_")));
    return {
      viewerId,
      setViewerId: (id: string) => setViewerIdState(id),
      isLoggedIn,
      sessionPersonaId,
      isOperator,
      canActAsViewer,
      signingIn: pendingViewer !== null,
      loginError,
      onFacebookLogin: (personaId: string, s?: LoginSession) => {
        if (!s?.token || !s.expiresAt) {
          throw new Error("Signed in with Facebook, but the server didn't issue a session (auth keys not installed?).");
        }
        setLoginError(null);
        setSession({ token: s.token, expiresAt: s.expiresAt, personaId, isOperator: s.isOperator });
        setPendingViewer(personaId);
      },
      logout: () => {
        setPendingViewer(null);
        setSession(null);
        setViewerIdState(HOST_ID);
      },
    };
  }, [viewerId, isLoggedIn, isAuthenticated, sessionPersonaId, isOperator, pendingViewer, loginError]);

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useViewer must be used within a ViewerProvider");
  return ctx;
}
