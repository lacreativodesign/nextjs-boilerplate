'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import * as Sentry from "@sentry/nextjs";

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 text-6xl">⚠️</div>
        <h1 className="mb-3 text-2xl font-bold text-[#1E293B]">Something went wrong</h1>
        <p className="mb-8 text-sm text-[#64748B]">
          An unexpected error occurred. Please try again or return to the dashboard.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-[#2563EB] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#1d4ed8]"
          >
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-[#E2E8F0] bg-white px-6 py-2.5 text-sm font-medium text-[#1E293B] hover:bg-[#F1F5F9]"
          >
            Go to Dashboard
          </Link>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-[#94A3B8]">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
