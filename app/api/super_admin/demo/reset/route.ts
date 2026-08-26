import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/app/api/super_admin/_utils';
import { DEMO_RESET_CONFIRMATION } from '@/lib/demo/safety';
import { demoRouteErrorResponse } from '../_utils';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await requireSuperAdmin(req);
    const body = await req.json().catch(() => ({}));
    if (body?.confirmation !== DEMO_RESET_CONFIRMATION) {
      return NextResponse.json(
        { ok: false, error: 'Explicit demo reset confirmation is required.' },
        { status: 400 },
      );
    }

    const { resetDemoTenant } = await import('@/lib/demo/seed');
    const result = await resetDemoTenant();

    return NextResponse.json({
      ok: true,
      message: 'Demo environment reset successfully',
      seededAt: new Date().toISOString(),
      counts: result.counts,
    });
  } catch (error: unknown) {
    return demoRouteErrorResponse(error, 'Failed to reset demo environment');
  }
}
