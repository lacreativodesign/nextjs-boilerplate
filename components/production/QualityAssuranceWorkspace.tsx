'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  DefectRecord,
  DefectSeverity,
  DefectStatus,
  DefectType,
  QualityMetrics,
  TestCaseRecord,
} from '@/lib/production/qa';
import { apiFetch } from '@/lib/api/client';

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

const severityOptions: DefectSeverity[] = ['critical', 'high', 'medium', 'low'];
const statusOptions: DefectStatus[] = ['open', 'in_progress', 'reopened', 'resolved', 'closed'];
const typeOptions: DefectType[] = ['bug', 'enhancement', 'task'];

const severityColor: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-[var(--surface-muted)] text-[var(--text-muted)]',
};

const statusColor: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  in_progress: 'bg-blue-100 text-blue-700',
  reopened: 'bg-orange-100 text-orange-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-[var(--surface-muted)] text-[var(--text-muted)]',
};

export default function QualityAssuranceWorkspace() {
  const [defects, setDefects] = useState<DefectRecord[]>([]);
  const [testCases, setTestCases] = useState<TestCaseRecord[]>([]);
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [trends, setTrends] = useState<Record<string, number>>({});
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedDefectId, setSelectedDefectId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newDefect, setNewDefect] = useState({
    title: '',
    description: '',
    type: 'bug' as DefectType,
    severity: 'medium' as DefectSeverity,
    requirementId: '',
    escapedToProduction: false,
  });

  const [editDefect, setEditDefect] = useState({
    status: 'open' as DefectStatus,
    severity: 'medium' as DefectSeverity,
    rootCauseCategory: '',
    rootCauseNotes: '',
    escapedToProduction: false,
  });

  const [newTestCase, setNewTestCase] = useState({
    title: '',
    requirementId: '',
    description: '',
    steps: '',
    expectedResult: '',
  });

  const [newTestRun, setNewTestRun] = useState({
    testCaseId: '',
    status: 'passed' as 'passed' | 'failed' | 'blocked',
    notes: '',
  });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (severityFilter !== 'all') params.set('severity', severityFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const [defectsRes, casesRes] = await Promise.all([
        apiFetch(`/api/production/defects?${params.toString()}`, { cache: 'no-store' }),
        apiFetch('/api/production/test-cases', { cache: 'no-store' }),
      ]);

      const defectsPayload = (await defectsRes.json()) as QaPayload;
      const casesPayload = (await casesRes.json()) as TestCasesPayload;

      if (!defectsRes.ok || !defectsPayload.ok) {
        // Non-fatal: show empty state instead of blocking the whole page
        setDefects([]);
        setMetrics(null);
        setTrends({});
      } else {
        setDefects(defectsPayload.defects || []);
        setMetrics(defectsPayload.metrics);
        setTrends(defectsPayload.trendByMonth || {});
      }

      if (!casesRes.ok || !casesPayload.ok) {
        setTestCases([]);
      } else {
        setTestCases(casesPayload.testCases || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load QA workspace');
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
      (acc, s) => {
        acc[s] = defects.filter((d) => d.severity === s).length;
        return acc;
      },
      {} as Record<DefectSeverity, number>,
    );
  }, [defects]);

  const statusCounts = useMemo(() => {
    return statusOptions.reduce(
      (acc, s) => {
        acc[s] = defects.filter((d) => d.status === s).length;
        return acc;
      },
      {} as Record<DefectStatus, number>,
    );
  }, [defects]);

  const selectedDefect = defects.find((d) => d.id === selectedDefectId) || null;

  useEffect(() => {
    if (!selectedDefect) return;
    setEditDefect({
      status: selectedDefect.status,
      severity: selectedDefect.severity,
      rootCauseCategory: selectedDefect.rootCauseCategory || '',
      rootCauseNotes: selectedDefect.rootCauseNotes || '',
      escapedToProduction: selectedDefect.escapedToProduction,
    });
  }, [selectedDefect]);

  async function submitDefect() {
    const res = await apiFetch('/api/production/defects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDefect),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || 'Unable to report defect');
    setNewDefect({
      title: '',
      description: '',
      type: 'bug',
      severity: 'medium',
      requirementId: '',
      escapedToProduction: false,
    });
    await loadData();
  }

  async function saveDefectUpdate() {
    if (!selectedDefectId) return;
    const res = await apiFetch(`/api/production/defects/${selectedDefectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editDefect),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || 'Unable to update defect');
    await loadData();
  }

  async function submitTestCase() {
    const steps = newTestCase.steps
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await apiFetch('/api/production/test-cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newTestCase, steps }),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || 'Unable to create test case');
    setNewTestCase({
      title: '',
      requirementId: '',
      description: '',
      steps: '',
      expectedResult: '',
    });
    await loadData();
  }

  async function submitTestRun() {
    const res = await apiFetch('/api/production/test-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTestRun),
    });
    const payload = await res.json();
    if (!res.ok || !payload.ok) throw new Error(payload.error || 'Unable to execute test run');
    setNewTestRun({ testCaseId: '', status: 'passed', notes: '' });
    await loadData();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="kpis">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-24 skeleton-shimmer" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="card border-[var(--danger)] bg-red-50 text-red-700 text-sm font-medium p-4">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpis">
        <div className="card kpi-card">
          <p className="helper-text mb-1">Total Defects</p>
          <p className="text-3xl font-bold text-[var(--text-primary)]">
            {metrics?.totalDefects ?? 0}
          </p>
        </div>
        <div className="card kpi-card">
          <p className="helper-text mb-1">Open Defects</p>
          <p className="text-3xl font-bold text-[var(--danger)]">{metrics?.openDefects ?? 0}</p>
        </div>
        <div className="card kpi-card">
          <p className="helper-text mb-1">Defect Density</p>
          <p className="text-3xl font-bold text-[var(--text-primary)]">
            {metrics?.defectDensity ?? 0}
          </p>
        </div>
        <div className="card kpi-card">
          <p className="helper-text mb-1">Escape Rate</p>
          <p className="text-3xl font-bold text-[var(--erp-blue)]">
            {metrics?.defectEscapeRate ?? 0}%
          </p>
        </div>
        <div className="card kpi-card">
          <p className="helper-text mb-1">Mean Aging (days)</p>
          <p className="text-3xl font-bold text-[var(--text-primary)]">
            {metrics?.meanAgingDays ?? 0}
          </p>
        </div>
        <div className="card kpi-card">
          <p className="helper-text mb-1">SLA Breaches</p>
          <p className="text-3xl font-bold text-orange-500">{metrics?.slaBreachedCount ?? 0}</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="section-title">By Severity</h2>
          {severityOptions.map((s) => (
            <BarRow
              key={s}
              label={s.toUpperCase()}
              value={severityCounts[s] || 0}
              max={Math.max(1, defects.length)}
              color="var(--danger)"
            />
          ))}
        </div>
        <div className="card space-y-3">
          <h2 className="section-title">By Status</h2>
          {statusOptions.map((s) => (
            <BarRow
              key={s}
              label={s.replace('_', ' ')}
              value={statusCounts[s] || 0}
              max={Math.max(1, defects.length)}
              color="var(--erp-blue)"
            />
          ))}
        </div>
      </div>

      {/* Trend */}
      {Object.keys(trends).length > 0 && (
        <div className="card space-y-3">
          <h2 className="section-title">Monthly Trend</h2>
          {Object.entries(trends)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, count]) => (
              <BarRow
                key={month}
                label={month}
                value={count}
                max={Math.max(...Object.values(trends), 1)}
                color="var(--erp-blue)"
              />
            ))}
        </div>
      )}

      {/* Filters + Defects Table */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="section-title">Defects</h2>
          <div className="flex gap-2 flex-wrap">
            <select
              className="input"
              style={{ width: 'auto' }}
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="all">All Severities</option>
              {severityOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ width: 'auto' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {defects.length === 0 ? (
          <div className="table-empty">No defects found. Report one below.</div>
        ) : (
          <div className="table-shell">
            <div>
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Aging (days)</th>
                    <th>SLA Due</th>
                  </tr>
                </thead>
                <tbody>
                  {defects.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDefectId(d.id)}
                      className="cursor-pointer"
                    >
                      <td className="font-medium">{d.title}</td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${severityColor[d.severity] || ''}`}
                        >
                          {d.severity}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[d.status] || ''}`}
                        >
                          {d.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{d.defectAgingDays}</td>
                      <td>{d.slaDueAt || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Selected Defect */}
      {selectedDefect && (
        <div className="card space-y-3">
          <h2 className="section-title">Edit Defect — {selectedDefect.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label text-sm mb-1 block">Status</label>
              <select
                className="input"
                value={editDefect.status}
                onChange={(e) =>
                  setEditDefect((p) => ({ ...p, status: e.target.value as DefectStatus }))
                }
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label text-sm mb-1 block">Severity</label>
              <select
                className="input"
                value={editDefect.severity}
                onChange={(e) =>
                  setEditDefect((p) => ({ ...p, severity: e.target.value as DefectSeverity }))
                }
              >
                {severityOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label text-sm mb-1 block">Root Cause Category</label>
              <input
                className="input"
                value={editDefect.rootCauseCategory}
                onChange={(e) =>
                  setEditDefect((p) => ({ ...p, rootCauseCategory: e.target.value }))
                }
                placeholder="Root cause category"
              />
            </div>
            <div>
              <label className="field-label text-sm mb-1 block">Root Cause Notes</label>
              <textarea
                className="input"
                rows={2}
                value={editDefect.rootCauseNotes}
                onChange={(e) => setEditDefect((p) => ({ ...p, rootCauseNotes: e.target.value }))}
                placeholder="Root cause analysis notes"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={editDefect.escapedToProduction}
              onChange={(e) =>
                setEditDefect((p) => ({ ...p, escapedToProduction: e.target.checked }))
              }
            />
            Escaped to production
          </label>
          <p className="helper-text">
            Aging: {selectedDefect.defectAgingDays} days | SLA due:{' '}
            {selectedDefect.slaDueAt || 'N/A'}
          </p>
          <button className="btn" onClick={() => void saveDefectUpdate()}>
            Update Defect
          </button>
        </div>
      )}

      {/* Report Defect */}
      <div className="card space-y-3">
        <h2 className="section-title">Report Defect</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label text-sm mb-1 block">Title</label>
            <input
              className="input"
              value={newDefect.title}
              onChange={(e) => setNewDefect((p) => ({ ...p, title: e.target.value }))}
              placeholder="Defect title"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label text-sm mb-1 block">Description</label>
            <textarea
              className="input"
              rows={3}
              value={newDefect.description}
              onChange={(e) => setNewDefect((p) => ({ ...p, description: e.target.value }))}
              placeholder="Describe the defect"
            />
          </div>
          <div>
            <label className="field-label text-sm mb-1 block">Type</label>
            <select
              className="input"
              value={newDefect.type}
              onChange={(e) => setNewDefect((p) => ({ ...p, type: e.target.value as DefectType }))}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label text-sm mb-1 block">Severity</label>
            <select
              className="input"
              value={newDefect.severity}
              onChange={(e) =>
                setNewDefect((p) => ({ ...p, severity: e.target.value as DefectSeverity }))
              }
            >
              {severityOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label text-sm mb-1 block">Requirement ID</label>
            <input
              className="input"
              value={newDefect.requirementId}
              onChange={(e) => setNewDefect((p) => ({ ...p, requirementId: e.target.value }))}
              placeholder="Requirement ID (optional)"
            />
          </div>
          <div className="flex items-center gap-2 text-sm pt-5">
            <input
              type="checkbox"
              checked={newDefect.escapedToProduction}
              onChange={(e) =>
                setNewDefect((p) => ({ ...p, escapedToProduction: e.target.checked }))
              }
            />
            <label>Escaped to production</label>
          </div>
        </div>
        <button className="btn" onClick={() => void submitDefect()}>
          Submit Defect
        </button>
      </div>

      {/* Test Cases */}
      <div className="card space-y-3">
        <h2 className="section-title">Test Case Library</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label text-sm mb-1 block">Title</label>
            <input
              className="input"
              value={newTestCase.title}
              onChange={(e) => setNewTestCase((p) => ({ ...p, title: e.target.value }))}
              placeholder="Test case title"
            />
          </div>
          <div>
            <label className="field-label text-sm mb-1 block">Requirement ID</label>
            <input
              className="input"
              value={newTestCase.requirementId}
              onChange={(e) => setNewTestCase((p) => ({ ...p, requirementId: e.target.value }))}
              placeholder="Requirement ID"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label text-sm mb-1 block">Description</label>
            <textarea
              className="input"
              rows={2}
              value={newTestCase.description}
              onChange={(e) => setNewTestCase((p) => ({ ...p, description: e.target.value }))}
              placeholder="Description"
            />
          </div>
          <div>
            <label className="field-label text-sm mb-1 block">Steps (one per line)</label>
            <textarea
              className="input"
              rows={3}
              value={newTestCase.steps}
              onChange={(e) => setNewTestCase((p) => ({ ...p, steps: e.target.value }))}
              placeholder="One step per line"
            />
          </div>
          <div>
            <label className="field-label text-sm mb-1 block">Expected Result</label>
            <textarea
              className="input"
              rows={3}
              value={newTestCase.expectedResult}
              onChange={(e) => setNewTestCase((p) => ({ ...p, expectedResult: e.target.value }))}
              placeholder="Expected result"
            />
          </div>
        </div>
        <button className="btn" onClick={() => void submitTestCase()}>
          Create Test Case
        </button>

        {testCases.length > 0 && (
          <div className="table-shell mt-2">
            <div>
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Requirement ID</th>
                  </tr>
                </thead>
                <tbody>
                  {testCases.map((tc) => (
                    <tr key={tc.id}>
                      <td className="font-medium">{tc.title}</td>
                      <td>{tc.requirementId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Execute Test Run */}
      <div className="card space-y-3">
        <h2 className="section-title">Execute Test Run</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="field-label text-sm mb-1 block">Test Case</label>
            <select
              className="input"
              value={newTestRun.testCaseId}
              onChange={(e) => setNewTestRun((p) => ({ ...p, testCaseId: e.target.value }))}
            >
              <option value="">Select test case</option>
              {testCases.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label text-sm mb-1 block">Result</label>
            <select
              className="input"
              value={newTestRun.status}
              onChange={(e) =>
                setNewTestRun((p) => ({
                  ...p,
                  status: e.target.value as 'passed' | 'failed' | 'blocked',
                }))
              }
            >
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label text-sm mb-1 block">Notes</label>
            <textarea
              className="input"
              rows={2}
              value={newTestRun.notes}
              onChange={(e) => setNewTestRun((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Run notes"
            />
          </div>
        </div>
        <button className="btn" onClick={() => void submitTestRun()}>
          Execute Test Run
        </button>
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const width = Math.max(4, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[var(--text-muted)]">
        <span className="capitalize">{label}</span>
        <span className="font-semibold text-[var(--text-primary)]">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--chart-track)]">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${width}%`, background: color }}
        />
      </div>
    </div>
  );
}
