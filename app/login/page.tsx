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
              <input
                type="email"
                placeholder="name@lacreativo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-input"
                required
              />
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
    </div>
  );
}
