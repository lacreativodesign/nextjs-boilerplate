"use client";

import { FormEvent, useState } from "react";

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

type TicketThreadProps = {
  ticketId: string;
  messages: TicketMessage[];
  onRefresh: () => Promise<void> | void;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function TicketThread({ ticketId, messages, onRefresh }: TicketThreadProps) {
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || content.trim().length < 2) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), isInternal }),
      });

      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(body?.error || "Failed to post message.");
        return;
      }

      setContent("");
      setIsInternal(false);
      await onRefresh();
    } catch {
      setError("Failed to post message.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Conversation</h2>
        <div className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">No messages yet.</p>
          ) : (
            messages.map((message) => (
              <article key={message.id} className="rounded border border-slate-200 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{message.author?.name || "Unknown"}</span>
                  <span className="text-xs text-slate-500">{formatDate(message.createdAt)}</span>
                </div>
                {message.isInternal ? (
                  <span className="mb-1 inline-flex rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Internal</span>
                ) : null}
                <p className="whitespace-pre-wrap text-sm text-slate-700">{message.content}</p>
              </article>
            ))
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-base font-semibold text-slate-900">Add Message</h3>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Reply to this ticket"
          required
          minLength={2}
          className="mb-3 h-28 w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />

        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
          Internal note (visible to staff only)
        </label>

        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={submitting || content.trim().length < 2}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Posting..." : "Post Message"}
        </button>
      </form>
    </div>
  );
}
