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

export default function SalesDrawer({ title, subtitle, onClose, children, actions }: SalesDrawerProps) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel drawer-panel--md" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="drawer-title">{title}</div>
            {subtitle && <div className="drawer-subtitle">{subtitle}</div>}
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
