'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { SkeletonForm } from '@/components/ui/Skeleton';
import { useSearchParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

function AcceptInviteClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;

    async function validateInvite() {
      if (!token) {
        setError('Missing invite token.');
        setLoading(false);
        return;
      }

      try {
        const res = await apiFetch(
          `/api/client/invites/validate?token=${encodeURIComponent(token)}`,
          {
            cache: 'no-store',
          },
        );
        const data = await res.json();

        if (!res.ok || !data?.ok) throw new Error(data?.error || 'Invite is invalid or expired.');

        if (!alive) return;
        setEmail(data.email || '');
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || 'Unable to validate invite.');
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
    setError(null);

    if (!token) {
      setError('Missing invite token.');
      return;
    }
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!email) {
      setError('Invite email missing. Please reopen the invite link.');
      return;
    }

    setSubmitting(true);
    try {
      const auth = await getFirebaseAuth();

      // Create the Firebase account for the invited email (or sign in if it already exists and
      // the password matches — proving the caller controls the account).
      let userCred;
      try {
        userCred = await createUserWithEmailAndPassword(auth, email, password);
      } catch (createErr: any) {
        if (createErr?.code === 'auth/email-already-in-use') {
          userCred = await signInWithEmailAndPassword(auth, email, password);
        } else {
          throw createErr;
        }
      }

      // Bind the invite to the VERIFIED account — the server takes the uid from this token.
      const activationToken = await userCred.user.getIdToken(true);
      const res = await apiFetch('/api/client/invites/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, idToken: activationToken }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Unable to complete invite.');

      // Establish a session with a fresh token that now carries the client role/tenant claims.
      const sessionToken = await userCred.user.getIdToken(true);
      const sessionRes = await apiFetch('/api/session-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: sessionToken }),
      });
      if (!sessionRes.ok) throw new Error('Account activated, but sign-in failed. Please log in.');

      router.replace('/client');
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError(
          'An account already exists for this email. Enter the correct password or contact support.',
        );
      } else {
        setError(err?.message || 'Something went wrong.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-md">
        <SkeletonForm fields={3} />
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
            placeholder="Set a secure password (8+ characters)"
          />
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}

        <button className="btn primary w-full" disabled={submitting} onClick={submit}>
          {submitting ? 'Activating…' : 'Activate Account'}
        </button>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--text-muted)]">Loading…</div>}>
      <AcceptInviteClient />
    </Suspense>
  );
}
