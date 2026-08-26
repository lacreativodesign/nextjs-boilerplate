export default function FinanceARPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">AR Aging</h1>
        <p className="page-subtitle mt-2">Receivables grouped by how long they have been open.</p>
      </div>

      <div className="card p-5">
        <p className="text-sm text-ink-muted">
          Ageing buckets (0&ndash;30, 31&ndash;60, 61&ndash;90, 90+ days) are not built yet.
        </p>
      </div>
    </div>
  );
}
