'use client';

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
    console.error('Critical Global Error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
          <div className="max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
            <div className="mb-4 text-6xl">💥</div>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">Critical Error</h2>
            <p className="mb-6 text-gray-600">
              Something went very wrong. Please refresh the page.
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={reset}
                className="rounded-lg border border-blue-600 bg-white px-6 py-2 text-blue-600 hover:bg-blue-50"
              >
                Try Reset
              </button>
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
