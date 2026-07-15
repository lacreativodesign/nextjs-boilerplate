'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api/client';

/**
 * S13: super_admin maintenance console.
 *
 * The tenant-repair backfills had no execution path. They were shipped only as CLI scripts,
 * and Bizosto is operated entirely through Claude Code and the browser — no terminal, no
 * local machine — so they could never actually be run. This page gives them one.
 *
 * Every job is run as a DRY RUN first. The dry run reports exactly what would change and
 * writes nothing; applying the repair is a separate, explicit action.
 */
type JobKey = 'files' | 'hr_documents' | 'all';

type BackfillResult = {
  ok?: boolean;
  job?: string;
  dryRun?: boolean;
  error?: string;
  results?: {
    files?: { scanned: number; updated: number; skippedNoProject: number; dryRun: boolean };
    hrDocuments?: { scanned: number; updated: number; skippedNoEmployee: number; dryRun: boolean };
  };
};

const JOBS: { key: JobKey; title: string; desc: string }[] = [
  {
    key: 'files',
    title: 'File records',
    desc: 'Project, AM and client file records written without a tenantId are invisible to their own tenant’s file list and to storage accounting. The tenant is derived from each file’s parent project.',
  },
  {
    key: 'hr_documents',
    title: 'HR documents',
    desc: 'Employee documents uploaded through the admin HR screen were written without a tenantId, so they never appeared in the HR document list. The tenant is derived from each document’s employee.',
  },
  {
    key: 'all',
    title: 'Both jobs',
    desc: 'Run the file-record and HR-document repairs together.',
  },
];

export default function SuperAdminMaintenancePage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastDryRun, setLastDryRun] = useState<JobKey | null>(null);

  async function run(job: JobKey, dryRun: boolean) {
    if (!dryRun) {
      const confirmed = window.confirm(
        `Apply the "${job}" repair to production data?\n\nThis writes a tenantId onto every record that is currently missing one. It only touches records that are missing a tenant, and it never guesses — a record whose owner cannot be resolved is skipped.`,
      );
      if (!confirmed) return;
    }

    setBusy(`${job}:${dryRun ? 'dry' : 'apply'}`);
    setError(null);
    setResult(null);

    try {
      const res = await apiFetch('/api/super_admin/maintenance/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job, dryRun }),
      });
      const payload = (await res.json().catch(() => null)) as BackfillResult | null;

      if (!res.ok || !payload?.ok) {
        setError(payload?.error || `Request failed (${res.status})`);
        return;
      }

      setResult(payload);
      setLastDryRun(dryRun ? job : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Maintenance</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          One-off data repairs. Always run a dry run first — it reports exactly what would
          change and writes nothing. These jobs are idempotent and safe to re-run.
        </p>
      </header>

      <section className="mt-6 space-y-4">
        {JOBS.map((job) => (
          <article
            key={job.key}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5"
          >
            <h2 className="text-base font-bold text-[var(--text-primary)]">{job.title}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{job.desc}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => run(job.key, true)}
                disabled={busy !== null}
                className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-50"
              >
                {busy === `${job.key}:dry` ? 'Checking…' : 'Dry run'}
              </button>
              <button
                type="button"
                onClick={() => run(job.key, false)}
                disabled={busy !== null || lastDryRun !== job.key}
                title={
                  lastDryRun === job.key
                    ? 'Apply the repair'
                    : 'Run a dry run for this job first'
                }
                className="rounded-full bg-[var(--brand-primary,#6366f1)] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {busy === `${job.key}:apply` ? 'Applying…' : 'Apply repair'}
              </button>
            </div>
          </article>
        ))}
      </section>

      {error && (
        <p className="mt-6 rounded-xl border border-[var(--danger,#dc2626)] p-4 text-sm font-semibold text-[var(--danger,#dc2626)]">
          {error}
        </p>
      )}

      {result && (
        <section className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-5">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            {result.dryRun ? 'Dry run — nothing was written' : 'Repair applied'}
          </h2>

          {result.results?.files && (
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              <strong className="text-[var(--text-primary)]">File records:</strong>{' '}
              scanned {result.results.files.scanned}, {result.dryRun ? 'would repair' : 'repaired'}{' '}
              {result.results.files.updated}, skipped {result.results.files.skippedNoProject}{' '}
              (project could not be resolved).
            </p>
          )}

          {result.results?.hrDocuments && (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              <strong className="text-[var(--text-primary)]">HR documents:</strong>{' '}
              scanned {result.results.hrDocuments.scanned},{' '}
              {result.dryRun ? 'would repair' : 'repaired'} {result.results.hrDocuments.updated},
              skipped {result.results.hrDocuments.skippedNoEmployee} (employee could not be
              resolved).
            </p>
          )}

          {(() => {
            // S25: make a skipped-only / clean result legible. "repaired 0, skipped N" is the
            // correct, safe outcome when a record's owner no longer exists — the job refuses to
            // guess a tenant. Without this line it reads like nothing happened, so people press
            // Dry run / Apply repeatedly expecting the numbers to change. They never will.
            const files = result.results?.files;
            const hr = result.results?.hrDocuments;
            const totalToRepair = (files?.updated ?? 0) + (hr?.updated ?? 0);
            const totalSkipped =
              (files?.skippedNoProject ?? 0) + (hr?.skippedNoEmployee ?? 0);
            const totalScanned = (files?.scanned ?? 0) + (hr?.scanned ?? 0);

            if (totalScanned === 0) {
              return (
                <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                  Nothing to repair — no records are missing a tenant. This is the healthy
                  state; you don’t need to run this again.
                </p>
              );
            }

            if (result.dryRun && totalToRepair > 0) {
              return (
                <p className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                  Review the numbers above, then press “Apply repair”.
                </p>
              );
            }

            if (totalToRepair === 0 && totalSkipped > 0) {
              return (
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  <strong className="text-[var(--text-primary)]">Nothing more to do.</strong>{' '}
                  The {totalSkipped === 1 ? 'record' : `${totalSkipped} records`} that could not
                  be repaired {totalSkipped === 1 ? 'is' : 'are'} orphaned — the owning project or
                  employee no longer exists, so there is no tenant to assign. The job deliberately
                  skips {totalSkipped === 1 ? 'it' : 'them'} rather than guess. Running this again
                  will keep reporting the same number; that is expected, not an error.
                </p>
              );
            }

            if (!result.dryRun && totalToRepair > 0) {
              return (
                <p className="mt-3 text-sm font-semibold text-green-600 dark:text-green-400">
                  Done. {totalToRepair} {totalToRepair === 1 ? 'record was' : 'records were'}
                  {' '}repaired.
                </p>
              );
            }

            return null;
          })()}
        </section>
      )}
    </main>
  );
}
