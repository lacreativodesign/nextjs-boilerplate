'use client';

import { useEffect, useMemo, useState } from 'react';
import { SettingsAlert } from './_components/SettingsAlert';
import { apiFetch } from '@/lib/api/client';

const WORKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type SystemSettings = {
  companyName: string;
  timezone: string;
  dateFormat: string;
  workingDays: string[];
  workingHours: { start: string; end: string };
  currency: string;
  fiscalMonthStart: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

const DEFAULT_SETTINGS: SystemSettings = {
  companyName: '',
  timezone: '',
  dateFormat: '',
  workingDays: [],
  workingHours: { start: '', end: '' },
  currency: 'USD',
  fiscalMonthStart: 1,
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const disabled = useMemo(() => !canEdit || loading || saving, [canEdit, loading, saving]);

  const loadSettings = async () => {
    try {
      setError(null);
      const res = await apiFetch('/api/admin/settings/system', {
        cache: 'no-store',
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error('You do not have access.');
        if (res.status === 401) throw new Error('Please sign in again.');
        throw new Error(data?.error || 'Failed to load settings.');
      }

      setSettings({
        ...DEFAULT_SETTINGS,
        ...data.settings,
        currency: data.settings?.revenueCurrency || data.settings?.currency || 'USD',
      });
      setCanEdit(Boolean(data.canEdit));
    } catch (err: any) {
      setError(err.message || 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const toggleDay = (day: string) => {
    setSettings((prev) => {
      const days = new Set(prev.workingDays);
      days.has(day) ? days.delete(day) : days.add(day);
      return { ...prev, workingDays: Array.from(days) };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const res = await apiFetch('/api/admin/settings/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Save failed.');
      }

      setSuccess('System settings updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      {!canEdit && !loading && (
        <SettingsAlert tone="info">
          <strong>Read-only access</strong>
          <p className="text-sm opacity-70">Only Super Admins can edit system settings.</p>
        </SettingsAlert>
      )}

      <section className="card p-5 rounded-xl settings-section">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-base">General System Settings</h3>
            <p className="text-sm opacity-70">Global defaults used across the ERP.</p>
          </div>

          <button className="btn subtle rounded-full" onClick={handleSave} disabled={disabled}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="settings-divider" />

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Company Name</label>
            <input
              className="input mt-2"
              placeholder="Company Name"
              value={settings.companyName}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              disabled={disabled}
            />
            <p className="helper-text mt-2">Used in invoices, reports, and exports.</p>
          </div>

          <div>
            <label className="text-sm font-medium">Timezone</label>
            <select
              id="timezone"
              className="input mt-2"
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              disabled={disabled}
            >
              <option value="">— Select timezone —</option>
              {[
                'Pacific/Honolulu',
                'America/Anchorage',
                'America/Los_Angeles',
                'America/Denver',
                'America/Chicago',
                'America/New_York',
                'America/Sao_Paulo',
                'Atlantic/Reykjavik',
                'Europe/London',
                'Europe/Paris',
                'Europe/Berlin',
                'Europe/Madrid',
                'Europe/Rome',
                'Europe/Amsterdam',
                'Africa/Cairo',
                'Asia/Dubai',
                'Asia/Karachi',
                'Asia/Kolkata',
                'Asia/Dhaka',
                'Asia/Bangkok',
                'Asia/Singapore',
                'Asia/Tokyo',
                'Australia/Sydney',
                'Pacific/Auckland',
              ].map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace('_', ' ')}
                </option>
              ))}
            </select>
            <p className="helper-text mt-2">Affects scheduling across modules.</p>
          </div>

          <div>
            <label className="text-sm font-medium">Date Format</label>
            <select
              id="dateFormat"
              className="input mt-2"
              value={settings.dateFormat}
              onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value })}
              disabled={disabled}
            >
              <option value="">— Select format —</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY (EU)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
              <option value="DD MMM YYYY">DD MMM YYYY (e.g. 10 Jan 2026)</option>
              <option value="MMM DD, YYYY">MMM DD, YYYY (e.g. Jan 10, 2026)</option>
            </select>
            <p className="helper-text mt-2">Controls date display throughout the app.</p>
          </div>

          <div>
            <label className="text-sm font-medium">Base Currency</label>
            <select
              id="currency"
              className="input mt-2"
              value={settings.currency}
              onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
              disabled={disabled}
            >
              {[
                { code: 'USD', label: 'USD — US Dollar ($)' },
                { code: 'EUR', label: 'EUR — Euro (€)' },
                { code: 'GBP', label: 'GBP — British Pound (£)' },
                { code: 'CAD', label: 'CAD — Canadian Dollar (CA$)' },
                { code: 'AUD', label: 'AUD — Australian Dollar (A$)' },
                { code: 'CHF', label: 'CHF — Swiss Franc (Fr)' },
                { code: 'JPY', label: 'JPY — Japanese Yen (¥)' },
                { code: 'CNY', label: 'CNY — Chinese Yuan (¥)' },
                { code: 'INR', label: 'INR — Indian Rupee (₹)' },
                { code: 'AED', label: 'AED — UAE Dirham (د.إ)' },
                { code: 'SAR', label: 'SAR — Saudi Riyal (﷼)' },
                { code: 'SGD', label: 'SGD — Singapore Dollar (S$)' },
                { code: 'MYR', label: 'MYR — Malaysian Ringgit (RM)' },
                { code: 'ZAR', label: 'ZAR — South African Rand (R)' },
                { code: 'BRL', label: 'BRL — Brazilian Real (R$)' },
                { code: 'MXN', label: 'MXN — Mexican Peso (Mex$)' },
                { code: 'NGN', label: 'NGN — Nigerian Naira (₦)' },
                { code: 'EGP', label: 'EGP — Egyptian Pound (E£)' },
              ].map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            <p className="helper-text mt-2">
              Applied to all revenue, expenses, invoices, and reports.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Fiscal Month Start</label>
            <input
              className="input mt-2"
              type="number"
              min={1}
              max={12}
              value={settings.fiscalMonthStart}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  fiscalMonthStart: Number(e.target.value),
                })
              }
              disabled={disabled}
            />
            <p className="helper-text mt-2">Aligns reporting periods to your fiscal year.</p>
          </div>
        </div>

        <div className="settings-divider" />

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="font-medium mb-2">Working Days</div>
            <div className="grid grid-cols-2 gap-2">
              {WORKING_DAYS.map((day) => (
                <label key={day} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={settings.workingDays.includes(day)}
                    onChange={() => toggleDay(day)}
                    disabled={disabled}
                  />
                  {day}
                </label>
              ))}
            </div>
            <p className="helper-text mt-2">Used for SLA and workflow planning.</p>
          </div>

          <div>
            <div className="font-medium mb-2">Working Hours</div>
            <div className="grid grid-cols-2 gap-3">
              <input
                className="input"
                type="time"
                value={settings.workingHours.start}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    workingHours: {
                      ...settings.workingHours,
                      start: e.target.value,
                    },
                  })
                }
                disabled={disabled}
              />
              <input
                className="input"
                type="time"
                value={settings.workingHours.end}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    workingHours: {
                      ...settings.workingHours,
                      end: e.target.value,
                    },
                  })
                }
                disabled={disabled}
              />
            </div>
            <p className="helper-text mt-2">Controls default working window visibility.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
