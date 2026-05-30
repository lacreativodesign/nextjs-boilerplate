"use client";

import { useEffect, useMemo, useState } from "react";
import GanttChart from "@/components/production/GanttChart";

type ProjectOption = { id: string; projectName: string };

type GanttPayload = {
  project: { id: string; name: string };
  tasks: unknown[];
  dependencies: unknown[];
  milestones: unknown[];
};

export default function ProductionProjectsPage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [data, setData] = useState<GanttPayload | null>(null);
  const [criticalPathIds, setCriticalPathIds] = useState<string[]>([]);
  const [overAllocatedResources, setOverAllocatedResources] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadProjects() {
      try {
        setLoading(true);
        setError(null);
        const overview = await fetch("/api/production/overview", { credentials: "include", cache: "no-store" }).then((r) => r.json());
        const queue = (overview?.myQueueTop10 || []) as unknown[];
        const options = queue.map((item) => ({ id: String((item as Record<string, unknown>).id || ""), projectName: String((item as Record<string, unknown>).projectName || (item as Record<string, unknown>).id || "") }));
        if (!mounted) return;
        setProjects(options);
        if (options.length) setActiveProjectId(String(options[0].id));
      } catch {
        if (!mounted) return;
        setError("Unable to load production projects.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadProjects();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadGantt() {
      if (!activeProjectId) return;
      try {
        setLoading(true);
        const [ganttRes, cpRes] = await Promise.all([
          fetch(`/api/production/projects/${activeProjectId}/gantt-data`, { credentials: "include", cache: "no-store" }).then((r) => r.json()),
          fetch(`/api/production/projects/${activeProjectId}/critical-path`, { credentials: "include", cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!mounted) return;
        setData(ganttRes);
        setCriticalPathIds(cpRes.criticalPathTaskIds || []);
        setOverAllocatedResources(cpRes.overAllocatedResources || []);
      } catch {
        if (!mounted) return;
        setError("Unable to load gantt chart data.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadGantt();
    return () => {
      mounted = false;
    };
  }, [activeProjectId]);

  const preparedTasks = useMemo(() => {
    return (data?.tasks || []).map((task) => ({ ...(task as Record<string, unknown>), critical: criticalPathIds.includes(String((task as Record<string, unknown>).id || "")) }));
  }, [data?.tasks, criticalPathIds]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Production Gantt</h1>
        <select
          className="rounded-md border border-[var(--border-subtle)] text-sm px-3 py-2"
          value={activeProjectId}
          onChange={(event) => setActiveProjectId(event.target.value)}
        >
          <option value="">Select project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.projectName}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-[var(--text-muted)]">Loading gantt chart…</p> : null}

      {!loading && data ? (
        <GanttChart
          projectId={data.project.id}
          tasks={preparedTasks as Parameters<typeof GanttChart>[0]["tasks"]}
          dependencies={(data.dependencies || []) as Parameters<typeof GanttChart>[0]["dependencies"]}
          milestones={(data.milestones || []) as Parameters<typeof GanttChart>[0]["milestones"]}
          overAllocatedResources={overAllocatedResources as Parameters<typeof GanttChart>[0]["overAllocatedResources"]}
        />
      ) : null}
    </div>
  );
}
