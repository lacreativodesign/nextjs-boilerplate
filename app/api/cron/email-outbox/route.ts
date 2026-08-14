import { NextRequest, NextResponse } from 'next/server';
import { drainOutbox } from '@/lib/email/outbox';

export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Outbox worker (MAIL-5).
 *
 * Retries tenant-to-customer email whose delivery failed and whose backoff has elapsed.
 * Without this the outbox is only a log: a message would be recorded as failed and never
 * tried again, which is no better than the fire-and-forget sends it replaced.
 *
 * Runs every fifteen minutes. The first backoff step is one minute, so a brief provider
 * blip is usually cleared on the next pass; the widening steps mean a longer outage costs
 * a handful of attempts rather than thousands.
 */
export async function GET(request: NextRequest) {
  try {
    if (!CRON_SECRET || CRON_SECRET === 'change-me-in-production') {
      return NextResponse.json(
        { error: 'Cron secret is not configured securely.' },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = await drainOutbox();

    // Counts only — never a recipient, a subject or a tenant id. This log line is read on
    // a shared platform dashboard.
    console.log(
      `[CRON] Outbox drained: claimed=${results.claimed} sent=${results.sent} failed=${results.failed} dead=${results.deadLettered}`,
    );

    return NextResponse.json({ success: true, results }, { status: 200 });
  } catch (error: unknown) {
    console.error('[CRON] Outbox worker failed:', error);
    return NextResponse.json({ error: 'Outbox worker failed.' }, { status: 500 });
  }
}
