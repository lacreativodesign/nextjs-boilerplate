"use client";

import { useEffect } from "react";
import { logError } from "@/lib/logging";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    logError(error, { route: "app/global-error", metadata: { digest: error.digest } });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <div className="text-2xl font-semibold">We ran into a critical error</div>
          <p className="mt-2 text-sm text-slate-500">
            Please refresh the page. If the problem continues, contact support.
          </p>
          <a
            href="/"
            className="mt-6 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800"
          >
            Return home
          </a>
        </div>
      </body>
    </html>
  );
}
