"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextProps {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

const STORAGE_KEY = "theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  // Load initial theme (localStorage → system preference)
  useEffect(() => {
    try {
      let initial: Theme = "light";

      const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "light" || stored === "dark") {
        initial = stored;
      } else {
        // If nothing stored yet, respect OS/browser preference once
        const prefersDark =
          typeof window !== "undefined" &&
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches;

        initial = prefersDark ? "dark" : "light";
      }

      setTheme(initial);
      document.documentElement.classList.toggle("dark", initial === "dark");
    } catch {
      // Fallback: stay in light if anything goes wrong
      setTheme("light");
      document.documentElement.classList.remove("dark");
    }
  }, []);

  // Update + persist theme when toggled
  const updateTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // ignore storage errors
    }
    document.documentElement.classList.toggle("dark", newTheme === "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: updateTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Hook for components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
