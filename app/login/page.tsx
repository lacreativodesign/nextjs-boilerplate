"use client";
import React, { useState } from "react";
import {
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  fetchUserRole,
  auth,
} from "@/lib/firebaseClient";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      const role = await fetchUserRole(u.uid);
      if (!role) return;
      // Redirect to their dashboard
      const map: Record<string, string> = {
        admin: "/admin",
        sales: "/sales",
        am: "/am",
        client: "/client",
        production: "/production",
        hr: "/hr",
        finance: "/finance",
      };
      router.replace(map[role] || "/client");
    });
    return () => unsub();
  }, [router]);

  async function handleGoogle() {
    setErr(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      // onAuthStateChanged above will redirect
    } catch (e: any) {
      setErr(e?.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (tab === "signin") {
        await signInWithEmail(email, pw);
      } else {
        await signUpWithEmail(email, pw, name || undefined);
      }
      // onAuthStateChanged above will redirect
    } catch (e: any) {
      setErr(e?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div
        style={{
          width: 420,
          padding: 24,
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,.08)",
          background: "white",
        }}
      >
        <h2 style={{ marginTop: 0 }}>LA CREATIVO — Sign in</h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setTab("signin")}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,.1)",
              background: tab === "signin" ? "#f4f6ff" : "#fff",
              cursor: "pointer",
            }}
          >
            Sign in
          </button>
          <button
            onClick={() => setTab("signup")}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,.1)",
              background: tab === "signup" ? "#f4f6ff" : "#fff",
              cursor: "pointer",
            }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleEmailSubmit} style={{ display: "grid", gap: 10 }}>
          {tab === "signup" && (
            <input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb" }}
            />
          )}
          <input
            placeholder="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <input
            placeholder="Password"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            style={{ padding: 12, borderRadius: 10, border: "1px solid #e5e7eb" }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: 12,
              borderRadius: 10,
              border: 0,
              background: "#06B6D4",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {tab === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div style={{ margin: "12px 0", textAlign: "center", color: "#64748b" }}>
          or
        </div>

        <button
          onClick={handleGoogle}
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Continue with Google
        </button>

        {err && (
          <div style={{ color: "#ef4444", marginTop: 12, fontSize: 13 }}>{err}</div>
        )}
      </div>
    </div>
  );
}
