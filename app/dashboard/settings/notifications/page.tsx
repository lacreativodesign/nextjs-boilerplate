'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { USER_NOTIFICATION_CHANNELS } from '@/lib/notifications/preferences-config';
import type { UserNotificationEventType, UserNotificationPreferences } from '@/types/notifications';

const GROUPS: Record<string, UserNotificationEventType[]> = {
  Invoices: ['invoice_sent', 'invoice_paid', 'invoice_overdue'],
  Tasks: ['task_assigned', 'task_due_soon', 'task_completed'],
  Projects: ['project_status_changed', 'project_milestone_reached'],
  Approvals: ['approval_pending', 'approval_approved', 'approval_rejected'],
  Leave: ['leave_request_submitted', 'leave_request_approved'],
  System: ['system_maintenance', 'system_updates'],
};

const FREQUENCIES = ['instant', 'hourly', 'daily', 'weekly'] as const;

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function NotificationSettingsPage() {
  const [preferences, setPreferences] = useState<UserNotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const response = await apiFetch('/api/users/notifications/preferences', {
        cache: 'no-store',
      });
      const data = await response.json();
      setPreferences(data.preferences);
      setLoading(false);
    };
    run();
  }, []);

  const digestPreview = useMemo(() => {
    if (!preferences) return '';
    const daily = preferences.digest.enabled && preferences.digest.frequencies.includes('daily');
    const weekly = preferences.digest.enabled && preferences.digest.frequencies.includes('weekly');
    return [
      daily ? `Daily digest at ${preferences.digest.dailySendTime}` : null,
      weekly
        ? `Weekly digest on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][preferences.digest.weeklySendDay]} ${preferences.digest.weeklySendTime}`
        : null,
    ]
      .filter(Boolean)
      .join(' • ');
  }, [preferences]);

  const save = async () => {
    if (!preferences) return;
    setSaving(true);
    setError(null);
    const response = await apiFetch('/api/users/notifications/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences),
    });

    if (!response.ok) {
      setError('Failed to save notification preferences.');
    }
    setSaving(false);
  };

  const sendTest = async () => {
    setTesting(true);
    setError(null);
    const response = await apiFetch('/api/users/notifications/test', { method: 'POST' });
    if (!response.ok) {
      setError('Failed to send test notification.');
    }
    setTesting(false);
  };

  if (loading || !preferences) {
    return <div className="p-6">Loading notification preferences...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Notification Preferences</h1>
        <p className="text-sm text-gray-500">
          Control channels, event types, digest mode, and quiet hours.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-medium">Global Channels</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {USER_NOTIFICATION_CHANNELS.map((channel) => {
            const key = channel === 'in_app' ? 'inApp' : channel;
            return (
              <label key={channel} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={preferences.channels[key]}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      channels: {
                        ...preferences.channels,
                        [key]: event.target.checked,
                      },
                    })
                  }
                />
                <span>{titleCase(channel)}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-medium">Event Preferences</h2>
        {Object.entries(GROUPS).map(([group, events]) => (
          <div key={group} className="mb-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {group}
            </h3>
            <div className="space-y-2">
              {events.map((eventType) => {
                const config = preferences.eventPreferences[eventType];
                return (
                  <div key={eventType} className="rounded border p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{titleCase(eventType)}</p>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={(event) =>
                            setPreferences({
                              ...preferences,
                              eventPreferences: {
                                ...preferences.eventPreferences,
                                [eventType]: { ...config, enabled: event.target.checked },
                              },
                            })
                          }
                        />
                        Enabled
                      </label>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="flex flex-wrap gap-3">
                        {USER_NOTIFICATION_CHANNELS.map((channel) => (
                          <label
                            key={`${eventType}-${channel}`}
                            className="flex items-center gap-1 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={config.channels.includes(channel)}
                              onChange={(event) => {
                                const channels = event.target.checked
                                  ? Array.from(new Set([...config.channels, channel]))
                                  : config.channels.filter((item) => item !== channel);
                                setPreferences({
                                  ...preferences,
                                  eventPreferences: {
                                    ...preferences.eventPreferences,
                                    [eventType]: { ...config, channels },
                                  },
                                });
                              }}
                            />
                            {titleCase(channel)}
                          </label>
                        ))}
                      </div>
                      <select
                        className="rounded border px-2 py-1 text-sm"
                        value={config.frequency}
                        onChange={(event) =>
                          setPreferences({
                            ...preferences,
                            eventPreferences: {
                              ...preferences.eventPreferences,
                              [eventType]: {
                                ...config,
                                frequency: event.target.value as (typeof FREQUENCIES)[number],
                              },
                            },
                          })
                        }
                      >
                        {FREQUENCIES.map((frequency) => (
                          <option key={`${eventType}-${frequency}`} value={frequency}>
                            {titleCase(frequency)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-medium">Digest Settings</h2>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={preferences.digest.enabled}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                digest: { ...preferences.digest, enabled: event.target.checked },
              })
            }
          />
          Enable digest emails
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-gray-500">Daily send time</label>
            <input
              type="time"
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              value={preferences.digest.dailySendTime}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  digest: { ...preferences.digest, dailySendTime: event.target.value },
                })
              }
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Weekly schedule</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <select
                className="rounded border px-2 py-1 text-sm"
                value={preferences.digest.weeklySendDay}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    digest: {
                      ...preferences.digest,
                      weeklySendDay: Number(event.target.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
                    },
                  })
                }
              >
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                  (day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ),
                )}
              </select>
              <input
                type="time"
                className="rounded border px-2 py-1 text-sm"
                value={preferences.digest.weeklySendTime}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    digest: { ...preferences.digest, weeklySendTime: event.target.value },
                  })
                }
              />
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">Digest preview: {digestPreview || 'Disabled'}</p>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-medium">Do Not Disturb</h2>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={preferences.quietHours.enabled}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                quietHours: { ...preferences.quietHours, enabled: event.target.checked },
              })
            }
          />
          Enable quiet hours
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="time"
            className="rounded border px-2 py-1 text-sm"
            value={preferences.quietHours.start}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                quietHours: { ...preferences.quietHours, start: event.target.value },
              })
            }
          />
          <input
            type="time"
            className="rounded border px-2 py-1 text-sm"
            value={preferences.quietHours.end}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                quietHours: { ...preferences.quietHours, end: event.target.value },
              })
            }
          />
          <input
            type="text"
            className="rounded border px-2 py-1 text-sm"
            value={preferences.quietHours.timezone}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                quietHours: { ...preferences.quietHours, timezone: event.target.value },
              })
            }
            placeholder="Timezone"
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white"
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save preferences'}
        </button>
        <button className="rounded border px-4 py-2" onClick={sendTest} disabled={testing}>
          {testing ? 'Sending...' : 'Send test notification'}
        </button>
      </div>
    </div>
  );
}
