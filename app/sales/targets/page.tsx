'use client';
import { useEffect, useState } from 'react';

type TargetData = {
  userId: string;
  userName?: string;
  target: number;
  achieved: number;
  month: string;
};

const SCORE_COLOR = (pct: number) =>
  pct >= 90
    ? 'var(--success)'
    : pct >= 75
      ? 'var(--color-info)'
      : pct >= 50
        ? 'var(--warning)'
        : 'var(--danger)';

const SCORE_LABEL = (pct: number) =>
  pct >= 90 ? 'Exceeding' : pct >= 75 ? 'On Track' : pct >= 50 ? 'Behind' : 'At Risk';

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  const color = SCORE_COLOR(pct);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span style={{ color }} className="font-semibold">
          {SCORE_LABEL(pct)}
        </span>
        <span className="text-[var(--text-muted)]">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--surface-muted)]">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="text-xs text-[var(--text-muted)]">
        ${value.toLocaleString()} achieved of ${max.toLocaleString()} target
      </div>
    </div>
  );
}

export default function SalesTargetsPage() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [month, setMonth] = useState(defaultMonth);
  const [targets, setTargets] = useState<TargetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`/api/sales_manager/targets?month=${month}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to load targets');
        if (!alive) return;
        setTargets(data?.targets || data?.users || []);
      } catch (err: any) {
        if (!alive) return;
        setError(err.message || 'Failed to load targets');
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [month]);

  const totalTarget = targets.reduce((s, t) => s + (t.target || 0), 0);
  const totalAchieved = targets.reduce((s, t) => s + (t.achieved || 0), 0);
  const overallPct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Targets</h1>
          <p className="page-subtitle mt-2">Monthly revenue targets per sales representative.</p>
        </div>
        <input
          type="month"
          className="input"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      {/* Overall summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Team Target', value: `$${totalTarget.toLocaleString()}` },
          {
            label: 'Total Achieved',
            value: `$${totalAchieved.toLocaleString()}`,
            color: SCORE_COLOR(overallPct),
          },
          { label: 'Overall Progress', value: `${overallPct}%`, color: SCORE_COLOR(overallPct) },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[var(--border-subtle)]
              bg-[var(--surface-card)] p-5"
          >
            <p className="text-sm text-[var(--text-muted)]">{card.label}</p>
            <p
              className="mt-2 text-3xl font-bold"
              style={{ color: card.color || 'var(--text-primary)' }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* Per-user targets */}
      {loading ? (
        <div className="card p-6 text-[var(--text-muted)]">Loading targets...</div>
      ) : error ? (
        <div className="card p-6 text-red-400">{error}</div>
      ) : targets.length === 0 ? (
        <div className="card p-6 text-[var(--text-muted)]">
          No targets set for {month}. Ask your sales manager to set targets.
        </div>
      ) : (
        <div className="space-y-4">
          {targets.map((t, i) => (
            <div
              key={i}
              className="rounded-xl border border-[var(--border-subtle)]
                bg-[var(--surface-card)] p-5"
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="h-9 w-9 rounded-full bg-[var(--erp-blue)]
                  flex items-center justify-center text-white font-bold text-sm"
                >
                  {(t.userName || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-[var(--text-primary)]">
                    {t.userName || t.userId}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{t.month}</p>
                </div>
              </div>
              <ProgressBar value={t.achieved || 0} max={t.target || 0} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
