import React from 'react';

const defaultIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    className="h-10 w-10"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 7.5h16.5M3.75 7.5l2.25-3h12l2.25 3M3.75 7.5v10.5a2.25 2.25 0 0 0 2.25 2.25h12a2.25 2.25 0 0 0 2.25-2.25V7.5"
    />
  </svg>
);

export type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  hint?: string;
  compact?: boolean;
  action?: { label: string; onClick: () => void };
};

export default function EmptyState({
  icon = defaultIcon,
  title,
  description,
  hint,
  compact,
  action,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-center shadow-sm ${compact ? 'px-4 py-6' : 'px-6 py-10'}`}
    >
      <div className="text-[var(--text-soft)]">{icon}</div>
      <div className="text-base font-semibold text-[var(--text-primary)]">{title}</div>
      {description ? (
        <p className="max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      ) : null}
      {hint ? <p className="max-w-sm text-xs text-[var(--text-soft)]">{hint}</p> : null}
      {action ? (
        <button type="button" className="btn mt-2" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
