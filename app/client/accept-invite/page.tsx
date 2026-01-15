"use client";


import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createUserWithEmailAndPassword, type Auth } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebaseClient";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [auth, setAuth] = useState<Auth | null>(null);
  const [email, setEmail] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getFirebaseAuth()
      .then((instance) => {
        if (alive) setAuth(instance);
      })
      .catch((err) => {
        console.error("Firebase auth init error", err);
        if (alive) setError("Unable to load authentication.");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function validate() {
      if (!token) {
        setError("Missing invite token.");

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Accept Invite Page
 * - Client-only
 * - Suspense-safe
 * - No static export
 * - No server hooks
 */

function AcceptInviteClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;

    async function validateInvite() {
      if (!token) {
        setError("Invalid or missing invite token.");

        setLoading(false);
        return;
      }

      try {

        const res = await fetch(`/api/client/invites/validate?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data?.error || "Unable to validate invite.");
        }

        if (!active) return;
        setEmail(data.email || "");
        setTenantId(data.tenantId || "");
        setClientId(data.clientId || "");
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || "Unable to validate invite.");
      } finally {
        if (active) setLoading(false);
      }
    }

    validate();
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async () => {
    if (!auth) return;
    if (!email) {
      setError("Email is missing for this invite.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");

        const res = await fetch(
          `/api/client/invites/validate?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );

        const data = await res.json();

        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "Invite link is invalid or expired.");
        }

        if (!alive) return;
        setEmail(data.email || "");
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unable to validate invite.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    validateInvite();
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async () => {
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");

      return;
    }

    setSubmitting(true);
    setError(null);

    try {

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const res = await fetch("/api/client/invites/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, uid: userCredential.user.uid, tenantId, clientId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || "Unable to finalize invite.");

      const res = await fetch("/api/client/invites/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Unable to complete invite.");

      }

      router.replace("/client");
    } catch (err: any) {

      setError(err?.message || "Unable to complete invite.");

      setError(err?.message || "Something went wrong.");

    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f0f11] text-gray-900 dark:text-gray-100">
      <div className="card" style={{ padding: 28, width: "100%", maxWidth: 420 }}>
        <h1 className="text-xl font-semibold">Activate your client portal</h1>
        <p className="text-sm text-[var(--text-muted)]" style={{ marginTop: 6 }}>
          Set a password to finish activating your Bizosto client portal access.
        </p>

        {loading ? (
          <p className="text-sm" style={{ marginTop: 16 }}>
            Validating invite...
          </p>
        ) : (
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <div className="text-sm">Email</div>
            <input className="input" value={email} disabled />
            <input
              className="input"
              type="password"
              placeholder="Create password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error && <div className="text-xs text-red-400">{error}</div>}
            <button className="btn" onClick={handleSubmit} disabled={submitting || !auth}>
              {submitting ? "Activating..." : "Activate portal"}
            </button>
          </div>
        )}

  if (loading) {
    return (
      <div className="p-6 text-sm text-[var(--text-muted)]">
        Validating invitation…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-md">
        <h1 className="text-xl font-bold mb-2">Invite Error</h1>
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-bold">Activate Your Account</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Create a password to access your client portal.
        </p>
      </div>

      <div className="card p-4 space-y-3">
        <div>
          <label className="block text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Email
          </label>
          <input className="input mt-1" value={email} disabled />
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wide text-[var(--text-muted)]">
            Password
          </label>
          <input
            className="input mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Set a secure password"
          />
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}

        <button
          className="btn primary w-full"
          disabled={submitting}
          onClick={submit}
        >
          {submitting ? "Activating…" : "Activate Account"}
        </button>

      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--text-muted)]">
          Loading…
        </div>
      }
    >
      <AcceptInviteClient />
    </Suspense>
  );
}

