'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api/client';

type Meeting = {
  id: string;
  status: 'scheduled' | 'canceled' | 'rescheduled';
  title: string;
  startTime: string;
  endTime: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  cancelUrl: string | null;
  projectTaskId: string | null;
};

type Props = {
  prefillName?: string;
  prefillEmail?: string;
  widgetUrl?: string | null;
};

export default function CalendlyMeetingCenter({ prefillEmail, prefillName, widgetUrl }: Props) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const embedUrl = useMemo(() => {
    const base = widgetUrl || process.env.NEXT_PUBLIC_CALENDLY_WIDGET_URL || '';
    if (!base) return '';
    const url = new URL(base);
    if (prefillName) url.searchParams.set('name', prefillName);
    if (prefillEmail) url.searchParams.set('email', prefillEmail);
    return url.toString();
  }, [prefillEmail, prefillName, widgetUrl]);

  const loadMeetings = useCallback(async (sync = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (sync) params.set('sync', 'true');
      const res = await apiFetch(`/api/integrations/calendly/events?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Unable to load meetings.');
      setMeetings(data.events || []);
    } catch (err: any) {
      setError(err.message || 'Unable to load meetings.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void loadMeetings(false);
  }, [loadMeetings]);

  const cancelMeeting = async (meetingId: string) => {
    try {
      const res = await apiFetch('/api/integrations/calendly/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Unable to cancel meeting.');
      await loadMeetings(false);
    } catch (err: any) {
      setError(err.message || 'Unable to cancel meeting.');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Schedule a Meeting</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Book directly via Calendly. Meetings sync into Bizosto tasks automatically.
            </p>
          </div>
        </div>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title="Calendly Booking"
            className="h-[720px] w-full rounded-xl border border-[var(--border)]"
            loading="lazy"
          />
        ) : (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Calendly widget is not configured. Set NEXT_PUBLIC_CALENDLY_WIDGET_URL or integration
            widgetUrl.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--text)]">Meeting Sync Status</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Latest meetings synchronized from Calendly.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--bg-secondary)]"
            disabled={syncing}
            onClick={() => {
              setSyncing(true);
              void loadMeetings(true);
            }}
          >
            {syncing ? 'Syncing...' : 'Sync now'}
          </button>
        </div>

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {loading ? <p className="text-sm text-[var(--text-muted)]">Loading meetings...</p> : null}

        {!loading && !meetings.length ? (
          <p className="text-sm text-[var(--text-muted)]">No meetings synced yet.</p>
        ) : null}

        <div className="space-y-3">
          {meetings.map((meeting) => (
            <article key={meeting.id} className="rounded-lg border border-[var(--border)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--text)]">{meeting.title}</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {new Date(meeting.startTime).toLocaleString()} •{' '}
                    {meeting.inviteeName || meeting.inviteeEmail || 'Unknown invitee'}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                    Status: {meeting.status}
                  </p>
                  {meeting.projectTaskId ? (
                    <p className="text-xs text-[var(--text-muted)]">
                      Task: {meeting.projectTaskId}
                    </p>
                  ) : null}
                </div>
                {meeting.status === 'scheduled' ? (
                  <button
                    type="button"
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                    onClick={() => void cancelMeeting(meeting.id)}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
