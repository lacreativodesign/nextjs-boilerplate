"use client";

import React from "react";

type SalesDrawerProps = {
  title: string;
  subtitle?: string;
  isDark?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

export default function SalesDrawer({ title, subtitle, isDark, onClose, children, actions }: SalesDrawerProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "min(520px, 96vw)",
          height: "100%",
          padding: 18,
          background: "var(--card-bg)",
          borderLeft: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.10)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{title}</div>
            {subtitle && <div style={{ opacity: 0.7, fontSize: 12 }}>{subtitle}</div>}
          </div>
          <button className="btn ghost" onClick={onClose} style={{ height: 34, borderRadius: 999 }}>
            Close
          </button>
        </div>

        <div style={{ height: 16 }} />

        {children}

        {actions && (
          <>
            <div style={{ height: 18 }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div>
          </>
        )}
      </div>
    </div>
  );
}
