'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api/client';

type FixKind = 'data_fix' | 'code_fix' | 'answer' | 'unknown';

type TicketTriage = {
  summary: string;
  fixKind: FixKind;
  suggestedPriority: string;
  model: string;
  claudeCodePrompt: string | null;
  dataFixProposal: string | null;
  createdAt: string;
};

type Ticket = {
  id: string;
  tenantId: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  triageStatus: string;
  triage: TicketTriage | null;
  pageUrl: string | null;
  screenshotUrl: string | null;
  hasScreenshot: boolean;
  reporter: { uid: string; name: string; email: string; role: string } | null;
  assignedTo: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'] as const;
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'] as const;

function priorityStyle(priority: string): { bg: string; text: string } {
  switch (priority) {
    case 'urgent':
      return { bg: 'var(--danger-soft)', text: 'var(--danger-strong)' };
    case 'high':
      return { bg: 'var(--warning-soft)', text: 'var(--warning-strong)' };
    case 'low':
      return { bg: 'var(--success-soft)', text: 'var(--success-strong)' };
    default:
      return { bg: 'var(--erp-blue-soft)', text: 'var(--erp-blue)' };
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function fixKindLabel(kind: FixKind): string {
  switch (kind) {
    case 'code_fix':
      return 'Code fix';
    case 'data_fix':
      return 'Data fix';
    case 'answer':
      return 'Answer / not a bug';
    default:
      return 'Unknown';
  }
}

export default function SuperAdminTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
    const res = await fetch(`/api/super_admin/tickets${params}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) setTickets(json.tickets || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => tickets.find((t) => t.id === selectedId) || null,
    [tickets, selectedId],
  );

  const openCount = useMemo(() => tickets.filter((t) => t.status === 'open').length, [tickets]);

  const patchTicket = async (id: string, updates: Record<string, unknown>) => {
    setActionError('');
    const res = await apiFetch(`/api/super_admin/tickets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setActionError(json?.error || 'Update failed.');
      return;
    }
    await load();
  };

  const analyze = async (id: string) => {
    setAnalyzing(true);
    setActionError('');
    try {
      const res = await apiFetch(`/api/super_admin/tickets/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setActionError(
          json?.error ||
            (res.status === 429
              ? 'Daily triage budget reached. Try again tomorrow.'
              : 'Analysis failed.'),
        );
      }
      await load();
    } finally {
      setAnalyzing(false);
    }
  };

  const copyPrompt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError('Could not copy to clipboard.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="page-title">Support Tickets</h1>
        <p className="page-subtitle">
          Bug reports and support requests across every tenant. {openCount} open.
        </p>
      </div>

      {/* Status filters use the shared .tab-pill component, the same control the
          section tab bar and the Finance module use. They were previously
          `btn subtle` with an inline borderColor, which rendered as a visibly
          different control from every other filter row in the app. */}
      <div className="tabs-bar" role="tablist" aria-label="Filter tickets by status">
        <button
          type="button"
          role="tab"
          aria-selected={statusFilter === ''}
          onClick={() => setStatusFilter('')}
          className={`tab-pill ${statusFilter === '' ? 'active' : ''}`}
        >
          All
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            className={`tab-pill capitalize ${statusFilter === s ? 'active' : ''}`}
          >
            {statusLabel(s)}
          </button>
        ))}
      </div>

      {actionError && (
        <div
          className="rounded-lg border p-3 text-sm"
          style={{
            background: 'var(--danger-soft)',
            borderColor: 'var(--danger)',
            color: 'var(--danger-strong)',
          }}
        >
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Ticket list */}
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <p className="p-5 text-sm text-[var(--text-muted)]">Loading…</p>
          ) : tickets.length === 0 ? (
            <p className="p-5 text-sm text-[var(--text-muted)]">No tickets.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {tickets.map((ticket) => {
                const pStyle = priorityStyle(ticket.priority);
                const isSelected = ticket.id === selectedId;
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(ticket.id);
                        setActionError('');
                      }}
                      className="w-full text-left p-4 hover:bg-[var(--surface-muted)] transition-colors"
                      style={isSelected ? { background: 'var(--surface-muted)' } : undefined}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-[var(--text-muted)]">
                          {ticket.ticketNumber}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize"
                          style={{ background: pStyle.bg, color: pStyle.text }}
                        >
                          {ticket.priority}
                        </span>
                      </div>
                      <p className="mt-1 font-medium text-[var(--text-primary)] truncate">
                        {ticket.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="capitalize">{statusLabel(ticket.status)}</span>
                        <span>·</span>
                        <span className="truncate">{ticket.tenantId}</span>
                        {ticket.triageStatus === 'analyzed' && (
                          <>
                            <span>·</span>
                            <span style={{ color: 'var(--erp-blue)' }}>analyzed</span>
                          </>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail panel */}
        <div className="card p-5">
          {!selected ? (
            <p className="text-sm text-[var(--text-muted)]">Select a ticket to view details.</p>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    {selected.ticketNumber}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{selected.tenantId}</span>
                </div>
                <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                  {selected.title}
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                  {selected.description}
                </p>
                {selected.reporter && (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    Reported by {selected.reporter.name || 'Unknown'} ({selected.reporter.role}){' '}
                    {selected.reporter.email && `· ${selected.reporter.email}`}
                  </p>
                )}
                {selected.pageUrl && (
                  <p className="mt-1 text-xs text-[var(--text-muted)] break-all">
                    Page: {selected.pageUrl}
                  </p>
                )}
                {selected.screenshotUrl && (
                  <a
                    href={selected.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs underline"
                    style={{ color: 'var(--erp-blue)' }}
                  >
                    View screenshot
                  </a>
                )}
              </div>

              {/* Status + priority controls */}
              <div className="flex flex-wrap gap-3">
                <label className="text-xs text-[var(--text-muted)]">
                  Status
                  <select
                    value={selected.status}
                    onChange={(e) => patchTicket(selected.id, { status: e.target.value })}
                    className="mt-1 block rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-1 text-sm text-[var(--text-primary)] capitalize"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-[var(--text-muted)]">
                  Priority
                  <select
                    value={selected.priority}
                    onChange={(e) => patchTicket(selected.id, { priority: e.target.value })}
                    className="mt-1 block rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-1 text-sm text-[var(--text-primary)] capitalize"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Triage */}
              <div className="border-t border-[var(--border-subtle)] pt-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="section-title">AI Triage</p>
                  <button
                    type="button"
                    onClick={() => analyze(selected.id)}
                    disabled={analyzing || selected.triageStatus === 'analyzing'}
                    className="btn"
                  >
                    {analyzing || selected.triageStatus === 'analyzing'
                      ? 'Analyzing…'
                      : selected.triage
                        ? 'Re-analyze'
                        : 'Analyze'}
                  </button>
                </div>

                {selected.triage ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: 'var(--erp-blue-soft)', color: 'var(--erp-blue)' }}
                      >
                        {fixKindLabel(selected.triage.fixKind)}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        suggests {selected.triage.suggestedPriority} priority
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-primary)]">{selected.triage.summary}</p>

                    {selected.triage.dataFixProposal && (
                      <div
                        className="rounded-lg border p-3 text-sm"
                        style={{
                          background: 'var(--surface-muted)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <p className="mb-1 text-xs font-semibold text-[var(--text-muted)]">
                          Proposed data fix
                        </p>
                        {selected.triage.dataFixProposal}
                      </div>
                    )}

                    {selected.triage.claudeCodePrompt && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-semibold text-[var(--text-muted)]">
                            Claude Code prompt
                          </p>
                          <button
                            type="button"
                            onClick={() => copyPrompt(selected.triage!.claudeCodePrompt!)}
                            className="btn subtle text-xs"
                          >
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <pre
                          className="max-h-72 overflow-auto rounded-lg border p-3 text-xs whitespace-pre-wrap"
                          style={{
                            background: 'var(--surface-muted)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {selected.triage.claudeCodePrompt}
                        </pre>
                      </div>
                    )}

                    <p className="text-[11px] text-[var(--text-soft)]">
                      Model: {selected.triage.model}
                    </p>
                  </div>
                ) : selected.triageStatus === 'failed' ? (
                  <p className="mt-3 text-sm" style={{ color: 'var(--danger-strong)' }}>
                    Last analysis failed. Try again.
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Not yet analyzed. Analysis runs on your Anthropic key and is capped daily.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
