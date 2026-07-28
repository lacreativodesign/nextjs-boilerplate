'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

type JobRecord = {
  id: string;
  type: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

type JobsResponse = {
  ok: boolean;
  jobs: JobRecord[];
  metrics: { pending: number; processing: number; completed: number; failed: number };
  error?: string;
};

const STATUS_OPTIONS: Array<{ label: string; value: '' | JobStatus }> = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Processing', value: 'processing' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
];

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [metrics, setMetrics] = useState({ pending: 0, processing: 0, completed: 0, failed: 0 });
  const [status, setStatus] = useState<'' | JobStatus>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const loadJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      params.set('limit', '200');

      const response = await apiFetch(`/api/admin/jobs?${params.toString()}`, {
        method: 'GET',
        cache: 'no-store',
      });

      const json = (await response.json()) as JobsResponse;
      if (!response.ok || !json.ok) {
        throw new Error(json.error || 'Unable to load job dashboard.');
      }

      setJobs(json.jobs || []);
      setMetrics(json.metrics);
    } catch (err: any) {
      setError(err?.message || 'Unable to load job dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
    const id = setInterval(loadJobs, 15000);
    return () => clearInterval(id);
  }, [status]);

  const failedJobs = useMemo(() => jobs.filter((job) => job.status === 'failed'), [jobs]);

  const retryJob = async (jobId: string) => {
    setRetrying(jobId);
    setError(null);
    try {
      const response = await apiFetch(`/api/admin/jobs/${jobId}/retry`, {
        method: 'POST',
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error || 'Retry failed.');
      }
      await loadJobs();
    } catch (err: any) {
      setError(err?.message || 'Retry failed.');
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Background Job Monitoring</h1>
        <p style={{ fontSize: 14, opacity: 0.75 }}>
          Track queue throughput, failed jobs, retries, and execution history.
        </p>
      </section>

      {error && (
        <div
          className="card"
          style={{
            borderColor: 'var(--danger-border-soft)',
            color: 'var(--alert-error-text-dark)',
          }}
        >
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Pending" value={metrics.pending} />
        <MetricCard label="Processing" value={metrics.processing} />
        <MetricCard label="Completed" value={metrics.completed} />
        <MetricCard label="Failed" value={metrics.failed} />
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Job History</h2>
          <div className="flex gap-2">
            <select
              className="input"
              value={status}
              onChange={(event) => setStatus(event.target.value as '' | JobStatus)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button className="btn" type="button" onClick={loadJobs} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="min-w-full text-sm">
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th className="py-2 pr-3">Job ID</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Attempts</th>
                <th className="py-2 pr-3">Scheduled</th>
                <th className="py-2 pr-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="py-2 pr-3" style={{ fontFamily: 'monospace' }}>
                    {job.id}
                  </td>
                  <td className="py-2 pr-3">{job.type}</td>
                  <td className="py-2 pr-3">{job.status}</td>
                  <td className="py-2 pr-3">
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td className="py-2 pr-3">
                    {job.scheduledAt ? new Date(job.scheduledAt).toLocaleString() : '-'}
                  </td>
                  <td className="py-2 pr-3">{new Date(job.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
              {!jobs.length && (
                <tr>
                  <td className="py-3" colSpan={6}>
                    No jobs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Failed Jobs</h2>
        {!failedJobs.length ? (
          <div style={{ opacity: 0.7 }}>No failed jobs.</div>
        ) : (
          <div className="space-y-2">
            {failedJobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-red-400/40 p-3"
              >
                <div>
                  <div style={{ fontFamily: 'monospace', fontSize: 13 }}>{job.id}</div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    {job.lastError || 'Unknown error'}
                  </div>
                </div>
                <button
                  className="btn"
                  type="button"
                  disabled={retrying === job.id}
                  onClick={() => retryJob(job.id)}
                >
                  {retrying === job.id ? 'Retrying...' : 'Retry'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard(props: { label: string; value: number }) {
  return (
    <div className="card">
      <div style={{ fontSize: 13, opacity: 0.7 }}>{props.label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{props.value}</div>
    </div>
  );
}
