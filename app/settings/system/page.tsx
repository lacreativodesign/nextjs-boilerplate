'use client';

import { useEffect, useState } from 'react';
import { useTenantContext } from '@/lib/tenant/useTenantContext';
import { apiFetch } from '@/lib/api/client';

type SystemSettings = {
  maintenanceMode?: boolean;
  allowSignups?: boolean;
  maxTenantsPerPlan?: number;
  defaultPlan?: string;
  supportEmail?: string;
};

export default function SettingsSystemPage() {
  const { data } = useTenantContext();
  const role = data?.user?.role;
  const [settings, setSettings] = useState<SystemSettings>({
    maintenanceMode: false,
    allowSignups: true,
    maxTenantsPerPlan: 10,
    defaultPlan: 'starter',
    supportEmail: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch('/api/admin/settings/system')
      .then((r) => r.json())
      .then((res) => {
        if (res.ok && res.settings) setSettings(res.settings);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (role && role !== 'super_admin') {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">Access Restricted</h2>
        <p className="text-sm text-[var(--text-muted)]">
          System settings are only available to super admins.
        </p>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await apiFetch('/api/admin/settings/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, val: unknown) => setSettings((p) => ({ ...p, [key]: val }));

  if (loading)
    return (
      <div className="card p-6 text-sm text-[var(--text-muted)]">Loading system settings...</div>
    );

  return (
    <div className="max-w-xl">
      <form onSubmit={handleSave} className="space-y-6">
        <div className="card space-y-4 p-6">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Platform Controls</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Super admin only. These affect the entire platform.
          </p>

          {[
            {
              label: 'Maintenance Mode',
              key: 'maintenanceMode',
              desc: 'Disables access for all non-super-admin users.',
            },
            {
              label: 'Allow New Signups',
              key: 'allowSignups',
              desc: 'Enable or disable new tenant registrations.',
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
                onClick={() => set(f.key, !settings[f.key as keyof typeof settings])}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings[f.key as keyof SystemSettings]
                    ? 'bg-[var(--erp-blue)]'
                    : 'bg-[var(--surface-muted)]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings[f.key as keyof SystemSettings] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              Support Email
            </label>
            <input
              type="email"
              className="input w-full"
              value={settings.supportEmail || ''}
              onChange={(e) => set('supportEmail', e.target.value)}
              placeholder="support@yourdomain.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--text-primary)]">
              Default Plan
            </label>
            <select
              className="input w-full"
              value={settings.defaultPlan || 'starter'}
              onChange={(e) => set('defaultPlan', e.target.value)}
            >
              {['starter', 'growth', 'enterprise'].map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="submit" className="btn w-full" disabled={saving}>
          {saving ? 'Saving...' : saved ? '✓ System Settings Saved!' : 'Save System Settings'}
        </button>
      </form>
    </div>
  );
}
