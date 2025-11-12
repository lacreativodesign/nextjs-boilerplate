"use client";

import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, fetchUserRole } from "@/lib/firebaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: any) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      const role = await fetchUserRole(uid);
      if (!role) throw new Error("User has no role assigned");

      const idToken = await userCred.user.getIdToken(true);

      const res = await fetch("/api/session-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Cookie creation failed");

      const BASE = "https://dashboard.lacreativo.com";

      const routes: Record<string, string> = {
        admin: "/admin",
        sales: "/sales",
        am: "/am",
        hr: "/hr",
        production: "/production",
        client: "/client",
        finance: "/finance",
      };

      const target = routes[role];
      if (!target) throw new Error("Invalid role assigned");

      window.location.href = BASE + target;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: "#F1F5F9",
      padding: 20,
      fontFamily: "Inter, sans-serif",
    }}>
      <div style={{
        width: 360,
        background: "#fff",
        padding: 32,
        borderRadius: 16,
        border: "1px solid #E2E8F0",
      }}>
        <h1 style={{
          fontSize: 24,
          fontWeight: 800,
          marginBottom: 20,
          textAlign: "center"
        }}>
          LA CREATIVO ERP LOGIN
        </h1>

        {error && (
          <div style={{
            padding: 12,
            marginBottom: 16,
            background: "#FEE2E2",
            color: "#B91C1C",
            borderRadius: 8,
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <input type="email" placeholder="Email address"
            value={email} onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: "100%",
              padding: 12,
              marginBottom: 14,
              border: "1px solid #CBD5E1",
              borderRadius: 8
            }}
          />

          <input type="password" placeholder="Password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: "100%",
              padding: 12,
              marginBottom: 14,
              border: "1px solid #CBD5E1",
              borderRadius: 8
            }}
          />

          <button type="submit" disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              background: "#06B6D4",
              color: "#fff",
              borderRadius: 8,
              border: "none",
              fontWeight: 700,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
