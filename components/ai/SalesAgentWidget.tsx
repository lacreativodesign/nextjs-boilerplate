"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SalesProposedAction } from "@/lib/ai/sales-agent";

type TaskStatus = "queued" | "processing" | "completed" | "failed" | "awaiting_approval";

type Task = {
  id: string;
  status: TaskStatus;
  result: string | null;
  error: string | null;
  proposedActions?: SalesProposedAction[];
  tokenUsage?: { inputTokens: number; outputTokens: number } | null;
};

type WidgetState = "idle" | "creating" | "processing" | "awaiting_approval" | "done" | "error";

export default function SalesAgentWidget() {
  const [widgetState, setWidgetState] = useState<WidgetState>("idle");
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const [actionStates, setActionStates] = useState<Record<string, "idle" | "loading" | "done" | "rejected" | "error">>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const pollTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch(`/api/ai/agent-tasks/${taskId}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) return;
      const t: Task = json.task;
      setTask(t);
      if (t.status === "completed") { stopPolling(); setWidgetState("done"); }
      else if (t.status === "failed") { stopPolling(); setWidgetState("error"); setError(t.error || "Agent failed."); }
      else if (t.status === "awaiting_approval") { stopPolling(); setWidgetState("awaiting_approval"); }
    } catch { /* continue */ }
  }, [stopPolling]);

  const handleRun = async () => {
    setWidgetState("creating");
    setError("");
    setTask(null);
    setActionStates({});
    stopPolling();

    try {
      const createRes = await fetch("/api/ai/agent-tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentType: "sales",
          prompt: "Review our full sales pipeline. Identify stalling leads that haven't progressed in 7+ days. Summarise pipeline health by stage and total value. Then propose specific stage updates for the most critical stalling leads.",
        }),
      });
      const createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !createJson.ok) throw new Error(createJson?.error || "Failed to create task");

      const taskId: string = createJson.task.id;
      setWidgetState("processing");

      fetch(`/api/ai/agent-tasks/${taskId}/run-sales`, { method: "POST", credentials: "include" }).catch(() => {});
      pollRef.current = setInterval(() => pollTask(taskId), 2000);
      pollTask(taskId);
    } catch (err: any) {
      setWidgetState("error");
      setError(err?.message || "Something went wrong.");
    }
  };

  const handleApprove = async (action: SalesProposedAction) => {
    if (!task) return;
    setActionStates((prev) => ({ ...prev, [action.id]: "loading" }));
    try {
      const res = await fetch("/api/ai/tools/sales-write", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: action.toolName,
          taskId: task.id,
          actionId: action.id,
          input: action.input,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json?.error || "Failed to execute");
      setActionStates((prev) => ({ ...prev, [action.id]: "done" }));
      pollTask(task.id);
    } catch {
      setActionStates((prev) => ({ ...prev, [action.id]: "error" }));
    }
  };

  const handleReject = (action: SalesProposedAction) => {
    setActionStates((prev) => ({ ...prev, [action.id]: "rejected" }));
    const remaining = task?.proposedActions?.filter(
      (a) => a.status === "pending" && a.id !== action.id &&
        actionStates[a.id] !== "rejected"
    );
    if (!remaining?.length) setWidgetState("done");
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pendingActions = task?.proposedActions?.filter(
    (a) => a.status === "pending" && actionStates[a.id] !== "rejected"
  ) || [];

  const resolvedActions = task?.proposedActions?.filter(
    (a) => a.status !== "pending" || actionStates[a.id] === "rejected"
  ) || [];

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">📈 Sales Agent</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Pipeline analysis · surfaces stalling leads · proposes stage updates
          </p>
        </div>
        {(widgetState === "idle" || widgetState === "done" || widgetState === "error") && (
          <button
            type="button"
            onClick={handleRun}
            className="rounded-lg bg-[var(--erp-blue)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
          >
            {widgetState === "done" ? "Re-analyse" : "Run Analysis"}
          </button>
        )}
      </div>

      {(widgetState === "creating" || widgetState === "processing") && (
        <div className="mt-4 flex items-center gap-3">
          <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--erp-blue)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
          <p className="text-sm text-[var(--text-muted)]">
            {widgetState === "creating" ? "Initialising sales agent..." : "Scanning pipeline for stalling leads..."}
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {widgetState === "error" && (
        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-xs font-semibold text-red-400">Agent failed</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{error}</p>
        </div>
      )}

      {task?.result && (widgetState === "awaiting_approval" || widgetState === "done") && (
        <div className="mt-4 text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
          {task.result}
        </div>
      )}

      {widgetState === "awaiting_approval" && pendingActions.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
            Proposed Actions — Review Before Applying
          </p>
          {pendingActions.map((action) => {
            const state = actionStates[action.id] || "idle";
            return (
              <div key={action.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{action.label}</p>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">{action.description}</p>
                  </div>
                  {state === "idle" && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReject(action)}
                        className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-card)] transition-colors"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(action)}
                        className="rounded-lg bg-[var(--erp-blue)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                  {state === "loading" && <p className="text-xs text-[var(--text-muted)] flex-shrink-0">Applying...</p>}
                  {state === "done" && <span className="text-xs font-semibold text-green-500 flex-shrink-0">✓ Applied</span>}
                  {state === "rejected" && <span className="text-xs text-[var(--text-muted)] flex-shrink-0">Rejected</span>}
                  {state === "error" && <span className="text-xs font-semibold text-red-400 flex-shrink-0">Failed</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {resolvedActions.length > 0 && (
        <div className="mt-3 space-y-1">
          {resolvedActions.map((action) => (
            <div key={action.id} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>{action.status === "executed" || actionStates[action.id] === "done" ? "✓" : "✗"}</span>
              <span>{action.label} — {action.status === "executed" || actionStates[action.id] === "done" ? "applied" : "rejected"}</span>
            </div>
          ))}
        </div>
      )}

      {widgetState === "idle" && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Scans your full pipeline, identifies leads stalling for 7+ days, and proposes stage updates for your approval before applying any changes.
        </p>
      )}

      {task?.tokenUsage && widgetState === "done" && (
        <p className="mt-3 text-xs text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-3">
          {task.tokenUsage.inputTokens + task.tokenUsage.outputTokens} tokens used
        </p>
      )}
    </div>
  );
}
