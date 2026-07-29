'use client';
import BizostoSplash from '@/components/ui/BizostoSplash';

import React, { useEffect, useState } from 'react';
import {
  type Auth,
  getMultiFactorResolver,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  type MultiFactorResolver,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { getRoleRoute } from '@/lib/roleRouting';
import MFAVerify from '@/components/auth/MFAVerify';
import { verifyMFASignIn } from '@/lib/auth/mfa';
import { Button } from '@/components/ui/button';
import { showToast } from '@/lib/utils/toast';
import SSOLoginButtons from '@/components/auth/SSOLoginButtons';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';

function getFriendlyAuthError(code?: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/invalid-password':
      return 'Incorrect password. Please try again.';
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'No account found with this email address.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact your administrator.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password is too weak. Please choose a stronger password.';
    default:
      return 'Sign-in failed. Please check your credentials and try again.';
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('bizosto_saved_email') || '';
  });
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('bizosto_remember') === 'true';
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [splashDest, setSplashDest] = useState('');
  const [firebaseAuth, setFirebaseAuth] = useState<Auth | null>(null);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [ssoProviders, setSsoProviders] = useState<
    Array<{ provider: 'google' | 'microsoft' | 'okta' | 'auth0' }>
  >([]);
  const tenantId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || 'bizosto';

  useEffect(() => {
    let active = true;

    getFirebaseAuth()
      .then((authInstance) => {
        if (active) {
          setFirebaseAuth(authInstance);
        }
      })
      .catch((err) => {
        console.error('Failed to initialize Firebase auth', err);
        if (active) {
          setError(err?.message || 'Unable to load authentication.');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    apiFetch(`/api/auth/sso/providers?tenantId=${encodeURIComponent(tenantId)}`, {
      cache: 'no-store',
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
    const ssoToken = params.get('ssoToken');
    const returnTo = params.get('returnTo') || '/';
    const emailParam = params.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
    if (!ssoToken) return;

    const completeSso = async () => {
      try {
        const userCred = await signInWithCustomToken(firebaseAuth, ssoToken);
        const idToken = await userCred.user.getIdToken(true);
        const cookieRes = await apiFetch('/api/session-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken, rememberMe: true }),
        });

        if (!cookieRes.ok) {
          const payload = await cookieRes.json().catch(() => null);
          throw new Error(payload?.error || 'Failed to create SSO session.');
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
      setError('Authentication is still loading. Please try again.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const userCred = await signInWithEmailAndPassword(firebaseAuth, email, password);
      if (remember) {
        window.localStorage.setItem('bizosto_saved_email', email);
      } else {
        window.localStorage.removeItem('bizosto_saved_email');
      }
      await completeLogin(userCred);
      showToast.success('Login successful!');
    } catch (err: any) {
      if (firebaseAuth && err?.code === 'auth/multi-factor-auth-required') {
        // Firebase returns a MultiFactorResolver when TOTP is required.
        const resolver = getMultiFactorResolver(firebaseAuth, err);
        setMfaResolver(resolver);
        setError('Two-factor authentication required.');
      } else {
        const friendlyError = getFriendlyAuthError(err?.code);
        setError(friendlyError);
        showToast.error(friendlyError);
      }
    } finally {
      setLoading(false);
    }
  }

  async function completeLogin(userCred: {
    user: { uid: string; getIdToken: (forceRefresh: boolean) => Promise<string> };
  }) {
    const sessionToast = showToast.loading('Creating session...');
    try {
      const idToken = await userCred.user.getIdToken(true);

      // Create session cookie
      const cookieRes = await apiFetch('/api/session-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, rememberMe: remember, extendedSession: remember }),
      });

      if (!cookieRes.ok) {
        const errorData = await cookieRes.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Session creation failed:', errorData);
        throw new Error(errorData.error || 'Failed to create session. Please try again.');
      }

      // Get user role via server API (Admin SDK — bypasses Firestore rules, works regardless of claims)
      let dest = '/login';
      try {
        const ctxRes = await apiFetch('/api/tenant/context', {
          cache: 'no-store',
        });
        if (ctxRes.ok) {
          const ctx = await ctxRes.json();
          const role = ctx?.user?.role || null;
          dest = getRoleRoute(role);
        }
      } catch {
        // fallback — keep dest as /login, user will re-authenticate
      }
      setSplashDest(dest);
      setShowSplash(true);
    } finally {
      showToast.dismiss(sessionToast);
    }
  }

  async function handleVerifyMfa(code: string) {
    if (!firebaseAuth || !mfaResolver) {
      throw new Error('MFA session expired. Please sign in again.');
    }
    setLoading(true);
    setError('');
    try {
      const credential = await verifyMFASignIn(mfaResolver, code);
      await completeLogin(credential);
    } catch (err: any) {
      setError('Invalid verification code. Please try again.');
      throw err;
    } finally {
      setLoading(false);
    }
  }

  // FORGOT PASSWORD (unchanged)
  async function handleForgot() {
    if (!firebaseAuth) {
      setError('Authentication is still loading. Please try again.');
      return;
    }

    if (!email) {
      setError('Enter your email first.');
      return;
    }

    try {
      const res = await apiFetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to send reset email.');
      }

      showToast.success('If an account exists for this email, a reset link has been sent.');
    } catch (err: any) {
      setError('Unable to send reset email. Please verify your email address.');
    }
  }

  // UI (unchanged)
  return (
    <>
      <div className="login-page" aria-live="polite" aria-busy={!firebaseAuth}>
        <aside className="login-brand" aria-hidden="true">
          <div className="login-brand-inner login-animate">
            <div className="login-logo-wrap">
              <div className="login-logo-lockup">
                <div className="login-logo-icon">
                  <span className="login-logo-b">B</span>
                </div>
                <div className="login-logo-text-group">
                  <span className="login-logo-mark">BIZOSTO</span>
                  <span className="login-logo-descriptor">Operating System</span>
                </div>
              </div>
            </div>
            <p className="login-tagline">The complete business operating system</p>

            <div className="login-feature-list">
              <p>
                <span>✓</span>Multi-tenant workspace management
              </p>
              <p>
                <span>✓</span>15 integrated business modules
              </p>
              <p>
                <span>✓</span>Enterprise-grade security & compliance
              </p>
            </div>

            <p className="login-brand-footer">A product of LA CREATIVO GROUP</p>
          </div>
        </aside>

        <section className="login-form-panel">
          <div className="login-mobile-header" aria-hidden="true">
            <div className="login-logo-lockup login-logo-lockup--mobile">
              <div className="login-logo-icon login-logo-icon--sm">
                <span className="login-logo-b">B</span>
              </div>
              <div className="login-logo-text-group">
                <span className="login-logo-mark">BIZOSTO</span>
                <span className="login-logo-descriptor">Operating System</span>
              </div>
            </div>
          </div>

          <div className="login-form-shell">
            <div className="login-card login-animate">
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
                    setError('');
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
                        type={showPass ? 'text' : 'password'}
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
                        aria-label={showPass ? 'Hide password' : 'Show password'}
                      >
                        {showPass ? (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </label>

                  <div className="login-row">
                    <label className="login-check">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={() => {
                          const next = !remember;
                          setRemember(next);
                          window.localStorage.setItem('bizosto_remember', String(next));
                        }}
                      />
                      <span>Remember me</span>
                    </label>

                    <button onClick={handleForgot} className="login-forgot" type="button">
                      Forgot password?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    disabled={!firebaseAuth || loading}
                    loading={loading || !firebaseAuth}
                    loadingText={!firebaseAuth ? 'Loading...' : 'Signing in...'}
                    className="login-submit"
                    fullWidth
                  >
                    Sign In
                  </Button>

                  {ssoProviders.length > 0 ? (
                    <>
                      <div className="login-divider">
                        <span>or</span>
                      </div>
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
            background: linear-gradient(180deg, var(--brand-navy) 0%, var(--brand-blue-light) 100%);
            color: var(--text-on-brand);
            display: flex;
            position: relative;
            overflow: hidden;
          }

          .login-brand::before {
            content: '';
            position: absolute;
            inset: -40%;
            background: conic-gradient(
              from 0deg,
              transparent 0deg,
              rgba(255, 255, 255, 0.1) 70deg,
              rgba(102, 146, 249, 0.22) 140deg,
              transparent 210deg,
              rgba(255, 255, 255, 0.07) 300deg,
              transparent 360deg
            );
            animation: login-aurora 30s linear infinite;
            pointer-events: none;
          }

          .login-brand::after {
            content: '';
            position: absolute;
            inset: 0;
            background-image:
              linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
            background-size: 44px 44px;
            mask-image: radial-gradient(ellipse at 30% 20%, black 30%, transparent 75%);
            -webkit-mask-image: radial-gradient(ellipse at 30% 20%, black 30%, transparent 75%);
            pointer-events: none;
          }

          .login-brand-inner {
            width: 100%;
            display: flex;
            flex-direction: column;
            padding: 56px 44px 36px;
            position: relative;
            z-index: 1;
          }

          .login-logo-wrap {
            margin-bottom: 20px;
          }

          .login-logo-lockup {
            display: inline-flex;
            align-items: center;
            gap: 14px;
          }

          .login-logo-lockup--mobile {
            gap: 12px;
          }

          .login-logo-icon {
            width: 48px;
            height: 48px;
            border-radius: 10px;
            background: linear-gradient(180deg, var(--brand-navy) 0%, var(--brand-blue-light) 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
          }

          .login-logo-icon--sm {
            width: 40px;
            height: 40px;
            border-radius: 8px;
            background: linear-gradient(180deg, var(--brand-navy) 0%, var(--brand-blue-light) 100%);
          }

          .login-logo-b {
            font-size: 1.5rem;
            font-weight: 900;
            color: var(--text-on-brand);
            letter-spacing: -0.02em;
            line-height: 1;
            font-family:
              system-ui,
              -apple-system,
              sans-serif;
          }

          .login-logo-icon--sm .login-logo-b {
            font-size: 1.2rem;
          }

          .login-logo-text-group {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .login-logo-descriptor {
            display: block;
            font-size: 0.65rem;
            font-weight: 500;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: rgba(255, 255, 255, 0.6);
            line-height: 1;
          }

          .login-logo-mark {
            display: inline-block;
            font-weight: 800;
            letter-spacing: 0.08em;
            font-size: clamp(1.1rem, 1rem + 0.6vw, 1.65rem);
            color: var(--text-on-brand);
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
            width: 20px;
            height: 20px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.16);
            border: 1px solid rgba(255, 255, 255, 0.35);
            box-shadow: 0 0 12px rgba(102, 146, 249, 0.45);
            font-size: 0.7rem;
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
            color: var(--danger-deep);
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
            background: var(--input-bg);
            transition: all 0.2s ease;
          }

          .login-input {
            width: 100%;
            height: 44px;
            border: 1px solid var(--border-subtle);
            border-radius: 8px;
            background: var(--input-bg);
            color: var(--input-text);
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

          .login-input:hover,
          .login-input-wrap:hover {
            border-color: rgba(1, 33, 103, 0.35);
          }

          .login-input:focus,
          .login-input-wrap:focus-within {
            border-color: var(--brand-navy);
            box-shadow: 0 0 0 3px rgba(1, 33, 103, 0.1);
          }

          .login-toggle {
            width: 40px;
            height: 40px;
            border: none;
            background: transparent;
            cursor: pointer;
            line-height: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            transition: color 0.2s ease;
          }

          .login-toggle:hover {
            color: var(--text-primary);
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
            accent-color: var(--brand-navy);
          }

          .login-forgot {
            border: none;
            background: transparent;
            color: var(--brand-navy);
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            padding: 0;
            background-image: linear-gradient(currentColor, currentColor);
            background-size: 0% 1.5px;
            background-repeat: no-repeat;
            background-position: left bottom;
            transition: background-size 0.25s ease;
          }

          .login-forgot:hover {
            background-size: 100% 1.5px;
          }

          .login-submit {
            height: 44px;
            border-radius: 8px;
            border: none;
            background: linear-gradient(135deg, var(--brand-navy), var(--brand-blue-light));
            color: var(--text-on-brand);
            font-weight: 600;
            transition: all 0.2s ease;
            position: relative;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(1, 33, 103, 0.25);
          }

          .login-submit::after {
            content: '';
            position: absolute;
            top: 0;
            left: -80%;
            height: 100%;
            width: 50%;
            background: linear-gradient(
              100deg,
              transparent 20%,
              rgba(255, 255, 255, 0.35) 50%,
              transparent 80%
            );
            transform: skewX(-18deg);
            transition: left 0.55s ease;
            pointer-events: none;
          }

          .login-submit:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 6px 18px rgba(1, 33, 103, 0.35);
          }

          .login-submit:hover:not(:disabled)::after {
            left: 130%;
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
            content: '';
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
            color: var(--brand-navy);
            font-weight: 600;
            margin-left: 4px;
            background-image: linear-gradient(currentColor, currentColor);
            background-size: 0% 1.5px;
            background-repeat: no-repeat;
            background-position: left bottom;
            transition: background-size 0.25s ease;
          }

          .login-signup-row a:hover {
            background-size: 100% 1.5px;
          }

          @media (max-width: 767px) {
            .login-page {
              flex-direction: column;
              background: var(--text-on-brand);
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
              background: linear-gradient(
                180deg,
                var(--brand-navy) 0%,
                var(--brand-blue-light) 100%
              );
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              overflow: hidden;
            }

            .login-mobile-header::before {
              content: '';
              position: absolute;
              inset: -60%;
              background: conic-gradient(
                from 0deg,
                transparent 0deg,
                rgba(255, 255, 255, 0.12) 80deg,
                transparent 160deg,
                rgba(102, 146, 249, 0.2) 260deg,
                transparent 360deg
              );
              animation: login-aurora 30s linear infinite;
              pointer-events: none;
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

          .login-animate > * {
            opacity: 0;
            transform: translateY(12px);
            animation: login-rise 0.65s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }

          .login-animate > *:nth-child(1) {
            animation-delay: 0.05s;
          }

          .login-animate > *:nth-child(2) {
            animation-delay: 0.15s;
          }

          .login-animate > *:nth-child(3) {
            animation-delay: 0.25s;
          }

          .login-animate > *:nth-child(4) {
            animation-delay: 0.35s;
          }

          @keyframes login-rise {
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes login-aurora {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .login-brand::before,
            .login-mobile-header::before {
              animation: none;
            }

            .login-animate > * {
              opacity: 1;
              transform: none;
              animation: none;
            }

            .login-submit::after {
              display: none;
            }

            .login-submit:hover:not(:disabled) {
              transform: none;
            }
          }
        `}</style>
      </div>
      {showSplash && (
        <BizostoSplash
          duration={2000}
          onDone={() => {
            window.location.href = splashDest;
          }}
        />
      )}
    </>
  );
}
