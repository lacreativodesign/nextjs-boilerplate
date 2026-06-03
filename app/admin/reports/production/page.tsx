"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDate } from "@/components/finance/financeUtils";
import MasterSelect from "@/components/ui/MasterSelect";
import { CardShell, ErrorCard, KpiCard, MiniBarChart, useSortableData } from "../_components/ReportsUI";

type ProductionResponse = {
  workloadByProductionOwner: Array<{ productionOwnerId: string; productionOwnerName: string; total: number; overdue: number }>;
  queueAging: Array<{ stage: string; avgDays: number }>;
  bottlenecks: Array<{ stage: string; count: number; oldestDays: number }>;
  stuckProjects: Array<{
    id: string;
    projectName: string;
    clientName: string;
    stage: string;
    priority: string;
    productionOwnerName: string;
    ageDays: number;
    slaDays: number;
    dueDate?: string | null;
  }>;
};

const emptyResponse: ProductionResponse = {
  workloadByProductionOwner: [],
  queueAging: [],
  bottlenecks: [],
  stuckProjects: [],
};

const STAGE_OPTIONS = [
  { label: "All Stages", value: "" },
  { label: "Draft", value: "Draft" },
  { label: "Review", value: "Review" },
  { label: "Revisions", value: "Revisions" },
  { label: "Final", value: "Final" },
];

