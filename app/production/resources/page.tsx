"use client";

import { useEffect, useMemo, useState } from "react";

type WorkloadResponse = {
  ok: boolean;
  startDate: string;
  endDate: string;
  workloads: Array<{
    resourceId: string;
    resourceName: string;
    resourceType: "employee" | "equipment" | "material";
    totalCapacityHours: number;
    totalAllocatedHours: number;
    utilizationPercent: number;
    overAllocatedDays: number;
    days: Array<{
      date: string;
      capacityHours: number;
      allocatedHours: number;
      availableHours: number;
      utilizationPercent: number;
      overAllocated: boolean;
    }>;
    assignments: Array<{
      id: string;
      taskId: string;
      taskName?: string;
      projectName?: string;
      allocationHoursPerDay: number;
      hourlyRate: number;
    }>;
  }>;
  warnings: Array<{
    resourceId: string;
    resourceName: string;
    date: string;
    allocatedHours: number;
    capacityHours: number;
    overflowHours: number;
  }>;
  levelingSuggestions: Array<{
    sourceResourceId: string;
    sourceResourceName: string;
    targetResourceId: string;
    targetResourceName: string;
    date: string;
    transferableHours: number;
    reason: string;
  }>;
};

type UtilizationResponse = {
  ok: boolean;
  summary: {
    resources: number;
    totalCapacityHours: number;
    totalAllocatedHours: number;
    utilizationPercent: number;
    targetBand: string;
  };
  utilizationByResource: Array<{
    resourceId: string;
    resourceName: string;
    resourceType: string;
    utilizationPercent: number;
    overAllocatedDays: number;
    projectedCost: number;
  }>;
};

const cardStyle: React.CSSProperties = {
  background: "var(--card-bg)",
  border: "1px solid var(--border-color)",
  borderRadius: 14,
  padding: 16,
};

