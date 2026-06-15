"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api/client";

export function TimeTracker({ projectId, projectName = "Project" }: { projectId: string; projectName?: string }) {
  const [taskId, setTaskId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [entryId, setEntryId] = useState("");
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/time-entries/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName, taskId, taskTitle, billable: true }),
      });
      const data = await response.json();
      if (data.entryId) {
        setEntryId(data.entryId);
      }
    } finally {
      setLoading(false);
    }
  };

  const stop = async () => {
    if (!entryId) return;
    setLoading(true);
    try {
      await apiFetch("/api/time-entries/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      setEntryId("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 rounded border p-4">
      <h2 className="mb-3 text-lg font-semibold">Time Tracking</h2>
      <div className="grid gap-2 md:grid-cols-2">
        <input className="rounded border px-3 py-2" placeholder="Task ID" value={taskId} onChange={(e) => setTaskId(e.target.value)} />
        <input
          className="rounded border px-3 py-2"
          placeholder="Task title"
          value={taskTitle}
          onChange={(e) => setTaskTitle(e.target.value)}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button disabled={loading || !taskId || !taskTitle || !!entryId} onClick={start} className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50">
          Start Timer
        </button>
        <button disabled={loading || !entryId} onClick={stop} className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50">
          Stop Timer
        </button>
      </div>
      {entryId && <p className="mt-2 text-sm text-[var(--text-muted)]">Running entry: {entryId}</p>}
    </div>
  );
}
