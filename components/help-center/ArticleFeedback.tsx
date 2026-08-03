'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type ArticleFeedbackProps = {
  categoryId: string;
  slug: string;
};

/**
 * "Was this helpful?" vote. Previously a pure no-op (local state only); it now
 * persists the vote to the help_feedback collection so the help center can be
 * improved from real signal — which articles get thumbs-down, which topics keep
 * generating bug reports no doc covers. Persistence is fire-and-forget: a failed
 * POST must never interrupt someone reading a doc, so the UI optimistically
 * shows the thank-you regardless.
 */
export function ArticleFeedback({ categoryId, slug }: ArticleFeedbackProps) {
  const [selection, setSelection] = useState<'yes' | 'no' | null>(null);

  const record = (helpful: boolean) => {
    setSelection(helpful ? 'yes' : 'no');
    void apiFetch('/api/support/help-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'article', categoryId, slug, helpful }),
    }).catch(() => {
      // Intentionally swallowed — the vote is best-effort telemetry.
    });
  };

  return (
    <section className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-900">Was this helpful?</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => record(true)}
          disabled={selection !== null}
          className={`rounded-lg px-3 py-1.5 text-sm ${selection === 'yes' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => record(false)}
          disabled={selection !== null}
          className={`rounded-lg px-3 py-1.5 text-sm ${selection === 'no' ? 'bg-red-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
        >
          No
        </button>
      </div>
      {selection && (
        <p className="mt-3 text-xs text-gray-500">Thanks. Your feedback helps improve our docs.</p>
      )}
    </section>
  );
}
