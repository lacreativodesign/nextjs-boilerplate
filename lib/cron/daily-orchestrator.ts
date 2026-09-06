import type { NextRequest } from 'next/server';

export type CronDispatchResult = {
  path: string;
  cadence: 'daily' | 'monthly';
  ok: boolean;
  status: number;
  error?: string;
};

type ScheduledTask = {
  path: string;
  cadence: 'daily' | 'monthly';
};

const TRIAL_EMAILS: ScheduledTask = {
  path: '/api/cron/trial-emails',
  cadence: 'daily',
};
const INVOICE_REMINDERS: ScheduledTask = {
  path: '/api/cron/invoice-reminders',
  cadence: 'daily',
};
const ABANDONED_SIGNUPS: ScheduledTask = {
  path: '/api/cron/abandoned-signups',
  cadence: 'daily',
};
const BILLING_LOCKS: ScheduledTask = {
  path: '/api/cron/billing-locks',
  cadence: 'daily',
};
const BACKUP: ScheduledTask = { path: '/api/cron/backup', cadence: 'daily' };
const EMAIL_OUTBOX: ScheduledTask = {
  path: '/api/cron/email-outbox',
  cadence: 'daily',
};
const GENERATE_INVOICES: ScheduledTask = {
  path: '/api/cron/generate-invoices',
  cadence: 'monthly',
};

/**
 * Vercel Hobby gives Bizosto one dependable scheduled trigger per day. Keep that trigger
 * on `/api/cron/daily-tasks` and fan out from it to the existing authenticated cron
 * handlers. Each child request is a separate serverless invocation, so a slow backup or
 * invoice scan does not force all of the work into one function's memory/process.
 *
 * The dedicated routes remain available for manual recovery runs, but `vercel.json` must
 * schedule only the orchestrator. Monthly jobs are dispatched on the first UTC day, which
 * preserves their previous calendar cadence without consuming extra platform cron slots.
 *
 * Ordering is intentional: monthly invoices are generated before reminder evaluation;
 * trial transitions happen before billing-lock enforcement; and the durable email outbox
 * drains last so failures queued by the preceding jobs are visible to the retry worker.
 */

function safeError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value || 'Unknown cron error');
  return message.replace(/[\w.+-]+@[\w.-]+/g, '[address]').slice(0, 300);
}

/**
 * Resolves the origin child cron requests are dispatched to.
 *
 * Each dispatch carries `Authorization: Bearer $CRON_SECRET`. `request.nextUrl.origin` is
 * derived from the Host header, so using it unconditionally means a request arriving with a
 * rewritten Host forwards the platform's scheduler credential to whatever host it names.
 * Reaching this code already requires that secret, so this is not a privilege escalation —
 * but the value at stake is the credential itself and the check costs one comparison.
 *
 * The request's own origin is used when it matches a host this app is actually deployed on.
 * Otherwise dispatch falls back to the configured application URL rather than an attacker's.
 * When none of those variables are configured there is nothing to check against, so the
 * request origin is used unchanged and behaviour is identical to before.
 */
function resolveDispatchOrigin(request: NextRequest): string {
  const requested = request.nextUrl.origin;

  const allowed: string[] = [];
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '',
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '',
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    try {
      allowed.push(new URL(value).origin);
    } catch {
      // An unparseable value is configuration noise, not an allowlist entry.
    }
  }

  if (!allowed.length) return requested;
  return allowed.includes(requested) ? requested : allowed[0];
}

async function dispatchOne(
  origin: string,
  authorization: string,
  task: ScheduledTask,
): Promise<CronDispatchResult> {
  try {
    const response = await fetch(`${origin}${task.path}`, {
      method: 'GET',
      headers: {
        authorization,
        'x-bizosto-cron-orchestrator': 'daily-tasks',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        ...task,
        ok: false,
        status: response.status,
        error: `Child cron returned HTTP ${response.status}`,
      };
    }

    return { ...task, ok: true, status: response.status };
  } catch (error) {
    return { ...task, ok: false, status: 0, error: safeError(error) };
  }
}

async function dispatchPhase(
  origin: string,
  authorization: string,
  tasks: ScheduledTask[],
): Promise<CronDispatchResult[]> {
  return Promise.all(tasks.map((task) => dispatchOne(origin, authorization, task)));
}

export async function dispatchScheduledCronTasks(
  request: NextRequest,
  now = new Date(),
): Promise<CronDispatchResult[]> {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization) {
    throw new Error('Cron orchestrator requires the authenticated Authorization header.');
  }

  const origin = resolveDispatchOrigin(request);
  const firstOfMonth = now.getUTCDate() === 1;
  const results: CronDispatchResult[] = [];

  // Phase 1: independent work plus invoice generation when its monthly cadence is due.
  results.push(
    ...(await dispatchPhase(origin, authorization, [
      ...(firstOfMonth ? [GENERATE_INVOICES] : []),
      TRIAL_EMAILS,
      ABANDONED_SIGNUPS,
      BACKUP,
    ])),
  );

  // Phase 2 depends on state produced in phase 1.
  results.push(...(await dispatchPhase(origin, authorization, [INVOICE_REMINDERS, BILLING_LOCKS])));

  // Last: retry durable tenant mail after all business jobs had a chance to enqueue it.
  results.push(await dispatchOne(origin, authorization, EMAIL_OUTBOX));

  return results;
}

export function scheduledCronPathsForDate(now = new Date()): string[] {
  return [
    ...(now.getUTCDate() === 1 ? [GENERATE_INVOICES] : []),
    TRIAL_EMAILS,
    ABANDONED_SIGNUPS,
    BACKUP,
    INVOICE_REMINDERS,
    BILLING_LOCKS,
    EMAIL_OUTBOX,
  ].map((task) => task.path);
}
