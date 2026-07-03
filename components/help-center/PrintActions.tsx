'use client';

export function PrintActions() {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      >
        Print article
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-black"
      >
        Download PDF
      </button>
    </div>
  );
}
