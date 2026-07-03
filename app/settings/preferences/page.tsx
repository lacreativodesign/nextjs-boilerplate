'use client';

import { useState } from 'react';

const TIMEZONES = [
  'UTC',
  'Asia/Karachi',
  'America/New_York',
  'Europe/London',
  'Asia/Dubai',
  'America/Los_Angeles',
];
const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];

export default function SettingsPreferencesPage() {
  const [prefs, setPrefs] = useState({
    timezone: 'Asia/Karachi',
    dateFormat: 'DD/MM/YYYY',
    emailNotifications: true,
    browserNotifications: false,
    weeklyDigest: true,
  });
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const set = (key: string, val: unknown) => setPrefs((p) => ({ ...p, [key]: val }));

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={handleSave} className="space-y-6">
        {/* Localisation */}
        <div className="card space-y-4 p-6">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Localisation</h2>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              Language
            </label>
            <p className="input flex w-full cursor-default select-none items-center gap-2 bg-[var(--surface-muted)] text-[var(--text-muted)]">
              English
              <span className="text-xs">(more languages coming soon)</span>
            </p>
          </div>

          {[
            { label: 'Timezone', key: 'timezone', options: TIMEZONES },
            { label: 'Date Format', key: 'dateFormat', options: DATE_FORMATS },
          ].map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                {f.label}
              </label>
              <select
                className="input w-full"
                value={prefs[f.key as keyof typeof prefs] as string}
                onChange={(e) => set(f.key, e.target.value)}
              >
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Notifications */}
        <div className="card space-y-4 p-6">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Notifications</h2>
          {[
            {
              label: 'Email Notifications',
              key: 'emailNotifications',
              desc: 'Receive updates and alerts via email.',
            },
            {
              label: 'Browser Notifications',
              key: 'browserNotifications',
              desc: 'Push notifications in your browser.',
            },
            {
              label: 'Weekly Digest',
              key: 'weeklyDigest',
              desc: 'Summary email every Monday morning.',
            },
          ].map((f) => (
            <div
              key={f.key}
              className="flex items-center justify-between border-b border-[var(--border-subtle)] py-2 last:border-0"
            >
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{f.label}</p>
                <p className="text-xs text-[var(--text-muted)]">{f.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => set(f.key, !prefs[f.key as keyof typeof prefs])}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  prefs[f.key as keyof typeof prefs]
                    ? 'bg-[var(--erp-blue)]'
                    : 'bg-[var(--surface-muted)]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    prefs[f.key as keyof typeof prefs] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        <button type="submit" className="btn w-full">
          {saved ? '✓ Preferences Saved!' : 'Save Preferences'}
        </button>
      </form>
    </div>
  );
}
