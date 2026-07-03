'use client';

import { useState } from 'react';

export function ArticleFeedback() {
  const [selection, setSelection] = useState<'yes' | 'no' | null>(null);

  return (
    <section className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm font-medium text-gray-900">Was this helpful?</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setSelection('yes')}
          className={`rounded-lg px-3 py-1.5 text-sm ${selection === 'yes' ? 'bg-green-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => setSelection('no')}
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
