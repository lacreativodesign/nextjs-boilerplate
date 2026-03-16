'use client';

import { useEffect, useState } from 'react';

type PlatformSettings = {
  allowPublicSignup: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  defaultTrialDays: number;
  supportEmail: string;
  platformName: string;
  announcementEnabled: boolean;
  announcementMessage: string;
  announcementType: string;
  maxUsersStarter: number;
  maxUsersPro: number;
  maxUsersEnterprise: number;
};

const DEFAULTS: PlatformSettings = {
  allowPublicSignup: true,
  maintenanceMode: false,
  maintenanceMessage: 'Bizosto is undergoing scheduled maintenance. Back soon.',
  defaultTrialDays: 14,
  supportEmail: 'support@bizosto.com',
  platformName: 'Bizosto ERP',
  announcementEnabled: false,
  announcementMessage: '',
  announcementType: 'info',
  maxUsersStarter: 10,
  maxUsersPro: 50,
  maxUsersEnterprise: 999,
};

export default function SuperAdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/super_admin/settings', { credentials: 'include' })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok && res.settings) setSettings(res.settings);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/super_admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof PlatformSettings>(key: K, val: PlatformSettings[K]) =>
    setSettings((p) => ({ ...p, [key]: val }));

  if (loading) return <div className="card p-6 text-sm text-[var(--text-muted)]">Loading platform settings...</div>;

  return (
    <div className="space-y-6">
      {/* Section 1 — Access Controls */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Access Controls</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Allow Public Signup</p>
              <p className="text-xs text-[var(--text-muted)]">When OFF, only invited users can create accounts</p>
            </div>
            <button
              onClick={() => set('allowPublicSignup', !settings.allowPublicSignup)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.allowPublicSignup ? 'bg-[var(--erp-blue)]' : 'bg-gray-300'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.allowPublicSignup ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Maintenance Mode</p>
              <p className="text-xs text-[var(--text-muted)]">When ON, non-super-admins see a maintenance page</p>
            </div>
            <button
              onClick={() => set('maintenanceMode', !settings.maintenanceMode)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.maintenanceMode ? 'bg-red-500' : 'bg-gray-300'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.maintenanceMode ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
          {settings.maintenanceMode && (
            <div>
              <label className="text-xs font-medium text-[var(--text-muted)]">Maintenance Message</label>
              <input
                value={settings.maintenanceMessage}
                onChange={(e) => set('maintenanceMessage', e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </div>
          )}
        </div>
      </div>

      {/* Section 2 — Platform Configuration */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Platform Configuration</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)]">Platform Name</label>
            <input
              value={settings.platformName}
              onChange={(e) => set('platformName', e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)]">Support Email</label>
            <input
              type="email"
              value={settings.supportEmail}
              onChange={(e) => set('supportEmail', e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)]">Default Trial Days (1–90)</label>
            <input
              type="number"
              min={1}
              max={90}
              value={settings.defaultTrialDays}
              onChange={(e) => set('defaultTrialDays', Math.max(1, Math.min(90, Number(e.target.value))))}
              className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>
        </div>
      </div>

      {/* Section 3 — Announcement Banner */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Announcement Banner</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Enable Announcement</p>
              <p className="text-xs text-[var(--text-muted)]">Shows a banner to all logged-in users</p>
            </div>
            <button
              onClick={() => set('announcementEnabled', !settings.announcementEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.announcementEnabled ? 'bg-[var(--erp-blue)]' : 'bg-gray-300'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.announcementEnabled ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
          {settings.announcementEnabled && (
            <>
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)]">Announcement Message</label>
                <textarea
                  value={settings.announcementMessage}
                  onChange={(e) => set('announcementMessage', e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--text-muted)]">Announcement Type</label>
                <select
                  value={settings.announcementType}
                  onChange={(e) => set('announcementType', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="info">Info (Blue)</option>
                  <option value="warning">Warning (Amber)</option>
                  <option value="success">Success (Green)</option>
                  <option value="error">Error (Red)</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Section 4 — Plan Limits (read only) */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Plan Limits</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg bg-[var(--surface-hover)] p-4 text-center">
            <p className="text-xs text-[var(--text-muted)]">Starter</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{settings.maxUsersStarter}</p>
            <p className="text-xs text-[var(--text-muted)]">max users</p>
          </div>
          <div className="rounded-lg bg-[var(--surface-hover)] p-4 text-center">
            <p className="text-xs text-[var(--text-muted)]">Pro</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{settings.maxUsersPro}</p>
            <p className="text-xs text-[var(--text-muted)]">max users</p>
          </div>
          <div className="rounded-lg bg-[var(--surface-hover)] p-4 text-center">
            <p className="text-xs text-[var(--text-muted)]">Enterprise</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{settings.maxUsersEnterprise}</p>
            <p className="text-xs text-[var(--text-muted)]">max users</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {saved && <p className="text-sm text-green-500">✓ Settings saved successfully</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg bg-[var(--erp-blue)] px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Platform Settings'}
      </button>
    </div>
  );
}
