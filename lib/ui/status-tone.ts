/**
 * DS-3 — one status vocabulary for the whole platform.
 *
 * Before this, every module invented its own mapping. `QualityAssuranceWorkspace`
 * painted `open` red and `in_progress` blue; `RecurringTemplateCard` painted `paused`
 * yellow and `cancelled` red; the HR attendance calendar built badges from raw
 * `rgba(239,68,68,0.12)` literals. Nothing agreed, and none of it survived a theme
 * change because the colours were Tailwind palette values rather than tokens.
 *
 * The statuses below were harvested from the actual `status === '…'` comparisons in
 * the codebase, so this is the vocabulary the product really uses, not an idealised
 * one. Anything unrecognised falls back to `neutral`, which is always readable — an
 * unknown status renders as a grey pill rather than as unstyled text.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_BY_STATUS: Record<string, StatusTone> = {
  // Settled, good outcomes.
  active: 'success',
  approved: 'success',
  auto_approved: 'success',
  clean: 'success',
  closed_won: 'success',
  completed: 'success',
  confirmed: 'success',
  converted: 'success',
  delivered: 'success',
  done: 'success',
  executed: 'success',
  fulfilled: 'success',
  paid: 'success',
  pass: 'success',
  passed: 'success',
  published: 'success',
  resolved: 'success',
  succeeded: 'success',
  success: 'success',
  verified: 'success',
  won: 'success',

  // In flight, or waiting on somebody.
  awaiting_approval: 'warning',
  in_review: 'warning',
  on_hold: 'warning',
  open: 'warning',
  partially_paid: 'warning',
  paused: 'warning',
  pending: 'warning',
  processing: 'warning',
  reopened: 'warning',
  requires_action: 'warning',
  requires_confirmation: 'warning',
  retrying: 'warning',
  review: 'warning',
  scheduled: 'warning',
  submitted: 'warning',
  trial: 'warning',
  trialing: 'warning',

  // Needs attention or ended badly.
  blocked: 'danger',
  canceled: 'danger',
  cancelled: 'danger',
  churned: 'danger',
  closed_lost: 'danger',
  dead_letter: 'danger',
  declined: 'danger',
  deleted: 'danger',
  disabled: 'danger',
  error: 'danger',
  expired: 'danger',
  fail: 'danger',
  failed: 'danger',
  infected: 'danger',
  overdue: 'danger',
  past_due: 'danger',
  rejected: 'danger',
  suspended: 'danger',
  unpaid: 'danger',
  void: 'danger',

  // Progressing normally — no action required from the viewer.
  assigned: 'info',
  in_progress: 'info',
  in_transit: 'info',
  new: 'info',
  queued: 'info',
  running: 'info',
  sent: 'info',
  shipped: 'info',

  // Inert.
  archived: 'neutral',
  closed: 'neutral',
  draft: 'neutral',
  inactive: 'neutral',
  none: 'neutral',
  saved: 'neutral',
  unknown: 'neutral',
};

/** Normalises `In Progress`, `IN_PROGRESS` and `in-progress` to one key. */
const canonical = (status: string) =>
  status
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral';
  return TONE_BY_STATUS[canonical(status)] ?? 'neutral';
}

/** `awaiting_approval` -> `Awaiting Approval`. Already-cased labels are left alone. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return canonical(status)
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Tailwind classes per tone. These resolve to the CSS variables mapped in
 * tailwind.config.js (DS-2), so a badge follows the theme without a `dark:` variant.
 */
export const TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-brand-soft text-brand',
  neutral: 'bg-surface-muted text-ink-muted',
};
