'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Circle } from 'lucide-react';

type ChecklistStep = {
  id: string;
  title: string;
  completed: boolean;
};

type ChecklistState = {
  steps: ChecklistStep[];
  progress: number;
};

export function ProgressChecklist() {
  const [checklist, setChecklist] = useState<ChecklistState | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch('/api/onboarding/progress', {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload || !Array.isArray(payload.steps)) {
          setChecklist(null);
          return;
        }

        setChecklist({
          steps: payload.steps,
          progress: Number(payload.progress || 0),
        });
      })
      .catch(() => {
        setChecklist(null);
      });

    return () => controller.abort();
  }, []);

  if (!checklist || checklist.progress >= 100) return null;

  return (
    <div className="card mb-6 p-6">
      <h3 className="mb-4 font-semibold">Get Started with Bizosto</h3>
      <div className="space-y-3">
        {checklist.steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3">
            {step.completed ? (
              <CheckCircle className="text-green-600" size={20} />
            ) : (
              <Circle className="text-[var(--text-soft)]" size={20} />
            )}
            <span className={step.completed ? 'text-[var(--text-muted)] line-through' : ''}>
              {step.title}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 h-2 rounded-full bg-[var(--surface-muted)]">
        <div
          className="h-2 rounded-full bg-blue-600 transition-all"
          style={{ width: `${checklist.progress}%` }}
        />
      </div>
    </div>
  );
}
