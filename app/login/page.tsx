"use client";

import React, { useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, fetchUserRole } from "@/lib/firebaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // HANDLE LOGIN (same logic as before, no changes)
  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      const role = await fetchUserRole(uid);
      if (!role) throw new Error("No role assigned");

      const idToken = await userCred.user.getIdToken(true);

      // Send to server to make secure cookie
      const cookieRes = await fetch("/api/session-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!cookieRes.ok) {
        const j = await cookieRes.json().catch(() => null);
        throw new Error(j?.error || "Session error");
      }

      // Redirect to role dashboard (admin, sales, hr, etc.)
      window.location.href = `/${role}`;
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  // FORGOT PASSWORD (unchanged)
  async function handleForgot() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset link has been sent to your email.");
    } catch (err: any) {
      setError(err.message || "Failed to send reset email.");
    }
  }

  // UI (unchanged)
  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f9fafb",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <div
        style={{
          width: 380,
          background: "white",
          borderRadius: 16,
          padding: "32px 28px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}
      >
        <h1
          style={{
            textAlign: "center",
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 20,
            color: "#111827",
          }}
        >
          LA CREATIVO ERP Login
        </h1>

        {error && (
          <div
            style={{
              background: "#fee2e2",
              color: "#b91c1c",
              padding: 10,
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              marginBottom: 14,
            }}
            required
          />

          <div style={{ position: "relative", marginBottom: 14 }}>
            <input
              type={showPass ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
              }}
              required
            />

            <span
              onClick={() => setShowPass(!showPass)}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                cursor: "pointer",
                fontSize: 12,
                color: "#6b7280",
              }}
            >
              {showPass ? "Hide" : "Show"}
            </span>
          </div>

          <label
            style={{ display: "flex", alignItems: "center", marginBottom: 10 }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={() => setRemember(!remember)}
              style={{ marginRight: 8 }}
            />
            <span style={{ fontSize: 14, color: "#4b5563" }}>Remember me</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 8,
              backgroundColor: "#06b6d4",
              color: "white",
              border: "none",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Signing in…" : "Login"}
          </button>
        </form>

        <button
          onClick={handleForgot}
          style={{
            marginTop: 14,
            width: "100%",
            background: "none",
            border: "none",
            color: "#0284c7",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Forgot Password?
        </button>
      </div>
    </div>
  );
}