export default function ProductionResourcesPage() {
  const [workload, setWorkload] = useState<WorkloadResponse | null>(null);
  const [utilization, setUtilization] = useState<UtilizationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const [workloadRes, utilizationRes] = await Promise.all([
          fetch("/api/production/resources/workload", { cache: "no-store" }),
          fetch("/api/production/resources/utilization?period=weekly", { cache: "no-store" }),
        ]);

        const [workloadJson, utilizationJson] = await Promise.all([workloadRes.json(), utilizationRes.json()]);

        if (!active) return;

        if (!workloadRes.ok || !workloadJson.ok) {
          throw new Error(workloadJson?.error || "Unable to load workload");
        }

        if (!utilizationRes.ok || !utilizationJson.ok) {
          throw new Error(utilizationJson?.error || "Unable to load utilization");
        }

        setWorkload(workloadJson);
        setUtilization(utilizationJson);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || "Unable to load resource planning data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const weekLabels = useMemo(() => {
    if (!workload?.workloads?.length) return [] as string[];
    const first = workload.workloads[0];
    const buckets = new Set<string>();
    for (const day of first.days) {
      const date = new Date(`${day.date}T00:00:00.000Z`);
      const week = `${date.getUTCFullYear()}-W${Math.ceil(date.getUTCDate() / 7)}`;
      buckets.add(week);
    }
    return Array.from(buckets);
  }, [workload]);

  if (loading) return <div style={{ padding: 20 }}>Loading resource planning...</div>;
  if (error) return <div style={{ padding: 20, color: "var(--error)" }}>{error}</div>;
  if (!workload || !utilization) return <div style={{ padding: 20 }}>No data available.</div>;

  const taskRows = new Map<string, { taskName: string; byResource: Map<string, number> }>();
  for (const row of workload.workloads) {
    for (const assignment of row.assignments) {
      const key = assignment.taskId || assignment.id;
      const existing = taskRows.get(key) || { taskName: assignment.taskName || key, byResource: new Map() };
      existing.byResource.set(row.resourceId, assignment.allocationHoursPerDay);
      taskRows.set(key, existing);
    }
  }

  return (
    <div style={{ padding: 20, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Resource Management & Capacity Planning</h1>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div style={cardStyle}>
          <div>Total resources</div>
          <strong style={{ fontSize: 28 }}>{utilization.summary.resources}</strong>
        </div>
        <div style={cardStyle}>
          <div>Capacity hours</div>
          <strong style={{ fontSize: 28 }}>{utilization.summary.totalCapacityHours.toFixed(1)}</strong>
        </div>
        <div style={cardStyle}>
          <div>Allocated hours</div>
          <strong style={{ fontSize: 28 }}>{utilization.summary.totalAllocatedHours.toFixed(1)}</strong>
        </div>
        <div style={cardStyle}>
          <div>Utilization</div>
          <strong style={{ fontSize: 28 }}>{utilization.summary.utilizationPercent.toFixed(1)}%</strong>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Target: {utilization.summary.targetBand}</div>
        </div>
      </section>

      {workload.warnings.length > 0 && (
        <section style={{ ...cardStyle, borderColor: "#f59e0b" }}>
          <h3 style={{ marginTop: 0 }}>Over-allocation warnings (&gt;8h/day)</h3>
          {workload.warnings.map((warning) => (
            <div key={`${warning.resourceId}_${warning.date}`} style={{ fontSize: 13, marginBottom: 6 }}>
              {warning.resourceName} on {warning.date}: {warning.allocatedHours.toFixed(1)}h allocated ({warning.overflowHours.toFixed(1)}h over)
            </div>
          ))}
        </section>
      )}

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Resource workload chart (stacked weekly bars)</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {workload.workloads.map((row) => (
            <div key={row.resourceId}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>{row.resourceName}</div>
              <div style={{ display: "flex", gap: 4 }}>
                {weekLabels.map((weekLabel, index) => {
                  const weekDays = row.days.slice(index * 7, index * 7 + 7);
                  const allocated = weekDays.reduce((sum, day) => sum + day.allocatedHours, 0);
                  const capacity = weekDays.reduce((sum, day) => sum + day.capacityHours, 0) || 1;
                  const ratio = (allocated / capacity) * 100;
                  const pct = Math.min(100, ratio);
                  return (
                    <div key={weekLabel} style={{ flex: 1 }} title={`${weekLabel}: ${allocated.toFixed(1)}h/${capacity.toFixed(1)}h`}>
                      <div style={{ height: 16, background: "#1f2937", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: ratio > 100 ? "#ef4444" : "#3b82f6" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Resource allocation grid (task × resource)</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border-color)" }}>Task</th>
                {workload.workloads.map((row) => (
                  <th key={row.resourceId} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid var(--border-color)" }}>
                    {row.resourceName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(taskRows.entries()).map(([taskId, task]) => (
                <tr key={taskId}>
                  <td style={{ padding: 8, borderBottom: "1px solid var(--border-color)" }}>{task.taskName}</td>
                  {workload.workloads.map((row) => (
                    <td key={row.resourceId} style={{ padding: 8, borderBottom: "1px solid var(--border-color)" }}>
                      {(task.byResource.get(row.resourceId) || 0).toFixed(1)}h/day
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Capacity heatmap</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid var(--border-color)" }}>Resource</th>
                {workload.workloads[0]?.days.map((day) => (
                  <th key={day.date} style={{ textAlign: "left", padding: 6, borderBottom: "1px solid var(--border-color)" }}>
                    {day.date.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workload.workloads.map((row) => (
                <tr key={row.resourceId}>
                  <td style={{ padding: 6, borderBottom: "1px solid var(--border-color)" }}>{row.resourceName}</td>
                  {row.days.map((day) => {
                    const bg = day.utilizationPercent <= 70 ? "#16a34a" : day.utilizationPercent <= 90 ? "#eab308" : "#dc2626";
                    return (
                      <td key={day.date} style={{ padding: 6, borderBottom: "1px solid var(--border-color)" }}>
                        <span
                          style={{
                            display: "inline-block",
                            minWidth: 42,
                            textAlign: "center",
                            borderRadius: 4,
                            background: bg,
                            color: "white",
                          }}
                        >
                          {day.utilizationPercent.toFixed(0)}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {workload.levelingSuggestions.length > 0 && (
        <section style={cardStyle}>
          <h3 style={{ marginTop: 0 }}>Resource leveling suggestions</h3>
          {workload.levelingSuggestions.map((suggestion, idx) => (
            <div key={idx} style={{ marginBottom: 8, fontSize: 13 }}>
              {suggestion.date}: move {suggestion.transferableHours.toFixed(1)}h from {suggestion.sourceResourceName} to {suggestion.targetResourceName}.
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
