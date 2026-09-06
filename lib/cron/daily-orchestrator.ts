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

/**
 * Vercel Hobby gives Bizosto one dependable scheduled trigger per day. Keep that trigger
 * on `/api/cron/daily-tasks` and fan out from it to the existing authenticated cron
 * handlers. Each child request is a separate serverless invocation, so a slow backup or
 * invoice scan does not force all of the work into one function's memory/process.
 *
 * The dedicated routes remain available for manual recovery runs, but `vercel.json` must
 * schedule only the orchestrator. Monthly jobs are dispatched on the first UTC day, which
 * preserves their previous calendar cadence without consuming extra platform cron slots.
 */
const DAILY_TASKS: ScheduledTask[] = [
  { path: '/api/cron/trial-emails', cadence: 'daily' },
  { path: '/api/cron/invoice-reminders', cadence: 'daily' },
  { path: '/api/cron/abandoned-signups', cadence: 'daily' },
  { path: '/api/cron/billing-locks', cadence: 'daily' },
  { path: '/api/cron/backup', cadence: 'daily' },
];

const MONTHLY_TASKS: ScheduledTask[] = [
  { path: '/api/cron/generate-invoices', cadence: 'monthly' },
];

function safeError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value || 'Unknown cron error');
  return message.replace(/[\w.+-]+@[\w.-]+/g, '[address]').slice(0, 300);
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

export async function dispatchScheduledCronTasks(
  request: NextRequest,
  now = new Date(),
): Promise<CronDispatchResult[]> {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization) {
    throw new Error('Cron orchestrator requires the authenticated Authorization header.');
  }

  const tasks = [
    ...DAILY_TASKS,
    ...(now.getUTCDate() === 1 ? MONTHLY_TASKS : []),
  ];

  const origin = request.nextUrl.origin;
  const primary = await Promise.all(
    tasks.map((task) => dispatchOne(origin, authorization, task)),
  );

  // Drain the durable outbox after the business jobs have had a chance to enqueue mail.
  // It still performs each first delivery inline; this pass exists for due retries and for
  // a queued record left behind by a process crash between persistence and first send.
  const outbox = await dispatchOne(origin, authorization, {
    path: '/api/cron/email-outbox',
    cadence: 'daily',
  });

  return [...primary, outbox];
}

export function scheduledCronPathsForDate(now = new Date()): string[] {
  return [
    ...DAILY_TASKS,
    ...(now.getUTCDate() === 1 ? MONTHLY_TASKS : []),
    { path: '/api/cron/email-outbox', cadence: 'daily' as const },
  ].map((task) => task.path);
}
