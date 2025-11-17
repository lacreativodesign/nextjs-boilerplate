"use client";

import React, { ReactNode, useState } from "react";
import ToggleSwitch from "@/components/ui/ToggleSwitch";
import { useTheme } from "@/components/theme/ThemeProvider";

type Role =
  | "admin"
  | "sales"
  | "am"
  | "production"
  | "hr"
  | "finance"
  | "client";

interface ERPLayoutProps {
  title: string;
  role: Role;
  onLogout?: () => void;
  children: ReactNode;
}

export default function ERPLayout({
  title,
  role,
  onLogout,
  children,
}: ERPLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme } = useTheme();

  const isDark = theme === "dark";

  const sidebarBg = isDark ? "#020617" : "#0f172a";
  const sidebarText = "#e5e7eb";
  const headerBg = isDark ? "#020617" : "#111827";
  const pageBg = isDark ? "#020617" : "#f9fafb";
  const mainCardBg = isDark ? "#020617" : "#ffffff";
  const mainText = isDark ? "#e5e7eb" : "#111827";
  const subText = isDark ? "#9ca3af" : "#6b7280";

  const navItems: { key: Role | "dashboard"; label: string; path: string }[] = [
    { key: "dashboard", label: "Overview", path: "/admin" }, // for now, main
    { key: "admin", label: "User Management", path: "/admin/view-users" },
    // later we can add more, per locked tree
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        backgroundColor: pageBg,
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        color: mainText,
      }}
    >
      {/* SIDEBAR */}
      <aside
        style={{
          width: collapsed ? 72 : 240,
          backgroundColor: sidebarBg,
          color: sidebarText,
          display: "flex",
          flexDirection: "column",
          padding: "16px 12px",
          transition: "width 0.2s ease",
          boxShadow: "2px 0 12px rgba(15,23,42,0.4)",
          position: "sticky",
          top: 0,
          height: "100vh",
          zIndex: 20,
        }}
      >
        {/* Brand + collapse button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 24,
            padding: "0 8px",
          }}
        >
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              border: "1px solid rgba(148,163,184,0.7)",
              background: "transparent",
              color: sidebarText,
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {collapsed ? "›" : "‹"}
          </button>
          {!collapsed && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: 12,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  opacity: 0.7,
                }}
              >
                LA CREATIVO
              </span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                ERP Console
              </span>
            </div>
          )}
        </div>

        {/* Nav items (very basic for now) */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {navItems.map((item) => {
            const isActive = title.includes(item.label) || item.path === "/admin";

            return (
              <a
                key={item.label}
                href={item.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: collapsed ? "10px 6px" : "10px 12px",
                  borderRadius: 10,
                  fontSize: 14,
                  textDecoration: "none",
                  color: sidebarText,
                  backgroundColor: isActive
                    ? "rgba(56, 189, 248, 0.16)"
                    : "transparent",
                  border: isActive
                    ? "1px solid rgba(56, 189, 248, 0.6)"
                    : "1px solid transparent",
                  cursor: "pointer",
                }}
              >
                <span>●</span>
                {!collapsed && <span>{item.label}</span>}
              </a>
            );
          })}
        </nav>

        {/* Footer info */}
        <div style={{ flex: 1 }} />
        <div
          style={{
            marginTop: 24,
            padding: collapsed ? 4 : "8px 8px",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.4)",
            background:
              "linear-gradient(to right, rgba(15,23,42,0.7), rgba(15,23,42,0.3))",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          {!collapsed && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {role.toUpperCase()} MODE
              </div>
              <div style={{ opacity: 0.8 }}>
                Secure workspace for{" "}
                <span style={{ fontWeight: 500 }}>LA CREATIVO</span> team.
              </div>
            </>
          )}
          {collapsed && <span style={{ fontSize: 10 }}>LC • {role}</span>}
        </div>
      </aside>

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* TOP BAR */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 32px",
            backgroundColor: headerBg,
            color: "#f9fafb",
            boxShadow: "0 2px 12px rgba(15,23,42,0.5)",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Admin Area</span>
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {title}
              <span style={{ fontSize: 18 }}>👋</span>
            </span>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            {/* Theme toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Theme</span>
              <ToggleSwitch />
            </div>

            {/* User pill */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                background: "rgba(15,23,42,0.7)",
                border: "1px solid rgba(148,163,184,0.5)",
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "999px",
                  background:
                    "linear-gradient(135deg, #38bdf8, #0ea5e9, #22c55e)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#0b1120",
                }}
              >
                A
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 600 }}>Admin</span>
                <span style={{ opacity: 0.7 }}>LA CREATIVO</span>
              </div>
            </div>

            {/* Logout */}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                style={{
                  padding: "8px 18px",
                  borderRadius: 999,
                  border: "none",
                  background: "#ef4444",
                  color: "#f9fafb",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(248,113,113,0.35)",
                }}
              >
                LOGOUT
              </button>
            )}
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main
          style={{
            flex: 1,
            padding: "28px 32px",
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              backgroundColor: mainCardBg,
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 18px 45px rgba(15,23,42,0.08)",
              border: isDark
                ? "1px solid rgba(55,65,81,0.8)"
                : "1px solid rgba(226,232,240,1)",
            }}
          >
            {children}
          </div>

          {/* Sub text/footer */}
          <div
            style={{
              maxWidth: 1200,
              margin: "14px auto 0",
              fontSize: 12,
              color: subText,
              opacity: 0.9,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>LA CREATIVO • Internal ERP • v0.1</span>
            <span>Secure • Role-based access • 2030-ready</span>
          </div>
        </main>
      </div>
    </div>
  );
}
