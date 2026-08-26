'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatDate, formatUsd } from '@/components/finance/financeUtils';
import MasterSelect from '@/components/ui/MasterSelect';
import {
  CardShell,
  ErrorCard,
  KpiCard,
  MiniBarChart,
  useSortableData,
} from '../_components/ReportsUI';
import { CurrencyConverter } from '@/components/currency/CurrencyConverter';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';

type RevenueResponse = {
  revenueByMonth: Array<{ label: string; revenueUsd: number }>;
  paymentsByMonth: Array<{ label: string; paymentsUsd: number }>;
  arAging: Array<{ label: string; amountUsd: number }>;
  topClientsByRevenue: Array<{ clientId: string; clientName: string; totalUsd: number }>;
  outstandingInvoices: Array<{
    id: string;
    orderId: string;
    clientId: string;
    clientName: string;
    amountTotalUsd: number;
    dueDate?: string | null;
    status: string;
    updatedAt?: string | null;
  }>;
};

type ClientOption = { label: string; value: string };

const STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  { label: 'Draft', value: 'Draft' },
  { label: 'Sent', value: 'Sent' },
  { label: 'Paid', value: 'Paid' },
  { label: 'Void', value: 'Void' },
];

const emptyResponse: RevenueResponse = {
  revenueByMonth: [],
  paymentsByMonth: [],
  arAging: [],
  topClientsByRevenue: [],
  outstandingInvoices: [],
};

