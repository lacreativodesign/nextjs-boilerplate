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
import Link from "next/link";

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
      <div className="login-page" aria-live="polite" aria-busy={!firebaseAuth}>
        <aside className="login-brand" aria-hidden="true">
          <div className="login-brand-inner">
            <div className="login-logo-wrap">
              <span className="login-logo-mark">BIZOSTO</span>
            </div>
            <p className="login-tagline">The complete business operating system</p>

            <div className="login-feature-list">
              <p><span>✓</span>Multi-tenant workspace management</p>
              <p><span>✓</span>15 integrated business modules</p>
              <p><span>✓</span>Enterprise-grade security & compliance</p>
            </div>

            <p className="login-brand-footer">A product of LA CREATIVO GROUP</p>
          </div>
        </aside>

        <section className="login-form-panel">
          <div className="login-mobile-header" aria-hidden="true">
            <span className="login-logo-mark">BIZOSTO</span>
          </div>

          <div className="login-form-shell">
            <div className="login-card">
              <div className="login-heading">
                <h1 className="login-title">Welcome back</h1>
                <p className="login-subtitle">Sign in to your workspace</p>
              </div>

              {error ? (
                <div className="login-error" role="status" aria-live="polite">
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
                    <span className="login-label">Email address</span>
                    <input
                      type="email"
                      placeholder="name@company.com"
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
                        className="login-input"
                        required
                      />
                      <button
                        type="button"
                        className="login-toggle"
                        onClick={() => setShowPass(!showPass)}
                        aria-label={showPass ? "Hide password" : "Show password"}
                      >
                        {showPass ? "🙈" : "👁️"}
                      </button>
                    </div>
                  </label>

                  <div className="login-row">
                    <label className="login-check">
                      <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} />
                      <span>Remember me</span>
                    </label>

                    <button onClick={handleForgot} className="login-forgot" type="button">
                      Forgot password?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    disabled={!firebaseAuth}
                    loading={loading}
                    loadingText="Signing in..."
                    className="login-submit"
                    fullWidth
                  >
                    Sign In
                  </Button>

                  {ssoProviders.length > 0 ? (
                    <>
                      <div className="login-divider"><span>or</span></div>
                      <SSOLoginButtons tenantId={tenantId} providers={ssoProviders} />
                    </>
                  ) : null}

                  <div className="login-signup-row">
                    <span>Don&apos;t have an account?</span>
                    <Link href="/signup">Start your free 14-day trial →</Link>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        <style jsx global>{`
          .login-page {
            min-height: 100vh;
            display: flex;
            background: var(--surface-card);
          }

          .login-brand {
            width: 40%;
            min-height: 100vh;
            background: linear-gradient(180deg, #012167 0%, #6692f9 100%);
            color: #ffffff;
            display: flex;
          }

          .login-brand-inner {
            width: 100%;
            display: flex;
            flex-direction: column;
            padding: 56px 44px 36px;
          }

          .login-logo-wrap {
            margin-bottom: 12px;
          }

          .login-logo-mark {
            display: inline-block;
            font-weight: 800;
            letter-spacing: 0.08em;
            font-size: clamp(1.1rem, 1rem + 0.6vw, 1.65rem);
            color: #ffffff;
          }

          .login-tagline {
            margin: 0;
            font-size: 0.95rem;
            color: rgba(255, 255, 255, 0.86);
            max-width: 320px;
          }

          .login-feature-list {
            margin-top: auto;
            display: grid;
            gap: 14px;
            padding-bottom: 28px;
          }

          .login-feature-list p {
            margin: 0;
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.94rem;
            color: rgba(255, 255, 255, 0.95);
          }

          .login-feature-list span {
            width: 18px;
            height: 18px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.2);
            font-size: 0.75rem;
          }

          .login-brand-footer {
            margin: 0;
            font-size: 0.72rem;
            letter-spacing: 0.06em;
            color: rgba(255, 255, 255, 0.65);
          }

          .login-form-panel {
            width: 60%;
            min-height: 100vh;
            background: var(--surface-card);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 32px 20px;
          }

          .login-mobile-header {
            display: none;
          }

          .login-form-shell {
            width: min(400px, 100%);
          }

          .login-card {
            width: 100%;
            background: var(--surface-card);
          }

          .login-heading {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 24px;
          }

          .login-title {
            margin: 0;
            font-size: 2rem;
            line-height: 1.15;
            color: var(--text-primary);
            font-weight: 700;
          }

          .login-subtitle {
            margin: 0;
            color: var(--text-muted);
            font-size: 0.92rem;
          }

          .login-error {
            margin-bottom: 14px;
            border-radius: 10px;
            border: 1px solid rgba(220, 38, 38, 0.25);
            background: rgba(254, 226, 226, 0.8);
            color: #b91c1c;
            font-size: 0.85rem;
            padding: 10px 12px;
          }

          .login-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .login-field {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .login-label {
            font-size: 0.85rem;
            color: var(--text-primary);
            font-weight: 600;
          }

          .login-input-wrap {
            display: flex;
            align-items: center;
            height: 44px;
            border: 1px solid var(--border-subtle);
            border-radius: 8px;
            background: #fff;
            transition: all 0.2s ease;
          }

          .login-input {
            width: 100%;
            height: 44px;
            border: 1px solid var(--border-subtle);
            border-radius: 8px;
            background: #fff;
            color: var(--text-primary);
            font-size: 14px;
            outline: none;
            padding: 0 12px;
            transition: all 0.2s ease;
          }

          .login-input-wrap .login-input {
            border: none;
            border-radius: 0;
            height: 100%;
            background: transparent;
            padding-right: 0;
          }

          .login-input:focus,
          .login-input-wrap:focus-within {
            border-color: #012167;
            box-shadow: 0 0 0 3px rgba(1, 33, 103, 0.1);
          }

          .login-toggle {
            width: 40px;
            height: 40px;
            border: none;
            background: transparent;
            cursor: pointer;
            font-size: 1rem;
            line-height: 1;
          }

          .login-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
          }

          .login-check {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 0.85rem;
            color: var(--text-muted);
          }

          .login-check input {
            width: 16px;
            height: 16px;
            accent-color: #012167;
          }

          .login-forgot {
            border: none;
            background: transparent;
            color: #012167;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            padding: 0;
          }

          .login-submit {
            height: 44px;
            border-radius: 8px;
            border: none;
            background: linear-gradient(135deg, #012167, #6692f9);
            color: #ffffff;
            font-weight: 600;
            transition: all 0.2s ease;
          }

          .login-submit:hover {
            opacity: 0.92;
          }

          .login-submit:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .login-divider {
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--text-muted);
            font-size: 0.8rem;
          }

          .login-divider::before,
          .login-divider::after {
            content: "";
            flex: 1;
            height: 1px;
            background: var(--border-subtle);
          }

          .login-signup-row {
            text-align: center;
            color: var(--text-muted);
            font-size: 0.88rem;
            padding-top: 4px;
          }

          .login-signup-row a {
            color: #012167;
            font-weight: 600;
            margin-left: 4px;
          }

          @media (max-width: 767px) {
            .login-page {
              flex-direction: column;
              background: #ffffff;
            }

            .login-brand {
              display: none;
            }

            .login-form-panel {
              width: 100%;
              display: block;
              padding: 0;
            }

            .login-mobile-header {
              height: 120px;
              background: linear-gradient(180deg, #012167 0%, #6692f9 100%);
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .login-form-shell {
              width: 100%;
              max-width: 430px;
              margin: -14px auto 0;
              padding: 0 16px 26px;
            }

            .login-card {
              border: 1px solid var(--border-subtle);
              border-radius: 14px;
              padding: 22px 18px;
              box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
              background: var(--surface-card);
            }

            .login-title {
              font-size: 1.7rem;
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
