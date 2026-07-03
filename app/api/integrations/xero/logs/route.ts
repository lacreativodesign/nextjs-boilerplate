import { NextRequest, NextResponse } from 'next/server';
import { requireAdminOrSuperAdmin } from '@/app/api/admin/_utils';
import { getXeroSyncLogs } from '@/lib/integrations/xero';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminOrSuperAdmin();
    if (!auth.ok)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const limit = Number(request.nextUrl.searchParams.get('limit') || 50);
    const logs = await getXeroSyncLogs(auth.user.tenantId, Number.isFinite(limit) ? limit : 50);
    return NextResponse.json({ ok: true, logs });
  } catch (error: any) {
    console.error('xero/logs error', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Unable to load Xero logs.' },
      { status: 500 },
    );
  }
}
