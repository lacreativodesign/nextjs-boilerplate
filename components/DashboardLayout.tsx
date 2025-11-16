"use client";

import React from "react";

type NavLink = {
  key: string;
  label: string;
  href: string;
};

interface DashboardLayoutProps {
  title: string;
  navLinks: NavLink[];
  current: string; // which nav is active
  onLogout?: () => void;
  children: React.ReactNode;
}

export default function DashboardLayout({
  title,
  navLinks,
  current,
  onLogout,
  children,
}: DashboardLayoutProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        backgroundColor: "#f3f4f6",
        fontFamily: "Inter, sans-serif",
        color: "#111827",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 260,
          backgroundColor: "#111827",
          color: "#e5e7eb",
          display: "flex",
          flexDirection: "column",
          padding: "24px 20px",
          boxShadow: "2px 0 10px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#f9fafb",
            }}
          >
            LA CREATIVO
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#9ca3af",
              marginTop: 6,
            }}
          >
            Internal ERP · {title}
          </div>
        </div>

        <nav style={{ flex: 1 }}>
          {navLinks.map((link) => {
            const isActive = link.key === current;
            return (
              <a
                key={link.key}
                href={link.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 12px",
                  marginBottom: 4,
                  borderRadius: 8,
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  backgroundColor: isActive ? "#1f2937" : "transparent",
                  color: isActive ? "#f9fafb" : "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                <span style={{ marginRight: 8 }}>•</span>
                {link.label}
              </a>
            );
          })}
        </nav>

        {onLogout && (
          <button
            onClick={onLogout}
            style={{
              marginTop: 24,
              padding: "10px 16px",
              width: "100%",
              borderRadius: 8,
              border: "none",
              background: "#ef4444",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            LOGOUT
          </button>
        )}
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top bar */}
        <header
          style={{
            padding: "16px 28px",
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: "#111827",
              }}
            >
              {title}
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "#6b7280",
                marginTop: 4,
              }}
            >
              High-level snapshot of LA CREATIVO operations.
            </p>
          </div>
        </header>

        {/* Page body */}
        <div
          style={{
            padding: "24px 28px 40px 28px",
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
      }
