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
  /**
   * `card` is a standalone panel. `table` is bare — no border, no shadow, no
   * background — for use inside an existing `.table-shell` or a `<td colSpan>`,
   * where a card renders a second border inside the first.
   */
  variant?: 'card' | 'table';
  action?: { label: string; onClick: () => void };
  /** Rendered next to `action` for the "or do this instead" case. */
  secondaryAction?: { label: string; onClick: () => void };
};

/**
 * DS-5 — the one empty state.
 *
 * 23 tables render nothing at all when they have no rows, which is visually identical
 * to a failed fetch, and 57 more render a bare sentence. This is what replaces both in
 * S15–S18.
 *
 * The `table` variant exists because the previous shape could only be a card: every
 * current consumer wraps it in a padded `<div>` inside `.table-shell`, producing a
 * bordered card nested inside a bordered card.
 */
export default function EmptyState({
  icon = defaultIcon,
  title,
  description,
  hint,
  compact,
  variant = 'card',
  action,
  secondaryAction,
}: EmptyStateProps) {
  const shell =
    variant === 'table'
      ? 'bg-transparent'
      : 'rounded-2xl border border-line bg-surface shadow-card';

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-center ${shell} ${
        compact ? 'px-4 py-6' : 'px-6 py-10'
      }`}
    >
      <div className="text-ink-soft" aria-hidden="true">
        {icon}
      </div>
      <div className="text-base font-semibold text-ink">{title}</div>
      {description ? <p className="max-w-sm text-sm text-ink-muted">{description}</p> : null}
      {hint ? <p className="max-w-sm text-xs text-ink-soft">{hint}</p> : null}
      {action || secondaryAction ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action ? (
            <button type="button" className="btn" onClick={action.onClick}>
              {action.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button type="button" className="btn ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
