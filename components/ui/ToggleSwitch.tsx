"use client";

import React from "react";
import { useTheme } from "@/components/theme/ThemeProvider";

export default function ToggleSwitch() {
  const { theme, toggleTheme } = useTheme();
  const isOn = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      style={{
        position: "relative",
        width: 52,
        height: 28,
        borderRadius: 999,
        border: "1px solid rgba(148, 163, 184, 0.8)",
        background: isOn ? "#0f172a" : "#e5e7eb",
        display: "flex",
        alignItems: "center",
        padding: 2,
        cursor: "pointer",
        transition: "background 0.2s ease, border-color 0.2s ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "999px",
          background: isOn ? "#38bdf8" : "#ffffff",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.4)",
          transform: isOn ? "translateX(22px)" : "translateX(0)",
          transition: "transform 0.2s ease, background 0.2s ease",
        }}
      />
    </button>
  );
}
