'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

/**
 * S20: preferences that actually save.
 *
 * This screen previously lied. `handleSave` set a local `saved` flag, showed a success
 * message for three seconds, and sent nothing to the server. Every choice the user made —
 * timezone, date format, notification settings — was discarded the moment they navigated
 * away, while the UI told them it had worked. There was also nowhere to put them: the
 * profile endpoint had no concept of preferences at all.
 *
 * Preferences are now loaded from the user's record and persisted through
 * PATCH /api/users/profile. A failed save reports the failure instead of claiming success.
 */
const TIMEZONES = [
  'UTC',
  'Asia/Karachi',
  'America/New_York',
  'Europe/London',
  'Asia/Dubai',
  'America/Los_Angeles',
];
const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];

type Preferences = {
  timezone: string;
  dateFormat: string;
  emailNotifications: boolean;
  browserNotifications: boolean;
  weeklyDigest: boolean;
};

const TOGGLES: { key: keyof Preferences; label: string; description: string }[] = [
  {
    key: 'emailNotifications',
    label: 'Email notifications',
    description: 'Receive email when something needs your attention.',
  },
  {
    key: 'browserNotifications',
    label: 'Browser notifications',
    description: 'Show desktop notifications while you are signed in.',
  },
  {
    key: 'weeklyDigest',
    label: 'Weekly digest',
    description: 'A summary of your workspace every week.',
  },
];

export default function SettingsPreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch('/api/users/profile', { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        profile?: { preferences?: Preferences };
        error?: string;
      } | null;

      if (!res.ok || !payload?.ok || !payload.profile) {
        setError(payload?.error || `Could not load your preferences (${res.status})`);
        return;
      }

      setPrefs(
        payload.profile.preferences ?? {
          timezone: 'UTC',
          dateFormat: 'DD/MM/YYYY',
          emailNotifications: true,
          browserNotifications: false,
          weeklyDigest: true,
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your preferences');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setPrefs((current) => (current ? { ...current, [key]: value } : current));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!prefs) return;

    setStatus('saving');
    setError(null);

    try {
      const res = await apiFetch('/api/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: prefs }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !payload?.ok) {
        setStatus('idle');
        setError(payload?.error || 'Could not save your preferences.');
        return;
      }

      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Could not save your preferences.');
    }
  }

  if (!prefs && !error) {
    return <p className="helper-text">Loading preferences…</p>;
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="page-title">Preferences</h1>

      {error && (
        <p className="rounded-xl border border-[var(--danger,#dc2626)] p-4 text-sm font-semibold text-[var(--danger,#dc2626)]">
          {error}
        </p>
      )}

      {prefs && (
        <form onSubmit={handleSave} className="space-y-6">
          {[
            { label: 'Timezone', key: 'timezone' as const, options: TIMEZONES },
            { label: 'Date Format', key: 'dateFormat' as const, options: DATE_FORMATS },
          ].map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                {field.label}
              </label>
              <select
                className="input w-full"
                value={prefs[field.key]}
                onChange={(e) => set(field.key, e.target.value)}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div className="space-y-3">
            {TOGGLES.map((toggle) => (
              <div
                key={toggle.key}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {toggle.label}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{toggle.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(prefs[toggle.key])}
                  aria-label={toggle.label}
                  onClick={() => set(toggle.key, !prefs[toggle.key] as never)}
                  className={`h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                    prefs[toggle.key]
                      ? 'bg-[var(--brand-primary,#6366f1)]'
                      : 'bg-[var(--surface-muted)]'
                  }`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                      prefs[toggle.key] ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          <button type="submit" className="btn w-full" disabled={status === 'saving'}>
            {status === 'saving' ? 'Saving…' : 'Save preferences'}
          </button>

          {status === 'saved' && (
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">
              Preferences saved.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
