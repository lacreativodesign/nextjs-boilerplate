'use client';

import { useState } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ReportResult } from '@/app/api/ai/natural-language-report/route';

const EXAMPLES = [
  'Show me revenue by client',
  'How has revenue trended over the last 6 months?',
  'How many leads are in each pipeline stage?',
  "What's my invoice aging breakdown?",
  'Show projects by status',
  'Where are my leads coming from?',
  'List all outstanding invoices',
  'Break down the team by role',
];

const CHART_COLORS = [
  '#6692f9',
  '#012167',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#f97316',
];

function ReportChart({ report }: { report: ReportResult }) {
  if (report.type === 'kpi') {
    const item = report.data[0] as { label: string; value: number };
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <p className="text-sm text-[var(--text-muted)]">{item?.label}</p>
        <p className="text-5xl font-bold text-[var(--text-primary)]">
          {typeof item?.value === 'number' ? item.value.toLocaleString() : item?.value}
        </p>
        <p className="text-sm text-[var(--text-muted)] mt-2">{report.summary}</p>
      </div>
    );
  }

  if (report.type === 'table') {
    const cols = report.columns || Object.keys(report.data[0] || {});
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              {cols.map((col) => (
                <th
                  key={col}
                  className="px-4 py-2 text-left text-xs uppercase tracking-[0.15em] text-[var(--text-muted)] font-semibold"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.data.map((row, i) => (
              <tr
                key={i}
                className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-muted)] transition-colors"
              >
                {cols.map((col) => (
                  <td key={col} className="px-4 py-3 text-[var(--text-primary)]">
                    {String((row as Record<string, unknown>)[col] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (report.type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={report.data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            outerRadius={120}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {report.data.map((_, index) => (
              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => value.toLocaleString()} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (report.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={report.data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, report.yLabel || 'Value']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#6692f9"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#6692f9' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // default: bar
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={report.data} margin={{ top: 5, right: 20, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
          angle={-35}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
        <Tooltip formatter={(value: number) => value.toLocaleString()} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {report.data.map((_, index) => (
            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function AIReportsPage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [error, setError] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');

  const handleSubmit = async (q?: string) => {
    const text = (q || question).trim();
    if (!text || loading) return;
    setLoading(true);
    setError('');
    setReport(null);
    setLastQuestion(text);
    if (q) setQuestion(q);

    try {
      const res = await fetch('/api/ai/natural-language-report', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        report?: ReportResult;
      };
      if (!res.ok || !json.ok || !json.report) {
        throw new Error(json?.error || 'Failed to generate report');
      }
      setReport(json.report);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input */}
      <div className="card p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            🤖 Ask a question about your business
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Type any question — the AI will query your live data and generate a chart or table.
          </p>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder='e.g. "Show me revenue by client" or "How many leads are in each stage?"'
            className="flex-1 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--erp-blue)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={loading || !question.trim()}
            className="rounded-xl bg-[var(--erp-blue)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {loading ? 'Thinking...' : 'Generate →'}
          </button>
        </div>

        {/* Example questions */}
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => handleSubmit(ex)}
              disabled={loading}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--erp-blue)] hover:text-[var(--erp-blue)] transition-colors disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="card p-8 flex items-center justify-center gap-3">
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: '2px solid var(--erp-blue)',
              borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <p className="text-sm text-[var(--text-muted)]">
            Querying your data and generating chart...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card p-4 border-red-500/20 bg-red-500/5">
          <p className="text-xs font-semibold text-red-400">Failed to generate report</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{error}</p>
        </div>
      )}

      {/* Report output */}
      {report && !loading && (
        <div className="card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--text-muted)]">
                {lastQuestion}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                {report.title}
              </h2>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">{report.summary}</p>
            </div>
            <span className="flex-shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-muted)] capitalize">
              {report.type}
            </span>
          </div>
          <div className="pt-2">
            <ReportChart report={report} />
          </div>
        </div>
      )}
    </div>
  );
}
