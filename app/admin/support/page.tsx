"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CreateTicketModal } from "@/components/support/CreateTicketModal";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "urgent";

type TicketRow = {
  id: string;
  ticketNumber: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string | null;
  assignedTo?: {
    uid: string;
    name: string;
  } | null;
};

function badgeClass(value: TicketStatus | TicketPriority) {
  if (value === "urgent" || value === "high") return "bg-red-100 text-red-700";
  if (value === "in_progress" || value === "medium") return "bg-amber-100 text-amber-800";
  if (value === "resolved" || value === "closed" || value === "low") return "bg-emerald-100 text-emerald-800";
  return "bg-blue-100 text-blue-800";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function SupportTicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/support/tickets", { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as
        | {
            tickets?: TicketRow[];
            error?: string;
          }
        | TicketRow[]
        | null;

      if (!response.ok) {
        if (body && !Array.isArray(body) && body.error) {
          setError(body.error);
        } else {
          setError("Failed to load support tickets.");
        }
        setTickets([]);
        return;
      }

      if (Array.isArray(body)) {
        setTickets(body);
      } else {
        setTickets(body?.tickets || []);
      }
    } catch {
      setError("Failed to load support tickets.");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Support Tickets</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          New Ticket
        </button>
      </div>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <div className="table-shell">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-[var(--table-header-bg)] text-left">
            <tr>
              <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Ticket #</th>
              <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Title</th>
              <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Status</th>
              <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Priority</th>
              <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Created</th>
              <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Assigned To</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!loading && tickets.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-[var(--text-muted)]" colSpan={6}>
                  No support tickets found.
                </td>
              </tr>
            ) : null}

            {tickets.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-[var(--table-row-hover)]">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                  <Link href={`/admin/support/${ticket.id}`} className="text-blue-700 hover:underline">
                    {ticket.ticketNumber}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{ticket.title}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${badgeClass(ticket.status)}`}>
                    {ticket.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold ${badgeClass(ticket.priority)}`}>
                    {ticket.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{formatDate(ticket.createdAt)}</td>
                <td className="px-4 py-3 text-[var(--text-muted)]">{ticket.assignedTo?.name || "Unassigned"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateTicketModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={async () => {
          await loadTickets();
        }}
      />
    </div>
  );
}
