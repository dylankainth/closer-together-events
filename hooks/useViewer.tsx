import React, { createContext, useContext, useMemo, useState } from "react";
import { HOST_ID } from "@/convex/seedData";

// No real auth in v1 (seeded-data hackathon constraint) — this is the demo-persona switcher that
// lets anyone on stage pick "which phone" they're holding.
interface ViewerContextValue {
  viewerId: string;
  setViewerId: (id: string) => void;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewerId, setViewerId] = useState(HOST_ID);
  const value = useMemo(() => ({ viewerId, setViewerId }), [viewerId]);
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useViewer must be used within a ViewerProvider");
  return ctx;
}
