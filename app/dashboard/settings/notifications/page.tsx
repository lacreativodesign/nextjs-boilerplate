"use client";

import { useEffect, useMemo, useState } from "react";
import type { NotificationCategory, NotificationChannel, NotificationPreferences } from "@/types/notifications";

const categories: NotificationCategory[] = [
  "system",
  "financial",
  "sales",
  "operations",
  "security",
  "team",
  "custom",
];

const channelOptions: { label: string; value: NotificationChannel }[] = [
  { label: "In-App", value: "in_app" },
  { label: "Email", value: "email" },
  { label: "SMS", value: "sms" },
  { label: "Webhook", value: "webhook" },
];

const priorityOptions = ["low", "medium", "high", "urgent"] as const;

type PreferencesState = NotificationPreferences;

function normalizePreferences(preferences: PreferencesState): PreferencesState {
  const updated = { ...preferences };
  categories.forEach((category) => {
    if (!updated.categorySettings?.[category]) {
      updated.categorySettings[category] = {
        enabled: true,
        channels: ["in_app", "email"],
        minPriority: "low",
      };
    }
  });

  if (!updated.quietHours) {
    updated.quietHours = {
      enabled: false,
      start: "22:00",
      end: "08:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    };
  }

  if (!updated.emailDigest) {
    updated.emailDigest = {
      enabled: false,
      frequency: "daily",
      time: "09:00",
    };
  }

  return updated;
}

export default function NotificationSettingsPage() {
  const [preferences, setPreferences] = useState<PreferencesState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchPreferences = async () => {
      const response = await fetch("/api/notifications/preferences");
      const data = await response.json();
      if (!isMounted) return;
      setPreferences(normalizePreferences(data.preferences));
    };

    fetchPreferences();
    return () => {
      isMounted = false;
    };
  }, []);

  const categorySettings = useMemo(() => preferences?.categorySettings || null, [preferences]);

  const updateChannelToggle = (channel: "inApp" | "email" | "sms", value: boolean) => {
    if (!preferences) return;
    setPreferences({
      ...preferences,
      channels: { ...preferences.channels, [channel]: value },
    });
  };

  const updateCategorySetting = (
    category: NotificationCategory,
    updates: Partial<NotificationPreferences["categorySettings"][NotificationCategory]>
  ) => {
    if (!preferences) return;
    setPreferences({
      ...preferences,
      categorySettings: {
        ...preferences.categorySettings,
        [category]: {
          ...preferences.categorySettings[category],
          ...updates,
        },
      },
    });
  };

  const toggleCategoryChannel = (category: NotificationCategory, channel: NotificationChannel, enabled: boolean) => {
    if (!preferences) return;
    const current = preferences.categorySettings[category].channels;
    const next = enabled
      ? Array.from(new Set([...current, channel]))
      : current.filter((item) => item !== channel);
    updateCategorySetting(category, { channels: next });
  };

  const savePreferences = async () => {
    if (!preferences) return;
    setIsSaving(true);
    setError(null);
    try {
      await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      });
    } catch (err) {
      setError("Failed to save preferences.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!preferences || !categorySettings) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Notification Settings</h1>
        <p className="text-sm text-gray-500">Customize your alert channels and quiet hours.</p>
      </div>

      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Global Channels</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.channels.inApp}
              onChange={(event) => updateChannelToggle("inApp", event.target.checked)}
            />
            <span>In-App Notifications</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.channels.email}
              onChange={(event) => updateChannelToggle("email", event.target.checked)}
            />
            <span>Email Notifications</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.channels.sms}
              onChange={(event) => updateChannelToggle("sms", event.target.checked)}
            />
            <span>SMS Notifications</span>
          </label>
        </div>
      </div>

      <div className="mb-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Quiet Hours</h2>
        <label className="mb-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={preferences.quietHours?.enabled || false}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                quietHours: {
                  ...preferences.quietHours,
                  enabled: event.target.checked,
                },
              })
            }
          />
          <span>Enable quiet hours</span>
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm text-gray-500">Start</label>
            <input
              type="time"
              value={preferences.quietHours?.start || "22:00"}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  quietHours: {
                    ...preferences.quietHours,
                    start: event.target.value,
                  },
                })
              }
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">End</label>
            <input
              type="time"
              value={preferences.quietHours?.end || "08:00"}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  quietHours: {
                    ...preferences.quietHours,
                    end: event.target.value,
                  },
                })
              }
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500">Timezone</label>
            <input
              type="text"
              value={preferences.quietHours?.timezone || "UTC"}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  quietHours: {
                    ...preferences.quietHours,
                    timezone: event.target.value,
                  },
                })
              }
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2"
              placeholder="America/New_York"
            />
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Category Settings</h2>
        <div className="space-y-6">
          {categories.map((category) => {
            const settings = categorySettings[category];
            return (
              <div key={category} className="rounded border border-gray-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold capitalize">{category}</h3>
                    <p className="text-xs text-gray-500">Control channels and priority thresholds.</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.enabled}
                      onChange={(event) => updateCategorySetting(category, { enabled: event.target.checked })}
                    />
                    <span>Enabled</span>
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-500">Channels</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {channelOptions.map((channel) => (
                        <label key={channel.value} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={settings.channels.includes(channel.value)}
                            onChange={(event) =>
                              toggleCategoryChannel(category, channel.value, event.target.checked)
                            }
                          />
                          <span>{channel.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Minimum priority</label>
                    <select
                      value={settings.minPriority || "low"}
                      onChange={(event) =>
                        updateCategorySetting(category, {
                          minPriority: event.target.value as NotificationPreferences["categorySettings"][NotificationCategory]["minPriority"],
                        })
                      }
                      className="mt-2 w-full rounded border border-gray-200 px-3 py-2"
                    >
                      {priorityOptions.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={savePreferences}
          disabled={isSaving}
          className="rounded bg-blue-600 px-6 py-2 text-white disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}
