/**
 * Abandoned-signup lifecycle rules (locked founder decision):
 * a tenant that verified its email and was provisioned, but never started a
 * subscription, receives 2 reminder emails and is permanently deleted 30 days
 * after signup. Trial nurture emails (days 1–14) live in /api/cron/trial-emails;
 * this module only classifies the post-trial abandonment window.
 *
 * Timeline from tenant createdAt:
 *   day 18 → first reminder
 *   day 25 → final reminder (deletion notice)
 *   day 30 → tenant deleted (Auth users + user docs + tenant tree)
 *
 * Hard safety guards — a tenant is NEVER touched if any of these hold:
 *   - it is a protected platform tenant (bizosto, bizosto-demo)
 *   - it has a stripeSubscriptionId or stripeCustomerId
 *   - billingStatus is 'active', or subscriptionState is neither 'pending_checkout'
 *     (the S38 provisioned-but-unpaid state) nor the legacy 'trial'
 *
 * Kept outside the route file: Next.js validates route.ts exports at build time
 * and rejects any export that is not a handler or route-segment config.
 */

const PROTECTED_TENANTS = new Set(['bizosto', 'bizosto-demo']);

const FIRST_REMINDER_DAY = 18;
const FINAL_REMINDER_DAY = 25;
const DELETE_DAY = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AbandonedAction = 'skip' | 'none' | 'remind_first' | 'remind_final' | 'delete';

export interface AbandonedTenantInput {
  tenantId: string;
  createdAt?: string;
  subscriptionState?: string;
  billingStatus?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  firstReminderSentAt?: string;
  finalReminderSentAt?: string;
}

export function classifyAbandonedTenant(
  input: AbandonedTenantInput,
  nowMs: number,
): AbandonedAction {
  if (PROTECTED_TENANTS.has(input.tenantId)) return 'skip';
  if (input.stripeSubscriptionId || input.stripeCustomerId) return 'skip';
  if (String(input.billingStatus || '').toLowerCase() === 'active') return 'skip';
  // S38 renamed the provisioned-but-unpaid state from 'trial' to 'pending_checkout'.
  // Both are accepted so legacy trial tenants and new pending-checkout tenants are reclaimed.
  const state = String(input.subscriptionState || '');
  if (state !== 'pending_checkout' && state !== 'trial') return 'skip';

  const createdMs = input.createdAt ? new Date(input.createdAt).getTime() : NaN;
  if (!Number.isFinite(createdMs)) return 'skip';

  const ageDays = (nowMs - createdMs) / DAY_MS;
  if (ageDays >= DELETE_DAY) return 'delete';
  if (ageDays >= FINAL_REMINDER_DAY) return input.finalReminderSentAt ? 'none' : 'remind_final';
  if (ageDays >= FIRST_REMINDER_DAY) return input.firstReminderSentAt ? 'none' : 'remind_first';
  return 'none';
}

export function deletionDateIso(createdAt: string): string {
  return new Date(new Date(createdAt).getTime() + DELETE_DAY * DAY_MS).toISOString();
}
