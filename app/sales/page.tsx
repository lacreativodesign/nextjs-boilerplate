"use client";
import React, { useEffect, useState } from "react";

export default function SalesPage() {
  const [loading, setLoading] = useState(true);

  async function fetchRole() {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (!res.ok) {
        window.location.href = "/login";
        return;
      }

      const data = await res.json();

      if (data.role !== "sales") {
        window.location.href = `/${data.role}`;
        return;
      }

      setLoading(false);
    } catch (err) {
      console.error("Session error:", err);
      window.location.href = "/login";
    }
  }

  useEffect(() => {
    fetchRole();
  }, []);

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

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#f9fafb",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <p style={{ color: "#6b7280", fontSize: "18px" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#f9fafb",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* Top Bar */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 40px",
          backgroundColor: "#111827",
          color: "white",
          boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
        }}
      >
        <h1 style={{ fontSize: "20px", fontWeight: 600 }}>Sales Dashboard</h1>
        <button
          onClick={handleLogout}
          style={{
            padding: "10px 20px",
            borderRadius: "8px",
            border: "none",
            background: "#ef4444",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            transition: "background 0.2s ease",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "#dc2626")}
          onMouseOut={(e) => (e.currentTarget.style.background = "#ef4444")}
        >
          LOGOUT
        </button>
      </header>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          padding: "40px",
          textAlign: "center",
          color: "#374151",
        }}
      >
        <h2 style={{ fontSize: "24px", fontWeight: "600" }}>
          Welcome, Sales Team 🚀
        </h2>
        <p style={{ marginTop: "10px", fontSize: "16px", color: "#6b7280" }}>
          Your sales dashboard and lead management will appear here soon.
        </p>
      </main>
    </div>
  );
}
