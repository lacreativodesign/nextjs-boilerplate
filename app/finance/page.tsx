"use client";

import { useEffect, useState } from "react";

export default function FinanceOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/finance/overview")
      .then((res) => res.json())
      .then((data) => {
        setData(data.overview || {});
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="card p-6">Loading...</div>;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="section-title mb-4">USD Performance</h3>
        <div className="kpis">
          <div className="card">
            <div className="helper-text mb-2">Total Revenue (This Month)</div>
            <div className="text-3xl font-bold">$1,217.00</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Paid invoices</div>
          </div>

          <div className="card">
            <div className="helper-text mb-2">Outstanding Invoices</div>
            <div className="text-3xl font-bold">$0.00</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Sent / overdue</div>
          </div>

          <div className="card">
            <div className="helper-text mb-2">Payments Received</div>
            <div className="text-3xl font-bold">$0.00</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">This month</div>
          </div>

          <div className="card">
            <div className="helper-text mb-2">AR Aging</div>
            <div className="text-3xl font-bold">$0.00</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Total outstanding</div>
          </div>
        </div>
      </section>
    </div>
  );
}
