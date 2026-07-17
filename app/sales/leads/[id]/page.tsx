'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';

/**
 * S19: real lead detail.
 *
 * This page was the worst offender in the product. It ignored the [id] route parameter
 * entirely and rendered a hardcoded lead plus a fabricated notes thread, so clicking ANY real
 * lead in the list showed the same invented person instead of that lead's data.
 *
 * It was also silently lossy: the status dropdown and the "Add note" button only mutated
 * local React state. A rep could mark a lead Qualified, watch the UI update, and have nothing
 * persist — the change was discarded on navigation. Both actions now write to the server, and
 * both surface a failure instead of pretending to succeed.
 */
type Lead = {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  source: string;
  status: string;
  packageName: string;
  expectedValueUsd: number;
  ownerName: string;
  createdAt: string | null;
};

type Note = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string | null;
};

/** The API accepts exactly these values and derives the pipeline stage from them. */
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'closed_lost', label: 'Closed Lost' },
];

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const leadId = String(params?.id || '');

  const [lead, setLead] = useState<Lead | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteInput, setNoteInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!leadId) return;
    setError(null);
    try {
      const [leadRes, notesRes] = await Promise.all([
        apiFetch(`/api/sales/leads/get?leadId=${encodeURIComponent(leadId)}`, {
          cache: 'no-store',
        }),
        apiFetch(`/api/sales/lead-notes/list?leadId=${encodeURIComponent(leadId)}`, {
          cache: 'no-store',
        }),
      ]);

      const leadPayload = (await leadRes.json().catch(() => null)) as {
        ok?: boolean;
        lead?: Lead;
        error?: string;
      } | null;

      if (!leadRes.ok || !leadPayload?.ok || !leadPayload.lead) {
        setError(leadPayload?.error || `Could not load this lead (${leadRes.status})`);
        setLead(null);
        return;
      }
      setLead(leadPayload.lead);

      const notesPayload = (await notesRes.json().catch(() => null)) as {
        ok?: boolean;
        notes?: Note[];
      } | null;
      setNotes(notesRes.ok && notesPayload?.ok ? (notesPayload.notes ?? []) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this lead');
      setLead(null);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(status: string) {
    if (!lead) return;
    const previous = lead.status;

    setBusy(true);
    setError(null);
    setLead({ ...lead, status });

    try {
      const res = await apiFetch('/api/sales/leads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, status }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !payload?.ok) {
        // Never leave the UI showing a change the server rejected.
        setLead({ ...lead, status: previous });
        setError(payload?.error || 'Could not update the status.');
      }
    } catch (err) {
      setLead({ ...lead, status: previous });
      setError(err instanceof Error ? err.message : 'Could not update the status.');
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    const body = noteInput.trim();
    if (!body || !lead) return;

    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/sales/lead-notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, body }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !payload?.ok) {
        setError(payload?.error || 'Could not save the note.');
        return;
      }

      setNoteInput('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note.');
    } finally {
      setBusy(false);
    }
  }

  if (!lead && !error) {
    return <p className="helper-text">Loading lead…</p>;
  }

  if (!lead) {
    return (
      <p className="rounded-xl border border-[var(--danger,#dc2626)] p-4 text-sm font-semibold text-[var(--danger,#dc2626)]">
        {error}
      </p>
    );
  }

  const title = lead.contactName || lead.companyName || 'Lead';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">
          {lead.companyName || '—'} · Created {fmtDateTime(lead.createdAt)}
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-[var(--danger,#dc2626)] p-4 text-sm font-semibold text-[var(--danger,#dc2626)]">
          {error}
        </p>
      )}

      <div className="card p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Contact Details
            </p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {lead.contactName || '—'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{lead.contactEmail || '—'}</p>
            <p className="text-xs text-[var(--text-muted)]">{lead.contactPhone || '—'}</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Source
            </p>
            <p className="text-sm text-[var(--text-primary)]">{lead.source || '—'}</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Owner
            </p>
            <p className="text-sm text-[var(--text-primary)]">{lead.ownerName || 'Unassigned'}</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Status
            </p>
            <select
              value={lead.status}
              disabled={busy}
              onChange={(e) => void updateStatus(e.target.value)}
              className="input mt-1 w-full"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card flex flex-col gap-4 p-6">
        <h2 className="section-title">Notes (Internal)</h2>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Write a note..."
            value={noteInput}
            disabled={busy}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addNote();
            }}
            className="input flex-1"
          />
          <button
            onClick={() => void addNote()}
            disabled={busy || !noteInput.trim()}
            className="btn"
          >
            {busy ? 'Saving…' : 'Add'}
          </button>
        </div>

        {notes.length === 0 ? (
          <p className="helper-text">No notes yet.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            {notes.map((note) => (
              <div
                key={note.id}
                className="rounded-xl bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-primary)]"
              >
                <p>{note.body}</p>
                <p className="mt-1 text-[10px] opacity-70">
                  {note.authorName || 'Unknown'} · {fmtDateTime(note.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
