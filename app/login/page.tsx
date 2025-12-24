"use client";

import React, { useEffect, useState } from "react";
import { type Auth, signInWithEmailAndPassword } from "firebase/auth";
import { fetchUserRole, getFirebaseAuth } from "@/lib/firebaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [firebaseAuth, setFirebaseAuth] = useState<Auth | null>(null);
  const [initError, setInitError] = useState("");

  useEffect(() => {
    let active = true;

    getFirebaseAuth()
      .then((authInstance) => {
        if (active) {
          setFirebaseAuth(authInstance);
        }
      })
      .catch((err) => {
        console.error("Failed to initialize Firebase auth", err);
        if (active) {
          setInitError(err?.message || "Unable to load authentication.");
          setError(err?.message || "Unable to load authentication.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // HANDLE LOGIN (same logic as before, no changes)
  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!firebaseAuth) {
      setError("Authentication is still loading. Please try again.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(firebaseAuth, email, password);
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
    if (!firebaseAuth) {
      setError("Authentication is still loading. Please try again.");
      return;
    }

    if (!email) {
      setError("Enter your email first.");
      return;
    }

    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to send reset email.");
      }

      alert("If an account exists for this email, a reset link has been sent.");
    } catch (err: any) {
      setError(err?.message || "Failed to send reset email.");
    }
  }

  // UI (unchanged)
  return (
    <div className="login-root">
      {!firebaseAuth ? (
        <div className="login-card login-card--loading">
          <p className="login-helper">{initError || "Preparing authentication…"}</p>
        </div>
      ) : (
        <div className="login-card">
          <div className="login-heading">
            <p className="login-kicker">LA CREATIVO DASHBOARD</p>
            <h1 className="login-title">Secure access to your workspace</h1>
          </div>

          <div
            className={`login-error ${error ? "is-visible" : ""}`}
            role="status"
            aria-live="polite"
          >
            {error || " "}
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <label className="login-field">
              <span className="login-label">Email</span>
              <div className="login-input-wrap">
                <input
                  type="email"
                  placeholder="name@lacreativo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="login-input"
                  required
                />
              </div>
            </label>

            <label className="login-field">
              <span className="login-label">Password</span>
              <div className="login-input-wrap">
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input login-input--with-toggle"
                  required
                />
                <button
                  type="button"
                  className="login-toggle"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <div className="login-row">
              <label className="login-check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={() => setRemember(!remember)}
                />
                <span>Remember me</span>
              </label>
            </div>

            <button type="submit" disabled={loading} className="login-submit">
              {loading ? "Signing in…" : "Login"}
            </button>
          </form>

          <button onClick={handleForgot} className="login-forgot" type="button">
            Forgot Password?
          </button>
        </div>
      )}
      <style jsx global>{`
        .login-root {
          --bg-start: #f4f6fb;
          --bg-end: #dde6f6;
          --card-bg: rgba(255, 255, 255, 0.7);
          --card-border: rgba(148, 163, 184, 0.35);
          --text-primary: #0f172a;
          --text-muted: #475569;
          --input-bg: rgba(255, 255, 255, 0.65);
          --input-border: rgba(148, 163, 184, 0.45);
          --input-text: #0f172a;
          --accent: #2b6cb0;
          --accent-strong: #1e4e8c;
          --accent-glow: rgba(59, 130, 246, 0.35);
          --error-bg: rgba(248, 113, 113, 0.12);
          --error-text: #b91c1c;
          --shadow: 0 30px 80px rgba(15, 23, 42, 0.15);
          --glow: rgba(59, 130, 246, 0.15);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          position: relative;
          overflow: hidden;
          background: radial-gradient(1200px circle at 10% 10%, #ffffff 0%, #eef2ff 40%, transparent 70%),
            linear-gradient(135deg, var(--bg-start), var(--bg-end));
          animation: login-bg-shift 16s ease-in-out infinite alternate;
        }

        @media (prefers-color-scheme: dark) {
          .login-root {
            --bg-start: #0f172a;
            --bg-end: #020617;
            --card-bg: rgba(15, 23, 42, 0.72);
            --card-border: rgba(148, 163, 184, 0.2);
            --text-primary: #e2e8f0;
            --text-muted: #94a3b8;
            --input-bg: rgba(15, 23, 42, 0.6);
            --input-border: rgba(148, 163, 184, 0.28);
            --input-text: #e2e8f0;
            --accent: #60a5fa;
            --accent-strong: #3b82f6;
            --accent-glow: rgba(96, 165, 250, 0.32);
            --error-bg: rgba(248, 113, 113, 0.2);
            --error-text: #fecaca;
            --shadow: 0 30px 90px rgba(0, 0, 0, 0.45);
            --glow: rgba(96, 165, 250, 0.18);
          }
        }

        .login-root::before,
        .login-root::after {
          content: "";
          position: absolute;
          width: 520px;
          height: 520px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--glow) 0%, transparent 60%);
          filter: blur(10px);
          opacity: 0.7;
          animation: login-orbit 18s ease-in-out infinite;
          pointer-events: none;
        }

        .login-root::before {
          top: -120px;
          right: -140px;
        }

        .login-root::after {
          bottom: -180px;
          left: -160px;
          animation-delay: -6s;
        }

        .login-card {
          width: min(420px, 100%);
          padding: 36px 32px;
          border-radius: 24px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--shadow);
          backdrop-filter: blur(18px);
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: login-card-enter 0.8s ease-out;
        }

        .login-card--loading {
          align-items: center;
          text-align: center;
        }

        .login-heading {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .login-kicker {
          font-size: 0.72rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin: 0;
        }

        .login-title {
          font-size: 1.6rem;
          margin: 0;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .login-helper {
          color: var(--text-muted);
          margin: 0;
          font-size: 0.95rem;
        }

        .login-error {
          min-height: 22px;
          padding: 10px 12px;
          border-radius: 12px;
          background: transparent;
          color: transparent;
          font-size: 0.85rem;
          border: 1px solid transparent;
          transition: all 0.25s ease;
        }

        .login-error.is-visible {
          background: var(--error-bg);
          border-color: rgba(248, 113, 113, 0.4);
          color: var(--error-text);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .login-field {
          display: flex;
          flex-direction: column;
          gap: 8px;
          color: var(--text-muted);
          font-size: 0.85rem;
        }

        .login-label {
          color: var(--text-muted);
          font-weight: 500;
          font-size: 0.82rem;
        }

        .login-input-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--input-bg);
          border-radius: 14px;
          border: 1px solid var(--input-border);
          padding: 0 12px;
        }

        .login-input {
          width: 100%;
          background: transparent;
          border: none;
          padding: 12px 0;
          font-size: 0.95rem;
          color: var(--input-text);
          outline: none;
        }

        .login-input::placeholder {
          color: var(--text-muted);
        }

        .login-input--with-toggle {
          padding-right: 0;
        }

        .login-input-wrap:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }

        .login-toggle {
          border: none;
          background: rgba(15, 23, 42, 0.05);
          color: var(--accent);
          font-weight: 600;
          font-size: 0.8rem;
          padding: 6px 10px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .login-toggle:hover {
          background: rgba(59, 130, 246, 0.15);
        }

        .login-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .login-check {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        .login-check input {
          accent-color: var(--accent);
          width: 16px;
          height: 16px;
        }

        .login-submit {
          border: none;
          padding: 12px 16px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--accent), var(--accent-strong));
          color: #fff;
          font-weight: 600;
          font-size: 0.98rem;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
          box-shadow: 0 16px 30px rgba(37, 99, 235, 0.25);
        }

        .login-submit:hover {
          transform: translateY(-1px);
          box-shadow: 0 18px 32px rgba(37, 99, 235, 0.32);
        }

        .login-submit:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .login-forgot {
          background: transparent;
          border: none;
          color: var(--accent);
          font-weight: 600;
          cursor: pointer;
          align-self: flex-start;
          padding: 0;
          font-size: 0.9rem;
        }

        .login-forgot:hover {
          text-decoration: underline;
        }

        @keyframes login-bg-shift {
          0% {
            background-position: 0% 50%;
          }
          100% {
            background-position: 100% 50%;
          }
        }

        @keyframes login-orbit {
          0%,
          100% {
            transform: translate3d(0, 0, 0) scale(1);
            opacity: 0.6;
          }
          50% {
            transform: translate3d(20px, -20px, 0) scale(1.05);
            opacity: 0.85;
          }
        }

        @keyframes login-card-enter {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
