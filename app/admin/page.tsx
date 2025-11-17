"use client";
import React from "react";
import ERPLayout from "@/components/layouts/ERPLayout";

export default function AdminPage() {
  return (
    <ERPLayout role="admin" title="Admin Dashboard">
      <div style={{ padding: "30px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 600 }}>
          Welcome, Admin 👋
        </h2>

        <p style={{ marginTop: 10, fontSize: 16, color: "#6b7280" }}>
          Your full admin control panel will appear here.
        </p>
      </div>
    </ERPLayout>
  );
}
