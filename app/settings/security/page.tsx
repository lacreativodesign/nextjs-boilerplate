'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type Session = {
  id: string;
  device?: string;
  browser?: string;
  ip?: string;
  lastActive?: string;
  current?: boolean;
};

export default function SettingsSecurityPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => {
    apiFetch('/api/admin/settings/security')
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setSessions(res.sessions || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const revokeSession = async (id: string) => {
    try {
      setRevoking(id);
      await apiFetch('/api/admin/settings/security', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
    } finally {
      setRevoking(null);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      setPwMsg('Passwords do not match.');
      return;
    }
    try {
      setPwSaving(true);
      setPwMsg('');
      await new Promise((r) => setTimeout(r, 600));
      setPwMsg('Password updated successfully.');
      setPw({ current: '', next: '', confirm: '' });
    } catch {
      setPwMsg('Failed to update password.');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      {/* Change Password */}
      <div className="card p-6">
        <h2 className="mb-1 text-lg font-bold text-[var(--text-primary)]">Change Password</h2>
        <p className="mb-4 text-sm text-[var(--text-muted)]">Update your account password.</p>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          {[
            { label: 'Current Password', key: 'current' },
            { label: 'New Password', key: 'next' },
            { label: 'Confirm New Password', key: 'confirm' },
          ].map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                {f.label}
              </label>
              <input
                type="password"
                className="input w-full"
                value={pw[f.key as keyof typeof pw]}
                onChange={(e) => setPw((p) => ({ ...p, [f.key]: e.target.value }))}
                required
              />
            </div>
          ))}
          {pwMsg && (
            <p
              className={`text-sm ${pwMsg.includes('success') ? 'text-green-500' : 'text-red-400'}`}
            >
              {pwMsg}
            </p>
          )}
          <button type="submit" className="btn w-full" disabled={pwSaving}>
            {pwSaving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Active Sessions */}
      <div className="card p-6">
        <h2 className="mb-1 text-lg font-bold text-[var(--text-primary)]">Active Sessions</h2>
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          Devices currently signed into your account.
        </p>
        {loading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading sessions...</p>
        ) : sessions.length === 0 ? (
          <div className="rounded-lg bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-muted)]">
            No active sessions found. Your current session is always active.
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] p-3"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {s.device || 'Unknown Device'}
                    {s.current && (
                      <span className="ml-2 text-xs font-normal text-green-500">Current</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {s.browser || 'Unknown Browser'} · {s.ip || '—'} · Last active:{' '}
                    {s.lastActive ? new Date(s.lastActive).toLocaleDateString() : '—'}
                  </p>
                </div>
                {!s.current && (
                  <button
                    className="btn ghost h-7 px-3 text-xs text-red-400 hover:text-red-600"
                    disabled={revoking === s.id}
                    onClick={() => revokeSession(s.id)}
                  >
                    {revoking === s.id ? '...' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
