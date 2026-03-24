'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Invoice = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  periodStart?: string;
  periodEnd?: string;
  pdfUrl?: string | null;
  hostedInvoiceUrl?: string | null;
};

function fmt(v?: string) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(amount);
}

const STATUS_CLASS: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  open: 'bg-amber-100 text-amber-700',
  void: 'bg-[var(--surface-muted)] text-[var(--text-muted)]',
  uncollectible: 'bg-red-100 text-red-700',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing/invoices', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setInvoices(d.invoices || []);
        else setError(d.error || 'Failed to load invoices');
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="tabs-bar">
        <Link href="/billing" className="tab-pill">Subscription</Link>
        <Link href="/billing/invoices" className="tab-pill active">Invoice History</Link>
        <Link href="/billing/terminal" className="tab-pill">Payment Terminal</Link>
      </div>

      <div className="mb-6">
        <h1 className="page-title">Invoice History</h1>
        <p className="page-subtitle">
          Your Bizosto subscription billing history. Download PDF copies of any invoice.
        </p>
      </div>

      {loading && (
        <div className="card p-6 text-sm text-[var(--text-muted)]">
          Loading invoices…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && invoices.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-sm font-medium text-[var(--text-muted)]">
            No invoices yet
          </p>
          <p className="mt-1 text-xs text-[var(--text-soft)]">
            Your Bizosto invoices will appear here after your first billing cycle.
          </p>
        </div>
      )}

      {!loading && !error && invoices.length > 0 && (
        <div className="table-shell">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Date</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Period</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Amount</th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Status</th>
                <th className="p-3 text-right text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Download</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-[var(--border-subtle)]">
                  <td className="p-3 text-[var(--text-primary)]">{fmt(inv.createdAt)}</td>
                  <td className="p-3 text-[var(--text-muted)]">
                    {inv.periodStart && inv.periodEnd
                      ? `${fmt(inv.periodStart)} – ${fmt(inv.periodEnd)}`
                      : '—'}
                  </td>
                  <td className="p-3 font-semibold text-[var(--text-primary)]">
                    {money(inv.amount, inv.currency)}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                        STATUS_CLASS[inv.status] ?? 'bg-[var(--surface-muted)] text-[var(--text-muted)]'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    {inv.pdfUrl ? (
                      <a
                        href={inv.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn ghost"
                        style={{ fontSize: 12, padding: '4px 12px' }}
                      >
                        PDF ↓
                      </a>
                    ) : inv.hostedInvoiceUrl ? (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn ghost"
                        style={{ fontSize: 12, padding: '4px 12px' }}
                      >
                        View ↗
                      </a>
                    ) : (
                      <span className="text-xs text-[var(--text-muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
