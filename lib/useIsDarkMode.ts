"use client";

import { useEffect, useState } from "react";

/**
 * OS / Browser decides dark vs light.
 * No manual toggle. No html class dependency.
 * This is the ONLY source of truth for theme detection.
 */
export function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    const read = () => setIsDark(!!mql.matches);
    read();

    // @ts-expect-error older browsers
    mql.addEventListener ? mql.addEventListener("change", read) : mql.addListener(read);

    return () => {
      // @ts-expect-error older browsers
      mql.removeEventListener ? mql.removeEventListener("change", read) : mql.removeListener(read);
    };
  }, []);

  return isDark;
}
