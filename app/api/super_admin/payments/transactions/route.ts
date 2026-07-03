import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '../../_utils';
import { getStripeClient } from '@/lib/payments/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clampLimit(value: string | null, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const stripe = getStripeClient();

    const limit = clampLimit(req.nextUrl.searchParams.get('limit'), 50);
    const startingAfter = req.nextUrl.searchParams.get('starting_after') || undefined;

    const charges = await stripe.charges.list({
      limit,
      starting_after: startingAfter,
      expand: ['data.customer'],
    });

    const transactions = charges.data.map((charge) => ({
      id: charge.id,
      amount: charge.amount / 100,
      amountRefunded: charge.amount_refunded / 100,
      currency: charge.currency,
      status: charge.status,
      description: charge.description,
      customerEmail: charge.billing_details?.email || null,
      customerId:
        typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || null,
      tenantId: charge.metadata?.tenantId || null,
      createdAt: new Date(charge.created * 1000).toISOString(),
      receiptUrl: charge.receipt_url || null,
    }));

    const hasMore = Boolean(charges.has_more);
    const nextCursor =
      hasMore && charges.data.length > 0 ? charges.data[charges.data.length - 1]?.id || null : null;

    return NextResponse.json({ ok: true, transactions, hasMore, nextCursor });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    const status = message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
