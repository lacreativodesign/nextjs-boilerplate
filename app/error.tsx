"use client";

import { useEffect } from "react";
import { logError } from "@/lib/logging";
import { toastError } from "@/lib/toast";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError(error, { route: "app/error", metadata: { digest: error.digest } });
    toastError("Something went wrong. Please try again. If the issue persists, contact support.");
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="text-2xl font-semibold">Something went wrong</div>
      <p className="mt-2 text-sm text-slate-500">
        We encountered an unexpected error. Try again or return to the dashboard.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Go home
        </a>
      </div>
    </div>
  );
}
