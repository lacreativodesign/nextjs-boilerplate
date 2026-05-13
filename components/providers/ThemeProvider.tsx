"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: Theme;
  isDark: boolean;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  isDark: false,
  setTheme: () => {},
  toggle: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "bizosto_theme";

function applyTheme(theme: Theme): boolean {
  if (typeof window === "undefined") return false;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  if (dark) {
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
  } else {
    document.documentElement.classList.remove("dark");
    // Add .light class to override @media (prefers-color-scheme: dark)
    // when user explicitly chooses light mode
    if (theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }
  return dark;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
    setThemeState(stored);
    const dark = applyTheme(stored);
    setIsDark(dark);

    // Listen for system preference changes (only relevant when theme === "system")
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if ((localStorage.getItem(STORAGE_KEY) ?? "system") === "system") {
        const dark = applyTheme("system");
        setIsDark(dark);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const setTheme = (t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
    const dark = applyTheme(t);
    setIsDark(dark);
  };

  const toggle = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
