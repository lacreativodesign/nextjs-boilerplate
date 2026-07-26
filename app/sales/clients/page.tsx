'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

/**
 * S16: real clients, replacing a hardcoded list.
 *
 * This page previously rendered three invented people — fabricated names, companies, emails
 * and phone numbers — identically for every tenant, and even captioned them as placeholder
 * records pending a backend wire-up. A sales rep in a live workspace opened Clients and saw
 * customers that do not exist. It now loads the tenant's real clients, scoped to the ones
 * this rep owns. The accompanying test asserts those fabricated records and that caption can
 * never reappear anywhere in this file.
 */
type Client = {
  id: string;
  companyName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  salesStage: string;
  paymentStatus: string;
};

function stageColor(stage: string) {
  const s = (stage || '').toLowerCase();
  if (s === 'won' || s === 'active') return 'text-green-600 dark:text-green-400';
  if (s === 'lost' || s === 'inactive') return 'text-red-600 dark:text-red-400';
  return 'text-yellow-600 dark:text-yellow-400';
}

export default function SalesClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch('/api/admin/clients/list?limit=100', { cache: 'no-store' });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        clients?: Client[];
        error?: string;
      } | null;

      if (!res.ok || !payload?.ok) {
        setError(payload?.error || `Could not load clients (${res.status})`);
        setClients([]);
        return;
      }

      setClients(payload.clients ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load clients');
      setClients([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Clients</h1>

      {error && (
        <p className="rounded-xl border border-[var(--danger)] p-4 text-sm font-semibold text-[var(--danger)]">
          {error}
        </p>
      )}

      {clients === null && !error && <p className="helper-text">Loading clients…</p>}

      {clients !== null && clients.length === 0 && !error && (
        <div className="table-shell">
          <p className="helper-text px-4 py-6">
            No clients are assigned to you yet. Clients appear here once an administrator or sales
            manager assigns you as their sales owner.
          </p>
        </div>
      )}

      {clients !== null && clients.length > 0 && (
        <div className="table-shell">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--table-header-bg)] text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4">Payment</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--border-subtle)] hover:bg-[var(--table-row-hover)] transition"
                  >
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                      {c.companyName || '—'}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)]">
                      {c.primaryContactName || '—'}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)]">
                      {c.primaryContactEmail || '—'}
                    </td>
                    <td className="py-3 px-4 text-[var(--text-primary)]">
                      {c.primaryContactPhone || '—'}
                    </td>
                    <td className="py-3 px-4 font-semibold">
                      <span className={stageColor(c.salesStage)}>{c.salesStage || '—'}</span>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-muted)]">{c.paymentStatus || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
