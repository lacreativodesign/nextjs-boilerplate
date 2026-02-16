"use client";

import { FormEvent, useMemo, useState } from "react";

type TicketPriority = "low" | "medium" | "high" | "urgent";
type TicketCategory = "bug" | "feature" | "question" | "billing";

type CreateTicketPayload = {
  title: string;
  description: string;
  priority: TicketPriority;
  category: TicketCategory;
  tags: string[];
};

type CreateTicketModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
};

const DEFAULT_FORM: CreateTicketPayload = {
  title: "",
  description: "",
  priority: "medium",
  category: "question",
  tags: [],
};

export function CreateTicketModal({ isOpen, onClose, onCreated }: CreateTicketModalProps) {
  const [formData, setFormData] = useState<CreateTicketPayload>(DEFAULT_FORM);
  const [tagsInput, setTagsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return formData.title.trim().length >= 3 && formData.description.trim().length >= 10;
  }, [formData.description, formData.title]);

  const reset = () => {
    setFormData(DEFAULT_FORM);
    setTagsInput("");
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    const tags = tagsInput
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          title: formData.title.trim(),
          description: formData.description.trim(),
          tags,
        }),
      });

      const body = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        setError(body?.error || "Failed to create support ticket.");
        return;
      }

      await onCreated();
      reset();
      onClose();
    } catch {
      setError("Failed to create support ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-slate-900">Create Support Ticket</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            required
            minLength={3}
            placeholder="Title"
            value={formData.title}
            onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />

          <textarea
            required
            minLength={10}
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            className="h-32 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              value={formData.priority}
              onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value as TicketPriority }))}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>

            <select
              value={formData.category}
              onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value as TicketCategory }))}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="bug">Bug</option>
              <option value="feature">Feature</option>
              <option value="question">Question</option>
              <option value="billing">Billing</option>
            </select>
          </div>

          <input
            placeholder="Tags (comma-separated)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="rounded border border-slate-300 px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
