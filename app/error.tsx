'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--surface-muted)] px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 text-6xl">⚠️</div>
        <h1 className="mb-3 text-2xl font-bold text-[var(--text-slate-deep)]">
          Something went wrong
        </h1>
        <p className="mb-8 text-sm text-[var(--color-gray)]">
          An unexpected error occurred. Please try again or return to the dashboard.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-[var(--erp-blue)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--erp-blue-hover)]"
          >
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-[var(--alert-info-text-dark)] bg-white px-6 py-2.5 text-sm font-medium text-[var(--text-slate-deep)] hover:bg-[var(--border-faint)]"
          >
            Go to Dashboard
          </Link>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-[var(--text-soft)]">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
