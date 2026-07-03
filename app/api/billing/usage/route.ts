import { NextResponse } from 'next/server';
import {
  enforceUsageLimit,
  getUsageByTenant,
  recordUsage,
  type UsageMetric,
} from '@/lib/billing/stripe-subscription';
import { currentPeriodKey, requireBillingAccess } from '../_utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeMetric(value: unknown): UsageMetric {
  const metric = String(value || '').toLowerCase();
  if (metric === 'api_calls' || metric === 'storage' || metric === 'users') {
    return metric;
  }
  throw new Error('Invalid metric');
}

export async function GET(req: Request) {
  try {
    const auth = await requireBillingAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const period = (searchParams.get('period') || currentPeriodKey()).trim();
    const usage = await getUsageByTenant(auth.user.tenantId, period);

    return NextResponse.json({ ok: true, period, usage });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to fetch usage' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBillingAccess();
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const metric = normalizeMetric(body?.metric);
    const quantity = Number(body?.quantity || 0);
    const period = String(body?.period || currentPeriodKey()).trim();

    const enforcement = await enforceUsageLimit({
      tenantId: auth.user.tenantId,
      metric,
      requested: quantity,
      period,
    });

    if (!enforcement.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Plan limit exceeded',
          limit: enforcement.limit,
          used: enforcement.used,
          metric,
          upgradeRequired: true,
        },
        { status: 403 },
      );
    }

    await recordUsage({
      tenantId: auth.user.tenantId,
      metric,
      quantity,
      period,
      source: String(body?.source || 'api'),
    });

    return NextResponse.json({
      ok: true,
      warning: enforcement.warning,
      metric,
      limit: enforcement.limit,
      used: enforcement.used,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to record usage' },
      { status: 500 },
    );
  }
}
