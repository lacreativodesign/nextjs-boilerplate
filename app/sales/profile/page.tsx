'use client';

import { OptimizedImage } from '@/components/OptimizedImage';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import {
  EmailAuthProvider,
  getMultiFactorResolver,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import MFASetup from '@/components/auth/MFASetup';
import PasswordStrengthMeter from '@/components/auth/PasswordStrengthMeter';
import { getFirebaseAuth, getFirebaseDb } from '@/lib/firebaseClient';
import { validatePasswordStrength } from '@/lib/auth/passwordPolicy';
import { isMFAEnabled, unenrollMFA, verifyMFASignIn } from '@/lib/auth/mfa';
import { apiFetch } from '@/lib/api/client';

export default function SalesProfilePage() {
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMfaCode, setPasswordMfaCode] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [displayName, setDisplayName] = useState('User');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Sales Executive');
  const [department, setDepartment] = useState('Sales');

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaUpdatedAt, setMfaUpdatedAt] = useState<string | null>(null);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const auth = await getFirebaseAuth();
        const user = auth.currentUser;
        if (!user) return;

        const db = await getFirebaseDb();
        const snap = await getDoc(doc(db, 'users', user.uid));
        const data = snap.exists() ? snap.data() : {};

        if (!active) return;

        setDisplayName((data?.name as string) || user.displayName || 'User');
        setEmail((data?.email as string) || user.email || '');
        setRole((data?.role as string) || 'Sales Executive');
        setDepartment((data?.department as string) || 'Sales');
        setMfaEnabled(isMFAEnabled(user));

        const mfaUpdated = data?.mfaUpdatedAt?.toDate?.() || data?.mfaUpdatedAt || null;
        if (mfaUpdated) {
          setMfaUpdatedAt(new Date(mfaUpdated).toLocaleString());
        }
      } catch (err) {
        console.error('Failed to load profile', err);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  const initials = useMemo(
    () =>
      displayName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase(),
    [displayName],
  );

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
    setMessage('Profile picture updated locally. Save to persist in storage.');
    setError(null);
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all password fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    const validation = validatePasswordStrength(newPassword, { email, name: displayName });
    if (!validation.valid) {
      setError(validation.errors[0]);
      return;
    }

    try {
      setPasswordLoading(true);
      const auth = await getFirebaseAuth();
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error('You must be signed in to update your password.');
      }

      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      try {
        await reauthenticateWithCredential(user, credential);
      } catch (err: any) {
        if (err?.code === 'auth/multi-factor-auth-required') {
          if (!passwordMfaCode) {
            throw new Error('Enter your MFA code to confirm the password change.');
          }
          const resolver = getMultiFactorResolver(auth, err);
          await verifyMFASignIn(resolver, passwordMfaCode);
        } else {
          throw err;
        }
      }

      await updatePassword(user, newPassword);

      await apiFetch('/api/auth/sessions/invalidate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      setMessage('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMfaCode('');
    } catch (err: any) {
      setError(err?.message || 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaDisablePassword || !mfaDisableCode) {
      setMfaError('Enter your password and MFA code to disable MFA.');
      return;
    }

    try {
      setMfaLoading(true);
      setMfaError(null);

      const auth = await getFirebaseAuth();
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error('You must be signed in to disable MFA.');
      }

      const credential = EmailAuthProvider.credential(user.email, mfaDisablePassword);
      try {
        await reauthenticateWithCredential(user, credential);
      } catch (err: any) {
        if (err?.code === 'auth/multi-factor-auth-required') {
          const resolver = getMultiFactorResolver(auth, err);
          await verifyMFASignIn(resolver, mfaDisableCode);
        } else {
          throw err;
        }
      }

      await unenrollMFA(user);

      setMfaEnabled(false);
      setMfaUpdatedAt(new Date().toLocaleString());
      setShowMfaSetup(false);
      setMfaDisablePassword('');
      setMfaDisableCode('');
      setMessage('MFA has been disabled for your account.');
    } catch (err: any) {
      setMfaError(err?.message || 'Failed to disable MFA.');
    } finally {
      setMfaLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Profile</h1>
          <p className="page-subtitle">
            Review your account details and keep contact information current.
          </p>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            error
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {error || message}
        </div>
      )}

      <section className="card p-6 space-y-4 settings-section">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--surface-muted)] flex items-center justify-center text-lg font-semibold">
            {avatarPreview ? (
              <OptimizedImage
                src={avatarPreview}
                alt="Avatar preview"
                width={64}
                height={64}
                className="w-full h-full object-cover rounded-2xl"
                sizes="64px"
                blurDataURL={avatarPreview}
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div>
            <div className="text-base font-semibold">{displayName}</div>
            <div className="text-sm text-[var(--text-muted)]">{role}</div>
          </div>
        </div>
        <div className="settings-divider" />
        <h2 className="text-lg font-semibold">Basic Information</h2>
        <p className="text-sm text-[var(--text-muted)]">
          These details are synchronized with your enterprise account. Contact HR for changes.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="text-sm font-medium">Full Name</label>
            <input type="text" value={displayName} disabled className="mt-2 input" />
            <p className="helper-text mt-2">Managed by HR policies.</p>
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input type="email" value={email} disabled className="mt-2 input" />
            <p className="helper-text mt-2">Used for login and alerts.</p>
          </div>
          <div>
            <label className="text-sm font-medium">Role</label>
            <input type="text" value={role} disabled className="mt-2 input" />
          </div>
          <div>
            <label className="text-sm font-medium">Department</label>
            <input type="text" value={department} disabled className="mt-2 input" />
          </div>
        </div>
      </section>

      <section className="card p-6 space-y-4 settings-section">
        <h2 className="text-lg font-semibold">Profile Picture</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Upload a square image (e.g. 400×400). Save to update your profile.
        </p>

        <div className="flex items-center gap-6 mt-4">
          <div className="w-20 h-20 rounded-2xl bg-[var(--erp-blue-soft)] flex items-center justify-center overflow-hidden text-xl font-semibold text-[var(--erp-blue)]">
            {avatarPreview ? (
              <OptimizedImage
                src={avatarPreview}
                alt="Avatar preview"
                width={80}
                height={80}
                className="w-full h-full object-cover"
                sizes="80px"
                blurDataURL={avatarPreview}
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div className="space-y-2">
            <label className="inline-block">
              <span className="btn">Choose Image</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </label>
            <p className="helper-text">JPG or PNG, max 2 MB recommended.</p>
          </div>
        </div>
      </section>

      <section className="card p-6 space-y-4 settings-section">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Multi-Factor Authentication</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Add an extra layer of security with an authenticator app.
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              mfaEnabled
                ? 'bg-emerald-500/20 text-emerald-400 dark:text-emerald-300'
                : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'
            }`}
          >
            {mfaEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {mfaUpdatedAt ? (
          <p className="text-xs text-[var(--text-muted)]">Last updated: {mfaUpdatedAt}</p>
        ) : null}

        {mfaEnabled ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-muted)]">
              To disable MFA, confirm your password and current authenticator code.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="password"
                value={mfaDisablePassword}
                onChange={(e) => setMfaDisablePassword(e.target.value)}
                placeholder="Current password"
                className="input"
              />
              <input
                type="text"
                value={mfaDisableCode}
                onChange={(e) => setMfaDisableCode(e.target.value)}
                placeholder="6-digit MFA code"
                className="input"
                inputMode="numeric"
              />
            </div>
            {mfaError ? <div className="text-sm text-red-500">{mfaError}</div> : null}
            <button type="button" className="btn" onClick={handleDisableMfa} disabled={mfaLoading}>
              {mfaLoading ? 'Disabling…' : 'Disable MFA'}
            </button>
          </div>
        ) : showMfaSetup ? (
          <MFASetup
            onComplete={() => {
              setMfaEnabled(true);
              setShowMfaSetup(false);
            }}
            onCancel={() => setShowMfaSetup(false)}
          />
        ) : (
          <button type="button" className="btn" onClick={() => setShowMfaSetup(true)}>
            Enable MFA
          </button>
        )}
      </section>

      <section className="card p-6 space-y-4 settings-section">
        <h2 className="text-lg font-semibold">Change Password</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Use a strong password that matches the enterprise security policy.
        </p>

        <form onSubmit={handlePasswordSubmit} className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-medium">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-2 input"
              placeholder="Enter current password"
            />
            <p className="helper-text mt-2">Required to confirm your identity.</p>
          </div>

          <div>
            <label className="text-sm font-medium">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-2 input"
              placeholder="Minimum 8 characters"
            />
            <div className="mt-3">
              <PasswordStrengthMeter password={newPassword} showRequirements />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-2 input"
              placeholder="Re-type new password"
            />
          </div>

          {mfaEnabled ? (
            <div>
              <label className="text-sm font-medium">MFA Code</label>
              <input
                type="text"
                value={passwordMfaCode}
                onChange={(e) => setPasswordMfaCode(e.target.value)}
                className="mt-2 input"
                placeholder="6-digit authenticator code"
                inputMode="numeric"
              />
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="helper-text">Password updates take effect immediately.</span>
            <button type="submit" className="btn subtle" disabled={passwordLoading}>
              {passwordLoading ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
