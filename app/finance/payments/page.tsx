'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import MasterSelect from '@/components/ui/MasterSelect';
import { formatDate, formatDateTime, formatUsd } from '@/components/finance/financeUtils';
import type { PaymentRecord } from '@/lib/finance/types';
import EmptyState from '@/components/ui/EmptyState';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';
import { apiFetch } from '@/lib/api/client';

const STATUS_OPTIONS = ['', 'Pending', 'Paid', 'Failed', 'Refunded'].map((status) => ({
  label: status || 'All Statuses',
  value: status,
}));

const METHOD_OPTIONS = ['', 'Card', 'Bank', 'Cash', 'PayPal', 'Wise', 'Other'].map((method) => ({
  label: method || 'All Methods',
  value: method,
}));

type ClientOption = { id: string; companyName: string };

type SortKey = 'id' | 'clientName' | 'method' | 'amountUsd' | 'paidAt' | 'createdAt' | 'status';

type SortDir = 'asc' | 'desc';

type CurrentUser = { uid: string; role: string; name?: string };

type ErrorState = { title: string; message: string };

export default function FinancePaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadPayments = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await apiFetch('/api/finance/payments/list', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to load payments.');
      }
      setPayments(data.payments || []);
      setCurrentUser(data.currentUser || null);
    } catch (err: any) {
      console.error('Payments load error', err);
      setError({ title: 'Unable to load payments', message: 'Please try again in a moment.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await apiFetch('/api/finance/clients/list', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.ok) {
        setClients(data.clients || []);
      }
    } catch (err) {
      console.error('Failed to load clients', err);
    }
  }, []);

  useEffect(() => {
    loadPayments();
    loadClients();
  }, [loadPayments, loadClients]);

  const canUpdate = useMemo(() => {
    const role = (currentUser?.role || '').toLowerCase();
    return role === 'finance' || role === 'admin' || role === 'super_admin';
  }, [currentUser?.role]);

  const filteredPayments = useMemo(() => {
    const start = startDate ? new Date(startDate).getTime() : null;
    const end = endDate ? new Date(endDate).getTime() : null;

    const list = payments.filter((payment) => {
      if (statusFilter && payment.status !== statusFilter) return false;
      if (methodFilter && payment.method !== methodFilter) return false;
      if (clientFilter && payment.clientId !== clientFilter) return false;
      const paidAt = payment.paidAt ? new Date(payment.paidAt).getTime() : null;
      if (start && (!paidAt || paidAt < start)) return false;
      if (end && (!paidAt || paidAt > end + 86400000)) return false;
      return true;
    });

    return smartMatch(list, query, (payment) => [
      payment.id,
      payment.clientName,
      payment.method,
      payment.orderId,
    ]);
  }, [payments, query, statusFilter, methodFilter, clientFilter, startDate, endDate]);

  const sortedPayments = useMemo(() => {
    const list = [...filteredPayments];
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'amountUsd') return (a.amountUsd - b.amountUsd) * dir;
      if (sortKey === 'paidAt')
        return String(a.paidAt || '').localeCompare(String(b.paidAt || '')) * dir;
      if (sortKey === 'createdAt')
        return String(a.createdAt || '').localeCompare(String(b.createdAt || '')) * dir;
      return String(a[sortKey] || '').localeCompare(String(b[sortKey] || '')) * dir;
    });
    return list;
  }, [filteredPayments, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const openDrawer = (payment: PaymentRecord) => {
    setSelectedPayment(payment);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedPayment(null);
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDrawer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const handleAction = async (payment: PaymentRecord, action: 'mark_paid') => {
    try {
      setActionLoading(payment.id);
      const res = await apiFetch('/api/finance/payments/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: payment.id, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to update payment.');
      }
      await loadPayments();
    } catch (err) {
      console.error('Payment update error', err);
      setError({ title: 'Unable to update payment', message: 'Please try again.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateNotes = async (payment: PaymentRecord, notes: string) => {
    try {
      setActionLoading(`notes-${payment.id}`);
      const res = await apiFetch('/api/finance/payments/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: payment.id, action: 'update_notes', notes }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to update notes.');
      }
      await loadPayments();
    } catch (err) {
      console.error('Payment notes update error', err);
      setError({ title: 'Unable to update notes', message: 'Please try again.' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      {error && (
        <div className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)] mb-4">
          <div style={{ fontWeight: 700 }}>{error.title}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{error.message}</div>
        </div>
      )}

      <div>
        <h1 className="page-title">Payments</h1>
        <p className="page-subtitle">USD receipts, methods, and settlement status.</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div style={{ flex: '1 1 240px', minWidth: 220 }}>
          <SmartSearchBar value={query} onChange={setQuery} />
        </div>
        <MasterSelect
          value={statusFilter}
          onChange={(value) => setStatusFilter(value)}
          options={STATUS_OPTIONS}
        />
        <MasterSelect
          value={methodFilter}
          onChange={(value) => setMethodFilter(value)}
          options={METHOD_OPTIONS}
        />
        <MasterSelect
          value={clientFilter}
          onChange={(value) => setClientFilter(value)}
          options={[
            { label: 'All Clients', value: '' },
            ...clients.map((c) => ({ label: c.companyName, value: c.id })),
          ]}
        />
        <input
          className="input"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <input
          className="input"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          onClick={() => {
            setQuery('');
            setStatusFilter('');
            setMethodFilter('');
            setClientFilter('');
            setStartDate('');
            setEndDate('');
          }}
          style={{ borderRadius: 999, padding: '10px 16px', fontWeight: 500 }}
        >
          Reset Filters
        </button>
      </div>

      <div className="table-shell">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort('id')} className="table-sort">
                    Payment ID {sortKey === 'id' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                  <button
                    type="button"
                    onClick={() => toggleSort('clientName')}
                    className="table-sort"
                  >
                    Client {sortKey === 'clientName' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort('method')} className="table-sort">
                    Method {sortKey === 'method' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                  <button
                    type="button"
                    onClick={() => toggleSort('amountUsd')}
                    className="table-sort"
                  >
                    Amount (USD) {sortKey === 'amountUsd' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort('paidAt')} className="table-sort">
                    Paid At {sortKey === 'paidAt' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                  <button
                    type="button"
                    onClick={() => toggleSort('createdAt')}
                    className="table-sort"
                  >
                    Created {sortKey === 'createdAt' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th style={{ textAlign: 'left', padding: '14px 16px', fontWeight: 700 }}>
                  <button type="button" onClick={() => toggleSort('status')} className="table-sort">
                    Status {sortKey === 'status' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                  </button>
                </th>
                <th style={{ textAlign: 'center', padding: '14px 16px', fontWeight: 700 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                    Loading payments…
                  </td>
                </tr>
              ) : sortedPayments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 0, border: 'none' }}>
                    <div className="p-6">
                      <EmptyState
                        title="No payments found"
                        description="Payments will appear here once invoices are marked as paid."
                      />
                    </div>
                  </td>
                </tr>
              ) : (
                sortedPayments.map((payment) => {
                  return (
                    <tr key={payment.id}>
                      <td style={{ padding: '14px 16px', textAlign: 'left' }}>{payment.id}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'left' }}>
                        {payment.clientName}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'left' }}>{payment.method}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        {formatUsd(payment.amountUsd)}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        {formatDate(payment.paidAt)}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        {formatDate(payment.createdAt)}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        {renderStatus(payment.status)}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => openDrawer(payment)}
                            style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}
                          >
                            View
                          </button>
                          {canUpdate && payment.status !== 'Paid' && (
                            <button
                              type="button"
                              className="btn"
                              onClick={() => handleAction(payment, 'mark_paid')}
                              disabled={actionLoading === payment.id}
                              style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12 }}
                            >
                              {actionLoading === payment.id ? 'Updating' : 'Mark Paid'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerOpen && selectedPayment && (
        <PaymentDrawer
          payment={selectedPayment}
          canUpdate={canUpdate}
          onClose={closeDrawer}
          onMarkPaid={handleAction}
          onUpdateNotes={handleUpdateNotes}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
}

function renderStatus(status: string) {
  const base =
    'inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-semibold min-w-[80px]';
  const t = (status || '').toLowerCase();
  if (
    t.includes('paid') ||
    t.includes('completed') ||
    t.includes('approved') ||
    t.includes('active')
  )
    return <span className={`${base} bg-green-500/10 text-green-600`}>{status}</span>;
  if (t.includes('overdue') || t.includes('failed') || t.includes('rejected') || t.includes('void'))
    return <span className={`${base} bg-red-500/10 text-red-500`}>{status}</span>;
  if (
    t.includes('pending') ||
    t.includes('draft') ||
    t.includes('processing') ||
    t.includes('sent')
  )
    return <span className={`${base} bg-amber-500/10 text-amber-600`}>{status}</span>;
  if (t.includes('partial'))
    return <span className={`${base} bg-purple-500/10 text-purple-600`}>{status}</span>;
  return (
    <span className={`${base} bg-[var(--surface-muted)] text-[var(--text-muted)]`}>{status}</span>
  );
}

function PaymentDrawer({
  payment,
  canUpdate,
  onClose,
  onMarkPaid,
  onUpdateNotes,
  actionLoading,
}: {
  payment: PaymentRecord;
  canUpdate: boolean;
  onClose: () => void;
  onMarkPaid: (payment: PaymentRecord, action: 'mark_paid') => void;
  onUpdateNotes: (payment: PaymentRecord, notes: string) => void;
  actionLoading: string | null;
}) {
  const [notes, setNotes] = useState(payment.notes || '');
  const savingNotes = actionLoading === `notes-${payment.id}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 'min(520px, 100vw)',
          height: '100%',
          padding: 18,
          background: 'var(--card-bg)',
          borderLeft: '1px solid var(--border-subtle)',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{payment.clientName}</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>Payment ID · {payment.id}</div>
          </div>
          <button className="btn ghost" onClick={onClose} style={{ height: 34, borderRadius: 999 }}>
            Close
          </button>
        </div>

        <div style={{ height: 16 }} />

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Payment Summary</div>
          <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
            <Row label="Status" value={payment.status} />
            <Row label="Method" value={payment.method} />
            <Row label="Amount" value={formatUsd(payment.amountUsd)} />
            <Row label="Paid At" value={formatDateTime(payment.paidAt)} />
            <Row label="Created" value={formatDateTime(payment.createdAt)} />
          </div>
        </div>

        <div style={{ height: 16 }} />

        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Payment Notes</div>
          <textarea
            className="input"
            rows={4}
            placeholder="Add payment notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              className="btn"
              onClick={() => onUpdateNotes(payment, notes)}
              disabled={!canUpdate || savingNotes}
              style={{ borderRadius: 999 }}
            >
              {savingNotes ? 'Saving' : 'Save Notes'}
            </button>
          </div>
        </div>

        <div style={{ height: 18 }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {canUpdate && payment.status !== 'Paid' && (
            <button
              className="btn"
              onClick={() => onMarkPaid(payment, 'mark_paid')}
              disabled={actionLoading === payment.id}
              style={{ borderRadius: 999 }}
            >
              {actionLoading === payment.id ? 'Updating' : 'Mark Paid'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
