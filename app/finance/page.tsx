export default function FinanceOverviewPage() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="section-title mb-4">USD Performance</h2>
        <div className="kpis">
          <div className="card">
            <div className="helper-text mb-2">Total Revenue (This Month)</div>
            <div className="text-3xl font-bold">$1,217.00</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">Paid invoices</div>
          </div>

          <div className="card">
            <div className="helper-text mb-2">Outstanding Invoices</div>
            <div className="text-3xl font-bold">$0.00</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">Sent / overdue</div>
          </div>

          <div className="card">
            <div className="helper-text mb-2">Payments Received</div>
            <div className="text-3xl font-bold">$0.00</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">This month</div>
          </div>

          <div className="card">
            <div className="helper-text mb-2">AR Aging</div>
            <div className="text-3xl font-bold">$0.00</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">Total outstanding</div>
          </div>
        </div>
      </section>
    </div>
  );
}
