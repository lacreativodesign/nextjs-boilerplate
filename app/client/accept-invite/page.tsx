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
      }

      router.replace("/client");
    } catch (err: any) {
      setError(err?.message || "Unable to complete invite.");
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
      </div>
    </div>
  );
}
