"use client";

import { useEffect, useMemo, useState } from "react";
import type { DefectRecord, DefectSeverity, DefectStatus, DefectType, QualityMetrics, TestCaseRecord } from "@/lib/production/qa";

type QaPayload = {
  ok: boolean;
  defects: DefectRecord[];
  metrics: QualityMetrics;
  trendByMonth: Record<string, number>;
  error?: string;
};

type TestCasesPayload = {
  ok: boolean;
  testCases: TestCaseRecord[];
  error?: string;
};

const severityOptions: DefectSeverity[] = ["critical", "high", "medium", "low"];
const statusOptions: DefectStatus[] = ["open", "in_progress", "reopened", "resolved", "closed"];
const typeOptions: DefectType[] = ["bug", "enhancement", "task"];

export default function QualityAssuranceWorkspace() {
  const [defects, setDefects] = useState<DefectRecord[]>([]);
  const [testCases, setTestCases] = useState<TestCaseRecord[]>([]);
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [trends, setTrends] = useState<Record<string, number>>({});
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDefectId, setSelectedDefectId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newDefect, setNewDefect] = useState({
    title: "",
    description: "",
    type: "bug" as DefectType,
    severity: "medium" as DefectSeverity,
    requirementId: "",
    escapedToProduction: false,
  });

  const [editDefect, setEditDefect] = useState({
    status: "open" as DefectStatus,
    severity: "medium" as DefectSeverity,
    rootCauseCategory: "",
    rootCauseNotes: "",
    escapedToProduction: false,
  });

  const [newTestCase, setNewTestCase] = useState({
    title: "",
    requirementId: "",
    description: "",
    steps: "",
    expectedResult: "",
  });

  const [newTestRun, setNewTestRun] = useState({
    testCaseId: "",
    status: "passed" as "passed" | "failed" | "blocked",
    notes: "",
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const [defectsRes, casesRes] = await Promise.all([
        fetch(`/api/production/defects?${params.toString()}`, { cache: "no-store", credentials: "include" }),
        fetch("/api/production/test-cases", { cache: "no-store", credentials: "include" }),
      ]);

      const defectsPayload = (await defectsRes.json()) as QaPayload;
      const casesPayload = (await casesRes.json()) as TestCasesPayload;
      if (!defectsRes.ok || !defectsPayload.ok) throw new Error(defectsPayload.error || "Failed to load defects");
      if (!casesRes.ok || !casesPayload.ok) throw new Error(casesPayload.error || "Failed to load test cases");

      setDefects(defectsPayload.defects || []);
      setMetrics(defectsPayload.metrics);
      setTrends(defectsPayload.trendByMonth || {});
      setTestCases(casesPayload.testCases || []);
    } catch (err: any) {
      setError(err?.message || "Unable to load QA workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severityFilter, statusFilter]);

  const severityCounts = useMemo(() => {
    return severityOptions.reduce(
      (acc, severity) => {
        acc[severity] = defects.filter((defect) => defect.severity === severity).length;
        return acc;
      },
      {} as Record<DefectSeverity, number>
    );
  }, [defects]);

  const statusCounts = useMemo(() => {
    return statusOptions.reduce(
      (acc, status) => {
        acc[status] = defects.filter((defect) => defect.status === status).length;
        return acc;
      },
      {} as Record<DefectStatus, number>
    );
  }, [defects]);

  const selectedDefect = defects.find((defect) => defect.id === selectedDefectId) || null;

  useEffect(() => {
    if (!selectedDefect) return;
    setEditDefect({
      status: selectedDefect.status,
      severity: selectedDefect.severity,
      rootCauseCategory: selectedDefect.rootCauseCategory || "",
      rootCauseNotes: selectedDefect.rootCauseNotes || "",
      escapedToProduction: selectedDefect.escapedToProduction,
    });
  }, [selectedDefect]);

  async function submitDefect() {
    const res = await fetch("/api/production/defects", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newDefect),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Unable to report defect");
    setNewDefect({ title: "", description: "", type: "bug", severity: "medium", requirementId: "", escapedToProduction: false });
    await loadData();
  }

  async function saveDefectUpdate() {
    if (!selectedDefectId) return;
    const res = await fetch(`/api/production/defects/${selectedDefectId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDefect),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Unable to update defect");
    await loadData();
  }

  async function submitTestCase() {
    const steps = newTestCase.steps
      .split("\n")
      .map((step) => step.trim())
      .filter(Boolean);

    const res = await fetch("/api/production/test-cases", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newTestCase, steps }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Unable to create test case");
    setNewTestCase({ title: "", requirementId: "", description: "", steps: "", expectedResult: "" });
    await loadData();
  }

  async function submitTestRun() {
    const res = await fetch("/api/production/test-runs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTestRun),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || "Unable to execute test run");
    setNewTestRun({ testCaseId: "", status: "passed", notes: "" });
    await loadData();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Quality Assurance & Defect Tracking</h1>

      {error ? <div style={{ color: "#dc2626", fontWeight: 600 }}>{error}</div> : null}

      <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        <MetricCard label="Total Defects" value={metrics?.totalDefects ?? 0} />
        <MetricCard label="Open Defects" value={metrics?.openDefects ?? 0} />
        <MetricCard label="Defect Density" value={metrics?.defectDensity ?? 0} />
        <MetricCard label="Escape Rate" value={`${metrics?.defectEscapeRate ?? 0}%`} />
        <MetricCard label="Mean Aging (days)" value={metrics?.meanAgingDays ?? 0} />
        <MetricCard label="SLA Breaches" value={metrics?.slaBreachedCount ?? 0} />
      </section>

      <section style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <Card title="Defect Dashboard by Severity">
          {severityOptions.map((severity) => (
            <BarRow key={severity} label={severity.toUpperCase()} value={severityCounts[severity] || 0} max={Math.max(1, defects.length)} />
          ))}
        </Card>

        <Card title="Defect Dashboard by Status">
          {statusOptions.map((status) => (
            <BarRow key={status} label={status} value={statusCounts[status] || 0} max={Math.max(1, defects.length)} />
          ))}
        </Card>
      </section>

      <Card title="Defect Trend Charts">
        {Object.keys(trends).length === 0 ? (
          <div>No trend data available.</div>
        ) : (
          Object.entries(trends)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, count]) => <BarRow key={month} label={month} value={count} max={Math.max(...Object.values(trends), 1)} />)
        )}
      </Card>

      <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
          <option value="all">All Severities</option>
          {severityOptions.map((severity) => (
            <option key={severity} value={severity}>
              {severity}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All Statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </section>

      <Card title="Defect Details Form">
        <div style={{ display: "grid", gap: 8 }}>
          <select value={selectedDefectId} onChange={(event) => setSelectedDefectId(event.target.value)}>
            <option value="">Select defect</option>
            {defects.map((defect) => (
              <option key={defect.id} value={defect.id}>{`${defect.title} (${defect.priorityLabel})`}</option>
            ))}
          </select>
          {selectedDefect ? (
            <>
              <select value={editDefect.status} onChange={(event) => setEditDefect((prev) => ({ ...prev, status: event.target.value as DefectStatus }))}>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <select
                value={editDefect.severity}
                onChange={(event) => setEditDefect((prev) => ({ ...prev, severity: event.target.value as DefectSeverity }))}
              >
                {severityOptions.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
              <input
                value={editDefect.rootCauseCategory}
                onChange={(event) => setEditDefect((prev) => ({ ...prev, rootCauseCategory: event.target.value }))}
                placeholder="Root cause category"
              />
              <textarea
                value={editDefect.rootCauseNotes}
                onChange={(event) => setEditDefect((prev) => ({ ...prev, rootCauseNotes: event.target.value }))}
                placeholder="Root cause analysis notes"
              />
              <label>
                <input
                  type="checkbox"
                  checked={editDefect.escapedToProduction}
                  onChange={(event) => setEditDefect((prev) => ({ ...prev, escapedToProduction: event.target.checked }))}
                />
                Escaped to production
              </label>
              <button onClick={() => void saveDefectUpdate()}>Update Defect</button>
              <div>Aging: {selectedDefect.defectAgingDays} days | SLA due: {selectedDefect.slaDueAt || "N/A"}</div>
            </>
          ) : null}
        </div>
      </Card>

      <Card title="Report Defect">
        <div style={{ display: "grid", gap: 8 }}>
          <input value={newDefect.title} onChange={(event) => setNewDefect((prev) => ({ ...prev, title: event.target.value }))} placeholder="Title" />
          <textarea
            value={newDefect.description}
            onChange={(event) => setNewDefect((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description"
          />
          <select value={newDefect.type} onChange={(event) => setNewDefect((prev) => ({ ...prev, type: event.target.value as DefectType }))}>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={newDefect.severity}
            onChange={(event) => setNewDefect((prev) => ({ ...prev, severity: event.target.value as DefectSeverity }))}
          >
            {severityOptions.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
          <input
            value={newDefect.requirementId}
            onChange={(event) => setNewDefect((prev) => ({ ...prev, requirementId: event.target.value }))}
            placeholder="Requirement ID"
          />
          <label>
            <input
              type="checkbox"
              checked={newDefect.escapedToProduction}
              onChange={(event) => setNewDefect((prev) => ({ ...prev, escapedToProduction: event.target.checked }))}
            />
            Escaped to production
          </label>
          <button onClick={() => void submitDefect()}>Submit Defect</button>
        </div>
      </Card>

      <Card title="Test Case Library">
        <div style={{ display: "grid", gap: 8 }}>
          <input value={newTestCase.title} onChange={(event) => setNewTestCase((prev) => ({ ...prev, title: event.target.value }))} placeholder="Test case title" />
          <input
            value={newTestCase.requirementId}
            onChange={(event) => setNewTestCase((prev) => ({ ...prev, requirementId: event.target.value }))}
            placeholder="Requirement ID"
          />
          <textarea
            value={newTestCase.description}
            onChange={(event) => setNewTestCase((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Description"
          />
          <textarea
            value={newTestCase.steps}
            onChange={(event) => setNewTestCase((prev) => ({ ...prev, steps: event.target.value }))}
            placeholder="One step per line"
          />
          <textarea
            value={newTestCase.expectedResult}
            onChange={(event) => setNewTestCase((prev) => ({ ...prev, expectedResult: event.target.value }))}
            placeholder="Expected result"
          />
          <button onClick={() => void submitTestCase()}>Create Test Case</button>
          <div style={{ maxHeight: 240, overflow: "auto" }}>
            {loading ? (
              <div>Loading test cases...</div>
            ) : (
              testCases.map((testCase) => (
                <div key={testCase.id} style={{ borderTop: "1px solid #e5e7eb", padding: "8px 0" }}>
                  <strong>{testCase.title}</strong> — Req: {testCase.requirementId}
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      <Card title="Execute Test Run">
        <div style={{ display: "grid", gap: 8 }}>
          <select value={newTestRun.testCaseId} onChange={(event) => setNewTestRun((prev) => ({ ...prev, testCaseId: event.target.value }))}>
            <option value="">Select test case</option>
            {testCases.map((testCase) => (
              <option key={testCase.id} value={testCase.id}>
                {testCase.title}
              </option>
            ))}
          </select>
          <select
            value={newTestRun.status}
            onChange={(event) => setNewTestRun((prev) => ({ ...prev, status: event.target.value as "passed" | "failed" | "blocked" }))}
          >
            <option value="passed">passed</option>
            <option value="failed">failed</option>
            <option value="blocked">blocked</option>
          </select>
          <textarea value={newTestRun.notes} onChange={(event) => setNewTestRun((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Run notes" />
          <button onClick={() => void submitTestRun()}>Execute Test Run</button>
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: any }) {
  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
      <h2 style={{ fontWeight: 700 }}>{title}</h2>
      {children}
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(4, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ fontSize: 12 }}>{`${label}: ${value}`}</div>
      <div style={{ height: 10, background: "#f3f4f6", borderRadius: 999 }}>
        <div style={{ height: 10, width: `${width}%`, background: "#2563eb", borderRadius: 999 }} />
      </div>
    </div>
  );
}
