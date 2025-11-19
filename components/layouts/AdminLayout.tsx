"use client";

import AdminSidebar from "./AdminSidebar";
import { useTheme } from "@/components/theme/ThemeProvider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { toggleTheme } = useTheme();

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <AdminSidebar />

      {/* MAIN PANEL */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Top Bar */}
        <header
          style={{
            height: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 25px",
            background: "var(--header-bg)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "var(--header-text)",
            }}
          >
            Admin Dashboard
          </h1>

          <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
            <button
              onClick={toggleTheme}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--card-bg)",
                color: "var(--header-text)",
                cursor: "pointer",
              }}
            >
              Toggle Theme
            </button>

            <button
              onClick={async () => {
                await fetch("/api/logout", {
                  method: "POST",
                  credentials: "include",
                });
                window.location.href = "/login";
              }}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "#ef4444",
                color: "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <main style={{ padding: 30 }}>{children}</main>
      </div>
    </div>
  );
}
