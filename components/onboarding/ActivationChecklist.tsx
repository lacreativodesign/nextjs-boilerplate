'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Circle } from 'lucide-react';

type Milestone = { id: string; title: string; completed: boolean; href: string };
type ActivationState = { milestones: Milestone[]; progress: number };

export function ActivationChecklist() {
  const [state, setState] = useState<ActivationState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/onboarding/activation', {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!payload || !Array.isArray(payload.milestones)) {
          setState(null);
          return;
        }
        setState({
          milestones: payload.milestones,
          progress: Number(payload.progress || 0),
        });
      })
      .catch(() => setState(null));
    return () => controller.abort();
  }, []);

  if (!state || state.progress >= 100) return null;

  return (
    <div className="card mb-6 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Get started</h2>
          <p className="text-sm text-[var(--text-muted)]">Finish setting up your workspace.</p>
        </div>
        <span className="text-sm font-semibold text-[var(--erp-blue)]">{state.progress}%</span>
      </div>

      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted,#f1f5f9)]">
        <div
          className="h-full rounded-full bg-[var(--erp-blue)] transition-all"
          style={{ width: `${state.progress}%` }}
        />
      </div>

      <ul className="space-y-2">
        {state.milestones.map((m) => (
          <li key={m.id}>
            <a
              href={m.href}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--surface-muted,#f1f5f9)]"
            >
              {m.completed ? (
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-[var(--erp-green,#16a34a)]" />
              ) : (
                <Circle className="h-5 w-5 flex-shrink-0 text-[var(--text-muted)]" />
              )}
              <span
                className={
                  m.completed
                    ? 'text-[var(--text-muted)] line-through'
                    : 'text-[var(--text-primary)]'
                }
              >
                {m.title}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
