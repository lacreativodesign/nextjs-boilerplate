import { NextResponse } from 'next/server';
import { authenticateIngest } from '@/lib/ingest/auth';
import { recordIngestUsage } from '@/lib/ingest/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Legacy paid-order ingest has been retired.
 *
 * This endpoint previously trusted caller-supplied Stripe/session/payment fields and then
 * wrote Paid client state plus a production project directly. That bypassed Bizosto's
 * canonical service-engagement → invoice → successful-payment → project activation chain.
 *
 * Server-to-server lead ingest remains supported elsewhere. Paid client engagements must
 * now be created and reconciled through the canonical invoice/payment flow.
 */
export async function POST(req: Request) {
  const auth = await authenticateIngest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: 'Invalid credentials.' },
      { status: auth.status },
    );
  }

  void recordIngestUsage({
    tenantId: auth.tenantId,
    endpoint: 'ingest/orders',
    method: 'POST',
  });

  return NextResponse.json(
    {
      ok: false,
      code: 'legacy_order_ingest_retired',
      error:
        'Paid order ingest is retired. Create the client engagement/invoice and reconcile successful payment through the canonical payment flow.',
    },
    { status: 410 },
  );
}
