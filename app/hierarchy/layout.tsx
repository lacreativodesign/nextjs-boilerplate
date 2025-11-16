"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function HierarchyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    { label: "Organization Map", path: "/hierarchy" },
    { label: "Teams", path: "/hierarchy/teams" },
    { label: "Roles", path: "/hierarchy/roles" },
    { label: "Reporting", path: "/hierarchy/reporting" },
    { label: "Structure", path: "/hierarchy/structure" },
    { label: "Settings", path: "/hierarchy/settings" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        backgroundColor: "#f9fafb",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* SIDEBAR */}
      <aside
        style={{
          width: 250,
          backgroundColor: "#111827",
          color: "white",
          padding: "30px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "2px 0 10px rgba(0,0,0,0.15)",
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 30 }}>
          HIERARCHY
        </h2>

        {navItems.map((item) => {
          const active = pathname.startsWith(item.path);

          return (
            <Link
              key={item.path}
              href={item.path}
              style={{
                padding: "12px 16px",
                borderRadius: 8,
                background: active ? "#1f2937" : "transparent",
                color: active ? "#fff" : "#d1d5db",
                fontWeight: active ? 700 : 500,
                textDecoration: "none",
                transition: "0.2s ease",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </aside>

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* HEADER */}
        <header
          style={{
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #e5e7eb",
            padding: "20px 30px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#111827" }}>
            Organization Hierarchy
          </h1>

          <button
            onClick={async () => {
              await fetch("/api/logout", {
                method: "POST",
                credentials: "include",
              });
              window.location.href = "/login";
            }}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: "#ef4444",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            LOGOUT
          </button>
        </header>

        {/* CONTENT */}
        <main style={{ padding: "30px" }}>{children}</main>
      </div>
    </div>
  );
}
