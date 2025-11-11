"use client";

import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, fetchUserRole } from "@/lib/firebaseClient";

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
      // 1) Firebase login
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      // 2) Find role in Firestore
      const role = await fetchUserRole(uid);
      if (!role) {
        throw new Error("No role assigned. Contact LA CREATIVO Admin.");
      }

      // 3) Create secure session cookie
      const idToken = await userCred.user.getIdToken(true);

      const sess = await fetch("/api/session-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      const out = await sess.json();
      if (!sess.ok || !out.ok) {
        throw new Error(out?.error || "Session cookie failed");
      }

      // 4) Absolute redirect to dashboard domain
      const BASE = "https://dashboard.lacreativo.com";

      const routes: Record<string, string> = {
        admin: "/admin",
        sales: "/sales",
        am: "/am",
        hr: "/hr",
        production: "/production",
        finance: "/finance",
        client: "/client",
      };

      if (!routes[role]) {
        throw new Error(Invalid role "${role}" assigned.);
      }

      window.location.href = ${BASE}${routes[role]};
    } catch (err: any) {
      console.error("LOGIN ERROR:", err);
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "#F1F5F9",
        fontFamily: "Inter, sans-serif",
        padding: 20,
      }}
    >
      <div
        style={{
          width: 360,
          padding: 32,
          borderRadius: 16,
          background: "#FFFFFF",
          border: "1px solid #E2E8F0",
        }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          LA CREATIVO ERP LOGIN
        </h1>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: "#FEE2E2",
              color: "#B91C1C",
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              marginBottom: 14,
              borderRadius: 8,
              border: "1px solid #CBD5E1",
            }}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              marginBottom: 14,
              borderRadius: 8,
              border: "1px solid #CBD5E1",
            }}
            required
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              background: "#06B6D4",
              borderRadius: 8,
              color: "#fff",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              border: "none",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}