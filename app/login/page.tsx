"use client";
import React, { useState } from "react";
import { auth, loginUser } from "@/lib/firebaseClient";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  const attemptLogin = async () => {
    setErr("");
    setLoading(true);
    try {
      const userCred = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const uid = userCred.user.uid;

      const res = await loginUser(uid);

      switch (res) {
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
          setErr("Your account role is invalid.");
      }
    } catch (e: any) {
      setErr(e.message);
    }
    setLoading(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f172a",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "rgba(255,255,255,0.08)",
          padding: 30,
          borderRadius: 16,
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <h2
          style={{
            textAlign: "center",
            marginBottom: 20,
            color: "white",
            fontSize: 28,
            fontWeight: 800,
          }}
        >
          LA CREATIVO LOGIN
        </h2>

        <input
          placeholder="Email"
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 10,
            marginBottom: 12,
            border: "1px solid #334155",
            background: "#1e293b",
            color: "white",
          }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 10,
            marginBottom: 12,
            border: "1px solid #334155",
            background: "#1e293b",
            color: "white",
          }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {err && (
          <div style={{ color: "#f87171", marginBottom: 12 }}>{err}</div>
        )}

        <button
          onClick={attemptLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 10,
            border: "none",
            background: "#06B6D4",
            fontWeight: 700,
            color: "white",
            cursor: "pointer",
            marginTop: 10,
          }}
        >
          {loading ? "Please wait..." : "Login"}
        </button>
      </div>
    </div>
  );
}
