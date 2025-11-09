"use client";

import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, fetchUserRole } from "@/lib/firebaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(e: any) {
    e.preventDefault();
    setError("");

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      const role = await fetchUserRole(uid);

      if (!role) {
        setError("No role assigned. Contact Admin.");
        return;
      }

      // Redirect by role
      switch (role) {
        case "admin":
          router.replace("/admin");
          break;
        case "sales":
          router.replace("/sales");
          break;
        case "am":
          router.replace("/am");
          break;
        case "client":
          router.replace("/client");
          break;
        case "production":
          router.replace("/production");
          break;
        case "hr":
          router.replace("/hr");
          break;
        default:
          setError("Invalid role assigned. Contact admin.");
      }
    } catch (err: any) {
      setError(err.message);
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
            style={{
              width: "100%",
              padding: "12px",
              background: "#06B6D4",
              borderRadius: 8,
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              border: "none",
            }}
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
              }
