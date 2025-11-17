"use client";

import React from "react";
import ERPLayout from "@/components/layout/ERPLayout";

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
    <ERPLayout title="Admin Dashboard" role="admin" onLogout={handleLogout}>
      <div
        style={{
          textAlign: "left",
          color: "#374151",
        }}
      >
        <h2
          style={{
            fontSize: 24,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Welcome, Admin 👋
        </h2>
        <p
          style={{
            marginTop: 4,
            fontSize: 15,
            color: "#6b7280",
          }}
        >
          Your LA CREATIVO ERP command center is ready. Soon you’ll see:
        </p>
        <ul
          style={{
            marginTop: 16,
            marginLeft: 18,
            fontSize: 14,
            color: "#4b5563",
            lineHeight: 1.7,
          }}
        >
          <li>High-level overview of all teams and active projects</li>
          <li>User Management for Sales, AM, Production, HR, Finance & Clients</li>
          <li>Role-based analytics: performance, utilization, and pipeline</li>
        </ul>
      </div>
    </ERPLayout>
  );
}
