import { NextResponse } from 'next/server';
import {
  listWebhookDeliveries,
  processPendingWebhookDeliveries,
} from '@/lib/webhooks/webhook-delivery';
import { requireWebhookAdmin } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = await requireWebhookAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') || 100);
    const runQueue = url.searchParams.get('runQueue') === '1';

    if (runQueue) {
      await processPendingWebhookDeliveries(50);
    }

    const deliveries = await listWebhookDeliveries(
      auth.user.tenantId,
      Number.isFinite(limit) ? limit : 100,
    );
    return NextResponse.json({ ok: true, deliveries });
  } catch (err) {
    console.error('webhooks/deliveries list error', err);
    return NextResponse.json(
      { ok: false, error: 'Unable to load webhook deliveries.' },
      { status: 500 },
    );
  }
}
