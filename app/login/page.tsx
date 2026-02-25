"use client";
import BizostoSplash from "@/components/ui/BizostoSplash";

import React, { useEffect, useState } from "react";
import {
  type Auth,
  getMultiFactorResolver,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  type MultiFactorResolver,
} from "firebase/auth";
import { fetchUserRole, getFirebaseAuth } from "@/lib/firebaseClient";
import { getRoleRoute } from "@/lib/roleRouting";
import MFAVerify from "@/components/auth/MFAVerify";
import { verifyMFASignIn } from "@/lib/auth/mfa";
import { Button } from "@/components/ui/button";
import { showToast } from "@/lib/utils/toast";
import SSOLoginButtons from "@/components/auth/SSOLoginButtons";

function getFriendlyAuthError(code?: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/invalid-password":
      return "Incorrect password. Please try again.";
    case "auth/user-not-found":
    case "auth/invalid-email":
      return "No account found with this email address.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Please wait a few minutes and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact your administrator.";
    case "auth/network-request-failed":
      return "Network error. Please check your connection and try again.";
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/weak-password":
      return "Password is too weak. Please choose a stronger password.";
    default:
      return "Sign-in failed. Please check your credentials and try again.";
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [splashDest, setSplashDest] = useState("");
  const [firebaseAuth, setFirebaseAuth] = useState<Auth | null>(null);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [ssoProviders, setSsoProviders] = useState<Array<{ provider: "google" | "microsoft" | "okta" | "auth0" }>>([]);
  const tenantId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "default";

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
          setError(err?.message || "Unable to load authentication.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetch(`/api/auth/sso/providers?tenantId=${encodeURIComponent(tenantId)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data?.ok) return;
        setSsoProviders(data.providers || []);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!firebaseAuth) return;
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get("ssoToken");
    const returnTo = params.get("returnTo") || "/";
    if (!ssoToken) return;

    const completeSso = async () => {
      try {
        const userCred = await signInWithCustomToken(firebaseAuth, ssoToken);
        const idToken = await userCred.user.getIdToken(true);
        const cookieRes = await fetch("/api/session-login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, rememberMe: true }),
        });

        if (!cookieRes.ok) {
          const payload = await cookieRes.json().catch(() => null);
          throw new Error(payload?.error || "Failed to create SSO session.");
        }

        window.location.href = returnTo;
      } catch (err: any) {
        setError(getFriendlyAuthError(err?.code));
      }
    };

    void completeSso();
  }, [firebaseAuth]);

  // HANDLE LOGIN (adds MFA challenge handling)
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
      await completeLogin(userCred);
      showToast.success("Login successful!");
    } catch (err: any) {
      if (firebaseAuth && err?.code === "auth/multi-factor-auth-required") {
        // Firebase returns a MultiFactorResolver when TOTP is required.
        const resolver = getMultiFactorResolver(firebaseAuth, err);
        setMfaResolver(resolver);
        setError("Two-factor authentication required.");
      } else {
        const friendlyError = getFriendlyAuthError(err?.code);
        setError(friendlyError);
        showToast.error(friendlyError);
      }
    } finally {
      setLoading(false);
    }
  }

  async function completeLogin(userCred: { user: { uid: string; getIdToken: (forceRefresh: boolean) => Promise<string> } }) {
    const sessionToast = showToast.loading("Creating session...");
    try {
      const idToken = await userCred.user.getIdToken(true);

      // Create session cookie
      const cookieRes = await fetch('/api/session-login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, rememberMe: remember }),
      });

      if (!cookieRes.ok) {
        const errorData = await cookieRes.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Session creation failed:', errorData);
        throw new Error(errorData.error || 'Failed to create session. Please try again.');
      }

      // Get user role and redirect with splash animation
      const role = await fetchUserRole(userCred.user.uid);
      const dest = getRoleRoute(role);
      setSplashDest(dest);
      setShowSplash(true);
    } finally {
      showToast.dismiss(sessionToast);
    }
  }

  async function handleVerifyMfa(code: string) {
    if (!firebaseAuth || !mfaResolver) {
      throw new Error("MFA session expired. Please sign in again.");
    }
    setLoading(true);
    setError("");
    try {
      const credential = await verifyMFASignIn(mfaResolver, code);
      await completeLogin(credential);
    } catch (err: any) {
      setError("Invalid verification code. Please try again.");
      throw err;
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
      setError("Unable to send reset email. Please verify your email address.");
    }
  }

  // UI (unchanged)
  return (
    <>
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
          <div style={{
            width: 56, height: 56, borderRadius: 8,
            background: "linear-gradient(to bottom, #012167 0%, #6692f9 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
            fontWeight: 700, fontSize: 36, color: "#ffffff",
            marginBottom: 16, letterSpacing: "-0.01em",
          }}>B</div>
          <div className="login-brand-pill">BIZOSTO</div>
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

        <div className="login-card" aria-live="polite" aria-busy={!firebaseAuth}>
          <div className="login-heading">
            <p className="login-kicker">BIZOSTO DASHBOARD</p>
            <h2 className="login-title">Sign in to continue</h2>
            <p className="login-subtitle">Use your company credentials to access the enterprise suite.</p>
          </div>

          {error ? (
            <div className="login-error is-visible" role="status" aria-live="polite">
              {error}
            </div>
          ) : null}

          {mfaResolver ? (
            <MFAVerify
              onVerify={handleVerifyMfa}
              onCancel={() => {
                setMfaResolver(null);
                setError("");
              }}
            />
          ) : (
            <form onSubmit={handleLogin} className="login-form">
              <label className="login-field">
                <span className="login-label">Email</span>
                <div className="login-input-wrap">
                  <input
                    type="email"
                    placeholder="name@bizosto.com"
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

              <Button
                type="submit"
                disabled={!firebaseAuth}
                loading={loading}
                loadingText="Signing in..."
                className="login-submit"
                fullWidth
              >
                Login
              </Button>

              <div className="text-center text-xs opacity-70">or</div>
              <SSOLoginButtons tenantId={tenantId} providers={ssoProviders} />
            </form>
          )}

          {!mfaResolver ? (
            <button onClick={handleForgot} className="login-forgot" type="button">
              Forgot Password?
            </button>
          ) : null}
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

        .login-error {
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
    {showSplash && (
      <BizostoSplash
        duration={2000}
        onDone={() => { window.location.href = splashDest; }}
      />
    )}
    </>
  );
}
