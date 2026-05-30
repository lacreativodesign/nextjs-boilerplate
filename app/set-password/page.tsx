"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            backgroundColor: "#f9fafb",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
            fontFamily: "Inter, sans-serif",
            color: "#6b7280",
            fontSize: 14,
          }}
        >
          Loading...
        </div>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      window.location.href = "/login";
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [success]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Missing or invalid token.");
      return;
    }

    if (!password || !confirm) {
      setError("Please enter and confirm your new password.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/consume-set-password-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Unable to set password.");
      }

      setSuccess(true);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError((err instanceof Error ? err.message : undefined) || "Unable to set password.");
    } finally {
      setLoading(false);
    }
  }

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
          width: 420,
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
            marginBottom: 12,
            color: "#111827",
          }}
        >
          Set Your Password
        </h1>
        <p style={{ textAlign: "center", fontSize: 14, color: "#6b7280", marginBottom: 20 }}>
          Use the link from your email to create your dashboard password.
        </p>

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

        {success ? (
          <div
            style={{
              background: "#dcfce7",
              color: "#166534",
              padding: 12,
              borderRadius: 8,
              fontSize: 14,
            }}
          >
            Password updated successfully. You can now log in.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                marginBottom: 14,
              }}
              required
            />

            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                marginBottom: 18,
              }}
              required
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 8,
                border: "none",
                background: "#2563eb",
                color: "white",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Saving..." : "Set Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
