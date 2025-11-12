"use client";

// Immediately bounce if someone opened /login on dashboard host
if (typeof window !== "undefined" && window.location.hostname.startsWith("dashboard.")) {
  window.location.replace("https://login.lacreativo.com/login");
  return null;
}

import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, fetchUserRole, UserRole } from "@/lib/firebaseClient";

const BASE = "https://dashboard.lacreativo.com";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 5; // 5 days

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Firebase login
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      const role: UserRole = await fetchUserRole(uid);
      const idToken = await cred.user.getIdToken(true);

      // Create session cookie
      const resp = await fetch("/api/session-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      const json = await resp.json();
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || "Session error");
      }

      // ✅ DELETE OLD ROLE COOKIE FIRST
      document.cookie = `lac_role=; Domain=.lacreativo.com; Path=/; Max-Age=0`;

      // ✅ SET NEW ROLE COOKIE
      document.cookie = `lac_role=${role}; Domain=.lacreativo.com; Path=/; Max-Age=${COOKIE_MAX_AGE}; Secure; SameSite=Lax`;

      const routes: Record<UserRole, string> = {
        admin: "/admin",
        sales: "/sales",
        am: "/am",
        client: "/client",
        hr: "/hr",
        finance: "/finance",
        production: "/production",
      };

      // Redirect to role
      window.location.href = `${BASE}${routes[role]}`;
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "#F1F5F9", padding: 20 }}>
      <div style={{ width: 360, padding: 32, borderRadius: 16, background: "#fff", border: "1px solid #E2E8F0" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20, textAlign: "center" }}>
          LA CREATIVO ERP LOGIN
        </h1>

        {error && (
          <div style={{ padding: 12, background: "#FEE2E2", color: "#B91C1C", borderRadius: 8, fontSize: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "12px 14px", marginBottom: 14, borderRadius: 8, border: "1px solid #CBD5E1" }}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: "12px 14px", marginBottom: 14, borderRadius: 8, border: "1px solid #CBD5E1" }}
            required
          />

          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "12px", background: "#06B6D4", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
