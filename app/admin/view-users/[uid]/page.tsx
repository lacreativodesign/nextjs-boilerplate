"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface UserRecord {
  uid: string;
  name: string;
  email: string;
  role: string;
  createdAt: number;
}

export default function ViewSingleUserPage() {
  const { uid } = useParams();
  const [user, setUser] = useState<UserRecord | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchUser() {
    try {
      const res = await fetch(`/api/admin/get-user?uid=${uid}`, {
        method: "GET",
        credentials: "include",
      });

      const data = await res.json();
      if (res.ok && data?.user) {
        setUser(data.user);
      }
    } catch (err) {
      console.error("Failed to fetch user:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (uid) fetchUser();
  }, [uid]);

  if (loading) {
    return (
      <div style={container}>
        <h2 style={loadingText}>Loading user…</h2>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={container}>
        <h2 style={errorText}>User not found</h2>
      </div>
    );
  }

  return (
    <div style={container}>
      <h1 style={title}>User Details 🧾</h1>

      <div style={card}>
        <div style={row}>
          <strong style={label}>Name:</strong>
          <span style={value}>{user.name}</span>
        </div>

        <div style={row}>
          <strong style={label}>Email:</strong>
          <span style={value}>{user.email}</span>
        </div>

        <div style={row}>
          <strong style={label}>Role:</strong>
          <span style={value}>{user.role.toUpperCase()}</span>
        </div>

        <div style={row}>
          <strong style={label}>Created:</strong>
          <span style={value}>
            {new Date(user.createdAt).toLocaleDateString("en-US")}
          </span>
        </div>

        <div style={{ marginTop: 30 }}>
          <a
            href="/admin/view-users"
            style={backButton}
          >
            ← Back to Users
          </a>
        </div>
      </div>
    </div>
  );
}

/* -----------------------
   Styles (Same Locked Theme)
------------------------ */

const container: React.CSSProperties = {
  minHeight: "100vh",
  backgroundColor: "#f9fafb",
  fontFamily: "Inter, sans-serif",
  padding: "40px",
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  marginBottom: 20,
  color: "#111827",
};

const card: React.CSSProperties = {
  backgroundColor: "#fff",
  borderRadius: 12,
  padding: "30px",
  maxWidth: 600,
  boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 18,
};

const label: React.CSSProperties = {
  fontSize: 16,
  color: "#4b5563",
};

const value: React.CSSProperties = {
  fontSize: 16,
  color: "#111827",
  fontWeight: 600,
};

const backButton: React.CSSProperties = {
  padding: "10px 16px",
  backgroundColor: "#111827",
  color: "#fff",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 600,
};

const loadingText: React.CSSProperties = {
  fontSize: 20,
  color: "#6b7280",
};

const errorText: React.CSSProperties = {
  fontSize: 20,
  color: "#ef4444",
};
