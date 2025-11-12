"use client";

import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, fetchUserRole } from "@/lib/firebaseClient";

export default function LoginPage() {
  // ✅ state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ BLOCK LOGIN PAGE ON DASHBOARD HOST
  if (typeof window !== "undefined") {
    const host = window.location.hostname;

    if (host.startsWith("dashboard.")) {
      window.location.replace("https://login.lacreativo.com/login");
      return null;
    }
  }

  async function handleLogin(e: any) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Firebase login
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      // Get role
      const role = await fetchUserRole(uid);
      if (!role) throw new Error("No user profile found in Firestore");

      // Get token
      const idToken = await userCred.user.getIdToken(true);

      // Exchange for secure cookie
      const res = await fetch("/api/session-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error("Session creation failed");

      // final redirect
      window.location.href = `https://dashboard.lacreativo.com/${role}`;
    } catch (err: any) {
      setError(err.message || "Login failed");
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
