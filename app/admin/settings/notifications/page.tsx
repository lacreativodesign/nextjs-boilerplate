'use client';

import { useEffect, useMemo, useState } from 'react';
import { SettingsAlert } from '../_components/SettingsAlert';
import { apiFetch } from '@/lib/api/client';

type NotificationSettings = {
  enableInApp: boolean;
  enableEmail: boolean;
  senderName: string;
  replyToEmail: string;
  eventToggles: Record<string, boolean>;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  enableInApp: true,
  enableEmail: false,
  senderName: '',
  replyToEmail: '',
  eventToggles: {},
};

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [eventInput, setEventInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const disabled = useMemo(() => !canEdit || loading || saving, [canEdit, loading, saving]);

  const loadSettings = async () => {
    try {
      setError(null);
      const res = await apiFetch('/api/admin/settings/notifications', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403) throw new Error('You do not have access to notification settings.');
        if (res.status === 401) throw new Error('Please sign in again to continue.');
        throw new Error(data?.error || 'Unable to load settings.');
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      setCanEdit(Boolean(data.canEdit));
    } catch (err: any) {
      console.error('notification settings load error', err);
      setError(err.message || 'Unable to load notification settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const addEventToggle = () => {
    const key = eventInput.trim();
    if (!key) return;
    setSettings((prev) => ({
      ...prev,
      eventToggles: { ...prev.eventToggles, [key]: true },
    }));
    setEventInput('');
  };

  const removeEventToggle = (key: string) => {
    setSettings((prev) => {
      const next = { ...prev.eventToggles };
      delete next[key];
      return { ...prev, eventToggles: next };
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const res = await apiFetch('/api/admin/settings/notifications', {
        method: 'PUT',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        if (res.status === 403)
          throw new Error('You do not have permission to edit notification settings.');
        throw new Error(data?.error || 'Unable to save settings.');
      }
      setSuccess('Notification settings updated.');
    } catch (err: any) {
      console.error('notification settings save error', err);
      setError(err.message || 'Unable to save notification settings.');
    } finally {
      setSaving(false);
    }
  };

  const eventKeys = useMemo(
    () => Object.keys(settings.eventToggles || {}),
    [settings.eventToggles],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Notifications</h1>
        <p className="page-subtitle mt-2">
          Which events notify which roles, and through which channel.
        </p>
      </div>

      {error && <SettingsAlert tone="error">{error}</SettingsAlert>}
      {success && <SettingsAlert tone="success">{success}</SettingsAlert>}

      {!canEdit && !loading && (
        <SettingsAlert tone="info">
          Only Super Admins can edit notification settings. You have view-only access.
        </SettingsAlert>
      )}

      <section className="card settings-section" style={{ padding: 20, borderRadius: 18 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Notifications & Email</div>
            <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
              Toggle in-app alerts, email sending, and per-event switches.
            </p>
          </div>
          <button
            className="btn subtle"
            onClick={handleSave}
            disabled={disabled}
            style={{ borderRadius: 999 }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="settings-divider" />

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.enableInApp}
              onChange={(e) => setSettings((prev) => ({ ...prev, enableInApp: e.target.checked }))}
              disabled={disabled}
            />
            <span>Enable in-app notifications</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.enableEmail}
              onChange={(e) => setSettings((prev) => ({ ...prev, enableEmail: e.target.checked }))}
              disabled={disabled}
            />
            <span>Enable email notifications</span>
          </label>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Sender Name</span>
            <input
              className="input"
              value={settings.senderName}
              onChange={(e) => setSettings((prev) => ({ ...prev, senderName: e.target.value }))}
              disabled={disabled}
            />
            <span className="helper-text">Used in outbound email headers.</span>
          </label>
          <label className="space-y-2">
            <span style={{ fontSize: 13, fontWeight: 600 }}>Reply-To Email</span>
            <input
              className="input"
              type="email"
              value={settings.replyToEmail}
              onChange={(e) => setSettings((prev) => ({ ...prev, replyToEmail: e.target.value }))}
              disabled={disabled}
            />
            <span className="helper-text">Replies route to the finance or ops inbox.</span>
          </label>
        </div>

        <div className="mt-6">
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Event Toggles</div>
          {eventKeys.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--sidebar-text)' }}>
              No event toggles configured.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {eventKeys.map((key) => (
                <div key={key} className="card" style={{ padding: 12, borderRadius: 12 }}>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span style={{ fontWeight: 600 }}>{key}</span>
                    <input
                      type="checkbox"
                      checked={settings.eventToggles[key]}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          eventToggles: { ...prev.eventToggles, [key]: e.target.checked },
                        }))
                      }
                      disabled={disabled}
                    />
                  </label>
                  {!disabled && (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={() => removeEventToggle(key)}
                      style={{ marginTop: 8, borderRadius: 999 }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="input"
              value={eventInput}
              onChange={(e) => setEventInput(e.target.value)}
              disabled={disabled}
            />
            <button
              className="btn ghost"
              type="button"
              onClick={addEventToggle}
              disabled={disabled}
              style={{ borderRadius: 999 }}
            >
              Add
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
