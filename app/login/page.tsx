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
    <div
      className="login-root"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
      }}
    >
      <div className="login-background" aria-hidden="true">
        <span className="login-glow login-glow--one" />
        <span className="login-glow login-glow--two" />
        <span className="login-glow login-glow--three" />
        <span className="login-grid" />
      </div>
      <div
        className="login-shell"
        style={{
          width: "min(1040px, 100%)",
        }}
      >
        <div className="login-brand-panel">
          <div className="login-brand-pill">LA CREATIVO</div>
          <h1 className="login-brand-title">Master UI access for your enterprise workspace.</h1>
          <p className="login-brand-subtitle">
            Securely manage operations, clients, and analytics with premium-grade controls built for speed.
          </p>
          <div className="login-brand-metrics">
            <div>
              <p className="metric-label">Security</p>
              <p className="metric-value">SOC2 Ready</p>
            </div>
            <div>
              <p className="metric-label">Latency</p>
              <p className="metric-value">&lt; 80ms</p>
            </div>
            <div>
              <p className="metric-label">Coverage</p>
              <p className="metric-value">Global</p>
            </div>
          </div>
        </div>

        <div
          className={`login-card ${!firebaseAuth ? "login-card--loading" : ""}`}
          aria-live="polite"
          aria-busy={!firebaseAuth}
        >
          {!firebaseAuth ? (
            <>
              <div className="loading-shimmer" />
              <div className="loading-lines">
                <span />
                <span />
                <span />
              </div>
              <p className="login-helper">{initError || "Preparing authentication…"}</p>
            </>
          ) : (
            <>
              <div className="login-heading">
                <p className="login-kicker">LA CREATIVO DASHBOARD</p>
                <h2 className="login-title">Sign in to continue</h2>
                <p className="login-subtitle">Use your company credentials to access the enterprise suite.</p>
              </div>

              <div className={`login-error ${error ? "is-visible" : ""}`} role="status" aria-live="polite">
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
                    <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} />
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
            </>
          )}
        </div>
      </div>
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
          --glass-shadow: 0 28px 70px rgba(15, 23, 42, 0.2);
          --surface-border: rgba(148, 163, 184, 0.2);
          --pill-bg: rgba(255, 255, 255, 0.55);
          --grid-line: rgba(148, 163, 184, 0.12);
          --toggle-bg: rgba(15, 23, 42, 0.05);
          --toggle-bg-hover: rgba(59, 130, 246, 0.15);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          position: relative;
          overflow: hidden;
          background: radial-gradient(1400px circle at 10% 15%, #ffffff 0%, #eef2ff 38%, transparent 70%),
            linear-gradient(135deg, var(--bg-start), var(--bg-end));
          animation: login-bg-shift 18s ease-in-out infinite alternate;
        }

        @media (prefers-color-scheme: dark) {
          .login-root {
            --bg-start: #1b1d20;
            --bg-end: #101215;
            --card-bg: rgba(26, 28, 32, 0.82);
            --card-border: rgba(148, 163, 184, 0.14);
            --text-primary: #e6e7ea;
            --text-muted: #a6adb7;
            --input-bg: rgba(24, 26, 30, 0.78);
            --input-border: rgba(148, 163, 184, 0.18);
            --input-text: #f1f3f5;
            --accent: #9aa8b8;
            --accent-strong: #7d8a99;
            --accent-glow: rgba(148, 163, 184, 0.18);
            --error-bg: rgba(248, 113, 113, 0.2);
            --error-text: #fecaca;
            --shadow: 0 30px 90px rgba(0, 0, 0, 0.55);
            --glow: rgba(148, 163, 184, 0.1);
            --glass-shadow: 0 28px 70px rgba(0, 0, 0, 0.6);
            --surface-border: rgba(148, 163, 184, 0.14);
            --pill-bg: rgba(26, 28, 32, 0.68);
            --grid-line: rgba(148, 163, 184, 0.06);
            --toggle-bg: rgba(255, 255, 255, 0.06);
            --toggle-bg-hover: rgba(148, 163, 184, 0.2);
            background: radial-gradient(1200px circle at 18% 22%, rgba(255, 255, 255, 0.035) 0%, transparent 55%),
              linear-gradient(135deg, var(--bg-start), var(--bg-end));
          }
        }

        .login-background {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          transform: translateZ(0);
        }

        .login-glow {
          position: absolute;
          width: 480px;
          height: 480px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--glow) 0%, transparent 65%);
          filter: blur(12px);
          opacity: 0.75;
          animation: login-orbit 22s ease-in-out infinite;
          will-change: transform, opacity;
        }

        .login-glow--one {
          top: -160px;
          right: -120px;
        }

        .login-glow--two {
          bottom: -200px;
          left: -140px;
          animation-delay: -6s;
        }

        .login-glow--three {
          top: 20%;
          left: 55%;
          width: 360px;
          height: 360px;
          opacity: 0.5;
          animation-delay: -12s;
        }

        .login-grid {
          position: absolute;
          inset: 0;
          background-image: linear-gradient(var(--grid-line) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
          background-size: 80px 80px;
          opacity: 0.12;
          mask-image: radial-gradient(circle at 50% 40%, #000 0%, transparent 70%);
        }

        .login-shell {
          width: min(1040px, 100%);
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 32px;
          align-items: center;
          position: relative;
          z-index: 1;
        }

        .login-brand-panel {
          display: flex;
          flex-direction: column;
          gap: 16px;
          color: var(--text-primary);
        }

        .login-brand-pill {
          align-self: flex-start;
          padding: 6px 14px;
          border-radius: 999px;
          background: var(--pill-bg);
          border: 1px solid var(--surface-border);
          font-size: 0.7rem;
          letter-spacing: 0.3em;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--text-muted);
          backdrop-filter: blur(12px);
        }

        .login-brand-title {
          font-size: clamp(1.6rem, 1.2rem + 1.2vw, 2.5rem);
          margin: 0;
          line-height: 1.1;
        }

        .login-brand-subtitle {
          margin: 0;
          color: var(--text-muted);
          font-size: 1rem;
          max-width: 400px;
        }

        .login-brand-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 14px;
        }

        .metric-label {
          margin: 0;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--text-muted);
        }

        .metric-value {
          margin: 6px 0 0;
          font-weight: 600;
          color: var(--text-primary);
        }

        .login-card {
          width: min(420px, 100%);
          padding: 36px 32px;
          border-radius: 24px;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          box-shadow: var(--glass-shadow);
          backdrop-filter: blur(18px);
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: login-card-enter 0.7s ease-out;
          will-change: transform, opacity;
        }

        .login-card--loading {
          align-items: center;
          text-align: center;
          min-height: 360px;
          justify-content: center;
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
          font-size: 1.5rem;
          margin: 0;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .login-subtitle {
          margin: 0;
          color: var(--text-muted);
          font-size: 0.95rem;
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
          caret-color: var(--input-text);
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
          background: var(--toggle-bg);
          color: var(--accent);
          font-weight: 600;
          font-size: 0.8rem;
          padding: 6px 10px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .login-toggle:hover {
          background: var(--toggle-bg-hover);
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
          transform: translateY(-2px);
          box-shadow: 0 20px 36px rgba(37, 99, 235, 0.35);
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

        .loading-shimmer {
          width: 100%;
          height: 8px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.18);
          position: relative;
          overflow: hidden;
          margin-bottom: 20px;
        }

        .loading-shimmer::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.5), transparent);
          transform: translateX(-100%);
          animation: shimmer 1.6s ease-in-out infinite;
        }

        .loading-lines {
          width: 100%;
          display: grid;
          gap: 12px;
          margin-bottom: 16px;
        }

        .loading-lines span {
          display: block;
          height: 12px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.3);
          overflow: hidden;
          position: relative;
        }

        .loading-lines span::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.5), transparent);
          transform: translateX(-100%);
          animation: shimmer 1.8s ease-in-out infinite;
        }

        .login-input:-webkit-autofill,
        .login-input:-webkit-autofill:hover,
        .login-input:-webkit-autofill:focus {
          -webkit-text-fill-color: var(--input-text);
          caret-color: var(--input-text);
          box-shadow: 0 0 0 1000px var(--input-bg) inset;
          transition: background-color 9999s ease-in-out 0s;
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
            transform: translate3d(0, 12px, 0) scale(0.99);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .login-root {
            animation: none;
          }

          .login-glow,
          .login-card,
          .loading-shimmer::after,
          .loading-lines span::after {
            animation: none;
          }

          .login-submit,
          .login-toggle {
            transition: none;
          }
        }

        @media (max-width: 900px) {
          .login-shell {
            grid-template-columns: 1fr;
            text-align: center;
          }

          .login-brand-panel {
            align-items: center;
          }

          .login-brand-pill {
            align-self: center;
          }

          .login-brand-subtitle {
            max-width: 520px;
          }

          .login-card {
            margin: 0 auto;
          }

          .login-forgot {
            align-self: center;
          }
        }
      `}</style>
    </div>
  );
}
