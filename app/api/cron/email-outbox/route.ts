import { NextRequest, NextResponse } from 'next/server';
import { drainOutbox } from '@/lib/email/outbox';
import { authorizeCronRequest } from '@/lib/cron/auth';

export const runtime = 'nodejs';

/**
 * Outbox worker (MAIL-5).
 *
 * Retries tenant-to-customer email whose delivery failed and whose backoff has elapsed.
 * Without this the outbox is only a log: a message would be recorded as failed and never
 * tried again, which is no better than the fire-and-forget sends it replaced.
 *
 * The hosting constraint permits one daily cron. Enqueue still attempts delivery
 * immediately in the originating request; this bounded daily drain is the only scheduled
 * retry. Sub-daily retry guarantees remain owner-blocked without approved infrastructure.
 */
export async function GET(request: NextRequest) {
  try {
    const authorization = authorizeCronRequest(request, process.env.CRON_SECRET);
    if (!authorization.ok) {
      return NextResponse.json(
        { success: false, error: authorization.code },
        { status: authorization.status },
      );
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
