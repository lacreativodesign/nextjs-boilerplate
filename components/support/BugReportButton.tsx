"use client";
import { useState } from "react";
import { Bug, X, CheckCircle } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

export default function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setName("");
    setEmail("");
    setDescription("");
    setError("");
    setSubmitted(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError("Please describe the issue.");
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      const client = Sentry.getClient();
      if (client) {
        Sentry.captureMessage(`Bug Report: ${description.slice(0, 80)}`, {
          level: "info",
          extra: {
            reporterName: name || "Anonymous",
            reporterEmail: email || "Not provided",
            description,
            url: window.location.href,
            userAgent: navigator.userAgent,
          },
        });
      }
      // Also submit to internal tickets API if available
      await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: `Bug: ${description.slice(0, 60)}`,
          description,
          priority: "medium",
          category: "bug",
          tags: ["bug-report"],
        }),
      }).catch(() => {
        // non-blocking
      });

      setSubmitted(true);
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Report a Bug"
        className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center
          justify-center rounded-xl border border-[var(--border-subtle)]
          bg-[var(--surface-card)] text-[var(--text-muted)] shadow-lg
          hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]
          transition-colors"
      >
        <Bug className="h-4 w-4" />
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center
            sm:items-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Panel */}
          <div
            className="relative w-full max-w-md rounded-2xl border
            border-[var(--border-subtle)] bg-[var(--surface-card)]
            shadow-2xl"
          >
            {/* Header */}
            <div
              className="flex items-center justify-between border-b
              border-[var(--border-subtle)] px-5 py-4"
            >
              <div>
                <h2 className="font-bold text-[var(--text-primary)]">Report a Bug</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Help us improve by reporting issues.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="flex h-8 w-8 items-center justify-center
                  rounded-lg hover:bg-[var(--surface-muted)] transition-colors"
              >
                <X className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              {submitted ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500" />
                  <p className="font-semibold text-[var(--text-primary)]">Report submitted!</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    Thank you. Our team will investigate this issue.
                  </p>
                  <button type="button" onClick={close} className="btn mt-2 w-full">
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        className="block text-xs font-medium
                        text-[var(--text-primary)] mb-1"
                      >
                        Your Name
                      </label>
                      <input
                        type="text"
                        className="input w-full"
                        placeholder="Optional"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label
                        className="block text-xs font-medium
                        text-[var(--text-primary)] mb-1"
                      >
                        Email
                      </label>
                      <input
                        type="email"
                        className="input w-full"
                        placeholder="Optional"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="block text-xs font-medium
                      text-[var(--text-primary)] mb-1"
                    >
                      Describe the issue
                      <span className="text-[var(--danger)] ml-1">*</span>
                    </label>
                    <textarea
                      className="input w-full resize-none"
                      rows={4}
                      placeholder="What happened? What did you expect?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                    />
                  </div>

                  {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={close} className="btn ghost flex-1">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn flex-1"
                      disabled={submitting || !description.trim()}
                    >
                      {submitting ? "Sending..." : "Send Report"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
