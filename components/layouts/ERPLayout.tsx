"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function ERPLayout({
  children,
  title = "Dashboard",
  role = "admin",
}: {
  children: React.ReactNode;
  title?: string;
  role: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const menuItemsByRole: Record<string, Array<{ label: string; href: string }>> =
    {
      admin: [
        { label: "Overview", href: "/admin" },
        { label: "Create User", href: "/admin/create-user" },
        { label: "View Users", href: "/admin/view-users" },
        { label: "User Management", href: "/admin/user-management" },
      ],
      sales: [{ label: "Sales Dashboard", href: "/sales" }],
      am_manager: [{ label: "Account Manager", href: "/am_manager" }],
      am: [{ label: "Account Manager", href: "/am" }],
      production_manager: [{ label: "Production Manager", href: "/production_manager" }],
      production: [{ label: "Production Dashboard", href: "/production" }],
      hr: [{ label: "HR Dashboard", href: "/hr" }],
      finance: [{ label: "Finance Dashboard", href: "/finance" }],
      client: [
        { label: "Client Dashboard", href: "/client" },
        { label: "Profile Settings", href: "/client/settings" },
      ],
    };

  const menuItems = menuItemsByRole[role] || [];

  async function handleLogout() {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f9fafb",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: sidebarOpen ? 240 : 70,
          transition: "width 0.2s ease",
          background: "#111827",
          color: "#fff",
          paddingTop: 20,
          boxShadow: "2px 0 5px rgba(0,0,0,0.1)",
        }}
      >
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            marginLeft: 20,
            marginBottom: 20,
            padding: 10,
            background: "#1f2937",
            color: "#fff",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            width: sidebarOpen ? "80%" : "50px",
          }}
        >
          {sidebarOpen ? "⬅ Collapse" : "➡"}
        </button>

        {menuItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <div
              style={{
                padding: "12px 20px",
                cursor: "pointer",
                color: "#d1d5db",
                fontWeight: 500,
              }}
            >
              {item.label}
            </div>
          </Link>
        ))}
      </aside>

      {/* Main content */}
      <main style={{ flex: 1 }}>
        <header
          style={{
            background: "#fff",
            padding: "20px 30px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>{title}</h1>

          <button
            onClick={handleLogout}
            style={{
              padding: "8px 16px",
              background: "#ef4444",
              color: "#fff",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Logout
          </button>
        </header>

        <section style={{ padding: 30 }}>{children}</section>
      </main>
    </div>
  );
    }