export default function ProductionReportsPage() {
  const [data, setData] = useState<ProductionResponse>(emptyResponse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [productionOwnerId, setProductionOwnerId] = useState("");
  const [stage, setStage] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof ProductionResponse["stuckProjects"][number]>("ageDays");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const loadProduction = async () => {
    try {
      setError(null);
      setLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (productionOwnerId) params.set("productionOwnerId", productionOwnerId);
      if (stage) params.set("stage", stage);

      const res = await fetch(`/api/admin/reports/production?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (res.status === 403) throw new Error("You do not have access to Admin reports.");
        if (res.status === 401) throw new Error("Please sign in again to view reports.");
        throw new Error(json?.error || "Unable to load production reports.");
      }
      setData(json as ProductionResponse);
    } catch (err: any) {
      console.error("reports production load error", err);
      setError("Unable to load production analytics right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduction();
  }, [dateFrom, dateTo, productionOwnerId, stage]);

  const ownerOptions = useMemo(() => {
    return [
      { label: "All Owners", value: "" },
      ...data.workloadByProductionOwner.map((owner) => ({
        label: owner.productionOwnerName || owner.productionOwnerId,
        value: owner.productionOwnerId,
      })),
    ];
  }, [data.workloadByProductionOwner]);

  const filteredProjects = useMemo(() => {
    if (!search) return data.stuckProjects;
    const q = search.toLowerCase();
    return data.stuckProjects.filter((project) => {
      return `${project.projectName} ${project.clientName} ${project.stage}`.toLowerCase().includes(q);
    });
  }, [data.stuckProjects, search]);

  const sortedProjects = useSortableData(filteredProjects, sortKey, sortDirection);

  const toggleSort = (key: keyof ProductionResponse["stuckProjects"][number]) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const totalWorkload = data.workloadByProductionOwner.reduce((sum, owner) => sum + owner.total, 0);
  const totalOverdue = data.workloadByProductionOwner.reduce((sum, owner) => sum + owner.overdue, 0);

  const downloadCsv = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (productionOwnerId) params.set("productionOwnerId", productionOwnerId);
    if (stage) params.set("stage", stage);
    window.open(`/api/admin/reports/exports/production-workload?${params.toString()}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {error && <ErrorCard message={error} />}

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Production KPIs</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Active Workload" value={`${totalWorkload}`} subtitle="Assigned projects" />
          <KpiCard title="Overdue Items" value={`${totalOverdue}`} subtitle="Needs escalation" />
          <KpiCard title="Bottleneck Stages" value={`${data.bottlenecks.length}`} subtitle="Top stage clusters" />
          <KpiCard title="Stuck Projects" value={`${data.stuckProjects.length}`} subtitle="Beyond SLA" />
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Filters</div>
            <p style={{ fontSize: 13, color: "var(--sidebar-text)" }}>Monitor production throughput and aging queues.</p>
          </div>
          <button className="btn" onClick={downloadCsv} style={{ borderRadius: 999 }}>
            Download Production Workload
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <MasterSelect value={productionOwnerId} onChange={setProductionOwnerId} options={ownerOptions} />
          <MasterSelect value={stage} onChange={setStage} options={STAGE_OPTIONS} />
          <input
            className="input"
            placeholder="Search keyword"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 200 }}
          />
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setProductionOwnerId("");
              setStage("");
              setSearch("");
            }}
            style={{ borderRadius: 999 }}
          >
            Reset Filters
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Workload by Production Owner</div>
          <MiniBarChart
            rows={(data.workloadByProductionOwner.length ? data.workloadByProductionOwner : [{ productionOwnerId: "", productionOwnerName: "-", total: 0, overdue: 0 }]).map(
              (row) => ({
                label: row.productionOwnerName || row.productionOwnerId || "-",
                value: row.total,
              })
            )}
          />
        </CardShell>
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Queue Aging (Days)</div>
          <MiniBarChart
            rows={(data.queueAging.length ? data.queueAging : [{ stage: "-", avgDays: 0 }]).map((row) => ({
              label: row.stage,
              value: row.avgDays,
            }))}
          />
        </CardShell>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Bottleneck Stages</div>
          <MiniBarChart
            rows={(data.bottlenecks.length ? data.bottlenecks : [{ stage: "-", count: 0 }]).map((row) => ({
              label: row.stage,
              value: row.count,
            }))}
          />
        </CardShell>
        <CardShell>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>Oldest Items (Days)</div>
          <MiniBarChart
            rows={(data.bottlenecks.length ? data.bottlenecks : [{ stage: "-", oldestDays: 0 }]).map((row) => ({
              label: row.stage,
              value: row.oldestDays,
            }))}
          />
        </CardShell>
      </section>

      <section>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Stuck Projects (Beyond SLA)</div>
        <div className="card" style={{ padding: 0, borderRadius: 18, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
              <thead>
                <tr style={{ background: "rgba(148,163,184,0.15)" }}>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("projectName")} style={{ background: "none", border: "none", fontWeight: 700 }}>
                      Project {sortKey === "projectName" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "left", padding: "14px 16px", fontWeight: 700 }}>Client</th>
                  <th style={{ textAlign: "center", padding: "14px 16px", fontWeight: 700 }}>Stage</th>
                  <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>
                    <button type="button" onClick={() => toggleSort("ageDays")} style={{ background: "none", border: "none", fontWeight: 700 }}>
                      Age (Days) {sortKey === "ageDays" ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                    </button>
                  </th>
                  <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>SLA (Days)</th>
                  <th style={{ textAlign: "right", padding: "14px 16px", fontWeight: 700 }}>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 40 }}>
                      Loading production queue…
                    </td>
                  </tr>
                ) : sortedProjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 40 }}>
                      No stuck projects found.
                    </td>
                  </tr>
                ) : (
                  sortedProjects.map((project, idx) => {
                    const rowBg = idx % 2 === 0 ? "rgba(15,23,42,0.02)" : "transparent";
                    return (
                      <tr key={project.id} style={{ background: rowBg }}>
                        <td style={{ padding: "14px 16px", textAlign: "left" }}>{project.projectName}</td>
                        <td style={{ padding: "14px 16px", textAlign: "left" }}>{project.clientName}</td>
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>{project.stage}</td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>{project.ageDays}</td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>{project.slaDays}</td>
                        <td style={{ padding: "14px 16px", textAlign: "right" }}>{formatDate(project.dueDate)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
