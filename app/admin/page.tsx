"use client";

import React from "react";
import DashboardLayout from "@/components/DashboardLayout";

export default function AdminPage() {
  async function handleLogout() {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }

  return (
    <DashboardLayout
      title="Admin Dashboard"
      current="overview"
      onLogout={handleLogout}
      navLinks={[
        { key: "overview", label: "Overview", href: "/admin" },
        { key: "users", label: "Users", href: "/admin/view-users" },
        // we’ll add more later: Finance, HR, Settings, etc.
      ]}
    >
      {/* Simple “2030-ready” placeholder content for now */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 8,
              color: "#111827",
            }}
          >
            Welcome, Admin 👋
          </h2>
          <p
            style={{
              fontSize: 14,
              color: "#6b7280",
            }}
          >
            This is your command center for LA CREATIVO. User management,
            roles, and global settings will live here.
          </p>
        </div>

        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
          }}
        >
          <h3
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
              color: "#111827",
            }}
          >
            Quick Snapshot
          </h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Coming soon: live tiles for active users, open projects, invoices,
            and team workload.
          </p>
        </div>
      </section>
    </DashboardLayout>
  );
}