export default function RevenueReportsPage() {
  const [data, setData] = useState<RevenueResponse>(emptyResponse);
  const [clients, setClients] = useState<ClientOption[]>([{ label: 'All Clients', value: '' }]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] =
    useState<keyof RevenueResponse['outstandingInvoices'][number]>('dueDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const loadClients = async () => {
    try {
      const res = await fetch('/api/admin/clients/list', {
        cache: 'no-store',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) return;
      const options = Array.isArray(json.clients)
        ? json.clients.map((client: any) => ({
            label: client.companyName || client.name || 'Client',
            value: client.id,
          }))
        : [];
      setClients([{ label: 'All Clients', value: '' }, ...options]);
    } catch (err) {
      console.warn('reports revenue clients load error', err);
    }
  };

  const loadRevenue = async () => {
    try {
      setError(null);
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (clientId) params.set('clientId', clientId);
      if (status) params.set('status', status);

      const res = await fetch(`/api/admin/reports/revenue?${params.toString()}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 403) throw new Error('You do not have access to Admin reports.');
        if (res.status === 401) throw new Error('Please sign in again to view reports.');
        throw new Error(json?.error || 'Unable to load revenue reports.');
      }
      setData(json as RevenueResponse);
    } catch (err: any) {
      console.error('reports revenue load error', err);
      setError('Unable to load revenue reports right now.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    loadRevenue();
  }, [dateFrom, dateTo, clientId, status]);

  const filteredInvoices = useMemo(
    () =>
      smartMatch(data.outstandingInvoices, search, (invoice) => [
        invoice.orderId,
        invoice.clientName,
        invoice.status,
      ]),
    [data.outstandingInvoices, search],
  );

  const sortedInvoices = useSortableData(filteredInvoices, sortKey, sortDirection);

  const toggleSort = (key: keyof RevenueResponse['outstandingInvoices'][number]) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const totalRevenue = data.revenueByMonth.reduce((sum, row) => sum + row.revenueUsd, 0);
  const totalPayments = data.paymentsByMonth.reduce((sum, row) => sum + row.paymentsUsd, 0);
  const outstandingTotal = data.outstandingInvoices.reduce(
    (sum, row) => sum + row.amountTotalUsd,
    0,
  );

  const downloadCsv = (path: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (clientId) params.set('clientId', clientId);
    if (status) params.set('status', status);
    window.open(`${path}?${params.toString()}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Revenue &amp; AR</h1>
        <p className="page-subtitle mt-2">
          Billed revenue, collections, and outstanding receivables.
        </p>
      </div>

      {error && <ErrorCard message={error} />}

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          Revenue & AR KPIs (USD)
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Revenue" value={formatUsd(totalRevenue)} subtitle="Invoices issued" />
          <KpiCard title="Payments" value={formatUsd(totalPayments)} subtitle="Cash received" />
          <KpiCard
            title="Outstanding AR"
            value={formatUsd(outstandingTotal)}
            subtitle="Open invoices"
          />
          <KpiCard
            title="Top Clients"
            value={`${data.topClientsByRevenue.length}`}
            subtitle="By paid revenue"
          />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Filters</div>
            <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
              Sync revenue KPIs with precise time windows.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              onClick={() => downloadCsv('/api/admin/reports/exports/revenue-by-client')}
              style={{ borderRadius: 999 }}
            >
              Download Revenue by Client
            </button>
            <button
              className="btn ghost"
              onClick={() => downloadCsv('/api/admin/reports/exports/payments-by-month')}
              style={{ borderRadius: 999 }}
            >
              Download Payments by Month
            </button>
            <button
              className="btn ghost"
              onClick={() => downloadCsv('/api/admin/reports/exports/outstanding-ar')}
              style={{ borderRadius: 999 }}
            >
              Download Outstanding AR
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            className="input"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <input
            className="input"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <MasterSelect value={clientId} onChange={setClientId} options={clients} />
          <MasterSelect value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <div style={{ flex: '1 1 200px', minWidth: 200 }}>
            <SmartSearchBar value={search} onChange={setSearch} />
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setClientId('');
              setStatus('');
              setSearch('');
            }}
            style={{ borderRadius: 999 }}
          >
            Reset Filters
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Revenue by Month</div>
          <MiniBarChart
            rows={(data.revenueByMonth.length
              ? data.revenueByMonth
              : [{ label: '-', revenueUsd: 0 }]
            ).map((row) => ({
              label: row.label,
              value: row.revenueUsd,
            }))}
            valueFormatter={formatUsd}
          />
        </CardShell>
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Payments by Month</div>
          <MiniBarChart
            rows={(data.paymentsByMonth.length
              ? data.paymentsByMonth
              : [{ label: '-', paymentsUsd: 0 }]
            ).map((row) => ({
              label: row.label,
              value: row.paymentsUsd,
            }))}
            valueFormatter={formatUsd}
          />
        </CardShell>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>AR Aging</div>
          <MiniBarChart
            rows={(data.arAging.length ? data.arAging : [{ label: '-', amountUsd: 0 }]).map(
              (row) => ({
                label: row.label,
                value: row.amountUsd,
              }),
            )}
            valueFormatter={formatUsd}
          />
        </CardShell>
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Top Clients (Paid Revenue)</div>
          <MiniBarChart
            rows={(data.topClientsByRevenue.length
              ? data.topClientsByRevenue
              : [{ clientName: '-', totalUsd: 0 }]
            ).map((row) => ({
              label: row.clientName,
              value: row.totalUsd,
            }))}
            valueFormatter={formatUsd}
          />
        </CardShell>
      </section>

      <section>
        <CurrencyConverter />
      </section>

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Outstanding Invoices</div>
        <div className="card" style={{ padding: 0, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr style={{ background: 'rgba(148,163,184,0.15)' }}>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('orderId')}
                      style={{ background: 'none', border: 'none', fontWeight: 700 }}
                    >
                      Invoice {sortKey === 'orderId' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('clientName')}
                      style={{ background: 'none', border: 'none', fontWeight: 700 }}
                    >
                      Client {sortKey === 'clientName' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontWeight: 700 }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('amountTotalUsd')}
                      style={{ background: 'none', border: 'none', fontWeight: 700 }}
                    >
                      Amount (USD){' '}
                      {sortKey === 'amountTotalUsd' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'right', padding: '14px 16px', fontWeight: 700 }}>
                    <button
                      type="button"
                      onClick={() => toggleSort('dueDate')}
                      style={{ background: 'none', border: 'none', fontWeight: 700 }}
                    >
                      Due Date {sortKey === 'dueDate' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </button>
                  </th>
                  <th style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 700 }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>
                      Loading invoices…
                    </td>
                  </tr>
                ) : sortedInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>
                      No outstanding invoices found.
                    </td>
                  </tr>
                ) : (
                  sortedInvoices.map((invoice, idx) => {
                    const rowBg = idx % 2 === 0 ? 'rgba(15,23,42,0.02)' : 'transparent';
                    return (
                      <tr key={invoice.id} style={{ background: rowBg }}>
                        <td style={{ padding: '14px 16px', textAlign: 'left' }}>
                          {invoice.orderId}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'left' }}>
                          {invoice.clientName}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          {formatUsd(invoice.amountTotalUsd)}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          {formatDate(invoice.dueDate)}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {invoice.status}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
