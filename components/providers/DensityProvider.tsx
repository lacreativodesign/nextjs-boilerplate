"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type WorkspaceDensity = "comfortable" | "compact";

type DensityContextValue = {
  density: WorkspaceDensity;
  setDensity: (density: WorkspaceDensity) => void;
  toggleDensity: () => void;
};

const STORAGE_KEY = "bizosto_workspace_density";

const DensityContext = createContext<DensityContextValue | null>(null);

function applyDensity(density: WorkspaceDensity) {
  document.documentElement.dataset.density = density;
}

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<WorkspaceDensity>("comfortable");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const nextDensity: WorkspaceDensity =
      stored === "compact" ? "compact" : "comfortable";
    setDensityState(nextDensity);
    applyDensity(nextDensity);
  }, []);

  const setDensity = useCallback((nextDensity: WorkspaceDensity) => {
    window.localStorage.setItem(STORAGE_KEY, nextDensity);
    setDensityState(nextDensity);
    applyDensity(nextDensity);
  }, []);

  const toggleDensity = useCallback(() => {
    setDensity(density === "comfortable" ? "compact" : "comfortable");
  }, [density, setDensity]);

  const value = useMemo(
    () => ({ density, setDensity, toggleDensity }),
    [density, setDensity, toggleDensity],
  );

  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  );
}

export function useDensity() {
  const context = useContext(DensityContext);
  if (!context)
    throw new Error("useDensity must be used within DensityProvider");
  return context;
}
