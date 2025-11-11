"use client";

import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, fetchUserRole, UserRole } from "@/lib/firebaseClient";

const BASE = "https://dashboard.lacreativo.com";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 5; // 5 days (seconds)

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
      // 1) Firebase sign-in
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      // 2) Role from Firestore
      const role: UserRole = await fetchUserRole(uid);

      // 3) Get ID token
      const idToken = await cred.user.getIdToken(true);

      // 4) Create secure HTTP-only session cookie on server
      const resp = await fetch("/api/session-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      const json = await resp.json();
      if (!resp.ok || !json?.ok) {
        throw new Error(json?.error || "Session cookie creation failed");
      }

      // 5) ALSO set a readable role cookie for middleware/routing
      document.cookie = `lac_role=${role}; Domain=.lacreativo.com; Path=/; Max-Age=${COOKIE_MAX_AGE}; Secure; SameSite=Lax`;

      // 6) Redirect to the correct dashboard
      const routes: Record<UserRole, string> = {
        admin: "/admin",
        sales: "/sales",
        am: "/am",
        client: "/client",
        hr: "/hr",
        finance: "/finance",
        production: "/production",
      };

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
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20, textAlign: "center" }}>LA CREATIVO ERP LOGIN</h1>

        {error && (
          <div style={{ marginBottom: 16, padding: 12, background: "#FEE2E2", color: "#B91C1C", borderRadius: 8, fontSize: 14 }}>
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
            style={{ width: "100%", padding: "12px", background: "#06B6D4", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", border: "none", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
