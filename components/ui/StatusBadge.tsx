import React from 'react';
import { TONE_CLASS, statusLabel, statusTone, type StatusTone } from '@/lib/ui/status-tone';

export type StatusBadgeProps = {
  /** Raw status from the API — `awaiting_approval`, `Paid`, `in-progress` all work. */
  status: string | null | undefined;
  /** Override the derived tone when a module genuinely disagrees with the default. */
  tone?: StatusTone;
  /** Override the derived text without changing the colour. */
  label?: string;
  /** `sm` for table cells, `md` for cards and detail headers. Defaults to `sm`. */
  size?: 'sm' | 'md';
  /** Leading dot. Reads well in dense tables where the pill fill is easy to miss. */
  dot?: boolean;
  className?: string;
};

const SIZE_CLASS = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
} as const;

/**
 * DS-3 — the one status pill.
 *
 * The audit found 73 files rendering their own, in at least eleven different
 * colour pairs, so `paid` was emerald on one screen and green on another and the
 * same `bg-green-100 text-green-800` stayed light-on-light in dark mode. Colours come
 * from `TONE_CLASS`, which resolves to design tokens, so a badge is theme-correct
 * everywhere and one edit restyles the platform.
 */
export default function StatusBadge({
  status,
  tone,
  label,
  size = 'sm',
  dot = false,
  className = '',
}: StatusBadgeProps) {
  const resolvedTone = tone ?? statusTone(status);
  const text = label ?? statusLabel(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${SIZE_CLASS[size]} ${TONE_CLASS[resolvedTone]} ${className}`.trim()}
    >
      {dot ? (
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      ) : null}
      {text}
    </span>
  );
}
