"use client";

import type { ReactNode } from "react";
const alertStyles = {
  error: {
    light: {
      border: "1px solid rgba(239,68,68,0.35)",
      background: "rgba(254,226,226,0.6)",
      color: "#991b1b",
    },
    dark: {
      border: "1px solid rgba(239,68,68,0.35)",
      background: "rgba(127,29,29,0.2)",
      color: "#fecaca",
    },
  },
  success: {
    light: {
      border: "1px solid rgba(16,185,129,0.35)",
      background: "rgba(209,250,229,0.6)",
      color: "#065f46",
    },
    dark: {
      border: "1px solid rgba(16,185,129,0.35)",
      background: "rgba(6,78,59,0.35)",
      color: "#a7f3d0",
    },
  },
  info: {
    light: {
      border: "1px solid rgba(37,99,235,0.25)",
      background: "rgba(219,234,254,0.5)",
      color: "#1e3a8a",
    },
    dark: {
      border: "1px solid rgba(148,163,184,0.35)",
      background: "rgba(30,41,59,0.4)",
      color: "#e2e8f0",
    },
  },
};

export function SettingsAlert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const palette = alertStyles[tone].light;

  return (
    <div className="card" style={{ borderRadius: 14, padding: 16, fontWeight: 600, ...palette }}>
      {children}
    </div>
  );
}
