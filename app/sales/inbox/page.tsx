'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SalesDrawer from '@/components/sales/SalesDrawer';
import { formatDateTime } from '@/components/finance/financeUtils';
import { SmartSearchBar } from '@/components/search/SmartSearchBar';
import { smartMatch } from '@/lib/search/smartMatch';

type EmailRecord = {
  id: string;
  subject: string;
  from: string[];
  to: string[];
  bodyText: string;
  direction: string;
  createdAt: string | null;
  status: string;
};

type InboxResponse = { ok: boolean; error?: string; emails: EmailRecord[] };

type ErrorState = { title: string; message: string };

export default function SalesInboxPage() {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorState | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<EmailRecord | null>(null);

  const loadEmails = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch('/api/sales/email/list', {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = (await res.json()) as InboxResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data?.error || 'Unable to load inbox.');
      }
      setEmails(data.emails || []);
    } catch (err: any) {
      console.error('Inbox load error', err);
      setError({
        title: 'Unable to load inbox',
        message: err?.message || 'Please try again later.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmails();
  }, [loadEmails]);

  const filtered = useMemo(
    () =>
      smartMatch(emails, query, (email) => [
        email.subject,
        email.from?.[0],
        email.to?.[0],
        email.bodyText,
      ]),
    [emails, query],
  );

  const headerCellStyle: React.CSSProperties = {
    padding: '12px 14px',
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-subtle)',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  };

  const cellStyle: React.CSSProperties = {
    padding: '12px 14px',
    borderBottom: '1px dashed var(--border-subtle)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
    fontWeight: 400,
  };

  return (
    <div className="w-full">
      {error && (
        <div
          className="card"
          style={{
            borderRadius: 14,
            padding: 16,
            border: '1px solid rgba(239,68,68,0.35)',
            background: 'var(--danger-soft)',
            color: 'var(--danger)',
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700 }}>{error.title}</div>
          <div style={{ fontSize: 13, opacity: 0.9 }}>{error.message}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 700 }}>Sales Inbox</h3>
          <p style={{ fontSize: 13, color: 'var(--sidebar-text)' }}>
            View inbound and outbound messages synced to your mailbox.
          </p>
        </div>
        <button className="btn" onClick={loadEmails} style={{ borderRadius: 999 }}>
          Refresh
        </button>
      </div>

      <div className="card" style={{ marginTop: 18, padding: 18, borderRadius: 18 }}>
        <label className="text-xs font-semibold text-[var(--text-muted)]">Search</label>
        <SmartSearchBar value={query} onChange={setQuery} className="mt-2" />
      </div>

      <div style={{ marginTop: 20 }}>
        <div className="table-shell">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--surface-muted)' }}>
                  <th style={headerCellStyle}>Subject</th>
                  <th style={headerCellStyle}>From / To</th>
                  <th style={headerCellStyle}>Direction</th>
                  <th style={{ ...headerCellStyle, textAlign: 'left' }}>Received</th>
                  <th style={{ ...headerCellStyle, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center' }}>
                      Loading inbox...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center' }}>
                      No emails found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((email) => (
                    <tr key={email.id}>
                      <td style={{ ...cellStyle, whiteSpace: 'normal' }}>
                        {email.subject || '(no subject)'}
                      </td>
                      <td style={cellStyle}>
                        {email.direction === 'outbound' ? email.to?.[0] : email.from?.[0]}
                      </td>
                      <td style={cellStyle}>{email.direction}</td>
                      <td style={{ ...cellStyle, textAlign: 'left' }}>
                        {formatDateTime(email.createdAt)}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <button className="btn ghost" onClick={() => setSelected(email)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <SalesDrawer
          title={selected.subject || 'Email'}
          subtitle={selected.direction}
          onClose={() => setSelected(null)}
        >
          <div className="grid gap-2 text-sm">
            <div>
              <strong>From:</strong> {selected.from?.[0] || '-'}
            </div>
            <div>
              <strong>To:</strong> {selected.to?.[0] || '-'}
            </div>
            <div>
              <strong>Received:</strong> {formatDateTime(selected.createdAt)}
            </div>
          </div>
          <div style={{ marginTop: 16, whiteSpace: 'pre-wrap' }}>{selected.bodyText}</div>
        </SalesDrawer>
      )}
    </div>
  );
}
