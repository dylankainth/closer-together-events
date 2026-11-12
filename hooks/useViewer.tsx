import React, { createContext, useContext, useMemo, useState } from "react";
import { HOST_ID } from "@/convex/seedData";

// No real auth session persistence in v1 (hackathon seeded-data constraint) — this tracks both
// "which demo persona am I looking at" (always available) and "did I actually sign in with
// Facebook this session" (isLoggedIn), so the Menu profile row can offer the right actions.
interface ViewerContextValue {
  viewerId: string;
  setViewerId: (id: string) => void;
  isLoggedIn: boolean;
  onFacebookLogin: (personaId: string) => void;
  logout: () => void;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewerId, setViewerIdState] = useState(HOST_ID);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const setViewerId = (id: string) => {
    setIsLoggedIn(false); // switching to a demo persona always drops a real session
    setViewerIdState(id);
  };
  const onFacebookLogin = (personaId: string) => {
    setViewerIdState(personaId);
    setIsLoggedIn(true);
  };
  const logout = () => {
    setIsLoggedIn(false);
    setViewerIdState(HOST_ID);
  };

  const value = useMemo(
    () => ({ viewerId, setViewerId, isLoggedIn, onFacebookLogin, logout }),
    [viewerId, isLoggedIn],
  );
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useViewer must be used within a ViewerProvider");
  return ctx;
}
