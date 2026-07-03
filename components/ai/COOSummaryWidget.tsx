'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import type { AgentTask } from '@/lib/ai/agent-task';

type WidgetState = 'idle' | 'creating' | 'processing' | 'done' | 'error';

export default function COOSummaryWidget() {
  const [state, setState] = useState<WidgetState>('idle');
  const [task, setTask] = useState<AgentTask | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollTask = useCallback(
    async (taskId: string) => {
      try {
        const res = await apiFetch(`/api/ai/agent-tasks/${taskId}`);
        const json = await res.json().catch(() => null);
        if (!json?.ok) return;

        setTask(json.task);

        if (json.task.status === 'completed' || json.task.status === 'failed') {
          stopPolling();
          setState(json.task.status === 'completed' ? 'done' : 'error');
          if (json.task.status === 'failed') {
            setError(json.task.error || 'Agent failed.');
          }
        }
      } catch {
        // silently continue polling
      }
    },
    [stopPolling],
  );

  const handleGenerate = async () => {
    setState('creating');
    setError('');
    setTask(null);
    stopPolling();

    try {
      // 1. Create the task
      const createRes = await apiFetch('/api/ai/agent-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentType: 'coo',
          prompt:
            'Generate my daily business summary. Check revenue, overdue invoices, open leads, active projects, and team overview. Then give me a clear summary of the business health and what needs attention today.',
        }),
      });

      const createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok || !createJson.ok) {
        throw new Error(createJson?.error || 'Failed to create task');
      }

      const taskId = createJson.task.id;
      setState('processing');

      // 2. Trigger execution
      apiFetch(`/api/ai/agent-tasks/${taskId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});

      // 3. Start polling
      pollRef.current = setInterval(() => pollTask(taskId), 2000);
      pollTask(taskId);
    } catch (err: any) {
      setState('error');
      setError(err?.message || 'Something went wrong.');
    }
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  const formattedTime = task?.completedAt
    ? new Date(task.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div
      id="ai-summary-widget"
      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Bot className="h-4 w-4 text-[var(--erp-blue)]" /> AI Business Summary
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            COO Agent — powered by your AI key
          </p>
        </div>
        {(state === 'idle' || state === 'done' || state === 'error') && (
          <button
            type="button"
            onClick={handleGenerate}
            className="rounded-lg bg-[var(--erp-blue)] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
          >
            {state === 'done' ? 'Refresh' : 'Generate'}
          </button>
        )}
      </div>

      {/* Processing state */}
      {(state === 'creating' || state === 'processing') && (
        <div className="mt-4 flex items-center gap-3">
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: '2px solid var(--erp-blue)',
              borderTopColor: 'transparent',
              animation: 'spin 0.8s linear infinite',
              flexShrink: 0,
            }}
          />
          <p className="text-sm text-[var(--text-muted)]">
            {state === 'creating' ? 'Initialising agent...' : 'Analysing your business data...'}
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-xs font-semibold text-red-400">Agent failed</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{error}</p>
        </div>
      )}

      {/* Result */}
      {state === 'done' && task?.result && (
        <div className="mt-4">
          <div
            className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap"
            style={{ fontFamily: 'inherit' }}
          >
            {task.result}
          </div>
          <div className="mt-3 flex items-center gap-3 border-t border-[var(--border-subtle)] pt-3">
            <p className="text-xs text-[var(--text-muted)]">
              Generated at {formattedTime}
              {task.tokenUsage && (
                <span className="ml-2">
                  · {task.tokenUsage.inputTokens + task.tokenUsage.outputTokens} tokens
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Idle state hint */}
      {state === 'idle' && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Click Generate to get a plain-English summary of your business health, overdue items, and
          what needs attention today.
        </p>
      )}
    </div>
  );
}
