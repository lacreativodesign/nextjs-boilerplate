"use client";

import { useMemo } from "react";

const statuses = ["todo", "in_progress", "in_review", "blocked", "completed"] as const;

type Task = {
  id: string;
  title: string;
  status: (typeof statuses)[number] | "cancelled";
  priority: string;
  assignedToName?: string;
};

export function TaskBoard({
  projectId,
  tasks,
  onUpdate,
}: {
  projectId: string;
  tasks: Task[];
  onUpdate: () => Promise<void> | void;
}) {
  const grouped = useMemo(
    () =>
      statuses.reduce<Record<string, Task[]>>((acc, status) => {
        acc[status] = tasks.filter((task) => task.status === status);
        return acc;
      }, {}),
    [tasks]
  );

  const moveTask = async (taskId: string, status: string) => {
    await fetch(`/api/projects/${projectId}/tasks/${taskId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await onUpdate();
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {statuses.map((status) => (
        <div key={status} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
          <h3 className="mb-3 font-semibold capitalize">{status.replace("_", " ")}</h3>
          <div className="space-y-2">
            {(grouped[status] || []).map((task) => (
              <div key={task.id} className="card p-3 text-sm">
                <p className="font-medium">{task.title}</p>
                <p className="text-xs text-[var(--text-muted)]">{task.assignedToName || "Unassigned"}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {statuses
                    .filter((nextStatus) => nextStatus !== status)
                    .map((nextStatus) => (
                      <button
                        key={nextStatus}
                        className="rounded border px-2 py-0.5 text-[10px]"
                        onClick={() => moveTask(task.id, nextStatus)}
                      >
                        {nextStatus}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
