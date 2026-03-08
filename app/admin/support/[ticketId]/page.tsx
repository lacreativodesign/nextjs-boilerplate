"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TicketThread } from "@/components/support/TicketThread";

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "urgent";
type TicketCategory = "bug" | "feature" | "question" | "billing";

type SupportTicket = {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  createdAt: string | null;
  updatedAt: string | null;
  createdBy?: {
    uid: string;
    name: string;
    email: string;
  };
  assignedTo?: {
    uid: string;
    name: string;
  } | null;
  tags?: string[];
};

type TicketMessage = {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: string | null;
  author?: {
    uid: string;
    name: string;
  };
};

type RouteParams = {
  params: {
    ticketId: string;
  };
};

function fmtDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function SupportTicketDetailPage({ params }: RouteParams) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTicket = useCallback(async () => {
    const response = await fetch("/api/support/tickets", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | {
          tickets?: SupportTicket[];
          error?: string;
        }
      | SupportTicket[]
      | null;

    if (!response.ok) {
      throw new Error((body && !Array.isArray(body) && body.error) || "Failed to load ticket.");
    }

    const allTickets = Array.isArray(body) ? body : body?.tickets || [];
    const found = allTickets.find((item) => item.id === params.ticketId) || null;
    setTicket(found);
  }, [params.ticketId]);

  const loadMessages = useCallback(async () => {
    const response = await fetch(`/api/support/tickets/${params.ticketId}/messages`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as
      | {
          messages?: TicketMessage[];
          error?: string;
        }
      | TicketMessage[]
      | null;

    if (!response.ok) {
      throw new Error((body && !Array.isArray(body) && body.error) || "Failed to load messages.");
    }

    setMessages(Array.isArray(body) ? body : body?.messages || []);
  }, [params.ticketId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadTicket(), loadMessages()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load support ticket.");
    } finally {
      setLoading(false);
    }
  }, [loadMessages, loadTicket]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tagList = useMemo(() => (ticket?.tags || []).filter(Boolean), [ticket?.tags]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link href="/support" className="text-sm text-blue-700 hover:underline">
          ← Back to Support Tickets
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !ticket ? <p className="text-sm text-slate-600">Ticket not found.</p> : null}

      {ticket ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{ticket.title}</h1>
            <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{ticket.ticketNumber}</span>
          </div>
          <p className="mb-4 whitespace-pre-wrap text-sm text-slate-700">{ticket.description}</p>

          <div className="grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-2">
            <p>
              <strong>Status:</strong> {ticket.status}
            </p>
            <p>
              <strong>Priority:</strong> {ticket.priority}
            </p>
            <p>
              <strong>Category:</strong> {ticket.category}
            </p>
            <p>
              <strong>Assigned:</strong> {ticket.assignedTo?.name || "Unassigned"}
            </p>
            <p>
              <strong>Created by:</strong> {ticket.createdBy?.name || "Unknown"}
            </p>
            <p>
              <strong>Created at:</strong> {fmtDate(ticket.createdAt)}
            </p>
          </div>

          {tagList.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {tagList.map((tag) => (
                <span key={tag} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && ticket ? (
        <TicketThread
          ticketId={ticket.id}
          messages={messages}
          onRefresh={async () => {
            await loadMessages();
          }}
        />
      ) : null}
    </div>
  );
}
