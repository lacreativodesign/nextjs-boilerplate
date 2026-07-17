'use client';

import Link from 'next/link';

/**
 * S28: a first-run guidance banner for worker dashboards.
 *
 * A brand-new tenant lands on their role dashboard and sees a row of KPI cards all reading
 * zero, with no indication of what to do or where the numbers come from. That is the moment a
 * self-serve trial is won or lost: an empty dashboard reads as "broken", not "new". This
 * banner appears ONLY while the dashboard has no data yet, explains what the page will show,
 * and points at the single action that populates it. Once real data exists it disappears
 * entirely, so it never nags an established tenant.
 *
 * It is intentionally tiny and presentational — each dashboard decides when it is empty and
 * what the first action is, so the copy stays specific rather than generic.
 */
export type FirstRunHintProps = {
  /** Only render when the dashboard genuinely has no data yet. */
  show: boolean;
  title: string;
  description: string;
  action: { label: string; href: string };
};

export default function FirstRunHint({ show, title, description, action }: FirstRunHintProps) {
  if (!show) return null;

  return (
    <div
      role="note"
      className="flex flex-col gap-3 rounded-2xl border border-dashed border-[var(--erp-blue)] bg-[var(--surface-muted)] p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="text-sm font-bold text-[var(--text-primary)]">{title}</p>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">{description}</p>
      </div>
      <Link href={action.href} className="btn shrink-0 self-start whitespace-nowrap sm:self-auto">
        {action.label}
      </Link>
    </div>
  );
}
